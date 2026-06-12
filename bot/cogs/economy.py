import discord
from discord import app_commands
from discord.ext import commands
import datetime
import random

from bot.db import execute
from bot.helpers import get_or_create_user, get_or_create_guild_config, format_currency, generate_id
from bot.embeds import success_embed, error_embed, economy_embed, info_embed
from bot.services.economy import add_cash, log_transaction, transfer
from bot.services.levels import add_xp

COOLDOWNS = {}

def check_cooldown(key, seconds):
    now = datetime.datetime.utcnow().timestamp()
    last = COOLDOWNS.get(key, 0)
    remaining = (last + seconds) - now
    if remaining > 0:
        return remaining
    COOLDOWNS[key] = now
    return 0

class Economy(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # /balance
    @app_commands.command(name="balance", description="Ver tu balance de efectivo y banco")
    @app_commands.describe(usuario="Usuario a consultar (opcional)")
    async def balance(self, interaction: discord.Interaction, usuario: discord.Member = None):
        cd = check_cooldown(f"balance:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Comando en cooldown. Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        target = usuario or interaction.user
        user = get_or_create_user(str(target.id), str(interaction.guild_id))
        cash = user.get("cash", 0) or 0
        bank = user.get("bank", 0) or 0
        net = cash + bank
        e = economy_embed(f"💰 Balance de {target.display_name}")
        e.set_thumbnail(url=target.display_avatar.url)
        e.add_field(name="💵 Efectivo", value=format_currency(cash), inline=True)
        e.add_field(name="🏦 Banco", value=format_currency(bank), inline=True)
        e.add_field(name="💎 Patrimonio Neto", value=format_currency(net), inline=True)
        await interaction.response.send_message(embed=e)

    # /diario
    @app_commands.command(name="diario", description="Reclamar tu recompensa diaria")
    async def diario(self, interaction: discord.Interaction):
        cd = check_cooldown(f"diario_cmd:{interaction.user.id}:{interaction.guild_id}", 3)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        user = get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        config = get_or_create_guild_config(str(interaction.guild_id))
        now = datetime.datetime.utcnow()
        last_daily = user.get("last_daily")
        if last_daily:
            if isinstance(last_daily, str):
                last_daily = datetime.datetime.fromisoformat(last_daily.replace("Z",""))
            elapsed = (now - last_daily).total_seconds()
            if elapsed < 86400:
                remaining = 86400 - elapsed
                hrs = int(remaining // 3600)
                mins = int((remaining % 3600) // 60)
                await interaction.response.send_message(embed=error_embed("Ya reclamaste hoy", f"Vuelve en **{hrs}h {mins}m**"), ephemeral=True)
                return
        amount = config.get("daily_amount") or 500
        execute(
            "UPDATE users SET last_daily=$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
            (now, str(interaction.user.id), str(interaction.guild_id))
        )
        add_cash(str(interaction.user.id), str(interaction.guild_id), amount)
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "daily", amount, "Recompensa diaria")
        await add_xp(str(interaction.user.id), str(interaction.guild_id), 50, self.bot)
        await interaction.response.send_message(embed=success_embed("¡Recompensa Diaria!", f"Has recibido **{format_currency(amount)}** 💵"))

    # /semanal
    @app_commands.command(name="semanal", description="Reclamar tu recompensa semanal")
    async def semanal(self, interaction: discord.Interaction):
        cd = check_cooldown(f"semanal_cmd:{interaction.user.id}:{interaction.guild_id}", 3)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        user = get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        config = get_or_create_guild_config(str(interaction.guild_id))
        now = datetime.datetime.utcnow()
        last_weekly = user.get("last_weekly")
        if last_weekly:
            if isinstance(last_weekly, str):
                last_weekly = datetime.datetime.fromisoformat(last_weekly.replace("Z",""))
            elapsed = (now - last_weekly).total_seconds()
            if elapsed < 604800:
                remaining = 604800 - elapsed
                days = int(remaining // 86400)
                hrs = int((remaining % 86400) // 3600)
                await interaction.response.send_message(embed=error_embed("Ya reclamaste esta semana", f"Vuelve en **{days}d {hrs}h**"), ephemeral=True)
                return
        amount = config.get("weekly_amount") or 2500
        execute(
            "UPDATE users SET last_weekly=$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
            (now, str(interaction.user.id), str(interaction.guild_id))
        )
        add_cash(str(interaction.user.id), str(interaction.guild_id), amount)
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "weekly", amount, "Recompensa semanal")
        await add_xp(str(interaction.user.id), str(interaction.guild_id), 150, self.bot)
        await interaction.response.send_message(embed=success_embed("¡Recompensa Semanal!", f"Has recibido **{format_currency(amount)}** 💵"))

    # /trabajar
    @app_commands.command(name="trabajar", description="Trabajar para ganar dinero")
    async def trabajar(self, interaction: discord.Interaction):
        cd = check_cooldown(f"trabajar_cmd:{interaction.user.id}:{interaction.guild_id}", 3)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        user = get_or_create_user(str(interaction.user.id), str(interaction.guild_id))
        now = datetime.datetime.utcnow()

        jobs = execute(
            "SELECT * FROM jobs WHERE guild_id=$1 AND is_active=true",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        default_jobs = [
            {"name":"Policía","min_pay":200,"max_pay":400,"cooldown_minutes":60,"emoji":"👮"},
            {"name":"Bombero","min_pay":180,"max_pay":380,"cooldown_minutes":60,"emoji":"🚒"},
            {"name":"Médico","min_pay":220,"max_pay":450,"cooldown_minutes":60,"emoji":"🏥"},
            {"name":"Mecánico","min_pay":150,"max_pay":320,"cooldown_minutes":60,"emoji":"🔧"},
            {"name":"Chef","min_pay":130,"max_pay":280,"cooldown_minutes":60,"emoji":"👨‍🍳"},
        ]
        job_pool = list(jobs) if jobs else default_jobs
        job = random.choice(job_pool)
        cooldown_secs = (job.get("cooldown_minutes") or 60) * 60

        last_work = user.get("last_work")
        if last_work:
            if isinstance(last_work, str):
                last_work = datetime.datetime.fromisoformat(last_work.replace("Z",""))
            elapsed = (now - last_work).total_seconds()
            if elapsed < cooldown_secs:
                remaining = cooldown_secs - elapsed
                hrs = int(remaining // 3600)
                mins = int((remaining % 3600) // 60)
                await interaction.response.send_message(embed=error_embed("Estás cansado", f"Descansa **{hrs}h {mins}m** más"), ephemeral=True)
                return

        min_pay = job.get("min_pay") or 150
        max_pay = job.get("max_pay") or 350
        earned = random.randint(int(min_pay), int(max_pay))
        emoji = job.get("emoji","💼")
        name = job.get("name","Trabajo")

        execute(
            "UPDATE users SET last_work=$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
            (now, str(interaction.user.id), str(interaction.guild_id))
        )
        add_cash(str(interaction.user.id), str(interaction.guild_id), earned)
        log_transaction(str(interaction.user.id), str(interaction.guild_id), "work", earned, f"Trabajo: {name}")
        await add_xp(str(interaction.user.id), str(interaction.guild_id), 30, self.bot)
        await interaction.response.send_message(embed=success_embed(
            f"{emoji} Trabajo completado",
            f"Trabajaste como **{name}** y ganaste **{format_currency(earned)}** 💵"
        ))

    # /pagar
    @app_commands.command(name="pagar", description="Pagar dinero a otro jugador")
    @app_commands.describe(usuario="Usuario a pagar", cantidad="Cantidad a pagar")
    async def pagar(self, interaction: discord.Interaction, usuario: discord.Member, cantidad: int):
        cd = check_cooldown(f"pagar:{interaction.user.id}:{interaction.guild_id}", 5)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if usuario.id == interaction.user.id:
            await interaction.response.send_message(embed=error_embed("Error", "No puedes pagarte a ti mismo"), ephemeral=True)
            return
        if usuario.bot:
            await interaction.response.send_message(embed=error_embed("Error", "No puedes pagar a un bot"), ephemeral=True)
            return
        if cantidad <= 0:
            await interaction.response.send_message(embed=error_embed("Error", "La cantidad debe ser positiva"), ephemeral=True)
            return
        get_or_create_user(str(usuario.id), str(interaction.guild_id))
        ok = transfer(str(interaction.user.id), str(usuario.id), str(interaction.guild_id), cantidad, "pay", f"Pago a {usuario.name}")
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", "No tienes suficiente efectivo"), ephemeral=True)
            return
        e = success_embed("Pago exitoso", f"Pagaste **{format_currency(cantidad)}** a {usuario.mention}")
        await interaction.response.send_message(embed=e)

    # /tabla
    @app_commands.command(name="tabla", description="Ver la tabla de líderes")
    @app_commands.describe(tipo="Tipo de clasificación")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="Riqueza", value="wealth"),
        app_commands.Choice(name="Nivel", value="level"),
        app_commands.Choice(name="Reputación", value="reputation"),
    ])
    async def tabla(self, interaction: discord.Interaction, tipo: str = "wealth"):
        cd = check_cooldown(f"tabla:{interaction.user.id}:{interaction.guild_id}", 10)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        await interaction.response.defer()
        if tipo == "wealth":
            rows = execute(
                "SELECT discord_id, cash, bank FROM users WHERE guild_id=$1 ORDER BY (cash+bank) DESC LIMIT 10",
                (str(interaction.guild_id),), fetch="all"
            ) or []
            e = economy_embed("💎 Tabla de Riqueza")
            lines = []
            medals = ["🥇","🥈","🥉"]
            for i, row in enumerate(rows):
                medal = medals[i] if i < 3 else f"`{i+1}.`"
                net = (row["cash"] or 0) + (row["bank"] or 0)
                lines.append(f"{medal} <@{row['discord_id']}> — **{format_currency(net)}**")
            e.description = "\n".join(lines) if lines else "Sin datos"
        elif tipo == "level":
            rows = execute(
                "SELECT discord_id, level, xp FROM users WHERE guild_id=$1 ORDER BY level DESC, xp DESC LIMIT 10",
                (str(interaction.guild_id),), fetch="all"
            ) or []
            e = info_embed("⭐ Tabla de Niveles")
            lines = []
            medals = ["🥇","🥈","🥉"]
            for i, row in enumerate(rows):
                medal = medals[i] if i < 3 else f"`{i+1}.`"
                lines.append(f"{medal} <@{row['discord_id']}> — Nivel **{row['level']}** (`{row['xp']} XP`)")
            e.description = "\n".join(lines) if lines else "Sin datos"
        else:
            rows = execute(
                "SELECT discord_id, reputation FROM users WHERE guild_id=$1 ORDER BY reputation DESC LIMIT 10",
                (str(interaction.guild_id),), fetch="all"
            ) or []
            e = info_embed("⭐ Tabla de Reputación")
            lines = []
            medals = ["🥇","🥈","🥉"]
            for i, row in enumerate(rows):
                medal = medals[i] if i < 3 else f"`{i+1}.`"
                lines.append(f"{medal} <@{row['discord_id']}> — **{row['reputation']} pts**")
            e.description = "\n".join(lines) if lines else "Sin datos"
        await interaction.followup.send(embed=e)

    # /donar
    @app_commands.command(name="donar", description="Donar dinero a un jugador, departamento o empresa")
    @app_commands.describe(
        tipo="A quién donar",
        cantidad="Cantidad a donar",
        objetivo="Nombre/ID del objetivo",
        mensaje="Mensaje opcional"
    )
    @app_commands.choices(tipo=[
        app_commands.Choice(name="Jugador", value="jugador"),
        app_commands.Choice(name="Departamento", value="departamento"),
        app_commands.Choice(name="Empresa", value="empresa"),
    ])
    async def donar(self, interaction: discord.Interaction, tipo: str, cantidad: int, objetivo: str, mensaje: str = ""):
        cd = check_cooldown(f"donar:{interaction.user.id}:{interaction.guild_id}", 10)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        if cantidad <= 0:
            await interaction.response.send_message(embed=error_embed("Error", "La cantidad debe ser positiva"), ephemeral=True)
            return
        from bot.services.economy import remove_cash
        ok = remove_cash(str(interaction.user.id), str(interaction.guild_id), cantidad)
        if not ok:
            await interaction.response.send_message(embed=error_embed("Sin fondos", "No tienes suficiente efectivo"), ephemeral=True)
            return
        if tipo == "jugador":
            member = interaction.guild.get_member_named(objetivo)
            if not member:
                try:
                    member = await interaction.guild.fetch_member(int(objetivo))
                except Exception:
                    pass
            if not member:
                remove_cash(str(interaction.user.id), str(interaction.guild_id), -cantidad)
                await interaction.response.send_message(embed=error_embed("No encontrado", "No se encontró ese jugador"), ephemeral=True)
                return
            get_or_create_user(str(member.id), str(interaction.guild_id))
            add_cash(str(member.id), str(interaction.guild_id), cantidad)
            log_transaction(str(interaction.user.id), str(interaction.guild_id), "donation", -cantidad, f"Donación a {member.name}")
            log_transaction(str(member.id), str(interaction.guild_id), "donation", cantidad, f"Donación de {interaction.user.name}")
            target_name = member.mention
        elif tipo == "departamento":
            dept = execute(
                "SELECT * FROM departments WHERE guild_id=$1 AND (acronym ILIKE $2 OR name ILIKE $2)",
                (str(interaction.guild_id), objetivo), fetch="one"
            )
            if not dept:
                execute("UPDATE users SET cash=cash+$1 WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(interaction.user.id), str(interaction.guild_id)))
                await interaction.response.send_message(embed=error_embed("No encontrado", "No se encontró ese departamento"), ephemeral=True)
                return
            execute("UPDATE departments SET budget=budget+$1, updated_at=NOW() WHERE id=$2", (cantidad, dept["id"]))
            log_transaction(str(interaction.user.id), str(interaction.guild_id), "donation", -cantidad, f"Donación a {dept['name']}")
            target_name = dept["name"]
        else:
            company = execute(
                "SELECT * FROM companies WHERE guild_id=$1 AND name ILIKE $2",
                (str(interaction.guild_id), f"%{objetivo}%"), fetch="one"
            )
            if not company:
                execute("UPDATE users SET cash=cash+$1 WHERE discord_id=$2 AND guild_id=$3", (cantidad, str(interaction.user.id), str(interaction.guild_id)))
                await interaction.response.send_message(embed=error_embed("No encontrado", "No se encontró esa empresa"), ephemeral=True)
                return
            execute("UPDATE companies SET funds=funds+$1, updated_at=NOW() WHERE id=$2", (cantidad, company["id"]))
            log_transaction(str(interaction.user.id), str(interaction.guild_id), "donation", -cantidad, f"Donación a {company['name']}")
            target_name = company["name"]
        e = success_embed("Donación realizada", f"Donaste **{format_currency(cantidad)}** a **{target_name}**")
        if mensaje:
            e.add_field(name="Mensaje", value=mensaje, inline=False)
        await interaction.response.send_message(embed=e)


async def setup(bot):
    await bot.add_cog(Economy(bot))
