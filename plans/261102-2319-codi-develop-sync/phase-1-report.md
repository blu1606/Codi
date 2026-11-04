# Phase 1 report: backend sync with Codi develop

Status: done (2026-11-02). `backend/` now matches Codi `origin/develop` (`ecc21c76`) for every vendored file, with the
rebuild's own changes kept. Two new migrations applied, the AI jobs worker runs inside the API process, and the four
frontend callers of removed routes use the new Tutor routes. Checks: `npx tsc --noEmit` clean, `vite build` ok,
smoke 64/64, flow OK (after a reseed), `docker build -t codi-rebuild:sync .` ok and the image boots with the worker,
`npm run seed` ok. One real AI turn on each Tutor surface and one worker job (quiz generation, 9 s) ran end to end.

## Method

Three-way merge per vendored file: base `6898548b`, theirs `origin/develop`, ours = the rebuild. Paths map as in the
backend port (`apps/web/src/{lib,app}` → `backend/src/{lib,app}`, `apps/web/src/services.ts` → `backend/src/`,
`apps/web/scripts` → `backend/scripts`, `packages/*` → `backend/packages/*`). Tests and Next pages/components that were
never vendored are skipped.

| Result | Files |
|---|---|
| Taken from develop (ours was the base) | 32: `api/courses`, `learn/.../conversations`, `learn/.../discussions`, `orders/checkout` routes; lecturer `courses/[courseId]`, `code`, `kmap`, `grading` actions; lib `add-course-to-cart`, `ai-advisor-contract`, `ai-advisor-service`, `ai-tutor-contract`, `ai-tutor-runtime`, `ai-tutor-service`, `ai/providers/gemini-provider`, `assessment-contract`, `assessment-service`, `cart-service`, `checkout-cart`, `coding-service`, `github-profile-ai`, `learner-insights-service`, `learning-path-contract`, `learning-path-runtime`, `learning-path-service`, `lesson-qa-service`, `tutorial-service`; `services.ts`; `packages/coding-runner/{index.d.ts,index.mjs,package.json}`; `packages/db/src/schema/index.ts` |
| Merged cleanly (both sides kept) | `api/github-profile/route.ts` and `lib/github-profile-service.ts` (develop's background-job path + the rebuild's 150/90/50 s budget, `maxDuration` 160, route abort 150 s); `packages/auth/src/index.ts` (develop's `process.env` fallbacks for Resend + the rebuild's log-the-OTP fallback) |
| Conflicts resolved by hand | `lib/github-profile-store.ts`: lease is `job ? 210 s (develop's background value) : 150 s (rebuild)`. `packages/db/package.json`: kept the rebuild's (no varlock/catalog scripts; develop only added a load-test seeder script and a `better-auth` devDependency for it). `lib/buy-now.ts`, `lib/course-ownership-server.ts`: took develop's version, see below |
| Added from develop | 31 files: routes `api/ai/{chat,chats,chats/[chatId],intake,lesson}`, `api/github-profile/{corrections,profile}`; action module `courses/[courseId]/quiz-ai-actions.ts`; lib `ai-chat-contract`, `ai-chat-service`, `ai-grading-draft`, `coding-run-lease`, `github-profile-budget`, `github-profile-worker`, `knowledge-map-extraction`, `knowledge-map-worker`, `learner-intake-contract`, `learner-intake-service`, `learning-path-worker{,-attempt,-claim}`, `quiz-ai-generation`, `quiz-ai-worker`; `packages/db/src/{ai-jobs,ai-worker}.ts`, `schema/{ai-chat,ai-jobs}.ts`, migrations `20261027101706_ai_chats`, `20261031033253_free_toad` |
| Not added | `packages/db/src/seed-loadtest-accounts.ts` (k6 load-test tooling); `apps/web/scripts/ai-worker.ts` (its handler set lives in `backend/src/host/ai-worker.ts`) |
| Deleted (develop deleted them; nothing in the rebuild imports them) | routes `api/ai` (GET/POST advisor), `api/ai/feedback`, `api/learn/[courseId]/lessons/[lessonId]/tutor`, `api/learn/[courseId]/tutor/threads`; lib `ai-advisor-ai`, `ai-tutor-ai` |
| Kept, unchanged upstream | port 3001 / `BETTER_AUTH_URL`, `src/env.ts`, `DEMO_TOOLS` + `/api/dev/simulate-payment`, `server.ts` (static `WEB_DIST`, `x-forwarded-proto`), rebuild routes (`api/admin/*`, `api/lecturer/**` incl. `kmap-analysis`, `api/student/profile/summary`, `api/courses/[slug]/lesson-kinds`), publication review (schema `publication.ts`, `publication-service`, `publication-course-data`, admin/lecturer publish actions), seed scripts (`seed-mockup*.ts`, `seed-quiz-revision.ts` unchanged upstream) |

Stale pending payment: develop's c5963d10 ("resolve course ownership strictly against active pending") fixes the same
bug as the rebuild's fix (a legacy `student_transactions` mirror row of a failed/expired order resurrecting
"pending-payment"): it ignores mirror rows whose order is not pending and rows older than 30 minutes. The rebuild's
version was dropped for develop's.

Rebuild changes outside the vendored code:
- `src/host/server-actions.ts` also mounts `"use server"` files named `*-actions.ts`, keyed `<folder>/<file-name>`
  (develop's `quiz-ai-actions.ts` → `dashboard/lecturer/courses/courseId/quiz-ai-actions`). 81 actions in 14 modules.
- `src/env.ts`: `AI_BACKGROUND_WORKER_ENABLED` (default `true`, written back to `process.env` because develop's code
  reads it there) and `AI_DAILY_JOB_LIMIT` (unset/empty → develop's default 5; an empty value would otherwise fail
  closed). Both in `.env.example`.
- No new npm dependencies: develop only added `@lhci/cli` (CI) and the db devDependency above; `quickjs-emscripten`
  was already a coding-runner dependency.

## Migrations

| Folder | From | Content |
|---|---|---|
| `20261027101706_ai_chats` | develop | `ai_chats`, `ai_chat_messages`; copies existing `ai_tutor_messages` threads into lesson chats |
| `20261031033253_free_toad` | develop | `ai_jobs` (queue with leases, one active job per type/user/resource) |
| `20261102155311_publication_review_anchors` | rebuild | unchanged SQL; `snapshot.json` regenerated |

The rebuild's migration was a third branch off `github_reservation_per_request`. It was regenerated with
`drizzle-kit generate` on top of `free_toad` (SQL byte-identical, snapshot `prevIds` = free_toad) and kept under its
original folder name, so databases that already applied it see no change. A second `drizzle-kit generate` reports no
drift. drizzle-orm 1.0-rc tracks applied migrations by folder name, so the two older develop migrations ran on the
local DB after the rebuild's (backup `../.codi-gc-preserved/db-backups/codi-261102-develop-sync.dump`), and a fresh DB
(`npm run seed`) applies all 20 in folder order.

## AI jobs worker

Runs inside the API process (simpler than a second compose service: one container, same env, no new deploy step).
`backend/src/host/ai-worker.ts` registers develop's handlers (`github_profile`, `knowledge_map`, `quiz_generation`, and
pending learning paths between jobs, lease 300 s); `server.ts` starts it when `AI_BACKGROUND_WORKER_ENABLED=true` and
stops it on shutdown. On by default in dev (`env.ts`), in the image (`Dockerfile` ENV) and in `deploy/compose.yml`
(`${AI_BACKGROUND_WORKER_ENABLED:-true}`, overriding the copy of Codi's env in `rebuild.env`). Documented in
`docs/getting-started.md` and `docs/deployment.md`.

Behaviour with the worker on (develop's): `POST /api/github-profile` answers `202 {job:{id,status:"queued"}}` and
`GET /api/github-profile` adds `job`; learning paths are generated by the worker instead of `after()`; lecturer
knowledge-map analysis (`runKnowledgeMapAnalysis`) and background quiz generation (`quiz-ai-actions`) become available.
Verified: a `quiz_generation` job queued through `startQuizGeneration` was claimed and completed by the in-process
worker in about 9 s (3 questions drafted).

## Frontend adapters (minimal; phase 2 replaces the Tutor UI)

| File | Change |
|---|---|
| `frontend/src/lib/ai-chat.js` (new) | `streamAiChat()` reads the UI message stream of `POST /api/ai/chat` (text deltas, tool outputs, start messageId); `newChatId`, `messageText`, `toolOutputs` |
| `features/commerce/ai-advisor-page.jsx` | `POST /api/ai` → `POST /api/ai/chat` (general context, real streaming); course cards and comparison table from the `search_courses` / `compare_courses` tool outputs (order and follow-up chips are no longer produced); context from `/api/courses`, `/api/ai/intake`, `/api/learner/overview` instead of `GET /api/ai`; intake answers saved with `PATCH /api/ai/intake` (guests send them as the first history turn); votes with `PATCH /api/ai/chats/:id` (signed-in only; advisor-only 👎 reasons stay local) instead of `/api/ai/feedback` |
| `features/coding/tutor-api.jsx` | Lesson thread = `GET /api/ai/lesson` meta + the lesson's chat (`GET /api/ai/chats`, `GET /api/ai/chats/:id`, mapped to the old row shape incl. `suggest_code_change` diffs); ask and hint through `POST /api/ai/chat` (hint = `metadata.hint`); clear = `DELETE /api/ai/chats/:id`; vote/diff state = `PATCH /api/ai/chats/:id`; escalate = `POST /api/ai/lesson`. New export `courseThreads(courseId)` |
| `features/coding/tutor-page.jsx` | History from `courseThreads()` instead of `GET /api/learn/:courseId/tutor/threads` |
| `features/shell/github-api.jsx` | `analyseGithub()` follows a `202 {job}` by polling `GET /api/github-profile` every 3 s until the job completes or fails (timeout 4 min) |

Browser check (`scratchpad/e2e/tutor-sync.js`): `/ai` answer with 3 course cards + vote; lesson AI tab answer; Tutor
page lists the thread; no failed API calls or console errors. API check: hint 1 on a code lesson raises `hintLevel` to 1.

## New routes and actions (for phase 2)

Errors are `{error}` (Tutor routes use `learningFailure`: 400/401/403/404/410, 429 adds `retryAfter`). Writes need
`Origin` = request origin.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | /api/ai/chat | guest or session; lesson context needs lesson access | `{id: uuid (client-chosen chat id), context: {kind:"general",label,href\|null} \| {kind:"lesson",courseId,lessonId}, message: {id, role:"user", parts:[{type:"text",text≤2000}], metadata?:{hint:true}}, history?: ≤12 guest turns {id,role:"user"\|"assistant",parts}, lesson?: {mode:"simple"\|"step"\|"review", context:{task?,selection?,code?,error?,failingTest?:{name,input,expected,actual}}}}` | `text/event-stream` AI SDK UI message stream: `start{messageId}`, `text-delta`, `reasoning-*`, `tool-input-*` / `tool-output-available{toolCallId,output}`, `finish`; stored for signed-in users. Tools: general `search_courses → {courses: CourseCard[]}`, `compare_courses → {headers,rows}`, `get_my_learning` (signed in); lesson `search_course_material → {hits:[{title,chapter,href,excerpt}]}`, `get_my_progress`, `suggest_code_change → {ok:true,diff:{at,add[],context,state}} \| {ok:false,reason}`. 8 turns/min per user or IP → 429 |
| GET | /api/ai/chats | session | - | `{chats: [{id,kind:"lesson"\|"general",title,contextLabel,contextHref,courseId,lessonId,updatedAt}]}` (≤200, newest first) |
| GET | /api/ai/chats/:chatId | owner | - | `{chat: summary, messages: UIMessage[] (metadata {createdAt,hint?,stopped?,diffs?,vote,voteReason}), lesson: TutorLessonMeta\|null}` |
| PATCH | /api/ai/chats/:chatId | owner | `{type:"vote",messageId,vote:"up"\|"down"\|null,reason?: "Chưa đúng"\|"Khó hiểu"\|"Lộ lời giải"\|"Không liên quan bài"}` or `{type:"diff",messageId,toolCallId,state:"applied"\|"skipped"\|null}` | `{ok:true}` |
| DELETE | /api/ai/chats/:chatId | owner | - | `{ok:true}` |
| GET | /api/ai/intake | session | - | `{draft:{goal?:"project"\|"finish"\|"interview", level?:"new"\|"basic"\|"solid", hours?:2\|5\|10}}` |
| PATCH | /api/ai/intake | session | `{goal?,level?,hours?}` (null clears one) | `{draft}` |
| GET | /api/ai/lesson | learner with lesson access | query `courseId`, `lessonId` (uuid) | `TutorLessonMeta {courseId,lessonId,lessonTitle,isCode,hintLevel,lecturerName,conversation:{id,replied,resolved,lastReply}\|null}` |
| POST | /api/ai/lesson | learner with lesson access | `{courseId,lessonId,chatId:uuid\|null,escalation:{text≥10≤4000,code?,failingTest?,withSummary}}` | `TutorLessonMeta` (private conversation created, lecturer notified) |
| GET | /api/github-profile | learner | - | `{profile\|null, job?:{id,type,status,errorCode,createdAt,updatedAt}}` (`job` when the worker is on) |
| POST | /api/github-profile | learner | `{consentVersion:"public-github-v1", githubProfileInput?}` | worker on: `202 {job:{id,status:"queued"}}`; 409 `active_request` |
| PATCH | /api/github-profile/corrections | learner | `{corrections: {excludedRepositoryIds[], technologies[{technologyId,usage?,hidden?}], …}}` | `{saved:true, corrections, summaryJobId\|null}` |
| DELETE | /api/github-profile/profile | learner | - | `{deleted:boolean}` (keeps the GitHub link) |
| action | dashboard/lecturer/courses/courseId/quiz-ai-actions · `startQuizGeneration(courseId, lessonId\|"entry", count 1-10, difficulty, {sourceText?,focus?})` | course editor | | `{mode:"queued",id} \| {mode:"sync"} \| {mode:"error",message}` |
| action | … · `readQuizGeneration(courseId, lessonId, jobId?)` | course editor | | `{status:"none"\|"queued"\|"running"\|"failed"} \| {status:"completed",jobId,questions}`; save with `saveQuizData(…, {appliedAiJobIds})` |
| action | dashboard/lecturer/courses/courseId/kmap · `runKnowledgeMapAnalysis(courseId)` | course editor | | `{success:true,jobId}` (was "not available"); `getKnowledgeMapData` adds `course.analysisAvailable` |
| action | dashboard/lecturer/grading · `getAiGradingDraft({submissionId, viewToken})` | lecturer | | signature changed from `(submissionId)`; the rebuild's grading UI still simulates (phase 3) |

## Open issues

- The rebuild's `kmap-analysis` route and the AI grading drafts are still simulations; develop's real knowledge-map
  job and grading draft are now available for phase 3.
- `/ai` no longer gets follow-up chips, a "suggested order" list or a no-match flag from the backend (develop's chat
  does not produce them); phase 2's Tutor UI replaces the page.
- The GitHub copy still says "có thể mất đến 3 phút"; a background analysis can take up to about 3 min plus queueing.
- Production: `rebuild.env` needs nothing new; the release must run the migration step (two new migrations).
- Smoke had one transient miss right after `npm run seed` (64/64 on the immediate rerun).
