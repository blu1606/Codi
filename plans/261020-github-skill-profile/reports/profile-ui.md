# Direct-request GitHub profile UI handoff

Date: 2026-10-20. Status: DONE_WITH_CONCERNS; implementation returned for Lead acceptance, not feature/live acceptance.

Workspace: `D:/CODE/Study/FPT/Ki_5/SWP391/Codi-github-import-261020`.
Original base: `98b9ea4fd3b42c3a7494adc9e335167a70f547e7`.
The immutable local candidate SHA is returned in the handoff message; this report is part of that candidate.

## Owned paths and consumer contract

- `apps/web/src/app/profile/github/page.tsx`
- `apps/web/src/app/profile/github/page.test.ts`
- `apps/web/src/components/profile/github-profile-panel.tsx`
- `apps/web/src/components/profile/github-profile-panel.test.ts`
- `plans/261020-github-skill-profile/reports/profile-ui.md`

No shared profile/settings/dashboard/auth, API, collector/projection, schema, AI, dependency or configuration edits. Concurrent lockfile and AI-owner work was left untouched. This is one bounded UI consumer, not a substitute endpoint.

The server page follows existing `getSession` / `getActiveRoles` / `ROLE.LEARNER` patterns. No session redirects to `/login`; no active learner role redirects to `/dashboard`. Auth and role checks run server-side; the POST endpoint must independently enforce session, role, consent and linked-account ownership. The page itself does not collect GitHub, look up linked accounts or read stored profiles.

The default-export panel is reusable without props. It sends exactly one relative, same-origin-credential POST to `/api/github-profile`, after explicit confirmation:

```json
{"consentVersion":"public-github-v1","githubProfileInput":"optional trimmed username or profile URL"}
```

Success consumes `{profile: GithubProfileProjection}` from the accepted projection boundary. Failure consumes `{error, code, retryAt?}` and displays it as escaped text. No raw model output should be passed as the success projection; semantic/provenance validation remains the owning service's responsibility. No authentication token or client-provided user/account ID is sent. Input is intent only, not ownership proof; displayed GitHub login comes from the server projection.

The real POST endpoint is Lead-owned. This handoff does not claim a working end-to-end URL before that endpoint is wired.

## Behavior and parity boundaries

- Opening the page/dialog, typing, closing or choosing **Để sau** starts no analysis/auth request. The consent explicitly lists public profile/repositories, language/manifests/README, skips forks/empty repositories, and states **Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia sẻ với giảng viên**.
- No query/callback-triggered analysis, polling or automatic retries. During an analysis, duplicate requests are prevented and the prior displayed result remains visible. Error/timeout does not clear that result.
- The 60-second client deadline covers transport and JSON-body reads. It aborts, releases busy state and explains uncertain server completion; it does not claim server-side cancellation or background completion. Late responses cannot replace the displayed result. Unmount aborts the client request and clears its timer.
- A `github_not_linked` response offers a separate connection action with its own Codi consent. Installed Better Auth source exposes session-bound `/link-social`; existing auth config enables GitHub account linking. The action uses `authClient.linkSocial({provider: "github", callbackURL: "/profile/github", errorCallbackURL: "/profile/github"})`, not `signIn.social`. No added scopes, client account selection or persistence semantics. OAuth return requires another explicit analysis confirmation. Linking failure messages do not echo upstream details. Real linking remains unverified.
- Deterministic observations, language bytes and declared dependencies remain separate from estimates. Usage/overall/confidence import the accepted labels. Estimates/areas are explicitly unverified inference; no mastery scale, scores or negative conclusions from missing files. Learner-edited usage carries **Bạn đã sửa**. All prose/quotes are plain React-escaped text, never HTML/Markdown renderers or automatic links.
- Only retained citation metadata can become an external link; the UI additionally permits only expected HTTPS GitHub commit-blob/API-language URL forms with no credentials, search or fragment. Quotes and model prose never supply links. Invalid citation metadata remains non-clickable. This URL check is not semantic verification or a replacement for server provenance validation.
- The result exposes collection date, selected/listed repositories, complete/partial/failed status, listing incompleteness, read issues, skipped/excluded repository metadata and missing/unavailable files. Empty partial output is not relabelled insufficient data or weakness.
- Uses semantic tokens, existing UI primitives, responsive wrapping and native evidence disclosures. The Codi/GitHub consent heading uses wordmarks plus Lucide book/repository symbols; no unsupported Lucide brand export, raw SVG exception or shared-logo edit.
- This isolated direct-request increment intentionally has no shared profile tab/navigation edits, correction/exclusion mutation controls, deletion/unlink, cooldown enforcement, course consumers, background notification or leave-safe completion promise. Those require Lead-owned service/product integration. The UI explicitly makes no save/reload/reopen claim.

## Actual verification

All runtime checks used the existing `.git/run-isolated.ps1 -TaskCommand ...` credential-free runner with direct installed Node binaries. No install, pnpm reinstall, DB, network, browser, OAuth/provider/model calls or push.

- Initial focused run: page guards 5 passed, panel 18 failed because the installed Lucide package has no `Github` export. Initial concurrent web typecheck reported that same missing export. Corrected source to supported repository icon; no dependency/config/test weakening.
- Corrected focused UI/page run: **23 passed** (18 panel, 5 page), exit 0.
- Final family command: `node node_modules/vitest/vitest.mjs run apps/web/src/app/profile/github/page.test.ts apps/web/src/components/profile/github-profile-panel.test.ts apps/web/src/lib/github-profile-analysis-contract.test.ts apps/web/src/lib/github-profile-extraction.test.ts apps/web/src/lib/github-profile-collector.test.ts` — **167 passed**, five files, exit 0.
- `node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false` — corrected source exit 0.
- `node node_modules/tsx/dist/cli.mjs scripts/check-design-standards.ts` — exit 0, zero violations.
- Existing web Prettier formatted the four owned source/test files; final `--check` exited 0. `git diff --cached --check` exited 0. Exact staged-path inspection showed only the five owned paths. Secret-pattern matches were URL-password rejection, same-origin credentials options and report prose, not secret values.

Tests use the real panel and accepted projection with synthetic transport/auth responses. They cover no-call consent paths, intent payload versus bound identity, all assigned failure statuses, old-result retention, stalled transport/body timeout, late-success rejection, unmount abort, separate linking consent, safe text/citation rendering, empty-partial neutrality and server-page guards. They are unit proof, not real-user acceptance.

Frontend/parity skills guided explicit consent, required vocabulary, evidence separation, semantic styling and visible reduced-scope limits. Code-review guidance was applied as self-review only; no independent review or technical acceptance is claimed. Browser/screenshots from the parity workflow were not run because the assignment prohibits them.

## Remaining evidence and ownership

Lead must wire and validate the exact POST contract and own server authorization, linked identity, token lifecycle, collection/model budgets and persistence. After wiring, the intended smoke entry is an authenticated learner opening `/profile/github`, optionally supplying an intent, then explicitly confirming. A URL alone does not prove that integration is ready.

No real blu1606 confirmation, OAuth return/cancellation, persistence/reopen, production build, E2E, mobile/light/dark screenshot, deployment or measured-capability criterion was exercised. No paid call authorized or performed. Error strings are server-authored untrusted text; service sanitization remains required.

Writer relinquishes all UI write ownership with the immutable candidate. Lead owns acceptance and subsequent integration. Rollback is source-only for the five owned paths; no persisted data was changed.
