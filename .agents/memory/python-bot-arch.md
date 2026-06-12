---
name: Python bot architecture
description: discord.py + APScheduler + psycopg2 setup for Chicago Systems bot — key patterns and gotchas.
---

## Stack
- discord.py 2.3.2 — slash commands via `app_commands`, grouped with `app_commands.Group` inside `commands.Cog`
- APScheduler `AsyncIOScheduler` — must use async scheduler (not BackgroundScheduler) inside an async discord.py bot
- psycopg2-binary with `RealDictCursor` — all rows returned as dict-like objects; convert to `dict()` before mutating
- Flask keep-alive on port 3000 (daemon thread)

## Key patterns
- Cogs listed in `COGS` array in `main.py`; add entry to add a module
- Slash commands sync automatically on `on_ready` via `bot.tree.sync()` — no separate deploy step
- `app_commands.Group` nested sub-groups need `parent=` kwarg on the inner Group
- Cooldowns: short spam cooldowns (5–10s) use in-memory dict (reset on restart); daily/weekly use DB timestamps (last_daily, last_weekly, last_work cols on users table)
- SQL placeholders: db.py uses a `$n` → `%s` translator so all queries can be written with `$1/$2` style even though psycopg2 requires `%s`

## Why
Bot was migrated from TypeScript/discord.js to Python in June 2026. The PostgreSQL schema already existed (pushed via drizzle-kit); Python connects via psycopg2 raw SQL.

## How to apply
When adding new commands: create a cog file in `bot/cogs/`, add to `COGS` in `main.py`. No separate command registration step.
When adding cron jobs: add a `@scheduler.scheduled_job(...)` decorated async function in `bot/jobs/cron.py`.
