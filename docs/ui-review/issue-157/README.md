# Issue #157 — logout and cart request lifecycle

Reference: PRODUCT Flow A3; `docs/mockup/js/core.js` account menu and `signOut`.

Screenshots use the actual local app with an isolated learner account, at 1280×800 and 375×812 in light/dark themes. The account and all of its sessions were removed after capture. The logout-failure screenshots inject one HTTP 503 for `POST /api/auth/sign-out`; subsequent retry uses the real endpoint. The mockup has no network-failure scenario for logout, so that state has no reference image.

Validation on the implementation in this branch:

- 972 Vitest tests passed across 74 files, including 13 cart lifecycle regressions.
- Web TypeScript and design-token audit passed.
- UI-COM-32: 15/15 passed without retries (original case, held cart request, failed logout followed by retry; five repetitions each).
- Original browser-health checks remain intact. Only the injected logout POST 503 is expected by the failure case; cart 401 responses remain failures.

Re-run with the repository's seeded test-account environment configured:

```powershell
$env:E2E_BASE_URL = "http://localhost:3001"
pnpm --filter web exec playwright test auth.spec.ts logout.spec.ts --grep UI-COM-32 --project chromium-desktop --no-deps --repeat-each=5 --retries=0
```

The verification run used a disposable development account and a generated password injected only into the test process, rather than changing any existing account or committing credentials. Screenshot capture also exercised mobile logout success, failure and retry in both themes.
