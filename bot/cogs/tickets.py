import discord
from discord import app_commands
from discord.ext import commands
import datetime

from bot.db import execute
from bot.helpers import generate_id
from bot.embeds import success_embed, error_embed, info_embed

COOLDOWNS = {}

def check_cooldown(key, seconds):
    now = datetime.datetime.utcnow().timestamp()
    last = COOLDOWNS.get(key, 0)
    remaining = (last + seconds) - now
    if remaining > 0:
        return remaining
    COOLDOWNS[key] = now
    return 0

class TicketOpenButton(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="📩 Abrir Ticket", style=discord.ButtonStyle.primary, custom_id="ticket_open")
    async def open_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        open_tickets = execute(
            "SELECT id FROM tickets WHERE guild_id=$1 AND creator_id=$2 AND status='open'",
            (str(interaction.guild_id), str(interaction.user.id)), fetch="all"
        ) or []
        if len(open_tickets) >= 3:
            await interaction.response.send_message(embed=error_embed("Límite alcanzado", "Tienes 3 tickets abiertos. Cierra uno primero."), ephemeral=True)
            return
        config = execute("SELECT * FROM ticket_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        category_id = config.get("category_id") if config else None
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(read_messages=False),
            interaction.user: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        }
        if config and config.get("support_role_id"):
            support_role = interaction.guild.get_role(int(config["support_role_id"]))
            if support_role:
                overwrites[support_role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)
        category = interaction.guild.get_channel(int(category_id)) if category_id else None
        channel = await interaction.guild.create_text_channel(
            f"ticket-{interaction.user.name}",
            category=category,
            overwrites=overwrites,
            reason="Nuevo ticket de soporte"
        )
        ticket_id = generate_id()
        execute(
            """INSERT INTO tickets (id, guild_id, creator_id, channel_id, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,'open',NOW(),NOW())""",
            (ticket_id, str(interaction.guild_id), str(interaction.user.id), str(channel.id))
        )
        close_view = TicketCloseButton()
        e = info_embed(f"🎫 Ticket #{ticket_id[:6]}", f"Ticket creado por {interaction.user.mention}\nUsa el botón para cerrar el ticket cuando esté resuelto.")
        await channel.send(embed=e, view=close_view)
        await interaction.response.send_message(embed=success_embed("Ticket creado", f"Tu ticket fue creado en {channel.mention}"), ephemeral=True)

class TicketCloseButton(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="🔒 Cerrar Ticket", style=discord.ButtonStyle.danger, custom_id="ticket_close")
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        ticket = execute(
            "SELECT * FROM tickets WHERE channel_id=$1 AND status='open'",
            (str(interaction.channel_id),), fetch="one"
        )
        if not ticket:
            await interaction.response.send_message(embed=error_embed("Error", "No hay ticket abierto en este canal"), ephemeral=True)
            return
        execute(
            "UPDATE tickets SET status='closed', closed_by=$1, updated_at=NOW() WHERE id=$2",
            (str(interaction.user.id), ticket["id"])
        )
        await interaction.response.send_message(embed=success_embed("Ticket cerrado", f"Cerrado por {interaction.user.mention}"))
        await interaction.channel.edit(name=f"cerrado-{interaction.channel.name}")
        try:
            await interaction.channel.set_permissions(interaction.guild.default_role, read_messages=False)
            member = interaction.guild.get_member(int(ticket["creator_id"]))
            if member:
                await interaction.channel.set_permissions(member, send_messages=False)
        except Exception:
            pass

class Tickets(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    ticket = app_commands.Group(name="ticket", description="Sistema de tickets")

    @ticket.command(name="panel", description="Crear un panel de tickets (admin)")
    @app_commands.describe(titulo="Título del panel", descripcion="Descripción")
    async def panel(self, interaction: discord.Interaction, titulo: str = "🎫 Soporte", descripcion: str = "Haz clic en el botón para abrir un ticket de soporte"):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de administrador"), ephemeral=True)
            return
        e = info_embed(titulo, descripcion)
        view = TicketOpenButton()
        await interaction.channel.send(embed=e, view=view)
        await interaction.response.send_message(embed=success_embed("Panel creado", "El panel de tickets fue publicado"), ephemeral=True)

    @ticket.command(name="abrir", description="Abrir un ticket de soporte")
    async def abrir(self, interaction: discord.Interaction):
        cd = check_cooldown(f"ticket:{interaction.user.id}:{interaction.guild_id}", 10)
        if cd:
            await interaction.response.send_message(embed=error_embed("Espera", f"Intenta en `{cd:.1f}s`"), ephemeral=True)
            return
        open_tickets = execute(
            "SELECT id FROM tickets WHERE guild_id=$1 AND creator_id=$2 AND status='open'",
            (str(interaction.guild_id), str(interaction.user.id)), fetch="all"
        ) or []
        if len(open_tickets) >= 3:
            await interaction.response.send_message(embed=error_embed("Límite", "Tienes 3 tickets abiertos. Cierra uno primero."), ephemeral=True)
            return
        config = execute("SELECT * FROM ticket_config WHERE guild_id=$1", (str(interaction.guild_id),), fetch="one")
        category_id = config.get("category_id") if config else None
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(read_messages=False),
            interaction.user: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        }
        if config and config.get("support_role_id"):
            support_role = interaction.guild.get_role(int(config["support_role_id"]))
            if support_role:
                overwrites[support_role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)
        category = interaction.guild.get_channel(int(category_id)) if category_id else None
        channel = await interaction.guild.create_text_channel(
            f"ticket-{interaction.user.name}",
            category=category,
            overwrites=overwrites
        )
        ticket_id = generate_id()
        execute(
            """INSERT INTO tickets (id, guild_id, creator_id, channel_id, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,'open',NOW(),NOW())""",
            (ticket_id, str(interaction.guild_id), str(interaction.user.id), str(channel.id))
        )
        view = TicketCloseButton()
        e = info_embed(f"🎫 Ticket #{ticket_id[:6]}", f"Ticket de {interaction.user.mention}")
        await channel.send(embed=e, view=view)
        await interaction.response.send_message(embed=success_embed("Ticket creado", f"Tu ticket está en {channel.mention}"), ephemeral=True)

    @ticket.command(name="cerrar", description="Cerrar el ticket actual")
    async def cerrar(self, interaction: discord.Interaction):
        ticket = execute(
            "SELECT * FROM tickets WHERE channel_id=$1 AND status='open'",
            (str(interaction.channel_id),), fetch="one"
        )
        if not ticket:
            await interaction.response.send_message(embed=error_embed("Error", "No hay ticket abierto en este canal"), ephemeral=True)
            return
        execute(
            "UPDATE tickets SET status='closed', closed_by=$1, updated_at=NOW() WHERE id=$2",
            (str(interaction.user.id), ticket["id"])
        )
        await interaction.response.send_message(embed=success_embed("Ticket cerrado", f"Cerrado por {interaction.user.mention}"))

    @ticket.command(name="lista", description="Ver todos los tickets abiertos")
    async def lista(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message(embed=error_embed("Sin permisos", "Necesitas permisos de gestión de canales"), ephemeral=True)
            return
        tickets = execute(
            "SELECT * FROM tickets WHERE guild_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 20",
            (str(interaction.guild_id),), fetch="all"
        ) or []
        e = info_embed("🎫 Tickets abiertos")
        if not tickets:
            e.description = "No hay tickets abiertos"
        else:
            lines = [f"<#{t['channel_id']}> — <@{t['creator_id']}> (`{t['id'][:8]}`)" for t in tickets]
            e.description = "\n".join(lines)
        await interaction.response.send_message(embed=e, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Tickets(bot))
