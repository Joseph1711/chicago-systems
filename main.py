import os
import asyncio
import logging
import discord
from discord.ext import commands

from keep_alive import keep_alive, set_bot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("bot")

COGS = [
    "bot.cogs.economy",
    "bot.cogs.bank",
    "bot.cogs.inventory",
    "bot.cogs.marketplace",
    "bot.cogs.departments",
    "bot.cogs.companies",
    "bot.cogs.properties",
    "bot.cogs.social",
    "bot.cogs.tickets",
    "bot.cogs.verification",
    "bot.cogs.crimen",
    "bot.cogs.admin",
    "bot.cogs.help",
]

class ChicagoBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True
        super().__init__(
            command_prefix="!",
            intents=intents,
            help_command=None,
        )
        self.start_time = None

    async def setup_hook(self):
        for cog in COGS:
            try:
                await self.load_extension(cog)
                logger.info(f"Loaded cog: {cog}")
            except Exception as e:
                logger.error(f"Failed to load cog {cog}: {e}")

async def main():
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        logger.error("DISCORD_TOKEN not set in environment")
        return

    try:
        from scripts.init_db import init_db
        init_db()
    except Exception as e:
        logger.warning(f"DB init warning: {e}")

    bot = ChicagoBot()

    from bot.events import setup_events
    setup_events(bot)

    from bot.jobs.cron import setup_jobs
    setup_jobs(bot)

    set_bot(bot)
    keep_alive()

    async with bot:
        await bot.start(token)

if __name__ == "__main__":
    asyncio.run(main())
