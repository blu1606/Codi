# Codi rebuild — getting started

React (Vite) redesign of the Codi prototype (`frontend/`) on Codi's own backend (`backend/`, the Next.js API
ported to Hono), with PostgreSQL in Docker. Every page reads and writes through the backend.

## Requirements

Node 22+, Docker Desktop.

## Run

```bash
npm install                    # one install for every workspace (root, frontend, backend)
npm run db:up                  # Postgres 16 on localhost:5544 (container codi-rebuild-postgres)
cp backend/.env.example backend/.env   # optional: every key has a local default
npm run seed                   # create/reset database `codi` with the demo data (backs up first)
npm start                      # API on :4100 + web on http://localhost:3001
```

Open http://localhost:3001. Vite proxies `/api` to the backend, so the browser sees one origin.

## Demo accounts

Every seeded account signs in with the password **`Codi@12345`** (`SEED_ACCOUNT_PASSWORD` in `backend/.env`
overrides it; reseed after changing it).

| Role | Email |
|---|---|
| Học viên | `minhanh@codi.vn` |
| Giảng viên | `quochuy@codi.vn` |
| Quản trị viên | `giabao@codi.vn` |
| Tài khoản bị vô hiệu hoá | `kimoanh@codi.vn` |

The "Kịch bản thử nghiệm" drawer (Alt+K) switches role by signing in as these accounts for real and forces demo
states (payment outcome, AI failures, knowledge-map analysis). Its choices stay in this browser only. To reset the
data, stop `npm start` and run `npm run seed`.

## Payments in development

Checkout creates a real order and a VietQR transfer code (`CODIxxxxx`). No bank is connected locally, so the
checkout page posts a simulated SePay transfer to `POST /api/dev/simulate-payment` a few seconds after it opens;
the backend runs the real SePay webhook handler with the local secret, marks the order paid and enrols the learner.
Alt+K "Kết quả thanh toán" picks the outcome (success, underpaid, overpaid, expired, late, no transfer). The dev
route answers 404 when `NODE_ENV=production`.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Backend (`tsx watch`, restarts on change) and Vite together |
| `npm run seed` | Backs up a non-empty `codi` database to `../.codi-gc-preserved/db-backups/`, resets it, migrates and reseeds |
| `npm run migrate` | Applies Codi's Drizzle migrations to `DATABASE_URL` |
| `npm run build` | Production build of the frontend |
| `npm run db:down` | Stop the Postgres container (data volume `codi_rebuild_pg` is kept) |
| `npm run typecheck -w backend` | Type-check the backend |

## Configuration and keys

`backend/.env` (gitignored; keys in `backend/.env.example`). Defaults: `DATABASE_URL=postgresql://codi:codi@localhost:5544/codi`,
`BETTER_AUTH_URL=http://localhost:3001` (the browser origin). The backend refuses a Supabase `DATABASE_URL`.

The web runs on port 3001 on purpose: Codi's Google and GitHub OAuth apps are registered for
`http://localhost:3001`, so copying Codi's keys makes social sign-in work without touching the provider consoles.
For the same reason Codi's own dev server (also 3001) cannot run at the same time. With Codi's `RESEND_API_KEY`
and `R2_*` keys, codes are real emails and uploads go to Codi's real R2 buckets.

| Feature | Needs | Without it |
|---|---|---|
| Email codes (register, change email, reset password) | `RESEND_API_KEY`, `EMAIL_FROM` | The code is printed to the backend console: `[Auth OTP for <email>]: 123456` |
| AI tutor, course advisor, AI quiz questions | `GOOGLE_GENERATIVE_AI_API_KEY` (or `AI_PROVIDER=openai` + `OPENAI_API_KEY`) | The screens show the backend's "AI không khả dụng" error |
| Checkout | `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER` | Paid checkout answers 503 |
| Avatar and assignment file uploads | Cloudflare `R2_*` | Uploads fail with the server's error |
| Google sign-in | `GOOGLE_CLIENT_ID/SECRET` with `http://localhost:3001/api/auth/callback/google` allowed on the OAuth client | Google shows a redirect error |
| GitHub sign-in and "Hồ sơ năng lực" | `GITHUB_CLIENT_ID/SECRET` with callback `http://localhost:3001/api/auth/callback/github`; the analysis also needs `OPENAI_API_KEY` and the `GITHUB_PROFILE_BUDGET_*` keys | Linking or analysis shows GitHub's or the backend's error |

## How it is built

- `backend/src/app/api/**/route.ts` — Codi's route handlers, plus a few rebuild routes (admin lists, lecturer
  authoring, dev payment). `src/host/next-routes.ts` mounts each on Hono by folder path (`[id]` → `:id`).
- `backend/src/app/dashboard/**/actions.ts` — Codi's server actions, unchanged, callable as
  `POST /api/actions/<module>/<export>` with a JSON array of arguments (`src/host/server-actions.ts`).
- `backend/src/lib`, `backend/packages/{db,auth,coding-runner}` — Codi's services and packages.
- `backend/shims/next` — minimal `next/server`, `next/headers`, `next/cache` over an AsyncLocalStorage request context.
- `backend/scripts/seed-source/` — the prototype seed (`data.js` + `patches/*.js`); `npm run seed` feeds it to Codi's
  `seed-mockup.ts`, then adds avatars, covers and JSON assignment rubrics.
- `frontend/src/lib/api.js` — fetch client (cookies, JSON, server error messages); `use-api.js` — `useApi(url)` hook.
- `frontend/src/lib/codi.js` — the signed-in session, navigation, UI helpers and browser-only scenario state.

Porting conventions: [porting-guide.md](porting-guide.md). Behaviour that differs from the mockup:
[deviations-from-mockup.md](deviations-from-mockup.md).
