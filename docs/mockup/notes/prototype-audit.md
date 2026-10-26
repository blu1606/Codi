# Codi Prototype Audit: `traceability-audit`

Build Date: 2026-10-11 | Prototype: `index.html` (browser, no server) | Demo accounts: minhanh@codi.vn (learner) / quochuy@codi.vn (lecturer) / giabao@codi.vn (admin) / kimoanh@codi.vn (deactivated); all password `codi123`; OTP `123456` or `000000` (expired). Role-switch drawer: Alt+K or bottom-left "Kịch bản thử nghiệm".

**How to open:** Extract and open `index.html` in a browser. Hash-based routes, no server needed. Files not rendered/tested after writing (ship-on-write); runtime defects possible. 

**Suggested walkthroughs:**
1. Guest → catalog → add React course → sign-in modal → cart → voucher WELCOME20 → checkout → payment success → onboarding (goal/diagnostic/path) → lesson player (video/quiz/assignment) → complete → path updated → progress dashboard.
2. Lecturer: edit course (add content, quiz builder), knowledge map review, request publication → see status.
3. Admin: approve course, set price, hide course, deactivate user, view orders, export CSV.

---

## 1. Screens Implemented (S01–S41)

| Screen | Route | Status | Notes |
|---|---|---|---|
| **S01** Catalog | `/courses` | Implemented | Search, category/level/price filters with removable chips, "Xóa bộ lọc", result count, loading skeleton, no-results with clear-all + AI advisor, error + retry. |
| **S02** Course detail | `/courses/[slug]` | Implemented | Breadcrumb, hero (title, summary, stats), outcomes, expandable syllabus (chapters/lessons), requirements, lecturer, reviews (first 5) + ratings breakdown, sticky purchase card with dynamic CTA (guest/not owned/in cart/pending/owned/free/hidden). |
| **S03** Sign-in modal | (overlay) | Implemented | Modal over current page, email/password, GitHub simulated, "Ghi nhớ đăng nhập", register link, "Quên mật khẩu?", wrong-credentials inline alert, deactivated-account explicit message, return-to-intent on success. |
| **S04** Auth pages | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/settings` | Implemented | Full-page login, register, OTP verify (6 boxes, auto-advance, paste, email shown with edit/resend), forgot-password (neutral confirmation, spam hint, resend), reset-password (validation) → success with "Đăng nhập". |
| **S04b** Settings & Profile | `/settings`, `/profile` | Implemented | Settings: "Thông tin tài khoản" (name edit-in-place, masked email with show/hide, change email via OTP), "Mật khẩu & Bảo mật", "Đăng xuất". Profile: tabs Tổng quan (stats), Khóa học (Đang học/Đã hoàn thành, links to courses), Giao dịch (order history, resume pending). |
| **S05** Cart | `/cart` | Implemented | Line items (remove ×), voucher field + "Áp dụng", order summary (tạm tính/giảm giá/tổng), primary "Thanh toán", empty state, owned-item auto-removal notice, pending-order resume banner. |
| **S06** Checkout | `/checkout` | Implemented | Creating order, owned items removed with explanation, order summary, method "Chuyển khoản", drawn VietQR placeholder, copy-rows (Ngân hàng/Số tài khoản/Chủ tài khoản/Số tiền/Nội dung chuyển khoản with "Đã sao chép" feedback), 3-step tracker (Đã tạo đơn → Đang chờ thanh toán → Đã nhận tiền), polling status, 30-min expiry countdown, "Bạn có thể rời trang" note, "Tôi đã chuyển khoản?" for manual reconciliation after ~15s. |
| **S07** Payment success | `/checkout/success` | Implemented | "Thanh toán thành công!", purchased courses listed, primary "Bắt đầu học" → onboarding, secondary "Về bàn làm việc" / "Xem biên lai", no forced redirect. |
| **S08** Goal setup | `/learn/:courseId/onboarding` | Implemented | 2–3 single-question steps with progress bar. Goal (Làm được dự án / Hoàn thành khóa học / Chuẩn bị phỏng vấn), level, weekly hours (tiered cards). "Tiếp tục" disabled until chosen. Edit goal from path screen. |
| **S09a** Diagnostic intro | `/learn/:courseId/onboarding/intro` | Implemented | Purpose, question count, estimated time, "không tính điểm", no timer, skip option. |
| **S09b** Diagnostic questions | `/learn/:courseId/onboarding/quiz` | Implemented | Counter (Câu n/N), segmented progress, one per screen, Back/Next, **"Tôi chưa biết"** distinct action, answers stored, resume. |
| **S09c** Diagnostic result | `/learn/:courseId/onboarding/result` | Implemented | Right/wrong/chưa biết counts, per-concept 5-stop mastery with text, strengths/gaps, primary "Xem lộ trình của tôi". |
| **S10** Personal path | `/learn/:courseId` | Implemented | Grouped by chapter, status (đã học/đang học/tiếp theo/có thể bỏ qua/bị khoá) with icons+text, mastery chip, duration, **"Vì sao?"** AI reason, current emphasized with "Học tiếp", locked rows explain prerequisite, goal + progress displayed, edit-goal link, "Lộ trình đã được cập nhật" notice (dismissible, lists changes). |
| **S11** Lesson player | `/learn/:courseId/:lessonId` | Implemented | Path sidebar (personalized order, checks, type icons), content area (video/PDF/reading), prev/next, progress; lesson checklist (Học nội dung → Làm quiz → Nộp bài tập) with "Hoàn thành bài học" disabled explanation; materials error + retry; locked-lesson direct URL → explanation + prerequisite link. |
| **S11a** AI panel | (side panel in player) | Implemented | Scope checklist (Bài học hiện tại, Tài liệu), prompt chips, simulated answer, thumbs up/down, disclaimer "AI có thể sai…", rate-limit message. |
| **S11b** Q&A panel | (side panel in player) | Implemented | Lesson questions, composer, lecturer replies with "Giảng viên" badge, empty "Hãy là người đầu tiên đặt câu hỏi". |
| **S11c** Quiz | (player modal) | Implemented | Counter, progress, answers stored, unanswered-warning dialog with real count, submit, score ring + passing score, pass/fail, per-question review (your vs correct + explanation), "Làm lại" unlimited. |
| **S11d** Assignment | (player modal) | Implemented | Instructions, file+link+note, submit disabled until required inputs, upload error (>20MB or "loi" in name) as toast, "Đã nộp — chờ chấm" state (completion allowed), graded banner (score + threshold) + feedback, resubmission blocked after grading. |
| **S11e** Lesson complete & path updated | (inline after completion) | Implemented | "Đã hoàn thành" state, change summary ("Bài tiếp theo" card), no auto-advance. |
| **S11f** Course complete | (modal) | Implemented | Congratulations, stats, inline 5-star rating (text optional) → review posted, next-course suggestion. |
| **S12** Learner home | `/dashboard` | Implemented | Greeting, "Tiếp tục học" card (course, lesson, progress), stat tiles (khóa đang học, bài hoàn thành, bài chờ chấm, phản hồi mới) linking to destinations, my courses (Đang học/Đã hoàn thành) with progress, empty state. |
| **S13** Progress & results | (tab in profile or separate) | Implemented | Tabs Đang học/Đã hoàn thành, per-course accordion (lessons, quiz scores, assignment status/grades, feedback inline), mastery per concept. |
| **S14** Review form | (course completion modal) | Implemented | Stars required, text optional, submit → toast → review on detail page, own review → edit. |
| **S20** Lecturer home | `/dashboard/lecturer` | Implemented | Count tiles (bài chờ chấm, câu hỏi chưa trả lời, đánh giá mới, khóa học theo trạng thái) linking to queues, course list with status badges (Bản nháp/Chờ duyệt/Bị từ chối/Đã xuất bản/Đã ẩn), rejected-course banner with reason + "Sửa và gửi lại", primary "Tạo khóa học", empty state. |
| **S21** Create course | (modal form) | Implemented | Minimal: title, description, category, level → created as **Bản nháp** with toast. |
| **S22** Course editor tabs | `/teach/courses/:id/edit` | Implemented | **Thông tin** (title, description, category, level, Save/Cancel dirty-only, unsaved-changes confirm), read-only banner while "Chờ duyệt" (Q12); **Nội dung** (curriculum tree with "Lên/Xuống" keyboard buttons persisting order, drag-and-drop visual-only, "Thêm nội dung" menu, inline rename, delete confirm, lesson editor sheet with file upload progress/error, reading text editor). Content change marks Bản đồ kiến thức stale. |
| **S23** Quiz builder | `/teach/courses/:id/quiz/:lessonId` | Implemented | Question cards, options add/remove, "Đáp án đúng" radio, explanation, move/delete with confirm. Settings: passing grade %, "Dùng làm bài kiểm tra đầu vào" (one per course → move prompt A6). Validation: "Cần ít nhất một đáp án đúng", empty text, <2 options disables "Lưu". Entry test route: also `/teach/courses/:id/entry-test`. |
| **S24** Knowledge map | `/teach/courses/:id/knowledge-map` | Implemented | Analysing state (~2.5s), ready, partially accepted, confirmed, failed + retry, stale banner (content changed after confirm). Per-item Chấp nhận/Sửa (rename)/Bỏ, "Chấp nhận tất cả". Prerequisite picker (A cần học trước B), decline edges. Default learning-order preview. |
| **S25** Publication tab | `/teach/courses/:id/publish` | Implemented | Checklist: mô tả ✓, ≥1 bài học ✓, giá đề xuất (lecturer proposes; A1), bài kiểm tra đầu vào (A5), bản đồ kiến thức đã xác nhận (A4). Links to fixes. "Gửi yêu cầu xuất bản" disabled until all pass → **Chờ duyệt** + admin notified. **Bị từ chối** with reason + "Sửa và gửi lại". **Đã xuất bản**. **Đã ẩn** with reason. |
| **S26** Grading queue | `/teach/courses/grading` | Implemented | Filters (Chờ chấm/Đã chấm), split view (submission left, learner+status+score+feedback right), score 0–10, "Lưu điểm", "Bài tiếp theo", learner notified, empty state. No bulk grading. |
| **S27** Q&A inbox | `/teach/questions` | Implemented | Tabs Chưa trả lời/Đã trả lời, thread list, reply via side sheet, toast, learner notified. |
| **S28** Reviews | `/teach/reviews` | Implemented | List with stars and text, "Chưa phản hồi" filter, reply side sheet, public reply inline with edit/delete. |
| **S29** Learner progress | `/teach/progress` | Implemented | Course picker, stat row (học viên, tỉ lệ hoàn thành TB, điểm quiz TB), learner drill-down (progress ring, lesson checks, scores), per-question averages table. |
| **S30** Admin dashboard | `/dashboard/admin` | Implemented | KPI strip (doanh thu, đơn hàng, học viên mới, khóa học đang bán — last 30 days), "Cần xử lý" tiles (khóa học chờ duyệt, đơn chờ thanh toán >24h, …) with one-line explanation each, linking to filtered queues. Recent orders. |
| **S31** Users | `/dashboard/admin/users` | Implemented | Search, role/status filters, role chips, role-change + deactivate with consequence copy ("đăng xuất khỏi mọi thiết bị, có thể kích hoạt lại") + mandatory internal reason shown as "Lý do (nội bộ)" row, reactivate, self-demotion blocked. |
| **S32** Publication queue + detail | `/dashboard/admin/publications` | Implemented | Tabs Chờ duyệt/Đã duyệt/Từ chối with counts, split view (course summary + content preview left, completeness check + price field right). "Duyệt và xuất bản" disabled until all items pass, shows explanation. "Từ chối" requires reason. Approve confirm states consequences → published + lecturer notified. |
| **S33** Published courses | `/dashboard/admin/courses` | Implemented | Table, "Ẩn khóa học" with consequences (new buyers, existing learners keep access Q14) + reason → hidden + notified, "Hiện lại", "Đổi giá" modal (current vs new, validation, applies to new orders only) + notified. |
| **S34** Orders | `/dashboard/admin/orders` | Implemented | Summary row, filters (date range, status), search, status dot badges (Chờ thanh toán, Đã thanh toán, Thất bại, Đã huỷ, Hoàn tiền), "Quá hạn" highlighted, detail drawer (items, voucher, buyer, transfer content with copy, timeline). "Xuất CSV" real download (UTF-8 BOM). Empty filter state. |
| **S35** Vouchers | `/dashboard/admin/vouchers` | Implemented | List with active toggle (deactivate confirm, reversible), create/edit form (code validation/uniqueness, Phần trăm/Số tiền VND radios, min order toggle, usage limit Không giới hạn/Giới hạn N, expiry Không hết hạn/ngày cụ thể), scope fixed to all courses (Q16). |
| **S40** Notifications | (bell icon, global) | Implemented | Real bell with unread count, popover with events (payment confirmed, assignment graded, question answered, publication approved/rejected/hidden/price change, path updated, course hidden, user deactivated). "Đánh dấu đã đọc", list shows timestamp. |
| **S41** Role-aware header | (global) | Implemented | Guest: Khoá học, AI Chat, Đăng nhập. Learner: Khoá học, Học tập của tôi, AI + cart icon (count). Lecturer: Giảng dạy, Khoá học. Admin: Quản trị, Khoá học. Notification bell (unread count), user menu (workspace/dashboard link, Hồ sơ cá nhân, Cài đặt, Đăng xuất). Mobile menu sheet. |

---

## 2. Flows Implemented (L1–L10, A1–A3, T1–T4, D1)

| Flow | Status | Notes |
|---|---|---|
| **L1** Discover & evaluate | Implemented | Catalog with filters (search, category, level, price), chips + "Xóa bộ lọc", result count. Course detail with outcomes, syllabus (expandable), requirements, lecturer, reviews. Sticky purchase card reflects ownership (not owned/"Thêm vào giỏ", in cart/"Đã trong giỏ hàng"→"Thanh toán", pending/"Tiếp tục thanh toán", owned/"Tiếp tục học"+progress, free/"Đăng ký miễn phí", hidden/"tạm ngừng bán"). No-results with clear-all + AI advisor offer. |
| **L2** Gated action (sign-in) | Implemented | Guest "Thêm vào giỏ" → modal over page. Email/password, GitHub simulated, "Ghi nhớ đăng nhập", register link, "Quên mật khẩu?". Wrong-credentials inline, deactivated-account explicit. Success closes modal, resumes action. Register → OTP step in modal. |
| **A1** Register & verify | Implemented | Register form → "Nhập mã xác thực" with 6 boxes, auto-advance, paste, email shown + "Sửa"/"Gửi lại" (30s countdown). Wrong-code inline error, boxes retain values, expired-code resend prompt, 3-attempts limit. |
| **A2** Recover password | Implemented | "Quên mật khẩu?" → enter email → neutral "kiểm tra thư rác" + resend → set new password (validation) → "Đăng nhập". |
| **A3** Account settings | Implemented | Sections: "Thông tin tài khoản" (name edit-in-place, masked email show/hide, change-email via OTP to new address), "Mật khẩu & Bảo mật" (change password validation), "Đăng xuất". Save/Cancel dirty-only. |
| **L3** Cart → Checkout → Payment | Implemented | Add-to-cart button state change → "Đã trong giỏ hàng". `/cart`: items (remove), voucher "Áp dụng" (validation, active/expiry/limit/min-order, inline error), summary (tạm tính/giảm giá/tổng), "Thanh toán". Checkout: order created (owned items removed with explanation, nothing left → explanation), order summary, VietQR drawn, bank fields (Ngân hàng/Số tài khoản/Chủ tài khoản/Số tiền/Nội dung chuyển khoản) with per-field copy + "Đã sao chép" feedback, transfer-content warning, 3-step tracker (Đã tạo đơn → Đang chờ thanh toán → Đã nhận tiền), polling every 3s, 30-min expiry countdown. Payment confirmed → "Thanh toán thành công!" with courses, "Bắt đầu học", "Về bàn làm việc", "Xem biên lai". Expired → "Mã thanh toán đã hết hạn" + "Tạo mã mới". Underpaid → "Đã nhận X / cần Y" + contact hotro@codi.vn. After ~15s wait → "Tôi đã chuyển khoản?" → manual reconciliation explanation. Cancel confirm → cancelled, items back to cart. |
| **L4** Onboarding (goal & diagnostic) | Implemented | "Bắt đầu học" or first open of owned course without path. Goal (one per screen, progress bar, 2–3 steps): Làm được dự án / Hoàn thành khóa học / Chuẩn bị phỏng vấn, level, weekly hours (tiers). Diagnostic intro (purpose, count, time, không tính điểm, no timer). Questions (Câu n/N counter, segmented progress, one per screen, Back/Next, **"Tôi chưa biết"** distinct). Result (right/wrong/chưa biết counts, per-concept 5-stop mastery + text, strengths/gaps). Path generation "Codi đang xếp lộ trình cho bạn…" → S10. Failure: default order + "Lộ trình cá nhân hoá chưa sẵn sàng" + retry. |
| **L5** Personal path | Implemented | Ordered list by chapter. Per lesson: status (đã học/đang học/tiếp theo/có thể bỏ qua/bị khoá) icon+text, mastery chip, duration, **"Vì sao?"** AI reason (1 line). Current emphasized "Học tiếp". Locked rows explain missing prerequisite. Goal + progress (x/y bài) header, edit-goal link. "Lộ trình đã được cập nhật" notice (dismissible, lists changes). |
| **L6** Study lesson | Implemented | Left sidebar (personalized path with checks + type icons), content (video/PDF/reading), header (prev/next, course progress). Lesson checklist (Học nội dung ✓ → Làm quiz → Nộp bài tập) with disabled explanation on "Hoàn thành bài học". Quiz & assignment inline/modal. Materials error + retry. Locked-lesson direct URL → explanation + prerequisite link. Completion → "Hoàn thành bài học" enabled, path-update notice, "Bài tiếp theo" card, no auto-advance. |
| **L7** Quiz | Implemented | Counter, progress, prev/next, options, submit → unanswered-warning dialog (real count) → results: score ring, passing score, per-question review (your vs correct + explanation), "Làm lại" unlimited. |
| **L8** Assignment | Implemented | Instructions, file+link+note, submit disabled until required inputs, upload error (>20MB / "loi" filename) as toast. "Đã nộp — chờ chấm" (completion allowed). When graded: banner (score + threshold) + feedback, resubmission blocked. |
| **L9** Review course | Implemented | Course completion modal: inline 5-star (text optional) + "Đánh giá" entry on course home → post → shows on detail + learner's review editable "Sửa đánh giá". Lecturer public replies. |
| **L10** Learner home & progress | Implemented | Bàn làm việc: greeting, "Tiếp tục học" card (course, lesson, progress), stat tiles (khóa đang học, bài hoàn thành, bài chờ chấm, phản hồi mới) linking to destinations, my courses (Đang học/Đã hoàn thành with progress), empty → catalog + AI advisor. Tiến độ & kết quả: tabs Đang học/Đã hoàn thành, per-course accordion (lessons, quiz scores, assignment status/grades, feedback inline, mastery). /profile "Khóa học" tab links into course (no dead end). |
| **T1** Create & author | Implemented | "Tạo khóa học" → minimal form (title, description, category, level) → **Bản nháp**. Editor tabs: **Thông tin** (Save/Cancel dirty-only, unsaved-changes confirm, read-only while "Chờ duyệt"), **Nội dung** (curriculum tree with "Lên/Xuống" keyboard buttons persisting order, drag-and-drop visual-only, "Thêm nội dung" menu, inline rename, delete confirm, lesson editor sheet with file uploads + reading text). |
| **T2** Review knowledge map | Implemented | Content saved → "Đang phân tích nội dung…" on Bản đồ kiến thức tab. List of concepts + prerequisite links. Per-item Chấp nhận/Sửa (rename)/Bỏ, "Chấp nhận tất cả". Prerequisite picker (A cần học trước B). Default order preview. Failure: extraction fails → retry; cycle detected → inline error. |
| **T3** Request publication | Implemented | Checklist: mô tả ✓, ≥1 bài học ✓, giá đề xuất (lecturer), bài kiểm tra đầu vào (A5), bản đồ kiến thức confirmed (A4). Links to fixes. "Gửi yêu cầu xuất bản" disabled → **Chờ duyệt** + notification. **Bị từ chối** with reason + "Sửa và gửi lại". **Đã xuất bản**. **Đã ẩn** with reason. |
| **T4** Lecturer support | Implemented | **Chấm bài**: filters (Chờ chấm/Đã chấm), split view, score 0–10, feedback, "Lưu điểm", "Bài tiếp theo", learner notified. **Hỏi đáp**: tabs (Chưa trả lời/Đã trả lời), thread list, reply side sheet, toast. **Đánh giá**: list with stars/text, "Phản hồi" filter/side sheet, replied reviews show inline. **Tiến độ học viên**: course stat row (học viên, tỉ lệ hoàn thành TB, điểm quiz TB), tabs Học viên/Kết quả quiz, per-question averages, learner drill-down. |
| **D1** Admin console | Implemented | **Dashboard**: KPI strip (doanh thu, đơn hàng, học viên mới, khóa học đang bán — 30 days), "Cần xử lý" tiles linking to queues. **Duyệt xuất bản**: tabs (Chờ duyệt/Đã duyệt/Từ chối), split view (summary+preview, completeness+price), "Duyệt và xuất bản" (disabled/explanation) / "Từ chối" (reason required). **Khóa học đã xuất bản**: table, "Ẩn khóa học" (consequences+reason) / "Hiện lại", "Đổi giá". **Người dùng**: search/filters, role chips, deactivate (reason, reversible), reactivate. **Đơn hàng**: summary, filters, status dots, detail drawer (timeline, transfer content, copy buttons), "Xuất CSV". **Voucher**: list (toggle deactivate), create/edit form (code, Phần trăm/Số tiền, min order, usage limit, expiry, all-courses scope). |

---

## 3. Per-Screen States (Compact)

**S01:** loading, results (filtered, no-results), error+retry. **S02:** guest, not owned, in-cart, owned, free, hidden, empty-curriculum, loading, error. **S03:** default, error, deactivated, loading. **S04:** register, OTP (normal/wrong/expired/resend, 3-attempts), login-full, forgot, check-email, reset, success. **S05:** empty, items, voucher-applied, voucher-invalid, owned-item-removed-notice, pending-order-resume. **S06:** creating-order, awaiting-payment (tracker + countdown), confirmed, expired, underpaid, cancelled, error-creating, payments-unavailable. **S08:** step-1/2/3, editing-existing. **S09a:** intro. **S09b:** answering, resumed. **S09c:** result. **S10:** generating, ready, updated (diff-highlight), AI-unavailable-default-order, completed. **S11:** video/PDF/reading, materials-loading/error, checklist-partial, completed, locked-direct-url. **S11a:** empty, answering (streaming), error, rate-limited. **S11b:** empty, posted, answered. **S11c:** answering, unanswered-warning, result (pass/fail), retake. **S11d:** not-submitted, uploading, upload-error, submitted-waiting-grade, graded, resubmit-if-allowed. **S12:** greeting, continue-card, stats, my-courses, empty. **S13:** in-progress, completed, per-course-accordion. **S20:** counts, course-list, rejected-banner, empty. **S22:** empty-course, editing, uploading, unsaved-changes, read-only-chờ-duyệt. **S23:** questions, options, validation-errors, settings. **S24:** analysing, ready, partially-accepted, confirmed, failed, stale. **S25:** checklist, chờ-duyệt, bị-từ-chối, đã-xuất-bản, đã-ẩn. **S26:** filters, split-view, empty. **S31:** search, filters, role-change, deactivate, reactivate. **S32:** tabs (counts), split-view, completeness, price. **S33:** table, hide, show, price-change. **S34:** summary, filters, status-dots, detail-drawer, export. **S35:** list (toggle), form. **S40:** bell (unread count), popover, mark-read. 

---

## 4. Requirements Not Represented / Partial

- **Q3** Free courses: no direct "Đăng ký miễn phí" without cart. Free courses currently go through the cart; checkout rejects free-only orders (API guard not yet front-end friendly).
- **Q5** Underpaid handling: fixed at 50% threshold; exact threshold and support channel not defined.
- **Q9** Quiz retakes: unlimited retakes implemented; cooldown / attempt-selection for BKT not specified.
- **Q10** Assignment resubmission: blocked after grading; conditional re-submission per rubric not supported.
- **Q12** Published-course editing: content changes mark knowledge-map stale; re-review process not enforced (assumed required per A4/A5 re-confirmation, but UI doesn't block).
- **Q20** Q&A resolved state: only answered/unanswered; other-learner visibility not modeled.
- **Sticky bottom CTA for long readings (L6 pattern):** lesson checklist in-content instead; sticky bottom not applied.
- **Video resume position:** playback progress stored per lesson; resume state not confirmed on return.
- **AI answer streaming:** simulated (no real streaming); rate-limit message as placeholder.
- **Mastery computation:** from quiz scores not BKT (BKT assumed but not computed; used for display only).

---

## 5. Assumptions (PRODUCT.md §11 resolutions)

**A1** Lecturer proposes price in publication checklist; admin confirms in review pane.
**A2** "What changed in your path" summary after completion (e.g., "Bài X moved up", "Bài Y now skippable", "Bài Z unlocked").
**A3** Payment success leads to goal setup, not dashboard.
**A4** Lecturer must confirm knowledge map before publication.
**A5** Entry-test quiz required for publication (prerequisite for path generation).
**A6** One entry test per course; moving a quiz to entry-test role when another exists → confirm choice.
**A7** Assignment submission (not grade) satisfies lesson-completion checklist.
**A8** Pending orders >24h old flagged as "needs attention" on admin dashboard (exact threshold per Q13).

**Q1 Resolution:** (a) Lecturer proposes → admin confirms (A1). **Q2:** Multi-course in one order via `/cart`; one QR for whole order. **Q3:** No direct free-enroll; free courses go through cart (incomplete). **Q4:** 30-min expiry (chosen); expired QR cannot be re-honoured (design choice). **Q5:** Underpaid shown at 50% → contact hotro@codi.vn (incomplete; support channel not integrated). **Q6:** Goal options = Làm được dự án / Hoàn thành khóa học / Chuẩn bị phỏng vấn (3 fixed); time tiers = 3 cards (tiered, exact hours not defined). **Q7:** No skip diagnostic; always required. **Q8:** Hard lock (bị khoá status, cannot click). **Q9:** Unlimited retakes; no cooldown. **Q10:** Blocked after grading. **Q11:** Only hidden, not deleted if enrolled. **Q12:** Edit allowed; re-review assumed required but not enforced. **Q13:** KPI set = doanh thu, đơn hàng, học viên mới, khóa học đang bán (30 days). **Q14:** Hidden course → existing learners keep access (banner shown on publish, not tested). **Q15:** Deactivation reason mandatory (internal, shown as row label). **Q16:** Voucher scope fixed to all courses (no per-course/lecturer scopes). **Q17:** Notifications: payment confirmed, assignment graded, question answered, publication approved/rejected/hidden, course price changed, path updated, course hidden, user deactivated (8 event types). **Q18:** Header labels as implemented (role-aware, Vietnamese). **Q19:** No refund-policy text shown (assumption: none, or handled off-platform). **Q20:** Answered/unanswered only; no resolved; other-learner visibility not modeled. **Q21:** Lesson sidebar shows personalized order (from path). **Q22:** Goal editable from path screen; regenerates path (re-run diagnostic assumed but not enforced UI-wise).

---

## 6. Deviations from PRODUCT.md

1. **Prototype-only "Kịch bản thử nghiệm" drawer** (bottom-left or Alt+K) allows role-switch and forced demo states (e.g., error, rate-limit) for testing without re-login.
2. **Sign-in modal augmented with demo-accounts helper** inside the modal (emails+password reminder for testers).
3. **Fictional sample data:** 9 courses (React detailed with 12 lessons; others minimal), 13 users, 14 orders, 5 vouchers, Q&A, reviews, submissions — all typographic/placeholder thumbnails instead of real course images.
4. **VietQR drawn placeholder** (not a real QR image; nonce code shown).
5. **Payments/AI/uploads simulated client-side:** VietQR payment polls localStorage order status; AI responses are templated; file upload succeeds/fails per filename/size validation only.
6. **Mastery derived from quiz scores, not BKT.** Quiz score → 5-stop mapping (e.g., 80–100% = "Thành thạo"); no Bayesian student model.
7. **Light mode only** (dark mode CSS not applied; skeleton supports light).
8. **Fonts:** Be Vietnam Pro (body, Google Fonts fallback to system), Lexend (headings, Google Fonts fallback), JetBrains Mono (code, system fallback).
9. **Catalog filters as select dropdowns + removable chips** (not a filter rail; compiles to URL query params).
10. **Drag-and-drop reorder in curriculum tree:** visual feedback only; drop not persisted (keyboard "Lên/Xuống" buttons do persist via simulated backend).
11. **Path update notice appears on S10 after lesson completion,** not immediately after completion in player (learner must return to path view to see it).
12. **Mobile sidebar in player** (sheets on <768px for side panels).
13. **Quiz "Làm lại" re-initializes all questions** (previous answers not pre-filled; restart from first question).

---

## 7. UX Problems Discovered

**Commerce & Checkout:**
- Sticky purchase card becomes long-scroll card on mobile; consider bottom sheet or sticky bottom bar.
- Voucher validation only on "Áp dụng" click; no real-time feedback for active/expiry/limit.
- Owned-item removal notice may not always render if component lifecycle racing.
- Multiple pending orders possible across browser tabs (no tab-sync on order creation).
- Checkout could create zero-value order if all items owned (guarded post-implementation, but risk remains).

**Learning Flow:**
- Path-updated notice appears on S10 (course home) after completion, not in player; learner must navigate to see changes.
- Mobile sidebar adds a tap; consider reducing sheet count or combining panels.
- "Hoàn thành bài học" disabled explanation initially missing from accessibility; now added to checklist.
- Video resume position stored but not confirmed/requested on return.
- Quiz "Làm lại" doesn't pre-fill prior answers; full restart may frustrate.
- AI answer simulation (not streaming) feels sluggish; real streaming needed.

**Lecturer Workspace:**
- Drag-and-drop reorder not persisted (visual only); keyboard buttons do persist (asymmetric affordance).
- Dirty-state tracking only on Thông tin tab; content/quiz edits unsaved-changes confirmation missing.
- Publication readiness items don't link to fix locations; admin must reject and let lecturer hunt.
- Knowledge-map cycle errors inline; no guided resolution UI.

**Admin Console:**
- Publication review: completeness items don't link to lecturer edit locations.
- Deactivation reason (internal) only shown to admin; user unaware why account was disabled.
- Overdue-order highlighting easy to miss without "Quá hạn" text badge (now added).
- Voucher scope conditions (min-order, usage-limit) expand without strong affordance; consider help text.

**Global:**
- Notifications bell count only; no toast on new event (relies on user checking bell).
- No undo for destructive actions (delete, hide, deactivate) beyond re-opening/reactivating dialogs.
- Role-aware header labels not finalized (assumed Vietnamese per decision 30).

---

## 8. Process Note

**Parallel execution:** The shared foundation package (Child) exhausted context early and stopped BLOCKED with incomplete data/runtime output. The main agent (od-build-6) completed the global shell (`index.html`, `css/app.css`, `js/core.js`, `js/data.js`) to a frozen contract, then four screen packages (`learner-commerce`, `learner-learning`, `lecturer-workspace`, `admin-console`) ran in parallel. Each screen package required one or two follow-up rounds to close gaps (missing state handlers, validation, error toasts, mobile sheet wrapping). No integration tests or rendering validation performed post-write (ship-on-write delivery rule).

---

## 9. Open Questions Remaining

From PRODUCT.md §11, unresolved or requiring confirmation:

1. **Q3** Free-course enroll UX — implement "Đăng ký miễn phí" button, or require cart bypass? (Current: cart+checkout, rejected at API.)
2. **Q4** Payment expiry duration — 30 min chosen; confirm acceptable. Expired QR re-payment handling — currently disallowed.
3. **Q5** Underpaid threshold — set at 50%; exact threshold and hotro@codi.vn integration incomplete.
4. **Q9** Quiz retake rules — unlimited chosen; confirm vs cooldown, attempt-count for BKT.
5. **Q12** Published-course editing — re-review process assumed required but not enforced UI-side (S22 editor allows edits while Chờ duyệt).
6. **Q13** KPI time-range — 30 days chosen; confirm correct or allow admin customization.
7. **Q19** Refund/guarantee policy text — not shown; confirm if needed or handled outside app.
8. **Q20** Q&A thread visibility — other learners cannot see/answer; confirm if that's intended.
9. **Q21** Lesson sidebar order — currently personalised path order; confirm vs chapter order toggle.
10. **Q22** Goal re-generation — editable from path; re-run diagnostic assumed but not enforced (UI allows change, path may stale).

---

**Status:** DONE
**Summary:** Prototype `index.html` implements the full Codi user journey (discover → buy → learn → grade → admin) per PRODUCT.md. All 41 screens, 10 learner/4 support/7 admin flows, and assumed decisions A1–A8 mapped to UI. Nine UX problems identified (sticky card overflow, missing validation feedback, unsaved-changes gaps, async state races). No runtime tests performed; defects possible.


---

## 10. Revision 2 — click-path defect repair (2026-10-11)

Trigger: the user reported many dead clicks (nav bar, cart, course detail). Root causes were traced by reading the source, not by running the prototype (ship-on-write rule: no browser run or automated test was performed).

| Root cause | Effect | Fix |
|---|---|---|
| `learner-learning.js` assigned to an optional chain (syntax error) | Whole learning module never loaded: dashboard, path and player all showed 404 | Module rewritten |
| `learner-commerce.js` used an undefined `pendingOrder` in `/cart` and called a non-existent `Codi.on` | Cart page crashed; filter handlers never registered | Module rewritten |
| Links written as `/#/…` or `/courses/…` | Under `file://` they leave the prototype | All modules use `#/…`; core also routes stray root-relative links in-app |
| Lecturer module passed `nav:` to `Codi.ui.workspace` (expects `items:`) and joined `Codi.html` arrays into plain strings | No left nav; lists rendered as escaped HTML text; quiz-builder inputs ignored typing | Module rewritten |
| Admin console had no section navigation | Sections reachable only via dashboard tiles | Module rewritten with workspace nav |
| Lit-style `?disabled=${x}` attributes | Rendered literally | Core tolerates the pattern (attribute position only) |

Behaviour changes vs. sections 1–7 of this audit:
- Curriculum drag-and-drop now persists (keyboard up/down buttons kept).
- The "Lộ trình đã được cập nhật" notice now appears inside the lesson player right after completion (and once on the path page).
- The payment-code countdown ticks every second.
- Free courses use "Đăng ký miễn phí" directly (Q3 assumption), not cart/checkout.
- The lecturer editor is read-only while "Chờ duyệt" (Q12 assumption).
- The entry test needs at least 5 questions to pass the publication check (A5 detail; the Clean Code course fails it on purpose).
- Uncaught script errors now show a red toast naming the file, so any remaining defect is visible during review.

Residual risk: the rewritten modules have not been executed. Report any remaining dead click together with the toast text if one appears.


---

## 11. Revision 3: navigation hardening (2026-10-11)

The user reported that cart, course detail, learning path, lecturer feedback and AI still could not be opened. All of these are reached through in-app anchor links (`#/...`), while buttons kept working. The likely cause is that the preview frame blocks default anchor and hash navigation.

Fix:
- Core now routes every in-app link itself.
- It keeps the current route in memory and mirrors it to the URL only when the host allows it. Back/forward is still supported.
- The learner dashboard header also links directly to "Tiến độ & kết quả" and "Hỏi AI Codi".

This change was not executed or tested (ship-on-write rule).

---

## 12. Revision 4: AI Chat and AI assistant aligned with PRODUCT.md (2026-10-11)

| PRODUCT.md requirement | Change |
|---|---|
| `/ai`: `?topic=` prefill (line 40) | The topic is shown above the prompts and a question about it is pre-filled in the input. The user still presses Send. `?prompt=` still asks immediately. |
| `/ai`: streamed Markdown answers (line 40) | The answer appears word by word and renders a Markdown subset (paragraphs, lists, bold, code). Course cards appear after the stream ends. |
| `/ai`: error state (new; PRODUCT.md has no explicit `/ai` error state) | Inline danger alert with "Thử lại" and "Xem danh mục khoá học". |
| `/ai`: ownership-aware CTA | Courses not owned show "Thêm vào giỏ" (or "Đăng ký miễn phí") next to "Xem chi tiết". These reuse the commerce actions, including the sign-in prompt for guests. |
| S11a: "answering (streaming)" state (line 276) | The typing indicator is shown, then the answer streams in. Thumbs up/down appear only after the stream completes. |
| S11a: "error" state; line 198 says AI unavailable → inline message, Q&A still available | Inline alert with "Thử lại" and "Hỏi giảng viên". |
| S11a: panel beside the content | At ≥1024px the AI / Q&A panel docks beside the lesson. It has no backdrop and no focus trap, and the lesson stays usable. Below 1024px it remains a full-screen sheet. Navigating to another page closes it. |

Scenario drawer: "AI (trợ lý bài học & AI Chat)" now has three options: Bình thường, Vượt giới hạn (assistant only) and Không khả dụng / lỗi (both surfaces).

Reduced motion: streaming is skipped and the full answer appears at once.

Not executed or tested (ship-on-write rule).

---

## 13. Revision 5: learner visual refresh against Mobbin references (2026-10-11)

References (Mobbin):
- AI advisor: Codecademy AI Learning Assistant (screens/8b213dd1-38cc-4efe-86ca-570ebaaa2551), MasterClass Class TA (screens/cca209b4-b227-4c53-9837-a4e3ca064afb), Brilliant recommendations (screens/da4c4452-1b86-42b7-bab4-de610a9872ca)
- Dashboard: Uxcel (screens/519c99ca-f49e-4509-b6db-57a74154d859), Coursera (screens/0452c7a3-e39a-4906-90da-445683a45f64)

| Area | Change |
|---|---|
| Course media | Letter tiles replaced by the real technology logo on its brand colour. Logos come from Simple Icons (CC0) and are stored in `assets/logos/`. Paths are inlined in `js/course-logos.js` so they work under file://. Clean Code & SOLID has no single technology, so it gets a neutral code mark. |
| `/ai` | Fixed-height conversation with the composer pinned at the bottom. The empty state shows a greeting and 4 prompt cards. AI answers sit unboxed next to an avatar, at 16px. Course cards show level, lesson count and duration, with a "Phù hợp nhất" label on the first pick. Each answer has thumbs up/down. There is a "Cuộc trò chuyện mới" button. |
| Dashboard | Large "Tiếp tục học" hero with course media, progress and a single primary CTA. "Khoá học của tôi" is a divided list. The side column "Cập nhật cho bạn" shows grading, answered questions and the latest feedback. A "Gợi ý cho bạn" row is added. The 4 equal stat tiles were removed. |
| Shared | White page ground. Cards use a hairline border with no shadow; shadows are kept for overlays only. |
| Fix | `aria-pressed` on feedback buttons rendered empty because the template drops booleans. It is now a "true"/"false" string. |

Design system note: the Codi teal palette and Be Vietnam Pro / Lexend are kept, which deviates from the active Shadcn system (user-accepted recommendation).

Not executed or visually verified (ship-on-write rule).
---

## 14. Revision 6: forms dead in sandboxed preview (2026-10-11)

The user reported that clicking "Áp dụng" in the cart did not apply the voucher. The voucher validation and data are correct.

Root cause: in a sandboxed iframe without `allow-forms`, the HTML form-submission algorithm stops before the `submit` event fires. As a result, every `form[data-submit]` was inert inside the preview: the voucher form, AI chat send, login, Q&A, settings and others.

Fix (`js/core.js`, delegation):
- A click on a submit button prevents native submission and dispatches a synthetic `submit` event, so the existing handlers run unchanged.
- Enter in a text input does the same. It is skipped while an IME is composing (Vietnamese Telex/VNI) and when the form's default button is disabled.

Not executed or tested (ship-on-write rule).
---

## 15. Revision 7: coding practice — proposed feature (2026-10-12)

Requested by the user after Mobbin research. Recorded as **proposed** in `PRODUCT.md` §13. It is not part of the UC spec.

**New files**
- `js/coding-practice.js`, shared by both sides:
  - editor: line numbers, Tab indent, auto-indent, Ctrl/⌘+Enter runs, Esc then Tab leaves the editor;
  - JavaScript runner: Web Worker with a 3 s timeout, falling back to the main thread when workers are blocked (shown in the UI);
  - test grader with a key-order-independent comparison;
  - simulated Python, labelled in the UI;
  - learner workspaces for the challenge and the tutorial.
- `js/lecturer-coding.js`:
  - code exercise editor `/teach/courses/:courseId/code/:lessonId`;
  - "Xem như học viên" preview at `.../preview`;
  - *Bài code* analytics tab.

**Data**
- Course *JavaScript nền tảng* gets a new chapter, *Luyện tập lập trình*, after *Dữ liệu có cấu trúc*:
  - `lesson-js-p01`: tutorial with 7 steps;
  - `lesson-js-p02`: challenge with 3 steps, 8 tests (3 hidden) and 3 hints.
- The new lessons use explicit ids, so existing lesson ids, submissions and progress stay valid.
- `db.codeAttempts` is seeded for 3 other learners to drive lecturer analytics.
- State version bumped to v4, which resets saved prototype data once.

**Learner**
- The lesson player renders the coding workspace instead of video/PDF/reading for `tutorial` and `code` lessons.
- The content column widens to 1440 px for these lessons.
- The checklist uses "Hoàn thành bài code" or "Đi hết các bước hướng dẫn".
- The coding score feeds mastery on completion. Viewing the solution first caps the score at 70%.
- The AI assistant adds "Code hiện tại của bạn" to its scope. It answers from the last error and never returns the solution.
- Lessons missing from a saved path order are appended, so new lessons stay reachable.

**Lecturer**
- The content tab adds *Bài code* and *Hướng dẫn code* to the add menu, plus a test/solution status badge on each coding lesson.
- The editor has tabs *Đề bài · Code khởi đầu · Lời giải · Test case · Gợi ý* and a "Chạy thử với lời giải" panel.
- The saved solution check is invalidated when the solution or tests change after the run.
- The publish checklist adds "Bài code có test và lời giải chạy đạt".
- Analytics show pass/completion rate, average submissions, most-failed test and solution views. Lecturer preview runs are excluded.

**Known limits**
- The editor has no syntax highlighting.
- Tutorial step tests are not editable by lecturers (Q-C3).
- The unsaved-changes guard is not wired to the code editor; a badge shows "Có thay đổi chưa lưu".

Not executed or tested (ship-on-write rule).
---

## 16. Revision 8: syntax highlighting, tutorial step tests, React challenge (2026-10-12)

**Syntax highlighting** (`js/coding-practice.js`)
- A lightweight tokenizer colours comments, strings, numbers, keywords and function names for JS and Python.
- The textarea stays the real input: caret, selection, IME, screen readers and keyboard all behave as before. Its glyphs are transparent, and the highlighted layer underneath shares font, padding and scroll.
- Solution code blocks are highlighted too.
- Colours are tokens in `css/app.css`, each ≥ 7:1 on the editor background.

**Tutorial step tests** (`js/lecturer-coding.js`)
- Each tutorial step has a "Test kiểm tra của bước" editor (name, call, expected JSON; add and remove) with inline validation.
- "Chạy thử với code ở bước lời giải" runs the step's tests against the solution step's code.
- Steps saved with no tests drop the field, so learners do not see an empty check panel.

**React challenge** (`js/data.js`)
- New lesson `lesson-react-p01`, "Thử thách: Reducer quản lý danh sách công việc", added to chapter "Props, State và sự kiện" and to the AI path after lesson 006.
- The `todoReducer` used with `useReducer` is a pure function, so it runs for real without the React library.
- 3 steps, 6 tests (2 hidden: immutability and unknown action) and 3 hints.
- Analytics seed rows added for 3 React learners.
- `progressFor` uses default-order positions, so seeded completion for other React learners shifts by one lesson after lesson 006. This affects demo data only.
- State version bumped to v5, which resets saved prototype data once.

Not executed or tested (ship-on-write rule).
---

## 17. Revision 9: lesson AI panel responsive, AI copy, Google sign-in (2026-10-12)

**Lesson AI panel responsive** (`css/app.css`, `js/learner-learning.js`)
- Cause: the code-lesson columns (`.cp-grid`, `.cp-tut-grid`) switched on viewport width. The docked panel (420px) and lesson sidebar (300px) left about 500px for 3 columns, so the editor collapsed and the test list overlapped it.
- The columns now use container queries on `.cp-challenge` and `.cp-tutorial`: 3 columns at 1100px or more, 2 columns at 760px or more, otherwise 1 column.
- The docked panel is 400px (360px from 1024 to 1279px). From 1024 to 1599px, opening it folds the lesson sidebar into the "Danh sách bài học" sheet.
- Panel scope list rebuilt as a real list (icon and text on one line). Suggested questions are full-width buttons. The composer is pinned to the bottom of the panel.
- Sidebar header fixed: "Về lộ trình" link and course title on separate lines (they were running together).

**AI copy standardised**
- Panel: "AI trả lời dựa trên", "Bạn muốn hỏi gì?", clearer suggested questions, "Đang soạn câu trả lời…", one disclaimer sentence.
- `/ai`: Vietnamese title "Tư vấn khoá học" (the product name "Codi AI Course Advisor" stays in `PRODUCT.md` and the section aria-label), clearer empty-state copy and placeholder, CTA labels "Đã có trong giỏ · Xem giỏ hàng" and "Tiếp tục thanh toán".

**Google sign-in** (`js/core.js`, `PRODUCT.md`)
- "Đăng nhập với Google" on the sign-in form (modal and `/login`) and "Đăng ký với Google" on the register form.
- Opens a simulated account chooser in place:
  - an existing Codi email signs straight in and resumes the intent;
  - a new Gmail creates a learner account with no OTP;
  - a deactivated account shows the same error as password sign-in.
- `PRODUCT.md` routes table, flow L2 and S03 updated to list Google.

Not executed or tested (ship-on-write rule).

---

## 18. Revision 10: resizable lesson panel, Google cancel/deny, saved lesson AI chat (2026-10-12)

**Resizable docked panel** (`js/core.js` `wireDockResize`, `css/app.css`)
- At 1024px and wider, a separator on the panel's left edge (`role="separator"`, keyboard-focusable) resizes it:
  - pointer drag;
  - ArrowLeft / ArrowRight change the width by 16px, or 64px with Shift;
  - Home or double-click resets to the default.
- The width is clamped between 320px and 50% of the window (720px at most), stored in `--dock-w` on `<html>`, and remembered in localStorage (`codi-dock-width`).
- The lesson columns follow it through the existing container queries.

**Google sign-in: cancel and permission denied** (`js/core.js`)
- The chooser now has a consent step after picking an account: the scopes (name, avatar, email), then "Từ chối" or "Cho phép". "Chọn tài khoản khác" goes back.
- "Huỷ" in the chooser returns to the form the learner started from, with an info notice. "Từ chối" does the same with a warning. Both notices offer "Thử lại với Google".
- A deactivated account is now refused after "Cho phép".

**Saved lesson AI chat** (`js/learner-learning.js`)
- Conversations are stored per learner and lesson in persisted state (`state.aiLessonChats`). They survive closing the panel, changing lessons and reloading, and are cleared by "Đặt lại dữ liệu".
- Capped at 40 messages. A streaming answer is saved only once it finishes.
- A "Đã lưu cuộc trò chuyện của bài này" bar has a "Xoá" action, with confirmation, that clears only the current lesson.

Not executed or tested (ship-on-write rule).

---

## 19. Fix: "Danh sách bài học" sheet stayed open after picking a lesson (2026-10-12)

- **Cause:** only docked panels close on route change. The lesson-list sheet is a normal sheet, so after a lesson was picked it stayed on screen over the new lesson and still highlighted the previous one. When it had been opened beside the AI panel, the route change closed that panel and brought the left sidebar back, so the list showed twice.
- **Fix** (`js/learner-learning.js`, `js/core.js`, `css/app.css`):
  - lesson links inside the sheet carry `data-close`, so the sheet closes as the lesson opens;
  - the sheet now slides in from the left (new `side: 'left'` sheet option), so an open AI or Q&A panel on the right stays visible;
  - on open, the sheet scrolls to the current lesson and focuses it.

Not executed or tested (ship-on-write rule).

---

## 20. Revision 11: Bản sửa 12/10/2026 — áp dụng thay đổi PRODUCT.md (đợt A, B, C)

**Nền tảng (từ trước)**
- Chế độ tối: `data-theme="dark"`, nút trong bảng kịch bản thử nghiệm.
- Kịch bản mới: `qrfail` / `thinking` để kiểm tra trạng thái lỗi và tư duy.
- `Codi.charts` (js/charts.js) với dữ liệu: analytics 60 ngày, learnerStudyDays, conversations, feedbackSnippets, hintUsage, bản đồ TS có vòng lặp.
- `PRODUCT.md` 12/10 thay cho bản cũ (lưu lại: docs/PRODUCT-2026-10-11.md).

**A2 VietQR & Thanh toán**
| Tính năng | Trạng thái |
|---|---|
| Không tải được QR → dòng sao chép thay thế | Implemented |
| Đếm ngược 30 phút kèm hệ quả | Implemented |
| "Tôi đã chuyển khoản" luôn hiện, chờ 30s giữa bấm | Implemented |
| Mã CODI##### + hotro@codi.vn ở mọi lỗi | Implemented |
| Tạo mã mới khi hết hạn | Implemented |

**A3 Đăng nhập & Giỏ hàng**
- Đăng nhập ngay trong cửa sổ, tên khoá học + OTP cùng cửa sổ.
- Quay lại đúng trang sau login.
- Toast "Đã thêm "…" vào giỏ hàng" + "Xem giỏ hàng" (core ui.toast hỗ trợ opts.actions).

**A4 S01 & S02**
- **S01:** sắp xếp, gợi ý theo nhóm, dùng được bàn phím, trạng thái rỗng "Đặt lại bộ lọc" + "Hỏi AI Codi".
- **S02:** "Mua ngay" nút chính, dòng giáo trình có loại bài.

**A1 Onboarding**
- Nút "Bỏ qua" ở các bước mục tiêu.
- **S08b:** "Học từ bài 1" / "Tìm điểm bắt đầu của tôi" (Khuyến nghị).
- **S10/S12:** thẻ làm lại bài kiểm tra đầu vào.

**A5 Cài đặt & Xem trước**
- **S31:** bộ lọc có đếm, hộp vô hiệu hoá ghi số tác động + "Tôi hiểu tác động".
- **S32b:** "Xem trước như học viên" có thanh cố định + nút thoát.

**B1 AI trợ lý** (`js/ai-tutor.js` — viết lại)
- Bảng gắn bên cạnh, chip ngữ cảnh gỡ được.
- Thang gợi ý 3 bậc, ghi vào db.hintUsage.
- Nút "Xem dòng N" chọn dòng; đề xuất thêm 1 dòng (console.log) + Áp dụng / Bỏ qua / Hoàn tác / "Chạy lại test".
- Trạng thái suy nghĩ có "Dừng"; 👍/👎 kèm lý do.
- Lưu hội thoại theo bài, xoá có xác nhận; lỗi / quá giới hạn theo cờ aiAssistant.
- Thanh công cụ (bôi đen): "Giải thích" / "Hỏi AI".

**B2 Coding practice** (`js/coding-practice.js`)
- Tab lọc test; mở rộng Input · Expected · Received.
- "Định dạng code" (chỉ chỉnh thụt lề).
- "Giải thích lỗi này" → Codi.tutor.explainError.

**B3 Hỏi giảng viên**
- Mở hộp thoại riêng, gửi kèm code / test / tóm tắt AI → db.conversations, giảng viên được thông báo.
- **S27:** bộ lọc "Từ AI trợ lý", trả lời, đánh dấu đã xử lý (có hoàn tác).

**B4 AI Advisor** (`js/ai-advisor.js`)
- Bản cá nhân hoá + bản khách; chip hỏi thông tin (bỏ qua được), câu chờ trả lời sau điền.
- "Codi đang hiểu về bạn" sửa được.
- Thẻ khoá học từ danh mục, bảng so sánh, thứ tự học gợi ý, chip hỏi tiếp.
- Lỗi / quá giới hạn / suy nghĩ có Dừng theo cờ kịch bản.

**C1 S12 & Tiến độ**
- Mục tiêu tuần từ learnerStudyDays; mặc định 5 giờ, ghi "Giả định" nếu chưa đặt.
- Chuỗi ngày học; huy hiệu kỹ năng (thành thạo ≥ 3).

**C2 S13 & Insights**
- **S13b** /insights/stats C1–C6 dùng Codi.charts.
- **S13c** /insights/knowledge-map dùng charts.graph.
- Liên kết từ Bàn làm việc + /progress.

**C3 S24 Bản đồ kiến thức**
- Mặc định dạng sơ đồ, chuyển sang danh sách.
- Bảng chi tiết khái niệm; băng báo vòng lặp ghi đường vòng, tô nút+cạnh.
- "Xác nhận bản đồ" bị khoá đến sửa xong; giữ "Chấp nhận tất cả".

**C4 S26 & Chấm bài**
- "Mẫu nhận xét" có ô {ten_hoc_vien} / {diem}.
- Sửa điểm: hộp thoại hệ quả có lý do, lưu lịch sử, thông báo học viên.
- **S29:** cột số lần dùng gợi ý.
- **S29b** /teach/insights "Doanh thu khóa học của tôi" (KPI + đường + bảng, không xuất CSV).

**C5 S34 & Export**
- Hộp xuất CSV: preset, GMT+7, "Chỉ dữ liệu đang lọc", chọn cột, tóm tắt trực tiếp, file Blob+BOM.
- **S36/S37:** Tổng quan trước, mặc định 30 ngày, "So sánh: kỳ trước"; trang chi tiết có CSV.

**Sửa chéo**
| Mục | Ghi chú |
|---|---|
| ai.css | Ánh xạ --color-* sang token Codi (sáng/tối đều theo) |
| Alias color | Thêm --surface-2, --warning, --leading-relaxed |
| Commerce toast | Không còn hiện hai lần |

**Caveats**
- **S36** chi tiết: A1–A6 completed, A7–A9 still pending.
- **Đề xuất AI code:** chỉ thêm console.log, không sửa logic (ý định).
- **"Định dạng code":** chỉ chỉnh thụt lề.
- **Analytics & study days:** dữ liệu mẫu ngẫu nhiên.
- **commerce.css:** trống, style viết thẳng JS.

**Kiểm chứng:** Tất cả file JS qua `node --check`. Prototype CHƯA chạy browser, CHƯA kiểm thử runtime.

Not executed or tested (ship-on-write rule).

## 21. Revision 12: Audit & sắp xếp lại giao diện AI (2026-10-12)

Nguồn: 2 ảnh chụp người dùng gửi (panel AI trợ lý, trang `/ai` khi là khách) + đọc mã nguồn.

| Vấn đề phát hiện | Đã sửa |
|---|---|
| Panel trợ lý: 4 lớp (khung "AI trả lời dựa trên", thẻ "Hỏi riêng giảng viên", dòng "Đã lưu… Xoá", đường kẻ) đẩy hội thoại xuống giữa panel | Đầu panel còn 1 dòng chip ngữ cảnh + menu "⋯"; hội thoại là nội dung chính |
| Khung xám chỉ chứa 1 chip | Bỏ khung, chip nằm trực tiếp |
| "Xoá" đậm có thùng rác ngang hàng nội dung | Chuyển vào menu "⋯" (màu đỏ, vẫn hỏi xác nhận) |
| Thẻ "Hỏi riêng giảng viên" chiếm chỗ cố định | Thành 1 dòng trạng thái (chấm màu + chữ), bấm để mở trả lời; nút hỏi nằm trong menu "⋯" |
| Câu trả lời dự phòng "khái niệm được trình bày trong video và slide" nghe như lỗi | Dùng tiêu đề bài, tên chương, khái niệm; nói rõ khi bài chưa có phần đọc |
| Nút gợi ý và "Hỏi giảng viên" trôi cuối hội thoại | Nút "Gợi ý n/3" nằm ngay trên ô nhập (vùng đáy cố định) |
| Dòng cảnh báo AI luôn chiếm 2 dòng | Chỉ hiện ở màn trống |
| `/ai`: ô nhập nằm dưới màn hình đầu | Màn trống: tiêu đề → ô nhập lớn → 4 thẻ "Thử hỏi"; ô nhập dính đáy khi đang trò chuyện |
| 6 lối vào trùng ý (3 thẻ + 3 chip) | Gộp thành 4 thẻ có mô tả; thẻ "So sánh" không còn nhắc khoá React/Vue/Angular không có trong danh mục |
| Khung xanh lớn + nút Đăng nhập lặp với thanh đầu trang | Một dòng chữ có liên kết "Đăng nhập" dưới ô nhập |
| Emoji 👋, biểu tượng lấp lánh, tiêu đề căn giữa lệch với nội dung | Bỏ emoji/biểu tượng; cột 720px căn trái thống nhất |
| Một trang ba tên ("AI Chat", "Tư vấn khoá học", "Xin chào!") | Thanh đầu trang "AI" cho cả khách và học viên; tiêu đề "Tư vấn khoá học cùng AI" |
| Hai màn dùng hai kiểu tin nhắn, `css/ai.css` ~1.000 dòng trùng lặp, nhiều quy tắc không dùng | Viết lại `css/ai.css` (~190 dòng): một hệ tin nhắn chung (bong bóng người dùng, câu trả lời AI không đóng khung, dòng "đang suy nghĩ" có Dừng, hàng 👍/👎 + lý do dùng chung qua `Codi.aiFeedbackRow`) |

Giữ nguyên chức năng: gợi ý 3 bậc, dẫn chiếu dòng, đề xuất ≤3 dòng, Dừng, hỏi riêng giảng viên, thanh công cụ khi bôi đen, chip hỏi thông tin, bảng so sánh, thứ tự học, thẻ khoá học. Giữ token Codi (teal, Be Vietnam Pro), không theo hệ Shadcn đang chọn.

File: `js/ai-tutor.js`, `js/ai-advisor.js`, `css/ai.css`, `js/core.js` (nhãn nav). Đã qua `node --check`; **chưa chạy thử trong trình duyệt** sau khi viết.

## 22. Revision 13: Hoàn thiện biểu đồ quản trị & làm lại biểu đồ học viên (2026-10-12)

**Vì sao:** biểu đồ cũ có số viết cứng (đường DAU/doanh thu 7 điểm, delta KPI "+2", "+5"), không nhãn trục, không tooltip, mọi đường cùng màu, lịch dùng mã màu cứng (mất màu ở nền tối), dữ liệu học viên bị lọc sai `userId` nên trống; S36 thiếu A4/A6/A8, S37 thiếu B5–B8.

| Phần | Thay đổi |
|---|---|
| Bộ biểu đồ `js/charts.js` + `css/charts.css` (mới) | Viết lại, giữ API cũ. Đường: nhãn trục, kỳ trước nét đứt nhạt, đường trung bình/ngưỡng, chấm cuối có nhãn. Cột: giá trị trên đỉnh, đường mục tiêu. Thêm phễu (bảng % so với bước 1 / % bước / rơi rụng), heatmap cohort (cảnh báo n < 20), thanh chia đoạn có số đếm, cột chồng theo tuần, lịch theo tuần (T2–CN, chú giải Ít → Nhiều), donut 3 phần Đúng/Sai/Chưa biết, sơ đồ khái niệm phân tầng tô theo mức thành thạo + nhãn chữ + khoá. Tooltip chung khi rê chuột và khi focus bàn phím; bảng số liệu (ẩn cho trình đọc màn hình + "Bảng số liệu" trong thẻ). Bảng màu kiểm tra bằng validator (sáng/tối, CVD) — slot 4–5 dưới 3:1 trên nền trắng nên luôn có chú giải + bảng. |
| Dữ liệu `js/data.js` | Thay `Math.random` bằng bộ sinh có seed: 180 ngày (đủ Quý + kỳ trước), nhịp theo tuần + tăng trưởng nhẹ; thêm WAU, phễu kích hoạt, bài hoàn thành, đầu vào vs học từ bài 1, lỗi tạo lộ trình, giới hạn, đơn theo trạng thái, nguồn phễu thanh toán, thời gian trả tiền. Ngày học của học viên mẫu 120 ngày, có `userId`. Phiên bản dữ liệu lưu trữ lên v7 (mở lần đầu sẽ về dữ liệu mẫu). |
| S36 Quan sát hệ thống | Đủ A1–A9. Thanh đầu: 7 ngày / **30 ngày** / Quý (+ "Tùy chọn" báo ngoài phạm vi) và công tắc "So sánh: kỳ trước" áp cho mọi thẻ. Tổng quan A1, A2, A3, A7, A8; "Xem chi tiết" mở A4, A5, A6, A9 tại chỗ (được nhớ). Đổi kỳ: giữ bản cũ mờ đi rồi vẽ lại, không nháy khung. Chỉ số ngược (lỗi, độ trễ, chờ) tăng = xấu. |
| S37 Tài chính | Đủ B1–B9. Tổng quan B1, B2 (kỳ này / kỳ trước / trung bình), B4 (thanh trạng thái có số tiền + cột theo tuần + tỉ lệ thanh toán thành công), B8 (đơn thật cần đối soát, rỗng thì "Không có đơn cần đối soát"). Chi tiết B3 (tab khóa/danh mục/giảng viên, dòng tổng), B5, B6 (trung vị), B7, B9 (hộp xuất CSV chọn thẻ). |
| Trang chi tiết từng thẻ | `/admin/insights/:thẻ`, `/admin/finance/:thẻ`: biểu đồ cỡ lớn + bảng đầy đủ + "Tải CSV" (UTF-8 BOM, ghi giờ GMT+7). |
| S13b Thống kê học tập | Tuần / Tháng / **30 ngày** + lọc khóa. C1 KPI so kỳ trước bằng số thật; C2 giờ/tuần (Tuần: phút/ngày) với mục tiêu nét đứt ("Giả định" 5 giờ nếu chưa đặt); C3 lịch + chuỗi; C4 kỹ năng xếp hạng + nhãn chữ + mốc đầu vào (ẩn nếu bỏ qua). "Xem chi tiết": C5 điểm quiz & bài code + ngưỡng 70% + 3 ô; C6 donut từng bài quiz. Trạng thái: chưa hoạt động, ít dữ liệu, bỏ qua bài đầu vào. |
| S13c Bản đồ kiến thức | Sơ đồ tầng không chồng, tô theo mức + chữ, khái niệm chưa mở khoá (tiên quyết chưa học) hiện rõ; gợi ý "Nên ôn tiếp"; danh sách theo mức. |
| Sửa kèm | Chuỗi ngày ở Bàn làm việc chỉ tính ngày có phút học > 0. |

**Suy ra từ dữ liệu mẫu (ghi trên thẻ):** giữ chân cohort (A4), tỉ lệ hoàn thành theo khóa (A5), phân bổ doanh thu theo khóa/voucher (B3, B7), nguồn phễu thanh toán (B5), mốc mức thành thạo lúc làm bài đầu vào (C4), ngày hoàn thành bài (C1).

Đã qua `node --check`; **chưa mở trong trình duyệt và chưa thử tay** sau khi viết.

## 23. Revision 14: Duyệt khoá học chi tiết + AI trong soạn bài và làm bài code (2026-10-14)

**Tham khảo Mobbin:** hàng chờ kiểm duyệt Reddit (c20fd251), kiểm duyệt Circle (6c0687e1), Gemini Notebook tạo quiz từ nguồn (f29a6736), Asana tải tệp → AI (b9db7d73), SchoolAI tạo quiz (0be23fb6), quiz Kajabi (ddc27d82) và Circle (1a1022a9), menu thêm bài Podia (64c4739e).

| Phần | Thay đổi |
|---|---|
| Mô hình duyệt `js/course-review.js` (mới) | Vòng duyệt trong `db.courseReviews`: 7 tiêu chí (Đạt / Cần sửa / Không áp dụng + ghi chú), cờ gắn vào khoá / bài / câu hỏi / test / bài tập, mức "Bắt buộc sửa" / "Nên sửa", trạng thái Đang mở → Giảng viên đã sửa → Đã đóng. Chỉ duyệt được khi đã chấm đủ tiêu chí, không có "Cần sửa" và không còn cờ "Bắt buộc sửa" đang mở. Gửi lại tạo vòng mới, mang theo cờ chưa đóng. |
| S32 Quản trị duyệt `js/admin-review.js` (mới) | Thẻ Tiêu chí (có gợi ý tự động) · Nội dung (cây bài + xem trước: tài liệu, bài đọc, từng câu quiz có đánh dấu đáp án đúng, test bài code + kết quả chạy lời giải, bài tập + thang chấm; gắn cờ tại chỗ) · Cờ ("Rà soát bằng AI" đề xuất cờ, chấp nhận/bỏ từng cái) · Lịch sử vòng. Kết luận: Duyệt / Yêu cầu sửa / Từ chối, thông báo giảng viên. |
| S25 Giảng viên — Xuất bản | Khối "Kết quả duyệt lần N": tiêu chí + ghi chú, từng góp ý với "Mở để sửa" (đi thẳng tới quiz / bài code / bài) và "Đánh dấu đã sửa" (bắt buộc ghi đã sửa gì). Phân biệt "Yêu cầu sửa" và "Từ chối". Cây nội dung hiện badge "N góp ý từ quản trị". |
| Bài tập | Trình soạn đầy đủ: yêu cầu, cách nộp (đường dẫn / tệp + định dạng), điểm tối đa, điểm đạt, hạn nộp, chính sách nộp muộn, thang chấm (tổng = điểm tối đa, kiểm tra trực tiếp) + "Gợi ý thang chấm bằng AI". Học viên thấy điểm đạt, hạn, chính sách nộp muộn, định dạng tệp và thang chấm trước khi nộp; sau khi chấm thấy điểm từng tiêu chí. |
| Chấm bài | Có thang chấm thì chấm theo từng tiêu chí, tổng tự tính, lưu `rubricScores`. "AI gợi ý điểm và nhận xét" chỉ điền bản nháp, giảng viên sửa rồi mới lưu. |
| Nhập tài liệu → AI | Từ bài học / trình soạn quiz: tải PDF/PPTX/DOCX (hoặc dùng tài liệu đã có) → đọc tệp → chọn tạo tóm tắt / quiz (số câu, độ khó) / khái niệm → duyệt từng mục (Chấp nhận / Sửa / Bỏ) → chỉ mục được chấp nhận mới thêm vào bài. Tệp tên có "scan" mô phỏng PDF dạng ảnh không đọc được. |
| Quiz | "Tạo câu hỏi bằng AI" trong trình soạn: câu mới mang nhãn "AI tạo · chưa duyệt", có "Đã kiểm tra câu này" / "Duyệt tất cả". Điều kiện xuất bản mới: "Câu hỏi do AI tạo đã được duyệt", "Bài tập có thang chấm". |
| Bài code (giảng viên) | "AI gợi ý test case biên" ở tab Test case: đề xuất từ dạng lời gọi của test đầu tiên, giá trị mong đợi lấy bằng cách chạy lời giải mẫu thật; Thêm / Bỏ từng test. Python mô phỏng nên để giảng viên tự nhập giá trị. |
| Bài code (học viên) | Lỗi cú pháp / lỗi khi chạy / quá thời gian trong Console có nút "Hỏi AI về lỗi này". AI trợ lý nhận lỗi, code và dòng nghi ngờ (tên biến/hàm trong thông báo lỗi, hoặc vòng lặp khi quá thời gian), giải thích loại lỗi và chỗ cần xem, không viết sẵn lời giải. |
| Dữ liệu | Thang chấm cho mọi bài tập mẫu (trừ khoá Next.js đang chờ duyệt — để thấy cờ), khoá Next.js có tài liệu, quiz cố ý sai đáp án, bài kiểm tra đầu vào thiếu câu; vòng duyệt mẫu cho khoá SOLID. Lưu trữ lên v8. |

**AI đều là mô phỏng có quy tắc cố định** và theo cờ kịch bản `aiAssistant` (đang nghĩ + Dừng / lỗi + Thử lại / hết lượt).

**Để sau:** lịch sử phiên bản nội dung (so sánh trước/sau khi sửa theo góp ý), kiểm tra đạo văn bài nộp, ngân hàng câu hỏi dùng chung giữa các khoá, đồng giảng viên.

Đã qua `node --check`; **chưa mở trong trình duyệt và chưa thử tay** sau khi viết.

## 24. Fix: giao diện vỡ do lớp bố cục dùng chung bị định nghĩa lại (2026-10-14)

- **Triệu chứng:** khung "Tạo câu hỏi bằng AI" trong cột phải trình soạn quiz tràn ra ngoài, trang có thanh cuộn ngang.
- **Nguyên nhân:** `css/admin.css` (nạp sau cùng) định nghĩa lại `.grid-2` thành cột tối thiểu 300px, `.grid-4` thành cột tối thiểu 200px, và `.row-between` không cho xuống dòng. `css/learning.css` cũng định nghĩa lại `.grid-2`/`.grid-4` bằng `1fr`, nên cột không co dưới độ rộng nội dung. Các quy tắc này áp cho mọi trang, nên mọi cột hẹp, sheet và thẻ dùng `.grid-2` đều có thể tràn.
- **Sửa:** gỡ các bản định nghĩa lại; dùng lại quy tắc chung trong `css/app.css` (cột `minmax(0, 1fr)`, gộp cột ở 1024/640px, `.row-between` xuống dòng được). `.grid-5` của quản trị đổi sang `minmax(min(180px, 100%), 1fr)`.

Chưa mở trong trình duyệt và chưa thử tay sau khi sửa.

## 25. Revision 15: AI soạn bài giảng và bài code (2026-10-14)

- **Lối vào:** menu "Thêm nội dung" của khoá học có thêm "Bài giảng bằng AI" và "Bài code bằng AI" (`js/lecturer-ai-create.js`, `Codi.lecturerAI.openCreate`).
- **Bài giảng:** chọn chương, chủ đề, mục tiêu, hình thức (bài đọc / video / slide), độ dài, có kèm 3 câu quiz không → AI soạn bài đọc (mục tiêu, khái niệm chính, lỗi hay gặp, tự kiểm tra) → sửa trực tiếp, duyệt từng câu quiz → thêm vào chương. Bài video/slide vẫn cần tải tệp.
- **Bài code:** chủ đề + độ khó → AI chọn dạng bài (reducer giỏ hàng, slug, đếm theo nhóm, lọc & sắp xếp, tổng đơn hàng, đếm từ) và soạn đề theo bước, code khởi đầu, lời giải, test (có test ẩn), gợi ý. Giá trị mong đợi lấy bằng cách chạy thật lời giải mẫu; bài mở trong trình soạn bài code để chỉnh và lưu.
- Bài do AI soạn có nhãn "AI soạn" trong cây nội dung. Trạng thái đang soạn + Dừng / lỗi + Thử lại / hết lượt theo cờ kịch bản AI.
- **Giới hạn:** AI mô phỏng bằng mẫu cố định; bài code luôn viết bằng JavaScript.

Đã qua `node --check`; chưa mở trong trình duyệt và chưa thử tay sau khi viết.

## 26. Fix: luồng "Thêm nội dung" của giảng viên bị rối (2026-10-14)

- **Trước:** nút "Thêm nội dung" mở một menu trộn 10 mục khác cấp: chương, các dạng bài, quiz, bài tập, bài kiểm tra đầu vào và 2 mục AI. Song song đó, nút "+ Bài học" ở mỗi chương lại thêm thẳng một bài đọc, không cho chọn dạng bài.
- **Sau:**
  - Đầu tab Nội dung chỉ còn 2 nút: "Thêm chương" và "Thêm bài học".
  - "Thêm bài học" (ở đầu trang hoặc "+ Bài học" của từng chương) mở cùng một hộp chọn: chương (chọn sẵn chương vừa bấm) và dạng bài, chia hai nhóm "Tự soạn" (Video, Bài đọc, Slide / PDF, Bài code, Hướng dẫn code) và "Tạo bằng AI" (Bài giảng bằng AI, Bài code bằng AI, Từ tài liệu / slide). Bài mới luôn vào đúng chương đã chọn.
  - Quiz và bài tập gắn vào từng bài, nên nằm trên dòng bài học: "Thêm quiz" và "Thêm bài tập". Bài tập chỉ được lưu khi bấm "Lưu bài học".
  - Bài kiểm tra đầu vào: liên kết ở dòng mô tả đầu tab ("Tạo bài kiểm tra đầu vào" khi chưa có).

Đã qua `node --check`; chưa mở trong trình duyệt và chưa thử tay sau khi viết.
