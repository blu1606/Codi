# Deviations from the mockup docs

Since stage 2, codi-rebuild follows the real Codi app (`Codi/apps/web`) wherever it conflicts with
`Codi/docs/mockup` PRODUCT.md and STATE-MACHINES.md (user decision, 2026-11-01). This file lists every
behaviour that now differs from the mockup docs, grouped by feature folder. The decisions behind it are in
`plans/261101-2318-stage2-real-app-port/plan.md`.

Two cross-cutting decisions apply everywhere:

- AI features that the real app shows as "Chưa khả dụng" or "Sắp có" stay working as simulations. AI never
  saves a grade by itself; the lecturer confirms every draft.
- Analytics and finance numbers come from the backend. Cards the backend has no source for show the real app's
  "chưa có số liệu" state (see "Backend port" below), never invented or browser-computed numbers.

## Controller (shared runtime)

- The Python code challenge is enrolled for the demo learner (`usr-learner-001`, `course-python-001`) so the
  real "Sandbox chưa sẵn sàng" state is reachable. The unavailable-runtime copy says "Python" rather than the
  raw language code that the real app prints.
- The knowledge-map chart labels locked concepts "Chưa đủ tiên quyết" (real wording) instead of "Chưa mở khoá".
- `<Avatar>` shows an uploaded profile image wherever it is used.

## shell


These need to be added to `docs/deviations-from-mockup.md`. That file is controller-owned, so I did not edit it.

1. **Forgot password:** 6-digit OTP with the reset form on the same card and an automatic redirect. This replaces PRODUCT A2's "Kiểm tra email của bạn" link step and the success CTA.
2. **Remember me:** "Ghi nhớ email" stores the email only. PRODUCT had "Ghi nhớ đăng nhập".
3. **Sign-up OTP:** 2-minute expiry with a visible timer. The wrong-code text is now the real "Mã OTP không chính xác hoặc đã hết hạn 2 phút.". The rebuild's 3-try lock is kept, with the real text "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.".
4. **Theme:** the control lives in the user menu, not the header (PRODUCT §2.1). Default is "Theo hệ thống".
5. **User menu:** "Tiến độ & kết quả" and "Hồ sơ năng lực" added. Copy keeps the English in brackets.
6. **Notifications:** "Đánh dấu tất cả đã đọc" (PRODUCT S40 had "Đánh dấu đã đọc"). Absolute vi-VN time replaces relative time. The list shows every item instead of 8.
7. **Settings:** no app header, close and Esc go to the role home. Name editing moved from inline to a dialog. Email mask is `••••••••@domain`.
8. **Password change:** the success copy is the real toast "Các phiên đăng nhập khác đã được đăng xuất." and other sessions really are revoked. The mockup Alert "Các thiết bị khác cần đăng nhập lại." is gone.
9. **Profile:** real two-column layout. The stat tiles (courses, lessons, transactions) and the security card are replaced by the real two stats and the heatmap. The courses tab lost the mockup's "Đang học" / "Đã hoàn thành" filter.
10. **GitHub analysis:** moved into the profile tab. Linking and analysing need separate consents (the old mockup flow analysed straight after OAuth). The "Phân tích lại" sheet now uses the real consent and waiting copy. PRODUCT L14 extras are still not ported: per-item corrections, deleting the profile, the 24 h cooldown (scout section 4, item 6).

**Where I kept the rebuild or mockup instead of the real app:**
- The deactivated-account message (PRODUCT S03).
- The logout card in the security tab (PRODUCT A3).
- The richer transactions table with "Tiếp tục thanh toán". The real app lists raw course ids.
- "Xem lại" / "Tiếp tục học" are working links. The real buttons are disabled.
- Vietnamese role badges, where the real profile card uses English.

**Copy translated from English** (the real copy is English, the app copy rule is Vietnamese):
- Heatmap heading "{n} ngày hoạt động trong {year}".
- Cell tooltips "N hoạt động vào …".
- Month labels "Th1"…"Th12" and weekday labels T2 / T4 / T6.
- Legend "Ít / Nhiều".


## commerce


1. Catalog sort set follows the real app ("Học nhiều nhất" replaces the price sorts). Search filters live as you
   type, and filter changes replace the URL instead of pushing a history entry.
2. Voucher expiry is an instant comparison (`expiresAt < now`), not end of day (STATE-MACHINES §4). The voucher also
   gains `startsAt` and a `maxDiscount` cap.
3. An applied voucher that becomes invalid blocks checkout with its message. The spec is silent here.
4. Cart "Huỷ đơn này" cancels without a confirm dialog (real app). This differs from STATE-MACHINES G1.
5. Zero-total orders are paid and enrolled at creation (not in the docs).
6. A late transfer after expiry is honoured automatically unless every course is already owned (D2). Overpayment
   settles the order and flags reconciliation.
7. Replace-order keeps the old courses, per the user decision. The STATE-MACHINES §3 table says "NOT re-added".
8. Detail page: the in-cart state adds "Mua ngay". The pending copy is "Đơn hàng đang chờ thanh toán." instead of
   "Đang chờ thanh toán / Đơn … chưa nhận được tiền."
9. Manual-check result uses the real three-step copy (no invented "30 phút" line).
10. Home follows the real app: features, popular courses, AI Mentor and footer replace "Cách Codi hoạt động" and
    "Khoá học nổi bật". The hero copy is real except the title, which keeps the Vietnamese mockup title. The real
    title is English ("A new way to learn & get knowledge"), which breaks the Vietnamese copy rule. The real section
    kickers ("Tính năng ưu việt", "Khóa học", "AI Mentor") and the hero eyebrow are dropped because craft-floor
    bans eyebrows.
11. /ai is open to every role (PRODUCT L13 says guests and learners).
12. Course reviews list only visible reviews from enrolled learners, and the learner's own review loses its "(bạn)"
    marker.


## learning


1. The quiz checklist item is "Đạt quiz (≥ N%)": the latest attempt must be submitted and must pass (real D6). The mockup only required a submit.
2. The quiz percent stays `Math.round` (the real `gradeQuiz` code), not an exact percent (scout C4). I followed the code over the prose.
3. A PDF counts as studied only when every page has been seen (C5), not when the last page is reached.
4. Mastery uses BKT. One correct diagnostic answer now shows "Đang học", not "Thành thạo" (C1). Completing a lesson without a quiz or code no longer raises mastery to 2.
5. Late policy: the real app stores no late flag, enforces nothing, and shows only "hạn nộp N ngày sau khi mở bài". The text "nộp muộn: …" was removed. The header line is now "Thang điểm X · điểm đạt P% · hạn nộp …".
6. The graded-assignment copy is now the real "Bài đã chấm không thể nộp lại." (C12).
7. Week, streak and calendar use the Vietnam calendar (Mon–Sun, GMT+7) (C7). The stats window ends on the later of `analyticsAsOf` and the learner's latest study day.
8. The knowledge map is hidden until `knowledgeMaps[courseId].status === 'confirmed'` (C9). Courses with no knowledge-map record count as confirmed.
9. Lesson-kind label "Slide/PDF" is now "PDF". The weekly-hours choices no longer show "≈ N tuần". The goal skip button sits beside "Tiếp tục". The last goal step reads "Lưu mục tiêu".
10. The mockup's placeholder lesson summary was removed. Lessons with no body and no material show "Chưa có nội dung bài học".
11. The checklist notes use the real wording. Coding notes are now "Đạt tất cả test" / "Lần nộp gần nhất chưa đạt" / "Nộp bài để chấm"; the mockup's "n/m test" and "đã xem lời giải" notes were removed.
12. The path list no longer marks the current row with an accent bar on the left. It uses a filled step marker and "Bắt đầu ở đây" instead (craft floor).


## coding


1. C2 solution gate: real. The solution needs `solutionCheck.ok` and either a pass or 3 failed submits whose run
   finished. The mockup allowed it at any time behind a confirm.
2. C3 Python: refused with "Sandbox chưa sẵn sàng" and drafts kept. It is no longer simulated, and the
   "· mô phỏng" label is gone. `Codi.code.run(…, {language:'python'})` resolves `{phase:'unavailable', results: []}`.
3. Grading: `passed` and the score come from the latest submit ("Chỉ lần nộp gần nhất được tính."). The mockup used
   the best score and a sticky pass. `bestScore` is still kept.
4. Hint locks: one line, "Còn N gợi ý mở dần…", instead of one locked line per hint.
5. The hidden-test summary no longer adds "— xem lại bước N" (real exposes nothing about hidden tests).
6. The timeout copy is real ("Quá thời gian chạy (3 giây)." and "Code đã vượt giới hạn 3 giây…").
7. The challenge output is a tab pair, Kết quả kiểm thử / Console. Test rows are collapsed by default.
8. Reset is labelled "Đặt lại" in the editor bar, is always enabled, and uses the real copy. Format no longer shows a
   toast.
9. Tutorial test results print in the console instead of a separate "Kiểm tra bước này" panel. The TOC check means
   the step was visited.
10. Tutor: the title is "Trợ lý AI", the placeholder is "Hỏi trợ lý về bài học…". New: three modes, the "+" context
    menu, the "Yêu cầu" chip, copy, escalate after 👎, "Đã dùng n/3 gợi ý", and the 8-per-60-s limit. A transient
    failure is shown separately from a stored error. The lecturer-waiting copy is now "Bạn sẽ nhận thông báo khi giảng
    viên trả lời.".
11. Selection toolbar: the actions differ for code and for text, as in real.
12. New: the full Tutor page and the launcher popup. Rebuild-only addition: a "Lưu ý khi dùng trợ lý AI" link in the
    panel's empty state, so the disclaimer is reachable even when the lesson player does not render the launcher.
13. Mockup kept where real has nothing: per-instruction-step done markers in "Yêu cầu" and the plain-language
    explanation line under errors.


## lecturer


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


## lecturer-ai


1. **Code save gate.** The mockup port warned and saved anyway. Now save is refused unless the reference solution passes every test. This matches real and STATE-MACHINES S23b.
2. **Expected values.** The mockup required valid JSON. Text that does not parse is now stored as a string (real).
3. **Test deletion.** The mockup asked for confirmation. Real has no confirm, keeps at least 1 test, and refuses the save when the removed tests have learner results.
4. **AI boundary tests.** The mockup derived calls from the first test, sent results to a review panel and simulated Python. Real derives calls from the solution, appends the tests straight to the draft and supports JavaScript only. STATE-MACHINES §23.5 also forbids the Python simulation.
5. **Lecturer preview.** The mockup reused the learner workspace. The real preview runs nothing into storage and shows hidden tests only as a count.
6. **AI quiz.** The mockup appended every question straight into the quiz. Questions now pass the accept/discard gate before they are added (real dialog, STATE-MACHINES §19.1). The mockup's rate-limit copy `Đã dùng hết lượt...` is replaced by the real `AI đang bận` in the quiz dialog.
7. **Accept-all on the map.** The mockup accepted edges that close a loop. They are now skipped and stay suggested (real D10).
8. **Map analysis and AI grading.** Both run on Codi's real backend since the develop sync (branches `feat/auto-knowledge-map-analysis` and `feat/ai-grading-suggestions`); the earlier simulations are gone. Map analysis is a background job: "Phân tích lại" / "Phân tích nội dung" / "Thử lại" queue it, saving course content queues one automatically, and the tab re-reads the map every 5 s while it is analysing. The grading suggestion is a review card instead of Codi's direct form fill: each criterion and the feedback can be accepted, edited or ignored, and `Điền vào phiếu chấm` fills only the kept items. These labels have no real or mockup source and are mine: `Điền vào phiếu chấm`, `Gợi ý lại`, `Bỏ qua gợi ý`, `Tổng các mục giữ lại`, `Bản nháp AI gợi ý` and the notes in the card.
9. **Copy kept from the port where real names its own infrastructure.** Real labels say `JavaScript (QuickJS Sandbox)` and the badge `Bài tập code (S23b)`. The port runs code in a browser Web Worker, so the labels read `JavaScript` and `Bài tập code`.
10. **Real `Pass` / `Fail` result labels** are shown with the coding feature's Vietnamese `Đạt` / `Chưa đạt` test rows, to stay consistent with the learner view.


## admin


These belong in `docs/deviations-from-mockup.md`. That file is outside my ownership; see "Shared change requests".

1. **Period presets:** 7 / 30 / 90 ngày (real). Mockup "Quý", "Tùy chọn" and the "So sánh: kỳ trước" toggle are removed; the previous period is always shown.
2. **A1:** "Học viên có học (TB/ngày)" replaces WAU.
3. **A2:** shows daily active learners (with study time). DAU/WAU stickiness is removed, and points are daily for every period.
4. **A3:** counts a cohort of accounts created in the window instead of summing daily series.
5. **A7:** the "Chờ duyệt lâu nhất" and median-wait tiles are removed (real).
6. **A8:** shows two snapshot tiles plus the grading median in the window. The three-column Hôm nay / 7 / 30 table and the queue links are removed.
7. **A5:** is a horizontal bar of completed ÷ learners from enrolments and progress. The sort toggle is removed.
8. **B3:** has no "Danh mục" or "Giảng viên" tabs (real has per course only).
9. **B4:** amounts are real totals. The weekly stacked columns are removed.
10. **B6:** a "Sau 30 phút" bucket replaces the "Hết hạn" bar.
11. **B7:** columns are Đơn dùng, Tiền giảm, Doanh thu ròng. The "Trạng thái" column is removed.
12. **B8:** uses 24 hours instead of 30 minutes, adds a flagged count and an item table, and removes "Hoàn tiền chờ xử lý" (`refund_requested`).
13. **Finance page:** "Chi tiết thêm" is always expanded (real). The Insights page keeps its toggle (real).
14. **Admin cancel of pending orders:** the docs never defined it; it is added from the real app.
15. **Overdue threshold:** 24 hours or more (real `>=`).
16. **Role change:** select, then "Lưu", then confirm (real), instead of changing as soon as the select changes.
17. **Voucher scope:** whole cart, one voucher per order (PO 14/10). The "Áp dụng cho: Tất cả khoá học" block is removed.
18. **Publication minimums:** reasons need 5 characters or more, and the price is capped at 2.147.483.647.
19. **Dashboard:** "Doanh thu" is B1 net for the 30-day GMT+7 window, which includes refunded orders paid in the window. The real dashboard sums only `paid` orders over a rolling 30 days. I changed this so the dashboard and Finance agree, as you required. "Học viên mới" counts learner signups in the same window.
20. **Analytics source and end date:** analytics now read live store rows ending today. The synthetic `db.analytics` series and `analyticsAsOf` are no longer read. The rows are still in the seed for any other reader.
21. **Publication review in context (S32, S32b, S25):** The mockup's "Nội dung" tab and the "Xem trước như học viên" modal are replaced by one "Xem trước" tab. It renders the course page and each lesson as the learner sees them (the learner's MaterialView, the markdown reading, the quiz, the code task and the assignment). A "Giảng viên" toggle adds correct answers, hidden tests and the solution check. "Gắn cờ" sits on each block: course-info field, chapter, lesson, reading, material, quiz, question, code, test and assignment. Each flag stores that place (`publication_review_flags.target_item_id`), and the flag is shown where it was placed. The lecturer sees the same flag in the same place: under the field in Thông tin, on the chapter header and the lesson row in Nội dung, under the body, a material or the assignment in the lesson sheet, and on the question card in the quiz builder. The flag is marked fixed there. "Kết quả kiểm duyệt" keeps the full list, and "Xem tại chỗ" opens each flag's place. Round 2 compares the content with the snapshot the admin decided on in the previous round (`course_publication_requests.reviewed_content`). It lists what changed, marks changed blocks "Đã sửa", and counts the flags the lecturer fixed. Flags on code lessons are shown on the lesson row, because the code editor belongs to another feature.


## AI grading assist (stage 3)

- The lecturer's "AI gợi ý điểm và nhận xét" calls Codi's `getAiGradingDraft({ submissionId, viewToken })`: the model reads the text answer and the rubric and returns a score per criterion (or one overall score) and a feedback draft; nothing is saved or sent to the learner. The card shows a loading state with elapsed time and "Dừng", then the review card (accept / edit / ignore per item) or the server's error with "Thử lại". Suggestions stay in memory for the open tab (list badge "Có gợi ý AI") and are tied to the submission version; a reload drops them. AI still never saves a grade: "Điền vào phiếu chấm" only fills the form (rule G5). File-only or link-only submissions get the server's "AI hiện chỉ hỗ trợ bài nộp dạng văn bản" message.

## GitHub onboarding (stage 3)

- New accounts get an optional account-level "Kết nối GitHub" step after OTP verification (`/onboarding/github?next=…`); existing accounts reach it from a dashboard prompt and from course onboarding. The real app has no account-level step.
- Since the backend port, both the step and the profile tab save the analysis directly, as the real app does (no separate "Lưu vào hồ sơ").
- A header theme menu (Sáng / Tối / Theo hệ thống) is available to every visitor, guests included.
- The lesson page is a split pane (material left, work right). The AI tutor and the private Q&A are tabs in the work pane instead of a floating button and docked side panels (redesign decision, 2026-11-02).
- The course path page draws the AI path as a transit diagram (chapters as lines, lessons as stations); the old list/map toggle is replaced by it, and the knowledge map is a separate link.

## Backend port (2026-11-02)

The JSON prototype store is gone; every screen uses Codi's backend (`plans/261102-1834-codi-backend-port/`).
User-visible changes:

- Sign-in, register, email OTP, password reset and sessions are real (Better Auth). Without Resend, codes are
  printed to the backend console. Google / GitHub buttons go to the real provider; the simulated account chooser
  is gone.
- Order links use the order code (`/checkout?order=CODI12345`). Payment is a simulated SePay transfer posted to the
  real webhook handler; the Alt+K outcome picks paid / underpaid / overpaid / expired / late / no transfer.
- A hidden course answers 404 on its detail page, so the "tạm ẩn, bạn vẫn học bình thường" banner no longer shows.
  The `?error=1` simulations and the Alt+K flags `pathAI`, `materials`, `codeSandbox` and `githubAnalysis` were
  replaced by real error states. "Đặt lại dữ liệu" left the Alt+K drawer: run `npm run seed`.
- Admin analytics A4 (giữ chân), A6 (bài đầu vào hay bài 1), A9 (sức khỏe AI), the A8 grading-time median and B5
  (phễu thanh toán) show "Chưa có số liệu …" as in the real app. The period choice is kept in this browser.
- Deactivating a user shows the reason but no date; a criterion note is saved once a verdict is chosen; there is no
  admin manual payment check (learner-only in Codi).
- Lecturer: lessons cannot be dragged into another chapter (Codi has no cross-chapter move); late-submission policy,
  accepted file types, the "AI soạn" badge and per-question AI-reviewed marks are not stored. Knowledge-map analysis
  and AI grading suggestions use Codi's real AI (see above). AI document import and AI lesson / code-exercise drafts
  stay browser simulations.
- Learner: the entry-test marker on the mastery chart and the lesson count on dashboard recommendations are gone
  (no server data). PDF/slide materials remain a simulated page viewer. Assignment rubrics show as a criteria list.
- Code runs only in the backend sandbox (JavaScript). The browser runner was removed; the lecturer preview of a
  guided tutorial is read-only.
- "Hồ sơ năng lực" uses the real GitHub link and analysis routes (linking works locally on port 3001 with
  Codi's GitHub OAuth app). A saved profile shows the full report computed from the saved analysis (summary, languages, push activity, technologies with evidence, insights, knowledge areas, repos, collection scope) instead of the mockup's canned report; the onboarding step keeps a compact summary.
  "Sửa hồ sơ năng lực" saves learner corrections through `PATCH /api/github-profile/corrections` (leave repos out as
  evidence, set a technology's usage, hide a technology); a changed repo list queues a summary-only job that rewrites
  the AI summary from the stored data without reading GitHub again, and the panel waits for it. "Xoá hồ sơ năng lực"
  deletes the saved analysis but keeps the GitHub link (`DELETE /api/github-profile/profile`). Codi has these routes
  but no UI for them yet, so the editor layout and its copy are mine.
- Profile avatars and assignment files are uploaded to R2 through the real routes.
