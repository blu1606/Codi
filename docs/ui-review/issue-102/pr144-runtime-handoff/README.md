# PR #144 — runtime evidence handoff, 22/10/2026

Addresses [the remaining review](https://github.com/blu1606/Codi/pull/144#pullrequestreview-5601551646): retain the original build/start/heartbeat/cleanup output, bind a run to the exact runner source before execution, and verify lesson reload, continued accounting and the header inside the lesson player.

Application source and schema are unchanged. The product is pinned to `f92c73e4b8a5bee0f60bc96ba634e26fad6a6638` on develop `437c1e8df16969a54b1fb96f0ff3e02a09c15e7a`; the runner and this evidence packet are the follow-up changes. The fresh production build completed with **exit 0**, recorded in [build.log](current/build.log) and its [process metadata](current/build.log.json). The new server uses that build's `BUILD_ID`, captured in [execution-manifest.json](current/execution-manifest.json).

## Original artifacts recovered

- [Original command invocations](historical/command-invocations.json), including failed attempts; a command invocation alone is not evidence of success.
- [Build result chunks](historical/build-tool-output.json), including the observed final exit 0.
- [Production start chunk](historical/server-tool-output.json); this is the retained startup output, not a claim that all historical server stdout survives.
- [Heartbeat/cleanup chunks](historical/heartbeats-tool-output.json), including the original same/different-lesson results and exit 0.
- [Subsequent UI-only run/cleanup](historical/visual-tool-output.json), kept separate from the heartbeat run.
- [Actual later runner patch](historical/post-heartbeat-runner-change.patch) and [snapshot limitation](historical/runner-reconstruction-status.json). No runner copy/hash was captured before that historical run; the later manifest cannot certify the exact historical bytes. No native Playwright ZIP trace was recorded then. These missing artifacts are not fabricated or relabelled as contemporaneous snapshots.

The retained tool results preserve original timestamps, call IDs, chunk IDs and exit codes. Private network interface addresses are redacted as documented in [redactions.json](redactions.json).

## Fresh observation and source binding

The new run saves the runner, fixture helpers, header, tracker, service, accounting contract and lesson player **before creating the fixture**, with SHA-256 hashes. [Frozen sources](current/source/apps/web/scripts/verify-study-activity-browser.ts) and the pre-run manifest belong to this exact invocation; subsequent screenshot changes are not mixed into it. Git verifies that product source matches the pinned head. Raw source bytes are preserved by `.gitattributes` to avoid LF/CRLF checksum drift.

[runtime-events.ndjson](current/runtime-events.ndjson) is a chronological event log collected by the runner, not a reconstructed summary or a native Playwright trace archive. It records native browser focus/visibility observations, actual activity request payloads and HTTP/JSON responses linked by request ID, PostgreSQL clock/seconds reads, reload boundaries, assertions and cleanup. It deliberately excludes credentials, cookies, authorization headers and browser storage. Stable aliases preserve relationships between QA user/course/lesson/tracker IDs. Request bodies, recorded flags and database timestamps are observed rather than replaced.

Two-tab cases hold A's initial request before processing, give B actual focus, release A's obsolete start/stop, then wait for two real 30-second timer ticks. Both same-lesson and different-lesson cases require B's owner to persist and persisted seconds to equal the difference between server timestamps exactly. The only interception delays A's request; responses, timers and database clocks are not mocked or backdated.

The lesson checks run at **1280×800 / 375×844**, each in light/dark. Each reload must acquire a different tracker token, record a real following heartbeat, preserve the new owner, credit the exact server-time interval, and stop on navigation. They also check the loaded account/notification controls, lesson title/navigation, header bounds, no page overflow and the mobile global menu inside the player. The existing dashboard/progress/profile matrix is included in the same invocation.

| Lesson-player evidence     | Desktop light                                      | Desktop dark                                      | 375px light                                          | 375px dark                                          |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Reloaded player and header | [Image](current/lesson-reloaded-desktop-light.png) | [Image](current/lesson-reloaded-desktop-dark.png) | [Image](current/lesson-reloaded-mobile-light.png)    | [Image](current/lesson-reloaded-mobile-dark.png)    |
| Global menu inside player  | —                                                  | —                                                 | [Image](current/lesson-header-menu-mobile-light.png) | [Image](current/lesson-header-menu-mobile-dark.png) |

Mockup references and the broader state matrix remain in [the module report](../../../learner-dashboard-progress.md#visual-review). This is focused follow-up evidence for S11/S12/S13, not a fresh certification of every lesson type, quiz/assignment state or sibling PR.

## Results, cleanup and limits

The completed run has **exit 0**, two passing two-tab cases, four passing reload cases, 12 dashboard/progress/profile checks and 20 settled screenshots. Both two-tab cases credit **29 + 30 = 59 seconds** after B acquires ownership. Reloads credit **29 / 29 / 30 / 29 seconds** (desktop light/dark, mobile light/dark), calculated from actual server timestamps. No page errors, same-origin HTTP responses ≥400 or unexpected generation/onboarding requests were observed. Fresh TypeScript, runner formatting and standards checks pass with **0 design violations**. The offline inspector verifies **86 artifact hashes, 8 frozen sources and 187 observed events**, including an independent credit calculation from the stored timestamps and second totals.

See [browser-report.json](current/browser-report.json), [unabridged browser stdout/stderr and cleanup](current/browser-cleanup.log), and the [actual child exit code](current/browser-cleanup.log.json). Build/start logs are collected directly from the spawned processes. This is author QA; reviewer acceptance and merge approval remain separate.

The verified QA server PID was deliberately stopped after the passing run and cleanup. Its recorded process code `4294967295` is the Windows termination result of that explicit shutdown, not a build result. It is preserved in [server.log.json](current/server.log.json); the separate build and browser commands both exited 0.

The runner creates only a random verified QA identity and hidden course, uses local `goal-skip` / `fork-default` transitions, and removes its own fixture in `finally`. Cleanup queries assert zero remaining owned users, accounts, courses, enrollments, activities, sessions and study clocks/days. It sends no email and does not exercise goal saving, path regeneration or AI providers. No migration or existing user/course/progress data is changed.

Failed harness attempts are retained under `attempts/`, with their original runner snapshots when available. The first attempt stopped before fixture creation because the elevated Git process rejected worktree ownership. A scoped `safe.directory` argument for this checkout fixes source pinning without changing global Git configuration. The next attempt exposed TSX's `__name` serialization issue in the focus observer; the observation script is now a JavaScript string with no injected Node helper. These attempts are not presented as passing application runs.

No blanket clean-console claim is made: the runner checks page errors, failing application HTTP responses and unexpected generation/onboarding requests; server warnings remain in the logs. The previously accepted full unit/CI run remains **1,575 tests / 89 files**; this follow-up does not claim a new full unit-suite run.

## Reproduce and inspect

Build/start the pinned checkout as a production server at `http://localhost:3144` with matching `BETTER_AUTH_URL`. From `apps/web`, using the existing migrated development database:

```powershell
$env:CHROMIUM_PATH = '<current Chromium>/chrome.exe'
$env:QA_OUTPUT_DIR = '<new empty artifact directory>'
node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/verify-study-activity-browser.ts --allow-dev-db
```

The runner rejects `NODE_ENV=production` for fixture creation. `--skip-two-tabs` excludes only the two-tab cases and still performs reload/tracking; such a run does not replace the full evidence here. Use the provided `tools/capture-command.mjs` wrapper to retain stdout/stderr and process exit metadata.

From the repo root, inspect the immutable packet without browser or database access:

```powershell
node docs/ui-review/issue-102/pr144-runtime-handoff/tools/verify-evidence.mjs
```

The inspector verifies packet/source hashes and independently recomputes credited seconds from observed database snapshots. [artifact-manifest.json](artifact-manifest.json) indexes the files in this handoff.
