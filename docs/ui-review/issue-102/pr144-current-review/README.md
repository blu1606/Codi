# PR #144 — remaining review checks, 21/10/2026

Addresses the [latest review](https://github.com/blu1606/Codi/pull/144#pullrequestreview-5594536775): verify the final header/mobile changes on updated develop, and prove that the focused tab continues recording through two subsequent browser heartbeats after a delayed acquisition. The reviewer already verified fresh-goal setup/editing; this follow-up does not repeat goal regeneration or incur model usage through that flow.

## Version and validation

- Product candidate: `e53a2486e3dd5208066559546b07917fc48736a6`, merging PR #144 at `dacdad8` with develop `437c1e8df16969a54b1fb96f0ff3e02a09c15e7a`, without conflicts.
- Production build command exited **0**. The production QA server used `BETTER_AUTH_URL=http://localhost:3144`.
- Fresh full Vitest run: **89 files / 1,575 tests passed** with `--maxWorkers=4`.
- Workspace TypeScript passed; final runner TypeScript and formatting passed; design standards reported **0 violations**.
- Chromium **149.0.7827.55**, real login form, real API/service/PostgreSQL; no fake timers, manual activity requests, backdated accounting rows or synthesized focus events.
- No new application logic/schema changes were necessary. The follow-up adds the reproducible QA runner and evidence; existing study-accounting fixes remain intact.

[Source manifest](source-manifest.json) pins the tested product/base commits and application/runner hashes. The commits after the product candidate add verification code and documents only. Happy DOM's existing YouTube iframe warnings remain in unit output. Existing Better Auth plugin-order warnings remain in server output; this is not a blanket clean-console claim.

## Actual two-tab accounting

The runner holds A's initial `start` request **before server processing**, moves real focus to B, and accepts B's acquisition. A really loses `document.hasFocus()` and B gains it. Releasing A's old start and queued stop returns `recorded: false` for both; B's PostgreSQL clock remains unchanged.

It then waits for B's **two actual 30-second timer ticks**. Every response has HTTP 200 and `recorded: true`; the owner remains B, `last_seen_at` advances, and the sum of persisted study seconds increases by exactly the difference between the server timestamps, rounded to second boundaries. No time is manually advanced or inserted to make this pass.

| Case | First heartbeat | Second heartbeat | Total after acquisition | Owner stop via real “Về lộ trình” navigation |
|---|---|---|---|---|
| Same lesson, two tabs | +29 seconds | +30 seconds | 59 seconds | Recorded; active timestamp cleared, fencing token retained |
| Different lessons | +30 seconds | +29 seconds | 59 seconds | Recorded; active timestamp cleared, fencing token retained |

The first interval starts after the initial server acquisition, so two ticks correspond to approximately 59 seconds rather than an assumed 60. The assertion uses actual server timestamps and requires exact credit, rather than accepting a broad estimated duration.

Machine-readable evidence: [heartbeat-browser-report.json](heartbeat-browser-report.json). This completed run also checked the UI matrix. A subsequent UI-only run waits for role navigation and the profile heatmap to settle before recapturing the screenshots: [browser-report.json](browser-report.json). The two reports are separate invocations against identical product source; the UI-only run does not claim additional heartbeat cases.

## Header/mobile and screenshots

Dashboard, progress and profile are checked at **1280×800 / 375×844**, each in light/dark. Assertions wait for role navigation, the authenticated account menu and notifications; profile images also wait for loaded heatmap data. All 12 route/configuration checks have no document overflow and the global header stays within the viewport. Both mobile menu cases open, show **Học tập của tôi**, navigate correctly and close. There are 14 settled screenshots.

No page errors, same-origin HTTP responses ≥400, or browser generation/onboarding POST requests were observed in either completed run. Console messages are not blanket-filtered or certified by this runner. It does not re-test the historical full goal-save workflow, every result/grade state, or all heatmap activity intensities; prior evidence remains in [the original follow-up](../pr144-followup/README.md).

| Screen/state | Desktop light | Desktop dark | 375px light | 375px dark |
|---|---|---|---|---|
| Dashboard/header | [Image](dashboard-desktop-light.png) | [Image](dashboard-desktop-dark.png) | [Image](dashboard-mobile-light.png) | [Image](dashboard-mobile-dark.png) |
| Progress/header | [Image](progress-desktop-light.png) | [Image](progress-desktop-dark.png) | [Image](progress-mobile-light.png) | [Image](progress-mobile-dark.png) |
| Profile/header/loaded heatmap | [Image](profile-desktop-light.png) | [Image](profile-desktop-dark.png) | [Image](profile-mobile-light.png) | [Image](profile-mobile-dark.png) |
| Mobile menu | — | — | [Image](header-menu-mobile-light.png) | [Image](header-menu-mobile-dark.png) |

The mockup comparison references remain in [the module report](../../../learner-dashboard-progress.md#visual-review). `docs/mockup/**` is unchanged. Screenshots contain only the disposable QA identity and development catalog content; no existing user's credentials, session cookies or browser storage state are saved.

## Reproduction and cleanup

Build/start the product checkout as a production QA server at `http://localhost:3144`, with the matching auth URL. From `apps/web`, using the configured development database with the existing PR #144 migrations already applied:

```powershell
$env:CHROMIUM_PATH = '<path-to-installed-current-chromium>/chrome.exe'
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-study-activity-browser.ts --allow-dev-db

# Optional screenshot iteration; explicitly excludes accounting checks:
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-study-activity-browser.ts --allow-dev-db --visual-only
```

`QA_ORIGIN` and `QA_OUTPUT_DIR` can override the server and artifact directory. Without `CHROMIUM_PATH`, the runner uses Playwright's expected Chromium executable. The older installed Chrome 138 reported both headless tabs as focused even with focus emulation disabled; a separate two-empty-tab probe reproduced that tooling limitation. Installed Chromium 149 correctly switched focus and was used for the passing application tests. Initial harness iterations also resolved an ambiguous `header` selector by targeting the global `banner`; application assertions and product guards were not relaxed.

The runner requires `--allow-dev-db` and rejects `NODE_ENV=production`. It creates a randomly named, verified QA account and a hidden course, prepares a default path locally with `goal-skip` / `fork-default`, and sends no email or AI generation request. It does not modify existing identities, courses, progress or schema.

`finally` removes only the run-owned account/course/activity and verifies no owned sessions, study clocks or study-day rows remain. **Every completed fixture run, including harness failures, reported cleanup.** The sandbox-denied attempt failed before fixture creation. These checks provide current author QA evidence; CI and reviewer acceptance on the pushed head remain separate from merge approval.
