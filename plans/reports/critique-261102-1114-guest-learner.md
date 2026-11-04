# Critique: guest and learner routes (revision 2)

Scope: guest, learner (`usr-learner-001`), and the lecturer-as-owner view of the React course. Read-only review; no project files edited, no servers started.

Captures: `C:/Users/LENOVO/AppData/Local/Temp/claude/d--CODE-Study-FPT-Ki-5-SWP391/c9ca5ad5-12fa-4969-93ea-67fd3d672e1a/scratchpad/e2e/guest-learner/` (full-page, 1440 and 390, light and dark; index `_index.txt`) and `.../e2e/gl2/` (viewport JPEGs for the flows below). Scripts: `gl3.js`, `gl4.js`, `gl5.js`, `gl6.js`, `gl7.js`, `gl10.js` in `.../e2e/`.

## Data created in this pass (allowed)

- React course bought through the real flow: "Mua ngay" → checkout → simulated transfer → paid. Order `order-mvyrbcgl`, enrolment for `usr-learner-001` on `course-react-001`.
- Node.js course bought the same way: order `order-mvyrkcat`, paid.
- Git course enrolled through "Đăng ký miễn phí" (free). Goal set to "Làm được dự án", 5 h/week, and "Học từ bài 1" chosen.
- A test registration was started for `otp-test@example.invalid` and stopped at the OTP step. No account was completed.

## Corrections to revision 1

- React routes were gated only before the purchase. After it, the learner-side React onboarding, path and lesson pages open. Revision 1 was wrong to say they could not be reviewed.
- `lesson-react-004` is open, with a "Nên học Component trước" warning. Sidebar items after it show "Chưa đủ tiên quyết" locks.
- The choice cards are reproducible on the fork step (goal → level → hours → fork). They are not reproducible on React because its record is already `ready`. Choice-card measurements come from the Git course; the component is the same.
- The 1024, 1280 and 1440 widths give the same card widths (296 px each). The misalignment is not a width effect.

## Controller requests

### A. Choice cards (`/learn/course-git-001/onboarding`, fork step)

Measured child tops inside each card (px from card top):

| Card | Card h | Child tops |
|---|---|---|
| Học từ bài 1 (no badge) | 397 | icon 26, title 107, desc 156, note 267, button 320 |
| Tìm điểm bắt đầu (badge) | 385 | badge 26, icon 62, title 136, desc 210, note 268, button 315 |

Root cause: the "Khuyến nghị" badge is in flow on the right card only. It pushes that card's icon, title and text down about 36 px. Buttons end 5 px apart and the heights differ by 12 px. Card width is a fixed 296 px at every tested width.

Screenshots: `gl2/onboarding-fork-1024-dark.jpg`, `...-1280-...`, `...-1440-dark.jpg`.

Fix: move the badge out of the card flow (absolute on the top edge, or a row above the grid that both cards share). Give the cards a grid with `grid-template-rows: auto auto 1fr auto` so the description and button rows align.

### B. Path page after "Học từ bài 1" (`/learn/course-git-001`, same flow as React)

Screenshot `gl2/path-git-lesson1-1440.jpg`.

- Hero card, then a second "Cá nhân hoá lộ trình" banner, then tabs, then a chapter card, then a "Vì sao lộ trình này" side panel.
- Lesson 1 is marked "Bắt đầu ở đây" and "Tiếp theo" with a "Học tiếp" button in the card. The same action is repeated in the hero's "Học tiếp" panel. Two identical CTAs above the fold.
- Later lessons show "Chưa đủ tiên quyết" when prerequisites are missing, which is the locked-lesson state the controller asked about.

Critique: the page has four stacked boxes before the first lesson (hero, banner, tab bar, chapter card) and a fifth in the side column. The "Vì sao" panel repeats facts already in the hero.

### C. Lesson with AI panel open (`/learn/course-react-001/lesson-react-004`)

Measured with the AI panel open:

- At 1240 px: the lesson sidebar collapses to a "Danh sách bài học" button. The AI sheet docks at x=880, 360 px wide. The video placeholder is 812 x 500 with a play glyph in the centre and no poster or frame. The content column starts at x=34, under where the sidebar was. The video placeholder is the "big empty area" the user reported.
- Before the AI panel opens, the placeholder is at x=364, 812 px wide. Opening the panel moves it left by 330 px. The panel does not push the content; the column is simply re-flowed.
- The lesson has no "Học nội dung / Đạt quiz" stepper value other than "Chưa xong" at the top. The top bar carries four controls and a second header.

Screenshot: `gl2/lesson-react-004-ai-1240.jpg`, `gl2/lesson-react-004-1440.jpg`.

Fix: the AI panel should be an overlay drawer or a fixed right column of 340 px that the video does not reflow into. The video should be a 16:9 frame with a real poster, sized to the column. Collapse the lesson sidebar to a rail, not a button, when the drawer is open.

## Mobile overflow (lesson 470 px on a 390 px viewport)

The page is 470 px wide because of the `<li>` items in the lesson's reference list ("Tài liệu tham khảo": "Các biến — javascript.info (bản tiếng Việt)", "Các kiểu dữ liệu — …", "The Modern JavaScript Tutorial"). Those `li` elements measure 413 px wide and their right edges reach 470 px. No ancestor clips them, so they widen the page. The inline `<pre>` code blocks are not the cause: each `pre` has `overflow:auto` and stays at 324 px; the code scrolls inside its own box. The header actions are 2 px over, which is noise.

Fix: give the reference list `overflow-wrap:anywhere` (or clip the links with `min-width:0` and wrap), then re-measure. Effort: S.

## Per-page critiques

Each page is marked **[viewed]** when the screenshot was looked at, or **[text/DOM]** when the review uses extracted text and measurements.

### Guest

**1. Home `/` (Persuade) [viewed]**
1. Good bones: a left-aligned two-line headline, a hairline four-column feature row and a calm AI section already read close to SOI.
2. The "Khóa học phổ biến nhất" row is four identical boxed cards with cover, badge, title, meta and button. That is the category default.
3. The dev pill "Kịch bản thử nghiệm" sits on the feature 1 body copy ("của bạn." is clipped).

Delete: the four-card grid as the main section; one of the two AI mock blocks.
Proposed (SOI): hero left with a real product screenshot right; a statement left with evidence right; courses as a hairline list with a single featured course; one filled accent CTA, the rest ghost.
Effort: M.

**2. Courses `/courses` and course detail `/courses/react-du-an-thuc-te` (Persuade) [viewed, desktop]**
1. Catalogue is a grid of identical cards. Learner counts and durations have no provenance labels.
2. Course detail on phone is 3357 px tall. The enrol action is far from the title.
3. Cover art reads as stock next to real data.

Delete: decorative covers on list rows; keep one cover on the detail page.
Proposed: a hairline table (title, level, duration, learners, status) with a sticky buy panel on desktop and a bottom action bar on phone.
Effort: M.

**3. Login `/login` [text/DOM]**
Text shows a centred "Chào mừng trở lại!" form with email, password, "Ghi nhớ email", social sign-in. Problems: it is a generic centred card on a large empty canvas (full page 946 px); the page has no product evidence beside it; the sign-in and sign-up affordances compete with the top-bar "Đăng nhập" button.
Delete: the card border; the duplicate header CTA on the login page itself.
Proposed: a two-column split. Left: a one-line statement and one real path screenshot (dark product window). Right: the form with no card, hairline dividers between the email, password and social options.
Effort: S.

**4. Register `/register` and the OTP step [viewed, OTP]**
Viewed: the OTP step (`gl2/register-otp-1440-light.jpg`) is a centred card with a shield icon, six boxes, a 02:00 countdown, "Gửi lại mã", a disabled "Xác thực và hoàn tất" button, and a success toast. The register step (text) has Google and GitHub buttons, then the email form.
Top 3:
1. The OTP card prints the test codes on screen: "Mã đúng trong bản thử nghiệm: 123456 · 000000 = mã hết hạn". That is a prototype affordance that must be dev-only.
2. The disabled primary button is a washed-out teal that looks broken rather than waiting.
3. The register and OTP steps use different card shells; the flow does not have a stepper even though it is multi-step.

Delete: the on-screen test-code line; the shield illustration (it does nothing).
Proposed (SOI): a stepper header (Tạo tài khoản → Xác thực → Xong), the six OTP boxes left-aligned under one statement, a full-width primary button that is enabled once six digits are entered, and the resend action as a text link.
Effort: S.

**5. `/ai` (Persuade / Operate) [text/DOM]**
Text: "Tư vấn khoá học cùng AI", a short intro and the advisor chat. Not visually reviewed. Likely problem: a chat shell with no product evidence (no course list or example recommendation next to the input).
Delete: any decorative header image.
Proposed: a two-column layout, prompt input and three example goals left, a live "recommended path" list right with provenance chips (REAL for catalogue data, INFERRED for the advisor's pick).
Effort: M.

### Learner

**6. Dashboard `/dashboard` [viewed]**
Top 3:
1. "Tiếp tục học" is a clear hero card with cover, current lesson and one filled CTA. Keep it.
2. "Mục tiêu & tiến độ" is a card with a near-empty weekly bar ("1 phút / 300 phút · 0%") and a teal streak tile. The bar and the streak tile both state the same zero in two forms.
3. The right column "Cập nhật cho bạn" has three large numerals and a feedback quote. It is the best hairline-style block on the page. The dev pill overlaps the skill chips card.

Delete: the streak tile (duplicate of the weekly bar); the cover art on the continue card (keep the lesson title).
Proposed (SOI): a statement row for "Tiếp tục học" with the title in display type and the one CTA; below, a hairline list "Mục tiêu tuần" as a single number with a provenance chip; the update block stays as the right column.
Effort: M.

**7. Cart `/cart` [text/DOM]**
Text: "Giỏ hàng (1)", one item (Node.js & Express, 990.000 ₫), summary, voucher field, "Thanh toán". Not visually reviewed. The cart is a boxed item card plus a boxed summary card: two boxes for one line of data.
Delete: the item card border; a separate voucher box (fold it into the summary).
Proposed: a hairline row for the course (thumb, title, teacher, price), summary as a right-hand column with one filled "Thanh toán" button.
Effort: S.

**8. Checkout, pending order `/checkout?order=…` [viewed]**
Top 3:
1. The three-step stepper ("Đã tạo đơn" / "Đang chờ thanh toán" / "Đã nhận tiền") is a good SOI-style multi-step header. Keep it.
2. The dev pill covers the amount row ("…0.000 ₫" is hidden under it). That is a payment-critical row.
3. The QR is a plain white box with a count-down ("Hết hạn sau 29:58"). Bank details are four boxed rows with copy buttons, which is a calm table, but each row has its own card border.

Delete: the dev pill on this route; the per-row borders in the bank details.
Proposed: keep the stepper; left, the QR with a single amount line above it; right, the order summary and "Tôi đã chuyển khoản" as the only filled action; bank details as a hairline table below the QR.
Effort: S.

**9. Checkout success `/checkout/success?order=…` [text/DOM]**
Text: "Thanh toán thành công!", order id, amount, time, "Bạn đã sở hữu khóa học". Not visually reviewed. Likely problem: the success state is a centred card with no primary next step beyond what the text shows.
Delete: any confetti or decorative icon.
Proposed: a statement ("Bạn đã sở hữu Node.js & Express"), one filled "Vào học" button, the receipt as a hairline table below.
Effort: S.

**10. Settings `/settings` [text/DOM]**
Text: account info, "Sửa Hồ Sơ", "Mật khẩu & Bảo mật", "Tài khoản liên kết". Not visually reviewed. Likely problem: a sidebar nav plus stacked form cards; linked-account state competes with the password section.
Delete: duplicate "Sửa Hồ Sơ" entry points.
Proposed: a single left nav of sections; each section a hairline block with its form; linked accounts as a table with status chips.
Effort: M.

**11. Profile tabs `/profile`, `?tab=courses`, `?tab=transactions`, `?tab=nang-luc` [text/DOM]**
Text shows the same header on every tab ("Tài khoản Codi an toàn / Hồ sơ cá nhân & Bảo mật") and a "Quay lại Bàn làm việc" link. The tabs share one header, so the tab content must carry all the meaning.
Top 3:
1. The header block repeats on every tab with no change; it wastes the first screen.
2. Transactions is a table route; check it is a calm dense table, not cards (not visually confirmed).
3. The capability tab ("Hồ sơ năng lực") is the learner's public proof; it is the most important tab and it sits last.

Delete: the repeated security header on each tab (keep it on overview only).
Proposed: move "Hồ sơ năng lực" to first place; transactions as a hairline table with a provenance column (REAL for paid orders).
Effort: M.

**12. Progress `/progress` [text/DOM]**
Text: "Tiến độ & kết quả", a list with tabs ("Đã hoàn thành" etc.), quiz scores, feedback, mastery. Not visually reviewed. Likely problem: four separate pieces of data (scores, submissions, feedback, mastery) in one tab bar, with no single answer to "what do I do next".
Delete: the separate "Đã hoàn thành" tab if the list is already filterable.
Proposed: a statement ("Bạn đang làm: X, còn Y bài") then a single hairline list grouped by course.
Effort: M.

**13. Insights hub `/insights` [text/DOM]**
Text: "Thống kê & bản đồ kiến thức" with two entry points (stats, knowledge map). Not visually reviewed. The hub is a menu page with nothing to act on.
Delete: the hub page itself; route straight to stats with the map as a tab.
Proposed: one page with a Stats / Knowledge map tab bar.
Effort: S.

**14. Stats `/insights/stats` [viewed]**
Top 3:
1. The summary tile row ("6 giờ", "1 ngày", "1", "3/22") is good, with the change line and sparkline. The sparkline and "▼ 64%" use red on a dark tile; it reads as alarm for a fine number.
2. The weekly bar chart shows 4.2, 4.1 and 1.2 h in visible weeks; the summary tile says "6 giờ" for the period. The two figures are not obviously reconciled (the period and the week buckets differ). Verify before shipping; this is a trust problem, not a layout one.
3. Four stacked cards (summary, weekly bars, heatmap, mastery) with equal weight; the heatmap is cramped in its card, and the card-to-card gap is larger than the content.

Delete: the sparkline in the first tile; one of the two "Bảng số liệu" links (pick one table toggle).
Proposed (SOI): a statement row ("Bạn học 6 giờ trong 30 ngày, giảm 64%") with the real number in display type and provenance chip; below it, the weekly chart and the heatmap side by side as hairline sections, not cards.
Effort: M.

**15. Knowledge map `/insights/knowledge-map` [viewed]**
Top 3:
1. The map is a horizontal tree at 1440 (52 nodes across about twelve x positions), not the single column the user reported. The single-column case still needs a mobile check.
2. "Spread & Destructuring" wraps and clips its label in the node.
3. The legend has five near-identical swatches on one hue.

Delete: the dashed card border on the whole map; "Chọn một khái niệm…" line moves into the evidence sheet.
Proposed: full-width map; click a node to open an evidence sheet on the right; two-level legend (not started / mastered).
Effort: M.

Mobile knowledge map (`learner_insights_knowledge-map_mob_dark.png`, 1802 px) is still not visually reviewed.

**16. Tutor `/learn/course-js-001/tutor` [viewed]**
Top 3:
1. The three-column shell (thread list, chat, composer) is standard and works. The thread list has two entries and most of the column is empty.
2. The composer chips ("Giải thích đơn giản", "Gợi ý từng bước", "Ôn lại khái niệm") and the "Gợi ý 1/3" pill stack above the input; there is a lot of chrome for one text box.

Delete: the "Gợi ý 1/3" pill (show it inline when used); the empty-column space in the thread list.
Proposed: keep the shell; move the lesson reference ("Bài: Thử thách…") into the header; put the chips in one row above the input.
Effort: S.

**17. Code lesson `lesson-js-p02` (run once) [viewed, run]**
Action: ran the default solution once. Result: "ReferenceError: donLonNhat is not defined" in the console, with an "Hỏi AI trợ lý: Giải thích lỗi này" button. The Chạy, Nộp bài and Console tabs work.
Top 3:
1. The workspace is good (dark editor, Chạy with Ctrl+Enter, Nộp bài, five test cases). Keep it.
2. The instructions column is a stack of step cards plus a hint card with a lock and a "Lời giải" disclosure. Four boxes for one task.
3. The "Để hoàn thành bài học" box at the bottom is another card with a primary button and a "Còn thiếu" note. The completion requirement is buried.

Delete: the hint card's border; the second completion box (keep one).
Proposed: left, the task as a numbered list (the sequence matters here, so numbers are justified); right, the editor and run results at full height; completion as a single line under the editor.
Effort: M.

**18. Code lesson `lesson-js-p01` (tutorial) [viewed, run]**
Action: ran once. Output "Xin chào Codi!" in the console and "Đi hết các bước hướng dẫn" still unchecked, so "Hoàn thành bài học" is blocked. The tutorial shares the same workspace.
Top 3:
1. The tutorial completion gate ("Đi hết các bước hướng dẫn: chưa xong") is a checklist inside a box inside the page; the learner cannot see it while reading step 1.
2. The run result says "Xin chào Codi!" and then "undefined" in the console. That is noise.
3. The sidebar lesson list shows all eleven items at full detail while the tutorial is open.

Delete: the trailing "undefined" in the console; the sidebar item detail (show the title and status only).
Proposed: a step progress bar at the top of the tutorial, not a checklist at the bottom.
Effort: S.

**19. Quiz section (`lesson-js-001`) [viewed by anchor, low-res]**
Anchor found and scrolled to. The quiz card sits under the reading body with a score ring ("100%") and "Làm lại" action. Judged from the full-page capture; the card repeats the stepper from the top of the lesson ("Học nội dung / Đạt quiz").
Top 3:
1. The quiz is a separate card far below the reading (after 11k px), so the learner has to scroll past the reading to find the assessment.
2. The score ring is a decorative progress ring, which the category rules call out as a stand-in for content.
3. The stepper at the top and the quiz card repeat the same completion state.

Delete: the score ring; the duplicate completion strip.
Proposed: quiz as its own tab beside reading; score as a single number with a provenance chip; completion in the stepper only.
Effort: M.

### Owner

**20. Owner course detail `/courses/react-du-an-thuc-te` (lecturer) [viewed]**
Top 3:
1. The lecturer sees "Đăng ký khóa học" and a price card "1.290.000 ₫" with an enrol-style CTA panel. The owner is not a buyer. The copy says "Bạn đang xem với vai trò giảng viên" right above it, which makes the purchase panel a bug, not a design choice.
2. The cover image is repeated (the same illustration as the course card on the home page), and the sidebar "Đăng ký" panel shows the same cover at the top.
3. Section numbers "01 · Bạn sẽ học được gì?" and "02 · Nội dung khóa học" are decorative; the content has no sequence that the reader needs.

Delete: the enrol CTA and price panel for the owner (replace with "Quản lý khoá học" → editor, and "Xem như học viên"); the section numbers.
Proposed: owner header with status chip and "Quản lý" primary; the outline as a hairline list; stats (learners, rating, price) as a hairline row, not a card.
Effort: S.

## Systemic issues

1. **Dev pill on user routes.** "Kịch bản thử nghiệm" is fixed bottom-left on every route. It covers the checkout amount row, the dashboard skill chips, and the lesson sidebar. Hide it outside dev. Effort: S.
2. **Boxed cards as the default.** Home, path, dashboard, cart, checkout details, stats and the lesson facts box all use bordered cards. SOI uses hairline sections. Reserve a box for one primary object per screen. Effort: M.
3. **Double headers.** Lesson and path routes stack a global header and a local bar with actions. Merge to one. Effort: S.
4. **Mobile length and overflow.** Lesson-js-001 is 14.4k px tall on phone with a 470 px overflow from reference links. Several pages stack sidebars above content. Effort: M.
5. **Provenance missing.** Stats, progress, dashboard targets and the owner stats have no REAL / MOCK / INFERRED / MISSING chips. The stats summary and the weekly chart disagree without an explanation. Effort: M.
6. **Test affordances visible to users.** The OTP step prints test codes on screen. Hide behind dev. Effort: S.

## Ten changes with the biggest payoff

1. Hide the dev pill from user routes. (S)
2. Fix the lesson reference-list overflow (`li` / `a` wrap). (S)
3. Move the "Khuyến nghị" badge out of the choice-card flow so both cards align. (S)
4. Replace the lesson video placeholder with a 16:9 frame and a poster; make the AI panel an overlay drawer, not a column that reflows the video. (M)
5. Owner view: replace the enrol panel with "Quản lý khoá học". (S)
6. Remove the on-screen OTP test codes outside dev. (S)
7. Merge the lesson's two headers into one; move the reading / quiz / resources into tabs so the page is not one 11k px scroll. (L)
8. Dashboard and path: collapse the boxes into a statement row plus one hairline list; delete the duplicate CTA and the duplicate "Vì sao" panel. (M)
9. Stats: reconcile the period total with the weekly bars, then rebuild as a statement row with the chart and heatmap as hairline sections. (M)
10. Knowledge map: full-width map with an evidence sheet on node click; two-level legend. (M)

Status: DONE_WITH_CONCERNS
Summary: 5 biggest findings:
- The choice cards are misaligned by a 36 px badge offset on the right card only; the width is fixed at 296 px and does not vary.
- The AI-panel lesson at 1240 px docks a 360 px sheet, hides the sidebar, and leaves an 812 x 500 empty video placeholder.
- The learner's lesson on mobile overflows to 470 px because of the reference-list items, not the code blocks.
- The owner course page shows a buyer's price and enrol panel to the lecturer.
- The dev pill covers payment and dashboard content on every user route.
