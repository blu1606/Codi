# Phase 2 report: lecturer + lecturer-ai

Status: done. Every lecturer screen reads and writes through the backend. No lecturer screen reads or writes `Codi.db()` / `Codi.set()` any more. Verified in the browser as `usr-lecturer-001`: 22 routes render with data and no console errors, and every write below still shows after a full reload.

## Screens ported

| Screen | Backend used |
|---|---|
| `/teach` home, `/teach/courses` list, workspace nav counts | `dashboard/lecturer` `getLecturerCourses('all')`, `getLecturerDashboardStats` (cached in `teach-data.js`, refreshed after writes) |
| `/teach/new` create course | `createCourseDraft`; categories are the fixed Codi list (names, not legacy ids) |
| Course editor header, authoring rail, Nội dung tab | `getCourseEditorData` + `GET /api/lecturer/courses/:id` (outline, new) + `publish/getPublicationData` (readiness, latest round); `addChapter`, `renameChapter`, `moveChapter`, `deleteChapter`, `addLesson`, `renameLesson`, `moveLesson`, `deleteLesson` (+ undo with `restoreLesson`) |
| Drag and drop | Repeated `moveLesson` / `moveChapter` steps. Dropping a lesson into another chapter shows a warning, because Codi has no cross-chapter move. |
| Delete course | `DELETE /api/lecturer/courses/:id` (new). Allowed only for an own course that is not published and has no enrolments. |
| Thông tin tab | `updateCourseInfo` |
| Lesson editor sheet | `getLessonDetails`, `updateLesson` (materials by URL). The assignment builder uses `GET/PUT /api/lecturer/courses/:id/lessons/:lessonId/assignment` (new). |
| Thêm bài học menu | `addLesson`. A tutorial lesson also gets `PUT …/tutorial` with one blank step; a code lesson opens the code editor. |
| Quiz builder (`/quiz/:lessonId`, `/quiz/entry`) | `getQuizBuilderData`, `saveQuizData` |
| Knowledge map tab | `kmap` actions: `getKnowledgeMapData`, `reviewKnowledgeMapItem`, `renameKnowledgeMapConcept`, `addKnowledgeMapEdge`, `acceptAllKnowledgeMap`, `confirmKnowledgeMap`. Analysis uses `POST /api/lecturer/courses/:id/kmap-analysis` (new, see below). |
| Xuất bản tab | `getPublicationData`, `submitCourseForPublication`, `markFlagFixed`, `reopenFlag` |
| Code editor (challenge) + preview | `code/getCodingExerciseData`, `verifySolutionCode` ("Chạy thử"), `saveCodingExercise` (the server verifies again), `runPreviewCode` (preview), `generateAiCodingTestCases` ("Gợi ý test biên") |
| Code editor (guided tutorial) + preview | `GET/PUT /api/lecturer/courses/:id/lessons/:lessonId/tutorial` (new); step tests run through `verifySolutionCode` |
| AI quiz generation | Real `generateAiQuizQuestions` (LLM via the backend key). Alt+K `aiAssistant` flags still simulate failures on the client. |
| AI document import / AI lesson + code drafts | Content is still simulated on the client (file extraction and generation). Applying a draft writes through `updateLesson` / `saveQuizData` / `addLesson`. An AI code draft opens in the editor and is saved through `saveCodingExercise`. |
| `/teach/grading` | `grading/getGradingQueueData` (filters, selected submission, view token, next pending), `gradeSubmission` (rubric or single score, edit reason, history) |
| Snippet picker, `/teach/snippets` | `snippets` actions (get / create / update / delete / restore-as-undo) |
| `/teach/questions` | `questions` actions: `getLecturerQuestionsData`, `replyToPublicQuestion`, `replyToPrivateConversation`, `resolveConversation`, `reopenConversation` |
| `/teach/reviews` | `reviews` actions: `getLecturerReviewsData`, `replyToCourseReview`, `deleteCourseReviewReply` |
| `/teach/progress`, `/teach/progress/:id` | `progress/getLecturerCoursesProgress`, `getCourseLearnerProgress`. The support signal adds unanswered questions from `getLecturerQuestionsData`. "Nhắn" posts to `POST /api/lecturer/courses/:id/learners/:userId/message` (new, in-app notification). The "Bài code" tab reads `GET /api/lecturer/courses/:id/code-stats` (new). |
| `/teach/insights` | `insights/getLecturerInsightsData` |

## Backend additions (all new files, no vendored file changed)

- `backend/src/lib/lecturer-authoring.ts` holds the helpers behind the new routes. Writes go through Codi's `withCourseContentWrite`, so ownership, the pending-review lock and map staleness follow Codi's rules.
- `backend/src/lib/assignment-rubric.ts` has `parseRubric`. It reads a JSON rubric or a seed markdown rubric ("- Name (N điểm): desc").
- Routes under `backend/src/app/api/lecturer/courses/[courseId]/`:
  - `route.ts`: GET outline, DELETE course.
  - `lessons/[lessonId]/assignment/route.ts`: GET and PUT.
  - `lessons/[lessonId]/tutorial/route.ts`: GET and PUT.
  - `kmap-analysis/route.ts`: POST.
  - `code-stats/route.ts`: GET.
  - `learners/[userId]/message/route.ts`: POST.
- Simulated kmap analysis: Codi's `runKnowledgeMapAnalysis` is disabled, and Codi refuses to confirm a map once course content has changed since the last analysis (`knowledgeMapAnalysisGeneration !== knowledgeMapContentGeneration`). Without an analysis, any course edited after its last analysis could never be confirmed or submitted. The new route keeps the mockup simulation and stores it in the database:
  1. It sets every existing concept and edge back to "suggested".
  2. Each uncovered lesson gets a concept, chained in authored order.
  3. The map's status becomes `ready` for the current content generation.
- `backend/scripts/normalize-assignment-rubrics.ts`: the seed stores assignment rubrics as markdown, but Codi's `gradeSubmission` needs JSON criteria, so grading any seeded rubric assignment failed with "Thang điểm rubric không hợp lệ". The script converts the markdown rubrics to JSON and is safe to re-run. I ran it once on `codi` (6/6 converted).

## Stays client-side or simulated, and why

- **AI grading job card.** It stays a simulation because Codi's `getAiGradingDraft` always fails. Jobs now live in the browser (`localStorage` `codi-ai-grading-jobs`) rather than the legacy store. The submission and rubric come from the grading page.
- **Concept suggestions in the document-import sheet.** These were removed. Codi has no action that adds concepts outside an analysis; the kmap tab's "Phân tích nội dung" covers this.
- **Late-submission policy and accepted file types** in the assignment builder. Codi has no columns for them, so they stay on the draft only and are not saved.
- **Lesson "AI soạn" badge and per-question AI-reviewed state.** Codi does not store these, so they are not shown after a reload.
- **Tutorial preview.** It is now a read-only walk-through of the saved steps. The learner player only runs code for enrolled learners through the backend; lecturers test steps from the editor.

## Shared-file changes needed (controller)

- `frontend/src/features/learning/lesson-assessments.jsx:391-393` prints `a.rubric` as raw text. Assignment rubrics are now JSON (`[{id,name,desc,points}]`, as Codi's grading expects), so learners would see JSON. Render it as a list there.
- `backend/scripts/seed.ts` should call `normalizeAssignmentRubrics()` (exported by the new script) after `seed-mockup.ts`, or the exporter should emit JSON rubrics. Otherwise a reseed brings back markdown rubrics and grading breaks again.
- E2E: two new scripts sit in the scratchpad, `e2e/lect-port-smoke.js` (all lecturer routes) and `e2e/lect-port-flow.js` (write flows). smoke.js and flow.js were not touched; they could import these.

## Browser runner (features/coding)

The lecturer area no longer calls the browser runner. From `Codi.code` it uses only UI pieces: `editor`, `onInput`, `testRow`, `consoleView`, `stableJSON`, `rememberFocus`, `restoreFocus`. It no longer calls `Codi.code.run`, `grade`, `runTests`, `task`, `blank` or `view`. If the learning area does not use those either, they and `code-runner.js` can be deleted in Phase 3.

## Verification

- `npx vite build`: passes. `backend: npx tsc --noEmit`: clean.
- The smoke run covers 22 lecturer routes and passed with no console errors.
- The flow script runs as `usr-lecturer-001`. Each step reloads and re-checks:
  - Lesson description and Thông tin price persist after a reload.
  - The entry test gets 5 imported questions, saved.
  - Knowledge map on `course-ts-001`: re-analyse, accept all, decline the seeded loop edge, then confirm.
  - Submit for review: `course-ts-001` is now **pending**.
  - Grade the first pending submission (score + feedback) and see it on the Đã chấm tab.
  - Answer a question.
  - Create a snippet.
  - Add an assignment with a rubric to `course-solid-001` lesson 1.
  - On the code challenge: "Chạy thử", save, then preview run.
  - Save the tutorial and open its preview.
  - Create a course → add a chapter → add a lesson → delete it with undo.
- Data the tests changed in `codi`:
  - `course-ts-001` is pending.
  - One submission is graded and one question is answered.
  - A test course "Khoá e2e …" was created.
  - A test snippet and the `course-solid-001` lesson-1 assignment were added.

## Unresolved questions

- Should the seed's rubric fix go into `seed.ts`, or into the exporter (preferred)?
- `course-ts-001` was moved to pending by the test. Should the admin flow approve or reject it, or should it be reset by a reseed later?
