# Port the Codi backend into codi-rebuild

Status: in progress · Owner decision 2026-11-02: option 2 (bring Codi's backend here, keep the rebuild UI), prototype scope, no new CI or tests.

## Outcome

codi-rebuild runs as `frontend/` (the current Vite app) and `backend/` (Codi's API on Hono), on the local Postgres in Docker. Every page reads and writes through the backend; the JSON `docs/kv` store and `server/` are removed.

## Approach

- Copy, do not rewrite. `backend/` vendors from `../Codi`: `packages/db`, `packages/auth`, `packages/coding-runner`, `apps/web/src/lib` (no tests), `apps/web/src/app/api/**/route.ts` and the `'use server'` action files, unchanged where possible.
- Tiny shims replace `next/server`, `next/headers`, `next/cache` (and `server-only`), so route files stay verbatim.
- Hono mounts every `route.ts` by its path (`[id]` → `:id`, `[...all]` → `*`). Server actions are exposed as `POST /api/actions/<module>/<export>` with a JSON array of arguments.
- Env: plain `process.env` with local defaults instead of varlock. Database `codi` in the existing container (port 5544), never Codi's Supabase. Secrets stay in a gitignored `backend/.env`.
- Data: Codi migrations, then `seed-mockup` fed from the rebuild's seed (including its patches: Pexels covers, avatars, JS content).
- Frontend: one small API client (`fetch` with cookies) and a `useApi` hook; each feature area switches from `Codi.db()` / `Codi.set()` to backend calls. UI and design stay as they are.

## Phases

1. Foundation: split into `frontend/` + `backend/`, shims, router, env, migrations, seed, auth (login/logout/me) wired in the frontend shell, e2e login helper.
2. Feature areas, in parallel by folder ownership: commerce; learning + coding; lecturer + lecturer-ai; admin; shell remainder (profile, settings, password, notifications, GitHub).
3. Integration: remove `server/` and the legacy store paths, update docs/getting-started, run smoke/flow/axe/mobile.

Each phase and each feature area is its own commit (or a few), revertable on its own.

## Acceptance

- `npm start` at the root starts Postgres-backed backend on :4100 and the web on :5190.
- Real sign-in with the seeded accounts; role checks are enforced by the backend.
- Purchase flow creates an order, payment is confirmed server-side (SePay callback simulated in dev), enrolment appears.
- smoke (no FAIL), flow, axe (no violations), mobile (no overflow) pass.
- No secrets committed.

## Backup

`../.codi-gc-preserved/db-backups/codi_rebuild-261102-1840.dump` (pg_dump -Fc of the old `codi_rebuild` database, taken before any change).
