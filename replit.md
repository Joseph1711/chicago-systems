# Chicago Systems

A full enterprise Discord roleplay bot for the Chicago Systems RP community. All administration and gameplay happens exclusively through Discord slash commands, buttons, select menus, and modals — no web interface.

## Run & Operate

- `pnpm --filter @workspace/bot run dev` — run the bot in development (tsx watch)
- `pnpm --filter @workspace/bot run deploy-commands` — deploy slash commands to Discord
- `pnpm --filter @workspace/bot run build` — production esbuild bundle
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: Discord.js v14, tsx (dev), esbuild (prod)
- DB: PostgreSQL + Drizzle ORM
- Scheduling: node-cron
- Logging: winston
- Validation: Zod

## Where things live

- `artifacts/bot/src/commands/` — all slash commands, organized by category
- `artifacts/bot/src/events/` — Discord client event handlers (ready, interactionCreate, messageCreate)
- `artifacts/bot/src/handlers/` — command + interaction (button/modal/selectmenu) dispatch
- `artifacts/bot/src/services/` — business logic (economy, levels, inventory)
- `artifacts/bot/src/jobs/` — cron jobs (investments, salaries, auctions, black market rotation)
- `artifacts/bot/src/middleware/` — anti-spam rate limiter
- `lib/db/src/schema/` — all 16 Drizzle schema files

## Database Schema (16 tables groups)

- `users` — player profiles, cash, bank, XP, level, reputation
- `economy` — transactions log, custom jobs, tax config
- `inventory` / `items` — per-user item ownership
- `marketplace` — direct sale listings, auctions, ratings
- `bank` — savings accounts, investments, loans, treasury
- `departments` — CPD/CFD/Sheriff/ISP/DOT/DOJ/EMA + members + inventory + audit log
- `fleets` — department vehicle fleet types and vehicles
- `properties` — buyable/rentable properties
- `companies` — player-owned businesses + employees + inventory
- `verification` — config and log for account gating
- `tickets` — support ticket system + config
- `applications` — department/staff application submissions + config
- `blackmarket` — rotating stock + transactions
- `contracts` — public/private/bounty contracts
- `roles` — auto-roles, temp roles, level rewards
- `config` — per-guild server configuration

## Slash Commands (en español)

| Categoría | Comandos |
|-----------|----------|
| Economía | `/balance`, `/diario`, `/semanal`, `/trabajar`, `/pagar`, `/tabla` |
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
| Solicitudes | `/solicitar` (CPD/CFD/Sheriff/DOT/Staff) |
| Contratos | `/contrato lista/crear/aceptar/completar` |
| Admin | `/admin economia/objetos/departamento/propiedad/configuracion`, `/tesoro`, `/adminshop` |
| Ayuda | `/ayuda [categoria]` |

## Cron Jobs

- Every 2 min — expire auctions, pay out winners
- Every 5 min — remove expired temporary roles
- Every 10 min — process mature investments
- Every 6 hrs — rotate black market stock
- Daily midnight — pay department + company salaries
- Daily 6am — apply savings account interest

## Architecture decisions

- All guild data is fully isolated by `guild_id` — one bot instance serves multiple servers
- Commands are loaded dynamically from `src/commands/*/*.ts` — add a file to add a command
- Button/modal/select handlers use a registry pattern with `registerButton/registerModal` — handlers can be co-located with their commands
- Economy is entirely cash+bank; no separate "wallet" concept
- Black market stock rotates server-side on a cron; no user-facing rotation trigger needed

## Product

Chicago Systems delivers a complete RP economy simulation: earn income through jobs/salaries, bank and invest money, own properties, run businesses, serve in government departments, trade in the marketplace, and apply to join factions — all inside Discord.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/bot run deploy-commands` after adding new commands — they won't appear in Discord until registered
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/bot run typecheck` when schema changes are made
- `setDefaultMemberPermissions` is only valid on the top-level `SlashCommandBuilder`, not on subcommand builders
- Winston structured logging: pass message string first, then meta object second (opposite of pino)
- Discord.js v14: `message.channel` can be partial/DM, always check `isTextBased()` before calling `.send()`
