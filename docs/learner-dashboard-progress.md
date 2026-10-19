# Learner dashboard and results — issue #102

Implements [#102](https://github.com/blu1606/Codi/issues/102), under epic #94: mockup S12 `/dashboard`, S13 `/progress`, Flow L10. The explicit `/dashboard/learner` entry uses the same dashboard. Admin/lecturer routing priority is preserved.

## Behaviour and boundaries

| Mockup state / transition | Implementation | Verification |
| --- | --- | --- |
| No enrollments | Catalog/AI links, no fabricated course recommendations | Component test, browser empty states |
| Continue learning | Owned, non-suspended courses; published lessons; existing `selectPath`, prerequisite guards and completion rules | Rollback DB verification, browser continue target |
| Weekly goal and streak | Onboarding weekly minutes, Vietnam calendar week (Monday–Sunday); activity dates deduplicated; yesterday's streak remains until the day is missed | Contract tests, DB verification |
| Study time | One server clock per learner, owned by a unique focus session; explicit start acquires ownership, 30s heartbeat renews only its own clock while visible/focused; gaps over 45s discarded; split at Vietnam midnight | Contract/tracker tests, ownership regressions for same/different-lesson tabs, DB stop/expiry checks, authenticated browser requests |
| Mastery badges | Existing five-level BKT presentation; no evidence means level 0 | DB verification, escaped/text-labelled UI |
| Diagnostic card | Default/ready/skipped only; durable enrollment-scoped dismiss and version-checked undo; real onboarding retake command | API/component/DB tests, browser CTA and reload |
| Change goal | Dialog explains rearranging unfinished lessons; existing onboarding `goal-edit` command preserves grades/completed lessons | Browser confirmation/navigation; existing onboarding tests |
| Active/completed courses | Accordion lists share the path completion rule, including AI-skippable lessons | DB verification and browser tabs |
| Results | Latest quiz attempt; latest code **submit** (runs excluded); pending/graded assignments and inline lecturer feedback | DB verification, browser latest result display |
| Loading/error | Skeleton, safe error message and retry; previous data retained on a failed refresh | API/component tests, browser retry |
| Access | Session identity, active LEARNER grant, banned/suspended checks; same lesson guard for metrics; same-origin POST, private/no-store responses | API and DB guard tests |

`GET /api/learner/overview` uses bulk reads in a repeatable-read, read-only transaction. It never reconciles a path, changes completion/mastery, generates AI content or exposes submitted answers/code. Existing unpublished courses remain available to their enrolled learners; suspended enrollments are excluded.

Study-time tracking starts with this change. Historical lesson duration estimates are not reported as time actually studied. The assumed goal is labelled when no onboarding commitment exists. Historical completion/submission dates can still establish a streak.

## Migration

`20261019121656_learner_study_activity` adds `student_study_days` and `student_study_clocks`, with RLS, foreign keys, per-user/day uniqueness and bounded daily seconds. It does not rewrite course, progress, grade or enrollment rows. Apply using the normal migration deployment workflow; never `db:push`.

`20261019133900_study_tracker_ownership` adds nullable UUID `student_study_clocks.tracker_id`. Apply both migrations before deploying. Existing clocks with no owner can be claimed by an explicit start; stale heartbeats and stops cannot change them. Updated clients send `{action: "start" | "heartbeat" | "stop", trackerId}`; old open clients must reload because the previous `{active, trackerId}` payload is rejected with HTTP 400. Tracker IDs identify focus sessions scoped to the authenticated user, not authentication credentials. This follow-up requires no additional migration.

## Reproduce validation

From the repository root:

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/tsx/dist/cli.mjs scripts/check-design-standards.ts
```

From `apps/web`, with a development `.env` and the migration applied:

```powershell
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-learner-overview.ts
```

This creates isolated fixtures inside a transaction and rolls everything back. Temporary accounting tables shadow the shared tables during the test.

The browser verification uses isolated QA users and hidden courses, then removes only their IDs. Set `PLAYWRIGHT_CORE_PATH` to the installed `playwright-core/index.mjs`, `CHROMIUM_PATH` to its browser executable and optionally `QA_ORIGIN` (default `http://localhost:3002`):

```powershell
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-learner-overview-browser.ts
```

## Visual review

UI uses the existing semantic tokens/components. Added day markers, separate earned/in-progress skill groups and a code-results column extend the compact mockup layout to cover PRODUCT.md L10 and the implemented coding assessments. The knowledge-map link uses the existing `/insights/knowledge-map?course=...` route. The separate statistics module `/insights` is outside #102 and is not represented by a dead control.

The header hides its desktop-navigation wrapper below `md`; its empty flex gap otherwise widened the signed-in learner header to 377px on a 375px device. Course-row actions wrap below their content on mobile.

| State | Mockup | Implementation |
| --- | --- | --- |
| Dashboard, light | [Reference](ui-review/issue-102/mockup-dashboard-light.png) | [Dashboard](ui-review/issue-102/dashboard-light.png) |
| Dashboard, dark | [Reference](ui-review/issue-102/mockup-dashboard-dark.png) | [Dashboard](ui-review/issue-102/dashboard-dark.png) |
| Dashboard, 375px | [Reference](ui-review/issue-102/mockup-dashboard-mobile.png) | [Dashboard](ui-review/issue-102/dashboard-mobile.png) |
| Dashboard, empty | [Reference](ui-review/issue-102/mockup-dashboard-empty.png) | [Dashboard](ui-review/issue-102/dashboard-empty.png) |
| Dashboard, loading | No corresponding mockup loading switch | [Skeleton](ui-review/issue-102/dashboard-loading.png) |
| Progress, light | [Reference](ui-review/issue-102/mockup-progress-light.png) | [Results](ui-review/issue-102/progress-light.png) |
| Progress, dark | [Reference](ui-review/issue-102/mockup-progress-dark.png) | [Results](ui-review/issue-102/progress-dark.png) |
| Progress, 375px | [Reference](ui-review/issue-102/mockup-progress-mobile.png) | [Results](ui-review/issue-102/progress-mobile.png) |
| Progress, completed | [Reference](ui-review/issue-102/mockup-progress-completed.png) | [Results](ui-review/issue-102/progress-completed.png) |
| Progress, empty | [Reference](ui-review/issue-102/mockup-progress-empty.png) | [Results](ui-review/issue-102/progress-empty.png) |
| Progress, loading | No corresponding mockup loading switch | [Skeleton](ui-review/issue-102/progress-loading.png) |
| Dashboard error / retry | No corresponding mockup error switch | [Error](ui-review/issue-102/dashboard-error.png) |
| Change-goal consequence | Existing onboarding transition | [Dialog](ui-review/issue-102/dashboard-edit-goal.png) |

Screenshots contain explicit QA data, not production user records. Browser QA checks both learner screens at 375px for page-level overflow; the results table has its own accessible horizontal scroll region.

Validation on 2026-10-19 after review fixes: 912 Vitest tests across 68 files passed with repository-configured coverage thresholds. Typecheck, production build and standards audit (0 violations) passed. Database rollback verification includes obsolete stops between same-lesson and different-lesson trackers; all fixture rows are rolled back.

The authenticated Chromium verification also passed, including held-stop focus resumption, owner stop on client navigation, goal save/reopen and heatmap in both themes; all QA users/courses were cleaned up. Screenshots disable animations to capture settled theme colors.

### PR #144 accounting race regressions

- Follow-up review: A's periodic heartbeat is held before service processing at t=30, B starts at t=31, A's heartbeat is released at t=32 and its queued stop follows at t=33. Only an explicit `start` may transfer ownership; both obsolete requests return `recorded: false`. B's t=61 heartbeat retains the entire interval. The combined React tracker/service regression failed against the previous implementation for both same-lesson and different-lesson tabs because B's clock was cleared. The DB rollback verifier also covers this ordering.
- A new UUID is generated on each real blur/refocus transition, including while a request is pending. Repeated visibility/focus events and timer ticks remain renewals. An ignored renewal does not become a new acquisition on the next tick. Pending-stop resumption and blur/unmount behaviour remain covered.
- Follow-up validation on 2026-10-19: all 921 tests across 68 files passed with coverage (`--maxWorkers=2`), monorepo typecheck passed, standards audit reported 0 violations, and PostgreSQL rollback verification passed for both same-lesson and different-lesson delayed-heartbeat sequences. The first full test run hit a coding-runner worker timeout; that file passed independently and the complete coverage run then passed with two workers. No new browser session or screenshots were produced for this follow-up; earlier browser evidence above belongs to the previous head.
- Pending stop → focus → successful stop completion immediately sends a new start. The client reconciles either direction only after success, preventing retry loops on network failures; blur/unmount still win over a queued focus. The new component regression failed against the previous implementation (two requests instead of three) and passes after correction.
- At t=0 A starts, t=10 B takes ownership, t=11 A's delayed stop is ignored, t=40 B heartbeats. Both service tests and rollback DB tests assert that A cannot modify B's clock or credit another interval, and the total remains 40 seconds. Cases cover different lessons and two trackers on the same lesson. The owner's stop still credits the final interval and clears ownership.
- The authenticated browser verification disables Playwright's always-focused emulation for the lesson/background tabs, holds the actual stop response, switches tabs back and verifies a resumed start within five seconds, before the next 30-second tick. It also exercises stale stops over HTTP, dashboard/progress/results, goal save/reopen, heatmap light/dark and learner mobile layouts. This is author QA; independent reviewer UI acceptance is still required.

| Additional review state | Implementation |
| --- | --- |
| Saved weekly goal | [Dashboard](ui-review/issue-102/dashboard-goal-saved.png) |
| Reopened goal retains choices | [Onboarding](ui-review/issue-102/onboarding-goal-reopened.png) |

### Profile heatmap follow-up

The user reported that empty activity cells disappeared in dark mode. `bg-muted` and the card surface both resolve to the same dark color. Empty in-year cells and their legend now use `dark:bg-border`, keeping the light palette and activity intensity levels. Browser QA confirmed all 362 empty dates in a three-active-day fixture have visible dimensions, contrast with the card and match the legend in both themes; no browser errors. Standards audit: 0 violations. Only the temporary QA account was removed afterward.

| State | Before reference | Implementation |
| --- | --- | --- |
| Profile heatmap, light | User-supplied screenshot | [Light](ui-review/issue-102/profile-heatmap-light.png) |
| Profile heatmap, dark | User-supplied screenshot | [Dark](ui-review/issue-102/profile-heatmap-dark.png) |
