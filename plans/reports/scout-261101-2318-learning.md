# Scout report: learner learning experience, real app vs codi-rebuild

Date: 2026-11-01 (Asia/Bangkok). Read-only scout. Nothing was edited outside this file.

Scope: `Codi/apps/web/src` learner routes and components (dashboard, `/learn/*`, `/progress`, `/insights/*`), the learner-side lib (assessment, coding, tutorial, ai-tutor, learning-path, BKT, study-activity), learner API routes, and `packages/db` where BKT defaults live. Compared with `codi-rebuild/src/features/learning` and `features/coding`.

Sources of truth used: `Codi/docs/mockup/PRODUCT.md` and `STATE-MACHINES.md` (binding per porting guide), the real-app docs `lesson-player.md`, `learner-assessments.md`, `learner-coding.md`, `code-lesson-detail-ui.md`, `course-onboarding.md`, `course-learning-path.md`, `learner-dashboard-progress.md`, and `mockup/product-updated-27-10.md`.

Overall picture: the rebuild is a faithful port of the mockup's happy paths. Most gaps are (a) real-app states the mockup never showed (loading, save errors, sandbox unavailable, material failures), (b) real backend behaviour the rebuild fakes (uploads, media, tutor, study time, BKT), and (c) a few places where the real app already diverged from the mockup and the rebuild followed the mockup.

---

## 1. Summary table

Status legend: done = behaviour and states match the real app for the learner; partial = core flow works but states or rules are missing; missing = no equivalent in the rebuild. Priority: P1 core flow, P2 important, P3 nice.

| # | Feature | Real-app source files (under `Codi/apps/web/src` unless noted) | Rebuild status | Priority |
|---|---|---|---|---|
| 1 | Learner home `/dashboard` (S12) | `app/dashboard/learner/page.tsx`, `components/learner-workspace.tsx` (35.7K), `components/learner-page-guard.tsx`, `app/api/learner/overview/route.ts`, `lib/learner-overview-service.ts` | partial: `features/learning/dashboard-page.jsx` has continue card, goal tracker, streak, badges, updates; no loading, error or retry states; week window is rolling UTC | P2 |
| 2 | Personal path / course home (S10, L5) | `app/learn/[courseId]/page.tsx`, `course-home.tsx`, `course-home-sections.tsx`, `components/learning-path/{lesson-path,path-map,path-summary,path-adjust-offer,prerequisite-advice}.tsx`, `lib/learning-path-service.ts` (40K), `learning-path-adjustment.ts`, `learning-path-ai.ts` | partial: `path-page.jsx` is list-only; missing "Danh sách / Bản đồ" toggle, "Vì sao lộ trình này" summary, "Bắt đầu ở đây" marker, "Kiến thức nên học trước" and "Mức thành thạo hiện tại" detail, offer loading copy | P1 |
| 3 | Course onboarding (S08, S08b, S09) | `app/learn/[courseId]/onboarding/{onboarding.tsx,onboarding-screens.tsx,page.tsx}`, `lib/onboarding-contract.ts` (`updateBkt`), `lib/onboarding-service.ts` (18K) | partial: `features/learning/onboarding-page.jsx` covers goal, fork, diagnostic, result. Missing: leave-guard dialog, server-side draft, GitHub level suggestion, BKT scoring | P1 |
| 4 | Lesson player shell, checklist, completion (S11, S11e) | `app/learn/[courseId]/[lessonId]/{page,lesson-player,layout,loading}.tsx`, `lib/lesson-player-service.ts`, `lesson-player-contract.ts`, `components/study-activity-tracker.tsx` | partial: `lesson-player-page.jsx` has sidebar, checklist, offer, update notice, completion. Missing: loading state, progress-save error with retry, study heartbeat | P1 |
| 5 | Materials: video, YouTube, PDF, reading (markdown) | `components/lesson-material-view.tsx` (15K), `components/youtube-material.tsx`, `components/lesson-markdown.tsx`, `lib/youtube.ts`, `public/pdfjs/` | partial/simulated: `MaterialView` uses a fake timer (video) and 8 fake slides (PDF); no YouTube; reading is split paragraphs, not markdown | P1 |
| 6 | Quiz (S11c, L7) | `components/lesson-assessment.tsx` (`QuizAssessment`), `lib/assessment-service.ts` (21K), `assessment-contract.ts`, `quiz-revision.ts`, `quiz-import.ts` | partial: `QuizSection` covers answer, nav, unanswered confirm, result review, retake. Missing: clickable question navigator, save error copy, "Kết quả lần trước", unsupported-quiz state, `predict_output` type | P1 |
| 7 | Assignment upload and resubmit (S11d, L8) | `components/lesson-assessment.tsx` (`AssignmentAssessment`, `SubmissionContent`), `lib/assignment-storage.ts`, `assignment-presign`, `assessment-upload-ticket.ts`, `app/api/learn/[courseId]/lessons/[lessonId]/assessments/[assessmentId]/file/route.ts` | partial: `AssignmentSection` simulates upload. Missing: draft save status, file removal (Gỡ tệp), per-assessment size limit, abort, download of own file | P1 |
| 8 | Coding challenge (S11g, L6b) | `components/lesson-coding.tsx` (34K), `lib/coding-service.ts` (12K), `coding-contract.ts`, `coding-runner.ts`; `packages/coding-runner` (QuickJS WASM worker) | partial: `features/coding/code-api.jsx` has editor, run and submit, hidden-test aggregate, hint ladder, test filter, console. Missing: sandbox-unavailable state, real solution gate, Python policy (see conflicts C2, C3) | P1 |
| 9 | Coding tutorial steps (`code.kind = tutorial`) | `components/lesson-tutorial.tsx` (28K), `lib/tutorial-service.ts`, `tutorial-contract.ts` | partial: `TutorialView` has TOC, step bar, solution gate dialog, prev/next, console. Missing: per-step persisted drafts and runs, retry and error copy | P2 |
| 10 | In-lesson AI tutor panel (S11a, S11a', L6c) | `components/ai-tutor/tutor-panel.tsx` (37K), `tutor-launcher.tsx`, `tutor-selection-toolbar.tsx`, `tutor-thread-list.tsx`, `tutor-lesson-picker.tsx`, `tutor-escalate-dialog.tsx`, `tutor-bridge.tsx`; `lib/ai-tutor-service.ts` (16.5K), `ai-tutor-contract.ts` (16K), `ai-tutor-ai.ts`, `tutor-service.ts`; `app/api/learn/[courseId]/lessons/[lessonId]/tutor/route.ts` (8 req/min per user), `tutor/threads/route.ts` | partial: `features/coding/tutor-api.jsx` has hint ladder 1–3, streaming and stop, 👎 reasons, escalation modal, selection toolbar, diff apply and undo, rate-limit scenario. Missing: the three modes (PRODUCT-binding), thread history, lesson picker, launcher disclaimer | P2 |
| 11 | AI tutor full page `/learn/[courseId]/tutor` | `app/learn/[courseId]/tutor/{page.tsx,tutor-page.tsx}` | missing: no route. Note: `/learn/:courseId/:lessonId` would capture `/learn/x/tutor` and show "Không tìm thấy bài học" | P2 |
| 12 | Public lesson Q&A (S11b) | `components/tutor/lesson-qa-panel.tsx` (9K), `app/api/learn/[courseId]/lessons/[lessonId]/discussions/route.ts` | partial/done: `QaBody` has list, 10-character rule, lecturer badge, pending badge. Missing: loading and error copy | P3 |
| 13 | Private lecturer conversations (S11h, L6d) | `components/tutor/ask-lecturer-dialog.tsx`, `app/api/learn/[courseId]/lessons/[lessonId]/conversations/route.ts`, `lib/ai-tutor-service.ts` | partial: rebuild has the escalation modal only (`LecturerForm`). Missing: conversation thread, status chips, reply, resolve and reopen | P2 |
| 14 | Progress and results `/progress` (S13, L10) | `components/learner-workspace.tsx` (`ProgressResults`), `app/progress/{page,loading}.tsx` | done (minus loading and error states): `progress-page.jsx` has tabs, accordion, quiz and assignment grades, feedback, mastery | P3 |
| 15 | Study activity tracking (heartbeat) | `components/study-activity-tracker.tsx`, `app/api/learn/[courseId]/lessons/[lessonId]/activity/route.ts`, `lib/study-activity-service.ts`, `lib/learner-overview-contract.ts` (`STUDY_HEARTBEAT_MS = 30000`, `STUDY_MAX_GAP_MS = 45000`, Vietnam-calendar week) | missing: study minutes exist only as a seed (`learnerStudyDays`) | P2 |
| 16 | Stats `/insights/stats` (S13b) | `app/insights/stats/{page,learner-stats-view,loading}.tsx`, `lib/learner-insights-service.ts` (14K) | done: `StatsPage` in `insights-pages.jsx` has C1–C6, period and course filters, "Xem chi tiết (2 thẻ)". Minor: rolling window, UTC dates | P3 |
| 17 | Knowledge map `/insights/knowledge-map` (S13c) | `app/insights/knowledge-map/{page,loading}.tsx`, `components/knowledge-map.tsx` (10K), `components/knowledge-map-sections.tsx` (11K), `lib/confirmed-knowledge-map.ts` | partial: `KnowledgeMapPage` has graph, table, bars, next-review hint. Missing: node side panel with lessons and "Học bài này", "Bài học được gợi ý" marker, BKT evidence line, error state with "Thử lại", not-confirmed hidden state | P2 |
| 18 | Insights hub `/insights` | none. Real app only has `/insights/stats` and `/insights/knowledge-map` | rebuild-only (from mockup); not in real app | P3 (decide keep or drop) |
| 19 | Course completion card and review form (S11f, S14) | `components/learner-workspace.tsx`, `app/learn/[courseId]/course-home-sections.tsx` (`CompletionCard`, review dialog) | done: `CompletionCard`, `ReviewDialog` in `learning-shared.jsx` | P3 |
| 20 | Adaptive offer and path update (decisions 66–67) | `components/learning-path/path-adjust-offer.tsx`, `lib/learning-path-adjustment.ts`, `lib/learning-path-adjust-service.test.ts` | done: `OfferCard`, `applyOffer`, `undoOffer`, toast undo. Missing: async "Codi đang xem lại lộ trình của bạn…" state | P3 |
| 21 | GitHub level suggestion and dashboard card (L4 step 1, L14, decision 61) | `lib/github-profile-*.ts` (large). Onboarding integration not traced by this scout | missing on the learning side. Shell has `features/shell/github-api.jsx` (not reviewed) | P2 (cross-feature, confirm owner) |
| 22 | Mastery model, BKT (D16) | `lib/onboarding-contract.ts` (`updateBkt`), `lib/learning-path-service.ts` (`bktPInit` use), `lib/learner-insights-service.ts` (`masteryLevel`), `packages/db/src/schema/knowledge-map.ts` (defaults: pInit 0.1, pLearn 0.2, pGuess 0.2, pSlip 0.1) | partial: rebuild uses the mockup's heuristic `masteryFromScore` and diagnostic mapping right 3 / wrong 1 / unknown 0 | P2 |

---

## 2. Missing and partial features, detail

### 2.1 Learner home (row 1) — partial, P2

- What: "Bàn làm việc", welcome line, continue card, my courses, updates aside, goal tracker, recommendations.
- Real states to add: loading (skeleton), error card "Chưa thể tải hoặc cập nhật dữ liệu học tập" with "Thử lại", and the toast "Đã ẩn thông báo cá nhân hoá lộ trình." when the diagnostic card is dismissed.
- Real copy: `Mục tiêu hàng tuần`, `Chưa thể tải hoặc cập nhật dữ liệu học tập`, `Cập nhật cho bạn`, `Gợi ý cho bạn`.
- Week window: real uses a Vietnam-calendar week (Mon–Sun, GMT+7); rebuild uses rolling 7 days in UTC (see C7).
- Rebuild files: `features/learning/dashboard-page.jsx`, `features/learning/learning-store.js` (`streakDays`, `minutesThisWeek` use `toISOString`).

### 2.2 Personal path and course home (row 2) — partial, P1

- Real layout: header with goal and "Chỉnh mục tiêu", progress, "Học tiếp", chapter groups. Real also has a second view "Bản đồ" (`path-map.tsx`) and a summary card "Vì sao lộ trình này" (`path-summary.tsx`: goal, hours, diagnostic status, progress, skippable count, "Thay đổi gần đây", and "Đây là thứ tự mặc định của khoá học, chưa được cá nhân hoá theo kết quả của bạn" when default).
- Row detail (real `lesson-path.tsx`): "Bắt đầu ở đây", "Mới cập nhật", "Vì sao bài này", "Kiến thức nên học trước", "Mức thành thạo hiện tại", "Codi đánh dấu bài này có thể bỏ qua. Bạn vẫn có thể mở bài.", "Xem lại bài" / "Học tiếp".
- Offer loading: `path-adjust-offer.tsx` shows "Codi đang xem lại lộ trình của bạn…" while applying.
- Rule: prerequisite is advisory (decision 65). Rebuild already matches `lockInfo` and `lessonStatus`.
- Rebuild files: `features/learning/path-page.jsx`, `learning.css`. Map view is optional (see C10).

### 2.3 Onboarding (row 3) — partial, P1

- Real flow: goal (3 single-question steps, "Bước n/3"), "Bỏ qua", start fork, diagnostic intro, questions, result, path generation.
- Missing leave guard. When the goal has unsaved changes and the learner leaves, real shows a dialog:
  - Title: "Lưu lựa chọn trước khi rời đi?"
  - Body: "Mục tiêu đang dùng chưa thay đổi. Lưu nháp để lần sau tiếp tục chỉnh từ bước này…"
  - Buttons: "Ở lại", "Bỏ thay đổi", "Lưu nháp".
- Server draft: real saves goal draft and step in the enrollment. Rebuild keeps the draft in `r.goalDraft` (session state only).
- Diagnostic answers: real saves each answer immediately and resumes from the saved question. Rebuild does this in memory, so a reload loses answers. The real resume copy on the intro screen was not checked.
- Mastery after the test: real uses BKT (`updateBkt`). Unknown answers give no evidence. Rebuild uses 3 / 1 / 0 (see 2.22).
- GitHub level suggestion (PRODUCT L4 step 1): a card above the level options, "Theo GitHub của bạn: …", "Dùng gợi ý", and "Kết nối GitHub để Codi gợi ý trình độ". Missing in rebuild (row 21).
- Files: `features/learning/onboarding-page.jsx`, `features/learning/learning-store.js` (goal draft and mastery writes).

### 2.4 Lesson player shell, checklist, completion (row 4) — partial, P1

- Present and matching: sidebar, prev and next, AI and Q&A buttons, checklist, "Đã đánh dấu học xong" toggle, completion button disabled with "Còn thiếu: …", update notice, offer card, next-lesson card.
- Missing states:
  - Loading: real has `loading.tsx` and copy "Đang tải video…", "Đang tải tài liệu…".
  - Progress save error: real has an alert "Chưa lưu được tiến độ tài liệu" with "Bạn có thể tiếp tục học và thử lưu lại." and a "Thử lưu lại" button.
  - Study heartbeat (row 15): a focus-time tracker per lesson.
- Real rule: `open`, `study`, `video`, `pdf-page` and `complete` each re-check the server guard. The client never sends "passed" or scores (`lesson-player.md`). Rebuild has no server, so this is N/A.
- Files: `features/learning/lesson-player-page.jsx`, `features/learning/learning-store.js`.

### 2.5 Materials (row 5) — partial/simulated, P1

Real behaviour (`lesson-material-view.tsx`, `youtube-material.tsx`, `lesson-markdown.tsx`):

- Video, self-hosted `<video>`: resume from saved position; "Tiếp tục từ giây n"; "Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây."; study marked at 90%: "Xem ít nhất 90% video để đánh dấu đã học xong."
- Video, YouTube (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, 11-character ID, https only): embedded via `youtube-nocookie.com/embed/ID` with IFrame API. Progress is sent when paused, every 10 s while playing, on end, and on pagehide. If the API is blocked: alert "Không theo dõi được tiến độ video" with "Video vẫn xem được nhưng vị trí xem sẽ không được lưu. Xem xong, hãy bấm “Đánh dấu đã học xong”." If embedding is disabled or the video is deleted: error state with "Thử lại" and "Mở video trên YouTube".
- PDF: pdf.js assets in `public/pdfjs/`. Page counter "Trang n/m". "Đã xem n/m trang. Xem đủ các trang để đánh dấu học xong tự động." Study is marked when all pages have been seen (not just the last page; see C5). Text view button: "Đọc nội dung trang dưới dạng văn bản". Escape hatch: "Mở PDF trong trình duyệt".
- Error for materials: "Chưa tải được tài liệu" with "Vui lòng thử lại. Bạn có thể đọc phần tóm tắt bài học trong lúc chờ…", "Thử lại". Rebuild has a similar error block, but its retry is a fake timer.
- Reading: `lesson.body` is markdown rendered with streamdown in static mode (no raw HTML, external links `rel="noopener noreferrer"` and new tab). Rebuild `ReadingText` splits on blank lines into plain paragraphs. Rebuild already has `Md` (`mdToHtml`) in `components/ui/primitives.jsx`, so use it.
- Rebuild simulation: keep the fake timer and slides, add the "seen pages" set, the text-view toggle and the error copy above.
- Seed: none of the lessons has a URL, duration per material or body markdown (`server/seed-source/data.js` has 0 `youtube`, 0 `url`, 0 `src`). Add `materials: [{kind, url|null, durationSeconds|null, pages}]` and markdown bodies.
- Files: `features/learning/lesson-player-page.jsx` (`MaterialView`, `ReadingText`), `features/learning/learning.css`, `server/seed-source/data.js`.

### 2.6 Quiz (row 6) — partial, P1

- Real states: answering, unanswered-confirm dialog ("Còn N câu chưa trả lời" / "Câu chưa trả lời sẽ được tính là sai. Bạn muốn nộp bài ngay?" / "Vẫn nộp bài", "Quay lại làm tiếp"), submitting ("Đang gửi…"), result (pass or fail), retake.
- Real navigator: a row of question buttons with `aria-label` "Câu n, đã trả lời" or "Câu n, chưa trả lời", labelled "Đi đến câu hỏi". Rebuild `progress-segments` are not clickable.
- Real result copy: "Điểm đạt: N% · Lần làm n", "Làm lại không giới hạn; lần gần nhất được tính.", "Kết quả lần trước" plus "Cần nộp lần làm hiện tại để tính kết quả." while a retake is open, and "Bạn chọn: Chưa trả lời".
- Real save error: "Không thể lưu đáp án. Hãy chọn lại." (per answer), and "Không thể lưu quiz." (submit).
- Real unsupported quiz: `unavailableReason`. The UI does not offer the open button, and shows "Quiz chưa có câu hỏi. Vui lòng liên hệ giảng viên." when empty.
- Scoring: real uses exact percent (`quizPercent`, 69.5% fails 70%). Rebuild uses `Math.round` (C4).
- Retake: real keeps the lesson checklist blocked until the latest attempt is graded or submitted and passes (D6). Rebuild matches this, since `submitted` is cleared on retake.
- Files: `features/learning/lesson-player-page.jsx` (`QuizSection`), `features/learning/learning-store.js` (`completeLesson`, `masteryFromScore`).

### 2.7 Assignment (row 7) — partial, P1

- Real states: not submitted, uploading (XHR progress "Đang tải lên… n%"), upload error with "Thử lại", abort ("Đã huỷ tải tệp."), draft restored ("Đã khôi phục bản nháp."), draft save status ("Chưa lưu…", "Đã lưu bản nháp.", "Chưa lưu được bản nháp. Vui lòng thử lại."), pending ("Đã nộp — chờ chấm", "Bài đã nộp vẫn được giữ cho đến khi bạn nộp lại."), resubmit and cancel resubmit, graded ("Đã chấm: x/max", "Đạt"/"Chưa đạt", feedback, "Bài đã chấm không thể nộp lại.").
- Real file rules: size cap is the per-assessment `maxFileSizeMb`, capped at 20 MB. Upload goes directly to a private R2 bucket with a presigned PUT, then confirm and copy. Remove-file (Gỡ tệp) is available for drafts and for pending submissions until resubmitted. Download is via a session-gated route.
- Real labels: "Tệp bài làm", "Đường dẫn bài làm", "Bài làm (bắt buộc)" when only the link is required, "Ghi chú cho giảng viên (không bắt buộc)", "Tối đa {maxFileSizeMb}MB". Rebuild hardcodes 20 MB and mixes these labels.
- Copy difference: mockup says "Bài đã chấm không nộp lại được trong bản thử nghiệm (giả định Q10)"; real says "Bài đã chấm không thể nộp lại." (C12).
- Rebuild simulation: keep the simulated progress. Store only `{name, size, type}` for the file, and show "Gỡ tệp". Do not pretend a file is downloadable. Real deadline copy ("hạn nộp {n} ngày sau khi mở bài", "nộp muộn: …") is shown in real and the rebuild already shows it.
- Files: `features/learning/lesson-player-page.jsx` (`AssignmentSection`, `runUpload`), `server/seed-source/data.js` (`maxFileSizeMb` per assignment).

### 2.8 Coding challenge (row 8) — partial, P1

- Present and matching: editor with line numbers, run (Ctrl/⌘+Enter), submit, format (Shift+Alt+F), reset, console, test rows with filter, hidden-test aggregate, "Đã nộp N lần", hint ladder with lock (`1 + failSubmits` open hints; the real count is `hints.length - 1 - failedSubmits` locked, which is equivalent), keyboard hint.
- Missing states:
  - Sandbox unavailable: real returns 503. Copy: "Sandbox chưa sẵn sàng", "Dịch vụ chạy {language} chưa sẵn sàng. Bạn vẫn có thể đọc yêu cầu và lưu nháp.". Rebuild falls back to the main thread and never shows this state.
  - Execution errors: real copy "Code chạy quá lâu nên bị dừng" / "Code chạy quá thời gian" and "Chưa thể thực hiện" with retry.
  - Solution gate: real opens the solution only after all tests pass, or after three completed run-submits that did not pass ("Lời giải mở khi bạn đạt tất cả test hoặc sau 3 lần nộp chạy xong nhưng chưa đạt."). Rebuild's "Xem lời giải" button has a confirm and no submit-count gate (C2). Verify lines 428–431 of `code-api.jsx` before changing.
  - Real "Giảng viên sẽ thấy bạn đã xem lời giải trước khi đạt. Điểm năng lực của bài này được giới hạn ở 70%." is the confirm copy for the mastery cap. Keep it.
- Real lease and cooldown (20 s lease, 2 s cooldown, 409 busy, 429 cooldown) are backend only (see section 3).
- Files: `features/coding/code-api.jsx` (`ChallengeView`, `solutionAction`, `runAction`), `features/coding/code-runner.js`.

### 2.9 Coding tutorial (row 9) — partial, P2

- Real: TOC with step buttons, step bar "Bước n/m", "Bước trước", "Tiếp" (with next title), "Đã đi hết hướng dẫn", "Có thể hoàn thành bài học.", the solution step locked ("Code lời giải đang được ẩn.", "Chọn “Hiện lời giải” khi bạn đã sẵn sàng."), dialog "Bạn chắc muốn xem lời giải?" with "Hiện lời giải", error "Chưa thể thực hiện" with retry.
- Real saves `current`, `visited`, `drafts` and `runs` per step (`coding_workspaces.tutorial_progress`). Save failure keeps the code and offers retry. Restore asks for confirmation and affects only the chosen step.
- Rebuild: `TutorialView` covers the main states; per-step drafts and runs are in memory.
- Files: `features/coding/code-api.jsx` (`TutorialView`, `stepAction`, `tutSolutionAction`).

### 2.10 AI tutor panel (row 10) — partial, P2

- Present: per-lesson thread, hint ladder 1–3 (names match real: "Hướng nghĩ", "Chỗ cần xem lại", "Khung cách làm"), 👎 reasons (match real), streaming and stop ("Dừng"), selection toolbar, escalation ("Hỏi riêng giảng viên"), diff apply and undo, rate-limit scenario.
- Missing:
  - Modes (PRODUCT Flow L6c and revision 2026-10-12 (c), binding): chips "Giải thích đơn giản", "Gợi ý từng bước", "Ôn lại khái niệm" (real `TUTOR_MODE_LABELS`). The mockup JS does not implement modes either (see C8).
  - Thread history and new thread: real `tutor-thread-list.tsx` ("Đoạn chat mới", "Tìm đoạn chat", "Chưa có đoạn chat nào. Bấm “Đoạn chat mới” để hỏi về một bài học.", "Không có đoạn chat khớp …").
  - Lesson picker: "Chọn bài để hỏi Tutor", "Mỗi bài có một đoạn chat riêng, giữ nguyên khi bạn quay lại."
  - Launcher disclaimer dialog: "Lưu ý khi dùng trợ lý AI", with bullets: "Trợ lý có thể trả lời sai. Hãy đối chiếu với tài liệu bài học.", "Trợ lý không chấm điểm và không đổi điểm của bạn.", "Với bài code, trợ lý chỉ gợi ý hướng làm, không viết sẵn lời giải.", "Cần người thật giúp, hãy hỏi riêng giảng viên."
  - Context: real chips are "Bài: …", "Yêu cầu: …", "Code bạn đang viết", "Test chưa đạt: …", "Lỗi: …", "Đoạn đã chọn · n dòng". Real `TUTOR_CONTEXT_LIMITS` (task 3000, selection 1200, code 12000, error 1000, test 600) and "· đã rút gọn" should be copied.
  - Rate limit: real 8 requests per 60 s per user. Rebuild uses only a scenario flag.
- Files: `features/coding/tutor-api.jsx`, `features/coding/coding.css`.

### 2.11 Tutor full page (row 11) — missing, P2

- Real: `app/learn/[courseId]/tutor/`: thread list on the left, active thread on the right, header "Mở đúng chỗ", "Lịch sử Tutor", "Hỏi tiếp Tutor" composer, "Chưa tải được lịch sử Tutor" with retry, empty state "Chọn một bài học để hỏi Tutor. Mỗi bài có một đoạn chat riêng.".
- Rebuild: no route. `features/learning/routes.jsx` and `features/coding/routes.jsx` (routes array is empty). `/learn/:courseId/:lessonId` would match `tutor` and show "Không tìm thấy bài học". Add the static route before the dynamic one.
- Files: `features/coding/routes.jsx`, `features/coding/tutor-api.jsx` (extract the panel into a page component).

### 2.12 Public lesson Q&A (row 12) — partial, P3

- Rebuild matches: "Câu hỏi của bạn về bài “…”", 10-character minimum, "Đang chờ giảng viên trả lời", "Đã trả lời", "Giảng viên" badge, "(bạn)" suffix, empty state.
- Missing: loading "Đang tải danh sách câu hỏi...", error "Đã có lỗi xảy ra khi gửi câu hỏi.", and the note "Giảng viên và học viên cùng khoá đều xem được câu hỏi."
- Files: `features/learning/lesson-player-page.jsx` (`QaBody`).

### 2.13 Private lecturer conversations (row 13) — partial, P2

- Real: escalation dialog "Hỏi riêng giảng viên" ("Chỉ bạn và {lecturerName} xem được cuộc trao đổi này.", "Gửi kèm ngữ cảnh": "Code hiện tại của bạn", "Test chưa đạt: …", "Tóm tắt trao đổi với AI trợ lý", "Huỷ" / "Gửi cho giảng viên"). It creates a conversation that is listed under the lesson as "Trao đổi với giảng viên", with status "Chờ giảng viên", replies, "Đã giải quyết", and reopen (PRODUCT L6d, S11h, Q34).
- Rebuild: `LecturerForm` sends a modal question, but there is no conversation list, status, reply, or resolve.
- Rule to keep: the learner must write at least 10 characters (`TUTOR_ESCALATE_MIN`).
- Files: `features/coding/tutor-api.jsx` (`LecturerForm`), `features/learning/lesson-player-page.jsx` (new conversation list), `features/lecturer/*` for the lecturer reply side (out of scope).

### 2.14 Progress and results (row 14) — done minus states, P3

- Missing: loading and error states. Real `progress/loading.tsx` exists.
- Files: `features/learning/progress-page.jsx`.

### 2.15 Study activity tracking (row 15) — missing, P2

- Real: `StudyActivityTracker` posts `prepare` / `start` / `heartbeat` / `stop` to `/api/learn/[courseId]/lessons/[lessonId]/activity` every 30 s (`STUDY_HEARTBEAT_MS`) while the tab is visible. Gaps longer than 45 s (`STUDY_MAX_GAP_MS`) are ignored. Seconds are credited per day in the Vietnam calendar (GMT+7). Streak and weekly goal read these credits.
- Rebuild: `learnerStudyDays` is seeded only. No tracking, so the streak and weekly goal never move after a lesson is studied.
- Rebuild simulation: a `useEffect` in `LessonPlayerPage` with a 30 s interval while `document.visibilityState === 'visible'`, crediting `min(30, gap)` seconds to `Codi.db().learnerStudyDays` for the GMT+7 date (`Intl` with `timeZone: 'Asia/Bangkok'` is equivalent to GMT+7 here).
- Files: `features/learning/lesson-player-page.jsx`, `features/learning/learning-store.js`, `features/learning/dashboard-page.jsx`.

### 2.16 Stats (row 16) — done, P3

- Minor: week and day bucketing use UTC (`toISOString`). Real uses GMT+7 (C7). The rebuild's disclaimer "Giờ học tính trên mọi khóa" matches the mockup.
- Files: `features/learning/insights-pages.jsx`.

### 2.17 Knowledge map (row 17) — partial, P2

- Real node panel (`knowledge-map-sections.tsx`): selected node shows mastery label, "n bằng chứng · Xác suất BKT p%", "Bài học liên quan", "Học bài này", "Chưa đủ tiên quyết · nên học bài tiên quyết trước", "Bài học được gợi ý" (sr marker on the recommended lesson), empty "Chưa có bài được xuất bản cho khái niệm này.".
- Real states: "Chưa có bằng chứng học tập.", error "Không thể tải bản đồ." with "Thử lại", empty "Chưa có bản đồ kiến thức" with "Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết." (matches PRODUCT S13c "hidden (map not confirmed)"), course picker "Chọn khoá học", list mode "Xem dạng danh sách" / "Bảng số liệu" (rebuild has a table).
- Rebuild: graph and table, "Nên ôn tiếp", locked = mastery 0 with prerequisite under 1. Missing: side panel, lessons per node, error and hidden states.
- Files: `features/learning/insights-pages.jsx` (`KnowledgeMapPage`), `features/learning/learning.css`.

### 2.18 Insights hub (row 18) — rebuild only, P3

- The real app has no `/insights` hub. Decide whether to keep it (mockup-driven) or remove it. Do not treat its absence as a bug.

### 2.19 Course completion and review (row 19) — done, P3

- Rebuild `CompletionCard` and `ReviewDialog` match: "Chúc mừng! Bạn đã hoàn thành khoá học", stars, "Sửa đánh giá", "Gửi đánh giá", "Lưu thay đổi". Real also shows "Bạn đã đánh giá n/5" and a visible "Khoá học gợi ý tiếp theo". Rebuild has the next-course card.

### 2.20 Adaptive offer (row 20) — done, P3

- Matches real copy: "Codi gợi ý điều chỉnh lộ trình", "Áp dụng xong, bạn có thể hoàn tác ngay từ thông báo.", "Giữ nguyên lộ trình", options and undo toast. Missing: async loading copy "Codi đang xem lại lộ trình của bạn…" (optional, because rebuild is synchronous).

### 2.21 GitHub level suggestion (row 21) — missing on the learning side, P2

- PRODUCT L4 step 1 and L14: suggestion card on the level step, "Đang phân tích GitHub…", "Kết nối GitHub để Codi gợi ý trình độ", the "ước tính từ GitHub" label on diagnostic results (decision 61), and a dismissible dashboard card "Kết nối GitHub để Codi hiểu bạn nhanh hơn".
- Rebuild: `features/shell/github-api.jsx` and `github-profiles.js` exist (not reviewed here). Learning features do not call them.
- Needs an owner decision: shell or learning feature. Do not port the real GitHub analysis (LLM).

### 2.22 Mastery model (row 22) — partial, P2

- Real: BKT per (enrollment, concept). Parameters default to pInit 0.1, pLearn 0.2, pGuess 0.2, pSlip 0.1. Update per observation:
  - `knows = prior * (correct ? 1 - pSlip : pSlip)`
  - `guesses = (1 - prior) * (correct ? pGuess : 1 - pGuess)`
  - `posterior = knows / (knows + guesses)` (prior unchanged if both are 0)
  - `next = posterior + (1 - posterior) * pLearn`
- Unknown answers (diagnostic "Tôi chưa biết") do not update BKT (D16).
- Levels from pMastery: 0 = no evidence; 1 = below 0.40; 2 = below 0.60; 3 = below 0.85; 4 = 0.85 or more. Labels: 0 "Chưa học", 1–2 "Đang học", 3–4 "Thành thạo".
- Example, one diagnostic answer on a concept with the default parameters: correct gives posterior 0.333, then next 0.467, which is level 2 "Đang học". Wrong gives next 0.211, level 1. The rebuild's diagnostic maps right to 3, which shows "Thành thạo" after one question. This is a visible difference on the diagnostic result, the dashboard badges (level 3 or more) and the knowledge map.
- Rebuild change: add `updateBkt(prior, correct, params)` to `learning-store.js` (about 15 lines). Store `pMastery` and `evidenceCount` per concept. Feed diagnostic answers (not unknown), quiz results and coding results. Keep `MASTERED = 3` (equivalent to pMastery ≥ 0.60).
- Mockup says the heuristic is only a placeholder (STATE-MACHINES §8, D16), so this port is a required change, not a new feature.
- Files: `features/learning/learning-store.js` (`masteryFromScore`, `completeLesson`), `features/learning/onboarding-page.jsx` (`DiagQuestion.next`), `features/learning/insights-pages.jsx` (level labels).

---

## 3. Backend-only parts and how to simulate them in the rebuild

| Real backend part | Real implementation | Rebuild simulation |
|---|---|---|
| LLM tutor answer and hint | `lib/ai-tutor-ai.ts` (`streamTutorAnswer`, `generateTutorHint`), `ai-tutor-service.ts`, rate limit `checkRateLimit` 8 per 60 s per user (`tutor/route.ts`) | Already rule-based in `tutor-api.jsx` from lesson, test and error text. Keep it. Add a rate counter in `Codi.state` (8 per 60 s) and show the `limit` message. Keep "never full solution" as a rule of the templates. |
| Learning path generation and adjustment | `lib/learning-path-ai.ts`, `learning-path-service.ts` (40K), durable job after commit with fallback | Already simulated with `setTimeout` in `generatePath`. Keep. |
| Knowledge-map extraction | `lib/knowledge-map-runner.ts` (lecturer side, LLM) | Seed only. Keep. |
| Coding sandbox | `packages/coding-runner` (QuickJS WASM in a Node worker: 16 MiB heap, 256 KiB stack, 3 s limit, max 4 workers, 503 when full), lease 20 s, cooldown 2 s (409 busy, 429 cooldown), hidden tests returned as an aggregate only | JS in a Web Worker with timeout (existing). Add `Codi.state.scenario.codeSandbox = 'unavailable'` to show the real 503 copy. Hidden tests stay aggregate-only in the UI (already). Lease and cooldown are not needed. |
| Python | Real: not available. Copy "Dịch vụ chạy Python chưa sẵn sàng", docs say "Không chạy Python giả" | Currently simulated and labelled "mô phỏng" (C3). Replace with the real unavailable state, or keep the simulation with an explicit note. Needs a decision. |
| Assignment file storage | Private R2 bucket, presigned PUT, confirm by copy, session-gated download, daily sweep | Store only file metadata (`name`, `size`, `type`) in `r.draft` and the submission. Show progress with a fake timer. Show "Gỡ tệp". No download. |
| YouTube | `youtube-nocookie.com` iframe, IFrame API for progress, fallback when blocked | Embed without API, or use the existing fake timer. Use the "Đánh dấu đã học xong" button as the fallback described in `lesson-player.md`. Seed a real video ID only if network use is acceptable. |
| PDF | pdf.js assets in `public/pdfjs/` (generated at build) | Keep the 8 fake slides. Add the seen-page set and the text view. Do not add pdf.js (large, version-pinned). |
| Study heartbeat | `study-activity` route and DB rows | 30 s interval in the lesson player, credits to `learnerStudyDays` (section 2.15). |
| BKT | `updateBkt` in TypeScript | Port the 10-line function (section 2.22). |
| Public Q&A, private conversations, notifications | DB rows, notification service | In memory, using `Codi.set`, as the rebuild already does for questions. |

---

## 4. Business-rule conflicts and undecided points

Consistent (checked, no action): study counts at 90% of video (decision 66); hint names and 👎 reasons; advisory prerequisites (decision 65, `lockInfo`); offer thresholds and options (decision 67, `MASTERED = 3` ≈ pMastery 0.60); assignment resubmit only while pending (D8, STATE-MACHINES §11); quiz retake clears `submitted` and blocks completion (D6); hint unlock count (`1 + failed submits`, real `lockedHints` formula gives the same result); escalation minimum 10 characters.

Conflicts and open points:

- **C1. Mastery model.** D16 (STATE-MACHINES §8, decided 2026-10-14) says BKT. The rebuild uses the mockup placeholder. Effect: one correct diagnostic answer shows "Thành thạo" in the rebuild and "Đang học" in the real app. Recommendation: adopt BKT (section 2.22). This is a decided rule, so no user approval is needed beyond confirming the port.
- **C2. Coding solution gate.** Mockup STATE-MACHINES §12 allows "Xem lời giải" from idle or failing states with a confirm, and no gate. Real app (`learner-coding.md`, `code-lesson-detail-ui.md`) opens it only after all tests pass or after three completed run-submits that failed, and says this was confirmed by the requester on 18/10/2026 during review #128. The mockup is not updated. Options: (a) follow real and update the mockup and PRODUCT; (b) keep the mockup. Need user decision, because the porting guide makes the mockup binding.
- **C3. Python.** Mockup simulates Python (passes if the code matches the reference). Real refuses to simulate it (503, "chưa sẵn sàng", "Không chạy Python giả"). Rebuild simulates Python and labels it "mô phỏng". Options: (a) show the real unavailable state; (b) keep the simulation with the label. Real principle is no fake grading, so (a) is the closer match. Need user decision.
- **C4. Quiz percent.** Mockup: `score = round(right / total × 100)`, so 69.5% becomes 70% and passes. Real: exact percent compared with the pass score (69.5% fails 70%, per PR #126). Recommendation: exact percent in the rebuild (`Math.round` on the score is the difference). Small change, decided in real.
- **C5. PDF completion.** Mockup: reaching the last of 8 pages marks studied. Real: all pages must have been seen (seen-pages list). Recommendation: real rule.
- **C6. Hint unlock wording.** Real formula and rebuild both open `1 + failedSubmits` hints. `learner-coding.md` says the change "không đổi hints theo tổng số lần trượt" (the hints do not change with the total number of failures). That sentence contradicts the formula unless it means "total failures across lessons". Ask the requester what the sentence means before changing either side.
- **C7. Week, day and timezone.** Real: weekly goal and calendar use Vietnam calendar weeks (Monday to Sunday, GMT+7). Mockup L10 mentions "7 day markers" without a definition. Rebuild: rolling 7 days, UTC dates. Asia/Bangkok is also GMT+7, so the same rule works. Recommendation: GMT+7, Monday to Sunday.
- **C8. Tutor modes.** PRODUCT Flow L6c and the 2026-10-12 (c) revision (binding) list three mode chips. Neither the mockup JS (`docs/mockup/js/ai-tutor.js`) nor STATE-MACHINES §13 implements them. Real has them (`TUTOR_MODE_LABELS`). The rebuild should follow PRODUCT. This is a mockup-versus-PRODUCT gap, so it needs the product owner to confirm that modes are in scope for the port.
- **C9. Knowledge map visibility.** PRODUCT S13c: "hidden (map not confirmed)". Real: empty state until the lecturer confirms concepts. Rebuild: shows the map whenever concepts exist. Follow real.
- **C10. Path map view.** PRODUCT S10 says "list with per-row status and reasons (map as inspiration)". Real has a list and map toggle. Undecided whether the rebuild should add the map. Not required by the mockup.
- **C11. Assignment late policy.** Mockup: "no enforcement". Real displays `dueDays` and the `latePolicy` text (`LATE_POLICY`). Enforcement in real was not traced. Undecided: is there a penalty or a reject rule? Ask the requester before the rebuild shows late-policy text as if it applies.
- **C12. Grade copy.** Mockup: "Bài đã chấm không nộp lại được trong bản thử nghiệm (giả định Q10)". Real: "Bài đã chấm không thể nộp lại." The porting guide says copy stays verbatim from the mockup. Keep the mockup copy unless the requester accepts the real wording.
- **C13. Study time source.** Mockup has no tracking (seed only). Real tracks focus time. Rebuild must choose: simulate tracking (section 2.15) or keep the seed. Recommend simulating, because the streak and goal copy depend on it.
- **C14. Knowledge-map and insights hub.** `/insights` hub is rebuild-only (row 18). Keep or remove needs a product decision.

Undecided in docs (not conflicts): PRODUCT Q34 on conversation resolution (only the learner can resolve without a lecturer reply, lecturer must reply first) is not implemented in real code that this scout read. Treat as open.

---

## 5. Verification notes and gaps in this scout

- Read: the real route folders, learner component copy (non-ASCII strings), the learner lib constants and BKT function, the real docs listed above, PRODUCT Flows L4–L10, L6c, L6d, L13 and S08–S14, STATE-MACHINES §§7–13, and the rebuild files `features/learning/*`, `features/coding/*`, `server/seed-source/data.js` (counts only).
- Not read in depth: `lesson-player-service.ts`, `assessment-service.ts`, `coding-service.ts`, `tutorial-service.ts`, `learning-path-service.ts` internals (only constants and call sites), `ai-tutor-service.ts` internals, and `features/shell/github-api.jsx`.
- Not verified in the real app: how the real UI handles the Python 503 path (copy and docs only); late-policy enforcement; whether draft autosave status copy exists in the rebuild's coding editor; whether the real GitHub suggestion card is inside onboarding (lib names only).
- No browser checks were run. Visual states are not compared, only copy and rules.

Status: DONE_WITH_CONCERNS
Summary: 22 feature rows mapped; the rebuild covers the mockup's learner happy paths but lacks the real app's states (loading, save and sandbox errors, materials failures), tutor modes and history, private lecturer conversations, study-time tracking, and BKT mastery; the real app also diverges from mockup rules in four places that need a user decision (C2 solution gate, C3 Python, C5 PDF completion, C6 hint wording).
Concerns: C2 and C3 change learner-visible behaviour and need a product decision; the mockup is binding per the porting guide, so changing it requires approval. GitHub onboarding integration and late-policy enforcement were not traced.
