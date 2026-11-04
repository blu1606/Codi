# Phase 3 report: Codi feature branches and the switch from simulations to the real backend

Status: done (2026-11-03). The three branches are in the rebuild. Knowledge-map analysis, AI grading suggestions and
GitHub profile corrections now use the real backend. The simulations they replace are removed. There are no new
migrations or env keys.

Checks:
- `npx tsc --noEmit` is clean and the full `vite build` passes.
- Smoke 64/64. Flow OK as `usr-learner-001`.
- `docker build -t codi-rebuild:branches .` succeeds.
- New browser check `scratchpad/e2e/branches.js` (parts A–D) passes.

## Per-branch merge result

The three-way merges used `base = merge-base(develop, branch)` instead of `origin/develop`. With develop as the base,
everything develop gained after a branch forked would have looked like the branch deleting it. This mattered most for
`feat/auto-knowledge-map-analysis`, which forks from `main` 124 commits behind develop and re-ports the worker that
develop already has.

| Branch | Backend result |
|---|---|
| `feat/github-profile-corrections` (2 commits) | Nothing to merge. Develop's tip `ecc21c76` is this branch squashed. The only direct difference from develop is `packages/db/src/seed-loadtest-accounts.ts` (k6 tooling, never vendored). Phase 1 already brought the `corrections` and `profile` routes, `saveCorrections` / `deleteProfile` in the store, and the worker's `summaryOnly` path. The rebuild's 150 s lease stays the only difference in `github-profile-store.ts`. |
| `feat/ai-grading-suggestions` (2 commits) | Nothing to merge. `lib/ai-grading-draft.ts` and `grading/actions.ts` (`getAiGradingDraft({submissionId, viewToken})`) are byte-identical to the branch since phase 1. |
| `feat/auto-knowledge-map-analysis` (12 commits) | Only its last three commits are new compared with develop (`59b967c2`, `92a64da4`, `c797f8b0`). The rest are the worker port, already in develop, plus CI, deploy and Dockerfile changes, which were skipped. Merged in `c23a4bf`: `course-queries.ts` queues a `knowledge_map` job after every successful content write (errors are logged and the save still succeeds). The new `lib/knowledge-map-jobs.ts` holds `enqueueKnowledgeMapAnalysis` and `enqueueLatestKnowledgeMapAnalysis`. `knowledge-map-worker.ts` requeues when the content changed while a job ran or failed. The rebuild's files equalled the base for these, so the result is the branch's code. No Dockerfile or compose change was needed because the worker already runs in the API process. |

Quiz AI: the branch does not change `quiz-ai-dialog` or `quiz-ai-actions` beyond what develop has. The rebuild's quiz
review already calls the real `generateAiQuizQuestions` action, so nothing changed there.

## Backend fix found while testing

`src/host/next-routes.ts` passed the Node request stream as the body of every non-GET request. Route handlers
therefore saw a non-null `request.body` on a body-less `DELETE`. `DELETE /api/github-profile/profile` (and the
existing unlink route `DELETE /api/github-profile`) reject any body and answered 400. The fix forwards a body only
when the request declares one (`content-length` > 0 or `transfer-encoding`), which matches Next.js (`2f8d4d9`).

## Simulations removed

| Was | Now |
|---|---|
| `POST /api/lecturer/courses/:id/kmap-analysis` + `simulateKnowledgeMapAnalysis` (deterministic concepts, `knowledgeMapModel: "simulated"`) | Deleted. `Codi.lecturerAI.runKnowledgeMapAnalysis` calls the `runKnowledgeMapAnalysis` action and returns `{ok, jobId}`. Queue refusals (`AI job enqueue failed: active_job / daily_limit / store_failed`) are mapped to Vietnamese messages. The kmap tab polls `getKnowledgeMapData` every 5 s while the map is `analysing` and toasts when it becomes ready. It shows Codi's "Bản đồ do AI đề xuất" notice, plus a note that saving content queues a new analysis. `analysisAvailable` false (worker off) keeps the trial state. |
| AI grading job simulation (`grading-jobs.js`, `grading-draft-logic.js`, localStorage `codi-ai-grading-jobs`, "Mô phỏng" badge) and the dead `gradeSuggestion` helper | Deleted. `grading-ai.jsx` calls `getAiGradingDraft({submissionId, viewToken})`. It shows a loading state (elapsed time, "Dừng") and then a review card: Chấp nhận / Sửa / Bỏ qua per criterion and for the feedback, plus "Điền vào phiếu chấm", "Gợi ý lại" and "Bỏ qua gợi ý". On failure it shows the server's error and "Thử lại". Suggestions live in memory for the tab and are tied to the view token. The list badge is "Có gợi ý AI". `grading-page.jsx` passes `viewToken`. |
| GitHub panel had no corrections or delete | "Sửa hồ sơ năng lực" opens `CorrectionsEditor` (in `github-report.jsx`), where the learner can exclude repos, set a technology's usage, or hide a technology. It sends `PATCH /api/github-profile/corrections` with the full corrections, keeping area edits, and then shows the re-projected profile. When the exclusions changed, the panel polls the summary-only job (`waitForSummary`, 4 min timeout). "Xoá hồ sơ năng lực" calls `DELETE /api/github-profile/profile` after a confirmation and keeps the link. Codi has no UI for these routes, so the layout and copy are the rebuild's own. The labels avoid the profile page's existing "Chỉnh sửa hồ sơ" button. |

## Remaining simulations (not covered by these branches)

- Lecturer AI document import, AI lesson drafts and AI code-exercise drafts (`lecturer-ai-api.jsx`,
  `lecturer-ai-create.jsx`, `ai-bank.js`). They still follow the Alt+K `aiAssistant` flag.
- SePay payment (`DEMO_TOOLS`) and the PDF/slide page viewer.
- The Alt+K `kmap` flag (`lib/codi.js`, outside this phase's files) has no effect any more. Removing it from the
  drawer is left to the owner of that file.

## Verification

`scratchpad/e2e/branches.js` (real AI, lecturer `usr-lecturer-001`):

- A (knowledge map): `course-solid-001` started rejected and `stale`, with confirmation blocked. "Phân tích lại" ran
  the job in about 10 s, giving 6 concepts and 3 edges with status `ready` and the map confirmable. Accept-all
  produced no cycle, and the confirmation stored `confirmed`. The publish tab then read "Bản đồ kiến thức đã xác
  nhận", so the lecturer can publish again. No console errors.
- B (auto-analysis): `renameLesson` with the same title set the status to `analysing`. The tab showed the running job,
  polling picked up `ready` after about 10 s, and the map was confirmed again.
- C (grading): submission 14 (text answer, 4-criterion rubric) got real scores and feedback. Edit, ignore and accept
  filled the form as expected, nothing was saved, and the queue badge appeared.
- D (GitHub): I inserted a temporary linked `account` and a published `github_profiles` row for `usr-learner-002`.
  The fixture was validated with `projectGithubProfile`. Excluding `api-express` and setting React to "Dùng sâu"
  returned `PATCH 200` with a `summaryJobId`. The summary job completed in about 7 s. The report showed "Bạn đã
  loại" and "Bạn đã sửa", and the Express evidence was gone. Delete returned `{deleted:true}` and the panel still
  offered "Phân tích GitHub". Afterwards I deleted the temporary account row and that learner's `github_profile` job.
  No GitHub rows remain.

Data touched by the checks: `course-solid-001` now has a confirmed AI map (it was stale). Two `knowledge_map` jobs were
used today by `usr-lecturer-001`. The flow script bought `course-react-001` for `usr-learner-001`, as it always does.
`npm run seed` was not run.

## Deploy

No new migration and no new env key. The release needs only the image. Phase 1's two migrations still have to be
applied if production has not run them yet. `AI_DAILY_JOB_LIMIT` (default 5 per lecturer and day for knowledge-map
and quiz jobs) now also counts the analyses queued by content saves. They are coalesced to one active job per course.
