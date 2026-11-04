# Port report: lecturer-ai (code editor, AI quiz, knowledge-map AI, AI grading)

Date: 2026-11-02 (Asia/Bangkok). Owner: lecturer-ai agent. Plan: `plans/261101-2318-stage2-real-app-port/plan.md`.
Status: done. `npx vite build` passes. The seed patch loads. A stubbed-store check of the pure logic passes
(accept-all plan, cycles, topological order, quiz validator, generation contract, map analysis, read-only guard).

## Files

| File | Change |
|---|---|
| `src/features/lecturer-ai/code-editor-page.jsx` | Rewritten. The challenge editor follows the real builder. A new stateless lecturer preview replaces the learner view for challenges. |
| `src/features/lecturer-ai/lecturer-ai-api.jsx` | Uses the shared fact bank. `generateQuestions` always returns 4 options. `suggestTests` uses the real algorithm. The import sheet uses the real review gate. The file now imports the new modules. |
| `src/features/lecturer-ai/quiz-ai-review.jsx` | New. Adds `quizReview`, `generateQuizQuestions`, `validateQuestionDraft` and the `QuizReviewList` component. |
| `src/features/lecturer-ai/kmap-ai.jsx` | New. Adds `runKnowledgeMapAnalysis`, `acceptAllPlan`, `acceptAll` and `kmapGraph`. |
| `src/features/lecturer-ai/grading-ai.jsx` | New. Adds `getAiGradingDraft` and `gradingDraft`. |
| `src/features/lecturer-ai/ai-bank.js` | New. Holds the topic fact banks shared by every generator. |
| `src/features/lecturer-ai/lecturer-ai.css` | New. Small layout rules on the existing tokens. |
| `src/features/lecturer-ai/lecturer-ai-create.jsx` | AI code drafts set `solutionVerifiedAt` when the solution passes. |
| `src/features/lecturer-ai/routes.jsx` | Comment only. |
| `server/seed-source/patches/60-lecturer-ai.js` | New. Additive only. |

All existing `Codi.lecturerAI` and `Codi.teachCode` members keep their names and signatures:
`openImport`, `openCreate`, `generateQuestions`, `suggestRubric`, `suggestTests`, `gradeSuggestion`, `task`,
`factsFor` and `analytics`. Two return values changed shape:
- `suggestTests` now returns only tests the solution ran on. Every result has `ok: true`. It throws when the solution is empty.
- `generateQuestions` now always returns 4 options per question.

## Rows done

| Row | What was ported |
|---|---|
| A1 Editor shell (P1) | Tabs are `Đề bài`, `Code khởi đầu`, `Lời giải mẫu`, `Test case (n)` and `Gợi ý (n)`. The real headings and descriptions are used. The back link reads `Quay lại khoá học: …`. The duration accepts 1 to 180 (default 15). There is a language select with Python disabled. The file name defaults to `main.js`. When the course is pending, the badge `Đang chờ duyệt — Chỉ đọc` shows, an alert reads `Khoá học đang chờ duyệt` with the real body, every field is disabled and the run and save buttons are hidden. |
| A2 Test cases (P1) | Each test shows `Test #n` with the badge `Test ẩn (chỉ chấm khi Nộp bài)` or `Mẫu công khai (học viên nhìn thấy)`. The checkbox is `Ẩn test`. Labels and placeholders are the real ones. A new test is named `Kiểm tra n+1` and is public. Deleting is disabled at 1 test (`Bài tập cần ít nhất một test case.`) and needs no confirm (real). Instructions and hints have the same minimum of 1. |
| A3 Expected values (P1) | Real `normalizeExpectedValue`. Text that parses as JSON is stored as that value. Otherwise the trimmed text is stored as a string (`Codi` becomes `"Codi"`). The "must be JSON" error is gone. |
| A4 Run against solution (P1) | Header button `Chạy thử với lời giải` / `Đang chạy thử...`. Panel button `Chạy thử nghiệm ngay` / `Đang thực thi...`. Results read `Lời giải đạt x/y test` (`Đủ điều kiện lưu`) or `Chưa đạt: x/y test` (`Không thể lưu bài`), with per-test rows and a console. When there is no run yet, the panel shows `Chưa có kết quả chạy thử gần đây.` The real pre-checks and toasts are used. A run passes only when every test passes and the run finished (`phase` done). |
| A5 Save gate (P1) | `Lưu bài code` (`Đang lưu...`) runs the solution again at save time. It refuses the save with `Lời giải mẫu chưa vượt qua tất cả các test case (x/y test đạt). Không thể lưu bài tập.` A successful save stores `solutionVerifiedAt` and `solutionCheck` and shows `Đã lưu bài tập thực hành code thành công!`. If the lecturer edits during the save, the draft stays dirty (real revision rule). |
| A6 Save validation (P1) | Checks run in the real order with the real copy: title, instructions, solution, at least 1 test, JavaScript only, `Test N: chưa có tên hiển thị.`, `Test N: chưa có biểu thức gọi hàm.` and duplicate ids. The real test contract also applies: at least 1 public sample, at most 100 tests, call at most 10,000 chars and canonical expected value at most 4,096 chars. A broken contract shows `Bài tập chưa có bộ kiểm thử hợp lệ. Vui lòng liên hệ giảng viên.` The first error is toasted and its tab opens. Inline field errors are kept. |
| A7 Test delete guard (P2) | On save, removing a test that learners have results for is refused with the real copy. A test has results when its id is in `codeAttempts.failedTests` or in a submitted `lastRun`. |
| A8 Lecturer preview (P1) | New stateless page that writes nothing. Its header shows `Xem trước trải nghiệm học viên`, the badge `Chế độ mô phỏng học viên` and the course and lesson. It has a reset dialog with the real copy, `Chạy thử (Sample tests)` (samples only) and `Nộp bài (Tất cả tests)`. On submit, hidden tests appear only as the count card `Bộ test case ẩn (x/y đạt)` with `Đạt hết` / `Chưa đạt`. Other parts: brief and hints tabs (`Gợi ý #n`, with the empty state), result and console tabs, `100% ĐẠT` / `CHƯA ĐẠT`, and the real toasts. Tutorials still use the learner player (see skipped rows). |
| A9 Dirty banner (P2) | The real copy shows when the draft is dirty and the course is not locked. |
| A10 AI boundary tests (P2) | Real algorithm. It reads the function name from the solution (fallback `solution`), tries 6 candidate calls minus existing ones, runs the first 3 and keeps those that return. New tests are named `Trường hợp biên: <call>` and are hidden. They are appended straight to the draft (real). Button `Gợi ý test biên` / `AI đang tìm...`. The 3 real toasts are used. The Python simulation and the rate-limit state are removed. |
| A12 AI code and lesson drafts (P3) | Kept as a simulation. Code drafts are JavaScript, have public samples and set `solutionVerifiedAt`. |
| A16 AI quiz dialog (P1) | `Codi.lecturerAI.quizReview(props)` ports the real dialog: source radios, a paste box limited to 6,000 chars with a counter, focus up to 200 chars, count 3/5/8 (default 5) and difficulty (default `Vừa`). It shows the loading status and the 5 real error titles, with `Dán nội dung` for missing material and `Thử lại` when retryable. Review per item: `Chấp nhận`, `Sửa` / `Xong`, `Bỏ` and `Hoàn tác`. An invalid draft opens in edit mode and shows its first problem. `Chấp nhận tất cả` opens an inline confirm listing the items (`Chấp nhận N câu`) and skips discarded and invalid items. The summary reads `x câu · y đã chấp nhận`. `Tạo lại` and `Thêm N câu đã chấp nhận` work as in real. Only accepted, valid questions reach `onApply`, marked `aiGenerated: true, aiReviewed: true`. |
| A17 AI quiz contract (P1) | `generateQuizQuestions(courseId, lessonId, count, difficulty, { sourceText, focus })` follows the real contract. Count is clamped to 1–10. Material is the pasted text, or the lesson's description, summary, reading and body, cut to 12,000 chars. The entry test needs pasted text. There are 4 distinct options, `correctIndex` 0–3 and an explanation up to 600 chars. Result codes are `no_material`, `rate_limited`, `unavailable`, `invalid_output` and `not_configured`, with the real messages. Each success logs a row to `db.aiContentDrafts` (real `ai_content_drafts`). A pending course is refused. |
| A23 / A28 Map generation and re-analysis (P1) | Working simulation kept, as you decided. `runKnowledgeMapAnalysis(courseId)` sets `analysing` at once, then after about 2.5 s sets `ready` with suggestions, or `failed`. It follows the `kmap` scenario (`fail`, `cycle`). Re-analysis re-suggests existing concepts and adds concepts for uncovered lessons. It sends the notification `Bản đồ kiến thức đã sẵn sàng`. It refuses pending courses and courses with no lessons. Only one analysis runs per course at a time. |
| A24 Accept-all with loop skip (P1) | Real D10. `acceptAllPlan(map)` is the pure preview. `acceptAll(courseId)` opens the real confirm `Chấp nhận tất cả đề xuất?` with the counts and the skipped-loop line. It recomputes the plan on the current map and applies it, so loop-closing edges stay `suggested`. A confirmed map goes back to `ready`. The 2 real toasts are used. |
| A27 / A26 graph helpers (support) | `kmapGraph.findCycle`, `reaches`, `computeAcceptAllPlan`, `activeEdges`, `mapCycle` and `topoSortLessons` are ports of the real `knowledge-map-runner.ts`, ready for `kmap-tab.jsx`. |
| G4 AI grading draft (P1) | Simulation kept, as you decided. `gradingDraft(props)` shows `AI gợi ý điểm và nhận xét`. While loading it shows `AI đang đọc bài nộp…` with `Dừng`. Errors show `AI chưa gợi ý được. Thử lại`. The rate-limit state shows `Đã dùng hết lượt gợi ý bằng AI trong giờ này.` The result is a review card: per-criterion or single score, the feedback, the `AI đề xuất` badge and the note `AI chỉ gợi ý. Điểm chỉ được ghi nhận khi bạn kiểm tra và tự lưu điểm.` The form changes only through the explicit `Dùng bản nháp này`. After that, the mockup note `Đã điền bản nháp do AI gợi ý — xem lại từng điểm và nhận xét trước khi lưu.` shows. The draft never saves a grade. Scores are worked out from the submission's link, file and note, never at random. |
| A32 AI document import (P3) | Kept. Its quiz step now uses the same `QuizReviewList` gate as A16. |

## Rows skipped or partly done, with reasons

- **A11 code readiness (P1)**: the readiness list lives in `lecturer/course-editor.jsx`, which the lecturer agent owns. I added the data it needs: `code.solutionVerifiedAt` on save, in AI drafts and in the seed patch. See change request 4.
- **A16/A17 wiring in `quiz-builder.jsx`**, **A22/A23/A24/A28 wiring in `kmap-tab.jsx`** and **G4 wiring in `grading-page.jsx`**: those files belong to the lecturer agent. The members are ready; see the change requests.
- **A8 for tutorials**: guided tutorials exist only in the port. Their preview still uses `Codi.code.view`, which may write `codeAttempts` for the lecturer. Making it stateless needs an option in `coding/code-api.jsx`. See change request 5.
- **A31 AI course outline draft (P3)**: the real app has no screen for it. The closest port feature is `openCreate` (lesson and code drafts). I added no new screen.
- **Python lesson in the seed**: `course-python-001 / lesson-py-p01` is a Python challenge. Following real, the editor blocks Python: the option is disabled, and save and run refuse with the real message. Its `solutionVerifiedAt` is seeded as `null`. The lesson can be viewed but not saved until it is changed to JavaScript.

## Deviations from the mockup docs (for `docs/deviations-from-mockup.md`)

1. **Code save gate.** The mockup port warned and saved anyway. Now save is refused unless the reference solution passes every test. This matches real and STATE-MACHINES S23b.
2. **Expected values.** The mockup required valid JSON. Text that does not parse is now stored as a string (real).
3. **Test deletion.** The mockup asked for confirmation. Real has no confirm, keeps at least 1 test, and refuses the save when the removed tests have learner results.
4. **AI boundary tests.** The mockup derived calls from the first test, sent results to a review panel and simulated Python. Real derives calls from the solution, appends the tests straight to the draft and supports JavaScript only. STATE-MACHINES §23.5 also forbids the Python simulation.
5. **Lecturer preview.** The mockup reused the learner workspace. The real preview runs nothing into storage and shows hidden tests only as a count.
6. **AI quiz.** The mockup appended every question straight into the quiz. Questions now pass the accept/discard gate before they are added (real dialog, STATE-MACHINES §19.1). The mockup's rate-limit copy `Đã dùng hết lượt...` is replaced by the real `AI đang bận` in the quiz dialog.
7. **Accept-all on the map.** The mockup accepted edges that close a loop. They are now skipped and stay suggested (real D10).
8. **Map analysis and AI grading.** Real disables both (`Phân tích AI chưa khả dụng`, `Sắp có`). Both stay as working simulations by your decision. The grading draft needs an explicit `Dùng bản nháp này`, while the mockup filled the form directly. These labels have no real or mockup source and are mine: `Dùng bản nháp này`, `Bỏ bản nháp`, `Bản nháp AI gợi ý` and the info note under the draft.
9. **Copy kept from the port where real names its own infrastructure.** Real labels say `JavaScript (QuickJS Sandbox)` and the badge `Bài tập code (S23b)`. The port runs code in a browser Web Worker, so the labels read `JavaScript` and `Bài tập code`.
10. **Real `Pass` / `Fail` result labels** are shown with the coding feature's Vietnamese `Đạt` / `Chưa đạt` test rows, to stay consistent with the learner view.

## Shared change requests (lecturer agent files)

1. **`src/features/lecturer/quiz-builder.jsx`**: drop the current AI append flow. Add a `Tạo bằng AI` button (real label) that opens:
   ```jsx
   {Codi.lecturerAI?.quizReview?.({
     open: aiOpen, onClose: () => setAiOpen(false),
     courseId: c.id, lessonId: isEntry ? 'entry' : l.id, lessonTitle: isEntry ? c.entryTest.title : l.title,
     maxOptions: 6,
     onApply: (qs) => { appendToDraft(qs); Codi.ui.toast(`Đã thêm ${qs.length} câu AI tạo vào danh sách. Nhớ lưu bài trắc nghiệm.`, { type: 'success' }); },
   })}
   ```
   `onApply` receives `{ id, conceptId, text, options[4], correctIndex, explanation, difficulty, aiGenerated: true, aiReviewed: true }[]`. For entry tests, `conceptId` is `null`; set `lessonId` per question in the entry editor. The dialog is mounted only while this element is rendered. Keep it rendered while the builder is open, so the form state survives a close and reopen.
2. **`src/features/lecturer/kmap-tab.jsx`**:
   - Analyse, `Thử lại` (failed) and re-analyse (stale) call `Codi.lecturerAI.runKnowledgeMapAnalysis(c.id)`. It sets `analysing` itself and returns `{ ok, map | error }`. Show `error` as a danger toast when `ok` is false and the status did not change to `failed`.
   - Accept-all calls `Codi.lecturerAI.acceptAll(c.id)`. Its button is `Chấp nhận tất cả (${pending})`. It handles the confirm, the loop skip and the toasts.
   - Cycle banner and confirm gate use `Codi.lecturerAI.kmapGraph.mapCycle(m)`. Default order uses `kmapGraph.topoSortLessons(m.concepts, m.edges, lessons)`; it returns `null` when there is a cycle.
3. **`src/features/lecturer/grading-page.jsx`**: replace the fabricated `ai-draft-note` draft with:
   ```jsx
   {Codi.lecturerAI?.gradingDraft?.({
     submission: s, assignment: l.assignment, disabled: s.status === 'graded' && !editing,
     onApply: ({ score, scores, feedback }) => { /* fill rubric inputs or the single score; append feedback (\n\n) */ },
   })}
   ```
   `scores` is keyed by rubric criterion id. `score` is the total, or the single score out of `submission.maxScore`. Values are 0..max in steps of 0.5. Nothing is saved; the lecturer still saves the grade.
4. **`src/features/lecturer/course-editor.jsx` readiness (A11)**: the code item `Bài code có test và lời giải chạy đạt` passes when `code.tests.length > 0 && code.solutionVerifiedAt`, with fallback `solutionCheck.ok`. The hard hint is `Lời giải mẫu chưa chạy đạt tất cả test.` Add the advisory `Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.` as advisory only, not as a gate.
5. **`src/features/coding/code-api.jsx` (coding agent)**, optional: a `view(c, l, { preview: true })` mode that skips `codeAttempts` writes, so tutorial previews are stateless too.

## New seed fields (`patches/60-lecturer-ai.js`)

- `db.aiContentDrafts: []` holds rows `{ id, lecturerId, courseId, lessonId|null, kind: 'quiz_questions', status: 'pending', createdAt, payload: { courseId, lessonId, difficulty, questions } }`. It starts empty, so `isDocCollection` stores it in kv until rows exist. The controller should check that the sync layer switches it to row storage cleanly once rows exist.
- `lesson.code.solutionVerifiedAt` is set on challenge lessons from a passing `solutionCheck.at`, otherwise `null`. The seeded values are react-p01 `2026-08-15T09:00:00Z`, js-p02 `2026-06-01T09:00:00Z` and py-p01 `null`.

## Notes

- Only 8 of 49 seeded lessons have text (`reading` etc.). For the rest, AI quiz generation returns `Chưa có nội dung để AI đọc` until the lecturer pastes text. That is real behaviour. If the lecturer agent adds lesson `description` (C-rows), the generator reads it automatically.
- Scenario flags used: `aiAssistant` (`ok`, `thinking`, `ratelimit`, `error`) and `kmap` (`ok`, `fail`, `cycle`). These are the existing dev-drawer values; there are no new flags.

Status: DONE_WITH_CONCERNS
Summary: The code editor and the stateless preview follow the real app: save gate, expected-value normalisation, test contract, delete guard and real boundary tests. The AI quiz review gate, knowledge-map analysis with D10 accept-all, and the AI grading draft are exposed on `Codi.lecturerAI`. The build passes and the seed patch loads.
Concerns/Blockers: Wiring into `quiz-builder.jsx`, `kmap-tab.jsx`, `grading-page.jsx` and the A11 readiness item depends on the lecturer agent applying the change requests above. The seeded Python code lesson cannot be saved, because real blocks Python.
