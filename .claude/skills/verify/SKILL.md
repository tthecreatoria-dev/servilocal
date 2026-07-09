---
name: verify
description: How to verify ServiLocal changes end-to-end by driving the running app with Playwright
---

# Verifying ServiLocal end-to-end

## Handle

- Dev server: `npm run dev` on port 3000. Check first — the user usually has it
  running already (`lsof -i :3000 -sTCP:LISTEN`); if its cwd is this repo, reuse it
  (it hot-reloads the current branch).
- DB: local Postgres (`nc -z localhost 5432`). Seed users (`prisma/seed.ts`), all
  password `test1234`: `client@test.com` (CLIENT), `pedro@test.com` (PROVIDER,
  slug `pedro-garcia`, has services), `maria@`/`roberto@`/`ana@test.com`.
- Browser: Playwright is NOT a repo dependency. Install it in the session
  scratchpad (`npm init -y && npm i playwright && npx playwright install
  chromium-headless-shell`) and run scripts from there.
- Direct DB access for setup/cleanup: import the generated client with the
  `PrismaPg` adapter (plain `new PrismaClient()` throws — `src/lib/db.ts` pattern):
  ```ts
  import { PrismaClient } from '<repo>/src/generated/prisma/client.js'
  import { PrismaPg } from '<repo>/node_modules/@prisma/adapter-pg/dist/index.mjs'
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  ```
  Run with `set -a && source .env && set +a && npx tsx script.ts`. tsx `-e` fails
  on top-level await — use an async `main()`.

## Drive

- Login: `/login`, fill `#email` / `#password`, click `button[type="submit"]`,
  `waitForURL(/dashboard|\/$/)`.
- Flows worth driving: header username button → `/dashboard/profile`; provider
  services CRUD in the "Mis servicios" section; public profile
  `/providers/pedro-garcia` (only `isActive` services show); dashboard tabs;
  `/dashboard/applications` (empty state for pedro — he has 0 seeded applications).

## Gotchas

- **Duplicate button text**: `/dashboard/profile` has TWO "Guardar cambios"
  buttons (profile form + services form). Scope selectors:
  `section:has(h2:has-text("Mis servicios")) button:has-text("...")`.
- **Controlled inputs**: `el.value = x` via `$eval` does NOT update React state.
  Use the native setter + `dispatchEvent(new Event('input', { bubbles: true }))`.
- **No fixed sleeps**: dev-mode `router.refresh()` recompiles; wait on content
  (`row.locator('text=$40.00').waitFor()`), not `waitForTimeout`.
- **Cleanup**: E2E-created rows persist in the dev DB. Prefix test titles
  (e.g. `E2E Prueba …`) and `deleteMany({ where: { title: { startsWith: 'E2E Prueba' } } })`
  before and after runs.
