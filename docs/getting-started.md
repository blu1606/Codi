# Codi rebuild — getting started

React (Vite) port of the Codi clickable prototype (`../Codi/docs/mockup`), backed by PostgreSQL in Docker.

## Requirements

Node 20+, Docker Desktop.

## Run

```bash
npm install
npm run db:up      # Postgres 16 on localhost:5544 (container codi-rebuild-postgres)
npm run start      # API on :4100 + web on http://localhost:5190
```

The API seeds an empty database automatically from `backend/scripts/seed-source/data.js` (a copy of the mockup seed).
`npm run seed` reseeds by hand; the in-app "Kịch bản thử nghiệm" drawer (Alt+K) has "Đặt lại dữ liệu" and a role switch.

| Script | What it does |
|---|---|
| `npm run dev` | Vite only (proxies `/api` to :4100) |
| `npm run server` | API only, restarts on change |
| `npm run seed` | Drop and rebuild both tables from the seed |
| `npm run db:down` | Stop the Postgres container (data volume `codi_rebuild_pg` is kept) |

Override the connection with `DATABASE_URL` (see `.env.example`).

## How it is built

- `server/` — Express + `pg`. Two tables: `docs(collection, id, data jsonb)` for id-keyed collections and
  `kv(key, value jsonb)` for the rest and per-feature state slices. Endpoints: `GET /api/snapshot`,
  `POST /api/sync`, `POST /api/reset`, `GET /api/health`.
- `src/lib/codi.js` — the client store, a port of the mockup runtime (`window.Codi`): synchronous selectors and
  in-place mutations via `Codi.set`, diffed per entity and synced to the API.
- `src/components/ui/` — shared primitives and overlays (toast, confirm, modal, sheet).
- `src/features/<feature>/` — one folder per mockup module group, each with its own `routes.jsx`.
- `src/styles/` — the mockup CSS, unchanged (design tokens are binding).

Porting conventions: [porting-guide.md](porting-guide.md).
