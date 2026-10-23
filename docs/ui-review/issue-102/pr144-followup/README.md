# PR #144 follow-up verification — 20/10/2026

This checks the corrected working tree based on `159f34fe1d4d2f2c33bcd6c002bcaed8e48f6a35`. At verification time, the source was local and uncommitted; `source-manifest.json` records that snapshot and the application file hashes. This report is author QA, not independent reviewer approval or acceptance of a remote deployment.

## Findings corrected

1. The weekly-goal action uses the enrollment's `goalSetAt`: fresh enrollments open initial onboarding without an edit request; finalized goals retain confirmation and `goal-edit`.
2. A real browser run reproduced a header hydration failure on a lesson page: the server rendered the account skeleton while the client session had already resolved and inserted the notification menu. A hydration snapshot now keeps the initial header markup stable. Signed-in and signed-out hydration regressions pass. The original stack is retained in `browser-report-before-header-fix.json`.
3. At 375px, all heatmap day cells collapsed to zero width. The calendar now keeps a minimum width inside an accessible horizontal scroll region, and the year buttons move above it on smaller screens. The profile grid and long email also wrap within the viewport. `profile-heatmap-mobile-before.png` and `browser-report-before-mobile-fix.json` preserve the failing case.

The reviewer's two historical generic page-error events have no original stack here, so they cannot both be conclusively attributed to the reproduced hydration error. The new runs capture message, stack, stage and URL for every page error on every tab; the final local dev run reports zero.

## Validation

| Check | Result |
| --- | --- |
| Vitest | 937 tests / 69 files pass, including fresh/finalized goal and header hydration regressions |
| TypeScript and production build | Pass on the final application source |
| Standards audit | 0 violations |
| PostgreSQL rollback suite | Pass; all fixture writes roll back |
| Additional PostgreSQL fencing cases | Same/different lesson, B active/stopped; A's delayed initial start and queued stop cannot change B's clock or credits. Active B retains 90 seconds over three ticks; a stopped B retains its token and its 10 seconds |
| Chromium against local dev server | Full suite passes; 0 page errors |
| Chromium 149.0.7827.55 against local production build | Full suite passes; 0 page errors; same application source hashes as the dev run |
| Fresh goal in Chromium | Weekly action opens initial setup with no `goal-edit`; initial save returns HTTP 200 |
| Finalized goal in Chromium | Confirmation, save, 600-minute weekly target and reopening persisted choices pass |
| Two real Chromium tabs + PostgreSQL | A's initial start is held before processing; B starts in the same/different lesson; released A start and queued stop return `recorded: false`, with B's clock unchanged |
| Stop/focus race | Real focus/blur with always-focused emulation disabled; held stop completes and focused lesson resumes before the next heartbeat |
| Desktop and mobile visual QA | Dashboard/progress light/dark at 1440px/375px; empty/loading/error/retry, completed results and horizontal results-table scrolling pass |
| Heatmap | 362 empty dates plus three active dates with 1/2/4 events; dimensions, empty-cell/background contrast, legend colors, horizontal scrolling and previous-year empty state pass in light/dark at 1440px/375px |

The browser suite creates a unique verified QA account and hidden courses, then deletes only that run's user/course/activity IDs. It uses real authentication, application APIs and PostgreSQL. Only overview loading/error states intentionally intercept responses. It does not send OTP email, change shared fixtures/schema/payments, or reproduce the complete signup/OTP flow.

The local servers emit an existing Better Auth plugin-order warning, and dev also emits an image-loading warning, so this is not a blanket clean-console claim.

## Screenshots inspected

Existing mockup references under `../` are reused; the mockup source was not changed. Layout differences remain within the repository's permitted composition changes. Current implementation images are linked below.

| State | Light / initial | Dark / alternate |
| --- | --- | --- |
| Dashboard desktop | [Light](dashboard-light.png) | [Dark](dashboard-dark.png) |
| Dashboard 375px | [Light](dashboard-mobile.png) | [Dark](dashboard-dark-mobile.png) |
| Progress desktop | [Light](progress-light.png) | [Dark](progress-dark.png) |
| Progress 375px | [Light](progress-mobile.png) | [Dark](progress-dark-mobile.png), [scrolled to assignment/code columns](progress-mobile-results-right.png) |
| Empty | [Dashboard](dashboard-empty.png) | [Progress](progress-empty.png) |
| Loading | [Dashboard](dashboard-loading.png) | [Progress](progress-loading.png) |
| Retry / completed | [Error and retry](dashboard-error.png) | [Completed results](progress-completed.png) |
| Goal | [Fresh setup](fresh-goal-initial-setup.png) | [Edit confirmation](dashboard-edit-goal.png), [saved target](dashboard-goal-saved.png), [reopened choices](onboarding-goal-reopened.png) |
| Heatmap desktop | [Light](profile-heatmap-light.png) | [Dark](profile-heatmap-dark.png) |
| Heatmap 375px | [Light](profile-heatmap-light-mobile.png) | [Dark](profile-heatmap-dark-mobile.png) |
| Heatmap scroll / empty | [End of year](profile-heatmap-light-mobile-end.png) | [Previous year](profile-heatmap-empty-dark-mobile.png) |

Machine-readable results: [dev](browser-report.json), [production](production/browser-report.json). The full production screenshot set is under `production/`; for example [fresh setup](production/fresh-goal-initial-setup.png), [mobile dark heatmap](production/profile-heatmap-dark-mobile.png), and [mobile results after scrolling](production/progress-mobile-results-right.png). Both runs completed cleanup of their own QA account/courses/data.
