# Port report: lecturer (non-AI rows)

Date: 2026-11-02 (Asia/Bangkok). Source of truth: `Codi/apps/web/src/app/dashboard/lecturer`, `components/quiz-builder`, `lib/quiz-import.ts`, `lib/course-constants.ts`, `lib/course-schema.ts`, `lib/lecturer-progress-service.ts`, `insights-client.tsx` (read only).

Build: `npx vite build` passes (only the chunk-size warning). Seed: `loadSeed()` runs with every patch, including `50-lecturer.js`.

## Files

- `src/features/lecturer/teach-api.jsx`: new shared helpers: `categoryOptions` (the real category list), `levelLabel`, `isVisibleReview`, `PRICE_MAX`, `promptReason` (a confirm dialog that needs a reason of at least N characters), a `beforeunload` guard, and the real copy for the unsaved-changes dialog.
- `home-pages.jsx`, `course-editor.jsx`, `lesson-editor.jsx`, `quiz-builder.jsx`, `kmap-tab.jsx`, `grading-page.jsx`, `support-pages.jsx`, `snippets-page.jsx`, `progress-pages.jsx`, `insights-page.jsx`: rewritten or updated.
- New `quiz-import.js`: port of the pure parser in `lib/quiz-import.ts`. A smoke test passes for block format, tab rows and the error cases.
- `src/styles/lecturer.css`: new section classes (materials, import preview, kmap viewport, Q&A threads, grading). They use only the existing tokens.
- `server/seed-source/patches/50-lecturer.js`: additive only.

## Rows done

| Row | What was ported |
|---|---|
| C1 | Status tabs with counts. Real empty copy for "all" and for each status. |
| C2 | Reject and hide reasons on each row. "Sửa và gửi lại" goes to `/publish`. Real sends it to the course root, which the scout logged as a real bug, so the port keeps `/publish`. |
| C3, G12 | "Lý do từ chối:" prefix with the "Chưa nêu" fallback, "Trình độ: …" on rows, "Xem tất cả (n)". |
| C4 | Title 5–120 and summary 20–500 characters. Category comes from the real fixed list and the level from its enum, each with a "hợp lệ" error. Loading state "Đang tạo...". Server alert "Không tạo được khoá học". |
| C5, C6 | Header subtitle (chapters · lessons · category · level). Real copy for the pending lock alert and the published alert. |
| C7 | Real banners for draft, pending, changes requested, rejected, published and hidden ("Chưa nêu" fallback). "Changes requested" comes from the latest decided review round status, because the seed has no `reviewOutcome`. |
| C8, A11 | Readiness checklist. The code item passes when tests exist and `solutionVerifiedAt` is set, falling back to `solutionCheck.ok` when that field is absent. Hard hint: "Lời giải mẫu chưa chạy đạt tất cả test.". The advisory 3-test note sits in a separate card, "Gợi ý thêm", that never gates submission. |
| C9 | Real submit confirm copy. A must-fix warning shows when an open "Bắt buộc sửa" flag remains. |
| C10 | "Kết quả kiểm duyệt lần n" with a round status badge, plus "AI đề xuất" and "Vòng trước" (carried) badges. Flags are sorted open, fixed, closed, then must before should. Reply label is "Bạn đã phản hồi:". |
| C11 | Mark-fixed dialog with the real copy, a 5-character minimum and the real error. Allowed only when the course is rejected and the round was returned; otherwise the real server message shows. "Bỏ đánh dấu" has the same gate. |
| C12, C24 | New chapters are named "Chương n" and no longer open in rename mode. Toasts follow real. Move arrows are disabled at the ends of their list. An empty rename is a silent no-op. Renames mark content changed. |
| C13 | Only an empty chapter can be deleted. The real server message shows, plus the real confirm copy for draft and published courses. |
| C14 | Lesson delete guards follow real `deleteLesson`. Learner work blocks with "…đã có học viên làm bài kiểm tra…". Any dependent row blocks with "…dữ liệu liên kết…". Dependent rows are quiz, code, assignment, progress, concept links, Q&A, conversations, review flags, AI path and entry-test links. The real confirm copy is used, followed by an undo toast ("Đã xoá …" / "Hoàn tác" / "Đã khôi phục …"). |
| C15 | Real title "Biên tập chi tiết bài học" and description. Fields: name (≥ 2 characters, empty-name error), short description, duration 1–360, body (monospace). The lesson loads before the form appears, with a skeleton, an error alert and "Thử lại". Saving is allowed only after the details load. Toast: "Đã cập nhật bài học thành công!". |
| C16 | "Cho phép học thử (Free Preview)" checkbox with the real help text, and a "Học thử" badge on the content row. |
| C17 | The simulated upload is replaced by the real URL-only materials list: 5 types, title and URL required, real copy, remove button. The lesson `type` comes from the first material. The first material is mirrored into `lesson.material` so the admin `materialOk` check keeps working. |
| C18 | Price must be a non-blank integer from 0 to 2,147,483,647, with the real client and server messages. The category select uses the real list. Real labels and card title. The extra "Huỷ thay đổi" button is gone. |
| C19 | Saving the info tab calls `contentChanged`, so a confirmed map turns stale, as in real. |
| C20, C21 | Real guard copy, plus a `beforeunload` guard while a form is dirty. |
| C23 | Row actions are "Chi tiết", "Quiz" and "Code". Entry row: "Đã có (N câu)" or "Chưa có — Tạo bài kiểm tra đầu vào". Real content hint and empty-chapter copy. Viewing stays available while the course is pending. |
| A13, A14 | Real headings, including "(Diagnostic Test)", badges and descriptions. Lock alert. A new question has 4 blank options. Options are capped at 6 and floored at 2, with toasts. The last question cannot be deleted. The explanation is collapsed behind "Thêm giải thích". Inline errors appear per field. "Điểm đạt tối thiểu (%)" with its hint. Save toasts follow real. "Có thay đổi chưa lưu" shows while dirty. |
| A15 | "Nhập hàng loạt câu hỏi" dialog: both formats, both separators, live preview, valid and error badges, "Thêm N câu", real toast. |
| A16 (wiring) | The old AI append flow is removed. A "Tạo bằng AI" button renders `Codi.lecturerAI.quizReview({ open, onClose, courseId, lessonId, lessonTitle, maxOptions: 6, onApply })`, and the element stays mounted while the builder is open. Accepted questions are appended to the draft. Without lecturer-ai, the button is disabled with "Sắp có". |
| A19 | "Cần ít nhất 5 câu hỏi" warning card. Each entry-test question has a lesson select, "Bài học tương ứng (BKT liên kết kỹ năng)", with the real placeholder and help text. |
| A21 | Advisory notes in the quiz sidebar: fewer than 3 questions, questions with only 2 options, missing explanations. They do not gate anything. |
| A22, A27, A28 (shell) | Real states: empty, failed (disabled retry with "Sắp có" when AI is absent), legacy analysing, stale, confirmed. Pending and partially-accepted banners, "Đã xem lại mọi đề xuất", "Cần xác nhận lại…", the trial notice when lecturer-ai is absent, and the zero-concept warning. Confirm bar with all real disabled-reason messages. Confirming writes `confirmedSnapshot`. |
| A24 | Accept-all calls `Codi.lecturerAI.acceptAll(c.id)` when available. Otherwise a local copy of the real `computeAcceptAllPlan` runs with the real dialog. Loop-closing edges stay suggested. Button label: "Chấp nhận tất cả (n)". |
| A25, A26 | "Bỏ khái niệm này", "Khôi phục", a rename dialog with the real copy, and the "Đã thêm quan hệ tiên quyết." toast. Graph: zoom 0.6–1.4 in 0.15 steps, "Tất cả các chương" filter, a side panel with "Chi tiết khái niệm" and the "Chưa chọn khái niệm" empty state. Cycle banner and default order use `kmapGraph.mapCycle` and `topoSortLessons` when present, with local fallbacks. Real cycle and empty-order copy. |
| G1 | Course, assignment and date filters (the date filter starts at local midnight). They are kept in the query string, and the tab counts follow them. Pending is ordered by `submittedAt` ascending, graded by `gradedAt` descending. "Next" means the next pending submission in the same scope. Real empty copy. |
| G2 | Rubric: every criterion is required and must be within 0…points, with the real messages. Totals round to 0.1. The pass threshold is a percent of `maxScore`: "Ngưỡng đạt: P%" for rubrics, "X/max" for a single score. Real submission panel copy. A stale-view check gives "Bài nộp đã được thay đổi bởi một phiên làm việc khác…". |
| G3 | Score edits use `promptReason`: at least 3 characters, the real error, and the real title, body, consequence and reversible text. History rows are `{ oldScore, newScore, feedback, reason, at, gradedBy }`. Edits that change only the feedback write no history. History sheet "Lịch sử chỉnh sửa điểm" lists entries newest first, with "Lần sửa N" and the empty state. Trigger: "Xem lịch sử điểm (N lần sửa)". Real notification titles; body "… — x/max điểm". |
| G4 (wiring) | Renders `Codi.lecturerAI.gradingDraft({ submission, assignment, onApply })`. `onApply` fills the rubric or single score and appends the feedback; nothing is saved. Without lecturer-ai: the real disabled button, the "Sắp có" pill and the note. |
| G5 | "Mẫu nhận xét" dialog with the real description, an empty state with a link, and a "Quản lý danh sách mẫu →" footer. Placeholders `{{x}}` and `{x}` both work, with fallbacks "em" and "—". Inserted after a blank line. Toast: "Đã chèn mẫu …". |
| G6 | Title 2–100 and body 5–2000 characters, with real messages. Real dialog copy, placeholders and character counter. Newest first. Delete happens at once with a "Hoàn tác" toast and no confirm. Reads `body` and falls back to `text`. |
| G7 | Replies are trimmed and must be 5–5000 characters. A conversation resolves only while open and after a staff reply (real errors). A resolved thread shows the lock banner and "Mở lại cuộc hội thoại" instead of the reply form. Reopen works only from resolved. Real labels and counts, "Tin nhắn trao đổi (n)", "Phản hồi (n)", "Quản trị viên" and "Giảng viên" badges, all empty states with descriptions, real toasts. |
| G8 | Visible reviews only. Reply is required, up to 3000 characters, with a counter. Real empty descriptions. Stars carry the aria-label "n trên 5 sao". |
| G9, G10 | Real copy on the index page and a view for a missing course. Detail page: real banners, "Chưa ghi nhận" hint column with a tooltip, learner search, quiz-tab status column with "Chưa có dữ liệu", "Bình thường" and "Cần xem lại", and the real empty states. Completion is clamped. The quiz average counts only current lesson quizzes and excludes the entry test. `lastActive` is the latest of progress `lastActive` and submission times. |
| G11 | Periods "7 ngày", "30 ngày" and "90 ngày" as GMT+7 day windows with a range label. Five KPIs, including "Hoàn tiền" (`deltaGood` down), via `charts.kpi`. Daily net chart for every period, with a "Bảng số liệu" table and the real note. Course table has Đơn, Gộp, Ròng and Tỉ lệ (share of net), sorted by net, with a total row. Amounts are rounded VND. |
| G13 | The reviews count in the nav ignores hidden reviews. |

## Rows skipped or partial (with reason)

- A1–A10, A12, A17, A18 (generation), A23, A31, A32: these belong to the lecturer-ai agent.
- A20 "Dùng làm bài kiểm tra đầu vào" toggle: removed. In the real app the entry test is its own authored set, and each question carries a per-question lesson link. A copied lesson quiz has neither, so the toggle contradicts the real model.
- A26 minimap: not built. `charts.graph` is a shared library, and a minimap would duplicate the whole SVG. Zoom, chapter filter and side panel are done.
- A29 (create a concept by hand): neither the real app nor the docs have this; it is a product decision.
- C25 loading skeletons for whole pages: the store is local, so there is no loading phase. The lesson editor has its own load, error and retry states (C15).
- Seed lesson descriptions: not added. Writing them would mean inventing content. The AI quiz generator reads `description` as soon as a lecturer fills it in.

## Port-only features kept (the real app has no UI for them)

- Drag-and-drop reorder (C28). It is also the only way to move a lesson across chapters, since the real arrows stay inside a chapter.
- Course delete with type-to-confirm, blocked while learners are enrolled (C27).
- Assignment builder with rubric and AI rubric suggestion (C26). The threshold is now a percent ("Ngưỡng đạt (%)"); `passScore` stays in sync for older readers.
- The typed "Thêm bài học" menu with AI entries (C22). Manual lessons are named "Bài học n" with 10 minutes, as in real.
- The "Bài code" tab on the progress page, which renders `Codi.teachCode.analytics`.
- The AI-review readiness item. The real guard is inert because the flag is hard-coded to null; the port enforces it. It rarely fires now, because accepted AI questions arrive already reviewed.

## Deviations from the mockup docs (for `docs/deviations-from-mockup.md`)

1. Chapter delete works only on empty chapters. The mockup cascaded.
2. Lesson delete is blocked when dependent data exists, then offers undo. The port checks the rule before the confirm dialog opens; real checks it on the server after confirm.
3. Pass threshold is a percent, default 50. The docs used an absolute `passScore`, default 5.
4. Lesson materials are URLs only (5 types). PRODUCT T1 asks for upload with progress.
5. Any content write, including the info tab, turns a confirmed map stale.
6. Snippets are deleted at once with undo. The mockup asked for confirmation.
7. Snippet placeholders use `{{x}}`; `{x}` still works.
8. Insights adds a refunds KPI and a net column, share is computed on net, and the 90-day chart uses daily buckets.
9. Progress shows hint usage and mastery charts as unavailable (real) instead of seed hint data.
10. Q&A: only staff resolve a conversation, and only after a staff reply. A resolved thread is locked.
11. The entry-test toggle on a lesson quiz is removed (see A20).
12. Grading notification links stay `/progress`, the port's learner progress route. Real uses `/dashboard/learner`.

## Shared change requests

- None blocking.
- Optional: `overlay-host.jsx` `confirm({ requireReason })` could take a `reasonMin` / `reasonError` option. Then `promptReason` in `teach-api.jsx` would not be needed.
- Optional for the admin feature: `review-api.js` `materialOk` could read `lesson.materials[]` directly. For now, the first URL material is mirrored into `lesson.material`.

## New seed fields (`patches/50-lecturer.js`)

- `categories`: Fullstack, Data & AI, Mobile and Computer Science are added when no category of the same name exists. Existing categories stay.
- `lesson.assignment.passingScore` and `submission.passingScore`: a percent, derived from `passScore / maxScore` (all 50).
- `order.updatedAt` on refunded orders, taken from the "Đã hoàn tiền" timeline entry.
- `feedbackSnippet.body` (`{{x}}` syntax) and `createdAt`; `text` is kept.
- `entryTest.questions[].lessonId`, derived from the concept link, or `null`.
- `lesson.isFreePreview = true` on the first lesson of each published course, only where no other patch set it.
- Runtime-only fields written by the UI: `lesson.description`, `lesson.materials[]`, `submission.history[]` entries with `newScore`, `reason` and `gradedBy`, `submission.passed`, `knowledgeMap.confirmedSnapshot`, `conversation.updatedAt`.

## Integration with lecturer-ai (in `quiz-builder.jsx`, `kmap-tab.jsx`, `grading-page.jsx`)

- Members used, all through optional checks with real fallbacks: `quizReview`, `runKnowledgeMapAnalysis`, `acceptAll`, `kmapGraph.mapCycle`, `kmapGraph.topoSortLessons`, `gradingDraft`, plus the existing `openImport`, `task` and `suggestRubric`.
- `Codi.teach` keeps its signature: `{ shell, isMine, notMine, findLesson, contentChanged, persist }`.

## Unresolved questions

1. Real-app lesson delete also blocks on concept links, so most seeded lessons cannot be deleted. The rule is ported as is; confirm that is wanted for the demo.
2. A stale map cannot be confirmed again without re-analysis. When lecturer-ai is absent, an edited published course cannot get its map confirmed (real trial behaviour).
3. The 30- and 90-day insight windows end today (2026-11-02). Seed orders end on 2026-10-11, so the 7-day view is empty. That is correct for the data, but the controller may want more recent seed orders for the demo.
