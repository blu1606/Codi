# Performance, security and release-safety tests: first run

Date 2026-11-03. Source: Codi `origin/fix/loadtest-cleanup` (k6, Lighthouse, seed) and `develop` (auth unit tests,
CI security job), adapted to the rebuild. How to run everything: [performance-testing.md](../../docs/performance-testing.md),
[security-testing.md](../../docs/security-testing.md), [deployment.md](../../docs/deployment.md).

## Results

| Check | Target | Result |
|---|---|---|
| Unit tests (`npm test`) | in-memory | 86/86 pass |
| Playwright fast check + role guards | local perf stack | 15/15 pass (desktop + mobile) |
| Playwright fast check | production, read-only | 8/8 pass |
| `fastcheck.sh` | local and production | all pass |
| Security probe | local, full | 34 pass, 5 warn, 0 fail |
| Security probe | production, passive | 22 pass, 6 warn, 0 fail |
| `security:check` | working tree | **1 fail: `better-auth` critical advisories** |
| k6 smoke | local, 1 VU | pass |
| k6 browse | local, 100 VUs | p95 20 ms, 0 errors, pass |
| k6 learner journey | local, 50 VUs | 0 errors, reads p95 503 ms (budget 500), writes p95 720 ms |
| k6 stress | local, up to 150 VUs | 0 errors; reads p95 1.97 s, writes p95 2.6 s |
| Lighthouse (mobile) | local | Performance 0.55-0.56, FCP ~9.6 s, LCP 11-12.5 s, TBT < 110 ms |
| release.sh / rollback.sh | simulated VPS (same container names, docker-cli) | good release, broken release auto-rolled back, rollback toggle, `--restore-db` |

k6 and Lighthouse ran on a laptop against the production image capped at 1 GB, so they are a baseline for comparing
builds, not the VPS capacity.

## Findings, by priority

1. **`better-auth` 1.7.5: critical** (GHSA-r4xp-prcw-77qf, GHSA-965c-763c-88jm, OAuth sign-in as another user). Fixed
   in 1.7.15, but the root `overrides` pin 1.7.5 with `@better-auth/core`/`utils`/`better-call`; not changed here.
2. **Production still has the demo payment simulator on**: `POST /api/dev/simulate-payment` answers 401 (route live)
   on codi.hoangblue.dev, although commit 94fc405 documents `DEMO_TOOLS=false`. Either that commit is not deployed or
   `/opt/codi-rebuild/rebuild.env` still has `DEMO_TOOLS=true`.
3. **The 1.27 MB JavaScript bundle is served uncompressed and without Cache-Control** (production and local). Main
   cause of the ~9.6 s mobile FCP. One-line fix in Caddy: `encode zstd gzip`; longer term, route-level code splitting.
4. **No security headers** in production (HSTS, nosniff, X-Frame-Options, Referrer-Policy, CSP). Caddy `header` block
   suggested in security-testing.md.
5. **Lesson APIs dominate latency**: at 50 VUs `study` median 584 ms, lesson read 439 ms, versus catalogue 67 ms. At
   150 VUs they reach 1-1.3 s median. Worth profiling the lesson-player service queries.

Not defects: the X-Forwarded-For spoof WARN on a proxy-less target (Caddy replaces the header); `next` audit hits (it
is the local shim).

## Test fixes made while porting

- Two OTP tests now assert the rebuild's deliberate behaviour (code logged when Resend is not configured).
- k6: per-endpoint p95 and failed-check names in the summary; quiz skipped once an account's attempt is graded
  (previously 409s); `SIMULATE_CLIENT_IPS=1` for local runs; production hosts refused.
- Load-test seed: refuses non-local databases; use `--course javascript-nen-tang` (the default course's first lesson
  has no content, so `study` answers 409).
- `release.sh` keeps `PREVIOUS_RELEASE` pointing at the last good build after an automatic rollback.

## Unresolved questions

- Upgrade `better-auth` to 1.7.15 (with its pinned siblings) now?
- Apply the Caddy `encode` and `header` block on the VPS?
- Is `DEMO_TOOLS=true` on production intended for now?

## Fixes applied (2026-11-03, 22:50-23:30)

| Finding | Fix | Verified |
|---|---|---|
| `better-auth` critical | 1.7.15 with `@better-auth/core` 1.7.15, `utils` 0.5.1, `better-call` 1.4.4 (overrides, backend, auth package; adapter also declared in `backend` so npm installs it) | `security:check` passes; unit tests pass; the banned-account password test now asserts the 1.7.15 transactional rollback |
| `@hono/node-server` serveStatic double decode | 2.1.6 | typecheck, image build, fastcheck, Playwright |
| No compression / caching | Hono `compress` on the frontend only (API untouched so tutor streaming keeps working); `/assets/*` immutable for a year, pages `no-cache` | JS 1.27 MB -> 0.37 MB on the wire; fastcheck now fails without it |
| No security headers | Hono `secureHeaders`: HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, same-origin COOP/CORP | probe: 37 pass, 2 warn (CSP, proxy-less XFF); 15/15 Playwright incl. signed-in fast check |
| Open redirect (react-router 6 backslash) | `safeNext` refuses `/\`, `//` and control characters; it guards every `?next=` sink | 10 payload cases |
| `DEMO_TOOLS=true` on production | `release.sh` enforces `DEMO_TOOLS=false` in `rebuild.env` each release | script syntax; takes effect at the next release |
| node:test files broke `vitest run` | `vitest.config.ts` skips files importing `node:test`; `npm test` then runs them with `scripts/run-node-tests.mjs` | 92 Vitest + 9 node:test pass |

Lesson API latency: profiled, not changed. 29 statements per lesson read and 43 per `study`, CPU-bound at one core
for 50 learners; the code is vendored from Codi, so the fix is proposed upstream (performance-testing.md).

Not done here: nothing was deployed. This machine has no SSH key for the VPS (password login only); production gets
the fixes with the next `release.sh`.
