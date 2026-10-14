# Codi — End-to-end Product Experience (all actors)

> UX research synthesis for the downstream design/prototyping agent (OpenDesign).
> Scope: every use case of Guest, Registered User, Learner, Lecturer, Admin (+ AI Service as supporting actor).
> Sources: this repository (source of truth for what exists), the SWP391 use case model (`../UC-by-actor-plantuml/*.puml`), and Mobbin research (web references, inspected visually by research sub-agents).
> Date: 2026-10-11 · **Revised 2026-10-12** after the prototype UX audit (`report_uiux_audit.md`) and a second Mobbin pass — changes are summarised in `product-updated-12-10.md`. UI language: Vietnamese. Quoted Vietnamese strings are verbatim from the current app unless marked *(proposed)*.

---

## 1. Purpose

Codi is a Vietnamese web platform that sells programming courses and personalises how each learner goes through a course. A learner buys a course, sets a goal, takes an entry test, and receives an AI-ranked learning path that respects the course's prerequisite order and re-ranks after every completed lesson. Lecturers author the content and support learners; Admins own users, pricing, publication and money.

Today the product has a working storefront (catalog, course detail, account, VietQR checkout) but the journey **stops at the moment of payment**: there is no cart page, no way to reach checkout from the UI, no place to study, and all three role workspaces are "Sắp ra mắt" shells. This document defines the complete experience so a prototype can show one coherent product:

**Discover → Buy → Set goal → Diagnostic → Personal path → Study / Quiz / Assignment → Complete → Path updates → Progress & review** for learners, plus the **Author → Knowledge map → Request publication → Admin review → Publish** loop and the **Grade / Answer / Respond / Monitor** loop that keeps courses alive.

---

## 2. Existing Product Context

### 2.1 Global shell (unchanged by this work unless stated)
- Header (`apps/web/src/components/header.tsx`), identical for every role: "Trang chủ", "Khoá học" dropdown ("Tất cả khoá học", "Tìm kiếm khoá học", "Lộ trình AI Mentor" → `/ai`), "Bàn làm việc" → `/dashboard`, "AI Chat" → `/ai`, "Hồ sơ (Profile)" → `/profile`. Right side: theme toggle, notification bell (static "Chưa có thông báo."), user menu.
- Guest sees an icon button "Đăng nhập" → `/login`.
- User menu: name + email, "Bàn làm việc (Dashboard)", "Hồ sơ cá nhân (Profile)", "Cài đặt (Setting)", "Đăng xuất".
- `/dashboard` redirects by role: Admin → `/dashboard/admin`, Lecturer → `/dashboard/lecturer`, Learner → shared dashboard. Role names: "Học viên", "Giảng viên", "Quản trị viên".
- Footer only on the homepage.

### 2.2 Existing screens relevant to this work

| Route | What exists today |
|---|---|
| `/` | Marketing homepage with scroll animation |
| `/courses` | Search "Tìm khóa học theo tên, công nghệ (React, Node, AI...)", category filter ("Tất cả"), level filter (Beginner/Intermediate/Advanced). Card CTAs "Xem chi tiết", "Thêm vào giỏ" ("Đang thêm…"). Empty "Không tìm thấy khóa học phù hợp". Error + retry. |
| `/courses/[slug]` | Breadcrumb; sections 01 "Bạn sẽ học được gì?", 02 "Nội dung khóa học" (accordion, "Mở rộng tất cả"/"Thu gọn tất cả"), 03 "Yêu cầu trước khi học", 04 "Giảng viên". Sticky sidebar "Đăng ký khóa học": "Học phí khóa học" or "Miễn phí", CTA "Thêm vào giỏ" → "Đã trong giỏ hàng", facts (Trình độ, Số chương, Số bài học, Thời lượng), link "Hỏi trợ lý AI Codi". Empty curriculum "Nội dung học đang được chuẩn bị". |
| `/courses/[slug]/checkout` | "Thanh toán khóa học": "Thông tin đơn hàng", "Phương thức thanh toán" (only "Chuyển khoản / Ứng dụng ngân hàng"), card "Quét mã thanh toán" with VietQR image, "Mã giao dịch (để đối soát): CODI#####", "Hủy giao dịch". Polls every 3 s. Success: "Thanh toán thành công!" + "Vào học ngay", auto-redirect to `/dashboard` after 3 s. |
| `/login`, `/forgot-password`, `/reset-password` | Email+password, GitHub OAuth, remember me; register with 6-digit email OTP; password recovery. |
| `/settings` | Left menu, "Tài khoản": account info (name, masked email with show/hide, change email via OTP to the new address), "Mật khẩu & Bảo mật". |
| `/profile` | "Hồ sơ cá nhân & Bảo mật": email verification card, profile card, stats, tabs "Tổng quan", "Khóa học" ("Khóa học của tôi", "Đang học"/"Đã hoàn thành", empty "Bạn chưa đăng ký khóa học nào."), "Giao dịch" ("Lịch sử giao dịch"). |
| `/ai` | "Codi AI Course Advisor" chat, 4 suggested prompts, `?topic=`/`?prompt=` prefill, streamed Markdown answers. Some English strings ("Type your message...", "Thinking..."). |
| `/dashboard` (learner) | "Bàn làm việc", "Chào mừng trở lại, {name}! 👋", hard-coded stat cards ("Khóa học đăng ký" = 0, "Giờ học tích luỹ"), empty state "Bàn làm việc của bạn đang trống" with "Khám phá lộ trình cùng AI", "Cập nhật Hồ sơ cá nhân". Disabled nav with "Sắp ra mắt": "Khoá học của tôi", "Lộ trình học tập", "Tiến độ & kết quả". |
| `/dashboard/lecturer` | Shell. Disabled: "Soạn thảo khoá học", "Chấm bài tập", "Tiến độ học viên". |
| `/dashboard/admin`, `/dashboard/admin/users` | Shell + working user list (change role, activate/deactivate with session revocation). Disabled: "Duyệt yêu cầu xuất bản khoá học", "Đơn hàng & giao dịch", "Voucher". |

### 2.3 Current-state flow (learner)
`/courses` → card "Thêm vào giỏ" (or detail) → toast-like status text → **dead end** (no cart page, no link to checkout) → *(only by typing the URL)* checkout → QR → paid → `/dashboard` which still shows "0" courses → the course appears only in `/profile` → "Khóa học", with no link to study it. Course detail never knows the user owns the course (still shows "Thêm vào giỏ"; clicking returns "Bạn đã sở hữu khóa học này").

### 2.4 Existing conventions to keep (from `docs/design-guidelines.md`)
- shadcn/ui (new-york), Radix, lucide icons, Tailwind tokens; light + dark mode.
- Brand deep cyan-teal; fonts Be Vietnam Pro (body), Lexend (headings), JetBrains Mono (code).
- Forms: validate on touch, inline errors under the control, server errors in an Alert, loading keeps width and swaps label to a verb.
- **Mastery scale** already defined for future diagnostic/progress UI: 5 stops, always paired with text "Chưa học / Đang học / Thành thạo" — never colour alone.
- WCAG 2.1 AA, visible focus ring, ≥44 px touch targets, no `uppercase` on Vietnamese text.
- Tone: friendly, instructive Vietnamese; prices in VND.

### 2.5 Product constraints visible in the repo / UC model
- Payment = Vietnamese bank transfer only: VietQR + transfer content `CODI#####`, confirmed asynchronously by webhook (can take seconds to minutes). Underpayment leaves the order pending. No expiry, cancel, or failed state exists yet.
- A lesson holds lecture video, PDF/slide deck and/or reading text, plus optional quiz, assignment and **coding exercise** (UC note; coding exercise added to the UC model 2026-10-12 as "Submit Coding Exercise"). The current DB has chapters and lessons without lesson types — content types are a UX requirement not yet backed by data.
- **Preconditions (UC spec):** Set Course Learning Goal → before Diagnostic. Study Lesson + Submit Quiz + Submit Assignment → before Complete Course Lesson.
- **AI rules (UC spec):** AI never starts a use case. Generate Path runs once after the entry test; Update Path runs on every Complete Course Lesson using that lesson's quiz/assignment results. Prerequisite order from the knowledge map is a hard constraint; AI decides emphasis, pace and what may be skipped, and writes the reason for the order. Mastery is computed by BKT (reproducible), not by the LLM.
- Diagnostic entry test is authored by the Lecturer as a course quiz flagged as entry test.
- **Course price is owned by Admin**, not Lecturer. Publication completeness check: price, description, ≥1 lesson. Admin manual review is a separate step.
- Knowledge map is extracted once per content change (not per learner).

---

## 3. Target User Experience

| Actor | Must be able to | Should feel |
|---|---|---|
| Guest | Judge in under a minute whether a course fits (outcomes, syllabus, lecturer, price) and act on it without losing context when asked to sign in. | Clear and low-commitment. |
| Learner (buying) | Go from "I want this" to "I'm in the course" with one obvious path, while bank-transfer confirmation is in progress, and know exactly what to do if it fails. | Confident: money flow is never ambiguous. |
| Learner (studying) | Always know *what to study next and why*, study it, prove it (quiz/assignment), and see the plan adapt. Get help (AI, lecturer) without leaving the lesson. | In control; the AI explains rather than dictates. |
| Learner (tracking) | See all courses, progress, scores, grades and lecturer feedback in one place. | Oriented. |
| Lecturer | Build a course quickly, review what the AI inferred from it, know exactly what blocks publication, and clear a to-do backlog (grading, questions, reviews). | Efficient; nothing falls through the cracks. |
| Admin | See what needs attention, act on users/courses/orders with clear consequences, and never take a destructive or monetary action by accident. | Safe and auditable. |

Cross-cutting qualities: one primary action per screen; system status always visible for anything asynchronous (payment, AI generation, upload, grading); recoverable errors in place; no dead ends ("Sắp ra mắt" items are replaced by real destinations).

---

## 4. User Journeys

### 4.1 Learner master journey
```
Entry (home / catalog / AI advisor / shared link)
→ Catalog: search + filter → Course detail
→ [Guest] Add to cart → sign-in modal → action resumes
→ Cart → Checkout (VietQR) → Awaiting payment → Payment confirmed
   ├─ expired / underpaid / cancelled → recover (new QR / contact / back to cart)
→ "Bạn đã sở hữu khóa học" success → Course onboarding
→ Set learning goal → Start fork:
   ├─ "Học từ bài 1" (default course order, lessons unlocked immediately)
   │     └─ later: "Làm bài kiểm tra đầu vào" card on course home → diagnostic → path
   └─ "Tìm điểm bắt đầu của tôi" → Diagnostic intro → questions → result
→ AI generates path (in-progress state) → Personal path view (ordered, with reasons)
→ Lesson player: study materials → quiz → assignment → "Hoàn thành bài học"
   → Path updated notice → next recommended lesson (loop)
   ├─ Ask AI assistant (side panel) / Post question to lecturer (side panel)
→ Course complete → review prompt → next course suggestion
→ Any time: Learner home ("Bàn làm việc") and Progress & results
```

### 4.2 Lecturer journey
```
Lecturer workspace home (to-do counts)
→ Create course (minimal form) → Draft
→ Curriculum builder: chapters → lessons → materials / quiz / assignment; flag entry test
→ AI extracts knowledge map (in-progress) → Review concepts & prerequisites → accept/edit
→ Publication readiness checklist → Request publication → "Chờ duyệt"
   ├─ Rejected with reason → fix → resubmit
   └─ Published → learners enrol
→ Support loop: Grade submissions · Answer questions · Respond to reviews · View learner progress
```

### 4.3 Admin journey
```
Admin dashboard (KPIs + "Cần xử lý" counts)
→ Course publication queue → review course → set price → Approve | Reject with reason
→ Published course → Hide (with reason) | Update price
→ Users → search/filter → change role | deactivate (consequences + reason) | reactivate
→ Orders & transactions → filter → detail drawer → export
→ Vouchers → list → create / edit / deactivate
```

---

## 5. Flow Specification

### Flow L1: Discover & evaluate a course *(UC Search Published Courses, View Course Details — exists, refine)*
**Trigger:** Header "Khoá học", homepage, AI advisor recommendation, direct link.
**Steps:** 1) Catalog with search + category/level/price filters; applied filters shown as removable chips with "Xóa bộ lọc" *(proposed)* and result count; **sort dropdown** "Sắp xếp: Phù hợp nhất / Mới nhất / Đánh giá cao nhất / Học nhiều nhất" in the filter row. 2) Search **typeahead**: query suggestions, then "Kết quả hàng đầu" rows with a type badge (Khóa học, Chủ đề), then "Xem tất cả kết quả". 3) Card → detail. 4) Detail main column: hero (title, summary, stats row: level, duration, rating, learners), outcomes, expandable syllabus where **each lesson row has a type icon + text label** (Video, Bài đọc, Quiz, Bài tập code, Bài tập) and duration/meta line, plus a **"Học thử" badge on free-preview lessons** (see Q23), requirements, lecturer, reviews summary. 5) Sticky purchase card.
**Decision points:** Not owned → purchase card shows two CTAs: primary **"Mua ngay"** (buys this course alone, straight to checkout, cart untouched) and secondary "Thêm vào giỏ" (decision 42). Owned course → purchase card turns into progress + "Tiếp tục học" *(proposed)*. In cart → "Đã trong giỏ hàng" + "Đến giỏ hàng" *(proposed)*. Free course → "Đăng ký miễn phí" *(proposed; see open question Q3)*.
**Exit:** Add to cart, go to cart, continue learning, ask AI.
**Failure / recovery:** No results → keep the active chips visible, show a prominent **"Đặt lại bộ lọc"** button (one tap) plus "Hỏi AI Codi gợi ý khóa học" as an equally visible secondary CTA. Load error → existing retry.

### Flow L2: Gated action for guests *(UC Sign In, Register Account, Verify Email)*
**Trigger:** Guest clicks "Thêm vào giỏ" (or any learner-only action).
**Steps:** 1) Sign-in modal over the current page (email/password, GitHub, "Ghi nhớ đăng nhập", link to register, "Quên mật khẩu?"); the modal states the intent: "Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động." 2) On success the modal closes **on the same course page**, the action completes, and the learner sees it: toast "Đã thêm {khóa học} vào giỏ" with action "Xem giỏ hàng", cart badge count increments, purchase card switches to "Đã trong giỏ hàng · Thanh toán".
**Decision points:** New user → register → OTP step, **kept inside the same modal so the course stays visible behind it** → returns to the same page with the action done. Never land on `/dashboard` or the homepage after a gated action (audit: drop-off point).
**Exit:** Back on the same page with the action done.
**Failure:** Wrong credentials inline; deactivated account → explicit message (not generic).

### Flow A1: Register & verify email *(exists, refine)*
**Steps:** Register form → "Nhập mã xác thực" screen with 6 boxes, the target email shown with "Sửa" link, "Gửi lại mã" with countdown → verified → signed in.
**Failure:** Wrong code → inline error under the boxes, boxes keep values for correction; expired code → resend prompt; too many attempts → wait message.

### Flow A2: Recover password *(exists, refine)*
**Steps:** "Quên mật khẩu?" → enter email → neutral confirmation that does not reveal whether the account exists, shows address + "kiểm tra thư rác" hint + resend → set new password → success with single "Đăng nhập" CTA.

### Flow A3: Account settings *(exists, refine)*
Left nav sections (existing "Tài khoản" with "Thông tin tài khoản", "Mật khẩu & Bảo mật"); edit-in-place fields with Save/Cancel only when dirty; changing email re-verifies the new address via OTP (existing); "Đăng xuất" reachable.

### Flow L3: Cart → Checkout → Payment *(UC Add Course to Cart, Apply Voucher, Purchase Course, Confirm Payment)*
**Trigger:** "Thêm vào giỏ" anywhere; header cart icon with count *(proposed)*; "Đến giỏ hàng"; or **"Mua ngay"** on course detail, which skips steps 1–2 and opens checkout with that single course (voucher field available on checkout). A guest pressing "Mua ngay" goes through the gated sign-in (Flow L2) and lands on that checkout.
**Steps:**
1. Add → in-place feedback: button becomes "Đã trong giỏ hàng" with secondary "Đến giỏ hàng / Thanh toán".
2. `/cart` *(new)*: line items (thumbnail, title, lecturer, price, remove ×), voucher field "Mã giảm giá" + "Áp dụng", order summary (tạm tính, giảm giá, tổng), primary "Thanh toán".
3. Checkout (existing screen, extended): order summary (all cart items, voucher), payment method (bank transfer), QR card.
4. Awaiting payment: VietQR above with the **expiry countdown directly beneath it** ("Mã hết hạn sau 29:41" — 30 min in prototype, confirm Q4) and the consequence stated ("Sau thời gian này mã QR và nội dung chuyển khoản sẽ không còn hiệu lực"); then copy rows with one copy button each — **Ngân hàng, Số tài khoản, Chủ tài khoản, Số tiền, Nội dung chuyển khoản** — and a warning that the transfer content must be exact. The copy rows are the **text fallback**: if the QR image fails to load, the QR area shows "Không tải được mã QR — chuyển khoản thủ công bằng thông tin bên dưới" + "Tải lại mã". A 3-step status tracker: *Đã tạo đơn → Đang chờ thanh toán → Đã nhận tiền*. Live status line while polling. A visible secondary button **"Tôi đã chuyển khoản"** triggers an immediate check → "Đang kiểm tra…" → either success, or "Chưa nhận được tiền — ngân hàng có thể mất 1–5 phút. Codi sẽ tự cập nhật." (tracker stays on step 2; button re-enabled after a short cooldown).
5. Confirmed: success state "Thanh toán thành công!" listing purchased course(s); primary "Bắt đầu học" → course onboarding (Flow L4); secondary "Về bàn làm việc". No forced auto-redirect.
**Decision points:** Voucher valid/invalid; one vs several courses (Q2); user leaves the page while pending → order stays pending and is resumable from cart/"Giao dịch" *(proposed)*.
**Exit:** Enrolled; or pending order saved.
**Failure / recovery:**
- Invalid voucher → inline error next to the field, total unchanged.
- Remove item from cart → removed immediately with an **undo toast** ("Đã xoá {khóa học} khỏi giỏ · Hoàn tác"), no confirm dialog.
- Course already owned → removed from cart with explanation.
- Expired order (Q4) → "Mã thanh toán đã hết hạn" + primary "Tạo mã mới" + secondary support entry.
- Underpaid → "Đã nhận X / cần Y" + support entry (Q5).
- **Every payment-problem state** (expired, underpaid, not detected after the threshold) shows the order reference `CODI#####` and a support entry as the secondary action ("Liên hệ hỗ trợ đối soát" — channel Zalo/hotline per Q5).
- Cancel → confirm dialog, order marked cancelled, back to cart.
- Payment not detected after a long wait → explanation of what happens next (manual reconciliation) + support entry, never an endless spinner.

### Flow L4: Course onboarding — goal & diagnostic *(UC Set Course Learning Goal, Complete Course Diagnostic Assessment, Generate Personalized Learning Path)*
**Trigger:** "Bắt đầu học" after purchase; or first open of an owned course that has no path yet.
**Steps:**
1. Goal (one decision per screen, top progress bar, 2–3 steps): goal ("Làm được dự án", "Hoàn thành khóa học", "Chuẩn bị phỏng vấn"… — exact options = Q6), self-assessed level, weekly time commitment (tiered cards). Each step also has a quiet "Bỏ qua" link (defaults applied, editable later via "Chỉnh mục tiêu").
2. **Start fork** (resolves Q7 — the diagnostic is no longer a gate): two cards, each stating its consequence —
   - **"Học từ bài 1"** — "Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình." → course home in default order, all prerequisite-satisfied lessons open.
   - **"Tìm điểm bắt đầu của tôi"** (marked "Khuyến nghị") — "~10 phút, giúp bỏ qua phần bạn đã biết." → diagnostic.
   Choosing "Học từ bài 1" shows a one-line inline note (not a blocking dialog) of what is lost: no skippable lessons, no personalised order yet.
3. Diagnostic intro: purpose ("giúp Codi xếp lộ trình phù hợp"), number of questions, estimated time, "không tính điểm", no timer, and "Để sau" (returns to course home in default order).
3. Questions: "Câu 3/12" counter + segmented progress, single question per screen, Back/Next, **"Tôi chưa biết"** action (recorded as distinct from wrong).
4. Result: right / wrong / "chưa biết" counts; per-concept mastery using the existing 5-stop mastery scale with text labels; strengths and gaps.
5. Path generation in progress: explicit state ("Codi đang xếp lộ trình cho bạn…"), not a blank spinner.
6. Personal path (Flow L5 screen).
**Decision points:** Start fork (above). Leave mid-test → resume from the same question. Learners who chose "Học từ bài 1" see a persistent, dismissible-per-session card on course home and learner home: "Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)". Taking it later generates the path from the current position; completed lessons stay completed.
**Failure:** AI generation fails/times out → show the course's default (prerequisite) order with a banner "Lộ trình cá nhân hoá chưa sẵn sàng" + retry. The learner is never blocked from studying.

### Flow L5: Personal learning path *(UC View Personalized Learning Path, Update Personalized Learning Path)*
**Trigger:** End of onboarding; course home; learner home "Tiếp tục học".
**Steps:** Ordered list grouped by chapter. Each lesson row: status (đã học / đang học / tiếp theo / có thể bỏ qua / bị khoá), mastery chip for its concept, duration, and a one-line **"Vì sao?"** reason written by the AI. Current lesson emphasised with primary "Học tiếp". Locked rows explain the missing prerequisite. Header: goal, progress (x/y bài), "Chỉnh mục tiêu".
**Decision points:** Learner may open a "có thể bỏ qua" lesson anyway; cannot open a lesson whose prerequisites are unmet (Q8: hard lock vs warning).
**Exit:** Into the lesson player.

### Flow L6: Study a lesson *(UC Study Course Lesson, Submit Course Quiz, Submit Assignment, Complete Course Lesson, Ask AI Learning Assistant, Post Course Question)*
**Trigger:** "Học tiếp" / any unlocked lesson.
**Steps:**
1. Player: left sidebar = path order with completion checks and type icons; content area = video / PDF-slide viewer / reading text; header with prev/next and course progress.
2. Lesson checklist under content *(proposed)*: Học nội dung ✓ → Làm quiz → Nộp bài tập → Bài tập code (only the steps the lesson has) — mirrors the UC precondition so the learner sees why completion is not yet available.
3. Quiz (Flow L7) and assignment (Flow L8) open in place.
4. "Hoàn thành bài học" becomes enabled when the preconditions are met → lesson marked complete → **path update notice** ("Lộ trình đã được cập nhật" with a short list of what changed: moved up / now skippable / unlocked) → "Bài tiếp theo: …" card. No auto-advance.
5. Side panels (one open at a time, content stays visible):
   - **AI trợ lý** — the in-lesson tutor, fully specified in Flow L6c.
   - **Hỏi đáp**: questions for this lesson, composer, lecturer replies marked with a "Giảng viên" badge, empty state "Hãy là người đầu tiên đặt câu hỏi"; plus **"Trao đổi với giảng viên"** private conversations (Flow L6d).

### Flow L6c: In-lesson AI tutor *(UC Ask AI Learning Assistant — redesigned 2026-10-12)*
**Principle:** a programming tutor, not a generic chatbot — it helps the learner find the answer, never hands over the full solution.
**Entry points (AI lives where the problem is):**
- Reading text / video transcript: select text → floating toolbar **Giải thích · Cho ví dụ · Hỏi thêm**.
- Code editor: select code → **Giải thích đoạn này · Vì sao lỗi?**; runtime error in the console → **Giải thích lỗi này**; failed test row → **Vì sao test này chưa đạt?**
- Header button "AI trợ lý" opens the panel for general questions.
Every contextual action opens the panel with the context attached and the question pre-filled.
**Panel anatomy:**
1. Header: title, "Cuộc trò chuyện mới", close. The thread is **per lesson** and persists when the learner returns.
2. Mode chips: **Giải thích đơn giản · Gợi ý từng bước · Ôn lại khái niệm**.
3. Messages. AI answers can contain: code blocks with syntax highlighting; **clickable line references** ("dòng 14") that scroll to and highlight those lines in the learner's editor; links to the lesson section or **video timestamp** ("Xem lại 04:12"); a **small suggested change as a diff (≤ ~3 lines)** with **Áp dụng / Bỏ qua**, and **Hoàn tác** after applying, followed by "Chạy lại test" inside the answer. Full-solution code is never generated or applied.
4. **Hint ladder** for "why is this wrong" questions: AI first asks one checking question (Socratic), then offers "Gợi ý 1 — hướng nghĩ" → "Gợi ý 2 — chỉ chỗ sai" → "Gợi ý 3 — khung cách làm", each revealed only when the learner asks; progress shown ("Đã dùng 2/3 gợi ý"). Hint usage is **visible to the lecturer** in learner progress and **never affects scores** (decision 51).
5. Per-message actions: copy, 👍 / 👎 (👎 opens reasons: "Chưa đúng", "Khó hiểu", "Lộ lời giải", "Không liên quan bài"); thinking state with **Dừng**.
6. Composer with **context chips** replacing the static "AI trả lời dựa trên" box: `Bài học: …` · `Code đã chọn (dòng 12–18)` · `Lỗi: TypeError…` · `Test #3 chưa đạt` — each removable; "+" menu adds: bài học, toàn bộ code, lần chạy gần nhất. Disclaimer below.
7. **Escalation:** after the 3rd hint, after a 👎, or any time via "Hỏi giảng viên" → Flow L6d with the AI context attached.
**Failure:** AI unavailable / rate-limited → inline message + "Hỏi giảng viên" stays available; context too large → chip shows "đã rút gọn".

### Flow L6d: Conversation with the lecturer *(UC Post Course Question ↔ Answer Course Question, as a message thread)*
**Trigger:** "Hỏi giảng viên" from the AI tutor (or from Hỏi đáp).
**Steps:** 1) Composer pre-filled with the learner's question and attached context (lesson, selected code, error, failed test, the AI conversation summary); learner edits and sends. 2) A **private conversation** (learner ↔ the course's lecturer) is created, linked to the lesson; status "Chờ giảng viên". 3) Lecturer replies from the Q&A inbox (S27, tagged "Từ AI trợ lý"); both sides can exchange **multiple messages** (text, code blocks, attachments of code snapshots). 4) Learner is notified of each reply; either side can mark "Đã giải quyết"; the learner can reopen.
**Visibility:** always private between the learner and the lecturer — never shared to public Hỏi đáp; no expected-reply-time promise is shown; only the learner can mark it resolved without a lecturer reply, the lecturer must reply before marking it resolved (Q34).
**Exit:** resolved; conversation remains in the lesson's "Trao đổi với giảng viên" list and in learner notifications.
**Failure:** Video/PDF fails to load → retry + reading text still accessible; AI unavailable / rate-limited → inline message, Q&A still available.

### Flow L6b: Coding exercise *(UC Submit Coding Exercise — in scope, added to the UC model 2026-10-12)*
**Trigger:** Lesson that contains a "Bài tập code" (authored by the lecturer with instructions, starter code and test cases). Submitting it is a precondition of "Hoàn thành bài học" when the lesson has one; it appears as a step in the lesson checklist.
**Grading:** automatic — score = share of test cases passed; no lecturer grading. Result counts toward Update Personalized Learning Path like quiz results. The learner may run unlimited times; "Nộp bài" records the submission (resubmission rules = Q9-style decision, default: latest submission counts).
**Steps:** 1) Three panes: instructions (numbered steps, per-step collapsed "Bí? Xem gợi ý"), editor (file tabs, toolbar with **"Chạy" showing the shortcut keycap Ctrl/⌘ + Enter**, "Định dạng code" (Shift+Alt+F), "Đặt lại"), output (Console · Kết quả kiểm thử tabs). 2) "Chạy" runs code and tests. 3) Test results: summary line ("3/5 bài kiểm thử đạt"), filter tabs Tất cả / Đạt / Chưa đạt, one row per test with pass/fail icon; expanding a failed row shows **Đầu vào · Kết quả mong đợi · Kết quả thực tế** side by side with the differing part highlighted (colour + text marker, never colour alone). 4) All tests pass → success panel inside the exercise: tests passed, attempts, primary "Tiếp tục" (advances the lesson checklist), secondary "Xem lại code".
**Help:** non-AI hints first; then "Giải thích lỗi này" on a failed test opens the AI panel pre-filled with that test's input/expected/received.
**Failure:** Runtime error → console shows the error with line number, editor marks the line; execution timeout → explicit message; sandbox unavailable → retry, instructions remain readable.

### Flow L7: Quiz *(UC Submit Course Quiz)*
Question counter + progress, prev/next, answer selection; submit dialog warns about unanswered questions ("Còn 2 câu chưa trả lời"); results: score ring, passing score, per-question review ("Câu trả lời của bạn" vs "Đáp án đúng" + explanation), "Làm lại" (Q9: retake rules), "Tiếp tục".

### Flow L8: Assignment *(UC Submit Assignment)*
Instructions → submit (file upload and/or link, note) → submit button disabled until required input present → "Đã nộp — chờ chấm" state (lesson can be completed now; grade arrives later) → when graded: grade banner (score, threshold) + lecturer feedback text + notification. Resubmission = Q10.

### Flow L9: Review a course *(UC Submit Course Review)*
Trigger: course completion screen shows an inline 5-star row (and a persistent "Đánh giá khóa học" entry on course home). Stars first, text optional → toast → review shows on detail page; own review becomes "Sửa đánh giá". Lecturer's public reply appears beneath it.

### Flow L10: Learner home & progress *(UC View Learning Progress and Results)*
- **Bàn làm việc** (replaces shell): "Tiếp tục học" card (course, current lesson, progress bar, "Học tiếp"); **weekly goal tracker** built from the onboarding time commitment ("Mục tiêu tuần: 3 buổi" with 7 day markers, studied days filled, "Chỉnh mục tiêu") with the **study streak** shown inside it ("🔥 5 ngày liên tiếp" — a day counts when the learner completes any learning activity; missing a day resets it, no punishing copy); **skill badges** row — one badge per knowledge concept reaching "Thành thạo" on the mastery scale (earned / in progress, tooltip names the concept and course), linking to Tiến độ & kết quả. No XP, leagues or leaderboards (Q26 resolved); stat tiles (khóa đang học, bài đã hoàn thành, bài tập chờ chấm, phản hồi mới); "Cá nhân hoá lộ trình" card for courses without a diagnostic; "Khoá học của tôi" list with progress; empty state → catalog + AI advisor.
- **Tiến độ & kết quả**: tabs "Đang học / Đã hoàn thành"; per course accordion → lessons with inline quiz scores, assignment grades and status; lecturer feedback readable inline; mastery per concept.
- `/profile` "Khóa học" tab links into the course (no longer a dead end).

### Flow L13: AI course advisor `/ai` *(redesigned 2026-10-12)*
**Access:** guests can use it; personalisation (owned courses, progress, saved profile) only after sign-in (decision 55).
**Landing (replaces the 4 static cards):** greeting + context line for signed-in learners ("Bạn đang học React cơ bản — bài 4/12"); 3 task cards **Tìm khoá học cho mục tiêu · So sánh khoá học · Lên lộ trình học**; 2–3 personal starters derived from state ("Sau khoá React nên học gì?", "Mình bị chậm tiến độ, nên làm gì?"); guests see generic starters + "Đăng nhập để Codi gợi ý theo tiến độ của bạn".
**Guided intake in chat:** when goal / level / hours per week are unknown, the AI asks one question at a time with option chips (+ "Khác", "Bỏ qua") and progress ticks. Answers are saved to the learner profile and reused by course onboarding (Flow L4) — never asked twice. A compact **"Codi đang hiểu về bạn"** row (mục tiêu · trình độ · giờ/tuần) with "Sửa".
**Structured answers:**
- **Course cards** inline: thumbnail, level, duration, rating, price or "Đã sở hữu", one line *why it fits your goal*, primary "Xem khoá học", secondary ownership-aware CTA ("Thêm vào giỏ" / "Tiếp tục học").
- **Comparison table** for 2–3 courses (level, duration, outcomes, prerequisites, price).
- **Suggested order** of courses as a numbered list of course cards inside the answer (no separate saved multi-course roadmap — decision 54).
- Only real catalogue courses; if nothing fits: "Codi chưa có khoá cho mục tiêu này" + nearest alternative.
**Answer actions:** follow-up chips, regenerate, copy, 👍/👎 with Codi reasons ("Sai trình độ", "Không hợp mục tiêu", "Thông tin khoá sai"); conversation history list (signed-in).
**States:** empty, intake in progress, answering (thinking + Dừng), answer with cards, no matching course, rate-limited (existing 429 copy), error.

### Flow L11: Learning statistics page *(UC View Learning Progress and Results — visual view)*
**Trigger:** Learner nav "Thống kê học tập" (separate page, *proposed route* `/dashboard/learner/statistics`); links from the weekly-goal tracker and KPI tiles on Bàn làm việc.
**Layout:** one period selector (Tuần / Tháng / 30 ngày — default **30 ngày**) + course filter (Tất cả khóa học / one course). **Tổng quan** (shown by default): C1 KPI row (giờ học tuần này, chuỗi ngày, bài hoàn thành, kỹ năng thành thạo) · C2 study hours per week as bars with the weekly goal as a dashed line · C3 activity calendar (month view with study marks + streak count; year grid with legend "Ít → Nhiều" and minutes/day tooltip) · C4 mastery per concept as sorted horizontal bars with the 5-stop text label and a ghost marker showing the level at the diagnostic test (hidden if the learner skipped it). **"Xem chi tiết"** expands: C5 quiz & coding-exercise scores over time with a dashed pass threshold and tiles (trung bình, cao nhất, tỉ lệ đạt) · C6 per-quiz donut Đúng / Sai / Chưa biết (the only donut in the product).
**States:** no activity yet (empty charts replaced by "Học bài đầu tiên để xem thống kê" + CTA); fewer than 2 weeks of data (C2/C5 show points, no trend claims); diagnostic skipped (C4 without ghost marker + "Làm bài kiểm tra đầu vào để thấy mức xuất phát").

### Flow L12: My knowledge map *(learner, read-only)*
**Trigger:** Course home (S10) tab "Bản đồ kiến thức"; a concept bar in C4.
**Steps:** The course's layered concept graph (same layout as the lecturer's, read-only). Each node shows the concept name, a mastery colour **and** text label (Chưa học / Đang học / Thành thạo), and a marker on the concept of the current recommended lesson. Selecting a node highlights its prerequisite path and opens a panel: mastery, lessons teaching it (with status) and "Học bài này" (respecting prerequisite locks).
**States:** map not confirmed yet by the lecturer (tab hidden); diagnostic skipped (all nodes "Chưa học" until lessons are completed).

### Flow T1: Create & author a course *(UC Create Course, Create/Update/Delete Course Content)*
**Trigger:** Lecturer home "Tạo khóa học".
**Steps:** 1) Minimal form: title, short description, category, level → created as **Bản nháp**. 2) Course editor with tabs (Thông tin · Nội dung · Bản đồ kiến thức · Xuất bản). 3) Curriculum tree: chapters → lessons, drag handles, "Thêm nội dung" menu (Chương, Bài học, Quiz, Bài tập), inline rename. 4) Lesson editor: materials (video upload, PDF/slides upload, reading text) with upload progress/error states. 5) Quiz builder: question cards, options, explicit Đúng/Sai marking, inline validation ("Cần ít nhất một đáp án đúng"); quiz settings panel with passing grade and **"Dùng làm bài kiểm tra đầu vào"** toggle. 6) **Coding exercise builder** *(UC Create Course Content)*: instructions, language, starter code editor, reference solution, test cases (input, expected output, visible/hidden to learner), "Chạy thử với lời giải" to verify every test passes before saving; validation "Cần ít nhất một bài kiểm thử".
**Decision points:** Delete lesson → simple confirm; delete course with enrolled learners → stronger type-to-confirm (or disallowed, Q11). Editing a published course → Q12.
**Failure:** Upload fails → row error + retry; unsaved changes warning on leave.

### Flow T2: Review the AI knowledge map *(UC Extract Course Knowledge Map)*
**Trigger:** Content saved/changed → "Đang phân tích nội dung…" state on the Bản đồ kiến thức tab; notification when ready.
**Steps:** View toggle **Sơ đồ | Danh sách** — **the visual graph is the default view** (decision 43); the list is the accessible alternative. Graph layout: layered DAG, left → right, one column per prerequisite depth; nodes = concept name + number of lessons; node state shown with icon + text (AI đề xuất · Đã chấp nhận · Đã sửa · Lỗi vòng lặp); selecting a node highlights its whole prerequisite path and dims the rest; controls: zoom, fit, minimap, filter by chapter. List: extracted concepts (name, lessons covering it) and prerequisite links ("A cần học trước B"), each with the AI's reason, per-item **Chấp nhận / Sửa / Bỏ**. Graph: concepts as nodes, prerequisite edges as arrows, zoom/fit/minimap; selecting a node opens a side panel with its prerequisites, dependants and covering lessons; adding a link = pick "cần học trước" in the panel (drag-to-connect optional). "Chấp nhận tất cả" opens a **summary confirmation**: "Thêm 12 khái niệm và 9 liên kết tiên quyết · Bỏ qua 2 liên kết (tạo vòng lặp)" with the list, then Xác nhận. A preview of the default learning order produced by the map.
**Exit:** Map confirmed (required for publication — assumption A4).
**Failure:** Extraction fails → retry. **Cycle** (A→B→C→A) → a banner names the full loop ("Vòng lặp: Biến → Hàm → Closure → Biến") with "Xem trên sơ đồ"; in the graph the nodes in the loop and the edge that closes it are marked (colour + icon), in the list the offending links are flagged; "Xác nhận bản đồ" disabled until resolved; the AI's own suggestions that would create a cycle are never auto-accepted.

### Flow T3: Request publication *(UC Request Course Publication + automatic completeness check)*
Readiness checklist cards: mô tả ✓, ≥1 bài học ✓, giá (see Q1), bài kiểm tra đầu vào (A5), bản đồ kiến thức đã xác nhận (A4). Each unmet item links to where it is fixed. "Gửi yêu cầu xuất bản" disabled until all pass → status **Chờ duyệt**. Rejected → status **Bị từ chối** with the admin's reason shown prominently + "Sửa và gửi lại". Approved → **Đã xuất bản**. Hidden by admin → **Đã ẩn** with reason.

### Flow T4: Lecturer support *(UC Grade Assignment Submission, Answer Course Question, Respond to Course Review, View Learner Progress and Results)*
- **Chấm bài**: tabs with counts **Chờ chấm (5) / Đã chấm**, filters by course, assignment and submission date; split view: submission left (GitHub/demo link, files), right rail with learner, status pill, score input (0–100), feedback textarea with a **"Mẫu nhận xét" picker** (saved snippets with title + preview, placeholders `{{ten_hoc_vien}}`, `{{diem}}`, "Tạo mẫu mới"), "Lưu điểm" + "Bài tiếp theo". Learner notified. **Đã chấm** tab lists past grades; "Sửa điểm" reopens the grading view, shows the previous score, and notifies the learner of the change (Q30). Batch grading: see Q25.
- **Hỏi đáp**: inbox with counts (Chưa trả lời / Đã trả lời), thread view grouped by course/lesson, reply; toast confirms. Includes private **learner conversations** escalated from the AI tutor (tag "Từ AI trợ lý"): the thread shows the attached code/error/test context and the AI summary; multi-message replies with code blocks; "Đã giải quyết" (only after replying); never shared publicly. Learner progress shows **AI hint usage** per lesson (hints used, escalations).
- **Đánh giá**: list with stars and text, "Phản hồi" opens a side sheet; replied reviews show the public reply inline with edit/delete; filter "Chưa phản hồi".
- **Tiến độ học viên**: per course stat row (học viên, tỉ lệ hoàn thành TB, điểm quiz TB), tabs Học viên / Kết quả quiz; per-question average to spot weak items; **course-level versions of the learner charts** — mastery per concept aggregated across learners (C4 style: sorted bars, share of learners at each mastery stop) and score trend with pass threshold (C5 style); drill-down per learner reuses that learner's C4/C5 charts (progress ring, lesson checks, scores).

### Flow D1: Admin console *(all Admin UCs)*
- **Dashboard** (admin home): "Cần xử lý" tiles, each a count linking to its queue (khóa học chờ duyệt, đơn cần đối soát, câu hỏi quá hạn…), plus two entry cards to the analytics pages below, each showing its headline KPI.
- **Quan sát hệ thống** *(new page, proposed route `/dashboard/admin/insights`)*: one header with period presets (7 ngày, **30 ngày** default, Quý, Tùy chọn) + "So sánh: kỳ trước". **Tổng quan** (default): A1 KPI tiles with delta + sparkline (WAU, đăng ký mới, ghi danh mới, bài học hoàn thành, khóa đang bán) · A2 DAU/WAU line, current vs previous (dashed) · A3 activation funnel Đăng ký → Xác thực email → Mua lần đầu → Hoàn thành bài đầu tiên (step bars, hatched drop-off, table with % of step 1 / step % / drop-off) · A7 content pipeline (horizontal stacked bar Bản nháp / Chờ duyệt / Đã xuất bản / Đã ẩn with counts + median review time tile) · A8 "Sức khỏe vận hành" (median grading time, questions unanswered > 48h, reviews without reply — Hôm nay / 7 ngày / 30 ngày, counts link to queues). **"Xem chi tiết"** expands: A4 cohort retention heatmap (enrolment week × week 0–8, % in cell, "Tất cả" row pinned, n per cohort, warning when n < 20) · A5 completion by course (sortable table with inline bars) · A6 diagnostic taken vs "Học từ bài 1" (segmented bar + trend) · A9 AI health (assistant requests/day, path-generation error rate, p95 latency, rate-limit hits + latency line).
- **Tài chính** *(new page, proposed route `/dashboard/admin/finance`)*: same header. **Tổng quan** (default): B1 KPI tiles (doanh thu gộp, doanh thu ròng sau voucher, đơn đã thanh toán, giá trị đơn TB, tiền giảm giá, hoàn tiền) with delta and "kỳ trước" · B2 revenue over time (day/week/month): current, previous (dashed), average; tooltip shows both dated values · B4 order status (segmented bar with amounts: Đã thanh toán / Chờ / Hết hạn / Thiếu tiền / Đã huỷ / Hoàn tiền; weekly stacked bar; tile "Tỉ lệ thanh toán thành công") · B8 "Cần đối soát" attention cards (đơn thiếu tiền, đơn chờ quá 30 phút, hoàn tiền chờ xử lý — count + one CTA to the filtered Orders list). **"Xem chi tiết"** expands: B3 revenue by course / category / lecturer (tabs; sortable table with inline bars + total row) · B5 checkout funnel Thêm vào giỏ / Mua ngay → Tạo đơn → Đã thanh toán, split by source · B6 time-to-pay histogram (<1, 1–5, 5–15, 15–30 phút, hết hạn) + median · B7 voucher performance table (mã, lượt dùng, tiền giảm, doanh thu có mã, trạng thái) · B9 "Xuất CSV" of the current view (export dialog, decision 41).
- **Every chart card** on both pages has its own "Xem chi tiết" opening a full-width view with the underlying table and CSV export.
- **Duyệt xuất bản** (Validate Course Publication Request + Update Course Price): tabs with counts (Chờ duyệt / Đã duyệt / Từ chối); split view: course summary + content preview + completeness check result + **price field (VND)**; "Duyệt và xuất bản" / "Từ chối" (reason required). **"Xem trước như học viên"** opens the full course in the learner player with a persistent top bar "Bạn đang xem trước với vai trò học viên — khóa học chưa xuất bản" + "Thoát xem trước" (returns to the same review item); unpublished items are tagged "Bản nháp" inside the preview.
- **Khóa học đã xuất bản** (Hide Published Course, Update Course Price): list with status; "Ẩn khóa học" dialog stating consequences for new buyers and existing learners (Q14) + reason; price change dialog.
- **Người dùng** (exists; refine): search plus **quick filters with counts** — status summary (Đang hoạt động 120 · Bị khoá 3, clickable) and role filter (Học viên / Giảng viên / Quản trị viên) as removable chips; deactivate dialog states consequences ("đăng xuất khỏi mọi thiết bị, có thể kích hoạt lại") **and lists concrete impact with counts** before the reason field — "Đang sở hữu 4 khóa học · 1 đơn hàng chờ thanh toán · Đang giảng dạy 2 khóa học" (each linkable) — with a "Tôi hiểu tác động" checkbox gating the confirm button (Q15).
- **Đơn hàng & giao dịch**: summary row, filters (date, status, method), status dot badges (Chờ thanh toán, Đã thanh toán, Thất bại, Đã huỷ, Hoàn tiền), detail drawer with status timeline and the bank transfer content. **"Xuất báo cáo"** opens an export dialog: date presets (Hôm nay, 7 ngày, Tháng này, Tháng trước, Tùy chọn), fixed timezone Asia/Ho_Chi_Minh shown, "Áp dụng bộ lọc hiện tại" toggle, column checkboxes, live summary ("~214 đơn · 9 cột"), format **CSV only** (Q28 resolved), download feedback.
- **Voucher**: list (code, discount, used/limit, expiry, active toggle) + create/edit form: Phần trăm / Số tiền (VND), đơn tối thiểu, giới hạn lượt dùng (Không giới hạn / Giới hạn N), hạn dùng (Không hết hạn / ngày cụ thể), áp dụng cho (Q16); deactivate = toggle with confirm.

---

## 6. Screen & State Inventory

Legend: **E** exists (refine), **N** new.

### Guest / shared
**S01 Catalog `/courses` (E)** — Purpose: find a course. Required info: title, lecturer, level, duration, rating, price, owned/in-cart badge. Primary: open course. Secondary: add to cart, clear filters, sort. States: loading, results, typeahead open (suggestions / grouped results / no suggestion), no results (with "Đặt lại bộ lọc"), error, filtered (chips), sorted. Exit: S02.

**S02 Course detail `/courses/[slug]` (E)** — Purpose: decide. Required: outcomes, syllabus (chapters/lessons, durations), requirements, lecturer, rating summary + reviews, price. Primary (by state): "Mua ngay" + secondary "Thêm vào giỏ" / "Đã trong giỏ hàng → Thanh toán" (+ "Mua ngay") / "Tiếp tục học" + progress / "Đăng ký miễn phí". Secondary: ask AI, open a "Học thử" lesson (Q23). Syllabus rows carry type icon + label. States: guest, learner not owned, in cart, owned, free, hidden/unavailable, loading, error, empty curriculum, just-added (toast + badge after gated sign-in). Exit: S03, S05, S10, preview lesson.

**S03 Sign-in modal (N, overlay of existing login)** — Purpose: authenticate without losing context. Primary: "Đăng nhập". Secondary: GitHub, register, forgot password. States: default, error, deactivated account, loading. Exit: resume intent.

**S04 Auth pages (E)** — Register, OTP verify, login, forgot, check email, reset, success. Key states: OTP wrong / expired / resend countdown; neutral "check email".

**S04b Settings `/settings`, Profile `/profile` (E)** — Keep; profile course list links to S12.

### Learner — commerce
**S05 Cart `/cart` (N)** — Purpose: review before paying. Required: items, prices, voucher, total. Primary: "Thanh toán". Secondary: remove, apply voucher, continue browsing. States: empty, items, voucher applied, voucher invalid, item already owned (auto-removed notice), pending order exists (resume banner).

**S06 Checkout (E, extended)** — Purpose: create order & pay. Required: items, total, method, QR + bank fields + transfer content. Primary: none needed beyond paying in the bank app; live status line. Secondary: "Tôi đã chuyển khoản" (manual check), copy buttons, cancel order, support entry. States: creating order, awaiting payment (tracker + countdown), QR image failed (text fallback), manual check in progress, still pending after manual check, confirmed, expired, underpaid, cancelled, error creating order, payments unavailable. All problem states show `CODI#####` + support entry.

**S07 Payment success (E, changed)** — Primary "Bắt đầu học" → S08. Secondary "Về bàn làm việc", view receipt in "Giao dịch". No forced redirect.

### Learner — learning
**S08 Goal setup (N)** — 2–3 single-question steps with progress bar. Primary: "Tiếp tục" (disabled until chosen). Secondary: "Bỏ qua". States: step n, editing existing goal (from S10).

**S08b Start fork (N)** — two consequence-labelled cards "Học từ bài 1" / "Tìm điểm bắt đầu của tôi" (Khuyến nghị). Exit: S10 (default order) or S09a.

**S09a Diagnostic intro / S09b question / S09c result (N)** — Required: count, estimated time, not graded. Question: counter, progress, options, "Tôi chưa biết", back/next. Result: right/wrong/unknown, concept mastery (5-stop scale + text), primary "Xem lộ trình của tôi". States: in progress, resumed, submitting, result.

**S10 Personal path / course home (N)** — Required: goal, progress, ordered lessons with status, mastery, reason. Primary: "Học tiếp". Secondary: edit goal, review course, open any unlocked lesson. States: **default order (not personalised yet, with "Cá nhân hoá lộ trình" card)**, generating, ready, updated (diff highlight), AI unavailable (default order), course completed.

**S11 Lesson player `/learn/[course]/[lesson]` (N)** — Required: content, path sidebar, lesson checklist, progress. Primary: next step in the checklist, then "Hoàn thành bài học". Secondary: prev/next, AI panel, Q&A panel. States: video / PDF / reading; materials loading/error; checklist partially done; completed; locked (direct URL to a locked lesson → explanation + link to prerequisite).

**S11a AI tutor panel (N, Flow L6c)** — per-lesson thread, mode chips, code-native answers (line refs, timestamp links, small diff Áp dụng/Bỏ qua/Hoàn tác, Chạy lại test), hint ladder, context chips in composer, escalation button. States: empty (contextual starters), context attached, thinking (Dừng), answer, hint n/3, diff applied, error, rate limited, escalated.

**S11a' Inline AI toolbar (N)** — on text/code selection, console error, failed test row.

**S11b Q&A panel (N)** — public lesson questions (list, composer, lecturer badge) + "Trao đổi với giảng viên" private conversations. States: empty, posted (awaiting answer), answered, conversation waiting / replied / resolved / reopened.

**S11h Lecturer conversation (N, Flow L6d)** — message thread with attached context; composer with code block support. States: draft with context, sent, replied, resolved.

**S11c Quiz (N)** — States: answering, unanswered warning dialog, submitting, result (pass/fail), retake.

**S11d Assignment (N)** — States: not submitted, uploading, upload error, submitted (chờ chấm), graded (score + feedback), resubmit (if allowed).

**S11e Lesson complete + path updated (N)** — "Đã hoàn thành", change summary, next lesson card.

**S11f Course complete (N)** — congratulation, inline star rating, next course suggestion.

**S11g Coding exercise (N, UC Submit Coding Exercise)** — instructions / editor / output panes; Run with Ctrl/⌘+Enter keycap; format code; test results list with Input · Expected · Received on failure. States: idle, running, runtime error, timeout, some tests failed, all passed, sandbox unavailable.

**S12 Learner home `/dashboard` (E → rebuilt)** — Continue card, weekly goal tracker with study streak, skill badges row, stat tiles, "Cá nhân hoá lộ trình" card(s), my courses, empty state.

**S13 Progress & results (N)** — tabs, per-course accordion, inline scores/grades/feedback, mastery. Links to S13b.

**S17 AI course advisor `/ai` (E → redesigned, Flow L13)** — personalised landing, intake chips, "Codi đang hiểu về bạn", course cards, comparison table, follow-ups, history. States: guest, signed-in, intake, answering, no match, rate-limited, error.

**S13b Learning statistics (N, separate page)** — period + course filters; Tổng quan C1–C4; "Xem chi tiết" C5–C6. States: no activity, little data, diagnostic skipped.

**S13c My knowledge map (N, tab on S10)** — read-only layered graph coloured by mastery with text labels; node panel with lessons. States: hidden (map not confirmed), all "Chưa học".

**S14 Review form (N, modal)** — stars, optional text, submit; own review → edit.

### Lecturer
**S20 Lecturer home `/dashboard/lecturer` (E → rebuilt)** — count tiles: bài chờ chấm, câu hỏi chưa trả lời, đánh giá mới, khóa học theo trạng thái; course list with status badges; primary "Tạo khóa học". Empty state for a new lecturer.

**S21 Create course (N)** — minimal form → draft.

**S22 Course editor: Thông tin / Nội dung (N)** — tree, add menu, drag reorder, lesson editor with uploads; states: empty course, editing, uploading, upload error, unsaved changes, read-only while "Chờ duyệt" (Q12).

**S23 Quiz builder (N)** — questions, options, Đúng/Sai, settings (passing grade, entry-test flag); validation states.

**S23b Coding exercise builder (N)** — instructions, language, starter code, reference solution, test cases (visible/hidden), verify run. States: editing, verifying, some tests fail against the reference solution (cannot save), saved.

**S24 Knowledge map review (N)** — **graph (default)** | list toggle; layered DAG, path highlight, zoom/fit/minimap, chapter filter; node side panel; accept-all summary dialog. States: analysing, ready for review, partially accepted, cycle detected (loop named + highlighted), confirmed, failed, stale (content changed after confirmation).

**S25 Publication tab (N)** — checklist, submit, status: Bản nháp / Chờ duyệt / Bị từ chối (+lý do) / Đã xuất bản / Đã ẩn (+lý do).

**S26 Grading queue + grading view (N)** — tabs Chờ chấm / Đã chấm with counts, filters (course, assignment, date), split view, score + feedback + "Mẫu nhận xét" picker, next; edit past grade.

**S29b Doanh thu khóa học của tôi (N, lecturer)** — period header; B1/B2/B3 restricted to own courses. States: no sales yet, course not published.

**S27 Q&A inbox (N)**, **S28 Reviews (N)**, **S29 Learner progress (N)** — as in Flow T4; each with empty states ("Không có bài nào chờ chấm").

### Admin
**S30 Admin dashboard (E → rebuilt)** — "Cần xử lý" tiles + entry cards to S36/S37.
**S36 Quan sát hệ thống (N)** — header (period + compare); Tổng quan A1, A2, A3, A7, A8; "Xem chi tiết" A4, A5, A6, A9. States: loading per card, no data for period, small-sample warning, comparison unavailable (first period).
**S37 Tài chính (N)** — same header; Tổng quan B1, B2, B4, B8; "Xem chi tiết" B3, B5, B6, B7, B9. States: loading, no orders in period, nothing to reconcile (B8 shows "Không có đơn cần đối soát").
**S31 Users (E)** — status summary counts + role chips; deactivate dialog with impact counts, acknowledgement checkbox, reason.
**S32 Publication queue + review detail (N)** — tabs with counts, split view, price, "Xem trước như học viên", approve / reject-with-reason.
**S32b Learner-view preview (N)** — learner player with persistent preview bar + exit back to S32.
**S33 Published courses (N)** — hide/unhide, price change.
**S34 Orders & transactions (N)** — table, filters, drawer, export dialog (date presets, timezone, columns, live summary).
**S35 Vouchers list + form (N)**.

### Global
**S40 Notifications (E bell → real)** — events: payment confirmed, assignment graded, question answered, publication approved/rejected, path updated (Q17: which events).
**S41 Role-aware header (E, changed)** — Learner: Khoá học, Học tập của tôi, AI; Lecturer: Giảng dạy; Admin: Quản trị. *(proposed; exact labels Q18)*

---

## 7. Interaction Requirements

1. **Return to intent after sign-in**: the action that triggered the gate (add to cart, start learning) completes automatically after login/registration.
2. **CTA reflects ownership everywhere** (catalog card, detail, AI recommendations): not owned / in cart / pending payment / owned.
3. **Asynchronous payment**: status is pushed/polled visibly; leaving the page is safe; the pending order is discoverable later (cart banner, "Giao dịch"). Never an unbounded spinner — after a threshold show what happens next.
4. **Copy-to-clipboard** per bank field with "Đã sao chép" feedback; transfer content visually emphasised.
5. **No forced redirects or auto-advance**: success, lesson completion and course completion all wait for the user's click.
6. **Preconditions are visible, not hidden**: the lesson checklist and the publication checklist explain disabled buttons.
7. **AI transparency**: every AI-made ordering shows its reason; AI panels state what context they use and that AI can be wrong; AI-generated knowledge maps require lecturer acceptance.
8. **AI work states**: generating / ready / failed / stale for path generation and knowledge-map extraction; failure always has a non-AI fallback (default order).
9. **Path change feedback**: after each completion the learner sees what changed in the path (brief, dismissible), and changed rows are highlighted on S10 once.
10. **Side panels** (AI, Q&A) keep the lesson content visible on desktop; full-screen sheet on mobile.
11. **Resume**: diagnostic, video position, unsaved assignment draft and the last lesson are restored on return.
12. **Destructive & monetary actions** (deactivate user, hide course, reject course, delete content, cancel order, change price, deactivate voucher) use a confirm dialog that states the consequence and reversibility; reason required for actions that affect another person (reject, hide, deactivate).
13. **Counts lead to queues**: every to-do count on lecturer/admin homes is a link to the filtered queue.
14. **Inline validation** per existing form conventions; vouchers validate on "Áp dụng".
15. **Mastery is never colour-only** (existing rule): 5-stop scale + text label.
16. **Responsive**: learner flows must work at phone width (catalog, cart, checkout, player, quiz); lecturer/admin consoles are desktop-first but must not break on tablet.
17. **Undo vs confirm**: reversible actions on the user's own data (remove from cart, delete a draft lesson, remove a saved feedback snippet) happen immediately with an undo toast naming the item; actions affecting other people or money (deactivate, reject, hide, cancel order, change price) use a confirm dialog with consequence + reason.
18. **Keyboard**: in coding exercises Ctrl/⌘+Enter runs code and the shortcut is shown on the Run button; format code has a shortcut; graph view has a keyboard-accessible list equivalent.
19. **Manual re-check never replaces auto-check**: "Tôi đã chuyển khoản" triggers an extra check but polling continues; the button cannot spam (cooldown).
20. **Deferred personalisation**: the diagnostic can be taken at any time; doing so later never resets completed lessons.
21. **Charts (all analytics pages)**: one question per chart; one period selector + "So sánh: kỳ trước" per page applied to every card; default period 30 ngày; exact values via tooltip and the card's "Xem chi tiết" table; never colour-only (mastery always carries its text label; status segments carry counts); inverted metrics (error rate, wait time, unanswered age) show deterioration as negative even when the number rises; samples under 20 flagged; no pie/donut except the single-quiz result; no radar; no smoothed areas without values; per-card loading/empty states so one slow query never blanks the page.
22. **Progressive detail**: analytics pages show the "Tổng quan" set first; "Xem chi tiết" expands the remaining cards in place (state remembered per user); each card's own "Xem chi tiết" opens its full view.
23. **AI is contextual**: AI actions appear on the thing they act on (selection, error, failed test) and carry that context; the learner always sees and can remove what the AI reads (chips).
24. **AI never solves for the learner**: hints escalate only on request; applied changes are small, reversible (Hoàn tác) and followed by a re-run; full solutions are never generated.
25. **AI answers are UI, not just prose**: course cards, comparison tables, code blocks, line references and timestamp links are interactive and lead to real actions.
26. **AI → human hand-off is one click and keeps context**.
27. **Graphs**: knowledge graphs use a layered left-to-right layout; selecting a node highlights its prerequisite path; zoom/fit/minimap; a list view is always available as the accessible equivalent.

---

## 8. UX Patterns & Research Findings

### Pattern: Filter rail + removable chips + helpful empty state
**Finding:** Course marketplaces keep filters visible, show applied filters as chips with clear-all, show result count; empty states stay on page with a way forward.
**Decision:** ADOPT (rail/chips/cards); ADAPT empty state to offer the AI advisor.
**Application:** S01.
**Evidence:** [Coursera — Filtering courses by subject](https://mobbin.com/flows/d797e8f0-4061-4d09-8721-edf5cbe6af59) · [Uxcel — Filtering courses (empty state)](https://mobbin.com/flows/6f01f893-2d97-406b-844e-8ebfebf879d0) · [SuperHi — Searching catalogue](https://mobbin.com/flows/3573fd8e-72ac-483f-87b3-e8b5be29594f) · [Brilliant — Searching courses](https://mobbin.com/flows/7686ff85-5f04-4f5d-9906-83771d663c19)

### Pattern: Two-column course detail with sticky purchase card
**Finding:** Outcomes + expandable syllabus in main column; sticky CTA card with price and trust line; review summary bars.
**Decision:** ADOPT (Codi already has this structure — keep); ADAPT guarantee line to Codi's refund policy (Q19).
**Application:** S02.
**Evidence:** [SuperHi — Course detail](https://mobbin.com/flows/10a8a5ac-e5e6-403d-bbcb-690aa08d1fff) · [Uxcel — Course detail](https://mobbin.com/flows/36718b1f-a152-4edd-a159-85591ee60bba) · [Skillshare — Class detail](https://mobbin.com/flows/56ed6c36-ffbb-42f8-b65c-be29ee1c9b82) · [Babbel — money-back line](https://mobbin.com/screens/3fb4481a-8315-459c-9b51-afd3436364cf)

### Pattern: Owned course → "Continue learning" + progress
**Finding:** Across products the purchase CTA is replaced by continue/resume plus progress and per-lesson checks.
**Decision:** ADOPT.
**Application:** S02, catalog cards, S12.
**Evidence:** [Uxcel — enrolled course](https://mobbin.com/screens/5827d2fe-01a3-433d-aa90-a6f0d02a061a) · [Codecademy — Resume course](https://mobbin.com/screens/aa6ef33d-ae53-4d25-a06a-5f53d3ccd9bb) · [Unity Learn — Continue Pathway](https://mobbin.com/screens/d8b28d0e-d326-49fc-905e-1b817eb0031e)

### Pattern: OTP entry with editable email and resend countdown
**Decision:** ADOPT. **Application:** S04. Wrong-code state not observed in references — design per existing form rules.
**Evidence:** [Posh — onboarding OTP](https://mobbin.com/flows/05c85d87-9a34-41d4-a7ab-c713e22aa346) · [Visual Electric — login code](https://mobbin.com/flows/29512f87-6b92-403f-8256-c2bc4e905808)

### Pattern: Neutral password-reset confirmation
**Decision:** ADOPT. **Application:** Flow A2.
**Evidence:** [Rows — reset](https://mobbin.com/flows/38fafefd-d37c-49b3-a356-2befccca0d29) · [Relevance AI — reset](https://mobbin.com/flows/06655d6b-e52f-4e18-bccf-0ca3f7fc279d) · [Cal.com — reset](https://mobbin.com/flows/85b263b0-d4a2-4d70-8ebc-34d5b9af7fcf)

### Pattern: Settings with section nav and edit-in-place
**Decision:** ADAPT (Codi's `/settings` already follows it; add dirty-only Save).
**Evidence:** [Squarespace — account settings](https://mobbin.com/screens/94bc6559-4cb1-4fee-9b83-e34d71076177) · [Airtable — account overview](https://mobbin.com/screens/19d3eae7-6f69-4a81-b993-3be2c3ca5b80) · [Magnific — profile](https://mobbin.com/screens/23106449-1ff8-48cf-a9ce-5e37b21ef503) · REJECT locked email: [Juicebox](https://mobbin.com/screens/92ab8c8e-bd90-40a8-87eb-73bcfde6c7d4) (Codi supports change email)

### Pattern: Sign-in as overlay on gated action
**Decision:** ADAPT (modal; return-to-intent is a Codi requirement not visible in references).
**Evidence:** [Etsy — sign-in modal](https://mobbin.com/screens/2419f90e-affc-42d5-8d45-63d838fdb41a) · [adidas — join modal](https://mobbin.com/screens/0afdb694-dd40-417b-b277-0a3073be46b7) · [Kiwi.com — sign-in modal](https://mobbin.com/screens/306a0591-ecc9-4728-ad66-63b3e8cf898e)

### Pattern: In-place add-to-cart confirmation, cart with promo field
**Finding:** Button state changes to "in your cart / go to checkout"; cart shows remove, subtotal/discount/total, one checkout CTA; promo errors inline.
**Decision:** ADAPT — full `/cart` page instead of drawer (Codi has no cart surface; page is linkable from checkout and success).
**Evidence:** [SuperHi — Adding a course to cart](https://mobbin.com/flows/eaee84e0-af85-4beb-9000-6886ae54489f) · [SuperHi — Deleting from cart](https://mobbin.com/flows/2795c958-b9fc-4d48-93f2-b7c14201c532) · [Hims — cart with promo](https://mobbin.com/screens/ff21c110-1547-4b30-8eba-566ad7100786) · [Instacart — invalid code](https://mobbin.com/screens/0db66561-4677-427d-bca7-0fd0d8aa4985)

### Pattern: Bank-transfer details with per-field copy + payment tracker
**Finding:** Each field (account, reference, amount) has its own copy control; a status pill/tracker communicates "waiting for funds".
**Decision:** ADAPT — add VietQR above; tracker 3 steps; Mobbin has no VietQR or expiry example (open design call).
**Evidence:** [OKX — bank transfer deposit](https://mobbin.com/screens/09a10913-a905-4e5e-839e-980bca03171d) · [Coinbase — bank details with copy](https://mobbin.com/screens/a6b0d118-6e54-4014-bd4c-d941a5e2ca4a) · [Deel — waiting for funds](https://mobbin.com/flows/57b0f984-4d02-44d8-8412-c50debd259c8)

### Pattern: Digital purchase success → immediate access; pending/failed states
**Decision:** ADOPT pending-then-ready banner; ADAPT success layout with one primary "Bắt đầu học"; ADOPT retry on failure.
**Evidence:** [SuperHi — Purchasing a course](https://mobbin.com/flows/2beec792-83c7-4490-ab76-6e318dd1d884) · [Etsy — Order confirmed](https://mobbin.com/flows/ff5aa9f0-738f-4d42-9244-e4f54fd72673) · [Etsy — Not yet paid](https://mobbin.com/flows/6d032d45-8672-4f5d-9f59-6572228b07cf) · [Revolut — deposit failed](https://mobbin.com/screens/082268c6-c6b1-42c6-8997-84561d5b9488)

### Pattern: One-question-per-screen goal setup with consequence-labelled options
**Decision:** ADOPT (Duolingo layout + time tiers); ADAPT outcome phrasing (Babbel); INSPIRATION editable goal form (Codecademy).
**Evidence:** [Duolingo — Onboarding](https://mobbin.com/flows/2c317632-13c2-4313-9977-98ac58c0d9d4) · [Babbel — Onboarding](https://mobbin.com/flows/332ff84d-d0f2-4669-bed6-7f1992729eb4) · [Codecademy — Updating learning goal](https://mobbin.com/flows/63fe82f5-4e01-4673-8862-2af0367b752e)

### Pattern: Untimed diagnostic with "I don't know" and strengths/gaps result
**Finding:** Counter + progress; skip counted separately from wrong; result shows right/wrong/skipped + strengths and growth areas.
**Decision:** ADOPT (result breakdown, skip slot); REJECT countdown and timer for a placement test.
**Evidence:** [Uxcel — Completing an assessment](https://mobbin.com/flows/4f332a92-958d-4eec-82f1-532b1a20787b) (timer rejected) · [Google Gemini — Testing a quiz](https://mobbin.com/flows/07fcf0de-3b98-4211-90c4-054e6228bafb) · [Duolingo — Completing a quiz](https://mobbin.com/flows/8452ec62-d745-4a7d-a6f0-f2b4d36755ba)

### Pattern: Learning path — list with per-row status and reasons (map as inspiration)
**Finding:** Path products show completed/current/locked nodes; none shows *why* an item is ordered — Codi's differentiator must add it.
**Decision:** ADOPT list with status markers + prerequisite block (Unity); INSPIRATION node map and popover on current node (Duolingo, Brilliant); REJECT linear path without reasoning (Front).
**Evidence:** [Unity — Pathway detail](https://mobbin.com/flows/a98d5441-3bcf-4657-ba53-78ec54a7d9a4) · [Duolingo — Learn](https://mobbin.com/flows/ac9818fd-73fc-4efb-8b9b-6c4e506613a4) · [Brilliant — Path detail](https://mobbin.com/flows/31d30598-6bfd-4141-9764-18b8c7c5d9f6) · REJECT [Front Academy — Learning path](https://mobbin.com/flows/c6636474-58e8-42c5-83b3-83c721c9248b)

### Pattern: Plan-updated notice after progress
**Finding:** Weak evidence — only a "Next:" bar after completion and small inline callouts. No reference shows a re-ranked plan diff.
**Decision:** ADAPT "Next:" bar; the change summary is a Codi-specific assumption (A2).
**Evidence:** [Replit — Marking a lesson complete](https://mobbin.com/flows/bbe22c41-e24b-43b3-a146-4de331ec14a1) · [Duolingo — Learn (rank callout)](https://mobbin.com/flows/ac9818fd-73fc-4efb-8b9b-6c4e506613a4)

### Pattern: Course player — curriculum sidebar + completion CTA under content
**Decision:** ADOPT; ADAPT sticky bottom CTA for long readings; REJECT forced auto-advance (no reference uses it).
**Evidence:** [Coursera — Marking a lesson as complete](https://mobbin.com/flows/b49d7e17-aabd-490a-9293-3b14318e4fe7) · [Optimal Workshop — Completing a lesson](https://mobbin.com/flows/4e583867-00db-4493-b45e-2e2a03ba35c3) · [Circle — Commenting on a lesson](https://mobbin.com/flows/c82f2862-f440-437e-98a6-bf136eb615e6)

### Pattern: Lesson-scoped Q&A with instructor badge
**Decision:** ADOPT badge + per-lesson scope; ADAPT drawer so content stays visible.
**Evidence:** [Skillshare — Creating a discussion](https://mobbin.com/flows/bf3f7a1e-b975-4ca7-b4bb-bf0f0e9c5695) · [Unity — Lesson discussion](https://mobbin.com/flows/5eb95a00-c344-4f39-8821-c33e39469863) · [Circle — Commenting on a lesson](https://mobbin.com/flows/c82f2862-f440-437e-98a6-bf136eb615e6)

### Pattern: In-context AI assistant side panel with declared scope
**Decision:** ADOPT scope checklist, prompt chips, AI-error disclaimer; INSPIRATION per-message feedback.
**Evidence:** [Codecademy — AI Learning Assistant](https://mobbin.com/screens/6ed109af-109a-4feb-86de-834255dc7589) · [MasterClass — Class TA](https://mobbin.com/screens/a35b472f-4bb2-4262-ba18-19abfba5dea3) · [SchoolAI — assistant preview](https://mobbin.com/screens/3e4334f7-1136-44b7-96e9-4ac506c087a0)

### Pattern: Post-completion star rating, text optional
**Decision:** ADOPT (Coursera); ADAPT chips + "Edit review" later (Skillshare); REJECT multi-screen survey (Codecademy).
**Evidence:** [Coursera — Rating a course](https://mobbin.com/flows/d96738cf-f47a-494c-88b1-57402164db45) · [Skillshare — Reviewing a class](https://mobbin.com/flows/f9f4de70-ae6e-4dc4-bc4c-a906c50c4e8c) · REJECT [Codecademy — Giving feedback](https://mobbin.com/flows/77d05612-f0e9-4a11-8c0d-6b9f0d7c017c)

### Pattern: Quiz submit confirmation + review with your/correct answer
**Decision:** ADOPT results/review (Codecademy); ADAPT submit dialog with unanswered count (not observed — Codi addition).
**Evidence:** [Expensify — Taking a quiz](https://mobbin.com/flows/75b90182-35fe-4dd9-a46f-7f6a39303e63) · [Codecademy — Completing a quiz](https://mobbin.com/flows/b192900c-261e-4393-be74-b1926ffd8abf) · [Coursera — graded quiz](https://mobbin.com/flows/43d051c3-eb5e-4aaa-96c8-2a0202e0e964)

### Pattern: Assignment submit gating + grade banner
**Decision:** ADAPT (grade banner + disabled submit from Coursera; upload confirmation from ClassDojo). Pending-grade and feedback states have no reference — designed from requirements.
**Evidence:** [Coursera — Completing an assignment](https://mobbin.com/flows/43d051c3-eb5e-4aaa-96c8-2a0202e0e964) · [ClassDojo — Uploading a worksheet](https://mobbin.com/flows/b61c5b3f-e0ea-41ad-90a3-d81684da837f)

### Pattern: Learner home continue card + my learning with inline scores
**Decision:** ADOPT continue card (Coursera/Uxcel), course accordion with inline scores and In progress/Completed tabs (Codecademy); ADAPT stat tiles (Expensify); REJECT XP/badge gamification (Unity).
**Evidence:** [Coursera — home](https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06) · [Uxcel — home](https://mobbin.com/screens/519c99ca-f49e-4509-b6db-57a74154d859) · [Codecademy — dashboard](https://mobbin.com/screens/1c9ca0fe-bb9a-4753-b41d-c4ef4f3a375c) · [Expensify — dashboard](https://mobbin.com/screens/6f808686-2cc4-426a-9bd7-c8bf2cfa5296) · [Codecademy — My learning](https://mobbin.com/flows/977fbb26-9111-4ac9-87ab-dc2335dd8238) · REJECT [Unity — Activity](https://mobbin.com/flows/02f8f435-90be-483e-8ac2-7529de011cab)

### Pattern: Minimal create-course form → draft
**Decision:** ADAPT (single form, skip optional thumbnail step).
**Evidence:** [Teachable — Creating a course](https://mobbin.com/flows/8f2dc57e-d1d3-42fa-b4b8-9c9b188dd303) · [Teachable — Creating a course with AI](https://mobbin.com/flows/27398767-cfeb-4547-83c5-82d4fd3d8235)

### Pattern: Curriculum tree with typed "Add content" menu and drag reorder
**Decision:** ADOPT; ADAPT delete confirmation (simple for lesson, type-to-confirm only for course).
**Evidence:** [Kajabi — Adding a lesson](https://mobbin.com/flows/1b660adb-90fc-4d2a-96df-2b9b7c6d6c18) · [Teachable — Reordering lessons](https://mobbin.com/flows/b97483d0-d597-41ac-b236-cb2e29267b8c) · [Teachable — Adding a lesson](https://mobbin.com/flows/ea383f49-b4e7-417e-b1a3-4ed2246fd5d6) · [Lindy — delete confirm](https://mobbin.com/screens/9f1d4d52-a8f7-48b7-89e5-b113b6aa6419) · [Clerk — delete confirm](https://mobbin.com/screens/de2ed754-dcb1-4e66-867f-45c5f6c9ed41)

### Pattern: Quiz builder with explicit correct marking + settings panel
**Decision:** ADOPT; entry-test flag lives in settings, not on question cards.
**Evidence:** [Whop — quiz editor](https://mobbin.com/screens/0e6704cd-1239-4b9a-bc85-a5fc1a5f80fe) · [Podia — quiz editor](https://mobbin.com/screens/583946a2-c81d-497b-ab3e-a2392cfe09d9) · [Circle — quiz settings](https://mobbin.com/screens/1a1022a9-5a99-4ea5-b935-d729af048fa9)

### Pattern: Publish readiness as requirement cards
**Decision:** ADAPT; review-specific statuses ("Chờ duyệt", "Bị từ chối + lý do") have no reference — designed from requirements.
**Evidence:** [Teachable — Publishing a course](https://mobbin.com/flows/ca328d45-4fee-42c1-925b-ff8e298dc4b8) · [Teachable — course list status](https://mobbin.com/screens/ee3ae777-7bb6-42da-9c8b-295f1c5d69cc) · [Kajabi — publishing content](https://mobbin.com/flows/d8480da3-bab0-4ba7-8c72-d1225db40f54)

### Pattern: Accept/decline AI suggestions before they take effect
**Decision:** ADOPT per-item accept/decline + accept all (knowledge map); INSPIRATION keyboard tree editing.
**Evidence:** [AirOps — Recommended prompts](https://mobbin.com/screens/ae0f151a-f195-43ba-9f2f-9c3ff74bfa10) · [Canny — Autopilot suggestions](https://mobbin.com/screens/7b436878-cfec-48e7-b198-365e5c17e947) · [Lyssna — tree editor](https://mobbin.com/screens/40f764b9-ce60-48e8-8502-fa3ae604aea0)

### Pattern: Grading split view (artifact left, decision rail right)
**Decision:** ADAPT — add numeric score and next/previous submission.
**Evidence:** [ClassDojo — Approving a worksheet](https://mobbin.com/flows/67096453-158a-4b59-8633-21fcb4684817) · [ClassDojo — Commenting on a worksheet](https://mobbin.com/flows/15ef127a-3dcb-4128-88f2-59a7b84e7744)

### Pattern: Inbox with counted views and state chips
**Decision:** ADOPT list/counts; ADAPT detail with "mark resolved" (if Q20 = yes).
**Evidence:** [Plain — All threads](https://mobbin.com/flows/124aa3cf-b8a7-4592-8363-5c35a93b410c) · [Kajabi — Replying to a comment](https://mobbin.com/flows/a648a31b-95d2-4dcd-b897-9d7c6fe9c50d) · [Vercel — Filtering inbox](https://mobbin.com/flows/87ec37ec-c607-498a-bdf1-7172083ac89a)

### Pattern: Review replies — side sheet editor, public reply under review
**Decision:** ADOPT "Đã phản hồi" state + inline public reply; ADAPT side sheet.
**Evidence:** [DoorDash Merchant — Adding a respond](https://mobbin.com/flows/33574bc7-31b0-42b3-8e55-42fc06d0ffb0) · [Klaviyo — Replying to a review](https://mobbin.com/flows/0cd3d2cf-e660-4886-94ba-3ab5ed1f5f54) · [Uxcel — Replying to a comment](https://mobbin.com/flows/ab1acfcc-f8c2-4d3b-9c8e-aee3515e5c91)

### Pattern: Course analytics — stat row, per-question averages, learner drill-down
**Decision:** ADOPT; REJECT leaderboard framing.
**Evidence:** [Whop — Analytics](https://mobbin.com/flows/e4ba85cb-25c1-4bb0-8308-e07c3c64af00) · [Circle — Course dashboard](https://mobbin.com/flows/eb1701f1-73e1-45e2-a31f-80df30333517) · [Kajabi — Product progress](https://mobbin.com/flows/5d677244-29b5-4bb3-acf4-b27db3ef9af6)

### Pattern: Workspace home with actionable count tiles
**Decision:** ADOPT for admin (strong); INSPIRATION for lecturer (weaker evidence, same pattern reused for consistency). REJECT bulk "approve all" for grading.
**Evidence:** [Midday — home](https://mobbin.com/screens/2ccaa357-1ff9-45de-82d2-84ac36fff008) · [Shopify — home](https://mobbin.com/screens/668a7524-57c0-476a-8ce1-6f9cb05f85da) · [ClassDojo — review banner](https://mobbin.com/screens/6f63271f-e625-4bf8-8435-d4e735ad7d9e)

### Pattern: Consequence-stating destructive dialogs for user status
**Decision:** ADOPT copy (effect + reversibility); ADAPT side panel; INSPIRATION role chips/filters. Reason field = Codi addition.
**Evidence:** [Apollo — deactivate dialog](https://mobbin.com/screens/a071c333-bcc8-414d-9965-f8009bc215a6) · [DoorDash Merchant — manage users](https://mobbin.com/screens/3f972058-50b7-43d3-bd7c-7444458a1bed) · [WRITER — users/roles](https://mobbin.com/screens/05847564-d48a-4e9f-83f7-93c3cd1d7862) · [Docusign — users table](https://mobbin.com/screens/87994df6-4d7b-44c1-a691-9ee4a2026380)

### Pattern: Moderation queue split view with counted tabs, reject needs reason
**Decision:** ADOPT split view + tabs; ADAPT price field in review pane; REJECT one-click inline reject.
**Evidence:** [Reddit — mod queue](https://mobbin.com/screens/ef1ae11f-e221-43cf-84d4-a723ad7ae8c0) · [Circle — moderation](https://mobbin.com/screens/6c0687e1-5bf7-47b8-8e01-1d7a57f99b89) · [Biosites — price field](https://mobbin.com/screens/330af9e5-037f-4656-a617-a0adf664ee16) · REJECT [StackAI — pending approvals](https://mobbin.com/screens/3ee3b3f3-ee96-480d-bb21-17369bed1b03)

### Pattern: Transactions table with status dots, filters, drawer timeline, export
**Decision:** ADOPT.
**Evidence:** [Mercury — transactions](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4) · [Airwallex — all transactions](https://mobbin.com/screens/ab0fb2f3-875c-4c61-8c9c-79147f0c63b1) · [DoorDash Merchant — orders](https://mobbin.com/screens/3de8fe76-e958-4784-9100-8b45fbd80cf5)

### Pattern: Coupon form with radio choices and expanding limits
**Decision:** ADOPT radios (Podia); ADAPT expanding min-order row in VND (Stripe) and unit toggle (Fresha). Voucher list has no reference.
**Evidence:** [Stripe — coupon](https://mobbin.com/screens/c27b5f9b-f2ff-45a7-b399-3989eef6bf93) · [Podia — coupon](https://mobbin.com/screens/35ec0b67-2f42-489e-b4f6-a4435cc98751) · [Fresha — promotion](https://mobbin.com/screens/6e75014a-2b00-476f-8acb-494cdc0eb0af)

### Revision 2026-10-12 — patterns added after the prototype UX audit

### Pattern: Gated sign-up keeps the item in view; return to the same page
**Finding:** Walmart's OTP step has inline wrong-code error and "Get another code"; Shop keeps the cart summary visible beside the OTP. No reference showed the post-sign-in add confirmation or a "Buy now" button.
**Decision:** ADAPT — OTP inside the overlay, course visible behind; confirmation toast + badge is a Codi requirement (audit), not evidence-backed.
**Evidence:** [Walmart — account creation](https://mobbin.com/flows/0238f81f-a9c3-443c-85ec-615f0fec7056) · [Shop — checkout OTP](https://mobbin.com/flows/a0e48128-6481-47ca-9f84-8cfac24fabaf)

### Pattern: Sort dropdown + grouped typeahead
**Decision:** ADAPT single sort dropdown in the filter row; ADOPT typeahead with query suggestions → typed result rows → "view all"; REJECT suggestions-only typeahead.
**Evidence:** [Coursera — sort](https://mobbin.com/screens/69ce3b55-5d49-4115-a760-805d564b1db4) · [Skillshare — sort](https://mobbin.com/screens/36f20c84-9c78-4e87-ab8c-2130ce425904) · [Codecademy — typeahead](https://mobbin.com/screens/2b9a141c-e9b8-4b10-8372-b05cae81ef2e) · REJECT [Coursera — typeahead](https://mobbin.com/screens/0452c7a3-e39a-4906-90da-445683a45f64)

### Pattern: Typed syllabus rows + preview badge
**Decision:** ADOPT icon + text label per row; ADAPT meta line and "public preview" badge. No reference shows the guest preview player itself.
**Evidence:** [Codecademy — syllabus](https://mobbin.com/screens/65d1c885-4c6a-4bef-9352-debb3079a883) · [Unity — course list](https://mobbin.com/screens/48726aae-df9a-49a3-9ac5-bbf5ba6f9cae) · [Squarespace — preview badge](https://mobbin.com/screens/3672a930-a2ba-48cb-a5fe-e03e94cf6e60) · INSPIRATION [Uxcel — syllabus](https://mobbin.com/screens/02294a41-5e3c-4db8-9234-14e08e8b3dff)

### Pattern: Zero results with one-tap "Reset filters"
**Decision:** ADOPT.
**Evidence:** [Turo — no results](https://mobbin.com/screens/842ceacc-915c-447d-a8be-cdb372fce6f9) · [Navan — no results](https://mobbin.com/screens/6bc2afe2-79b4-4db9-b1b9-3af07bee20fc) · [Fey — no matches](https://mobbin.com/screens/7ff1da87-ed3c-4b42-b83d-1d0889946ef3)

### Pattern: Countdown next to the QR; problem states with support
**Finding:** Countdown sits under the code with the consequence of expiry stated; error modals pair the message with "Chat with support". No reference shows an "I've paid" button or an expired-QR regenerate state.
**Decision:** ADAPT; "Tôi đã chuyển khoản" and regenerate are audit-driven requirements without precedent.
**Evidence:** [Airwallex — QR expiry](https://mobbin.com/screens/6a4d4b1e-814c-4e05-993a-c64050080647) · [Navan — time left](https://mobbin.com/screens/426921f9-ba47-43fe-b73f-4003d762595e) · [Navan — error with support](https://mobbin.com/screens/2931d92d-1799-496d-be62-7043c18bb14d) · [Deel — payment detail](https://mobbin.com/screens/0a72ced2-1cca-4efb-8e8c-3848bac42d7d)

### Pattern: Undo toast for reversible self-actions
**Decision:** ADOPT.
**Evidence:** [Netflix — removed from My List](https://mobbin.com/screens/5211d5f6-c653-4210-aead-047adec26c9a) · [Asana — deleted](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931) · [Coda — moved](https://mobbin.com/screens/580abcac-fdb0-4c72-b6ea-b529d42bfa1e)

### Pattern: Start fork — "from scratch" vs "find my level"; skip with return
**Finding:** Duolingo presents both options as equal cards with stated consequences, the test framed as a shortcut; Docusign/Preply keep "Skip" visible and promise return; Babbel keeps a "find your level" card on home.
**Decision:** ADAPT (fork, diagnostic marked "Khuyến nghị"); ADOPT skip-with-return copy; ADAPT persistent re-prompt card.
**Evidence:** [Duolingo — onboarding](https://mobbin.com/flows/2c317632-13c2-4313-9977-98ac58c0d9d4) · [Duolingo — onboarding (alt)](https://mobbin.com/flows/849942d8-918e-4bb8-8a73-591eb2859d5f) · [Babbel — choosing a course level](https://mobbin.com/flows/8e24cf50-50bf-49ae-bcb7-751e57639cee) · [Babbel — level test](https://mobbin.com/flows/b27b4aee-e682-4505-b366-060ef38ed838) · [Docusign — skip and explore](https://mobbin.com/screens/c0248abe-0324-4739-83e6-cbc310da9912) · [Preply — skip personalization](https://mobbin.com/screens/92393ddf-143a-42e0-aac5-694274b2e463)

### Pattern: Weekly goal + streak + skill badges (no XP/leagues)
**Decision (updated after Q26 = add):** ADOPT weekly goal tracker (Coursera); ADAPT streak counter and badges (Codecademy) — streak lives inside the weekly goal, badges are tied to concept mastery rather than arbitrary milestones; REJECT XP, leagues and daily quests (Duolingo).
**Evidence:** [Coursera — weekly goal](https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06) · ADAPT [Codecademy — streaks & badges](https://mobbin.com/screens/4d1e0a51-4a2d-4b4f-8a1b-cff0eab3e41c) · REJECT [Duolingo — home](https://mobbin.com/screens/781f3022-614e-4eab-96ae-d9f305925ff5)

### Pattern: Three-pane coding exercise, Run shortcut keycap, progressive hints
**Decision:** ADOPT layout, Run in editor toolbar with keycap, collapsed hints; ADAPT docked AI as "Giải thích lỗi này"; no reference for format-code or Submit/Check.
**Evidence:** [Codecademy — exercise + AI assistant](https://mobbin.com/screens/3b69dfaf-134d-4dfa-a16b-23365bb47ae0) · [Codecademy — hints](https://mobbin.com/screens/f06a1c11-513e-4cc6-a149-652a925ff51d) · [Browserbase — Run ⌘↵](https://mobbin.com/screens/118eaf24-c380-4f66-818b-8813c59361f5) · INSPIRATION [Graphite — AI prompts](https://mobbin.com/screens/88f81a55-bfa9-450c-b106-2ffd76e94f6a)

### Pattern: Test results list with filter tabs and expandable reason
**Decision:** ADOPT summary + Passed/Failed tabs + per-test rows; ADAPT expandable detail filled with Input/Expected/Received. Coloured diff has no reference (Codi requirement).
**Evidence:** [Postman — test run](https://mobbin.com/screens/17ad05ba-4835-4c81-8a18-1223ebc6cd25) · [Adaline — eval reasons](https://mobbin.com/screens/fcdd8f81-bf0f-4413-a606-3c4aa1107a1f) · [Vapi — test details](https://mobbin.com/screens/404a5004-51fa-45e5-8a56-428518c63fdf)

### Pattern: Exercise success → primary "Continue"
**Decision:** ADOPT; stats adapted to tests passed/attempts.
**Evidence:** [Uxcel — lesson complete](https://mobbin.com/screens/079d1b0e-d73a-46cf-9c46-0c138b025d6f) · [Duolingo — lesson complete](https://mobbin.com/screens/875b9e7e-75bb-4ae9-8e45-91171f92f8fd) · [Codecademy — review complete](https://mobbin.com/screens/3d9608bb-98fe-4a4e-bafe-e30839b6908b)

### Pattern: Graph canvas with selected-node side panel; node-level error marking
**Finding:** Selected node opens a side panel; errors mark the node in red with a named banner and disable save. No reference shows a red edge or list/graph toggle.
**Decision:** ADAPT — graph default (updated 2026-10-12, decision 43) + list toggle; cycle banner names the loop; edge highlighting is a Codi requirement.
**Evidence:** [Vapi — canvas](https://mobbin.com/screens/d6c6222f-01e0-4fbf-92ec-3c7851b77be0) · [WRITER — canvas + panel](https://mobbin.com/screens/01f1bee3-2286-4ca5-9a86-a37c5b1fd0e0) · [Twenty — workflow editor](https://mobbin.com/screens/e070fb11-603c-45cc-a3af-72231b4a024f) · [Copy.ai — validation](https://mobbin.com/screens/47d1e096-404f-450e-86f0-b216e2de6388) · [n8n — failed node](https://mobbin.com/screens/f70fc619-d6bf-4dff-958d-ef47afc0342e) · [Retool — errored node](https://mobbin.com/screens/432bafdc-8882-44c5-bb5d-33dbb7dc78f2)

### Pattern: Bulk-apply confirmation with counts
**Decision:** ADOPT summary with counts + item list before confirming "Chấp nhận tất cả"; typed-count confirmation only for destructive bulk actions.
**Evidence:** [Jira — bulk operation](https://mobbin.com/screens/04674b74-506d-4bf1-82e4-606c4a540ab2) · [AirOps — accept/decline all](https://mobbin.com/screens/6642909e-6268-45ee-8028-72f19c646023) · [Deel — bulk dismiss](https://mobbin.com/screens/056d8aef-ad01-424a-975b-62795a4bd647)

### Pattern: Saved feedback snippets in the composer
**Decision:** ADOPT title + preview + placeholders; categories only if needed.
**Evidence:** [Plain — snippets](https://mobbin.com/screens/4466bdeb-e7c0-4953-8a92-bd9e11afe69b) · [Zillow — saved replies](https://mobbin.com/screens/fc7558fd-d19d-4d34-a177-036ad9f8cd9d) · [Reddit — saved response](https://mobbin.com/screens/36ee396d-b8f0-4cea-9a31-fb4e367bc62e)

### Pattern: Queue tabs with counts, history tab, selection bar
**Decision:** ADAPT To do / Done tabs + edit from history; selection bar only for non-scoring bulk actions (Q25).
**Evidence:** [Relevance AI — task tabs](https://mobbin.com/screens/51d36016-afbe-4935-842d-6b96b05174b0) · [Midday — selection bar](https://mobbin.com/screens/82b9a3a4-d347-4b25-bff9-8daca992fe58) · [Reddit — mod queue tabs](https://mobbin.com/screens/9e81dbcf-db79-45ef-8347-08e81e1b5b77)

### Pattern: Preview-as mode with persistent bar and exit
**Decision:** ADOPT (Teachable previews as admin; Codi previews in learner role).
**Evidence:** [Teachable — course preview](https://mobbin.com/screens/c04c0023-2365-4741-9dc9-4592f491c7ea)

### Pattern: Destructive dialog listing impact counts with acknowledgement gate
**Decision:** ADAPT — Coda's counts + links + checkbox gate, Lovable's layout with reason.
**Evidence:** [Coda — delete account](https://mobbin.com/screens/43079a19-7b46-40de-b67e-da226f4a0372) · [Lovable — delete account](https://mobbin.com/screens/bb0d45db-e185-4882-9463-4c511e00eca6) · [Adobe — delete account](https://mobbin.com/screens/782d6935-8cbf-41a6-a627-aa6980dcbb7a)

### Pattern: Status summary counts as filters + removable role chips
**Decision:** ADAPT.
**Evidence:** [Airwallex — user management](https://mobbin.com/screens/68139aeb-25be-42b6-9a06-2e5643106bb5) · [Miro — all users](https://mobbin.com/screens/faace447-f5cd-4c6e-96db-c1f5a953e179) · [Deel — people table](https://mobbin.com/screens/5e01459c-5eb8-4a68-80be-ae6cbbc32f21)

### Pattern: Export dialog with date presets, timezone, columns, live summary
**Decision:** ADAPT (Stripe controls, Whop summary, Upwork file-retention note). Excel format has no reference (Q28).
**Evidence:** [Stripe — export payments](https://mobbin.com/screens/8f736fe0-96d7-4c56-a2d5-a9156acc3c1e) · [Dub — export](https://mobbin.com/screens/1e9019c3-d0ac-4639-a9bb-427f6a9044fe) · [Whop — export](https://mobbin.com/screens/6e465675-4365-4b64-accc-34e00565d6f0) · [Upwork — custom export](https://mobbin.com/screens/4a0de883-ea57-432d-8114-e5fc26f7e4b3)

### Revision 2026-10-12 (c) — AI advisor & AI tutor patterns

### Pattern: Personalised AI landing with task cards
**Decision:** ADAPT. **Evidence:** [Linear — AI task cards](https://mobbin.com/screens/12fc9c16-9010-423f-9ea7-0b5a1567880e) · [Klarna — shopping home](https://mobbin.com/screens/f9af7d9a-6ce7-470a-97c5-5049f6cc03df) · [MasterClass — recommendations from intake](https://mobbin.com/flows/5855ea68-e0ec-4684-b805-da5c833ff4c1)

### Pattern: Guided intake with option chips inside chat
**Decision:** ADOPT; editable "Codi đang hiểu về bạn" is a Codi addition. **Evidence:** [Codecademy — find what's right for you](https://mobbin.com/flows/9e0051c2-a775-4a37-adcd-a9649df80a60) · [Klarna — intake chips](https://mobbin.com/flows/a2ec76bc-3317-4c11-b1ff-b6952aa5b78a) · [Duolingo — onboarding](https://mobbin.com/flows/849942d8-918e-4bb8-8a73-591eb2859d5f)

### Pattern: Structured AI answers — product cards and comparison tables
**Decision:** ADAPT (ownership-aware CTAs). **Evidence:** [Shop — inline cards](https://mobbin.com/screens/587a9d1f-4092-4167-9bea-7eb3ebad9df4) · [Amazon Rufus — card + chips](https://mobbin.com/screens/ace833cd-b503-42e6-a317-16c4a2d3a126) · [ChatGPT — comparison table](https://mobbin.com/screens/2efc61d6-cd10-45b0-9649-9f120fdd5697)

### Pattern: Answer action row and reasoned feedback
**Decision:** ADOPT / ADAPT reasons. **Evidence:** [Microsoft Copilot — actions](https://mobbin.com/screens/0fb9fc0d-38aa-4489-88f3-6e35396a361a) · [Mistral Le Chat — feedback reasons](https://mobbin.com/screens/4a5c8393-5ae0-47ee-a729-499c3d68256f)

### Pattern: Chat + artefact split view
**Decision:** INSPIRATION only — multi-course roadmap saving is out of scope (decision 54). **Evidence:** [Mindtrip — itinerary panel](https://mobbin.com/screens/66fd64e4-2a7b-4a09-900d-c8336501bba3) · [Unify — chat + result](https://mobbin.com/screens/4b86222c-061a-41e1-9a42-212c9b3569e5)

### Pattern: Selection toolbar / inline AI actions
**Decision:** ADAPT (editor error/test actions have no reference). **Evidence:** [Magnific — selection toolbar](https://mobbin.com/screens/3fb76c75-fcb5-4ea9-8338-2a309c0fa916) · [WRITER — inline overlay](https://mobbin.com/screens/65eaa501-c59e-47e8-8feb-82715829ec9e) · [Stitch — element popover](https://mobbin.com/screens/15f24955-be84-4e66-9777-6184289d5423)

### Pattern: Reversible suggested changes (apply / restore)
**Decision:** ADOPT for small diffs; REJECT full-solution suggestions. **Evidence:** [Graphite — apply changes](https://mobbin.com/screens/88f81a55-bfa9-450c-b106-2ffd76e94f6a) · [Google AI Studio — view changes / restore](https://mobbin.com/screens/26245b00-8cf8-447d-a829-63684c069c00) · REJECT [Codecademy — full code review suggestion](https://mobbin.com/flows/9b9b72db-442d-4886-9361-2ae0338f109f)

### Pattern: Socratic tutor referencing the lesson; modes
**Decision:** ADOPT / ADAPT; hint ladder is Codi design. **Evidence:** [MasterClass — Class TA](https://mobbin.com/screens/cca209b4-b227-4c53-9837-a4e3ca064afb) · [Codecademy — assistant scope](https://mobbin.com/screens/d04ed7f4-0405-481c-a9ab-bd67af775b12) · [Gemini — learning guide preset](https://mobbin.com/screens/a1884313-e885-4034-9da1-1739869aa876)

### Pattern: Removable context chips in the composer
**Decision:** ADOPT / ADAPT. **Evidence:** [Ferndesk — composer chip](https://mobbin.com/screens/5eb452b6-b4f1-4594-ad7e-9a9ca9abd734) · [Mistral Le Chat — file chips](https://mobbin.com/screens/15f86183-2200-4534-a2d3-94bba9a421c1) · [Claude — "+" menu](https://mobbin.com/screens/16cc5d91-2f00-4a92-9777-6dd57a63a6a4)

### Pattern: Thinking / stop / per-message feedback / history
**Decision:** ADOPT (threads per lesson = Codi design). **Evidence:** [Perplexity — thinking + stop](https://mobbin.com/screens/2460ef6c-5f63-45c8-8f73-8e95f3d904b7) · [Grok — stop](https://mobbin.com/screens/0d566935-f7bd-405e-bcb3-5c9cc1d026c8) · [ChatGPT — message actions](https://mobbin.com/screens/aa10c227-727c-4f1c-b628-c219f29cbfb8) · [Codecademy — feedback](https://mobbin.com/flows/26d40e29-5496-4c0b-b17d-507f421683f9)

### Revision 2026-10-12 (b) — analytics & knowledge-graph patterns

### Pattern: Analytics header with period + compare, KPI tiles with delta and sparkline
**Decision:** ADOPT.
**Evidence:** [Navattic — analytics](https://mobbin.com/screens/a5be5a57-9c24-49a2-9ce5-ccd5edc17a1b) · [Whop — stats](https://mobbin.com/screens/0bb8b25f-0c3d-47c3-b20a-1447e7dbab9e) · [Whop — analytics tooltip](https://mobbin.com/screens/4b8d23f1-19b7-4b67-b2bc-22b3ed35af94) · [Midday — current/previous/average](https://mobbin.com/screens/d577de56-8df0-4645-b6c0-e02c089f59dd) · [Midday — revenue](https://mobbin.com/screens/aa756fb8-9d04-4778-9480-82e847c94516) · [Stripe — overview](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3)

### Pattern: Funnel = step bars + hatched drop-off + rate table
**Decision:** ADOPT; REJECT Sankey for short funnels and steps above 100%.
**Evidence:** [Google Analytics — funnel](https://mobbin.com/screens/fb9ccefe-4ae1-4997-a2fc-562b34b502db) · [GA — funnel table](https://mobbin.com/screens/557e0f62-e958-4b13-9be6-09930a6e76e2) · [Hotjar — funnel](https://mobbin.com/screens/cdfb4fbd-9f44-4c6c-8cb9-6313d3509c2d) · [Amplitude — funnel](https://mobbin.com/screens/6c9ff58e-4bfa-4587-830e-bf121f7012f0) · REJECT [Mixpanel — flow](https://mobbin.com/screens/0cec5a50-8faa-4b02-8b13-d41e49f7739b) · REJECT [Squarespace — 125% step](https://mobbin.com/screens/3bde9ad6-c169-4bfb-bf23-a0f21090d263)

### Pattern: Cohort retention heatmap table
**Decision:** ADOPT (plus small-sample warning — Codi addition).
**Evidence:** [Amplitude — retention](https://mobbin.com/screens/7648da25-93cb-4635-b732-ab40a34c4d39) · [Zoho — cohort](https://mobbin.com/screens/e3827f36-4c70-434a-b2f3-c50801d324d5)

### Pattern: Status breakdown — few-segment stacked bar with counts/amounts
**Decision:** ADOPT; REJECT many-segment legends and empty 100% bars.
**Evidence:** [Asana — stacked columns](https://mobbin.com/screens/df697084-bdfe-4b0f-87c6-c1052668f38a) · [Zoho — stage bars](https://mobbin.com/screens/678fc8d5-9394-45a8-a8c3-cabafb7f7aed) · [Stripe — revenue recovery](https://mobbin.com/screens/a35ca351-394d-47f0-b96f-5e5cb6356bfb) · [HoneyBook — finance](https://mobbin.com/screens/db0408d8-b02f-48b3-9bb4-c9df51b7d710) · REJECT [Attio — 10+ segments](https://mobbin.com/screens/a991adfe-355d-4271-a336-ee2f42a6b02d) · REJECT [Xero — empty 100% bars](https://mobbin.com/screens/0bddb96f-24cc-4e78-ab43-5f01014e6221)

### Pattern: Operational health tiles + latency line; SLA table
**Decision:** ADAPT (queue-age widget has no reference).
**Evidence:** [Sentry — backend](https://mobbin.com/screens/7f86dfa1-1374-48a4-82cc-80a41f400fe6) · [WRITER — observability](https://mobbin.com/screens/32414e6a-da6f-44d3-bf38-bcf415fb544f) · [Better Stack — uptime table](https://mobbin.com/screens/a6fefc36-f40b-4a53-9bd9-f1199becd668)

### Pattern: Ranked breakdown as sortable table with inline bars and total row
**Decision:** ADOPT; REJECT bar-only lists.
**Evidence:** [Square — best sellers](https://mobbin.com/screens/6694954f-fba3-4e09-9111-938f1c1fbcb8) · [Etsy — inline bars](https://mobbin.com/screens/4dd27d13-28fd-41e9-aa68-2031480d97c2) · [Shopify — bars with %](https://mobbin.com/screens/2a263161-8c84-4bc8-a954-e0b43944222e)

### Pattern: Coupon performance with revenue
**Decision:** ADOPT; REJECT lists without revenue.
**Evidence:** [Etsy — offers](https://mobbin.com/screens/ffbe94ce-ef9a-4cdc-b120-99868002a2fb) · [Square — coupons](https://mobbin.com/screens/4c2ca67f-dadf-4aba-9a97-cb733cea0ea7) · REJECT [Shopify — discounts list](https://mobbin.com/screens/05b6a6f2-ca78-4414-9089-99598fb7fcd2)

### Pattern: Attention cards — one count, one status, one CTA
**Decision:** ADOPT.
**Evidence:** [Deel — action required](https://mobbin.com/screens/d784bbd9-d9ff-4f4b-be16-20eca82fb631) · [Whop — balance alerts](https://mobbin.com/screens/d2dc6a3b-a4e9-4fad-b194-0ce8eb652855) · [Stripe — failed payments](https://mobbin.com/screens/54ef3db8-2b9e-4ef3-a91a-cad15de1e1c9)

### Pattern: Personal stats — KPI row + weekly chart; calendar with streak
**Decision:** ADAPT KPI row + weekly bars (goal line is a Codi addition); ADOPT month calendar with streak; ADAPT year grid with legend.
**Evidence:** [Duolingo — stats](https://mobbin.com/screens/6ff49359-fff4-4ea2-97f2-50097b0873ac) · [Uxcel — dashboard tiles](https://mobbin.com/screens/d273fc61-9308-48f1-939b-342ca762450d) · [Babbel — streak calendar](https://mobbin.com/screens/ad647d91-f092-4ed4-a039-85a60844534a) · [Duolingo — streak calendar](https://mobbin.com/screens/cbf23116-bb58-46e7-bbe9-c8d207ea8ac2) · [Cursor — usage grid](https://mobbin.com/screens/5e0de5f5-a660-4a26-b8fd-ec6cdda7a002)

### Pattern: Mastery as sorted horizontal bars (no radar); score trend with threshold
**Decision:** ADAPT bars + text stops + diagnostic ghost marker (marker is a Codi addition); REJECT radar; ADOPT trend + summary tiles; ADAPT single-quiz donut.
**Evidence:** [Codecademy — skills](https://mobbin.com/screens/597bbefb-e6cf-401c-abc6-47789b29e5b7) · [Kajabi — module progress](https://mobbin.com/screens/1227af09-4d68-457a-a7ea-a5596e2c3e4f) · [Gumloop — score dashboard](https://mobbin.com/screens/0440caa1-ffd2-4ce7-aa2d-60ec7135b3f1) · [Gemini — quiz donut](https://mobbin.com/screens/860b3000-a0b9-4b09-b8ed-f8d0e4a0be9f) · REJECT [Uxcel — radar](https://mobbin.com/screens/c8fcc4c3-061d-4280-90d5-4600ac48bf53)

### Pattern: Layered prerequisite graph with path highlight and side panel
**Decision:** ADAPT (zoom + path highlight together has no reference); REJECT free-form/3D clusters.
**Evidence:** [Unity — prerequisite tree](https://mobbin.com/screens/d38cb5ea-aa49-49a6-b21d-27ab515bfe8a) · [Brilliant — prerequisite chain](https://mobbin.com/screens/34856cb4-4cb0-4248-ab60-d1d4bf64b665) · [Codecademy — builds toward](https://mobbin.com/screens/d5c43b15-4d4b-4c10-9eaf-33d1e9533e44) · [Twingate — layered graph + zoom](https://mobbin.com/screens/e936e96e-ccc9-45a6-8e1f-18e78d308cac)

---

## 9. Visual / Interaction Reference Board

Reference board, not a cloning brief. Keep Codi's own visual system (§2.4).

| Our screen/state | Reference | What to study | Usage |
|---|---|---|---|
| S01 Catalog | [Coursera filtering](https://mobbin.com/flows/d797e8f0-4061-4d09-8721-edf5cbe6af59) | filter rail, chips, count, sort | Adopt |
| S01 No results | [Uxcel filtering](https://mobbin.com/flows/6f01f893-2d97-406b-844e-8ebfebf879d0) | empty state keeping context | Adapt |
| S02 Detail | [Uxcel course detail](https://mobbin.com/flows/36718b1f-a152-4edd-a159-85591ee60bba) | sticky purchase card | Adopt |
| S02 Owned | [Codecademy Resume course](https://mobbin.com/screens/aa6ef33d-ae53-4d25-a06a-5f53d3ccd9bb) | CTA swap + progress | Adopt |
| S02 Reviews | [Skillshare class detail](https://mobbin.com/flows/56ed6c36-ffbb-42f8-b65c-be29ee1c9b82) | rating summary bars | Inspiration |
| S03 Sign-in modal | [Etsy sign-in modal](https://mobbin.com/screens/2419f90e-affc-42d5-8d45-63d838fdb41a) | overlay hierarchy, remember me | Adapt |
| S04 OTP | [Visual Electric](https://mobbin.com/flows/29512f87-6b92-403f-8256-c2bc4e905808) | boxes, resend countdown | Adopt |
| S04 Reset | [Cal.com reset](https://mobbin.com/flows/85b263b0-d4a2-4d70-8ebc-34d5b9af7fcf) | neutral confirmation, spam hint | Adopt |
| S05 Cart | [SuperHi cart](https://mobbin.com/flows/eaee84e0-af85-4beb-9000-6886ae54489f) | in-place state, summary | Adapt |
| S05 Voucher error | [Instacart invalid code](https://mobbin.com/screens/0db66561-4677-427d-bca7-0fd0d8aa4985) | inline error by field | Adopt |
| S06 Bank fields | [Coinbase bank details](https://mobbin.com/screens/a6b0d118-6e54-4014-bd4c-d941a5e2ca4a) | per-row copy | Adapt |
| S06 Awaiting | [Deel payment detail](https://mobbin.com/flows/57b0f984-4d02-44d8-8412-c50debd259c8) | status tracker | Adapt |
| S06 Failed | [Revolut deposit failed](https://mobbin.com/screens/082268c6-c6b1-42c6-8997-84561d5b9488) | retry + alternative | Adapt |
| S07 Success | [SuperHi purchasing](https://mobbin.com/flows/2beec792-83c7-4490-ab76-6e318dd1d884) | single primary next step | Adapt |
| S08 Goal | [Duolingo onboarding](https://mobbin.com/flows/2c317632-13c2-4313-9977-98ac58c0d9d4) | one question/screen, tiers | Adopt |
| S09b Question | [Duolingo quiz](https://mobbin.com/flows/8452ec62-d745-4a7d-a6f0-f2b4d36755ba) | skip slot placement | Adapt |
| S09c Result | [Gemini quiz](https://mobbin.com/flows/07fcf0de-3b98-4211-90c4-054e6228bafb) | right/wrong/skipped + strengths | Adopt |
| S10 Path | [Unity pathway](https://mobbin.com/flows/a98d5441-3bcf-4657-ba53-78ec54a7d9a4) | row status markers, prerequisites | Adopt |
| S10 Current node | [Brilliant path](https://mobbin.com/flows/31d30598-6bfd-4141-9764-18b8c7c5d9f6) | popover on current item (for "Vì sao?") | Inspiration |
| S11 Player | [Coursera mark complete](https://mobbin.com/flows/b49d7e17-aabd-490a-9293-3b14318e4fe7) | sidebar checks, CTA under content | Adopt |
| S11 Long reading | [Circle lesson](https://mobbin.com/flows/c82f2862-f440-437e-98a6-bf136eb615e6) | sticky bottom complete CTA | Adapt |
| S11a AI panel | [Codecademy AI assistant](https://mobbin.com/screens/6ed109af-109a-4feb-86de-834255dc7589) | scope list, chips | Adopt |
| S11b Q&A | [Skillshare discussion](https://mobbin.com/flows/bf3f7a1e-b975-4ca7-b4bb-bf0f0e9c5695) | teacher badge, composer | Adopt |
| S11c Quiz result | [Codecademy quiz](https://mobbin.com/flows/b192900c-261e-4393-be74-b1926ffd8abf) | score ring, answer review | Adopt |
| S11d Graded | [Coursera assignment](https://mobbin.com/flows/43d051c3-eb5e-4aaa-96c8-2a0202e0e964) | grade banner, submit gating | Adapt |
| S11e Next | [Replit lesson complete](https://mobbin.com/flows/bbe22c41-e24b-43b3-a146-4de331ec14a1) | "Next:" bar | Adapt |
| S11f / S14 Review | [Coursera rating](https://mobbin.com/flows/d96738cf-f47a-494c-88b1-57402164db45) | inline stars → modal | Adopt |
| S12 Home | [Coursera home](https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06) | continue card | Adopt |
| S13 Progress | [Codecademy My learning](https://mobbin.com/flows/977fbb26-9111-4ac9-87ab-dc2335dd8238) | accordion with inline scores | Adopt |
| S21 Create | [Teachable with AI](https://mobbin.com/flows/27398767-cfeb-4547-83c5-82d4fd3d8235) | minimal single form | Adapt |
| S22 Curriculum | [Kajabi add lesson](https://mobbin.com/flows/1b660adb-90fc-4d2a-96df-2b9b7c6d6c18) | typed add menu | Adopt |
| S22 Reorder | [Teachable reorder](https://mobbin.com/flows/b97483d0-d597-41ac-b236-cb2e29267b8c) | drag handles | Adopt |
| S23 Quiz builder | [Podia quiz](https://mobbin.com/screens/583946a2-c81d-497b-ab3e-a2392cfe09d9) | right/wrong marking, validation | Adopt |
| S23 Settings | [Circle quiz settings](https://mobbin.com/screens/1a1022a9-5a99-4ea5-b935-d729af048fa9) | passing grade panel | Adopt |
| S24 Knowledge map | [AirOps recommendations](https://mobbin.com/screens/ae0f151a-f195-43ba-9f2f-9c3ff74bfa10) | accept/decline per item + all | Adopt |
| S25 Publish | [Teachable publishing](https://mobbin.com/flows/ca328d45-4fee-42c1-925b-ff8e298dc4b8) | requirement cards | Adapt |
| S26 Grading | [ClassDojo approving](https://mobbin.com/flows/67096453-158a-4b59-8633-21fcb4684817) | split view, decision rail | Adapt |
| S27 Q&A inbox | [Plain threads](https://mobbin.com/flows/124aa3cf-b8a7-4592-8363-5c35a93b410c) | counted views, chips | Adopt |
| S28 Reviews | [DoorDash respond](https://mobbin.com/flows/33574bc7-31b0-42b3-8e55-42fc06d0ffb0) | side sheet, "Responded" state | Adapt |
| S29 Learner progress | [Whop analytics](https://mobbin.com/flows/e4ba85cb-25c1-4bb0-8308-e07c3c64af00) | stat row, per-question table | Adopt |
| S30 Admin home | [Midday home](https://mobbin.com/screens/2ccaa357-1ff9-45de-82d2-84ac36fff008) | count tiles tied to actions | Adopt |
| S31 Deactivate | [Apollo deactivate](https://mobbin.com/screens/a071c333-bcc8-414d-9965-f8009bc215a6) | consequence copy | Adopt |
| S32 Queue | [Reddit mod queue](https://mobbin.com/screens/ef1ae11f-e221-43cf-84d4-a723ad7ae8c0) | split view, reason on reject | Adopt |
| S34 Orders | [Mercury transactions](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4) | drawer with timeline | Adopt |
| S34 Export | [Airwallex transactions](https://mobbin.com/screens/ab0fb2f3-875c-4c61-8c9c-79147f0c63b1) | filter row + export | Adopt |
| S35 Voucher form | [Podia coupon](https://mobbin.com/screens/35ec0b67-2f42-489e-b4f6-a4435cc98751) | radio-based options | Adopt |
| *Rev. 12/10* S01 Typeahead | [Codecademy typeahead](https://mobbin.com/screens/2b9a141c-e9b8-4b10-8372-b05cae81ef2e) | grouped results with type badge | Adopt |
| S01 Sort | [Coursera sort](https://mobbin.com/screens/69ce3b55-5d49-4115-a760-805d564b1db4) | sort dropdown placement | Adapt |
| S01 Reset filters | [Navan no results](https://mobbin.com/screens/6bc2afe2-79b4-4db9-b1b9-3af07bee20fc) | reset button beside active chips | Adopt |
| S02 Typed syllabus | [Codecademy syllabus](https://mobbin.com/screens/65d1c885-4c6a-4bef-9352-debb3079a883) | icon + label per row | Adopt |
| S03 Gated OTP | [Shop checkout OTP](https://mobbin.com/flows/a0e48128-6481-47ca-9f84-8cfac24fabaf) | context kept beside OTP | Adapt |
| S05 Remove item | [Netflix undo](https://mobbin.com/screens/5211d5f6-c653-4210-aead-047adec26c9a) | undo toast copy | Adopt |
| S06 Countdown | [Airwallex QR expiry](https://mobbin.com/screens/6a4d4b1e-814c-4e05-993a-c64050080647) | timer under code | Adapt |
| S06 Problem + support | [Navan error](https://mobbin.com/screens/2931d92d-1799-496d-be62-7043c18bb14d) | support as secondary action | Adapt |
| S08b Start fork | [Duolingo onboarding](https://mobbin.com/flows/2c317632-13c2-4313-9977-98ac58c0d9d4) | two consequence cards | Adapt |
| S10/S12 Re-prompt | [Docusign skip](https://mobbin.com/screens/c0248abe-0324-4739-83e6-cbc310da9912) | "you can return" copy | Adopt |
| S12 Weekly goal | [Coursera home](https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06) | 7-day goal tracker | Adopt |
| S11g Exercise | [Codecademy exercise](https://mobbin.com/screens/3b69dfaf-134d-4dfa-a16b-23365bb47ae0) | 3 panes, hints | Adopt |
| S11g Run keycap | [Browserbase playground](https://mobbin.com/screens/118eaf24-c380-4f66-818b-8813c59361f5) | shortcut on button | Adopt |
| S11g Test results | [Postman test run](https://mobbin.com/screens/17ad05ba-4835-4c81-8a18-1223ebc6cd25) | summary + filter tabs | Adopt |
| S24 Graph | [WRITER canvas](https://mobbin.com/screens/01f1bee3-2286-4ca5-9a86-a37c5b1fd0e0) | selected-node side panel | Adapt |
| S24 Cycle error | [Copy.ai validation](https://mobbin.com/screens/47d1e096-404f-450e-86f0-b216e2de6388) | node marking + named banner | Adapt |
| S24 Accept all | [Jira bulk step](https://mobbin.com/screens/04674b74-506d-4bf1-82e4-606c4a540ab2) | count summary before confirm | Adopt |
| S26 Snippets | [Plain snippets](https://mobbin.com/screens/4466bdeb-e7c0-4953-8a92-bd9e11afe69b) | picker in composer | Adopt |
| S26 History tabs | [Relevance AI tabs](https://mobbin.com/screens/51d36016-afbe-4935-842d-6b96b05174b0) | tabs with counts | Adapt |
| S31 Impact dialog | [Coda delete account](https://mobbin.com/screens/43079a19-7b46-40de-b67e-da226f4a0372) | counts + checkbox gate | Adapt |
| S31 Filters | [Airwallex users](https://mobbin.com/screens/68139aeb-25be-42b6-9a06-2e5643106bb5) | status counts as filters | Adapt |
| S32b Preview | [Teachable preview](https://mobbin.com/screens/c04c0023-2365-4741-9dc9-4592f491c7ea) | persistent preview bar | Adopt |
| S34 Export | [Stripe export](https://mobbin.com/screens/8f736fe0-96d7-4c56-a2d5-a9156acc3c1e) | date presets, timezone, columns | Adapt |
| *Rev. 12/10 b* S36/S37 header + KPI | [Navattic analytics](https://mobbin.com/screens/a5be5a57-9c24-49a2-9ce5-ccd5edc17a1b) | range + compare, delta tiles | Adopt |
| S36 A3 / S37 B5 Funnel | [GA funnel](https://mobbin.com/screens/fb9ccefe-4ae1-4997-a2fc-562b34b502db) | step bars + rate table | Adopt |
| S36 A4 Cohort | [Amplitude retention](https://mobbin.com/screens/7648da25-93cb-4635-b732-ab40a34c4d39) | heatmap table | Adopt |
| S36 A7 Pipeline | [Zoho stage bars](https://mobbin.com/screens/678fc8d5-9394-45a8-a8c3-cabafb7f7aed) | stacked bar with counts | Adopt |
| S36 A8/A9 Health | [Sentry backend](https://mobbin.com/screens/7f86dfa1-1374-48a4-82cc-80a41f400fe6) | health tiles + latency | Adapt |
| S37 B2 Revenue | [Midday revenue](https://mobbin.com/screens/aa756fb8-9d04-4778-9480-82e847c94516) | current/previous/average | Adapt |
| S37 B3 Ranking | [Square best sellers](https://mobbin.com/screens/6694954f-fba3-4e09-9111-938f1c1fbcb8) | table + inline bars | Adopt |
| S37 B4 Status | [Stripe recovery](https://mobbin.com/screens/a35ca351-394d-47f0-b96f-5e5cb6356bfb) | status tiles + stacked bars | Adapt |
| S37 B7 Vouchers | [Square coupons](https://mobbin.com/screens/4c2ca67f-dadf-4aba-9a97-cb733cea0ea7) | redemption + revenue columns | Adopt |
| S37 B8 Attention | [Deel action required](https://mobbin.com/screens/d784bbd9-d9ff-4f4b-be16-20eca82fb631) | count + CTA cards | Adopt |
| S13b C1/C2 | [Duolingo stats](https://mobbin.com/screens/6ff49359-fff4-4ea2-97f2-50097b0873ac) | KPI row + weekly chart | Adapt |
| S13b C3 | [Babbel streak calendar](https://mobbin.com/screens/ad647d91-f092-4ed4-a039-85a60844534a) | calendar + streak | Adopt |
| S13b C4 | [Codecademy skills](https://mobbin.com/screens/597bbefb-e6cf-401c-abc6-47789b29e5b7) | sorted mastery bars | Adapt |
| S13b C5 | [Gumloop scores](https://mobbin.com/screens/0440caa1-ffd2-4ce7-aa2d-60ec7135b3f1) | trend + summary tiles | Adopt |
| S24 / S13c Graph | [Unity prerequisite tree](https://mobbin.com/screens/d38cb5ea-aa49-49a6-b21d-27ab515bfe8a) | layered prerequisites | Adapt |
| S24 / S13c Zoom | [Twingate layered graph](https://mobbin.com/screens/e936e96e-ccc9-45a6-8e1f-18e78d308cac) | zoom + filters | Adapt |
| *Rev. 12/10 c* S17 Landing | [Linear AI task cards](https://mobbin.com/screens/12fc9c16-9010-423f-9ea7-0b5a1567880e) | task cards + starters | Adapt |
| S17 Intake | [Codecademy intake](https://mobbin.com/flows/9e0051c2-a775-4a37-adcd-a9649df80a60) | one question + chips | Adopt |
| S17 Course cards | [Shop inline cards](https://mobbin.com/screens/587a9d1f-4092-4167-9bea-7eb3ebad9df4) | card anatomy + CTA | Adapt |
| S17 Compare | [ChatGPT comparison](https://mobbin.com/screens/2efc61d6-cd10-45b0-9649-9f120fdd5697) | attribute rows × courses | Adapt |
| S11a' Inline toolbar | [Magnific toolbar](https://mobbin.com/screens/3fb76c75-fcb5-4ea9-8338-2a309c0fa916) | selection actions | Adapt |
| S11a Diff | [Graphite apply](https://mobbin.com/screens/88f81a55-bfa9-450c-b106-2ffd76e94f6a) | apply/close changes | Adopt |
| S11a Tutor voice | [MasterClass Class TA](https://mobbin.com/screens/cca209b4-b227-4c53-9837-a4e3ca064afb) | Socratic + lesson ref | Adopt |
| S11a Chips | [Ferndesk chip](https://mobbin.com/screens/5eb452b6-b4f1-4594-ad7e-9a9ca9abd734) | removable context | Adopt |
| S11a / S17 Stop | [Perplexity thinking](https://mobbin.com/screens/2460ef6c-5f63-45c8-8f73-8e95f3d904b7) | thinking + stop | Adopt |

---

## 10. Product Decisions

Intentional unless an Open Question below overrides them.

1. The learner journey is one continuous loop; no screen may end in a dead end or "Sắp ra mắt".
2. A dedicated `/cart` page exists; checkout is reached only from the cart (or a "Mua ngay" shortcut that goes through the same checkout).
3. Course CTAs always reflect ownership state (not owned / in cart / pending payment / owned / free).
4. Guest gating uses an overlay sign-in and resumes the original action.
5. Checkout shows VietQR **plus** copyable bank fields; the transfer content is the most emphasised field.
6. Payment progress is shown as a 3-step tracker; leaving the page never loses the order.
7. Payment success never auto-redirects; its primary action is "Bắt đầu học", which leads to goal setup for a course without a path.
8. Goal setup precedes the diagnostic, one decision per screen, 2–3 steps.
9. The diagnostic is untimed, shows question count and estimated time up front, and offers "Tôi chưa biết" as a distinct answer.
10. Diagnostic result shows per-concept mastery using the existing 5-stop scale with text labels.
11. The personal path is a **list grouped by chapter** (not a decorative map); each lesson shows status, mastery and an AI-written reason.
12. Prerequisite order is never violated in the UI; locked items say which prerequisite is missing.
13. If AI path generation fails, the learner studies in default order — never blocked.
14. The lesson player has a path sidebar, a visible lesson checklist (study → quiz → assignment), and "Hoàn thành bài học" enabled only when the checklist is satisfied. Assignment *submission* (not grading) satisfies it.
15. No auto-advance between lessons; after completion show what changed in the path and the next recommended lesson.
16. AI assistant and lecturer Q&A are side panels inside the player; the AI panel declares its context and shows a fallibility disclaimer.
17. Quiz submit warns about unanswered questions; results show your answer vs correct answer.
18. Review prompt appears at course completion; stars required, text optional; lecturer replies are public under the review.
19. Learner home leads with "Tiếp tục học"; progress & results is the single place for scores, grades and feedback.
20. Lecturer creates a course with a minimal form; it starts as Bản nháp.
21. The entry-test flag is a quiz setting.
22. AI knowledge-map output must be reviewed (accept/edit/decline) by the lecturer before it is used.
23. Publication uses a requirement checklist; submit is disabled until every requirement passes.
24. Course statuses: Bản nháp · Chờ duyệt · Bị từ chối (with reason) · Đã xuất bản · Đã ẩn (with reason).
25. Grading is a split view with score + feedback and next-submission navigation; no bulk grading.
26. Lecturer and admin homes are built from actionable count tiles that link to filtered queues.
27. Admin rejection, course hiding and user deactivation require a reason and a consequence-stating confirmation.
28. Price is set by the Admin, inside the publication review pane and on the published-course list.
29. Header navigation becomes role-aware.
30. Remaining English UI strings ("Type your message...", "Thinking...", "(Dashboard)", "(Profile)", "(Setting)") are replaced by Vietnamese.

*Added 2026-10-12 (prototype audit + Mobbin round 2):*

31. **The diagnostic never gates learning.** After goal setup the learner chooses "Học từ bài 1" (default order, immediately open) or "Tìm điểm bắt đầu của tôi" (recommended). The diagnostic can be taken later from course home / learner home. *(Replaces open question Q7.)*
32. A gated action always returns the user to the same page with the action completed and visibly confirmed (toast + badge), including after registration + OTP.
33. Checkout always shows: countdown under the QR, copyable bank fields as text fallback, "Tôi đã chuyển khoản" manual check, and on every problem state the `CODI#####` reference + a support entry.
34. Reversible self-actions use undo toasts; actions affecting others or money use consequence dialogs (§7.17).
35. Catalog has a sort dropdown and a grouped typeahead; the zero-result state has one-tap "Đặt lại bộ lọc".
36. Syllabus rows show lesson type with icon + text label.
37. Learner motivation = weekly goal (from the onboarding time commitment) + study-day streak shown inside it + skill badges earned when a concept reaches "Thành thạo". No XP, leagues, leaderboards or daily quests. *(Q26 resolved 2026-10-12: add.)*
38. Coding exercises are in scope (UC **Submit Coding Exercise**, added to the UC model): authored by the lecturer with test cases, auto-graded by tests passed, a precondition of completing the lesson when present; run with Ctrl/⌘+Enter (shown on the button); failed tests show Input / Expected / Received. *(Q24 resolved.)*
39. Knowledge map offers graph (default since decision 43) and list views; a cycle is reported by naming the loop and highlighting it; "Chấp nhận tất cả" shows a count summary first.
40. Grading has Chờ chấm / Đã chấm tabs, edit from history, and saved feedback snippets. Scoring stays one submission at a time (decision 25) unless Q25 changes it.
41. Admin can preview a course in the learner role before approving; deactivation lists concrete impact with counts; users have status/role quick filters with counts; orders export via a dialog with date range, timezone and columns — **CSV only** (Q28 resolved).
42. Course detail offers **"Mua ngay"** (primary) next to "Thêm vào giỏ" (secondary). "Mua ngay" creates a single-course order and goes straight to checkout; the cart is left unchanged. In the UC model this is an alternate flow of Purchase Course. *(Q27 resolved.)*

*Added 2026-10-12 (b) — analytics:*

43. The lecturer's knowledge map opens as a **visual layered graph** by default; the list is the secondary, accessible view.
44. Learners get a read-only **"Bản đồ kiến thức của tôi"** (graph coloured by mastery + text labels) on course home.
45. Learners get a separate **"Thống kê học tập"** page with charts C1–C6 (Tổng quan C1–C4, "Xem chi tiết" C5–C6).
46. Admin gets two analytics pages: **"Quan sát hệ thống"** (A1–A9) and **"Tài chính"** (B1–B9). All widgets are kept; each page shows a Tổng quan subset first and "Xem chi tiết" for the rest; every card can open its own detail view with table + CSV.
47. Lecturer "Tiến độ học viên" reuses the learner chart types (mastery bars, score trend) aggregated per course.
48. Default analytics period is **30 ngày**, compared with the previous period. *(Resolves Q13.)*
49. In C4 and the learner knowledge map, concepts the learner skipped (AI-marked skippable) show the diagnostic estimate with the label "ước tính" until a quiz/exercise measures them. *(Q32.)*
50. Lecturers get **"Doanh thu khóa học của tôi"** in their workspace: B1 (gross/net revenue, paid orders, discount given), B2 revenue over time and B3 revenue by course — filtered to courses they teach; no other lecturers' data, no reconciliation cards, no export of buyer details. *(Q33.)*

*Added 2026-10-12 (c) — AI advisor & tutor:*

51. The in-lesson AI is a **tutor with a 3-step hint ladder** (hướng nghĩ → chỉ chỗ sai → khung cách làm), Socratic first, never the full solution. Hint usage is **visible to the lecturer and never affects scores**.
52. AI can propose **small code changes (≤ ~3 lines) the learner may apply** into their editor (Áp dụng / Bỏ qua / Hoàn tác, then "Chạy lại test").
53. AI entry points live in the content: selection toolbar (text & code), "Giải thích lỗi này" on console errors, "Vì sao test này chưa đạt?" on failed tests; context shown as removable chips; one thread per lesson.
54. The `/ai` advisor answers with course cards, comparison tables and a suggested course order inside the answer; **saving a multi-course roadmap is out of scope**.
55. **Guests may use `/ai`**; personalisation (owned courses, progress, saved profile) only after sign-in. Intake answers are saved to the profile and reused by onboarding.
56. **"Hỏi giảng viên"** from the AI tutor opens a **private message conversation** with the course lecturer, pre-filled with the AI context; multi-message, resolvable, reopenable; lecturer handles it in the Q&A inbox. (Maps to UC Post Course Question / Answer Course Question — a thread rather than a single answer.)


---

## 11. Assumptions & Open Questions

### Confirmed (repo or UC model)
- VietQR bank transfer confirmed by webhook; transaction statuses pending/paid/failed/cancelled/refunded exist in data.
- Lesson = video, PDF/slides, reading + optional quiz and assignment (UC note).
- Preconditions: goal → diagnostic; study + quiz + assignment → complete lesson.
- AI: generate path once after entry test; update after each completed lesson; prerequisite order is hard; reasons are written; BKT computes mastery; AI never initiates.
- Diagnostic = lecturer-authored quiz flagged as entry test.
- Admin owns price; publication completeness = price + description + ≥1 lesson; admin review is separate.
- Existing design system, mastery scale rule and form conventions.

### Evidence-backed recommendations
- Patterns in §8 marked ADOPT/ADAPT (filter chips, sticky purchase card, continue card, per-field copy, tracker, one-question onboarding, skip-as-distinct, list path with status, sidebar player, AI scope panel, instructor badge, accept/decline AI output, split-view grading and moderation, count tiles, consequence dialogs, coupon radios).

### Assumptions (inferred, no strong evidence)
- **A1** Cart supports multiple courses in one order (current checkout is per course).
- **A2** "What changed in your path" summary after completion — Codi-specific; no Mobbin precedent.
- **A3** Payment success leads into goal setup rather than the dashboard.
- **A4** Lecturer must confirm the knowledge map before publication can be requested.
- **A5** A course needs an entry-test quiz to be publishable (otherwise personalisation cannot run).
- **A6** One entry test per course.
- **A7** Assignment submission (not grade) satisfies lesson completion.
- **A8** Pending orders older than a threshold are shown to admins as "needs attention".

### Open questions (need a human decision)
- **Q1** Price is required for the lecturer's completeness check but owned by Admin. Options: (a) lecturer proposes a price, admin confirms; (b) move the price check to admin approval; (c) admin sets price before the lecturer can submit. *Recommendation: (a).*
- **Q2** Multi-course orders and one QR for the whole cart — yes/no?
- **Q3** Free courses: direct "Đăng ký miễn phí" without cart/checkout? (API currently rejects free courses at checkout.)
- **Q4** Payment code expiry duration, and whether an expired QR can still be honoured if paid late.
- **Q5** Underpayment / overpayment / wrong transfer content handling and support channel.
- **Q6** Exact learning-goal options and time tiers.
- ~~**Q7** Can a learner skip the diagnostic?~~ **Resolved 2026-10-12: yes** — see decision 31. Follow-up: how often to re-prompt, and does the UC spec need an alternate flow "Study in default order" for Generate Personalized Learning Path?
- **Q8** Prerequisite-locked lessons: hard lock or "học trước bài X" warning with override?
- **Q9** Quiz retakes: unlimited, limited, cooldown? Which attempt counts for BKT?
- **Q10** Assignment resubmission after grading allowed?
- **Q11** Can a course with enrolled learners be deleted, or only hidden?
- **Q12** Editing a published course: do changes need re-review; is the editor read-only while "Chờ duyệt"?
- ~~**Q13** Admin KPI set and time ranges.~~ **Resolved** — decisions 46, 48 (A1–A9, B1–B9, default 30 ngày).
- ~~**Q32**~~ **Resolved: yes** — mastery of AI-skipped concepts is shown from the diagnostic estimate, labelled "ước tính" (decision 49).
- ~~**Q33**~~ **Resolved: yes** — lecturers see revenue of their own courses only (decision 50).
- **Q14** When a course is hidden, do existing learners keep access?
- **Q15** Is the deactivation reason mandatory, and is it shown to the user?
- **Q16** Voucher scope: all courses, specific courses, specific lecturers? Per-user limits? Stacking?
- **Q17** Which events generate notifications; is email also used?
- **Q18** Final labels for role-aware header items.
- **Q19** Refund policy text for the purchase card (if any).
- **Q20** Does public Q&A need "resolved" in addition to "answered"; can other learners see/answer questions? *(Private lecturer conversations already have "Đã giải quyết" — decision 56.)*
- ~~**Q34**~~ **Resolved: no** to all — no public sharing, no expected reply time, lecturer cannot close without replying.
- **Q21** Should the lesson sidebar show the personalised order, chapter order, or let the learner toggle?
- **Q22** Can a learner change their goal later, and does that regenerate the path?

*Added 2026-10-12:*
- **Q23** Free preview lessons for guests ("Học thử"): which lessons, who marks them (lecturer per lesson?), does preview require sign-in? The data model has no preview flag yet.
- ~~**Q24** Coding exercise in scope?~~ **Resolved: yes.** New UC "Submit Coding Exercise" (Learner), coding exercises added to Course Content (Lecturer), AI assistant may explain failed tests but never grades. See decision 38.
- **Q25** *Conflicts with decision 25.* Audit asks for batch grading. Options: (a) keep one-at-a-time scoring, add snippets + "Bài tiếp theo" (current); (b) allow bulk actions only for non-scoring work (export, mark viewed, apply the same snippet); (c) full batch scoring for identical rubric results. *Recommendation: (b).*
- ~~**Q26** Streaks & badges?~~ **Resolved: add** — study streak + concept-mastery skill badges, no XP/leagues. See decision 37. Follow-up: does a streak need a "freeze"/grace day?
- ~~**Q27** "Mua ngay"?~~ **Resolved: add.** See decision 42.
- ~~**Q28** Export format?~~ **Resolved: CSV only.** Follow-up: required columns for the accountant.
- **Q29** Automatic content checks before admin review (copyright / sensitive keywords) — wanted, and is it advisory or blocking?
- **Q30** When a lecturer edits a past grade, is the learner notified and is the old grade kept in history?
- **Q31** Homepage secondary CTA "Cách Codi xếp lộ trình cho bạn" (audit) — explainer page, section, or video?

---

## 12. Non-goals

- Production architecture, database/API design, component implementation, CSS or design tokens (a separate `DESIGN.md` will follow).
- New visual branding — the existing design system stays.
- Payment methods other than VietQR bank transfer; refunds UI for learners.
- Native mobile apps (responsive web only).
- Certificates, XP, leagues, leaderboards, daily quests, social feeds, live classes, subscriptions. *(Streaks and skill badges were moved into scope on 2026-10-12 — decision 37.)*
- Automated copyright / sensitive-content scanning of lecturer content (pending Q29).
- Technical defects found by the audit that are not UX decisions (e.g. missing `favicon.ico` 404) — tracked as engineering issues.
- Lecturer payouts/revenue sharing; lecturer-set pricing.
- How BKT or the ranking algorithm works internally — only how its output is presented.
- Changing the existing account/auth flows beyond the refinements listed.
- Saving multi-course roadmaps from the `/ai` advisor (decision 54); the advisor itself is in scope (Flow L13).
- General learner ↔ lecturer direct messaging outside a course lesson (conversations exist only as lesson-linked escalations, decision 56).
