# Codi rebuild — getting started

React (Vite) redesign of the Codi prototype (`frontend/`) on Codi's own backend (`backend/`, the Next.js API
ported to Hono), with PostgreSQL in Docker.

## Requirements

Node 22+, Docker Desktop.

## Run

```bash
npm install                    # one install for every workspace
npm run db:up                  # Postgres 16 on localhost:5544 (container codi-rebuild-postgres)
cp backend/.env.example backend/.env   # optional: every key has a local default
npm run seed                   # create/reset database `codi` with the demo data
npm start                      # API on :4100 + web on http://localhost:5190
```

## Demo accounts

Every seeded account signs in with the password **`Codi@12345`** (`SEED_ACCOUNT_PASSWORD` in `backend/.env`
overrides it; reseed after changing it).

| Role | Email |
|---|---|
| Học viên | `minhanh@codi.vn` |
| Giảng viên | `quochuy@codi.vn` |
| Quản trị viên | `giabao@codi.vn` |
| Tài khoản bị vô hiệu hoá | `kimoanh@codi.vn` |

The "Kịch bản thử nghiệm" drawer (Alt+K) switches role by signing in as these accounts for real.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Backend (`tsx watch`, restarts on change) and Vite together |
| `npm run seed` | Backs up a non-empty `codi` database to `../.codi-gc-preserved/db-backups/`, resets it, migrates and reseeds |
| `npm run migrate` | Applies Codi's Drizzle migrations to `DATABASE_URL` |
| `npm run build` | Production build of the frontend |
| `npm run db:down` | Stop the Postgres container (data volume `codi_rebuild_pg` is kept) |
| `npm run typecheck -w backend` | Type-check the backend |

## Configuration

`backend/.env` (gitignored; keys in `backend/.env.example`). Defaults: `DATABASE_URL=postgresql://codi:codi@localhost:5544/codi`,
`BETTER_AUTH_URL=http://localhost:5190` (the browser origin; Vite proxies `/api`, so auth is same-origin).
AI, SePay, OAuth, R2 and Resend keys are optional; without a Resend key, email OTP codes are printed to the
backend console. The backend refuses a Supabase `DATABASE_URL`.

## How it is built

- `backend/src/app/api/**/route.ts` — Codi's route handlers, unchanged. `src/host/next-routes.ts` mounts each on
  Hono by folder path (`[id]` → `:id`, `[...all]` → `*`).
- `backend/src/app/dashboard/**/actions.ts` — Codi's server actions, unchanged, callable as
  `POST /api/actions/<module>/<export>` with a JSON array of arguments (`src/host/server-actions.ts`).
- `backend/src/lib`, `backend/packages/{db,auth,coding-runner}` — Codi's services and packages.
- `backend/shims/next` — minimal `next/server`, `next/headers`, `next/cache` over an AsyncLocalStorage request context.
- `backend/scripts/seed-source/` — the prototype seed (`data.js` + `patches/*.js`); `npm run seed` feeds it to Codi's
  `seed-mockup.ts`.
- `frontend/src/lib/api.js` — fetch client (cookies, JSON, server error messages); `use-api.js` — `useApi(url)` hook.
- `frontend/src/lib/codi.js` — the prototype store. The signed-in user comes from the backend session; pages not yet
  moved to the API still read and write the transitional JSON store (`backend/legacy/`, database `codi_rebuild`,
  `GET /api/snapshot`, `POST /api/sync`, `POST /api/reset`).

Porting conventions: [porting-guide.md](porting-guide.md).
