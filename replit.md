# Chicago Systems

A full enterprise Discord roleplay bot for the Chicago Systems RP community. All administration and gameplay happens exclusively through Discord slash commands, buttons, select menus, and modals — no web interface.

## Run & Operate

- `python main.py` — run the bot
- `pip install -r requirements.txt` — install/update dependencies

## Stack

- Python 3.11
- Bot: discord.py 2.3.2
- DB: PostgreSQL + psycopg2-binary (raw SQL)
- Scheduling: APScheduler (AsyncIOScheduler)
- Keep-alive: Flask (HTTP dashboard on port 3000)

## Where things live

```
main.py              — entry point, loads cogs, starts scheduler + keep-alive
keep_alive.py        — Flask HTTP server (/, /status)
requirements.txt     — Python dependencies
bot/
  db.py              — psycopg2 connection + execute helpers
  helpers.py         — generate_id, format_currency, get_or_create_user, XP math
  embeds.py          — embed builders (success, error, warning, info, economy, etc.)
  events.py          — on_ready, on_message (XP + anti-spam), on_guild_join
  services/
    economy.py       — add/remove cash & bank, transfer, log_transaction
    inventory.py     — add_item, remove_item, get_user_inventory
    levels.py        — add_xp, apply_level_rewards
  jobs/
    cron.py          — 7 APScheduler jobs (investments, auctions, salaries, etc.)
  cogs/
    economy.py       — /balance /diario /semanal /trabajar /pagar /tabla /donar
    bank.py          — /banco /invertir
    inventory.py     — /inventario /dar
    marketplace.py   — /mercado /tienda /mercadonegro
    departments.py   — /departamento /flota
    companies.py     — /empresa
    properties.py    — /propiedad
    social.py        — /reputacion /nivel
    tickets.py       — /ticket (with button UI)
    verification.py  — /verificar (with modal UI)
    crimen.py        — /drogas /lavar /misiones
    admin.py         — /admin /adminshop /tesoro /solicitar /contrato
    help.py          — /ayuda (with select menu UI)
```

## Database Schema (16 table groups)

- `users` — player profiles, cash, bank, XP, level, reputation, dirty_money
- `transactions` — transaction log
- `jobs` — custom work jobs per guild
- `user_inventory` / `items` — per-user item ownership
- `marketplace_listings` / `auctions` — player marketplace
- `shop` — bot shop stock
- `black_market_stock` / `black_market_transactions` — rotating black market
- `savings_accounts` / `investments` / `loans` / `treasury` — bank system
- `departments` / `department_members` / `department_audit` — government depts
- `fleet_vehicle_types` / `fleet_vehicles` — department vehicles
- `companies` / `company_members` — player businesses
- `properties` / `property_transactions` — real estate
- `verification_config` / `verification_logs` — account gating
- `ticket_config` / `tickets` — support tickets
- `application_config` / `applications` — dept applications
- `contracts` — public/private bounty contracts
- `temp_roles` / `level_rewards` / `auto_roles` — role automation
- `guild_config` — per-guild server settings
- `drug_operations` / `money_laundering` / `criminal_missions` — crime system

## Slash Commands (en español)

| Categoría | Comandos |
|-----------|----------|
| Economía | `/balance`, `/diario`, `/semanal`, `/trabajar`, `/pagar`, `/tabla`, `/donar` |
| Banco | `/banco depositar/retirar/info/ahorros/prestamo/pagar`, `/invertir crear/portafolio` |
| Inventario | `/inventario`, `/dar` |
| Mercado | `/mercado lista/vender/comprar/subasta/pujar/cancelar` |
| Tienda | `/tienda explorar/comprar/info` |
| Mercado Negro | `/mercadonegro explorar/comprar` |
| Departamentos | `/departamento lista/info/unirse/contratar/despedir/presupuesto/miembros`, `/flota ver/comprar` |
| Propiedades | `/propiedad lista/comprar/vender/rentar/mias` |
| Empresas | `/empresa crear/info/contratar/despedir/miembros/depositar` |
| Verificación | `/verificar panel/estado` |
| Tickets | `/ticket panel/abrir/cerrar/lista` |
| Reputación | `/reputacion dar/perfil` |
| Niveles | `/nivel` |
| Solicitudes | `/solicitar aplicar/lista` |
| Contratos | `/contrato lista/crear/aceptar/completar` |
| Admin | `/admin economia/objetos/departamento/propiedad/configuracion`, `/tesoro`, `/adminshop` |
| Ayuda | `/ayuda [categoria]` |
| Crimen | `/drogas sembrar/cosechar/info`, `/lavar dinero/info`, `/misiones lista/iniciar/completar/activas` |

## Cron Jobs (APScheduler)

- Every 2 min — expire auctions, pay out winners
- Every 5 min — remove expired temporary roles
- Every 10 min — process mature investments
- Every hour — process vehicle repairs
- Every 6 hrs — rotate black market stock
- Daily midnight — pay department + company salaries
- Daily 6am — apply savings account interest

## Architecture decisions

- All guild data is fully isolated by `guild_id` — one bot instance serves multiple servers
- Cogs loaded dynamically in `main.py` — add an entry to `COGS` list to add a module
- Slash commands sync automatically on `on_ready` via `bot.tree.sync()`
- Economy is entirely cash+bank; no separate "wallet" concept
- Black market stock rotates server-side on a cron; no user-facing rotation trigger needed
- Raw SQL via psycopg2 with `RealDictCursor` — all rows returned as dicts
- Anti-spam: 5 messages per 5-second window per user per guild (in-memory)

## Product

Chicago Systems delivers a complete RP economy simulation: earn income through jobs/salaries, bank and invest money, own properties, run businesses, serve in government departments, trade in the marketplace, and apply to join factions — all inside Discord.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- discord.py slash commands sync on `on_ready` automatically — no separate deploy step needed
- APScheduler AsyncIOScheduler must be used (not BackgroundScheduler) in async bot context
- psycopg2 `RealDictCursor` returns `RealDictRow` objects — convert to `dict()` before mutating
- `app_commands.Group` nested inside a `Cog` works fine; nested sub-groups need `parent=` kwarg
- `interaction.response.is_done()` check needed before followup vs send_message calls
- Port 3000 is used by the Flask keep-alive server
