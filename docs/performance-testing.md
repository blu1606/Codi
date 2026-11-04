# Performance testing: k6 and Lighthouse

Two layers, ported from Codi's `ci/perf-lighthouse-k6` branch (with the fixes of `fix/loadtest-cleanup`) and
adapted to the rebuild's Docker deployment:

- **k6** load tests the API along the learner journey (sign in, catalogue, course, learning path, lesson, save
  progress, optionally a quiz) and anonymous browsing.
- **Lighthouse** measures page load (Performance score, LCP, TBT, JavaScript size) of the built frontend.

Both run against the **local perf stack** ([deploy/compose.perf.yml](../deploy/compose.perf.yml)): the production
image with its own throwaway database on this machine.

## Safety rules

1. **Never load-test the VPS.** It serves real users and runs its database on the same machine. The k6 scripts refuse
   `codi.hoangblue.dev`, `codi.ddnsfree.com` and `172.93.209.12`, and need `BASE_URL` plus `I_UNDERSTAND_TARGET=1`.
2. **Test accounts only in a local database.** `seed:loadtest` refuses any `DATABASE_URL` host other than
   `localhost`, `127.0.0.1`, `::1` or `host.docker.internal`, and refuses `NODE_ENV=production`.
3. **No AI, payment, GitHub or discussion routes.** [perf/k6/lib/http.js](../perf/k6/lib/http.js) throws before
   calling them. The perf stack also turns off the AI worker, `DEMO_TOOLS` and Resend.
4. **Credentials stay out of git.** The CSV is written to `~/.codi-loadtest/accounts.csv`; `.gitignore` blocks
   `perf/k6/**/*.csv`, `perf/k6/results/` and `.lighthouseci/`.

## 1. Start the perf stack

```bash
npm run image -- perf
docker compose -f deploy/compose.perf.yml up -d db
docker compose -f deploy/compose.perf.yml run --rm --no-deps -e NODE_ENV=development app npx tsx scripts/seed.ts --no-backup
docker compose -f deploy/compose.perf.yml up -d app
npm run fastcheck -- http://localhost:3101 perf          # app answers on :3101, database on :5545
```

It reads optional keys from `backend/.env` and overrides the database, URL, port, AI worker, demo tools and email.
Ports 3101/5545 do not clash with `npm start` (3001/4100) or the dev database (5544).

## 2. Seed the load-test accounts

```bash
cd backend
DATABASE_URL=postgresql://codi:codi@localhost:5545/codi npm run seed:loadtest -- --count 100 --course javascript-nen-tang
```

- Creates `loadtest+001@codi.test` … enrolled in the course, and writes `~/.codi-loadtest/accounts.csv`. Passwords
  change on every run, so always use the fresh CSV.
- **Pick a course whose lessons have content.** Saving progress (`study`) answers 409 for a lesson without a body or
  material. In the demo seed `javascript-nen-tang` has content in all 11 lessons; `react-du-an-thuc-te` (the default
  when `--course` is omitted) has it in only 3 of 13 and its first lesson is empty, so the journey fails.
- Remove them with `npm run seed:loadtest -- --cleanup` (same `DATABASE_URL`).

## 3. Run k6

Install k6 (`winget install k6`). Common options:

```bash
K="-e BASE_URL=http://localhost:3101 -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=$HOME/.codi-loadtest/accounts.csv \
   -e COURSE_SLUG=javascript-nen-tang -e SIMULATE_CLIENT_IPS=1"
k6 run $K -e ENABLE_WRITES=1 perf/k6/smoke.js                               # 1 VU, run first
k6 run $K -e VUS=100 perf/k6/browse.js                                      # guests, ramp 2 min, hold 3 min
k6 run $K -e VUS=50 -e ENABLE_WRITES=1 perf/k6/learner-journey.js           # signed-in learners
k6 run $K -e VUS=300 perf/k6/stress.js                                      # +25 VUs a minute until it breaks
```

| Script | Load | Notes |
|---|---|---|
| `smoke.js` | 1 VU, one journey | also onboards the account (skip goal, default order) |
| `browse.js` | ramp to `VUS` (default 200) | anonymous: `/`, `/courses`, catalogue and course APIs |
| `learner-journey.js` | ramp to `VUS` (default 50) | `ENABLE_WRITES=1` adds a quiz attempt when the lesson has one |
| `stress.js` | +25 VUs per minute up to `VUS` (default 300) | aborts once more than 5% of requests fail: the last stage that held is the capacity |

Options: `VUS`, `DURATION`, `RAMP`, `ENABLE_WRITES=1`, `SUMMARY_DIR` (default `perf/k6/results`).

`SIMULATE_CLIENT_IPS=1` (local targets only) sends one `X-Forwarded-For` per VU. On the VPS, Caddy gives every
visitor their own address, so each has its own sign-in rate-limit bucket; without a proxy every VU shares one bucket
(3 sign-ins per 10 s) and the run measures the rate limiter instead of the app. The sign-in step still waits out a
429 when it happens.

Pass/fail thresholds: reads p95 < 500 ms, writes p95 < 1000 ms, failed requests < 1%, checks > 99%, every API
answer JSON. The run aborts itself above 5% failures. The summary lists any failed check by name; the full data is
in `perf/k6/results/summary.json`.

Numbers from a laptop are a comparison baseline between builds, not the VPS capacity: the VPS has its own CPU, the
same 1 GB app limit (set in both compose files) and Caddy in front.

## 4. Lighthouse

```bash
node scripts/lhci-resolve-course.mjs http://localhost:3101           # prints LHCI_COURSE_SLUG=<slug>
LHCI_BASE_URL=http://localhost:3101 LHCI_COURSE_SLUG=<slug> npm run perf:lighthouse
```

[lighthouserc.cjs](../lighthouserc.cjs): mobile profile, 3 runs per URL (`/`, `/courses`, a course, `/login`),
warn-only budgets: Performance ≥ 0.8, LCP ≤ 2.5 s, TBT ≤ 300 ms, JavaScript ≤ 300 KiB. Reports land in
`.lighthouseci/`. The frontend is a Vite SPA, so LCP includes client rendering; record the first run as the
baseline before turning any budget into an error.

Lighthouse is read-only, so it may also be pointed at production (`LHCI_BASE_URL=https://codi.hoangblue.dev`).

## Known results

- **Frontend transfer.** The app gzips the frontend and marks `/assets/*` (fingerprinted by Vite) as
  `Cache-Control: public, max-age=31536000, immutable`; other pages get `no-cache`. The main bundle goes over the wire
  as ~0.37 MB instead of 1.27 MB, and repeat visits do not download it again. `fastcheck.sh` fails if an asset comes
  back uncompressed or uncacheable. The bundle is still a single chunk: route-level code splitting is the next step
  for Lighthouse.
- **Lesson APIs are CPU-bound, and the cost is per statement.** A CPU profile shows ~40% of the app's time in fixed
  per-statement work (drizzle-orm query building 21%, `pg` ~8%, socket writes 10%) and ~2% in business logic, so
  capacity follows the number of SQL statements per request. Three changes cut a 70/30 mix from ≈623 to ≈420
  statements per 100 requests and raised the dev server's highest load meeting the SLO from 100 to 160 req/s (README;
  same-machine A/B in [perf/runs/2026-11-04-local-ab/](../perf/runs/2026-11-04-local-ab/)): a 30 s cache for the public
  catalogue and course detail
  ([public-course-cache.ts](../backend/src/lib/public-course-cache.ts), cleared by `revalidatePath` and course edits),
  one role lookup per request ([rbac.ts](../backend/packages/auth/src/rbac.ts), `withRoleCache` in the host), and
  lesson lists without every lesson's body. Still loaded twice per lesson read: enrollment, course, lessons and
  mastery (`loadLearningLessonAccess`, then the path read).

To count statements per request, set `ALTER SYSTEM SET log_statement = 'all'` on the perf database, reload, send one
request and count `LOG:  execute` lines in `docker logs codi-perf-db`; reset it afterwards.

## Capacity test on the dev server

[perf/k6/capacity.js](../perf/k6/capacity.js) is an open-model (arrival-rate) test with the real traffic mix (70%
browsing, 30% signed-in learners): it holds a load level, then raises the rate step by step until the 500 ms p95 SLO
breaks. It signs the learner accounts in during `setup()`, because the whole run comes from one IP and sign-in is
rate-limited per IP. Production hosts are refused unless `ALLOW_DEV_SERVER=<host>` names a dev server you own.
[perf/collect-server-stats.sh](../perf/collect-server-stats.sh) records the server's CPU, memory and database
connections alongside; [scripts/perf-archive.mjs](../scripts/perf-archive.mjs) copies a run into `perf/runs/` (session
cookies removed) and [scripts/perf-charts.mjs](../scripts/perf-charts.mjs) draws the README charts.

Results, the reasons behind each technique and the full command sequence are in the [README](../README.md#hiệu-năng);
the raw data of the 2026-11-04 runs is in [perf/runs/2026-11-04-dev-server/](../perf/runs/2026-11-04-dev-server/).

## 5. Clean up

```bash
cd backend && DATABASE_URL=postgresql://codi:codi@localhost:5545/codi npm run seed:loadtest -- --cleanup && cd ..
docker compose -f deploy/compose.perf.yml down -v       # removes the perf containers and their database
```
