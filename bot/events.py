import discord
import logging
import datetime
import random

from bot.helpers import get_or_create_user
from bot.services.levels import add_xp
from bot.middleware.antispam import is_spamming
from bot.config import XP_PER_MESSAGE_MIN, XP_PER_MESSAGE_MAX

logger = logging.getLogger("bot")

def setup_events(bot):
    @bot.event
    async def on_ready():
        bot.start_time = datetime.datetime.utcnow().timestamp()
        logger.info(f"Bot en línea: {bot.user} ({bot.user.id})")
        logger.info(f"Servidores: {len(bot.guilds)}")
        try:
            synced = await bot.tree.sync()
            logger.info(f"Sincronizados {len(synced)} comandos slash")
        except Exception as e:
            logger.error(f"Error sincronizando comandos: {e}")

    @bot.event
    async def on_message(message):
        if message.author.bot:
            return
        if not message.guild:
            return
        if is_spamming(str(message.author.id), str(message.guild.id)):
            return
        xp_amount = random.randint(XP_PER_MESSAGE_MIN, XP_PER_MESSAGE_MAX)
        try:
            get_or_create_user(str(message.author.id), str(message.guild.id))
            await add_xp(str(message.author.id), str(message.guild.id), xp_amount, bot)
        except Exception as e:
            logger.error(f"XP error on message: {e}")

    @bot.event
    async def on_guild_join(guild):
        logger.info(f"Joined guild: {guild.name} ({guild.id})")
        try:
            from bot.helpers import get_or_create_guild_config
            get_or_create_guild_config(str(guild.id))
        except Exception as e:
            logger.error(f"Guild join setup error: {e}")

    @bot.event
    async def on_app_command_error(interaction: discord.Interaction, error):
        logger.error(f"App command error in {interaction.command}: {error}")
        from bot.embeds import error_embed
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=error_embed("Error", f"Ocurrió un error inesperado: {str(error)[:200]}"), ephemeral=True)
            else:
                await interaction.response.send_message(embed=error_embed("Error", f"Ocurrió un error inesperado: {str(error)[:200]}"), ephemeral=True)
        except Exception:
            pass
