# Phase 3 report: integration

Status: done. No screen reads `Codi.db()` or writes domain data through `Codi.set()` any more; the JSON store and
its endpoints are deleted, and the shared fixes requested by the Phase 2 reports are in. smoke 64/64, flow paid +
owned, axe without violations (light + dark), mobile without overflow; every area script passes.

Commits: `b43df00` (shared fixes), `7e5173e` (legacy store removal), `f8102b4` (checkout with an empty cart),
`10094a7` (focusable code blocks), `1d7ff47` (docs), plus this report.

## Shared fixes applied

- `backend/scripts/seed.ts` runs `normalizeAssignmentRubrics()` after `seed-mockup.ts` (6/6 rubrics converted on each
  reseed), so grading works after `npm run seed`.
- `learning/lesson-assessments.jsx`: the assignment rubric renders as a criteria list (name, points, description);
  free-text rubrics still show as text.
- Header badges (`shell/nav-config.js`, `shell/header.jsx`): admin "Duyệt xuất bản" counts pending publication
  requests, "Đơn hàng" counts orders flagged for reconciliation (`getAdminOrdersExportAction({reconciliationOnly})`),
  via `useAdminNavCounts()` in `admin/admin-data.js`; refreshed after every admin write. Lecturer badges already
  came from the backend.
- Profile "Tiếp tục thanh toán" links use the order code (`/checkout?order=CODIxxxxx`).
- Admin search groups "Người dùng" and "Voucher" read `GET /api/admin/users` and `GET /api/admin/vouchers`.
- `lib/codi.js` takes the user from the backend session; `syncLegacyUser()` / `useLegacyUserSync()` are deleted.
- Found while testing: `/checkout` with an empty cart sent a checkout that failed with 400; it now resumes the pending
  order or shows "Giỏ hàng của bạn đang trống" without a failing request. Scrollable code blocks in the lecturer
  tutorial preview and AI draft review are keyboard-focusable (axe `scrollable-region-focusable`).

## Removed

- Backend: `backend/legacy/` (`/api/snapshot`, `/api/sync`, `/api/reset`, `docs`/`kv` schema, `codi_rebuild` pool),
  `LEGACY_DATABASE_URL`, `isDocCollection` in `seed-source/load-seed.js`. `docker-compose.yml` now creates database
  `codi` on a fresh volume (the existing volume is unchanged).
- Frontend `lib/codi.js`: snapshot load, diff sync, `db`, `ensure`, `reset`, `onReset`, `flush`, and every
  store selector (`course`, `lessons`, `user`, `ownership`, `courseProgress`, `cart`, `notify` …). Kept: session
  (`currentUser`, `role`, `signIn/Out`, `refreshSession`), navigation, `ui`, `requireAuth`, `homeFor`, `fmt`, and
  `Codi.set` for browser-only UI state (Alt+K scenario, theme; localStorage). `main.jsx` boots with `loadSession()`.
- `admin/review-api.js` (unused `Codi.review`), the store calculators in `admin/admin-metrics.js` (now date helpers +
  the overview adapter), `coding/code-runner.js` (Web Worker runner, `run`/`grade`); `coding/code-api.jsx` keeps only
  the editor and result UI kit, pure text helpers moved to `coding/code-text.js`. Nothing imported the removed parts
  (`rg` over `frontend/src`, `vite build` clean).
- `learning-store.js` `Codi.courseProgress` override and its overview cache (no caller left).
- `shell/github-profiles.js` (canned GitHub results) and the simulated OAuth chooser; dev-drawer flags `pathAI`,
  `materials`, `codeSandbox`, `githubAnalysis` (nothing read them) and the "Đặt lại dữ liệu tạm" button (the drawer
  now says to run `npm run seed`).
- The root `server/` folder was already gone: the seed source lives in `backend/scripts/seed-source/` since Phase 1
  and the exporter reads it from there.
- Database `codi_rebuild` still exists in Postgres but nothing uses it (backup:
  `../.codi-gc-preserved/db-backups/codi_rebuild-261102-1840.dump`).

## What stays simulated, and why

- Admin cards A4, A6, A9, the A8 grading median and B5 show Codi's own "Chưa có số liệu …" reasons; no numbers are
  computed in the browser. The period and expand choice are a localStorage preference.
- GitHub "Hồ sơ năng lực": wired to the real routes (link status via `list-accounts`, `GET/POST/DELETE
  /api/github-profile`, "Kết nối GitHub" = Better Auth `link-social`). Verified that the button reaches GitHub's
  authorize page with `redirect_uri=http://localhost:5190/api/auth/callback/github`. The GitHub OAuth app copied from
  Codi was registered for Codi's localhost:3001, so the round trip will most likely be refused by GitHub until that
  callback is added; learners therefore see the honest "Kết nối GitHub" state, and any failure shows the provider's or
  backend's message. A saved profile renders as a compact summary (technologies + usage, observed facts); the full
  report view of Codi's DTO was not ported. Chosen over fake analysis because the backend has the keys and the route
  is real; only the external OAuth registration is missing.
- Lecturer AI grading job card: browser localStorage simulation (Codi's `getAiGradingDraft` always fails). AI document
  import and AI lesson/code drafts generate content in the browser; applying them writes through the backend.
  Knowledge-map analysis is a backend-route simulation saved in the database (Codi disables it).
- Payment: no bank locally; `POST /api/dev/simulate-payment` runs the real SePay webhook handler.
- PDF/slide materials: simulated page viewer (no pdf.js); Alt+K `aiAssistant` / `kmap` flags still force failures.

## Tests (servers via `npm start`, scripts in the session scratchpad `e2e/`)

The four shared scripts no longer touch `/api/reset` or the snapshot. New `e2e/plan.js` builds the route plan from
the API (UUID lesson ids from `/api/learner/overview` + `/api/courses/:slug/lesson-kinds`, the lecturer's course,
a real submission id); `login.js` reads other seeded emails from the seed source.

| Script | Result |
|---|---|
| `smoke.js` | 64/64 ok (guest 10, learner 26, lecturer 18, admin 10), no console errors |
| `flow.js` | order `CODI…` paid, `ownership: owned`, in the learner overview; mobile overflow 0 px; no errors |
| `axe.js` (light + dark) | no violations on all 64 routes in both schemes (first run found 1 `scrollable-region-focusable` on the lecturer tutorial preview, fixed in `10094a7`) |
| `mobile.js` | no horizontal overflow on any planned route |
| `integration-checks.js` (new) | 12/12: admin badges, admin search users + vouchers, unavailable A4/A6/A9/A8/B5, rubric list, GitHub link start |
| `commerce-backend.js`, `commerce-scenarios.js` | pass (only the intentional 404 of an unknown slug) |
| `learning-backend.js`, `learning-onboarding.js` | pass, 0 errors |
| `lect-port-smoke.js` | 22/22; `lect-port-flow.js` 12/12 steps, no console errors |
| `shell-account.js` | 35/35 (the three deliberate 400s) |
| `admin-p2/admin-e2e.js` | 8/8 on fresh data |

`admin-e2e.js` failed once when run right after `lect-port-flow.js`: the lecturer flow had submitted `course-ts-001`,
so the admin script reviewed the first pending course instead of `course-next-001`. Test-order dependency, not an
app bug; it passes after a reseed.

`npx vite build` (frontend) passes; `npx tsc --noEmit` (backend) clean. No value from `backend/.env` is in tracked
files or git history; no `.env` or dump is tracked.

## Data state

Final `npm run seed` after testing (backup `../.codi-gc-preserved/db-backups/codi-261102-203942.dump` taken first): 109 users, 9
courses (5 published), 120 orders, 145 enrolments (checked in SQL), 6/6 assignment rubrics in JSON; courses: 5 published, 1 pending, 1 rejected, 1 draft, 1 hidden. Password `Codi@12345`.
Dev servers and every process started by this phase are stopped.

## Open questions

- Add `http://localhost:5190/api/auth/callback/github` (and `/callback/google`) to the OAuth apps, or register dev
  apps, if GitHub linking and social sign-in should work locally. Port the full GitHub profile report view?
- Drop the unused `codi_rebuild` database (backup exists)?
- `admin-e2e.js` and `lect-port-flow.js` share the pending-review queue; make the admin script pick `course-next-001`
  explicitly if they will be run back to back.
