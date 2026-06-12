import discord
from discord import app_commands
from discord.ext import commands
import datetime

from bot.db import execute
from bot.helpers import get_or_create_user, get_or_create_guild_config, format_currency, generate_id
from bot.embeds import success_embed, error_embed, info_embed
from bot.services.economy import add_cash, add_bank

SHOP_ITEMS = [
    # Equipamiento (legal, para civiles y funcionarios)
    {"name":"Radio Policial","category":"Equipamiento","rarity":"uncommon","price":1500,"emoji":"📻"},
    {"name":"Chaleco Antibalas","category":"Equipamiento","rarity":"rare","price":5000,"emoji":"🦺"},
    {"name":"Esposas","category":"Equipamiento","rarity":"common","price":300,"emoji":"⛓️"},
    {"name":"Extintor","category":"Equipamiento","rarity":"common","price":400,"emoji":"🧯"},
    {"name":"Kit Médico","category":"Equipamiento","rarity":"uncommon","price":1200,"emoji":"🩺"},
    {"name":"Linterna Táctica","category":"Equipamiento","rarity":"common","price":350,"emoji":"🔦"},
    {"name":"Casco de Seguridad","category":"Equipamiento","rarity":"common","price":600,"emoji":"⛑️"},
    {"name":"Walkie-Talkie","category":"Equipamiento","rarity":"common","price":800,"emoji":"📡"},
    {"name":"Binoculares","category":"Equipamiento","rarity":"uncommon","price":1800,"emoji":"🔭"},
    {"name":"Desfibrilador","category":"Equipamiento","rarity":"rare","price":7500,"emoji":"⚡"},
    # Tecnología
    {"name":"Laptop","category":"Tecnología","rarity":"uncommon","price":3000,"emoji":"💻"},
    {"name":"Teléfono","category":"Tecnología","rarity":"common","price":500,"emoji":"📱"},
    {"name":"Dron de Vigilancia","category":"Tecnología","rarity":"rare","price":8000,"emoji":"🚁"},
    {"name":"Cámara","category":"Tecnología","rarity":"common","price":800,"emoji":"📷"},
    {"name":"GPS Profesional","category":"Tecnología","rarity":"common","price":600,"emoji":"🗺️"},
    {"name":"Tablet","category":"Tecnología","rarity":"uncommon","price":1500,"emoji":"📟"},
    {"name":"Escáner Forense","category":"Tecnología","rarity":"rare","price":9000,"emoji":"🔬"},
    # Construcción
    {"name":"Cemento","category":"Construcción","rarity":"common","price":200,"emoji":"🧱"},
    {"name":"Madera","category":"Construcción","rarity":"common","price":150,"emoji":"🪵"},
    {"name":"Acero","category":"Construcción","rarity":"uncommon","price":500,"emoji":"⚙️"},
    {"name":"Vidrio","category":"Construcción","rarity":"common","price":300,"emoji":"🪟"},
    {"name":"Cable","category":"Construcción","rarity":"common","price":250,"emoji":"🔌"},
    {"name":"Herramientas","category":"Construcción","rarity":"uncommon","price":750,"emoji":"🔧"},
    {"name":"Pintura","category":"Construcción","rarity":"common","price":180,"emoji":"🪣"},
    # Documentos y Permisos
    {"name":"Licencia de Conducir","category":"Documentos","rarity":"common","price":500,"emoji":"🪪"},
    {"name":"Permiso de Trabajo","category":"Documentos","rarity":"uncommon","price":1000,"emoji":"📄"},
    {"name":"Pase VIP","category":"Documentos","rarity":"rare","price":12000,"emoji":"🎫"},
    {"name":"Credencial de Prensa","category":"Documentos","rarity":"uncommon","price":2000,"emoji":"📰"},
    {"name":"Certificado Médico","category":"Documentos","rarity":"common","price":300,"emoji":"📋"},
    # Accesorios
    {"name":"Maletín Ejecutivo","category":"Accesorios","rarity":"uncommon","price":1000,"emoji":"💼"},
    {"name":"Reloj de Lujo","category":"Accesorios","rarity":"epic","price":50000,"emoji":"⌚"},
    {"name":"Cadena de Oro","category":"Accesorios","rarity":"rare","price":20000,"emoji":"📿"},
    {"name":"Gafas Oscuras","category":"Accesorios","rarity":"common","price":400,"emoji":"🕶️"},
    {"name":"Mochila Táctica","category":"Accesorios","rarity":"uncommon","price":900,"emoji":"🎒"},
    {"name":"Traje Formal","category":"Accesorios","rarity":"uncommon","price":3500,"emoji":"👔"},
    {"name":"Chaqueta de Cuero","category":"Accesorios","rarity":"uncommon","price":2800,"emoji":"🧥"},
    {"name":"Botas de Combate","category":"Accesorios","rarity":"uncommon","price":1200,"emoji":"👢"},
    # Consumibles
    {"name":"Comida","category":"Consumibles","rarity":"common","price":100,"emoji":"🍔"},
    {"name":"Agua","category":"Consumibles","rarity":"common","price":50,"emoji":"💧"},
    {"name":"Energizante","category":"Consumibles","rarity":"common","price":200,"emoji":"⚡"},
    {"name":"Café","category":"Consumibles","rarity":"common","price":80,"emoji":"☕"},
    {"name":"Gasolina","category":"Consumibles","rarity":"common","price":150,"emoji":"⛽"},
    {"name":"Botiquín Básico","category":"Consumibles","rarity":"common","price":250,"emoji":"🩹"},
    {"name":"Sandwich","category":"Consumibles","rarity":"common","price":75,"emoji":"🥪"},
    {"name":"Bebida Isotónica","category":"Consumibles","rarity":"common","price":120,"emoji":"🧃"},
    # Vehículos y Repuestos
    {"name":"Llanta de Repuesto","category":"Vehículos","rarity":"common","price":400,"emoji":"🛞"},
    {"name":"Aceite de Motor","category":"Vehículos","rarity":"common","price":300,"emoji":"🛢️"},
    {"name":"Kit de Herramientas Auto","category":"Vehículos","rarity":"uncommon","price":1500,"emoji":"🔩"},
    {"name":"Extintor Vehicular","category":"Vehículos","rarity":"common","price":350,"emoji":"🧯"},
]

BLACK_MARKET_ITEMS = [
    # Armas ilegales
    {"name":"Arma Corta","category":"Armas","rarity":"rare","price":10000,"emoji":"🔫"},
    {"name":"Rifle de Asalto","category":"Armas","rarity":"epic","price":28000,"emoji":"🎯"},
    {"name":"Cuchillo de Combate","category":"Armas","rarity":"uncommon","price":2500,"emoji":"🗡️"},
    {"name":"Granada","category":"Armas","rarity":"epic","price":18000,"emoji":"💣"},
    {"name":"Munición Especial","category":"Armas","rarity":"uncommon","price":500,"emoji":"🔹"},
    {"name":"Silenciador","category":"Armas","rarity":"rare","price":6000,"emoji":"🔧"},
    {"name":"Escopeta","category":"Armas","rarity":"rare","price":15000,"emoji":"🔫"},
    {"name":"Francotirador","category":"Armas","rarity":"legendary","price":60000,"emoji":"🎯"},
    {"name":"Chaleco Militar","category":"Armas","rarity":"epic","price":20000,"emoji":"🥋"},
    # Drogas
    {"name":"Hierba","category":"Drogas","rarity":"common","price":200,"emoji":"🌿"},
    {"name":"Polvo Blanco","category":"Drogas","rarity":"rare","price":5000,"emoji":"🤍"},
    {"name":"Pastillas","category":"Drogas","rarity":"uncommon","price":800,"emoji":"💊"},
    {"name":"Metanfetamina","category":"Drogas","rarity":"rare","price":4500,"emoji":"💎"},
    {"name":"Opiáceos","category":"Drogas","rarity":"epic","price":9000,"emoji":"🔴"},
    {"name":"Solvente Tóxico","category":"Drogas","rarity":"uncommon","price":1200,"emoji":"🧪"},
    # Documentos Falsos
    {"name":"Pasaporte Falso","category":"Documentos Falsos","rarity":"epic","price":35000,"emoji":"📕"},
    {"name":"Placa Policial Falsa","category":"Documentos Falsos","rarity":"epic","price":30000,"emoji":"🪪"},
    {"name":"Identificación Robada","category":"Documentos Falsos","rarity":"rare","price":12000,"emoji":"🆔"},
    {"name":"Licencia Falsificada","category":"Documentos Falsos","rarity":"rare","price":8000,"emoji":"📃"},
    {"name":"Placas Vehiculares Robadas","category":"Documentos Falsos","rarity":"uncommon","price":3000,"emoji":"🔲"},
    # Equipo Especial
    {"name":"Llave Maestra","category":"Equipo Especial","rarity":"legendary","price":100000,"emoji":"🗝️"},
    {"name":"Explosivo C4","category":"Equipo Especial","rarity":"legendary","price":80000,"emoji":"💥"},
    {"name":"Cámara Espía","category":"Equipo Especial","rarity":"rare","price":15000,"emoji":"👁️"},
    {"name":"Escáner de Frecuencias","category":"Equipo Especial","rarity":"epic","price":25000,"emoji":"📡"},
    {"name":"Bloqueador de Señal","category":"Equipo Especial","rarity":"rare","price":18000,"emoji":"📵"},
    {"name":"Kit de Hackeo","category":"Equipo Especial","rarity":"epic","price":40000,"emoji":"💻"},
    # Contrabando
    {"name":"Cigarrillos de Contrabando","category":"Contrabando","rarity":"common","price":600,"emoji":"🚬"},
    {"name":"Alcohol Ilegal","category":"Contrabando","rarity":"uncommon","price":1500,"emoji":"🥃"},
    {"name":"Diamantes Robados","category":"Contrabando","rarity":"legendary","price":75000,"emoji":"💎"},
    {"name":"Arte Falsificado","category":"Contrabando","rarity":"epic","price":45000,"emoji":"🖼️"},
    {"name":"Electrónicos Robados","category":"Contrabando","rarity":"rare","price":8000,"emoji":"📦"},
    {"name":"Vehículo Chop Shop","category":"Contrabando","rarity":"rare","price":20000,"emoji":"🚗"},
]

def admin_check(interaction: discord.Interaction):
    return interaction.user.guild_permissions.administrator

class Admin(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    admin = app_commands.Group(name="admin", description="Comandos de administración")

    # Admin economia
    admin_eco = app_commands.Group(name="economia", description="Gestión de economía", parent=admin)

    @admin_eco.command(name="dar", description="Dar dinero a un jugador")
    @app_commands.describe(usuario="Jugador", cantidad="Cantidad", tipo="Efectivo o banco")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="Efectivo", value="cash"),
        app_commands.Choice(name="Banco", value="bank"),
    ])
    async def eco_dar(self, interaction: discord.Interaction, usuario: discord.Member, cantidad: int, tipo: str = "cash"):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_user(str(usuario.id), str(interaction.guild_id))
        if tipo == "cash":
            add_cash(str(usuario.id), str(interaction.guild_id), cantidad)
        else:
            add_bank(str(usuario.id), str(interaction.guild_id), cantidad)
        await interaction.response.send_message(embed=success_embed("Dinero entregado", f"Se entregaron **{format_currency(cantidad)}** ({tipo}) a {usuario.mention}"), ephemeral=True)

    @admin_eco.command(name="quitar", description="Quitar dinero a un jugador")
    @app_commands.describe(usuario="Jugador", cantidad="Cantidad", tipo="Efectivo o banco")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="Efectivo", value="cash"),
        app_commands.Choice(name="Banco", value="bank"),
    ])
    async def eco_quitar(self, interaction: discord.Interaction, usuario: discord.Member, cantidad: int, tipo: str = "cash"):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        if tipo == "cash":
            execute("UPDATE users SET cash=GREATEST(0,cash-$1), updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(usuario.id), str(interaction.guild_id)))
        else:
            execute("UPDATE users SET bank=GREATEST(0,bank-$1), updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(usuario.id), str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("Dinero quitado", f"Se quitaron **{format_currency(cantidad)}** ({tipo}) a {usuario.mention}"), ephemeral=True)

    # Admin objetos
    admin_items = app_commands.Group(name="objetos", description="Gestión de objetos", parent=admin)

    @admin_items.command(name="crear", description="Crear un objeto nuevo")
    @app_commands.describe(nombre="Nombre", categoria="Categoría", rareza="Rareza", precio="Precio", emoji="Emoji")
    @app_commands.choices(rareza=[
        app_commands.Choice(name="Common", value="common"),
        app_commands.Choice(name="Uncommon", value="uncommon"),
        app_commands.Choice(name="Rare", value="rare"),
        app_commands.Choice(name="Epic", value="epic"),
        app_commands.Choice(name="Legendary", value="legendary"),
    ])
    async def items_crear(self, interaction: discord.Interaction, nombre: str, categoria: str, rareza: str, precio: int, emoji: str = "📦"):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        item_id = generate_id()
        execute(
            """INSERT INTO items (id, name, category, rarity, price, emoji, is_active, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())""",
            (item_id, nombre, categoria, rareza, precio, emoji)
        )
        await interaction.response.send_message(embed=success_embed("Objeto creado", f"{emoji} **{nombre}** — {rareza} — {format_currency(precio)}"), ephemeral=True)

    @admin_items.command(name="lista", description="Ver todos los objetos")
    async def items_lista(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        items = execute("SELECT * FROM items ORDER BY category, name LIMIT 25", fetch="all") or []
        e = info_embed("📦 Objetos del servidor")
        if not items:
            e.description = "No hay objetos creados"
        else:
            cats = {}
            for it in items:
                cats.setdefault(it.get("category","General"), []).append(it)
            for cat, citems in cats.items():
                lines = [f"{it.get('emoji','📦')} **{it['name']}** — {format_currency(it['price'])} ({it.get('rarity','common')})" for it in citems[:5]]
                e.add_field(name=cat, value="\n".join(lines), inline=True)
        await interaction.response.send_message(embed=e, ephemeral=True)

    # Admin departamento
    admin_dept = app_commands.Group(name="departamento", description="Gestión de departamentos", parent=admin)

    @admin_dept.command(name="crear", description="Crear un departamento")
    @app_commands.describe(nombre="Nombre completo", acronimo="Acrónimo (CPD, CFD, etc.)", descripcion="Descripción", presupuesto="Presupuesto inicial")
    async def dept_crear(self, interaction: discord.Interaction, nombre: str, acronimo: str, descripcion: str = "", presupuesto: int = 10000):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        existing = execute("SELECT id FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if existing:
            await interaction.response.send_message(embed=error_embed("Ya existe", f"Ya hay un departamento con acrónimo **{acronimo}**"), ephemeral=True)
            return
        execute(
            """INSERT INTO departments (id, guild_id, name, acronym, description, budget, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())""",
            (generate_id(), str(interaction.guild_id), nombre, acronimo.upper(), descripcion, presupuesto)
        )
        await interaction.response.send_message(embed=success_embed(f"Departamento creado — {acronimo.upper()}", f"**{nombre}** con presupuesto inicial de {format_currency(presupuesto)}"), ephemeral=True)

    # Admin propiedad
    admin_prop = app_commands.Group(name="propiedad", description="Gestión de propiedades", parent=admin)

    @admin_prop.command(name="crear", description="Crear una propiedad")
    @app_commands.describe(nombre="Nombre", tipo="Tipo", precio="Precio de compra", precio_renta="Precio de renta diario (0=no rentable)")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="🏠 Casa", value="house"),
        app_commands.Choice(name="🏢 Apartamento", value="apartment"),
        app_commands.Choice(name="🏭 Bodega", value="warehouse"),
        app_commands.Choice(name="🏬 Oficina", value="office"),
        app_commands.Choice(name="🌿 Terreno", value="land"),
        app_commands.Choice(name="🏰 Mansión", value="mansion"),
        app_commands.Choice(name="🏪 Tienda", value="store"),
    ])
    async def prop_crear(self, interaction: discord.Interaction, nombre: str, tipo: str, precio: int, precio_renta: int = 0):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute(
            """INSERT INTO properties (id, guild_id, name, type, price, rent_price, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,'available',NOW(),NOW())""",
            (generate_id(), str(interaction.guild_id), nombre, tipo, precio, precio_renta if precio_renta > 0 else None)
        )
        await interaction.response.send_message(embed=success_embed("Propiedad creada", f"**{nombre}** — {format_currency(precio)} de compra"), ephemeral=True)

    # Admin xp
    admin_xp = app_commands.Group(name="xp", description="Gestión de XP", parent=admin)

    @admin_xp.command(name="dar", description="Dar XP a un jugador")
    @app_commands.describe(usuario="Jugador", cantidad="Cantidad de XP")
    async def xp_dar(self, interaction: discord.Interaction, usuario: discord.Member, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_user(str(usuario.id), str(interaction.guild_id))
        execute("UPDATE users SET xp=xp+$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(usuario.id), str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("XP otorgado", f"Se dieron **{cantidad} XP** a {usuario.mention}"), ephemeral=True)

    @admin_xp.command(name="quitar", description="Quitar XP a un jugador")
    @app_commands.describe(usuario="Jugador", cantidad="Cantidad de XP")
    async def xp_quitar(self, interaction: discord.Interaction, usuario: discord.Member, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute("UPDATE users SET xp=GREATEST(0,xp-$1), updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(usuario.id), str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("XP quitado", f"Se quitaron **{cantidad} XP** a {usuario.mention}"), ephemeral=True)

    @admin_xp.command(name="multiplicador", description="Ver/establecer el multiplicador de XP del servidor")
    @app_commands.describe(valor="Multiplicador (ej: 1.5 = +50% XP). Omite para ver el actual.")
    async def xp_multiplicador(self, interaction: discord.Interaction, valor: float = None):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_guild_config(str(interaction.guild_id))
        if valor is None:
            cfg = execute("SELECT xp_multiplier FROM guild_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
            mult = cfg.get("xp_multiplier", 1.0) if cfg else 1.0
            await interaction.response.send_message(embed=info_embed("Multiplicador de XP", f"Actual: **{mult}x**"), ephemeral=True)
        else:
            execute("UPDATE guild_config SET xp_multiplier=$1, updated_at=NOW() WHERE guild_id=$2", (max(0.1, min(valor, 10.0)), str(interaction.guild_id)))
            await interaction.response.send_message(embed=success_embed("Multiplicador actualizado", f"XP multiplicado por **{valor}x**"), ephemeral=True)

    # Admin reset
    admin_reset = app_commands.Group(name="reset", description="Restablecer datos de jugadores", parent=admin)

    @admin_reset.command(name="usuario", description="Restablecer economía de un jugador")
    @app_commands.describe(usuario="Jugador a restablecer")
    async def reset_usuario(self, interaction: discord.Interaction, usuario: discord.Member):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute(
            "UPDATE users SET cash=0, bank=0, xp=0, level=1, reputation=0, dirty_money=0, updated_at=NOW() WHERE discord_id=$1 AND guild_id=$2",
            (str(usuario.id), str(interaction.guild_id))
        )
        await interaction.response.send_message(embed=success_embed("Usuario restablecido", f"Economía y estadísticas de {usuario.mention} fueron reiniciadas"), ephemeral=True)

    @admin_reset.command(name="cooldowns", description="Reiniciar los cooldowns de un jugador")
    @app_commands.describe(usuario="Jugador")
    async def reset_cooldowns(self, interaction: discord.Interaction, usuario: discord.Member):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute(
            "UPDATE users SET last_daily=NULL, last_weekly=NULL, last_work=NULL, updated_at=NOW() WHERE discord_id=$1 AND guild_id=$2",
            (str(usuario.id), str(interaction.guild_id))
        )
        await interaction.response.send_message(embed=success_embed("Cooldowns reiniciados", f"Cooldowns de {usuario.mention} fueron reiniciados"), ephemeral=True)

    # Admin recompensas de nivel
    admin_rewards = app_commands.Group(name="recompensas", description="Recompensas de nivel", parent=admin)

    @admin_rewards.command(name="agregar", description="Agregar recompensa de rol por nivel")
    @app_commands.describe(nivel="Nivel requerido", rol="Rol a otorgar")
    async def rewards_agregar(self, interaction: discord.Interaction, nivel: int, rol: discord.Role):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        existing = execute("SELECT id FROM level_rewards WHERE guild_id=$1 AND level=$2", (str(interaction.guild_id), nivel), fetch="one")
        if existing:
            execute("UPDATE level_rewards SET role_id=$1, updated_at=NOW() WHERE id=$2", (str(rol.id), existing["id"]))
        else:
            execute(
                "INSERT INTO level_rewards (id, guild_id, level, role_id, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())",
                (generate_id(), str(interaction.guild_id), nivel, str(rol.id))
            )
        await interaction.response.send_message(embed=success_embed("Recompensa agregada", f"Nivel **{nivel}** → {rol.mention}"), ephemeral=True)

    @admin_rewards.command(name="lista", description="Ver recompensas de nivel configuradas")
    async def rewards_lista(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        rewards = execute(
            "SELECT * FROM level_rewards WHERE guild_id=$1 ORDER BY level",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = info_embed("🎖️ Recompensas de Nivel")
        if not rewards:
            e.description = "No hay recompensas de nivel configuradas"
        else:
            lines = [f"Nivel **{r['level']}** → <@&{r['role_id']}>" for r in rewards]
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @admin_rewards.command(name="quitar", description="Quitar recompensa de un nivel")
    @app_commands.describe(nivel="Nivel")
    async def rewards_quitar(self, interaction: discord.Interaction, nivel: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute("DELETE FROM level_rewards WHERE guild_id=$1 AND level=$2", (str(interaction.guild_id), nivel))
        await interaction.response.send_message(embed=success_embed("Recompensa eliminada", f"Recompensa de nivel **{nivel}** eliminada"), ephemeral=True)

    # Admin configuracion
    admin_cfg = app_commands.Group(name="configuracion", description="Configuración del servidor", parent=admin)

    @admin_cfg.command(name="diario", description="Configurar cantidad de /diario")
    @app_commands.describe(cantidad="Cantidad nueva")
    async def cfg_diario(self, interaction: discord.Interaction, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_guild_config(str(interaction.guild_id))
        execute("UPDATE guild_config SET daily_amount=$1, updated_at=NOW() WHERE guild_id=$2", (cantidad, str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("Configurado", f"Recompensa diaria actualizada a **{format_currency(cantidad)}**"), ephemeral=True)

    @admin_cfg.command(name="semanal", description="Configurar cantidad de /semanal")
    @app_commands.describe(cantidad="Cantidad nueva")
    async def cfg_semanal(self, interaction: discord.Interaction, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_guild_config(str(interaction.guild_id))
        execute("UPDATE guild_config SET weekly_amount=$1, updated_at=NOW() WHERE guild_id=$2", (cantidad, str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("Configurado", f"Recompensa semanal actualizada a **{format_currency(cantidad)}**"), ephemeral=True)

    @admin_cfg.command(name="canal_log", description="Configurar canal de logs del servidor")
    @app_commands.describe(canal="Canal de texto para logs")
    async def cfg_canal_log(self, interaction: discord.Interaction, canal: discord.TextChannel):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        get_or_create_guild_config(str(interaction.guild_id))
        execute("UPDATE guild_config SET log_channel_id=$1, updated_at=NOW() WHERE guild_id=$2", (str(canal.id), str(interaction.guild_id)))
        await interaction.response.send_message(embed=success_embed("Canal configurado", f"Canal de logs: {canal.mention}"), ephemeral=True)

    @admin_cfg.command(name="verificacion", description="Configurar sistema de verificación")
    @app_commands.describe(rol="Rol de verificado", canal_log="Canal de logs", edad_minima="Edad mínima de cuenta en días")
    async def cfg_verificacion(self, interaction: discord.Interaction, rol: discord.Role = None, canal_log: discord.TextChannel = None, edad_minima: int = None):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        existing = execute("SELECT id FROM verification_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        if existing:
            if rol:
                execute("UPDATE verification_config SET verified_role_id=$1, updated_at=NOW() WHERE guild_id=$2", (str(rol.id), str(interaction.guild_id)))
            if canal_log:
                execute("UPDATE verification_config SET log_channel_id=$1, updated_at=NOW() WHERE guild_id=$2", (str(canal_log.id), str(interaction.guild_id)))
            if edad_minima is not None:
                execute("UPDATE verification_config SET min_account_age_days=$1, updated_at=NOW() WHERE guild_id=$2", (edad_minima, str(interaction.guild_id)))
        else:
            execute(
                "INSERT INTO verification_config (id, guild_id, verified_role_id, log_channel_id, min_account_age_days, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())",
                (generate_id(), str(interaction.guild_id), str(rol.id) if rol else None, str(canal_log.id) if canal_log else None, edad_minima or 7)
            )
        changes = []
        if rol: changes.append(f"Rol: {rol.mention}")
        if canal_log: changes.append(f"Log: {canal_log.mention}")
        if edad_minima is not None: changes.append(f"Edad mínima: {edad_minima} días")
        await interaction.response.send_message(embed=success_embed("Verificación configurada", "\n".join(changes) or "Sin cambios"), ephemeral=True)

    @admin_cfg.command(name="ver", description="Ver todas las configuraciones actuales del servidor")
    async def cfg_ver(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        gid = str(interaction.guild_id)

        cfg = execute("SELECT * FROM guild_config WHERE guild_id=$1", (gid,), fetch="one") or {}
        ver_cfg = execute("SELECT * FROM verification_config WHERE guild_id=$1", (gid,), fetch="one") or {}
        tick_cfg = execute("SELECT * FROM ticket_config WHERE guild_id=$1", (gid,), fetch="one") or {}
        app_cfg = execute("SELECT * FROM application_config WHERE guild_id=$1", (gid,), fetch="one") or {}
        treasury = execute("SELECT balance FROM treasury WHERE guild_id=$1", (gid,), fetch="one") or {}
        dept_count = (execute("SELECT COUNT(*) as c FROM departments WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)
        company_count = (execute("SELECT COUNT(*) as c FROM companies WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)
        prop_count = (execute("SELECT COUNT(*) as c FROM properties WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)
        player_count = (execute("SELECT COUNT(*) as c FROM users WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)
        shop_count = (execute("SELECT COUNT(*) as c FROM shop WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)
        bm_count = (execute("SELECT COUNT(*) as c FROM black_market_stock WHERE quantity > 0", fetch="one") or {}).get("c", 0)
        reward_count = (execute("SELECT COUNT(*) as c FROM level_rewards WHERE guild_id=$1", (gid,), fetch="one") or {}).get("c", 0)

        e = info_embed(
            f"⚙️ Configuración de {interaction.guild.name}",
            f"Resumen completo del servidor para administradores"
        )

        log_ch = f"<#{cfg.get('log_channel_id')}>" if cfg.get("log_channel_id") else "No configurado"
        e.add_field(
            name="💰 Economía",
            value=(
                f"Diario: **{format_currency(cfg.get('daily_amount', 500))}**\n"
                f"Semanal: **{format_currency(cfg.get('weekly_amount', 2500))}**\n"
                f"Impuesto: **{cfg.get('tax_rate', 5)}%**\n"
                f"Mult. XP: **{cfg.get('xp_multiplier', 1.0)}x**\n"
                f"Canal log: {log_ch}"
            ),
            inline=True
        )

        treas_bal = format_currency(treasury.get("balance", 0)) if treasury else "**$0** (sin inicializar)"
        e.add_field(
            name="🏛️ Tesoro & Stats",
            value=(
                f"Tesoro: **{treas_bal}**\n"
                f"Jugadores: **{player_count}**\n"
                f"Departamentos: **{dept_count}**\n"
                f"Empresas: **{company_count}**\n"
                f"Propiedades: **{prop_count}**"
            ),
            inline=True
        )

        ver_role = f"<@&{ver_cfg.get('verified_role_id')}>" if ver_cfg.get("verified_role_id") else "No config."
        ver_log = f"<#{ver_cfg.get('log_channel_id')}>" if ver_cfg.get("log_channel_id") else "No config."
        e.add_field(
            name="✅ Verificación",
            value=(
                f"Rol verificado: {ver_role}\n"
                f"Canal log: {ver_log}\n"
                f"Edad mínima: **{ver_cfg.get('min_account_age_days', 7)} días**"
            ) if ver_cfg else "❌ Sin configurar — usa `/admin configuracion verificacion`",
            inline=True
        )

        tick_cat = f"**{tick_cfg.get('category_id', 'N/A')}**" if tick_cfg.get("category_id") else "No config."
        tick_rol = f"<@&{tick_cfg.get('support_role_id')}>" if tick_cfg.get("support_role_id") else "No config."
        e.add_field(
            name="🎫 Tickets",
            value=(
                f"Categoría ID: {tick_cat}\n"
                f"Rol soporte: {tick_rol}"
            ) if tick_cfg else "❌ Sin configurar — usa `/admin configuracion tickets`",
            inline=True
        )

        app_log = f"<#{app_cfg.get('log_channel_id')}>" if app_cfg.get("log_channel_id") else "No config."
        e.add_field(
            name="📋 Solicitudes",
            value=(
                f"Canal log: {app_log}"
            ) if app_cfg else "❌ Sin configurar — usa `/admin configuracion solicitudes`",
            inline=True
        )

        e.add_field(
            name="🛍️ Tienda & Mercado",
            value=(
                f"Objetos en tienda: **{shop_count}**\n"
                f"Stock mercado negro: **{bm_count}** items activos\n"
                f"Recompensas de nivel: **{reward_count}**"
            ),
            inline=True
        )

        e.set_footer(text=f"ID del servidor: {gid}")
        await interaction.followup.send(embed=e, ephemeral=True)

    @admin_cfg.command(name="tickets", description="Configurar el sistema de tickets")
    @app_commands.describe(categoria="Categoría de Discord para tickets", rol_soporte="Rol de soporte")
    async def cfg_tickets(self, interaction: discord.Interaction, categoria: discord.CategoryChannel = None, rol_soporte: discord.Role = None):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        existing = execute("SELECT id FROM ticket_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        if existing:
            if categoria:
                execute("UPDATE ticket_config SET category_id=$1, updated_at=NOW() WHERE guild_id=$2", (str(categoria.id), str(interaction.guild_id)))
            if rol_soporte:
                execute("UPDATE ticket_config SET support_role_id=$1, updated_at=NOW() WHERE guild_id=$2", (str(rol_soporte.id), str(interaction.guild_id)))
        else:
            execute(
                "INSERT INTO ticket_config (id, guild_id, category_id, support_role_id, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())",
                (generate_id(), str(interaction.guild_id), str(categoria.id) if categoria else None, str(rol_soporte.id) if rol_soporte else None)
            )
        changes = []
        if categoria: changes.append(f"Categoría: **{categoria.name}**")
        if rol_soporte: changes.append(f"Soporte: {rol_soporte.mention}")
        await interaction.response.send_message(embed=success_embed("Tickets configurados", "\n".join(changes) or "Sin cambios"), ephemeral=True)

    # /adminshop
    adminshop = app_commands.Group(name="adminshop", description="Gestión de la tienda")

    @adminshop.command(name="agregar", description="Agregar objeto a la tienda")
    @app_commands.describe(objeto="Nombre del objeto", precio="Precio de venta", stock="Stock (-1 = infinito)")
    async def shop_agregar(self, interaction: discord.Interaction, objeto: str, precio: int, stock: int = -1):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        item = execute("SELECT * FROM items WHERE name ILIKE $1 AND is_active=true LIMIT 1", (f"%{objeto}%",), fetch="one")
        if not item:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Objeto **{objeto}** no existe. Créalo primero con `/admin objetos crear`"), ephemeral=True)
            return
        existing = execute("SELECT id FROM shop WHERE guild_id=$1 AND item_id=$2", (str(interaction.guild_id), item["id"]), fetch="one")
        if existing:
            execute("UPDATE shop SET price=$1, stock=$2, updated_at=NOW() WHERE id=$3", (precio, stock, existing["id"]))
            await interaction.response.send_message(embed=success_embed("Tienda actualizada", f"**{item['name']}** — {format_currency(precio)} (stock: {'∞' if stock==-1 else stock})"), ephemeral=True)
            return
        execute(
            """INSERT INTO shop (id, guild_id, item_id, price, stock, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,NOW(),NOW())""",
            (generate_id(), str(interaction.guild_id), item["id"], precio, stock)
        )
        await interaction.response.send_message(embed=success_embed("Objeto añadido a tienda", f"**{item['name']}** — {format_currency(precio)}"), ephemeral=True)

    @adminshop.command(name="quitar", description="Quitar objeto de la tienda")
    @app_commands.describe(objeto="Nombre del objeto")
    async def shop_quitar(self, interaction: discord.Interaction, objeto: str):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        item = execute("SELECT * FROM items WHERE name ILIKE $1 LIMIT 1", (f"%{objeto}%",), fetch="one")
        if not item:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Objeto **{objeto}** no existe"), ephemeral=True)
            return
        execute("DELETE FROM shop WHERE guild_id=$1 AND item_id=$2", (str(interaction.guild_id), item["id"]))
        await interaction.response.send_message(embed=success_embed("Objeto quitado", f"**{item['name']}** eliminado de la tienda"), ephemeral=True)

    @adminshop.command(name="predeterminados", description="Cargar el catálogo legal de objetos en la tienda normal")
    async def shop_defaults(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        created = 0
        added_to_shop = 0
        for item_data in SHOP_ITEMS:
            existing = execute("SELECT id FROM items WHERE name=$1 AND is_active=true LIMIT 1", (item_data["name"],), fetch="one")
            if not existing:
                item_id = generate_id()
                execute(
                    """INSERT INTO items (id, name, category, rarity, price, emoji, is_active, black_market_only, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,$5,$6,true,false,NOW(),NOW())""",
                    (item_id, item_data["name"], item_data["category"], item_data["rarity"], item_data["price"], item_data["emoji"])
                )
                existing = {"id": item_id}
                created += 1
            else:
                execute("UPDATE items SET black_market_only=false, updated_at=NOW() WHERE id=$1", (existing["id"],))
            shop_entry = execute("SELECT id FROM shop WHERE guild_id=$1 AND item_id=$2", (str(interaction.guild_id), existing["id"]), fetch="one")
            if not shop_entry:
                execute(
                    """INSERT INTO shop (id, guild_id, item_id, price, stock, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,-1,NOW(),NOW())""",
                    (generate_id(), str(interaction.guild_id), existing["id"], item_data["price"])
                )
                added_to_shop += 1
        await interaction.followup.send(embed=success_embed(
            "🛍️ Tienda cargada",
            f"**{created}** objetos nuevos creados\n**{added_to_shop}** añadidos a la tienda\n\nTotal catálogo: **{len(SHOP_ITEMS)} objetos legales**"
        ), ephemeral=True)

    @adminshop.command(name="mercadonegro", description="Cargar el catálogo ilegal exclusivo del mercado negro")
    async def shop_blackmarket_defaults(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        created = 0
        added_to_bm = 0
        import random
        for item_data in BLACK_MARKET_ITEMS:
            existing = execute("SELECT id FROM items WHERE name=$1 AND is_active=true LIMIT 1", (item_data["name"],), fetch="one")
            if not existing:
                item_id = generate_id()
                execute(
                    """INSERT INTO items (id, name, category, rarity, price, emoji, is_active, black_market_only, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,$5,$6,true,true,NOW(),NOW())""",
                    (item_id, item_data["name"], item_data["category"], item_data["rarity"], item_data["price"], item_data["emoji"])
                )
                existing = {"id": item_id}
                created += 1
            else:
                execute("UPDATE items SET black_market_only=true, updated_at=NOW() WHERE id=$1", (existing["id"],))
            bm_entry = execute("SELECT id FROM black_market_stock WHERE item_id=$1 LIMIT 1", (existing["id"],), fetch="one")
            if not bm_entry:
                execute(
                    """INSERT INTO black_market_stock (id, item_id, price_modifier, quantity, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,NOW(),NOW())""",
                    (generate_id(), existing["id"], round(random.uniform(1.0, 1.8), 2), random.randint(1, 8))
                )
                added_to_bm += 1
        await interaction.followup.send(embed=success_embed(
            "🕶️ Mercado Negro cargado",
            f"**{created}** objetos ilegales creados\n**{added_to_bm}** añadidos al stock del mercado negro\n\nTotal catálogo: **{len(BLACK_MARKET_ITEMS)} objetos ilegales**\n\nEl stock se rota automáticamente cada 6 horas."
        ), ephemeral=True)

    # /tesoro
    tesoro_group = app_commands.Group(name="tesoro", description="Gestión del tesoro")

    @tesoro_group.command(name="info", description="Ver el estado del tesoro")
    async def tesoro_info(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        treasury = execute("SELECT * FROM treasury WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        e = info_embed("🏛️ Tesoro del Servidor")
        if not treasury:
            e.description = "No hay tesoro configurado. Úsalo para gestionar fondos de gobierno."
            e.add_field(name="💰 Fondos", value="$0", inline=True)
        else:
            e.add_field(name="💰 Fondos", value=format_currency(treasury.get("balance",0)), inline=True)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @tesoro_group.command(name="depositar", description="Depositar fondos al tesoro")
    @app_commands.describe(cantidad="Cantidad")
    async def tesoro_depositar(self, interaction: discord.Interaction, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        treasury = execute("SELECT * FROM treasury WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        if treasury:
            execute("UPDATE treasury SET balance=balance+$1, updated_at=NOW() WHERE guild_id=$2", (cantidad, str(interaction.guild_id)))
        else:
            execute(
                "INSERT INTO treasury (id, guild_id, balance, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())",
                (generate_id(), str(interaction.guild_id), cantidad)
            )
        await interaction.response.send_message(embed=success_embed("Fondos depositados", f"Se depositaron **{format_currency(cantidad)}** al tesoro"), ephemeral=True)

    @tesoro_group.command(name="financiar", description="Financiar un departamento desde el tesoro")
    @app_commands.describe(acronimo="Acrónimo del departamento", cantidad="Cantidad")
    async def tesoro_financiar(self, interaction: discord.Interaction, acronimo: str, cantidad: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        treasury = execute("SELECT * FROM treasury WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        if not treasury or (treasury.get("balance",0) or 0) < cantidad:
            await interaction.response.send_message(embed=error_embed("Sin fondos", "El tesoro no tiene fondos suficientes"), ephemeral=True)
            return
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        execute("UPDATE treasury SET balance=balance-$1, updated_at=NOW() WHERE guild_id=$2", (cantidad, str(interaction.guild_id)))
        execute("UPDATE departments SET budget=budget+$1, updated_at=NOW() WHERE id=$2", (cantidad, dept["id"]))
        await interaction.response.send_message(embed=success_embed("Departamento financiado", f"**{format_currency(cantidad)}** transferidos al **{dept['name']}**"), ephemeral=True)

    # /solicitar
    solicitar_group = app_commands.Group(name="solicitar", description="Sistema de solicitudes")

    @solicitar_group.command(name="aplicar", description="Solicitar unirse a un departamento o equipo")
    @app_commands.describe(tipo="Tipo de solicitud")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="👮 CPD", value="CPD"),
        app_commands.Choice(name="🚒 CFD", value="CFD"),
        app_commands.Choice(name="⭐ Sheriff", value="Sheriff"),
        app_commands.Choice(name="🚧 DOT", value="DOT"),
        app_commands.Choice(name="🛠️ Staff", value="Staff"),
    ])
    async def solicitar_aplicar(self, interaction: discord.Interaction, tipo: str):
        modal = ApplicationModal(tipo)
        await interaction.response.send_modal(modal)

    @solicitar_group.command(name="lista", description="Ver solicitudes pendientes (admin)")
    async def solicitar_lista(self, interaction: discord.Interaction):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        apps = execute(
            "SELECT * FROM applications WHERE guild_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 10",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = info_embed("📋 Solicitudes pendientes")
        if not apps:
            e.description = "No hay solicitudes pendientes"
        else:
            lines = [f"<@{a['discord_id']}> — **{a.get('type','?')}** (`{a['id'][:8]}`) — <t:{int(a['created_at'].timestamp()) if hasattr(a['created_at'],'timestamp') else 0}:R>" for a in apps]
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e, ephemeral=True)

    # /contrato
    contrato_group = app_commands.Group(name="contrato", description="Sistema de contratos")

    @contrato_group.command(name="lista", description="Ver contratos disponibles")
    async def contrato_lista(self, interaction: discord.Interaction):
        contracts = execute(
            "SELECT * FROM contracts WHERE guild_id=$1 AND status='open' ORDER BY reward DESC LIMIT 10",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = info_embed("📜 Contratos disponibles")
        if not contracts:
            e.description = "No hay contratos disponibles"
        else:
            for c in contracts:
                e.add_field(
                    name=f"📋 {c.get('title','Contrato')}",
                    value=f"Recompensa: **{format_currency(c.get('reward',0))}**\n{c.get('description','')[:80]}\n`ID: {c['id'][:8]}`",
                    inline=True
                )
        await interaction.response.send_message(embed=e)

    @contrato_group.command(name="crear", description="Crear un contrato (admin)")
    @app_commands.describe(titulo="Título", descripcion="Descripción", recompensa="Recompensa en cash")
    async def contrato_crear(self, interaction: discord.Interaction, titulo: str, descripcion: str, recompensa: int):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        execute(
            """INSERT INTO contracts (id, guild_id, creator_id, title, description, reward, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NOW())""",
            (generate_id(), str(interaction.guild_id), str(interaction.user.id), titulo, descripcion, recompensa)
        )
        await interaction.response.send_message(embed=success_embed(f"📜 Contrato creado — {titulo}", f"Recompensa: **{format_currency(recompensa)}**"), ephemeral=True)

    @contrato_group.command(name="aceptar", description="Aceptar un contrato")
    @app_commands.describe(id_contrato="ID del contrato")
    async def contrato_aceptar(self, interaction: discord.Interaction, id_contrato: str):
        contract = execute(
            "SELECT * FROM contracts WHERE guild_id=$1 AND status='open' AND id LIKE $2",
            (str(interaction.guild_id), f"{id_contrato}%"), fetch="one"
        )
        if not contract:
            await interaction.response.send_message(embed=error_embed("No encontrado", "Contrato no encontrado o no disponible"), ephemeral=True)
            return
        execute(
            "UPDATE contracts SET status='active', assignee_id=$1, updated_at=NOW() WHERE id=$2",
            (str(interaction.user.id), contract["id"])
        )
        await interaction.response.send_message(embed=success_embed(f"📜 Contrato aceptado — {contract['title']}", f"Complétalo para ganar **{format_currency(contract['reward'])}**"))

    @contrato_group.command(name="completar", description="Marcar un contrato como completado (admin)")
    @app_commands.describe(id_contrato="ID del contrato")
    async def contrato_completar(self, interaction: discord.Interaction, id_contrato: str):
        if not admin_check(interaction):
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Solo administradores"), ephemeral=True)
            return
        contract = execute(
            "SELECT * FROM contracts WHERE guild_id=$1 AND status='active' AND id LIKE $2",
            (str(interaction.guild_id), f"{id_contrato}%"), fetch="one"
        )
        if not contract:
            await interaction.response.send_message(embed=error_embed("No encontrado", "Contrato activo no encontrado"), ephemeral=True)
            return
        execute("UPDATE contracts SET status='completed', updated_at=NOW() WHERE id=$1", (contract["id"],))
        if contract.get("assignee_id"):
            add_cash(contract["assignee_id"], str(interaction.guild_id), contract["reward"])
            from bot.services.economy import log_transaction
            log_transaction(contract["assignee_id"], str(interaction.guild_id), "contract_reward", contract["reward"], f"Contrato: {contract['title']}")
        await interaction.response.send_message(embed=success_embed("Contrato completado", f"**{contract['title']}** — Recompensa de **{format_currency(contract['reward'])}** entregada"))


class ApplicationModal(discord.ui.Modal):
    def __init__(self, dept_type: str):
        super().__init__(title=f"Solicitud — {dept_type}")
        self.dept_type = dept_type
        self.experience = discord.ui.TextInput(
            label="Experiencia relevante",
            placeholder="Describe tu experiencia...",
            style=discord.TextStyle.paragraph,
            max_length=500
        )
        self.motivation = discord.ui.TextInput(
            label="Motivación",
            placeholder="¿Por qué quieres unirte?",
            style=discord.TextStyle.paragraph,
            max_length=300
        )
        self.add_item(self.experience)
        self.add_item(self.motivation)

    async def on_submit(self, interaction: discord.Interaction):
        app_id = generate_id()
        execute(
            """INSERT INTO applications (id, guild_id, discord_id, type, experience, motivation, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW(),NOW())""",
            (app_id, str(interaction.guild_id), str(interaction.user.id), self.dept_type, self.experience.value, self.motivation.value)
        )
        config = execute("SELECT * FROM application_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        if config and config.get("log_channel_id"):
            channel = interaction.guild.get_channel(int(config["log_channel_id"]))
            if channel:
                e = info_embed(f"📋 Nueva solicitud — {self.dept_type}", f"Solicitante: {interaction.user.mention}")
                e.add_field(name="Experiencia", value=self.experience.value[:500], inline=False)
                e.add_field(name="Motivación", value=self.motivation.value[:300], inline=False)
                e.set_footer(text=f"ID: {app_id[:8]}")
                view = ApplicationReviewView(app_id)
                try:
                    await channel.send(embed=e, view=view)
                except Exception:
                    pass
        await interaction.response.send_message(embed=success_embed("Solicitud enviada", f"Tu solicitud para **{self.dept_type}** fue enviada. Espera respuesta."), ephemeral=True)


class ApplicationReviewView(discord.ui.View):
    def __init__(self, app_id: str):
        super().__init__(timeout=None)
        self.app_id = app_id

    @discord.ui.button(label="✅ Aprobar", style=discord.ButtonStyle.success, custom_id="app_approve")
    async def approve(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.manage_roles:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Sin permisos"), ephemeral=True)
            return
        execute("UPDATE applications SET status='approved', reviewed_by=$1, updated_at=NOW() WHERE id=$2", (str(interaction.user.id), self.app_id))
        await interaction.response.send_message(embed=success_embed("Solicitud aprobada", f"ID: `{self.app_id[:8]}`"), ephemeral=True)

    @discord.ui.button(label="❌ Rechazar", style=discord.ButtonStyle.danger, custom_id="app_deny")
    async def deny(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.manage_roles:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Sin permisos"), ephemeral=True)
            return
        execute("UPDATE applications SET status='denied', reviewed_by=$1, updated_at=NOW() WHERE id=$2", (str(interaction.user.id), self.app_id))
        await interaction.response.send_message(embed=success_embed("Solicitud rechazada", f"ID: `{self.app_id[:8]}`"), ephemeral=True)


async def setup(bot):
    await bot.add_cog(Admin(bot))
