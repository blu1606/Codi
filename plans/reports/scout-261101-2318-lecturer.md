# Scout report: lecturer feature gap (real app vs codi-rebuild)

Date: 2026-11-01 (Asia/Bangkok). Read-only analysis. No source files were edited.

Scope and sources:
- REAL: `D:/CODE/Study/FPT/Ki_5/SWP391/Codi/apps/web/src/app/dashboard/lecturer/` (about 10.5k lines of TSX, plus `actions.ts` files), `components/quiz-builder/`, lecturer-related `lib/` services (`publication-service.ts`, `publication-course-data.ts`, `course-schema.ts`, `course-constants.ts`, `qa-reviews-service.ts`, `lecturer-progress-service.ts`, `revenue-analytics-service.ts`, `analytics-formulas.ts`, `knowledge-map-runner.ts`, `quiz-import.ts`, `coding-*.ts`).
- PORT: `codi-rebuild/src/features/lecturer/` and `codi-rebuild/src/features/lecturer-ai/`, store `src/lib/codi.js`, seed `server/seed-source/data.js`.
- Business rules: `Codi/docs/mockup/PRODUCT.md`, `STATE-MACHINES.md`.
- Method: three parallel read-only scouts covered (a) course list/create/editor/publish, (b) code lesson, quiz, knowledge map, lecturer AI, (c) grading, Q&A, reviews, snippets, progress, insights, dashboard. The lead spot-checked the high-impact claims against source (listed in section 5). One sub-report claim was wrong and is corrected below.

Priority: P1 = core authoring/grading/publish flow; P2 = important; P3 = nice or decision pending.

---

## 1. Summary table

Status: MISSING / PARTIAL / DONE / CONFLICT (port behaviour contradicts real app or docs) / PORT-ONLY (no real counterpart).

### 1a. Course management (courses list, create, editor, publish)

| # | Feature | Real source (under `app/dashboard/lecturer/`) | Rebuild status | Port files | Pri |
|---|---|---|---|---|---|
| C1 | Course list: status tabs with counts, `?status=` filter, empty copy | `courses/courses-list-view.tsx`, `courses/page.tsx` | PARTIAL (empty description missing) | `lecturer/home-pages.jsx` | P3 |
| C2 | Course row: reject/hide reason, "Sửa và gửi lại" | `courses/courses-list-view.tsx` 129-181 | DONE (real bug: rejected button goes to course root, not `/publish`) | `home-pages.jsx` | P3 |
| C3 | Dashboard home: greeting, work tiles, status tiles, rejected alert | `page.tsx`, `lecturer-dashboard-view.tsx` | DONE (alert lacks "Lý do từ chối:" prefix; no level label) | `home-pages.jsx`, `teach-api.jsx` | P3 |
| C4 | Create course form (length limits, category enum, server alert, loading) | `new/course-create-form.tsx`, `lib/course-schema.ts`, `lib/course-constants.ts` | PARTIAL (no max checks, no loading, wrong category list) | `home-pages.jsx` 69-107 | P1 |
| C5 | Editor header, status badge, back link, "Xem trang bán" | `courses/[courseId]/course-editor.tsx` | DONE (subtitle copy differs) | `course-editor.jsx` 18-32 | P3 |
| C6 | Pending read-only: lock alert, disabled inputs, hidden row actions | `course-editor.tsx`, `course-queries.ts` | DONE (copy differs) | `course-editor.jsx` | P2 |
| C7 | Status banners: draft / pending / changes requested / rejected / published / hidden | `publish/publish-tab-client.tsx` 157-268 | PARTIAL (copy; `reviewOutcome` absent from seed, so changes-requested shows the rejected branch; hidden fallback "Chưa nêu" missing) | `course-editor.jsx` 357-367, `seed-source/data.js` | P1 |
| C8 | Readiness checklist (conditional items, x/y đạt, "Sửa ngay") | `lib/publication-service.ts` 230-358, `publish-tab-client.tsx` 510-546 | DONE (AI item and code item are weaker; see 2.6) | `course-editor.jsx` 269-290 | P1 |
| C9 | Submit gating, confirm dialog, "Sửa và gửi lại", admin notify | `publish/actions.ts` 178-289, `publish-tab-client.tsx` 548-621 | DONE (dialog copy differs) | `course-editor.jsx` 342-355 | P1 |
| C10 | Review round block: round badge, flags sorted, carried badge, "must" warning | `publish-tab-client.tsx` 273-505 | PARTIAL | `course-editor.jsx` 306-340 | P2 |
| C11 | Mark review flag fixed: reply min 5 chars, allowed only when rejected | `publish-tab-client.tsx` 626-679, `publish/actions.ts` 291-321 | PARTIAL (non-empty only, no status gate) | `overlay-host.jsx` 83, `course-editor.jsx` 293-303 | P2 |
| C12 | Chapter tree: add chapter/lesson, inline rename, move up/down | `course-editor.tsx` 687-947, `actions.ts` 250-341 | PARTIAL (auto-rename on new chapter, no cross-chapter move, no disabled ends) | `course-editor.jsx` 62-98, 153-213 | P2 |
| C13 | Chapter delete: allowed only when empty | `actions.ts` 346-369, `course-editor.tsx` 286-297 | CONFLICT (port cascades delete) | `course-editor.jsx` 74-86 | P1 |
| C14 | Lesson delete: consequence dialog, server guards, undo toast | `actions.ts` 475-563, `course-editor.tsx` 346-379 | PARTIAL (no guards, no undo) | `course-editor.jsx` 74-86 | P1 |
| C15 | Lesson editor modal: title >=2, description, duration 1-360, body, save guard, load/error/retry | `course-editor.tsx` 1179-1465, `actions.ts` 671-772 | PARTIAL | `lecturer/lesson-editor.jsx` 89-167 | P1 |
| C16 | Free preview ("Học thử") toggle and badge | `course-editor.tsx` 848-852, 1250-1266 | MISSING | none | P1 |
| C17 | Lesson materials: 5 types, URL list, add form, validation | `course-editor.tsx` 1281-1431, `actions.ts` 62-69, 717-765 | MISSING (port has one type + simulated upload) | `lesson-editor.jsx` 104-127, 145-151 | P1 |
| C18 | Info tab: validation and save | `course-editor.tsx` 954-1139, `actions.ts` 188-245 | PARTIAL (blank price allowed; no 2,147,483,647 cap; wrong category list; extra Cancel button) | `course-editor.jsx` 224-266 | P1 |
| C19 | Info save marks KMap stale when published + confirmed | `course-queries.ts` 81-114 (any content write) | MISSING | `course-editor.jsx` 237-248 | P2 |
| C20 | Unsaved-changes guard: in-app link intercept + confirm | `course-editor.tsx` 158-187, 515-535 | DONE (copy differs) | `teach-api.jsx` 56-77 | P2 |
| C21 | Unsaved-changes guard: `beforeunload` | `course-editor.tsx` 161-169 | MISSING | none | P2 |
| C22 | Lesson add: "Bài học {n}", 10 min, appended to first chapter | `actions.ts` 374-405, `course-editor.tsx` 673-682 | DIFF (port adds type menu and AI, port-only) | `lesson-editor.jsx` 180-255 | P2 |
| C23 | Quiz / Code row links, entry-test row | `course-editor.tsx` 642-657, 874-895 | PARTIAL (labels: real "Chi tiết", "Quiz", "Code", "Chưa có — Tạo bài kiểm tra đầu vào") | `course-editor.jsx` 168-194 | P2 |
| C24 | Move up/down, lesson rename empty = silent no-op | `course-editor.tsx` 262-343 | PARTIAL | `course-editor.jsx` 45-61 | P3 |
| C25 | Loading skeletons (list, new, editor, quiz, code) | `*/loading.tsx` | MISSING (local store, optional) | none | P3 |
| C26 | Assignment authoring with rubric | no lecturer UI in real (readiness reads DB only) | PORT-ONLY | `lesson-editor.jsx` 13-87 | P2 decide |
| C27 | Delete whole course (type-to-confirm, blocked when enrolled) | no real UI (STATE-MACHINES §16: out of state machine; PRODUCT Q11 open) | PORT-ONLY | `course-editor.jsx` 92-98, 214-219 | P2 decide |
| C28 | Drag-and-drop reorder | no real UI (PRODUCT T1 asks for drag handles) | PORT-ONLY | `course-editor.jsx` 100-139 | P3 decide |

### 1b. Code lesson, preview, quiz, knowledge map, lecturer AI

| # | Feature | Real source | Rebuild status | Port files | Pri |
|---|---|---|---|---|---|
| A1 | Code editor shell: 5 tabs ("Đề bài", "Code khởi đầu", "Lời giải mẫu", "Test case (n)", "Gợi ý (n)"), lock banners, duration max 180 | `courses/[courseId]/code/[lessonId]/coding-builder-client.tsx` 79-80, 462-516 | PARTIAL (tab "Lời giải" vs "Lời giải mẫu"; no 180 cap) | `lecturer-ai/code-editor-page.jsx` 128-141, 219-231, 432 | P1 |
| A2 | Test-case editor (name, call, expected JSON, hidden toggle, add, delete min 1) | `coding-builder-client.tsx` 733-867 | PARTIAL (badge copy differs) | `code-editor-page.jsx` 158-188 | P1 |
| A3 | Expected-value normalisation: bare text stored as string | `code/actions.ts` 58-75 | MISSING (port rejects non-JSON, `code-editor-page.jsx` 47, 59) | same | P1 |
| A4 | Run against solution, per-test results, console | `coding-builder-client.tsx` 924-1057, `actions.ts` 264-350 | DONE functionally (Web Worker vs server QuickJS; copy differs) | `code-editor-page.jsx` 300-319, 376-385 | P1 |
| A5 | Save gate: reference solution must pass all tests before save | `code/actions.ts` 422-432 (server throws) | CONFLICT (port warns and saves) | `code-editor-page.jsx` 386-411 | P1 |
| A6 | Save validation: >=1 sample test, <=100 tests, input <=10,000, expected <=4,096, unique ids, names, call expressions | `lib/coding-contract.ts` 74-97, `code/actions.ts` 368-419 | PARTIAL (missing sample, count, length rules) | `code-editor-page.jsx` 49-71 | P1 |
| A7 | Test delete guard (blocked once learners have results) | `code/actions.ts` 539-553 | MISSING | none | P2 |
| A8 | Lecturer preview: sample tests visible, hidden tests as count-only card, reset dialog, stateless | `code/[lessonId]/preview/preview-client.tsx` 97-192, 454-478 | PARTIAL (reuses learner view; may write attempts) | `code-editor-page.jsx` 475-489, `coding/code-api.jsx` 170-174 | P1 |
| A9 | Dirty-state banner (unsaved code vs saved) | `coding-builder-client.tsx` 462-470 | MISSING | none (only preview guard, `code-editor-page.jsx` 412-414) | P2 |
| A10 | AI boundary-test suggestions (deterministic, sandbox-run) | `code/actions.ts` 728-799 | PARTIAL (port simulates Python, rate-limit state not in real) | `lecturer-ai/lecturer-ai-api.jsx` 112-124, 345-361 | P2 |
| A11 | Code publish readiness item | `lib/publication-service.ts` 248-250, 591-603; `publication-course-data.ts` 165-176 | PARTIAL (port needs only >=1 test) | `lecturer/course-editor.jsx` 269-274 | P1 |
| A12 | AI-drafted code lesson / tutorial authoring | none in real lecturer UI (`aiDraftKind` "coding_exercise" unused) | PORT-ONLY (simulated 1.5 s) | `lecturer-ai/lecturer-ai-create.jsx`, `code-editor-page.jsx` 233-298 | P3 decide |
| A13 | Quiz shell: passing score, lock, headings incl. "(Diagnostic Test)" | `courses/[courseId]/quiz/[lessonId]/quiz-builder-client.tsx` 378-452, 728-784 | PARTIAL | `lecturer/quiz-builder.jsx` 139-181 | P1 |
| A14 | Question and option editing: 2-6 options, 4 blank defaults, collapsed explanation | `quiz-builder-client.tsx` 258-301, 689-718 | PARTIAL (no 6 cap, 2 blank defaults, explanation always shown) | `quiz-builder.jsx` 100-112, 162-170 | P1 |
| A15 | Batch import "Nhập hàng loạt câu hỏi" (paste parser) | `components/quiz-builder/quiz-import-dialog.tsx`, pure parser `lib/quiz-import.ts` | MISSING | none | P2 |
| A16 | AI quiz dialog with per-item accept/edit/discard before insert | `components/quiz-builder/quiz-ai-dialog.tsx` 29-31, 81-180, 322-600 | PARTIAL (port appends all, reviews later) | `lecturer/quiz-builder.jsx` 38-76 | P1 |
| A17 | AI quiz server contract (count 1-10, material <=12,000 chars, 45 s timeout, 4 options, error codes) | `courses/[courseId]/actions.ts` 1056-1229 | PARTIAL (port uses bank output) | `lecturer-ai/lecturer-ai-api.jsx` 72-85 | P1 |
| A18 | AI flag persistence and unreviewed-question publish guard | `publication-course-data.ts` 153-154, 248-249 (hard-coded null, no column) | CONFLICT (real guard is inert; port enforces) | `lecturer/quiz-builder.jsx` 146-148, `course-editor.jsx` 277-279 | P1 decide |
| A19 | Entry (diagnostic) quiz: "Cần ít nhất 5 câu hỏi" warning card; per-question lesson link for mastery | `quiz-builder-client.tsx` 571-593, 763-774 | MISSING (text only; port uses concept link) | `lecturer/quiz-builder.jsx` 103, 141 | P1 |
| A20 | "Dùng làm bài kiểm tra đầu vào" switch on a lesson quiz | none (entry test is its own route; schema forbids a lesson link on diagnostic rows, per scout) | PORT-ONLY | `quiz-builder.jsx` 113-121, 176 | P2 decide |
| A21 | Quiz advisory warnings (<3 questions, 2 options, no explanation) | `lib/publication-service.ts` 561-580 (advisory) | MISSING | none | P3 |
| A22 | Knowledge-map page states and copy (empty, failed, stale, confirmed, trial notice) | `courses/[courseId]/kmap/knowledge-map-client.tsx` 451-535 | PARTIAL (port offers analyse CTA that real disables) | `lecturer/kmap-tab.jsx` 79-82, 120-122 | P1 |
| A23 | Knowledge-map generation (LLM) | `kmap/actions.ts` 220-227 (always throws "Phân tích AI chưa khả dụng trong bản thử nghiệm...") | CONFLICT (port simulates) | `lecturer/kmap-tab.jsx` 51-72 | P1 decide |
| A24 | Accept-all with loop-skip and summary dialog | `kmap/knowledge-map-client.tsx` 1233-1265, `lib/knowledge-map-runner.ts` 141-173 | MISSING (port accepts loop-closing edges) | `kmap-tab.jsx` 90 | P1 |
| A25 | Concept and edge review: accept/reject, rename, add edge | `kmap/actions.ts` 232-385, client 862-1100 | PARTIAL (labels differ; rename inline) | `kmap-tab.jsx` 89-104, 123-129, 164-181 | P2 |
| A26 | Graph view: zoom, minimap, chapter filter, side panel with empty state | `knowledge-map-client.tsx` 601-675, 770-786, 916-921 | MISSING | `kmap-tab.jsx` 156-158 | P2 |
| A27 | Confirm gate, confirmed snapshot, re-confirm banner, copy | `kmap/actions.ts` 471-570, client 1190-1225 | PARTIAL (no snapshot; shorter copy) | `kmap-tab.jsx` 105-112, 187-190 | P1 |
| A28 | Stale state: no re-analysis in trial | `knowledge-map-client.tsx` 524-531, `course-queries.ts` 88 | CONFLICT (port shows "Phân tích lại") | `kmap-tab.jsx` 121, 150 | P1 |
| A29 | Lecturer creates a concept manually | none in real (no action in `kmap/actions.ts`) | MISSING in both | none | P1 open (see 4.U1) |
| A30 | Lesson-to-concept membership (read-only) | real read-only | DONE parity | `kmap-tab.jsx` 166-168 | P3 |
| A31 | AI course outline draft | `dashboard/lecturer/actions.ts` 382-429 (no UI caller) | MISSING | none | P3 decide |
| A32 | AI document import (summary/quiz/concepts from file) | none in real (S22 upload not built) | PORT-ONLY | `lecturer-ai/lecturer-ai-api.jsx` 10, 142-300 | P3 decide |

### 1c. Grading, Q&A, reviews, snippets, progress, insights, dashboard

| # | Feature | Real source | Rebuild status | Port files | Pri |
|---|---|---|---|---|---|
| G1 | Grading queue: tabs, list, ordering | `grading/page.tsx`, `grading/grading-queue-client.tsx` 300-482, `grading/actions.ts` 108-302 | PARTIAL (no assignment or date filter; "Ghi chú" field the real model lacks) | `grading-page.jsx` 141-187 | P2 |
| G2 | Grading detail: rubric per criterion, score rules, save and next | `grading-queue-client.tsx` 124-297, 663-870; `grading/actions.ts` 452-580; `lib/grading-service.ts` | PARTIAL (pass threshold absolute in port; percent in real) | `grading-page.jsx` 44-139 | P1 |
| G3 | Score edit reason (>=3 chars), confirm dialog, history sheet | `grading-queue-client.tsx`; `grading/actions.ts` | MISSING | `grading-page.jsx` | P1 |
| G4 | AI grading assist | `grading-queue-client.tsx` 762-770 (disabled "Sắp có"); `grading/actions.ts` 582-593 (error) | CONFLICT (port fabricates a grade and feedback) | `grading-page.jsx` 56-72, 124-128 | P1 |
| G5 | Snippet picker in grading (placeholder insert, empty-state link) | `grading-queue-client.tsx` 181-199, 872-939; `lib/grading-service.ts` 99-114 | PARTIAL (wrong placeholder syntax; no empty-state link) | `grading-page.jsx` 12-32, 129-131 | P2 |
| G6 | Snippet management (CRUD, length rules, undo delete, table) | `snippets/snippets-client.tsx`, `snippets/actions.ts` | PARTIAL | `snippets-page.jsx` 6-61 | P2 |
| G7 | Q&A inbox: public questions and private AI-escalated conversations, resolve rules, lock | `questions/questions-inbox-client.tsx`, `questions/actions.ts` 107-650, `lib/qa-reviews-service.ts` | PARTIAL | `support-pages.jsx` 11-121 | P1 |
| G8 | Reviews: reply, filters, empty copy | `reviews/reviews-client.tsx`, `reviews/actions.ts` | DONE, minor (no 3000-char max; no empty description) | `support-pages.jsx` 123-169 | P2 |
| G9 | Progress list (per course) | `progress/page.tsx`, `progress/progress-views.tsx`, `progress/actions.ts` 17-122 | DONE, minor (no missing-course view) | `progress-pages.jsx` 27-37 | P3 |
| G10 | Progress detail: learners tab with search, sheet, quiz tab, banners, status column | `progress/course-progress-client.tsx`, `progress/actions.ts` 124-459, `lib/lecturer-progress-service.ts` 84-118 | PARTIAL (hint column the real app marks unavailable; no search; no status column; extra "Bài code" tab) | `progress-pages.jsx` 9-96 | P1 |
| G11 | Insights: periods, 5 KPIs incl. refunds, daily chart, course table with net and share | `insights/insights-client.tsx`, `lib/revenue-analytics-service.ts`, `lib/analytics-formulas.ts` 76-79, 235-293 | PARTIAL (4 KPIs, no refunds, no net column, share on gross, 90-day chart monthly) | `insights-page.jsx` 16-128 | P1 |
| G12 | Dashboard home | `lecturer-dashboard-view.tsx` 53-227, `lecturer/actions.ts` 117-160 | DONE, minor (level label, "(n)" on "Xem tất cả") | `home-pages.jsx` 10-52, `teach-api.jsx` 80-86 | P3 |
| G13 | Lecturer nav (7 items with counts) | `lecturer-nav.tsx` 24-51 | DONE | `teach-api.jsx` 88-113 | P3 |

Count: 28 course/editor rows, 32 code/quiz/KMap/AI rows, 13 grading/support rows. P1 rows: about 40.

---

## 2. Details for MISSING, PARTIAL and CONFLICT items

Copy is verbatim Vietnamese from the real app. Items reference rebuild files; line numbers are from the sub-reports and are approximate.

### 2.1 Course editor (C4, C7, C11, C13, C14, C15, C16, C17, C18, C19, C21)

**C13 Chapter delete (P1, CONFLICT).** Real rule: only empty chapters can be deleted.
- Server message: `Không thể xoá chương còn bài học. Hãy xoá từng bài học đủ điều kiện trước, rồi xoá chương trống.`
- Confirm body when published: `Khoá học đã xuất bản. Xoá chương "{t}" có thể ảnh hưởng trực tiếp đến học viên đã đăng ký. Chỉ có thể xoá chương trống.`; draft: `Chương "{t}" sẽ bị xoá khỏi khoá học. Chỉ có thể xoá chương trống.`
- Port `course-editor.jsx` `remove()` (74-86) cascades with copy "Chương có N bài học, sẽ bị xoá cùng chương." Change to block non-empty chapters.

**C14 Lesson delete (P1).** Real server blocks deletion when the lesson has submissions, quizzes, code or assignments (`assessments.lessonId`) or dependent progress, path, skill or Q&A rows.
- Blocked copy: `Không thể xoá bài học vì đã có học viên làm bài kiểm tra hoặc nộp bài trong bài học này.` and `Không thể xoá bài học vì có dữ liệu liên kết không thể phục hồi khi Hoàn tác. Hãy giữ lại bài học này.`
- Confirm: title `Xoá bài học?`; consequence `Bài học "{t}" sẽ bị xoá khỏi chương này.` (draft) or `Khoá học đang xuất bản. Xoá bài học "{t}" có thể làm gián đoạn tiến độ của học viên đã đăng ký.` (published); reversible line `Bạn có thể hoàn tác ngay sau khi xoá.`; confirm `Xoá`.
- Undo toast: `Đã xoá "{t}"` with action `Hoàn tác` → `Đã khôi phục "{t}"`. Needs a snapshot helper (`teach-api.jsx`).
- Port's confirm promises deletion and has no guard. Real also promises deletion for quiz/code lessons, which the server then blocks. Decide: pre-check and explain, or follow server rule.

**C15 Lesson editor modal (P1).**
- Title `Biên tập chi tiết bài học`; description `Thiết lập nội dung bài giảng, thời lượng học tập và tài liệu đính kèm (Video, PDF, Slide, Link).`
- Fields: `Tên bài học *` (server: `Tên bài học cần ít nhất 2 ký tự.`; empty: `Tên bài học không được để trống.`); `Mô tả tóm tắt bài học` (no limit); `Thời lượng (phút)` min 1, max 360, stored as seconds (server accepts 0; reopen falls back to 10, a real bug); checkbox `Cho phép học thử (Free Preview)` with help `Học viên chưa đăng ký mua khoá học có thể xem trước nội dung bài học này trên trang bán.`; `Nội dung bài học / Ghi chú lý thuyết` (monospace).
- Save: `Lưu bài học`, loading `Đang lưu...`, toast `Đã cập nhật bài học thành công!`. Save enabled only after details loaded (`canSaveLesson`, `course-editor.tsx` 190-192). Load error: `Không thể tải chi tiết bài học` with `Thử lại`.
- Port `lesson-editor.jsx` 89-167: no description, no free-preview, no load/error/retry states, type select `Nội dung bài đọc / tóm tắt`.

**C16 Free preview (P1, MISSING).** Add `isFreePreview` to lesson; badge `Học thử` on content row (`course-editor.jsx` ~153-180); checkbox in lesson editor. Learner side (course detail `Học thử`) depends on it.

**C17 Materials (P1).** Real: ordered list of typed materials (`video | pdf | slide | document | link`), each with a required URL. No upload (URL only, stored externally).
- Section title `Tài liệu bài học (N tài liệu)`; empty `Chưa có tài liệu đính kèm (Video, PDF, Slide). Bấm "Thêm tài liệu" để bổ sung.`
- Add form: type options `Video bài giảng`, `Tài liệu PDF`, `Slide thuyết trình`, `Tài liệu đính kèm`, `Liên kết ngoài (URL)`; placeholders `Ví dụ: Slide bài giảng Chương 1`, `https://...`; help `Chỉ hỗ trợ đường dẫn (URL) tới tài liệu đã lưu trữ. Chưa hỗ trợ tải tệp lên.`; errors `Vui lòng nhập tên tài liệu.`, `Vui lòng nhập URL tài liệu.`; button `Thêm vào danh sách`.
- Port has one type per lesson plus a simulated upload with fail-by-filename (`lesson-editor.jsx` 104-127). That simulation conflicts with the no-mocks rule in the porting guide. Replace with URL list. PRODUCT T1 (line ~302) asks for upload with progress; real does not do that, so the docs and real diverge (see 4.5).
- Data: lesson `materials: [{id, type, title, url, position}]`; lesson `type` derived from first material or `reading`.

**C18 Info tab (P1).** Real rules in `handleSaveInfo` (`course-editor.tsx` 205-247) and `updateCourseInfo` (`actions.ts` 188-245):
- Title >= 5 (`Tên khoá học cần ít nhất 5 ký tự.`); summary >= 20 (`Mô tả cần ít nhất 20 ký tự.`); price must be a non-blank integer >= 0 (`Giá đề xuất phải là số nguyên không âm.`; server adds `, không vượt quá 2.147.483.647 VND.`). Port accepts blank as null (`course-editor.jsx` 242-246).
- Labels: `Tên khoá học`, `Mô tả ngắn`, `Danh mục`, `Trình độ`, `Giá đề xuất (VND)` (step 10000), `Học viên sẽ học được gì? (Mỗi dòng một ý)`, `Yêu cầu trước khi học (Mỗi dòng một ý)`; card `Thông tin chi tiết khoá học`; savebar `Lưu thay đổi` (`Đang lưu...`), `Có thay đổi chưa lưu`. Port has an extra `Huỷ thay đổi` button (line ~262) that real does not.
- Real server does not validate `category`/`level` against enums in `updateCourseInfo`, but `createCourseDraft` does (`course-schema.ts`). Port should validate both.
- Toasts: `Đã lưu thông tin khoá học.`, `Đã thêm chương mới.`, `Đã đổi tên chương.`, `Đã xoá chương.`, `Đã thêm bài học mới.`.

**C4 Create course (P1).** Real rules (`course-schema.ts`, `new/course-create-form.tsx`): title 5-120 (`Tên khoá học tối đa 120 ký tự.`); summary 20-500 (`Mô tả tối đa 500 ký tự.`); category required (`Chọn một danh mục.`) from fixed list (`Frontend`, `Backend`, `Fullstack`, `Data & AI`, `Mobile`, `Computer Science`); level (`Chọn trình độ.`). Server alert `Không tạo được khoá học` / `Không thể tạo khoá học lúc này. Vui lòng thử lại.`; button `Đang tạo...`. Port seed `categories` (`data.js` ~889-893) has 4 different names (`Frontend`, `Backend`, `Dữ liệu`, `Công cụ`). Real stores category as name text; port stores `categoryId`.

**C7 Publish banners (P1).** Real copy (`publish-tab-client.tsx` 157-268):
- Draft: `Bản nháp` / `Hoàn thành danh sách điều kiện bên dưới rồi gửi yêu cầu xuất bản để quản trị viên phê duyệt.`
- Pending: `Chờ duyệt` / `Đã gửi yêu cầu xuất bản. Trong thời gian này, nội dung khoá học ở chế độ chỉ đọc. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán.`
- Changes requested: `Quản trị viên yêu cầu sửa` + reviewNote; `Sửa theo các góp ý chi tiết bên dưới, đánh dấu đã sửa rồi bấm 'Sửa và gửi lại'.`
- Rejected: `Khoá học bị từ chối` / `Khoá học chưa đạt tiêu chuẩn. Bạn có thể sửa đổi nội dung rồi gửi lại thành vòng duyệt mới.`
- Hidden: `Khoá học đã ẩn` / `Lý do ẩn: {hiddenReason || "Chưa nêu"}. Học viên đã mua vẫn tiếp tục học được; học viên mới không thể mua khoá học này.`
- Published: `Đã xuất bản` / `Đang bán với giá {vnd}` (port copy in `course-editor.jsx` 357-367 differs).
- Port fix: derive changes-requested from the latest review round status instead of `c.reviewOutcome`, which is never seeded (`server/seed-source/data.js` has no hits). Otherwise seeded `rv-solid-1` shows the rejected branch.

**C10/C11 Review round block and flag fix (P2).**
- Round header `Kết quả kiểm duyệt lần {n}` with status badge `Đang duyệt`, `Yêu cầu sửa`, `Đã duyệt`, `Từ chối`. Flag badges: `Bắt buộc sửa` / `Nên sửa`; `Đang mở` / `Giảng viên đã sửa` / `Đã đóng`; `AI đề xuất`; `Vòng trước` (carried). Lecturer reply label `Bạn đã phản hồi:`. Buttons `Mở để sửa`, `Đánh dấu đã sửa`, `Bỏ đánh dấu`. Port uses `Bạn trả lời:` and lacks round badge and carried badge.
- Must-fix warning on submit: `Khoá học còn góp ý "Bắt buộc sửa" chưa được xử lý. Vui lòng chỉnh sửa nội dung và đánh dấu đã sửa để đảm bảo khoá học được duyệt.`
- Mark fixed dialog: title `Đánh dấu góp ý đã sửa?`; label `Bạn đã chỉnh sửa nội dung gì? *`; help `Ít nhất 5 ký tự để người duyệt nắm rõ nội dung đã sửa.`; error `Vui lòng mô tả bạn đã sửa gì (ít nhất 5 ký tự).`; button `Xác nhận đã sửa`. Server allows only when course status is `rejected` (`publish/actions.ts` 291-295). Port `overlay-host.jsx` 83 checks non-empty only and `ro` only checks pending.
- Submit confirm body (real): `Trong lúc chờ duyệt, nội dung khoá học ở chế độ chỉ đọc. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán hoặc gửi góp ý.` + `Sau khi có kết quả, bạn có thể chỉnh sửa như bình thường.`

**C12, C19, C20, C21 (P2).**
- Move up/down disabled at list ends (real). Cross-chapter move absent in real; port auto-renames new chapters (`Chương mới`), real does not.
- Info save (and any content write) marks KMap `stale` when published and confirmed (`course-queries.ts` 81-114). Port `course-editor.jsx` 237-248 does not.
- `beforeunload` guard: real adds it when info dirty (`course-editor.tsx` 161-169). Port has only link interception (`teach-api.jsx` 56-77).

**Quiz/Quiz links (C23).** Real labels: `Chi tiết`, `Quiz`, `Code`; entry row `Đã có (N câu)` / `Chưa có — Tạo bài kiểm tra đầu vào`. Content hint: `Dùng nút mũi tên để sắp xếp thứ tự chương và bài học. Bấm "Chi tiết" để biên tập nội dung bài và tài liệu.`; chapter empty: `Chương này chưa có bài học. Bấm “+ Bài học” ở trên để thêm.`

### 2.2 Code lesson editor and preview (A1-A11)

**A1 Shell (P1).** Tabs and copy: `Đề bài`, `Code khởi đầu`, `Lời giải mẫu` (port says `Lời giải`), `Test case (n)`, `Gợi ý (n)`. Lock: `Khoá học đang chờ duyệt` and `Đang chờ duyệt — Chỉ đọc`. Duration input min 1, max 180 (client). Port file: `lecturer-ai/code-editor-page.jsx` 128-141, 219-231, 432.

**A2 Test cases (P1).** Badges: `Test ẩn (chỉ chấm khi Nộp bài)` and `Mẫu công khai (học viên nhìn thấy)`; checkbox `Ẩn test`; placeholders `ví dụ: tinhTong(2, 3)` and `ví dụ: 5, "Hello", hoặc [1, 2]`. Delete guard in A7.

**A3 Expected value (P1).** Real `normalizeExpectedValue` (`code/actions.ts` 58-75) runs `JSON.parse`; on failure it stores the trimmed text. So `Codi` becomes `"Codi"`. Port `code-editor-page.jsx` 59 rejects it. Change to match real.

**A5 Save gate (P1, CONFLICT).** Real `code/actions.ts` 422-432 throws if any test fails. Message: `Lời giải mẫu chưa vượt qua tất cả các test case (x/y test đạt). Không thể lưu bài tập.` Port `code-editor-page.jsx` 386-411 warns and saves. STATE-MACHINES S23b says "cannot save" when the reference fails, so the port contradicts the doc too.
- Pass criteria: per test `phase === "done" && actual === expectedCanonical` (`actions.ts` 322). Exercise pass: `passed === total && phase === "done"` (339).
- Other save errors (real): `Tên bài tập không được để trống.`, `Cần ít nhất một bước yêu cầu đề bài.`, `Lời giải mẫu không được để trống.`, `Cần ít nhất một test case để kiểm tra.`, `Test N: chưa có tên hiển thị.`, `Test N: chưa có biểu thức gọi hàm.`, `ID test case không được trùng nhau.`
- Test contract (`lib/coding-contract.ts` 74-97): >= 1 sample (`isSample`); <= 100 tests; input <= 10,000 chars; expected <= 4,096 chars; expected must be valid JSON after normalisation (see A3). Student-facing error when invalid: `Bài tập chưa có bộ kiểm thử hợp lệ. Vui lòng liên hệ giảng viên.`
- Real saves `solutionVerifiedAt`; `solutionCheck` is derived at read time. Real always stores `language: "javascript"`. The `fileName` input is accepted but not persisted (`actions.ts` 511-521).

**A7 Test delete guard (P2).** Real refuses delete when `codingTestResults` rows exist: `Không thể xoá test case đã có học viên nộp bài và chấm điểm. Bạn có thể sửa nội dung thay vì xoá test case này.` Port simulation: block deletion of test ids present in any `codeAttempts.failedTests`.

**A8 Lecturer preview (P1).** Real (`preview-client.tsx`): badge `Chế độ mô phỏng học viên`; title `Xem trước trải nghiệm học viên`; buttons `Khôi phục code ban đầu` (dialog title `Khôi phục code ban đầu?`, consequence `Code bạn đang viết trong trình xem trước sẽ được thay bằng code khởi đầu.`, reversible `Bản xem trước không lưu bài nộp; code đã thay đổi chỉ có thể viết lại thủ công.`, confirm `Khôi phục`), `Chạy thử (Sample tests)`, `Nộp bài (Tất cả tests)`. Submit shows a count-only locked card `Bộ test case ẩn (x/y đạt)` with `Đạt hết` / `Chưa đạt`. Toasts: `Chúc mừng! Bạn đã vượt qua tất cả test case!`, `Chưa đạt: bạn đã đúng x/y test case.`; hints tab `Gợi ý #n`, empty `Bài tập này chưa có gợi ý đính kèm.`. Runs are stateless (write nothing). Port reuses the learner view and may write `codeAttempts` rows (`coding/code-api.jsx` 170-174). Split into a lecturer wrapper with the sample/hidden split and the reset dialog, with no attempt writes.

**A9 Dirty banner (P2).** `Bạn có thay đổi chưa lưu. Hãy nhớ bấm **Chạy thử với lời giải** rồi bấm **Lưu bài code**.` Shown when dirty and not locked. Save success: `Đã lưu bài tập thực hành code thành công!`.

**A10 AI test suggestions (P2).** Real `code/actions.ts` 728-799 (deterministic, no LLM): finds the first `function name(...)` (fallback `solution`); candidate calls `f([])`, `f(0)`, `f("")`, `f(-1)`, `f([1, 2, 3])`, `f(null)`; drop duplicates, take 3, run in the sandbox, keep those returning `done`; each new test is `Trường hợp biên: <call>`, `isSample: false`, `hidden: true`, expected = solution output. Toasts: `Đã gợi ý thành công N test case biên mới!`, `Không tìm thêm được trường hợp biên mới cho bài này.`, `Vui lòng nhập lời giải mẫu trước để AI có thể phân tích và sinh test biên.` Button: `Gợi ý test biên` / `AI đang tìm...`. Note: expected values come from the solution, so these tests are tautological. Port simulates Python here (`lecturer-ai-api.jsx` 112-124), which STATE-MACHINES §23.5 forbids.

**A11 Code readiness (P1).** Real hard item: `Lời giải mẫu chưa chạy đạt tất cả test.`; advisory: `Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.` (`publication-service.ts` 591-603). Real item label `Bài code có test và lời giải chạy đạt` passes when tests exist and `solutionVerifiedAt` is set. Port item (`course-editor.jsx` 269-274) requires >= 1 test and `solutionCheck.ok`; add the advisory to admin view only, not the gate.

**A12 Port-only AI drafts (P3).** `lecturer-ai-create.jsx` simulates AI code-lesson and course drafts (1.5 s). No real lecturer UI calls `saveAiCourseDraft`; fixture `demo-fixtures/lecturer/unbuilt-states.ts` says so. Keep or drop (see 4.U5).

### 2.3 Quiz builder (A13-A21)

**A13/A14 Shell and options (P1).**
- Heading includes `(Diagnostic Test)` for entry tests. Toasts: `Đã lưu Quiz bài học thành công!`, `Đã lưu Bài kiểm tra đầu vào thành công!`.
- Passing score: default 70; label `Điểm đạt tối thiểu (%)`; hint `Học viên phải đạt từ mức điểm này trở lên để hoàn thành bài học.`; server `Điểm đạt phải từ 1 đến 100%.`; client `Điểm đạt phải nằm trong khoảng từ 1% đến 100%.`
- New question: 4 blank options, `correctIndex` 0. Option add capped at 6 (`Mỗi câu hỏi tối đa 6 phương án lựa chọn.`); delete min 2 (`Mỗi câu hỏi cần tối thiểu 2 phương án lựa chọn.`). Deleting the last question: `Bài quiz cần có ít nhất 1 câu hỏi.`
- Explanation collapsed behind `Thêm giải thích`; label `Giải thích đáp án (học viên sẽ thấy sau khi nộp bài)`.
- Inline errors: `Vui lòng nhập nội dung câu hỏi.`, `Cần ít nhất 2 phương án trả lời có nội dung.`, `Vui lòng chọn một phương án có nội dung làm đáp án đúng.`

**A15 Batch import (P2, MISSING).** Real dialog `components/quiz-builder/quiz-import-dialog.tsx`: title `Nhập hàng loạt câu hỏi`; format `Tự động nhận dạng` / `Tab (dạng hàng)` / `Dòng mới (dạng khối)`; separators `Dòng trống` / `Dấu ;`. Preview: `Chưa có câu hỏi nào để xem trước`, `x câu hợp lệ · y câu có lỗi`, `Sửa các câu có lỗi để thêm đủ`, badges `Hợp lệ` / `Có lỗi`, button `Thêm N câu`. Parser `lib/quiz-import.ts` is pure (no React, no server imports); port it as a module. Errors: `Thiếu nội dung câu hỏi.`, `Cần ít nhất 2 phương án.`, `Tối đa N phương án mỗi câu.`, `Có phương án còn trống.`, `Chưa có đáp án đúng (đánh dấu * ở đầu phương án hoặc ghi A–D trong cột đáp án).`, `Dòng cần có câu hỏi, ít nhất 2 phương án và cột đáp án đúng.`

**A16/A17 AI quiz dialog and contract (P1).** Real `components/quiz-builder/quiz-ai-dialog.tsx` and `[courseId]/actions.ts` 1056-1229:
- Title `Tạo câu hỏi bằng AI`; text says nothing is added until accepted. Source radios `Nội dung bài học` / `Dán nội dung` (paste max 6,000 chars, counter `n/6000`). Focus `Trọng tâm (không bắt buộc)` max 200. Count 3 / 5 / 8 (default 5). Difficulty `Dễ` / `Vừa` (default) / `Khó`.
- Loading: `AI đang tạo N câu hỏi từ nội dung bài học…` (role status).
- Error titles: `Chưa có nội dung để AI đọc` (no_material, action `Dán nội dung`), `AI đang bận` (rate_limited), `AI chưa sẵn sàng` (not_configured), `AI chưa tạo đúng định dạng` (invalid_output), `AI chưa tạo được nội dung` (default); retry `Thử lại` when retryable.
- Review per item: `Chấp nhận` / `Sửa` (`Xong`) / `Bỏ`; `Hoàn tác` for accepted; states `Chờ duyệt`, `Đã chấp nhận`, `Đã bỏ`; `Chấp nhận tất cả` opens confirm listing items with button `Chấp nhận N câu`; summary `x câu · y đã chấp nhận`; `Tạo lại` discards; footer `Thêm N câu đã chấp nhận`.
- Apply sets `aiGenerated: true, aiReviewed: true`; only valid accepted items are appended.
- Server contract: count clamp 1-10 (default 3); material is pasted text (<= 12,000 chars) or lesson description + body plus material titles; 45 s abort; 4 options <= 300 chars, distinct texts; `correctIndex` 0-3; explanation <= 600 chars; `maxOutputTokens` 4000; errors `not_configured` / `rate_limited` / `unavailable` / `invalid_output` / `no_material`.
- Port `lecturer/quiz-builder.jsx` 38-76 appends everything straight into the quiz with `aiReviewed: false` and reviews later. Adopt the real dialog and gate before insert.

**A18 AI flag persistence (P1, decide).** PRODUCT §5 (line ~317 and T3) and STATE-MACHINES §19.2 say AI flags are stored and that readiness counts unreviewed AI questions. Real `publication-course-data.ts` 153-154 and 248-249 hard-code `null`, and the schema has no column, so the real AI-review gate never fires. See 4.U3.

**A19 Entry quiz (P1).** Real warning card title `Cần ít nhất 5 câu hỏi`; body `Hiện có N câu. Bài kiểm tra đầu vào cần tối thiểu 5 câu hỏi để đạt điều kiện xuất bản khoá học.` Each question has a select `Bài học tương ứng (BKT liên kết kỹ năng)` with placeholder `-- Chọn bài học để BKT đánh giá kỹ năng --` and helper text on mastery. Real links questions to lessons (`quiz_questions.lessonId`, entry only); port uses `conceptId`. Real mastery is per lesson. Port seed should key entry questions by lesson.

**A20 Entry toggle (P2, decide).** Real: entry test is a separate route (`/entry`). The scout reports that the schema forbids a lesson link on diagnostic rows (`assessments_diagnostic_shape_check`); this was not re-verified by the lead. PRODUCT (line ~61 and ~302) describes a toggle on a course quiz. See 4.U4.

**A21 Advisory warnings (P3).** Real advisory (not gating): fewer than 3 questions, 2 options, or no explanation (`publication-service.ts` 561-580).

### 2.4 Knowledge map (A22-A29)

**A22 Page states (P1).** Real (`knowledge-map-client.tsx` 451-535):
- `empty`: `Chưa có nội dung để phân tích` with `Thêm nội dung`.
- `failed`: `Phân tích bản đồ kiến thức thất bại` with disabled retry.
- `analysing` (legacy, no action): `Trạng thái phân tích cũ chưa được xác minh`.
- `stale`: `Nội dung đã thay đổi — chưa thể xác nhận lại`.
- `confirmed`: `Bản đồ kiến thức đã được xác nhận`.
- Trial notice: `Phân tích AI chưa khả dụng` + body `Bản thử nghiệm không gọi dịch vụ AI và không tạo bản đồ mới...`
- Zero concepts: `Chưa có bản đồ để xác nhận` + `Thêm bài học không tự động tạo khái niệm hay quan hệ.`
- Re-confirm needed: `Cần xác nhận lại để áp dụng cho học viên`.
- Ready with pending items: `Sẵn sàng xem lại (Ready for review) — còn N mục chờ xem lại (nguồn chưa được xác minh)`.
- Port `kmap-tab.jsx` 79-82, 120-122 offers `Phân tích nội dung`, `Thử lại`, `Phân tích lại` and `AI đề xuất — còn N mục chờ bạn xem lại`. Remove the CTAs and mirror these states.

**A23/A28 Generation (P1, decide).** Real `runKnowledgeMapAnalysis` always throws (`kmap/actions.ts` 220-227, verified by lead). Port `kmap-tab.jsx` 51-72 simulates generation and offers re-analysis from stale. Follow real (hide analysis) unless the product owner keeps a simulation. Docs (STATE-MACHINES §18, PRODUCT T2) describe analyse / retry / re-analyse.

**A24 Accept-all (P1).** Real dialog `Chấp nhận tất cả đề xuất?` shows counts and `N quan hệ bị bỏ qua vì sẽ tạo vòng lặp (vẫn giữ trạng thái chờ để bạn quyết định riêng)`. Loop-skip comes from pure `computeAcceptAllPlan` in `lib/knowledge-map-runner.ts` 141-173. Port `kmap-tab.jsx` 90 accepts loop-closing edges. This breaks decision D10 (STATE-MACHINES §18), which real implements.

**A25 Review (P2).** Labels: real `Bỏ khái niệm này` vs port `Bỏ`. Rename dialog: title `Đổi tên khái niệm`, label `Tên khái niệm kiến thức`, button `Lưu thay đổi`, empty `Tên khái niệm không được để trống.` Self-edge `Một khái niệm không thể cần học trước chính nó.`; duplicate `Quan hệ này đã có.` (port toasts match). Port rename is inline.

**A26 Graph (P2).** Real: zoom 0.6-1.4 in 0.15 steps; minimap `Bản đồ thu nhỏ`; chapter filter `Tất cả các chương`; side panel `Chi tiết khái niệm` with empty `Chưa chọn khái niệm` and `Nhấp vào bất kỳ nút nào trên sơ đồ...`. Lists: `Khái niệm (n)`, `Quan hệ "cần học trước" (n)`, `Thêm quan hệ`, `Xem trước thứ tự học mặc định` (empty `Chưa có bài học nào để sắp xếp.`; cycle `Không thể tính toán thứ tự học khi sơ đồ vẫn còn vòng lặp.`). Port cycle copy `Không xếp được thứ tự khi còn vòng lặp.` differs.

**A27 Confirm (P1).** Disabled-reason copy (`client` + `kmap/actions.ts` 471-570): `Cần giải quyết vòng lặp trước khi có thể xác nhận bản đồ.`, `Còn N đề xuất chưa duyệt. Chấp nhận hoặc bỏ các mục để hoàn tất.`, `Nội dung đã thay đổi; bản thử nghiệm chưa hỗ trợ xác nhận lại.`, `Bản đồ đã được xác nhận và đang có hiệu lực.`, `Chưa có bản đồ để xác nhận; chức năng tạo bản đồ chưa khả dụng.`, `Tất cả đề xuất đã được xem xét xong. Sẵn sàng xác nhận!`. Success toast `Đã xác nhận bản đồ kiến thức.` Server: status `ready`, pending 0, >= 1 concept, no cycle, >= 1 lesson; writes `confirmedKnowledgeMap` snapshot (concepts, prerequisites, lesson links). Port writes `c.prerequisites` and `lesson.conceptIds` only, no snapshot (`kmap-tab.jsx` 105-112).

**A29 Manual concept (P1 open).** Neither real nor port can create a concept without AI. See U1.

### 2.5 Grading, Q&A, reviews, snippets (G1-G8)

**G2 Rubric and pass threshold (P1, CONFLICT).** Real grading (`lib/grading-service.ts`, `grading-queue-client.tsx`):
- Single score: number, 0 <= score <= maxScore, comma allowed, rounded to 0.1. Error `Nhập điểm hợp lệ từ 0 đến {maxScore}.`
- Rubric: every criterion required (`Vui lòng nhập điểm cho "{name}".`, `Điểm "{name}" phải từ 0 đến {max}.`); total = sum rounded to 0.1; server requires match within 0.05 (`Tổng điểm (…) không khớp…`). Missing rubric scores: `Bài tập có thang điểm (rubric), vui lòng chấm điểm chi tiết cho từng tiêu chí.`
- Pass threshold: real `passingScore` is a percent, default 50; `isPassed = score >= maxScore × passingScore / 100`. Copy: rubric `Ngưỡng đạt: {passingScore}%` (renders blank when null, a real bug); single `Ngưỡng đạt: X/max` where X = round(pct × max, 0.1). Port uses absolute `passScore || 5` (`grading-page.jsx` 107, 122). This is a product decision (see 4.U6).

**G3 Score edit and history (P1, MISSING).**
- Changing an already-graded score requires reason >= 3 chars: `Vui lòng nhập lý do điều chỉnh điểm số (tối thiểu 3 ký tự).`
- Confirm: title `Sửa điểm bài đã chấm`; body `Bạn đang sửa điểm từ X thành Y.`; consequence `Học viên sẽ nhận thông báo điểm bài tập đã được cập nhật.`; reversible `Lịch sử chỉnh sửa điểm sẽ được lưu lại.`; confirm `Cập nhật điểm`. Feedback-only edits do not write history but still notify.
- History record: `{oldScore, newScore, feedback, reason, at, gradedBy}`. Sheet title `Lịch sử chỉnh sửa điểm`, description `Bài nộp của {name}`, item `Lần sửa N`, `Điểm cũ: X → Điểm mới: Y`, `Lý do: "…"`, `Nhận xét: …`, empty `Không có lần chỉnh sửa nào trước đó.`. Trigger `Xem lịch sử điểm (N lần sửa)`, shown whenever graded.
- Save buttons: `Lưu điểm` / `Cập nhật điểm` / `Đang lưu điểm...`; `Lưu và chấm bài tiếp theo`; `Bỏ qua, sang bài tiếp theo →`; `Đây là bài chờ chấm cuối cùng.`; toast `Đã lưu điểm và gửi thông báo cho học viên.`; stale-revision toast `Đã lưu bản trước đó. Các chỉnh sửa mới vẫn chưa được lưu.`
- Server errors: `Bài nộp đã được thay đổi bởi một phiên làm việc khác. Vui lòng tải lại trang.`, `Không thể chấm bài nộp ở trạng thái bản nháp (chưa nộp).`, `Chỉ có thể chấm bài tự luận (assignment).`, `Bạn không còn quyền chấm bài.`
- Notification: title `Bài tập đã được chấm` or `Điểm bài tập đã được cập nhật`; body `{assessment title} — {score}/{max} điểm`; link `/dashboard/learner` (port and docs say `/progress`).
- Queue ordering: pending by `submittedAt` ASC; graded by `gradedAt` DESC; `nextPendingId` = next pending in the same filter scope.

**G1 Queue filters (P2).** Add assignment select (options limited to chosen course) and date select `Tất cả ngày nộp` / `Hôm nay` / `7 ngày qua` / `30 ngày qua` (on `submittedAt`, local midnight start). Tab counts respond to filters. Empty copy: `Không có bài nào trong danh sách.`; right pane pending: `Không có bài nào chờ chấm` / `Bạn đã chấm hết các bài nộp. Bài làm mới của học viên sẽ xuất hiện tại đây.`; graded: `Chưa có bài đã chấm` / `Các bài sau khi chấm điểm sẽ được lưu trữ tại tab này.`

**G4 AI grading (P1, CONFLICT).** Real: disabled button `AI gợi ý điểm và nhận xét`, pill `Sắp có`, note `AI chấm bài chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm.`; server action returns an error (`grading/actions.ts` 582-593). Port `grading-page.jsx` 56-72, 124-128 fabricates a score and feedback draft (`ai-draft-note`). STATE-MACHINES G5 and §19 allow AI suggestions, but the user's rule forbids fake data. Match real.

**G5 Snippet picker (P2).** Placeholders `{{ten_hoc_vien}}` / `{ten_hoc_vien}` → name (fallback `em`); `{{diem}}` / `{diem}` → score with comma (fallback `—`). Inserted as `\n\n` + text. Toast `Đã chèn mẫu "{title}"`. Empty: `Chưa có mẫu nhận xét nào.` with link `Tạo mẫu ngay trong trang quản lý mẫu`; footer `Quản lý danh sách mẫu →`. Port uses single braces only (`grading-page.jsx` 12-32).

**G6 Snippets (P2).** Title 2-100 chars (client `Tiêu đề phải có ít nhất 2 ký tự.`; server `Tiêu đề mẫu tối đa 100 ký tự.`). Body 5-2000 (client `Nội dung nhận xét phải có ít nhất 5 ký tự.`; server `Nội dung mẫu tối đa 2000 ký tự.`). Dialog title `Tạo mẫu nhận xét` / `Sửa mẫu nhận xét`; description `Bạn có thể dùng biến {{ten_hoc_vien}} và {{diem}} để tự động điền khi chấm.`; placeholder `Ví dụ: Chào {{ten_hoc_vien}}, bài làm của em rất tốt, đạt {{diem}} điểm. Cố gắng phát huy nhé!`; hint `Gợi ý: Dùng {{ten_hoc_vien}} cho tên học viên và {{diem}} cho điểm số bài nộp.`; buttons `Lưu mẫu` / `Lưu thay đổi`, `Huỷ`, `Đang lưu...`.
- Delete: no confirm; immediate, toast `Đã xoá mẫu "{title}".` with `Hoàn tác` (re-inserts with new id). Port uses a confirm with no undo (`snippets-page.jsx` 35-44), which contradicts real and STATE-MACHINES §20.
- Table headers `Tiêu đề`, `Nội dung`, `Thao tác`; newest first; empty `Chưa có mẫu nào` / `Tạo mẫu nhận xét để tiết kiệm thời gian chấm bài.`. Real field is `body` (port seed `text`, `snippets-page.jsx` 26, 55); add `createdAt`.

**G7 Q&A inbox (P1).** Port gaps: no max length, no resolve guard, no lock, reply form always shown (`support-pages.jsx` 11-26, 51-73).
- Reply: trimmed 5-5000 chars (`Câu trả lời cần ít nhất 5 ký tự.`, `Câu trả lời không được vượt quá 5000 ký tự.`).
- Private conversations: resolve only when open and at least one lecturer reply exists (`Hãy trả lời học viên trước khi đánh dấu đã giải quyết.`); not open (`Cuộc hội thoại không ở trạng thái mở.`). Resolved threads reject posts (`Cuộc hội thoại đã được giải quyết. Vui lòng mở lại cuộc hội thoại để tiếp tục trao đổi.`); UI banner `Cuộc hội thoại này đã được đánh dấu giải quyết. Không thể gửi thêm tin nhắn trừ khi mở lại.` with button `Mở lại cuộc hội thoại` replacing the reply form. Reopen only when resolved (`Chỉ có thể mở lại cuộc hội thoại đã giải quyết.`). Resolve label `Đánh dấu đã giải quyết` only in open state.
- Public questions: no resolve or reopen; reply sets `answered`.
- Labels: `Chưa trả lời (n)`, `Đã trả lời (n)`, `Câu hỏi từ học viên (n)`, `Cuộc hội thoại AI (n)`, `Từ AI trợ lý (n)`, `Tin nhắn trao đổi (n)`, `Phản hồi (n)`; badges `Giảng viên`, `Quản trị viên`; statuses `Đang mở` / `Đã giải quyết`, `Chưa trả lời` / `Đã trả lời`.
- Empty states: `Không có câu hỏi.`, `Không có cuộc hội thoại.`, `Không còn câu hỏi chưa trả lời` + `Bạn đã trả lời hết các câu hỏi của học viên.`, `Chưa có câu hỏi đã trả lời` + `Các câu hỏi đã được phản hồi sẽ xuất hiện tại đây.`, `Không có cuộc hội thoại nào từ AI` + `Khi học viên chuyển tiếp câu hỏi từ AI trợ lý đến giảng viên, cuộc trò chuyện sẽ hiện ở đây.` (port lacks the description).
- Data: `conversations[].status` open|resolved; lecturer-message flag.

**G8 Reviews (P2).** Reply: non-empty (`Nhập nội dung phản hồi.`), max 3000 (`Phản hồi không được vượt quá 3000 ký tự.`). Port checks non-empty only (`support-pages.jsx` 124-146). Empty: `Bạn đã phản hồi mọi đánh giá` / `Không còn đánh giá nào đang chờ phản hồi từ bạn.`; `Chưa có đánh giá nào` / `Đánh giá từ học viên đã mua khoá học sẽ xuất hiện tại đây.` Only visible reviews listed (real `isVisible`); port counts hidden ones too. Star aria-label `{rating} trên 5 sao`.

### 2.6 Progress and insights (G10, G11)

**G10 Progress detail (P1).** Formulas (`progress/actions.ts`, `lib/lecturer-progress-service.ts`):
- Completion % = clamp(round(completed / total × 100), 0, 100); 0 with no lessons. Course average = round(mean of learner rates).
- Quiz average = round(mean of latest graded `quizPercent` per lesson, known only). Latest attempt: `attempt` DESC, `id` DESC, graded + submitted; drafts never count. Diagnostic quizzes excluded. Question stats use only current quiz revision from graded attempts.
- Question accuracy = round(correct / total × 100); `needsReview` when < 60. Display `—` with no evidence; statuses `Chưa có dữ liệu`, `Bình thường`, `Cần xem lại`.
- `lastActive` = max of lesson `lastAccessedAt`, lesson `completedAt`, quiz `submittedAt`, assignment `submittedAt`.
- Banners: `Biểu đồ mức thành thạo và xu hướng điểm chưa khả dụng trong bản prototype. Tiến độ hoàn thành không phải mức thành thạo.` (charts); `Chưa có dữ liệu gợi ý AI được ghi nhận đáng tin cậy; chưa thể thống kê mức sử dụng. Gợi ý không trừ điểm.` (hints). Hint column shows `Chưa ghi nhận` with tooltip.
- Quiz note: `Câu có tỉ lệ đúng dưới 60% được đánh dấu để bạn xem lại cách giảng hoặc đề bài. Chỉ tính câu hỏi phiên bản hiện tại từ lần nộp đã chấm được chọn; chưa có bằng chứng thì hiển thị “—”.`
- Learners tab: search `Tìm theo tên học viên...`; sheet description `Chi tiết tiến độ học tập và bài làm của học viên`; section `Tiến độ theo bài học (n)`; `Hoàn thành` / `Chưa hoàn thành`; `· Quiz X%`; `· Bài tập: X/Y` or `Chờ chấm`.
- Quiz tab columns `Bài học`, `Câu hỏi`, `Lượt trả lời`, `Tỉ lệ đúng`, `Trạng thái`. Empty `Chưa có câu hỏi quiz nào` / `Khoá học chưa có bài trắc nghiệm hoặc chưa có câu hỏi nào được tạo.`
- Missing course: `Khoá học không tồn tại` / `Không tìm thấy thông tin khoá học hoặc bạn không có quyền xem tiến độ của khoá này.` / `Quay lại danh sách`.
- Port: hint column and sheet hint section (`progress-pages.jsx` 17, 45, 74) contradict real; no banners, search or status column. "Bài code" tab (line ~70) is not in real or PRODUCT; treat as extra. Port uses seeded `learnerProgress.quizScores` and `answers` rather than graded attempts.
- Seed needs: per-lesson graded `quizPercent` with attempt and revision, `lastAccessedAt`, `completedAt`, submission timestamps.

**G11 Insights (P1).**
- Periods `7 ngày`, `30 ngày`, `90 ngày` (`?period=7|30|90`); GMT+7 windows; previous window same length, immediately before.
- Revenue: paid or refunded orders with `paidAt` in window (refunds stay in the paid period). Per line: gross = `unitPrice`; discount = round(unitPrice × orderDiscount / orderSubtotal); net = gross − discount. Refunds: `status=refunded` with `updatedAt` in window; refund amount = unitPrice − discount.
- KPI tiles (5): `Doanh thu gộp`, `Doanh thu ròng`, `Đơn thanh toán`, `Tiền giảm giá`, `Hoàn tiền` (refunds, delta good = down). Port has 4 tiles, no refunds.
- Chart: `Doanh thu theo thời gian`, question `Doanh thu ròng theo ngày, so với kỳ trước`; daily buckets for all periods (port switches 90 days to monthly, `insights-page.jsx` ~50). Table headers `Ngày`, `Ròng kỳ này`, `Ròng kỳ trước (cùng vị trí)`; note `Trung bình kỳ này: {net / days}/ngày · Tổng: {net}`.
- Course table: headers `Khoá học`, `Đơn`, `Gộp`, `Ròng`, `Tỉ lệ`; sorted by net DESC; share = course net / sum of course nets; total row `Tổng cộng` (100%). Port omits Ròng column and computes share on gross (`insights-page.jsx` 94-108). Refund-only courses can appear.
- Currency: `formatVnd` = round + ` ₫` (vi-VN grouping). Port `fmt.vnd` does not round.
- Data: refunded orders with `updatedAt`; order-level `discount` and `subtotal` (port seed has discount and total; `refunded` rows exist at `data.js` ~656).

**G9, G12, G13 (P3).** Progress list lacks the missing-course view. Dashboard: course row `Trình độ: {label}` (`lecturer-dashboard-view.tsx` 183; port `home-pages.jsx` 15-17); `Xem tất cả ({courses.length})`. Counts in port (`teach-api.jsx` 80-86) match real semantics (pending grading, unanswered root questions, unreplied visible reviews); real query is `lecturer/actions.ts` 117-160. Real dashboard alert needs `Lý do từ chối:` prefix and default reason.

---

## 3. Backend-only parts and how to simulate them

| Backend | Real implementation | Port simulation (recommended) |
|---|---|---|
| Quiz LLM generation | `courses/[courseId]/actions.ts` 1133-1229: `getLlmProvider().getModel()`, `generateText` + `Output.object(zod)`, `maxRetries: 0`, `maxOutputTokens: 4000`, 45 s abort; output 1..count questions as in A17; errors map to `not_configured` / `rate_limited` / `unavailable` / `invalid_output` / `no_material` | Keep `lecturer-ai-api.jsx` shape; add a scenario switch (forced demo states in `Codi.state.scenario`) returning each error code with the exact copy above. Always return 4 distinct options. |
| AI draft rows | `ai_content_drafts` (`ai-interaction-logs.ts` 54-65): kind `quiz_questions`, status pending, payload `{courseId, lessonId, difficulty, questions}`; insert is try/catch and swallowed (`actions.ts` 1210-1226); no update path | Optional `aiContentDrafts` collection in seed; no decision UI needed for quiz (per-item UI is client state). |
| Code runner | Server QuickJS WASM (`@codi-1/coding-runner`); phases `done` / `syntax` / `runtime` / `timeout`; per-user lease 20 s; cooldown 2 s; messages `Môi trường chấm đang bận xử lý lượt chạy trước. Vui lòng đợi trong giây lát.` and `Bạn thao tác quá nhanh. Vui lòng chờ 2 giây rồi thử lại.` | Web Worker (port `code-runner.js`, 3 s) is acceptable for JS. Remove Python simulation from the lecturer editor (STATE-MACHINES §23.5). Grade with canonical JSON equality (port `grade` in `code-runner.js` 90-100 matches). Do not claim server-side grading. Runtime timeout real default not verified (see 4.U7). |
| Knowledge-map generation | `runKnowledgeMapAnalysis` throws (trial) | Do not simulate new maps. Read seeded maps and show real trial states. |
| Concepts and edges | Tables `skills` (id, courseId, name, description, source ai\|lecturer, review), `skill_prerequisites` (source, review), `lesson_skills`; course `knowledgeMapStatus` (empty\|analysing\|ready\|confirmed\|failed\|stale), `knowledgeMapGeneratedAt`, generation counters, `confirmedKnowledgeMap` JSON | Mirror in `db.knowledgeMaps[courseId]`; snapshot on confirm. |
| Test-result retention | `codingTestResults` FK guard | Refuse deletion of test ids present in any `codeAttempts.failedTests`. |
| Publication readiness | `checkReadiness` in `publication-service.ts` 230-360; items: code, ai, assignment rubric, desc (>=20), lessons (>=1), price, entry (>=5), kmap confirmed | Port `readiness()` already covers desc, lessons, price, entry, kmap, code, rubric, AI. Align code item with the real rule (solution passes, not just >= 1 test) and keep the AI item behind decision 4.U3. |
| Uploads | None in lecturer editor (URL-only materials) | Replace simulated upload with URL list (C17). |
| Notifications | `notify(userId, {title, body, link})` (grading, publish, Q&A) | Keep `Codi.notify`; use real link targets (see 4.5). |

---

## 4. Business rule conflicts and undecided points

Items marked "conflict" mean real app and PRODUCT.md / STATE-MACHINES.md disagree. Items marked "undecided" need a product call before porting. Per the review rules, verified real behaviour is not reversed on abstract audit concern; user decisions are presented as options.

### 4.1 Conflicts: real app vs docs

1. **Chapter delete** (C13). Real: empty-only. Docs silent. Port: cascade. Recommend real.
2. **Lesson delete** (C14). Real: blocked when any submission, quiz, code or assignment exists, or dependent rows exist. Confirm UI promises deletion. Real UI bug. Docs (STATE-MACHINES §9) silent.
3. **Info edits and KMap staleness** (C19). Real marks map stale on any content write including price and info. STATE-MACHINES §16 only covers content.
4. **Price** (C18). Real requires a non-blank integer 0 to 2,147,483,647. STATE-MACHINES §16.1 only says "not null".
5. **Description and readiness** (C8). Real min 20 chars (readiness) with no length in PRODUCT §2.5. STATE-MACHINES §16.1 already notes this.
6. **Review flag reply** (C11). Real min 5 chars and only when course rejected; STATE-MACHINES §17 says "reason required" only.
7. **Pass threshold** (G2). Real: percent, default 50. STATE-MACHINES §11 and §20 and port seed: absolute `passScore`, default 5.
8. **AI grading** (G4). STATE-MACHINES G5 and §19 describe AI grade suggestions; real disables them with an error. Port fakes them. Match real.
9. **Hint usage in progress** (G10). PRODUCT (line ~317 and ~319) asks lecturers to see AI hint usage per lesson; real marks it unavailable.
10. **Course-level charts** (G10). PRODUCT (line ~319) asks for mastery and score trend charts; real says unavailable in prototype.
11. **Who can resolve a Q&A conversation** (G7). PRODUCT (line ~317) says the learner can resolve "only after replying"; STATE-MACHINES §14.2 and real say lecturer or admin, only after a lecturer reply. Real and STATE-MACHINES agree; PRODUCT is looser.
12. **Snippet delete** (G6). STATE-MACHINES §20 and real: immediate delete with undo. Port: confirm with no undo.
13. **Snippet placeholders** (G5, G6). Real accepts `{{x}}` and `{x}`; UI copy uses `{{x}}`. Port UI uses single braces.
14. **Grading notification link** (G3). Real: `/dashboard/learner`. Docs and port: `/progress`.
15. **Insights KPIs** (G11). PRODUCT B1 lists gross, net, paid orders, discount; real adds refunds.
16. **Entry test authoring** (A20). PRODUCT (line ~61 and ~302) says entry test is "a course quiz flagged as entry test" with a toggle. Real uses a separate entry route (per scout, the schema check forbids a lesson link on diagnostic rows; not re-verified by the lead).
17. **Knowledge-map analysis** (A23, A28). Real throws in trial; docs describe analyse, retry, re-analyse.
18. **Accept-all** (A24). Real implements D10 loop-skip; port does not. This is a gap, not a conflict.
19. **Quiz AI review before insert** (A16). STATE-MACHINES §19.1 and real dialog: only accepted questions inserted. Port inserts all. Follow real.
20. **Code save gate** (A5). STATE-MACHINES S23b says cannot save when reference fails; real blocks; port warns and saves. Follow real and doc.
21. **Python in lecturer editor** (A10). STATE-MACHINES §23.5 forbids simulating Python in production paths. Port simulates Python in the run and AI-suggestion paths (`code-runner.js` 49; `lecturer-ai-api.jsx` 118).
22. **Notification and stale fixtures.** `demo-fixtures/lecturer/unbuilt-states.ts` says quiz AI panel and AI test suggestions are "not built"/"not wired"; both are wired in real. Do not port S23 / S23b from that fixture.
23. **AI quiz copy.** Docs mention a rate-limit "Đã dùng hết lượt..." state; real copy is `AI đang bận`. Follow real.
24. **Rubric sum.** Port seed comment (`data.js` ~510) says rubric points sum to `maxScore`; neither real grading nor docs enforce it; port publication check only tests existence (`review-api.js` ~78).
25. **Real-only rules absent from docs**: reason >= 3 chars on score edit; Q&A reply max 5000; review reply max 3000; snippet title 2-100 and body 5-2000; diagnostic and old-revision quiz attempts excluded from progress; grading history fields; stale-view token on grade save; home count semantics (see 4.U8).

### 4.2 Undecided (blocking or product call)

- **U1. No way to create concepts.** Real `kmap/actions.ts` has no add-concept action and analysis is disabled, so a new course cannot get a confirmed map and cannot publish (readiness kmap item). Blocks every new course in real. The port can only publish seeded courses unless a manual concept path is decided.
- **U2. Lesson-to-concept membership** has no write path in the trial (A30; read-only parity).
- **U3. AI flag persistence.** Keep the PRODUCT / STATE-MACHINES AI-review publish gate (add `aiGenerated` / `aiReviewed` columns) or drop it to match the real inert guard?
- **U4. Entry-test authoring.** Separate route (real) or toggle on a course quiz (PRODUCT)?
- **U5. AI course, lesson and code drafts; document import** (A12, A31, A32). No real lecturer UI. Build, keep as simulation, or drop?
- **U6. Pass threshold.** Percent (real) or absolute (docs and port seed)? Drives grading copy, notifications, `isPassed`.
- **U7. Runner timeout.** Real `timeoutMs` default not checked in the scout's read; port uses 3 s. Confirm with `packages/coding-runner`.
- **U8. Home count semantics.** Real code comment says "unanswered" includes open private conversations, but the query counts only public root questions. Which is intended?
- **U9. Lecturer preview runs** (A8). Real writes nothing; port may write `codeAttempts`. Docs say no. Decide whether lecturer runs count.
- **U10. Course delete (C27) and DnD reorder (C28), assignment builder (C26).** Port-only features with no real UI. Keep (port extras) or drop per the no-extras rule.
- **U11. Real-world upload.** PRODUCT T1 requires video/PDF upload with progress and error states. Real is URL-only. Pick one; the port currently simulates upload, which breaks the no-mocks rule.
- **U12. Hint usage and charts** (G10). Show real "unavailable" copy or seed data as PRODUCT asks.

---

## 5. Verification notes

Spot-checked by the lead against source:
- Port chapter delete cascades with copy "Chương có N bài học, sẽ bị xoá cùng chương." (`codi-rebuild/src/features/lecturer/course-editor.jsx` 74-86). Confirmed.
- Port AI grading draft: `grading-page.jsx` line 128 renders `ai-draft-note` (`AI score/feedback draft`). Confirmed.
- Real `runKnowledgeMapAnalysis` always throws the trial message (`kmap/actions.ts` 220-227). Confirmed.
- STATE-MACHINES G5 and §19 describe AI grade suggestions (`STATE-MACHINES.md` 54, 941). Confirmed.
- PRODUCT lines ~61, ~302, ~313, ~317, ~319 match the cited conflicts. Confirmed.
- One scout claim was wrong: a sub-report said the port readiness lacks desc, lessons and price items. `course-editor.jsx` 269-290 includes them (desc >= 20, >= 1 lesson, price non-null, entry >= 5, kmap confirmed, plus code, AI and rubric items). Corrected in C8 and section 3.
- Other scout claims (exact copy, line numbers, formulas) were not re-read by the lead; treat as scout-verified, re-check before porting copy.

## 6. Open questions for the controller

1. Decide U1 (manual concept creation) before any port work on publish readiness; it blocks new-course publishing in real.
2. Decide U6 (pass threshold) and U3 (AI flags) because they change data shape.
3. Decide U5 and U10 (port-only features): keep or remove.
4. Confirm whether the real app or PRODUCT wins for C13/C14 (chapter and lesson delete), since the real lesson delete promises an action its server blocks.

Status: DONE_WITH_CONCERNS
Summary: The lecturer port covers the main authoring, publish, grading and insights screens, but four P1 items need decisions or fixes: chapter/lesson delete rules, the knowledge-map trial behaviour (real disables generation), AI grading (port fabricates, real disables), and the missing lesson editor fields (free preview, URL materials, description). Several rules conflict between PRODUCT/STATE-MACHINES and real code, including pass threshold (percent vs absolute).
Concerns: The real app has no lecturer path to create concepts (U1), so new courses cannot satisfy the knowledge-map publish item. The port's readiness already covers most items; one sub-report claimed otherwise and was corrected. Some exact copy and line references come from scout reads and were not all re-verified.
