# Issue #176 — enrolled learner dashboard regression

Issue: [#176](https://github.com/blu1606/Codi/issues/176). Implementation: [PR #144](https://github.com/blu1606/Codi/pull/144), tracked by #102. Contract: S12 / Flow L10, enrollment state machine §6. Baseline `437c1e8` rendered the generic static dashboard; PR #144 routes authenticated learners to `LearnerWorkspace`, whose private, uncached overview reads their real enrollments and progress. Empty rendering depends on the returned course list. No further product-source change was needed for this defect.

This focused regression ran against the existing **production build** `6jDF2oji0k3ANJGIgIe4b`, with product source pinned to `ab43d4e` (unchanged since the successful build recorded in [the runtime handoff](../issue-102/pr144-runtime-handoff/README.md)). The [pre-run hashes and final report](browser-report.json) identify the exact runner and relevant source files. This follow-up adds the runner, evidence and issue linkage; it does not claim that develop is fixed before PR #144 is merged and deployed.

| Acceptance criterion | Real implementation | Verification |
| --- | --- | --- |
| An enrolled learner sees their course and progress | `/dashboard/page.tsx` → `LearnerWorkspace` → `GET /api/learner/overview` | Separate QA learner, one hidden owned course, 1/3 completed lessons (33%); profile, course home and dashboard agree |
| Continue learning opens the correct lesson | Shared overview derives `nextLessonId` from the learner's path | Assert href and click `Học tiếp`; actual Boolean lesson opens |
| Metrics are real | Overview returns active courses, completed lessons and weekly recorded study minutes | Assert API and UI: 1 active course, 1 completed lesson, 90/300 minutes; fixture's 5,400 seconds are explicit QA data, not measured study time |
| Empty is only for an unenrolled learner | `data.courses.length === 0` | A second isolated learner has zero enrollments, no continue CTA and the expected catalog empty state |
| Refresh preserves the correct state | Client fetch uses `cache: "no-store"`; API sends private/no-store headers | Each learner: initial navigation + real page reload at 1280/375px × light/dark; assert API and rendered state, 16 cases total |

## Results

- Browser command **exit 0**, 18 recorded checks (16 dashboard cases, one profile/course-home comparison, one continue navigation), 10 screenshots; cleanup verified zero own users/accounts/sessions/enrollments/activities/clocks/days/courses. See [original browser log](browser.log) and [child exit metadata](browser.log.json).
- No page errors, same-origin HTTP ≥400 or unexpected application POSTs in the successful run. The report records the allowed `sync`, lesson `open`, and study activity requests; no goal-save/diagnostic/generation command is exercised. Server Better Auth plugin-order warnings remain in [server.log](server.log); this is not a blanket clean-console claim.
- Full Vitest: **1,575 tests / 89 files passed**; focused overview/component run: **27 tests / 2 files passed**. TypeScript passed; design standards: **0 violations**. Happy DOM's existing disabled iframe-loading warnings occurred during the full passing unit suite.
- QA server was explicitly stopped after browser success and fixture cleanup. The Windows shutdown code in [server.log.json](server.log.json) is separate from the passing browser command. No fresh build was necessary because product source and schema were unchanged.
- The first browser invocation completed all behavioral checks, then failed an overly strict harness observer which treated the application's normal path `sync` and lesson `open` POSTs as unexpected. Its report/log/exit status are retained in [attempts/strict-post-observer](attempts/strict-post-observer); it is not counted as a passing run. The final runner permits only the exact QA endpoints and expected commands.
- Environment: Node **22.23.3**, Next **16.3.5**, Chromium from the installed Playwright distribution. This does not substitute for the CI Node 24 environment or independent reviewer acceptance. Fixture data uses a new hidden TypeScript course at **33%**, not the reporter's JavaScript 36% account.

## Screenshots after reload

Existing mockup references: [enrolled desktop](../issue-102/mockup-dashboard-light.png), [enrolled mobile](../issue-102/mockup-dashboard-mobile.png), [empty](../issue-102/mockup-dashboard-empty.png). There is no new UI layout change.

| State | Desktop light | Desktop dark | 375px light | 375px dark |
| --- | --- | --- | --- | --- |
| Enrolled, 33%, continue available | [Image](dashboard-enrolled-1280-light.png) | [Image](dashboard-enrolled-1280-dark.png) | [Image](dashboard-enrolled-375-light.png) | [Image](dashboard-enrolled-375-dark.png) |
| Separate unenrolled learner | [Image](dashboard-empty-1280-light.png) | [Image](dashboard-empty-1280-dark.png) | [Image](dashboard-empty-375-light.png) | [Image](dashboard-empty-375-dark.png) |

Comparison: [profile](profile-enrolled.png), [course home](course-home-enrolled.png). Images were checked for readable populated/empty states and the runner asserts no page overflow. Source hashes are captured before fixture creation; credentials and cookies are never written to the evidence report. [artifact-manifest.json](artifact-manifest.json) records file checksums.

## Reproduce

Start the existing migrated development checkout as a production server on `http://localhost:3144` with matching `BETTER_AUTH_URL`. From `apps/web`, set `CHROMIUM_PATH` to the local browser and `QA_OUTPUT_DIR` to a new output directory, then run:

```powershell
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-dashboard-enrollment-browser.ts --allow-dev-db
```

The runner rejects `NODE_ENV=production` for fixture creation. The production server is a separate process. It creates only random QA identities/course, uses local `goal-skip`/`fork-default`, and cleans its own rows in `finally`. No migration or existing learner data is changed.
