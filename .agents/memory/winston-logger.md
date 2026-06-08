---
name: Winston logger API
description: Winston argument order is (message, meta) — opposite of pino. Affects all structured logging calls.
---

Winston's `.info()`, `.error()`, `.warn()`, `.debug()` take `(message: string, meta?: object)`.

**Why:** The bot uses winston (not pino). Code copied from pino-style patterns will fail TS type checks because pino uses `(meta, message)` while winston uses `(message, meta)`.

**How to apply:** Any logger call in `artifacts/bot/src/` must be:
```ts
logger.info("Something happened", { key: value });
logger.error("Command failed", { err, commandName });
```
NOT:
```ts
logger.info({ err }, "message"); // WRONG for winston
```
