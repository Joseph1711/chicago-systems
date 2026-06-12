import discord
from discord import app_commands
from discord.ext import commands
import datetime
import random

from bot.db import execute
from bot.helpers import get_or_create_user, format_currency, generate_id
from bot.embeds import success_embed, error_embed, info_embed, department_embed
from bot.services.economy import remove_cash

COOLDOWNS = {}

def check_cooldown(key, seconds):
    now = datetime.datetime.utcnow().timestamp()
    last = COOLDOWNS.get(key, 0)
    remaining = (last + seconds) - now
    if remaining > 0:
        return remaining
    COOLDOWNS[key] = now
    return 0

DEPT_EMOJI = {"CPD":"👮","CFD":"🚒","Sheriff":"⭐","ISP":"🚔","DOT":"🚧","DOJ":"⚖️","EMA":"🏥"}

class Departments(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    departamento = app_commands.Group(name="departamento", description="Gestión de departamentos")

    @departamento.command(name="lista", description="Ver todos los departamentos")
    async def lista(self, interaction: discord.Interaction):
        cd = check_cooldown(f"dept:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        depts = execute(
            "SELECT * FROM departments WHERE guild_id=$1 ORDER BY name",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = department_embed("🏛️ Departamentos")
        if not depts:
            e.description = "No hay departamentos creados"
        else:
            for d in depts:
                emoji = DEPT_EMOJI.get(d.get("acronym",""),"🏢")
                count = execute("SELECT COUNT(*) as c FROM department_members WHERE department_id=$1", (d["id"],), fetch="one")
                members = count["c"] if count else 0
                e.add_field(
                    name=f"{emoji} {d['name']} [{d.get('acronym','')}]",
                    value=f"👥 {members} miembros | 💰 {format_currency(d.get('budget',0))}",
                    inline=True
                )
        await interaction.response.send_message(embed=e)

    @departamento.command(name="info", description="Ver información de un departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento (CPD, CFD, etc.)")
    async def info(self, interaction: discord.Interaction, acronimo: str):
        dept = execute(
            "SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2",
            (str(interaction.guild_id), acronimo), fetch="one"
        )
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        count = execute("SELECT COUNT(*) as c FROM department_members WHERE department_id=$1", (dept["id"],), fetch="one")
        members = count["c"] if count else 0
        e = department_embed(f"{emoji} {dept['name']}", dept.get("description",""))
        e.add_field(name="💰 Presupuesto", value=format_currency(dept.get("budget",0)), inline=True)
        e.add_field(name="👥 Miembros", value=str(members), inline=True)
        e.add_field(name="🏷️ Acrónimo", value=dept.get("acronym",""), inline=True)
        await interaction.response.send_message(embed=e)

    @departamento.command(name="unirse", description="Solicitar unirse a un departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento")
    async def unirse(self, interaction: discord.Interaction, acronimo: str):
        cd = check_cooldown(f"dept:{interaction.user.id}:{interaction.guild_id}", 10)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        dept = execute(
            "SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2",
            (str(interaction.guild_id), acronimo), fetch="one"
        )
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        existing = execute(
            "SELECT id FROM department_members WHERE department_id=$1 AND discord_id=$2",
            (dept["id"], str(interaction.user.id)), fetch="one"
        )
        if existing:
            await interaction.response.send_message(embed=error_embed("Ya eres miembro", f"Ya perteneces a **{dept['name']}**"), ephemeral=True)
            return
        execute(
            """INSERT INTO department_members (id, department_id, discord_id, guild_id, rank, salary, joined_at)
               VALUES ($1,$2,$3,$4,'Cadete',0,NOW())""",
            (generate_id(), dept["id"], str(interaction.user.id), str(interaction.guild_id))
        )
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"Bienvenido al {emoji} {dept['name']}", f"Te uniste como **Cadete**"))

    @departamento.command(name="contratar", description="Contratar a un miembro (requiere permisos)")
    @app_commands.describe(usuario="Usuario a contratar", acronimo="Acrónimo del departamento", rango="Rango asignado", salario="Salario diario")
    async def contratar(self, interaction: discord.Interaction, usuario: discord.Member, acronimo: str, rango: str = "Oficial", salario: int = 0):
        if not interaction.user.guild_permissions.manage_roles and not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de administración"), ephemeral=True)
            return
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        existing = execute("SELECT id FROM department_members WHERE department_id=$1 AND discord_id=$2", (dept["id"], str(usuario.id)), fetch="one")
        if existing:
            execute("UPDATE department_members SET rank=$1, salary=$2 WHERE id=$3", (rango, salario, existing["id"]))
        else:
            execute(
                """INSERT INTO department_members (id, department_id, discord_id, guild_id, rank, salary, joined_at)
                   VALUES ($1,$2,$3,$4,$5,$6,NOW())""",
                (generate_id(), dept["id"], str(usuario.id), str(interaction.guild_id), rango, salario)
            )
        get_or_create_user(str(usuario.id), str(interaction.guild_id))
        if dept.get("role_id"):
            role = interaction.guild.get_role(int(dept["role_id"]))
            if role:
                try:
                    await usuario.add_roles(role, reason=f"Contratado en {dept['name']}")
                except Exception:
                    pass
        execute(
            """INSERT INTO department_audit (id, department_id, guild_id, action, performed_by, target_id, details, created_at)
               VALUES ($1,$2,$3,'hire',$4,$5,$6,NOW())""",
            (generate_id(), dept["id"], str(interaction.guild_id), str(interaction.user.id), str(usuario.id), f"Rango: {rango}, Salario: {salario}")
        )
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"Contratado — {emoji} {dept['name']}", f"{usuario.mention} contratado como **{rango}**"))

    @departamento.command(name="despedir", description="Despedir a un miembro")
    @app_commands.describe(usuario="Usuario a despedir", acronimo="Acrónimo del departamento")
    async def despedir(self, interaction: discord.Interaction, usuario: discord.Member, acronimo: str):
        if not interaction.user.guild_permissions.manage_roles and not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de administración"), ephemeral=True)
            return
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        member_row = execute("SELECT id FROM department_members WHERE department_id=$1 AND discord_id=$2", (dept["id"], str(usuario.id)), fetch="one")
        if not member_row:
            await interaction.response.send_message(embed=error_embed("No es miembro", f"{usuario.mention} no pertenece a **{dept['name']}**"), ephemeral=True)
            return
        execute("DELETE FROM department_members WHERE id=$1", (member_row["id"],))
        if dept.get("role_id"):
            role = interaction.guild.get_role(int(dept["role_id"]))
            if role:
                try:
                    await usuario.remove_roles(role, reason=f"Despedido de {dept['name']}")
                except Exception:
                    pass
        execute(
            """INSERT INTO department_audit (id, department_id, guild_id, action, performed_by, target_id, details, created_at)
               VALUES ($1,$2,$3,'fire',$4,$5,'Despedido',NOW())""",
            (generate_id(), dept["id"], str(interaction.guild_id), str(interaction.user.id), str(usuario.id))
        )
        await interaction.response.send_message(embed=success_embed("Despedido", f"{usuario.mention} fue despedido de **{dept['name']}**"))

    @departamento.command(name="presupuesto", description="Ver el presupuesto del departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento")
    async def presupuesto(self, interaction: discord.Interaction, acronimo: str):
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        e = department_embed(f"{emoji} Presupuesto — {dept['name']}")
        e.add_field(name="💰 Presupuesto actual", value=format_currency(dept.get("budget",0)), inline=True)
        await interaction.response.send_message(embed=e)

    @departamento.command(name="miembros", description="Ver los miembros del departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento")
    async def miembros(self, interaction: discord.Interaction, acronimo: str):
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        members = execute(
            "SELECT * FROM department_members WHERE department_id=$1 ORDER BY joined_at",
            (dept["id"],), fetch="all"
        ) or []
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        e = department_embed(f"{emoji} Miembros — {dept['name']}")
        if not members:
            e.description = "No hay miembros en este departamento"
        else:
            lines = [f"<@{m['discord_id']}> — **{m.get('rank','Oficial')}** | {format_currency(m.get('salary',0))}/día" for m in members]
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e)

    # /flota
    flota = app_commands.Group(name="flota", description="Gestión de flota vehicular")

    @flota.command(name="ver", description="Ver la flota del departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento")
    async def flota_ver(self, interaction: discord.Interaction, acronimo: str):
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        vehicles = execute(
            """SELECT fv.*, fvt.name as type_name, fvt.price FROM fleet_vehicles fv
               JOIN fleet_vehicle_types fvt ON fvt.id=fv.vehicle_type_id
               WHERE fv.department_id=$1 ORDER BY fv.status, fvt.name""",
            (dept["id"],), fetch="all"
        ) or []
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        e = department_embed(f"{emoji} Flota — {dept['name']}")
        if not vehicles:
            e.description = "No hay vehículos en esta flota"
        else:
            status_emoji = {"active":"✅","repairing":"🔧","returned":"📦","damaged":"❌"}
            lines = [f"🚗 **{v['type_name']}** `{v.get('plate','N/A')}` — {status_emoji.get(v.get('status','active'),'❓')} {v.get('status','active').title()}" for v in vehicles]
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e)

    @flota.command(name="comprar", description="Comprar un vehículo para el departamento")
    @app_commands.describe(acronimo="Acrónimo del departamento", tipo="Tipo de vehículo")
    async def flota_comprar(self, interaction: discord.Interaction, acronimo: str, tipo: str):
        if not interaction.user.guild_permissions.manage_roles and not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de administración"), ephemeral=True)
            return
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        vtype = execute("SELECT * FROM fleet_vehicle_types WHERE guild_id=$1 AND name ILIKE $2 LIMIT 1", (str(interaction.guild_id), f"%{tipo}%"), fetch="one")
        if not vtype:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Tipo de vehículo **{tipo}** no existe"), ephemeral=True)
            return
        price = float(vtype.get("price",0))
        if float(dept.get("budget",0)) < price:
            await interaction.response.send_message(embed=error_embed("Sin presupuesto", f"El departamento necesita **{format_currency(price)}**. Presupuesto actual: **{format_currency(dept.get('budget',0))}**"), ephemeral=True)
            return
        execute("UPDATE departments SET budget=budget-$1, updated_at=NOW() WHERE id=$2", (price, dept["id"]))
        import random as _random, string
        plate = "".join(_random.choices(string.ascii_uppercase + string.digits, k=7))
        execute(
            """INSERT INTO fleet_vehicles (id, department_id, guild_id, vehicle_type_id, plate, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW())""",
            (generate_id(), dept["id"], str(interaction.guild_id), vtype["id"], plate)
        )
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"{emoji} Vehículo adquirido", f"**{vtype['name']}** (Placa: `{plate}`) comprado por **{format_currency(price)}**"))

    @flota.command(name="solicitar", description="Solicitar el uso de un vehículo de la flota")
    @app_commands.describe(acronimo="Acrónimo del departamento", placa="Placa del vehículo")
    async def flota_solicitar(self, interaction: discord.Interaction, acronimo: str, placa: str):
        dept = execute("SELECT * FROM departments WHERE guild_id=$1 AND acronym ILIKE $2", (str(interaction.guild_id), acronimo), fetch="one")
        if not dept:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Departamento **{acronimo}** no existe"), ephemeral=True)
            return
        member_row = execute(
            "SELECT id FROM department_members WHERE department_id=$1 AND discord_id=$2",
            (dept["id"], str(interaction.user.id)), fetch="one"
        )
        if not member_row:
            await interaction.response.send_message(embed=error_embed("No eres miembro", f"Debes pertenecer al **{dept['name']}** para solicitar vehículos"), ephemeral=True)
            return
        vehicle = execute(
            "SELECT fv.*, fvt.name as type_name FROM fleet_vehicles fv JOIN fleet_vehicle_types fvt ON fvt.id=fv.vehicle_type_id WHERE fv.department_id=$1 AND fv.plate ILIKE $2 AND fv.status='active'",
            (dept["id"], f"%{placa}%"), fetch="one"
        )
        if not vehicle:
            await interaction.response.send_message(embed=error_embed("No disponible", f"Vehículo con placa `{placa}` no encontrado o no disponible"), ephemeral=True)
            return
        execute("UPDATE fleet_vehicles SET status='in_use', assigned_to=$1, updated_at=NOW() WHERE id=$2", (str(interaction.user.id), vehicle["id"]))
        emoji = DEPT_EMOJI.get(dept.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"{emoji} Vehículo asignado", f"**{vehicle['type_name']}** (Placa: `{vehicle['plate']}`) está bajo tu cargo"))

    @flota.command(name="devolver", description="Devolver un vehículo asignado")
    @app_commands.describe(placa="Placa del vehículo a devolver")
    async def flota_devolver(self, interaction: discord.Interaction, placa: str):
        vehicle = execute(
            "SELECT fv.*, fvt.name as type_name, d.name as dept_name, d.acronym FROM fleet_vehicles fv JOIN fleet_vehicle_types fvt ON fvt.id=fv.vehicle_type_id JOIN departments d ON d.id=fv.department_id WHERE fv.guild_id=$1 AND fv.assigned_to=$2 AND fv.plate ILIKE $3",
            (str(interaction.guild_id), str(interaction.user.id), f"%{placa}%"), fetch="one"
        )
        if not vehicle:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"No tienes un vehículo con placa `{placa}` asignado"), ephemeral=True)
            return
        execute("UPDATE fleet_vehicles SET status='active', assigned_to=NULL, updated_at=NOW() WHERE id=$1", (vehicle["id"],))
        emoji = DEPT_EMOJI.get(vehicle.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"{emoji} Vehículo devuelto", f"**{vehicle['type_name']}** (Placa: `{vehicle['plate']}`) devuelto al {vehicle['dept_name']}"))

    @flota.command(name="reparar", description="Reportar un vehículo para reparación")
    @app_commands.describe(placa="Placa del vehículo", razon="Razón del reporte")
    async def flota_reparar(self, interaction: discord.Interaction, placa: str, razon: str = "Daños en servicio"):
        vehicle = execute(
            "SELECT fv.*, fvt.name as type_name, d.name as dept_name, d.acronym FROM fleet_vehicles fv JOIN fleet_vehicle_types fvt ON fvt.id=fv.vehicle_type_id JOIN departments d ON d.id=fv.department_id WHERE fv.guild_id=$1 AND fv.plate ILIKE $2",
            (str(interaction.guild_id), f"%{placa}%"), fetch="one"
        )
        if not vehicle:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Vehículo con placa `{placa}` no encontrado"), ephemeral=True)
            return
        if vehicle.get("status") == "repairing":
            await interaction.response.send_message(embed=error_embed("Ya en reparación", f"El vehículo `{placa}` ya está siendo reparado"), ephemeral=True)
            return
        execute("UPDATE fleet_vehicles SET status='repairing', assigned_to=NULL, updated_at=NOW() WHERE id=$1", (vehicle["id"],))
        emoji = DEPT_EMOJI.get(vehicle.get("acronym",""),"🏢")
        await interaction.response.send_message(embed=success_embed(f"🔧 Vehículo enviado a reparación", f"**{vehicle['type_name']}** (Placa: `{vehicle['plate']}`) — Razón: {razon}"))

    @flota.command(name="gestionar", description="Gestionar estado de un vehículo (admin)")
    @app_commands.describe(placa="Placa del vehículo", estado="Nuevo estado")
    @app_commands.choices(estado=[
        app_commands.Choice(name="✅ Activo", value="active"),
        app_commands.Choice(name="🔧 En reparación", value="repairing"),
        app_commands.Choice(name="❌ Dañado", value="damaged"),
        app_commands.Choice(name="📦 Devuelto/Baja", value="returned"),
    ])
    async def flota_gestionar(self, interaction: discord.Interaction, placa: str, estado: str):
        if not interaction.user.guild_permissions.manage_roles and not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de administración"), ephemeral=True)
            return
        vehicle = execute(
            "SELECT fv.*, fvt.name as type_name FROM fleet_vehicles fv JOIN fleet_vehicle_types fvt ON fvt.id=fv.vehicle_type_id WHERE fv.guild_id=$1 AND fv.plate ILIKE $2",
            (str(interaction.guild_id), f"%{placa}%"), fetch="one"
        )
        if not vehicle:
            await interaction.response.send_message(embed=error_embed("No encontrado", f"Vehículo con placa `{placa}` no encontrado"), ephemeral=True)
            return
        execute("UPDATE fleet_vehicles SET status=$1, assigned_to=NULL, updated_at=NOW() WHERE id=$2", (estado, vehicle["id"]))
        status_emoji = {"active":"✅","repairing":"🔧","damaged":"❌","returned":"📦"}.get(estado,"❓")
        await interaction.response.send_message(embed=success_embed(f"{status_emoji} Estado actualizado", f"**{vehicle['type_name']}** (Placa: `{vehicle['plate']}`) → **{estado}**"), ephemeral=True)


async def setup(bot):
    await bot.add_cog(Departments(bot))
