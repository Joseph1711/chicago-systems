import discord
from discord import app_commands
from discord.ext import commands
import datetime

from bot.db import execute
from bot.helpers import get_or_create_user, format_currency
from bot.embeds import success_embed, error_embed, info_embed
from bot.services.inventory import get_user_inventory, remove_item, add_item

COOLDOWNS = {}

def check_cooldown(key, seconds):
    now = datetime.datetime.utcnow().timestamp()
    last = COOLDOWNS.get(key, 0)
    remaining = (last + seconds) - now
    if remaining > 0:
        return remaining
    COOLDOWNS[key] = now
    return 0

RARITY_EMOJI = {
    "common": "⚪",
    "uncommon": "🟢",
    "rare": "🔵",
    "epic": "🟣",
    "legendary": "🟠",
}

class Inventory(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="inventario", description="Ver tu inventario")
    @app_commands.describe(usuario="Usuario a consultar (opcional)")
    async def inventario(self, interaction: discord.Interaction, usuario: discord.Member = None):
        cd = check_cooldown(f"inventario:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        target = usuario or interaction.user
        get_or_create_user(str(target.id), str(interaction.guild_id))
        items = get_user_inventory(str(target.id), str(interaction.guild_id))
        if not items:
            await interaction.response.send_message(embed=info_embed(f"🎒 Inventario de {target.display_name}", "El inventario está vacío"))
            return
        categories = {}
        for item in items:
            cat = item.get("category") or "General"
            categories.setdefault(cat, []).append(item)
        e = info_embed(f"🎒 Inventario de {target.display_name}")
        for cat, cat_items in categories.items():
            lines = []
            for it in cat_items:
                emoji = it.get("emoji") or RARITY_EMOJI.get(it.get("rarity","common"),"⚪")
                lines.append(f"{emoji} **{it['name']}** x{it['quantity']}")
            e.add_field(name=f"📦 {cat}", value="\n".join(lines), inline=True)
        await interaction.response.send_message(embed=e)

    @app_commands.command(name="dar", description="Dar un objeto a otro jugador")
    @app_commands.describe(usuario="Jugador destinatario", objeto="Nombre del objeto", cantidad="Cantidad (por defecto 1)")
    async def dar(self, interaction: discord.Interaction, usuario: discord.Member, objeto: str, cantidad: int = 1):
        cd = check_cooldown(f"dar:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if usuario.id == interaction.user.id:
            await interaction.response.send_message(embed=error_embed("Error", "No puedes darte objetos a ti mismo"), ephemeral=True)
            return
        if cantidad < 1:
            await interaction.response.send_message(embed=error_embed("Error", "La cantidad debe ser al menos 1"), ephemeral=True)
            return
        item = execute(
            "SELECT * FROM items WHERE name ILIKE $1 AND is_active=true LIMIT 1",
            (f"%{objeto}%",), fetch="one"
        )
        if not item:
            await interaction.response.send_message(embed=error_embed("Objeto no encontrado", f"No existe un objeto llamado **{objeto}**"), ephemeral=True)
            return
        ok = remove_item(str(interaction.user.id), str(interaction.guild_id), item["id"], cantidad)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin objeto", f"No tienes suficientes **{item['name']}**"), ephemeral=True)
            return
        get_or_create_user(str(usuario.id), str(interaction.guild_id))
        add_item(str(usuario.id), str(interaction.guild_id), item["id"], cantidad)
        emoji = item.get("emoji") or RARITY_EMOJI.get(item.get("rarity","common"),"⚪")
        await interaction.response.send_message(embed=success_embed(
            "Objeto entregado",
            f"Diste **{cantidad}x {emoji} {item['name']}** a {usuario.mention}"
        ))


async def setup(bot):
    await bot.add_cog(Inventory(bot))
