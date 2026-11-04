# Security testing

Four layers. Codi itself has the first two (a CI grep job and auth unit tests); the rebuild adds a black-box probe and
browser role-guard tests because its frontend and host differ from Codi.

| Layer | Command | Target | Writes data? |
|---|---|---|---|
| Static checks | `npm run security:check` | the working tree | no |
| Unit tests | `npm test` | auth, RBAC, ownership, upload tickets | no (in-memory) |
| Probe | `npm run security:probe -- <url>` | a running app | active part signs in seeded accounts |
| Browser role guards | `npm run test:e2e` | a running app | signs in seeded accounts |

## Static checks

[scripts/security-check.sh](../scripts/security-check.sh) (Git Bash works):

1. hardcoded secrets in files git tracks or would track: `KEY=<12+ chars>` for the rebuild's secret variables, and
   token shapes (OpenAI `sk-`, Google `AIza`, GitHub `ghp_`/`github_pat_`, Resend `re_`, private keys);
2. secret-bearing files in git (`.env`, `rebuild.env`, `*.dump`, `data.sql`, load-test CSVs);
3. `npm audit --omit=dev --audit-level=high`.

Codi's other CI check (no `@vercel/` imports) does not apply: the rebuild does not run on Vercel.

## Unit tests

`npm test` runs Vitest over `backend/src/**/*.test.ts` and `backend/packages/*/src/**/*.test.ts`. The security tests
come from Codi `develop` unchanged except where the rebuild deliberately differs:

- `backend/packages/auth/src/`: `auth-origin` (trusted origins), `rbac`, `roles`, `change-email` and
  `account-password-recovery` (OTP flows, session revocation, occupied addresses). Without a Resend key the rebuild
  logs OTP codes instead of failing, so those two cases assert the logged code (marked `codi-rebuild:`).
- `backend/src/lib/`: `course-ownership`, `course-ownership-server`, `lecturer-auth`, `assessment-upload-ticket`.
- `backend/src/app/api/courses/ownership/route.test.ts`.

Codi's `lecturer-auth-transaction.test.ts` is not ported: its module does not exist in the rebuild.

## Probe

[scripts/security-probe.mjs](../scripts/security-probe.mjs) prints PASS / WARN / FAIL / SKIP per check and exits 1 on
any FAIL.

- **Passive** (anonymous, safe against production): security headers, secret files not served (`/.env`,
  `/.git/config`, …), JSON 404 without internals, malformed JSON and injection-shaped input handled without a stack
  trace, sign-in from a foreign Origin refused, CORS not granted to a foreign Origin, guests refused on protected APIs,
  demo payment simulator disabled.
- **Active** (local targets only; skipped for `codi.hoangblue.dev`): session cookie HttpOnly / SameSite (and Secure
  on https), learner and lecturer refused on admin APIs, a learner cannot read another learner's orders (IDOR), a
  disabled account cannot sign in, sign-out kills the session, repeated wrong sign-ins get 429, and whether a spoofed
  `X-Forwarded-For` resets that throttle. The brute-force check runs last because it rate-limits the caller's IP.

```bash
npm run security:probe -- http://localhost:3101          # perf stack (docs/performance-testing.md), full probe
npm run security:probe -- https://codi.hoangblue.dev     # production, passive only
```

Accounts default to the demo seed (`minhanh`, `minhvu`, `quochuy`, `kimoanh` @codi.vn, `Codi@12345`); override with
`E2E_LEARNER_EMAIL`, `E2E_OTHER_LEARNER_EMAIL`, `E2E_LECTURER_EMAIL`, `E2E_BANNED_EMAIL`, `SEED_ACCOUNT_PASSWORD`.

## Browser role guards

[e2e/role-guards.spec.ts](../e2e/role-guards.spec.ts) (Playwright): a guest gets "Vui lòng đăng nhập" on protected
routes; a learner gets "Bạn không có quyền truy cập trang này" on `/admin*` and `/teach*`; a lecturer on `/admin*`,
`/dashboard` and `/cart`; and the API refuses the same data when the interface is bypassed. Codi's own
`roles-guards.spec.ts` expects redirects, which the rebuild's guard pages replace, so it was rewritten rather than
copied.

```bash
npx playwright install chromium                          # once
E2E_BASE_URL=http://localhost:3101 npm run test:e2e      # report in e2e/report/
```

## Hardening in place

- `better-auth` 1.7.15 (root `overrides` pin `@better-auth/core` 1.7.15, `@better-auth/utils` 0.5.1, `better-call`
  1.4.4 with it). 1.7.5 had critical OAuth advisories (GHSA-r4xp-prcw-77qf, GHSA-965c-763c-88jm). From 1.7.15 a
  password change runs revoke, update and new session in one transaction, so a refused session (banned account)
  rolls the whole change back; the recovery test asserts that.
- `@hono/node-server` 2.x (`serveStatic` no longer decodes paths twice, GHSA-rmxm-3fg6-px4f).
- Security headers from the app on every response ([backend/src/server.ts](../backend/src/server.ts), Hono
  `secureHeaders`): HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, same-origin COOP/CORP. They ship with the image, so the VPS
  needs no Caddy change; `fastcheck.sh` fails if they disappear.
- Content-Security-Policy on the HTML pages ([backend/src/server.ts](../backend/src/server.ts),
  `CONTENT_SECURITY_POLICY`): same-origin by default; only Google Fonts, the YouTube player, SePay's QR image and
  Google / GitHub profile pictures are allowed from elsewhere; no inline script and no eval (the code editor's syntax
  check parses with `acorn` instead of `new Function`); `object-src 'none'`, `frame-ancestors 'none'`. API and media
  responses do not carry it, so lecture PDFs still open in the browser's viewer.
  [e2e/csp.spec.ts](../e2e/csp.spec.ts) opens the main pages of every role, including a lesson with a YouTube video,
  and fails on any `securitypolicyviolation`; run it after adding an external resource.
- `safeNext` (the `?next=` sanitizer behind sign-in and GitHub onboarding) refuses `/\…` and control characters, the
  backslash open redirect that react-router 6 itself does not block (GHSA-wrjc-x8rr-h8h6, fixed only in 7.x).
- `release.sh` writes `DEMO_TOOLS=false` into `rebuild.env` on every release, so the payment simulator cannot stay on
  in production by accident.
- `npm test` runs Vitest and, through [scripts/run-node-tests.mjs](../scripts/run-node-tests.mjs), the backend tests
  written for `node:test`.

## Open items

- `style-src` keeps `'unsafe-inline'`: components set style attributes. Moving them to classes would allow a strict
  style policy.
- `backend/src/lib/rate-limit.ts` (AI chat) and Better Auth key their rate limits on `X-Forwarded-For`. That is safe
  only because the app port is bound to `127.0.0.1` and Caddy replaces the header with the real client address by
  default; do not add `trusted_proxies` to Caddy without revisiting this. The probe's WARN on a direct (proxy-less)
  target is expected.
- `react-router` 6.x stays flagged by `npm audit` (moderate) until a move to 7.x; the redirect path above is closed
  in the app.
