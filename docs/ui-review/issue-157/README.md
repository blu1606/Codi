# Issue #157 — logout and cart request lifecycle

Reference: PRODUCT Flow A3; `docs/mockup/js/core.js` account menu and `signOut`.

Screenshots use the actual local app with an isolated learner account, at 1280×800 and 375×812 in light/dark themes. The account and all of its sessions were removed after capture. The logout-failure screenshots inject one HTTP 503 for `POST /api/auth/sign-out`; subsequent retry uses the real endpoint. The mockup has no network-failure scenario for logout, so that state has no reference image.

Historical validation on `633a8d9` (before the concurrent-logout repair):

- 972 Vitest tests passed across 74 files, including 13 cart lifecycle regressions.
- Web TypeScript and design-token audit passed.
- UI-COM-32: 15/15 passed without retries (original case, held cart request, failed logout followed by retry; five repetitions each).
- Original browser-health checks remain intact. Only the injected logout POST 503 is expected by the failure case; cart 401 responses remain failures.

Re-run with the repository's seeded test-account environment configured:

```powershell
$env:E2E_BASE_URL = "http://localhost:3001"
pnpm --filter web exec playwright test auth.spec.ts logout.spec.ts --grep UI-COM-32 --grep-invert overlapping --project chromium-desktop --no-deps --repeat-each=5 --retries=0
```

The verification run used a disposable development account and a generated password injected only into the test process, rather than changing any existing account or committing credentials. Screenshot capture also exercised mobile logout success, failure and retry in both themes.

## Review follow-up — 21/10/2026

Addresses [blu1606's review](https://github.com/blu1606/Codi/pull/166#pullrequestreview-5594533747) and [repair handoff](https://github.com/blu1606/Codi/pull/166#issuecomment-6311864546).
The reviewed repair is `c0d6c8dcc8583e98a1d504447e9a81e05f96ba9f`; the new base is `bd91e568b7e80f76a3d15ec37dbcc2e36c270683`.
Integration commit `a4b43f8f732a4640f8acdae54e2b94a383b22d56` merges those revisions without conflicts.
The follow-up changes add browser coverage and evidence; the repaired application source is unchanged.

Verification uses the production build on an isolated local port, `http://localhost:3166`, with the configured development database.
The owner explicitly authorized creating and removing a disposable learner with the repository's development seed mechanism.
The fixture starts verified, as in `scripts/seed-accounts.ts`; registration/email verification is outside this test's scope.
No existing account, password or verification state was changed, and no signup/OTP/email endpoint was called.
The random password is supplied through the child process environment. Each run removes its learner and checks that no sessions, credential accounts or role grants remain.

### Browser coverage

Each case signs in through the real login form, holds a real cart request, and starts logout from both the dashboard button and the header menu in the same page/session.
The cart request must fail with `ERR_ABORTED` before either held logout is released.
An observer wraps `window.fetch` only to count cart calls and observe abort signals; it forwards every call unchanged.
Dispatching `codi:cart-updated` then synchronously verifies that no new cart fetch starts.

| Order of completion | Required result |
| --- | --- |
| First logout returns injected 503, second remains pending, then succeeds | Cart stays blocked while pending; the real successful logout revokes the session and navigates to `/`. |
| Second logout succeeds, then first returns injected 503 | A late failure cannot restart cart requests for the ended session; the header stays in the guest state. |
| Both logouts return injected 503 | Cart resumes with HTTP 200; the real session remains valid; a retry through the menu reaches Better Auth and revokes it. |

All three cases also reuse the original cookie in `GET /api/auth/get-session?disableCookieCache=true` and require a null session after success.
Opening `/dashboard` must redirect to `/login`. A fresh login for the same learner must load its cart with HTTP 200 and log out successfully using the dashboard button.
Every successful logout is forwarded to the real Better Auth endpoint and database. Only the specified logout failures are injected.
The original health fixture and original three UI-COM-32 cases remain unchanged; cart 401s and other unexpected 4xx/5xx responses still fail the suite.

The new cases run at 1280×800 and 375×812 CSS pixels in light and dark mode.
Production Better Auth limits sign-ins to three per rolling ten-second window; a first run passed six cases and failed six on the final fresh login with HTTP 429.
The suite now waits 10.1 seconds between cases, preserving the real limiter. These failures are recorded in `review-verification.json`; they are not included as successful verification.

### Checks on the new integration

- Vitest: **1,516 tests / 84 files passed**.
- Monorepo `check-types`, web TypeScript and design standards: passed, zero token violations.
- Default production build: passed, **42 static pages generated**.
- Overlapping logout E2E: **12/12 passed**, no retries; machine-readable case results are in [review-verification.json](review-verification.json).
- Original three UI-COM-32 cases: **15/15 passed** across five batches, no retries; the production sign-in window expires between batches.

### Screenshots from the production build

The mockup contract remains PRODUCT Flow A3 and `core.js` `signOut`. The earlier mockup screenshots in this directory show its account-menu/guest states.
The mockup has no concurrent-request or injected-network-failure scenario; those rows below show implementation states, with request ordering asserted by the tests.

| State | Desktop light / dark | Mobile light / dark |
| --- | --- | --- |
| Both logout requests pending | [Light](implementation-desktop-light-overlap-two-logouts-pending.png) / [Dark](implementation-desktop-dark-overlap-two-logouts-pending.png) | [Light](implementation-mobile-light-overlap-two-logouts-pending.png) / [Dark](implementation-mobile-dark-overlap-two-logouts-pending.png) |
| One failure, other request pending | [Light](implementation-desktop-light-overlap-failure-with-second-pending.png) / [Dark](implementation-desktop-dark-overlap-failure-with-second-pending.png) | [Light](implementation-mobile-light-overlap-failure-with-second-pending.png) / [Dark](implementation-mobile-dark-overlap-failure-with-second-pending.png) |
| Success followed by late failure | [Light](implementation-desktop-light-overlap-success-then-failure.png) / [Dark](implementation-desktop-dark-overlap-success-then-failure.png) | [Light](implementation-mobile-light-overlap-success-then-failure.png) / [Dark](implementation-mobile-dark-overlap-success-then-failure.png) |
| Both failures, session/cart restored | [Light](implementation-desktop-light-overlap-both-failed-session-and-cart-restored.png) / [Dark](implementation-desktop-dark-overlap-both-failed-session-and-cart-restored.png) | [Light](implementation-mobile-light-overlap-both-failed-session-and-cart-restored.png) / [Dark](implementation-mobile-dark-overlap-both-failed-session-and-cart-restored.png) |
| Guest after real session revocation | [Light](implementation-desktop-light-overlap-guest-after-real-session-revocation.png) / [Dark](implementation-desktop-dark-overlap-guest-after-real-session-revocation.png) | [Light](implementation-mobile-light-overlap-guest-after-real-session-revocation.png) / [Dark](implementation-mobile-dark-overlap-guest-after-real-session-revocation.png) |

### Re-run against a production build

Configure authorized `SEED_ACCOUNT_TARGETS` and `SEED_ACCOUNT_PASSWORD` in the test process or untracked local environment first. Do not run `db:seed-accounts` against existing identities just to run these tests.
Build and start the app with its origin set to the isolated port, then run the tests in another terminal:

```powershell
# Build/start terminal, apps/web:
$env:NODE_ENV = "production"
$env:BETTER_AUTH_URL = "http://localhost:3166"
node node_modules/varlock/bin/cli.js run -- node node_modules/next/dist/bin/next build
node node_modules/varlock/bin/cli.js run -- node node_modules/next/dist/bin/next start --port 3166

# Test terminal, repository root:
$env:E2E_BASE_URL = "http://localhost:3166"
pnpm.cmd --filter web exec playwright test logout.spec.ts --grep overlapping --project chromium-desktop --project mobile-390 --no-deps --retries=0

# Original three cases, five batches; respect the production sign-in window.
foreach ($batch in 1..5) {
  Start-Sleep -Milliseconds 10100
  pnpm.cmd --filter web exec playwright test auth.spec.ts logout.spec.ts --grep UI-COM-32 --grep-invert overlapping --project chromium-desktop --no-deps --retries=0
  if ($LASTEXITCODE -ne 0) { throw "UI-COM-32 batch failed" }
}
```
