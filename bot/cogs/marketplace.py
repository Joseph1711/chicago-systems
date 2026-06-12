import discord
from discord import app_commands
from discord.ext import commands
import datetime

from bot.db import execute
from bot.helpers import get_or_create_user, format_currency, generate_id
from bot.embeds import success_embed, error_embed, info_embed, blackmarket_embed
from bot.services.economy import remove_cash, add_cash, log_transaction
from bot.services.inventory import remove_item, add_item

COOLDOWNS = {}
RARITY_EMOJI = {"common":"⚪","uncommon":"🟢","rare":"🔵","epic":"🟣","legendary":"🟠"}

def check_cooldown(key, seconds):
    now = datetime.datetime.utcnow().timestamp()
    last = COOLDOWNS.get(key, 0)
    remaining = (last + seconds) - now
    if remaining > 0:
        return remaining
    COOLDOWNS[key] = now
    return 0

class Marketplace(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    mercado = app_commands.Group(name="mercado", description="Mercado de jugadores")

    @mercado.command(name="lista", description="Ver objetos en venta")
    async def lista(self, interaction: discord.Interaction):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        listings = execute(
            """SELECT ml.*, i.name, i.rarity, i.emoji FROM marketplace_listings ml
               JOIN items i ON i.id=ml.item_id
               WHERE ml.guild_id=$1 AND ml.status='active'
               ORDER BY ml.created_at DESC LIMIT 15""",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = info_embed("🛒 Mercado de Jugadores")
        if not listings:
            e.description = "No hay objetos en venta ahora mismo"
        else:
            lines = []
            for ls in listings:
                emoji = ls.get("emoji") or RARITY_EMOJI.get(ls.get("rarity","common"),"⚪")
                lines.append(f"`{ls['id'][:8]}` {emoji} **{ls['name']}** x{ls['quantity']} — **{format_currency(ls['price'])}** por <@{ls['seller_id']}>")
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e)

    @mercado.command(name="vender", description="Poner un objeto en venta")
    @app_commands.describe(objeto="Nombre del objeto", cantidad="Cantidad", precio="Precio total")
    async def vender(self, interaction: discord.Interaction, objeto: str, cantidad: int, precio: int):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if cantidad < 1 or precio < 1:
            await interaction.response.send_message(embed=error_embed("Error", "Cantidad y precio deben ser positivos"), ephemeral=True)
            return
        item = execute("SELECT * FROM items WHERE name ILIKE $1 AND is_active=true LIMIT 1", (f"%{objeto}%",), fetch="one")
        if not item:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Objeto **{objeto}** no existe"), ephemeral=True)
            return
        ok = remove_item(str(interaction.user.id), str(interaction.guild_id), item["id"], cantidad)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin objeto", "No tienes esa cantidad del objeto"), ephemeral=True)
            return
        listing_id = generate_id()
        execute(
            """INSERT INTO marketplace_listings (id, guild_id, seller_id, item_id, quantity, price, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,'active',NOW(),NOW())""",
            (listing_id, str(interaction.guild_id), str(interaction.user.id), item["id"], cantidad, precio)
        )
        emoji = item.get("emoji") or RARITY_EMOJI.get(item.get("rarity","common"),"⚪")
        await interaction.response.send_message(embed=success_embed("Objeto en venta", f"{emoji} **{item['name']}** x{cantidad} por **{format_currency(precio)}**\nID: `{listing_id[:8]}`"))

    @mercado.command(name="comprar", description="Comprar un objeto del mercado")
    @app_commands.describe(id_listado="ID del listado (primeros 8 caracteres)")
    async def comprar(self, interaction: discord.Interaction, id_listado: str):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        listing = execute(
            """SELECT ml.*, i.name, i.rarity, i.emoji FROM marketplace_listings ml
               JOIN items i ON i.id=ml.item_id
               WHERE ml.guild_id=$1 AND ml.status='active' AND ml.id LIKE $2""",
            (str(interaction.guild_id), f"{id_listado}%"), fetch="one"
        )
        if not listing:
            await interaction.response.send_message(embed=error_embed("No encontrado", "Listado no encontrado o ya vendido"), ephemeral=True)
            return
        if listing["seller_id"] == str(interaction.user.id):
            await interaction.response.send_message(embed=error_embed("Error", "No puedes comprar tu propio listado"), ephemeral=True)
            return
        get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        ok = remove_cash(str(interaction.user.id), str(interaction.guild_id), listing["price"])
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", f"Necesitas **{format_currency(listing['price'])}**"), ephemeral=True)
            return
        add_cash(listing["seller_id"], str(interaction.guild_id), listing["price"])
        add_item(str(interaction.user.id), str(interaction.guild_id), listing["item_id"], listing["quantity"])
        execute("UPDATE marketplace_listings SET status='sold', buyer_id=$1, updated_at=NOW() WHERE id=$2", (str(interaction.user.id), listing["id"]))
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "marketplace_purchase", -listing["price"], f"Compra mercado: {listing['name']}")
        log_transaction(listing["seller_id"], str(interaction.guild_id), "marketplace_sale", listing["price"], f"Venta mercado: {listing['name']}")
        emoji = listing.get("emoji") or RARITY_EMOJI.get(listing.get("rarity","common"),"⚪")
        await interaction.response.send_message(embed=success_embed("Compra exitosa", f"Compraste {emoji} **{listing['name']}** x{listing['quantity']} por **{format_currency(listing['price'])}**"))

    @mercado.command(name="subasta", description="Crear una subasta para un objeto")
    @app_commands.describe(objeto="Nombre del objeto", precio_inicial="Oferta inicial", horas="Duración en horas (1-72)")
    async def subasta(self, interaction: discord.Interaction, objeto: str, precio_inicial: int, horas: int = 24):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        horas = max(1, min(72, horas))
        item = execute("SELECT * FROM items WHERE name ILIKE $1 AND is_active=true LIMIT 1", (f"%{objeto}%",), fetch="one")
        if not item:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Objeto **{objeto}** no existe"), ephemeral=True)
            return
        ok = remove_item(str(interaction.user.id), str(interaction.guild_id), item["id"], 1)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin objeto", "No tienes ese objeto"), ephemeral=True)
            return
        ends_at = datetime.datetime.utcnow() + datetime.timedelta(hours=horas)
        auction_id = generate_id()
        execute(
            """INSERT INTO auctions (id, guild_id, seller_id, item_id, starting_bid, current_bid, status, ends_at, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$5,'active',$6,NOW(),NOW())""",
            (auction_id, str(interaction.guild_id), str(interaction.user.id), item["id"], precio_inicial, ends_at)
        )
        emoji = item.get("emoji") or RARITY_EMOJI.get(item.get("rarity","common"),"⚪")
        e = success_embed(f"🔨 Subasta creada — {emoji} {item['name']}")
        e.add_field(name="💰 Oferta inicial", value=format_currency(precio_inicial), inline=True)
        e.add_field(name="⏰ Termina", value=f"<t:{int(ends_at.timestamp())}:R>", inline=True)
        e.add_field(name="🆔 ID Subasta", value=f"`{auction_id[:8]}`", inline=True)
        await interaction.response.send_message(embed=e)

    @mercado.command(name="pujar", description="Hacer una oferta en una subasta")
    @app_commands.describe(id_subasta="ID de la subasta", cantidad="Tu oferta")
    async def pujar(self, interaction: discord.Interaction, id_subasta: str, cantidad: int):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        auction = execute(
            """SELECT a.*, i.name, i.emoji FROM auctions a JOIN items i ON i.id=a.item_id
               WHERE a.guild_id=$1 AND a.status='active' AND a.id LIKE $2""",
            (str(interaction.guild_id), f"{id_subasta}%"), fetch="one"
        )
        if not auction:
            await interaction.response.send_message(embed=error_embed("No encontrada", "Subasta no encontrada o finalizada"), ephemeral=True)
            return
        if auction["seller_id"] == str(interaction.user.id):
            await interaction.response.send_message(embed=error_embed("Error", "No puedes pujar en tu propia subasta"), ephemeral=True)
            return
        min_bid = (auction.get("current_bid") or auction["starting_bid"]) + 1
        if cantidad < min_bid:
            await interaction.response.send_message(embed=error_embed("Oferta baja", f"La oferta mínima es **{format_currency(min_bid)}**"), ephemeral=True)
            return
        get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        ok = remove_cash(str(interaction.user.id), str(interaction.guild_id), cantidad)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", f"Necesitas **{format_currency(cantidad)}** en efectivo"), ephemeral=True)
            return
        if auction.get("current_bidder_id") and auction.get("current_bid"):
            add_cash(auction["current_bidder_id"], str(interaction.guild_id), auction["current_bid"])
        execute(
            "UPDATE auctions SET current_bid=$1, current_bidder_id=$2, updated_at=NOW() WHERE id=$3",
            (cantidad, str(interaction.user.id), auction["id"])
        )
        emoji = auction.get("emoji") or "📦"
        ends_at = auction["ends_at"]
        ts = int(ends_at.timestamp()) if hasattr(ends_at, "timestamp") else 0
        await interaction.response.send_message(embed=success_embed(
            f"🔨 Oferta registrada — {emoji} {auction['name']}",
            f"Tu oferta: **{format_currency(cantidad)}**\nTermina: <t:{ts}:R>"
        ))

    @mercado.command(name="cancelar", description="Cancelar tu listado de venta")
    @app_commands.describe(id_listado="ID del listado")
    async def cancelar(self, interaction: discord.Interaction, id_listado: str):
        cd = check_cooldown(f"mercado:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        listing = execute(
            "SELECT * FROM marketplace_listings WHERE guild_id=$1 AND seller_id=$2 AND status='active' AND id LIKE $3",
            (str(interaction.guild_id), str(interaction.user.id), f"{id_listado}%"), fetch="one"
        )
        if not listing:
            await interaction.response.send_message(embed=error_embed("No encontrado", "Listado no encontrado"), ephemeral=True)
            return
        execute("UPDATE marketplace_listings SET status='cancelled', updated_at=NOW() WHERE id=$1", (listing["id"],))
        add_item(str(interaction.user.id), str(interaction.guild_id), listing["item_id"], listing["quantity"])
        await interaction.response.send_message(embed=success_embed("Listado cancelado", "El objeto fue devuelto a tu inventario"))

    # /tienda
    tienda = app_commands.Group(name="tienda", description="Tienda oficial")

    @tienda.command(name="explorar", description="Explorar los objetos de la tienda")
    @app_commands.describe(categoria="Filtrar por categoría")
    async def tienda_explorar(self, interaction: discord.Interaction, categoria: str = None):
        cd = check_cooldown(f"tienda:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if categoria:
            items = execute(
                """SELECT s.*, i.name, i.description, i.rarity, i.emoji, i.category FROM shop s
                   JOIN items i ON i.id=s.item_id
                   WHERE s.guild_id=$1 AND (s.stock=-1 OR s.stock>0) AND i.category ILIKE $2
                   ORDER BY i.category, i.name""",
                (str(interaction.guild_id), f"%{categoria}%"), fetch="all"
            ) or []
        else:
            items = execute(
                """SELECT s.*, i.name, i.description, i.rarity, i.emoji, i.category FROM shop s
                   JOIN items i ON i.id=s.item_id
                   WHERE s.guild_id=$1 AND (s.stock=-1 OR s.stock>0)
                   ORDER BY i.category, i.name LIMIT 20""",
                (str(interaction.guild_id),), fetch="all"
            ) or []
        e = info_embed("🛍️ Tienda")
        if not items:
            e.description = "La tienda está vacía"
        else:
            cats = {}
            for it in items:
                cat = it.get("category") or "General"
                cats.setdefault(cat, []).append(it)
            for cat, cat_items in cats.items():
                lines = []
                for it in cat_items:
                    emoji = it.get("emoji") or RARITY_EMOJI.get(it.get("rarity","common"),"⚪")
                    stock = "∞" if it.get("stock") == -1 else str(it.get("stock",0))
                    lines.append(f"{emoji} **{it['name']}** — {format_currency(it['price'])} (Stock: {stock})")
                e.add_field(name=f"📦 {cat}", value="\n".join(lines), inline=False)
        await interaction.response.send_message(embed=e)

    @tienda.command(name="comprar", description="Comprar un objeto de la tienda")
    @app_commands.describe(objeto="Nombre del objeto", cantidad="Cantidad")
    async def tienda_comprar(self, interaction: discord.Interaction, objeto: str, cantidad: int = 1):
        cd = check_cooldown(f"tienda:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if cantidad < 1:
            await interaction.response.send_message(embed=error_embed("Error", "Cantidad inválida"), ephemeral=True)
            return
        shop_item = execute(
            """SELECT s.*, i.name, i.rarity, i.emoji FROM shop s
               JOIN items i ON i.id=s.item_id
               WHERE s.guild_id=$1 AND i.name ILIKE $2 AND (s.stock=-1 OR s.stock>0) LIMIT 1""",
            (str(interaction.guild_id), f"%{objeto}%"), fetch="one"
        )
        if not shop_item:
            await interaction.response.send_message(embed=error_embed("No disponible", f"**{objeto}** no está en la tienda"), ephemeral=True)
            return
        if shop_item.get("stock") != -1 and shop_item.get("stock",0) < cantidad:
            await interaction.response.send_message(embed=error_embed("Sin stock", f"Solo quedan {shop_item['stock']} unidades"), ephemeral=True)
            return
        total = shop_item["price"] * cantidad
        get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        ok = remove_cash(str(interaction.user.id), str(interaction.guild_id), total)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", f"Necesitas **{format_currency(total)}**"), ephemeral=True)
            return
        if shop_item.get("stock") != -1:
            execute("UPDATE shop SET stock=stock-$1, updated_at=NOW() WHERE id=$2", (cantidad, shop_item["id"]))
        add_item(str(interaction.user.id), str(interaction.guild_id), shop_item["item_id"], cantidad)
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "shop_purchase", -total, f"Tienda: {shop_item['name']} x{cantidad}")
        emoji = shop_item.get("emoji") or RARITY_EMOJI.get(shop_item.get("rarity","common"),"⚪")
        await interaction.response.send_message(embed=success_embed("Compra exitosa", f"Compraste {emoji} **{shop_item['name']}** x{cantidad} por **{format_currency(total)}**"))

    @tienda.command(name="info", description="Ver detalles de un objeto")
    @app_commands.describe(objeto="Nombre del objeto")
    async def tienda_info(self, interaction: discord.Interaction, objeto: str):
        item = execute(
            """SELECT s.*, i.name, i.description, i.rarity, i.emoji, i.category FROM shop s
               JOIN items i ON i.id=s.item_id
               WHERE s.guild_id=$1 AND i.name ILIKE $2 LIMIT 1""",
            (str(interaction.guild_id), f"%{objeto}%"), fetch="one"
        )
        if not item:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"**{objeto}** no está en la tienda"), ephemeral=True)
            return
        emoji = item.get("emoji") or RARITY_EMOJI.get(item.get("rarity","common"),"⚪")
        e = info_embed(f"{emoji} {item['name']}", item.get("description","Sin descripción"))
        e.add_field(name="💵 Precio", value=format_currency(item["price"]), inline=True)
        e.add_field(name="📦 Categoría", value=item.get("category","General"), inline=True)
        e.add_field(name="⭐ Rareza", value=(item.get("rarity") or "common").title(), inline=True)
        stock = "∞" if item.get("stock") == -1 else str(item.get("stock",0))
        e.add_field(name="📊 Stock", value=stock, inline=True)
        await interaction.response.send_message(embed=e)

    # /mercadonegro
    mercadonegro = app_commands.Group(name="mercadonegro", description="Mercado negro")

    @mercadonegro.command(name="explorar", description="Ver el stock actual del mercado negro")
    async def bm_explorar(self, interaction: discord.Interaction):
        cd = check_cooldown(f"bm:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        stocks = execute(
            """SELECT bms.*, i.name, i.description, i.rarity, i.emoji, i.price as base_price FROM black_market_stock bms
               JOIN items i ON i.id=bms.item_id
               WHERE bms.quantity > 0 ORDER BY i.name""",
            fetch="all"
        ) or []
        e = blackmarket_embed("🕶️ Mercado Negro")
        if not stocks:
            e.description = "El mercado negro está vacío por ahora. Vuelve más tarde."
        else:
            lines = []
            for s in stocks:
                base_price = float(s.get("base_price") or 100)
                price = int(base_price * float(s.get("price_modifier") or 1.0))
                emoji = s.get("emoji") or "📦"
                lines.append(f"{emoji} **{s['name']}** — {format_currency(price)} (Stock: {s['quantity']})")
            e.description = "\n".join(lines)
            e.set_footer(text="El stock se rota cada 6 horas")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @mercadonegro.command(name="comprar", description="Comprar un objeto del mercado negro")
    @app_commands.describe(objeto="Nombre del objeto", cantidad="Cantidad")
    async def bm_comprar(self, interaction: discord.Interaction, objeto: str, cantidad: int = 1):
        cd = check_cooldown(f"bm:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        stock = execute(
            """SELECT bms.*, i.name, i.rarity, i.emoji, i.price as base_price FROM black_market_stock bms
               JOIN items i ON i.id=bms.item_id
               WHERE i.name ILIKE $1 AND bms.quantity >= $2 LIMIT 1""",
            (f"%{objeto}%", cantidad), fetch="one"
        )
        if not stock:
            await interaction.response.send_message(embed=error_embed("No disponible", f"**{objeto}** no está disponible o sin stock suficiente"), ephemeral=True)
            return
        base_price = float(stock.get("base_price") or 100)
        unit_price = int(base_price * float(stock.get("price_modifier") or 1.0))
        total = unit_price * cantidad
        get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        ok = remove_cash(str(interaction.user.id), str(interaction.guild_id), total)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", f"Necesitas **{format_currency(total)}**"), ephemeral=True)
            return
        execute("UPDATE black_market_stock SET quantity=quantity-$1, updated_at=NOW() WHERE id=$2", (cantidad, stock["id"]))
        add_item(str(interaction.user.id), str(interaction.guild_id), stock["item_id"], cantidad)
        execute(
            """INSERT INTO black_market_transactions (id, discord_id, guild_id, item_id, quantity, price, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())""",
            (generate_id(), str(interaction.user.id), str(interaction.guild_id), stock["item_id"], cantidad, total)
        )
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "blackmarket_purchase", -total, f"Mercado negro: {stock['name']} x{cantidad}")
        emoji = stock.get("emoji") or "📦"
        await interaction.response.send_message(embed=blackmarket_embed("🕶️ Compra en el mercado negro", f"Adquiriste {emoji} **{stock['name']}** x{cantidad} por **{format_currency(total)}**"), ephemeral=True)


async def setup(bot):
    await bot.add_cog(Marketplace(bot))
