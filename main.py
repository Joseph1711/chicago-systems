import os
import re
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


def _log_startup_diagnostics():
    logger.info("=" * 50)
    logger.info("  CHICAGO SYSTEMS — DIAGNÓSTICO DE ARRANQUE")
    logger.info("=" * 50)

    db_url = os.environ.get("DATABASE_URL", "")
    discord_token = os.environ.get("DISCORD_TOKEN", "")

    if db_url:
        masked = re.sub(r'(:)([^:@/]+)(@)', r'\1***\3', db_url)
        if "sslmode=" in db_url:
            m = re.search(r'sslmode=(\w+)', db_url)
            ssl_note = f"sslmode={m.group(1) if m else '?'} (en URL)"
        elif any(h in db_url for h in ("localhost", "127.0.0.1")):
            ssl_note = "sin SSL (host local)"
        else:
            ssl_note = "sslmode=require (añadido automáticamente)"
        logger.info(f"[ENV] DATABASE_URL   : ✅ detectada — {masked}")
        logger.info(f"[ENV] SSL             : {ssl_note}")
    else:
        logger.error("[ENV] DATABASE_URL   : ❌ NO CONFIGURADA — el bot no podrá acceder a la base de datos")
        logger.error("[ENV] → Agrégala en Secrets de Replit con el nombre exacto: DATABASE_URL")

    if discord_token:
        logger.info(f"[ENV] DISCORD_TOKEN  : ✅ detectado ({len(discord_token)} chars)")
    else:
        logger.error("[ENV] DISCORD_TOKEN  : ❌ NO CONFIGURADO")

    logger.info(f"[ENV] Variables cargadas por proceso: {len(os.environ)} vars de entorno visibles")
    logger.info("=" * 50)

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
    _log_startup_diagnostics()

    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        logger.error("DISCORD_TOKEN not set in environment")
        return

    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        logger.error("DATABASE_URL no configurada — abortando. Agrégala en Secrets de Replit.")
        return

    from bot.db import check_connection
    db_check = check_connection()
    if db_check["ok"]:
        logger.info(f"[DB] Conexión verificada ✅ — URL: {db_check['masked_url']} | SSL: {db_check['ssl']}")
    else:
        logger.error(f"[DB] Conexión fallida ❌ — {db_check['error']}")
        logger.error("[DB] El bot no puede arrancar sin base de datos.")
        return

    try:
        from scripts.init_db import init_db
        init_db()
    except Exception as e:
        logger.error(f"[DB] Error inicializando tablas: {e}")
        return

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
