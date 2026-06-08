---
name: DB lib rebuild after schema changes
description: Must run typecheck:libs after adding new schema files or @workspace/db exports appear missing to leaf packages.
---

**Rule:** After adding new files to `lib/db/src/schema/` and re-exporting from `schema/index.ts`, run `pnpm run typecheck:libs` before running `pnpm --filter @workspace/bot run typecheck`.

**Why:** `@workspace/db` is a composite lib. Leaf packages (like `@workspace/bot`) resolve its types from the emitted `.d.ts` declarations, not the source. Stale declarations cause "Module has no exported member" errors even though the source exports are correct.

**How to apply:**
1. Add schema file + export in `schema/index.ts`
2. Run `pnpm run typecheck:libs` (rebuilds declarations)
3. Then run `pnpm --filter @workspace/bot run typecheck`
