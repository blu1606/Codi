# Commerce feature gap analysis: real app vs codi-rebuild

Date: 2026-11-01 (Asia/Bangkok). Read-only scout. No source files were edited.

Sources read:
- Real app (root `D:/CODE/Study/FPT/Ki_5/SWP391/Codi/apps/web/src`, abbreviated `R:` below): `app/courses`, `app/cart`, `app/checkout`, `app/courses/[slug]/checkout`, `app/api/{student/cart,orders,payments,vouchers,courses}`, `components/cart`, `components/cart-nav-button.tsx`, `components/courses/*`, `components/profile/student-profile-overview.tsx`, `lib/{cart-service,cart-contract,add-course-to-cart,buy-now,checkout-cart,checkout-order,course-catalog,course-details,course-ownership*,course-review-service,course-review-contract,filter-course-catalog,get-course-detail,sepay-config}.ts`.
- Rebuild (`D:/CODE/Study/FPT/Ki_5/SWP391/codi-rebuild`, abbreviated `B:` = `src/features/commerce/`): `routes.jsx`, `catalog-page.jsx`, `course-card.jsx`, `course-detail-page.jsx`, `cart-page.jsx`, `checkout-page.jsx`, `commerce-lib.js`, plus `src/lib/codi.js`, `src/features/shell/header.jsx`, `src/features/shell/account-pages.jsx`, `src/features/shell/dev-drawer.jsx`, `server/seed-source/data.js`.
- Binding docs: `docs/mockup/PRODUCT.md` (Flow L1, L2, L3; open questions Q1-Q5, Q16) and `docs/mockup/STATE-MACHINES.md` (G1, G10, G11, G14, G15; sections 2-5).

Overall: the rebuild's commerce is a faithful port of the mockup and covers most visible states. The gaps are (a) one real correctness bug in checkout entry, (b) several real-app behaviours that the docs do not describe, and (c) copy and detail drift. Backend-only payment logic is summarised in section 3.

---

## 1. Summary table

Priority: P1 = core flow, P2 = important, P3 = nice. "done" means no action needed for the port.

| # | Feature | Real-app source (under `R:`) | Rebuild status | Priority |
|---|---|---|---|---|
| 1 | Checkout entry and order creation from cart (duplicate-pending guard, 409 resolve) | `app/checkout/page.tsx` (entry effect), `lib/checkout-cart.ts`, `app/api/orders/checkout/route.ts` | partial: a second pending order can be created (bug) | P1 |
| 2 | Checkout error states: payments unavailable, create error, order not found with support | `app/checkout/page.tsx` (error branch) | missing (create/unavailable); partial (not found) | P2 |
| 3 | Catalog sort options and price sorts | `app/courses/page.tsx` (`SORT_OPTIONS`), `lib/filter-course-catalog.ts` | partial: sort set contradicts PRODUCT L1 | P2 |
| 4 | Catalog search typeahead (suggestions, topic rows, top results, "Xem tất cả", empty) | `app/courses/page.tsx`, `lib/filter-course-catalog.ts` | partial: course titles only | P2 |
| 5 | Cart: pending-order banner with "Huỷ đơn này" | `components/cart/cart-view.tsx`, `app/api/orders/cancel/route.ts` | partial: no cancel from cart | P2 |
| 6 | Cart: undo window with 10 s countdown | `components/cart/cart-view.tsx` | partial: undo never expires | P2 |
| 7 | Cart: voucher apply (async, server validate), invalid voucher blocks checkout | `components/cart/cart-view.tsx`, `app/api/vouchers/validate/route.ts` | partial: silent full price at checkout | P2 |
| 8 | Voucher rules: startsAt, maxDiscountAmount, instant expiry, TZ formatting | `lib/cart-service.ts` (`validateVoucher`) | partial, conflicts with spec | P2 |
| 9 | Zero-total order (voucher covers cart): auto-paid, enrolled at once | `lib/checkout-cart.ts` | missing | P2 |
| 10 | Late transfer after expiry (auto-honour), overpaid/underpaid flags | `app/api/payments/sepay/callback/route.ts` | missing (backend; simulate) | P2 |
| 11 | Replace-order semantics and timeline label | `components/cart/cart-view.tsx` (replace modal), `lib/checkout-cart.ts` | partial: course preservation differs from real and from spec table | P2 (decision) |
| 12 | Awaiting-payment screen: QR, countdown, copy rows, tracker, status line, manual check, cancel | `app/checkout/page.tsx` | done; manual-check result copy drifts; QR is a placeholder | P2 (copy) |
| 13 | Expired / failed / cancelled / paid screens, "Tạo mã mới" | `app/checkout/page.tsx`, `app/api/orders/[id]/new-code/route.ts` | done | - |
| 14 | Cancel order from checkout: confirm, re-add to cart | `app/checkout/page.tsx`, `app/api/orders/cancel/route.ts` | done; reconciliation flag missing | P3 |
| 15 | Payment success page | `app/checkout/success/page.tsx` | done; small copy diffs, empty-state body missing | P3 |
| 16 | Catalog card: badges, CTAs, rating text, aria-labels | `components/courses/catalog-course-card.tsx` | done; per-button aria-labels missing | P3 |
| 17 | Course detail purchase card: 6 ownership states | `components/courses/course-detail-view.tsx`, `lib/course-ownership.ts` | done; in-cart lacks "Mua ngay"; pending copy differs | P3 |
| 18 | Course detail: load error, retry, not-found | `components/courses/course-detail-view.tsx`, `lib/course-details.ts`, `lib/get-course-detail.ts` | partial: not-found only, no retry | P3 |
| 19 | Reviews block: breakdown, empty copy, reply label | `components/courses/course-detail-view.tsx`, `components/courses/course-review-list.tsx`, `lib/course-review-service.ts` | done; copy differs | P3 |
| 20 | Catalog URL: `?course=` deep link, clear-search button | `app/courses/page.tsx` | missing | P3 |
| 21 | Buy now (Mua ngay), free enrol, add to cart with sign-in gate | `lib/buy-now.ts`, `lib/add-course-to-cart.ts`, `app/api/courses/enroll-free/route.ts` | done | - |
| 22 | Cart nav badge | `components/cart-nav-button.tsx` | done (`B:`/`shell/header.jsx`) | - |
| 23 | Order history / transactions tab | `components/profile/student-profile-overview.tsx` (legacy studentTransactions) | rebuild is richer (`shell/account-pages.jsx`) | - |
| 24 | Legacy per-course checkout, create-transaction, check-transaction, checkout-order helper | `app/courses/[slug]/checkout/page.tsx`, `app/api/payments/{create-transaction,check-transaction}`, `lib/checkout-order.ts` | not needed: no UI caller (tests only) | - |

---

## 2. Missing and partial features (detail)

### 2.1 Duplicate pending order through `/checkout` (P1, bug)

- Real: `/checkout` with no `order` query POSTs `/api/orders/checkout`. If a pending order exists, the API returns 409 `PENDING_ORDER_EXISTS`, and the page resolves to the existing order by matching `CODI\d{5}` in the message (`app/checkout/page.tsx`). No second order is created.
- Rebuild: `CreatingOrder` in `B:checkout-page.jsx` resumes the pending order only when the cart is empty. When the cart has items it calls `createOrderFromCart()` without checking for a pending order, so a second pending order is created silently. The cart page guards this with the replace modal, but direct `/checkout` entry does not.
- Fix: in `CreatingOrder`, if `myPendingOrders()[0]` exists, resume it or redirect to `/cart` so the modal runs (STATE-MACHINES §3 `has_items → order_pending`). Also guard inside `createOrderFromCart` (refuse when a pending order exists unless a replace id is passed), mirroring `checkout-cart.ts` step 3.
- Files: `B:checkout-page.jsx`, `B:commerce-lib.js`.

### 2.2 Checkout entry, unavailable and error states (P2)

- Real UI: while creating, skeleton label "Đang tạo đơn hàng…". On failure, an Empty block with title by type: "Thanh toán tạm thời không khả dụng" (503, no SePay config), "Lỗi tạo đơn hàng", or "Không tìm thấy đơn hàng". Body shows the error text, the order code when present ("Mã đơn: …"), the support line "Cần hỗ trợ? Email hotro@codi.vn kèm mã giao dịch …", and buttons "Về giỏ hàng" and "Xem khoá học".
- Rules: 503 is returned for orders with total > 0 when payment config is missing. Spec §5.3 lists this state as "not implemented in prototype". Decide whether the rebuild shows it.
- Rebuild: no create-error branch. `CreatingOrder` silently falls back to `/cart` when order creation returns null. Not-found shows "Không tìm thấy đơn hàng" but no support line or order code.
- Data: add a scenario value (for example `unavailable`) to `Codi.state.scenario`. The scenario switcher lives in `src/features/shell/dev-drawer.jsx`, outside the commerce folder, so report it to that owner.
- Files: `B:checkout-page.jsx`.

### 2.3 Catalog sort options (P2)

- Real and PRODUCT L1: the dropdown reads "Sắp xếp: Phù hợp nhất / Mới nhất / Đánh giá cao nhất / Học nhiều nhất" (`R:app/courses/page.tsx` `SORT_OPTIONS`). Real has no price sort.
- Rebuild `B:catalog-page.jsx` `SORTS`: "Phổ biến nhất", "Mới nhất", "Giá: thấp → cao", "Giá: cao → thấp", "Đánh giá cao nhất". Two options contradict PRODUCT L1 and the labels differ.
- "Phù hợp nhất" real behaviour: when a query is present, title matches rank first, then enrolment count. Without a query, enrolment count. Rebuild uses `learnersCount` but has no title-match boost.
- URL values: real accepts `popular`, `newest`, `rating`, `enrollment`; legacy `price-asc` and `price-desc` are normalised to `popular`.
- Files: `B:catalog-page.jsx` only.

### 2.4 Catalog search typeahead (P2)

- Real: a combobox with three groups. "Gợi ý tìm kiếm" (query suggestions), "Kết quả hàng đầu" (top results, each with a type badge "Khóa học" or "Chủ đề"), then a "Xem tất cả kết quả" action. Empty: "Không tìm thấy gợi ý nào cho “{q}”". Clear button aria-label "Xóa từ khóa tìm kiếm". Matching covers title, description, category and topics, where topics come only from confirmed knowledge maps.
- PRODUCT L1 step 2 specifies the same three-part structure.
- Rebuild: keyboard-navigable list of published course titles grouped by category. No suggestions, topic rows, top results, "Xem tất cả", or empty state. Matching covers title, summary and category, not topics.
- Data: topics can come from `knowledgeMaps` in the seed (`server/seed-source/data.js` around line 895). Seed courses have no `topics` field.
- Files: `B:catalog-page.jsx` (`SearchBox`), `B:commerce-lib.js` (a `searchCatalog` helper).

### 2.5 Cart: cancel pending order from the banner (P2)

- Real: the banner reads "Bạn có đơn hàng {code} đang chờ thanh toán", then "{n} khoá học · {vnd} · tạo lúc {datetime}". Two buttons: "Huỷ đơn này" (outline, shows "Đang huỷ…" while running) and "Tiếp tục thanh toán". Cancel posts to `/api/orders/cancel`, refetches the cart and shows an error alert on failure. It has no confirm dialog.
- Conflict: STATE-MACHINES G1 requires a confirm dialog stating consequence and reversibility for cancelling an order. The real banner skips it. Decide, but the default should follow G1.
- Rebuild: the banner has only "Tiếp tục thanh toán". Add "Huỷ đơn này" with the same `ConfirmDialog` copy as the checkout cancel (`cancelCheckout` in `B:checkout-page.jsx`). Extract that into a shared helper in `commerce-lib.js` so both paths re-add the courses to the cart.
- Files: `B:cart-page.jsx`, `B:commerce-lib.js`, `B:checkout-page.jsx`.

### 2.6 Cart: undo window (P2)

- Real: after a remove, an in-page alert reads "Đã xoá “{title}” khỏi giỏ hàng" with a button "Hoàn tác (Ns)". The countdown starts at 10 s and the alert clears at 0. A toast with the same undo runs in parallel.
- Rebuild: `lastRemoved` is a module variable. The "Hoàn tác" alert stays until the cart changes or the learner navigates. It never expires.
- Fix: a 10 s timer that clears `lastRemoved`, with the countdown in the button label. The label format "Hoàn tác (10s)" follows the real app. PRODUCT L3 only specifies an undo toast, so the in-page alert can stay.
- Files: `B:cart-page.jsx`.

### 2.7 Cart: voucher apply and invalid-voucher checkout (P2)

- Real: Apply shows "Đang áp dụng…" while `POST /api/vouchers/validate` runs with the current subtotal. On success the code is stored in client state and the cart refetches with `?voucher=`. If the voucher later becomes invalid (for example after a cart change), the cart shows the error, and checkout returns 409 with the same message, so the learner must remove the voucher first. Hint text: "Chỉ để test: thử WELCOME20 (đơn từ 500.000 ₫) hoặc SUMMER15 (đã hết hạn)."
- Rebuild: validation is synchronous and client-side. If the applied voucher becomes invalid, the cart shows an inline error, but `createOrderFromCart` silently drops the voucher (`voucherCode: s.voucher ? ... : null`, `total: s.subtotal`). The learner pays full price with no warning at checkout.
- Decision needed (section 4, item 3). Recommended minimum: block checkout with the same error, or show the confirm step. Do not charge silently.
- Files: `B:cart-page.jsx`, `B:commerce-lib.js` (`createOrderFromCart`).

### 2.8 Voucher rule set (P2, decide first)

- Real `validateVoucher` order: not found → inactive → `startsAt` in the future ("Mã giảm giá chỉ có hiệu lực từ {dd/mm/yyyy}.") → `expiresAt` already passed (instant comparison, "Mã đã hết hạn từ {date}.") → usage limit reached → `minOrderAmount` ("Đơn hàng cần tối thiểu {n} ₫ để dùng mã này.") → discount. Percent discount is capped by `maxDiscountAmount`. Dates use Asia/Ho_Chi_Minh.
- Spec §4: expiry is end of day, there is no start date and no cap. Real vouchers do not use end-of-day expiry.
- Rebuild: end-of-day expiry (`checkVoucher` in `B:commerce-lib.js`), no start date, no cap.
- Data (only if the real rules are adopted): add `startsAt: null` and `maxDiscount: null` to `vouchers` in `server/seed-source/data.js` (around lines 775-780). Check them in `checkVoucher`.
- Files: `B:commerce-lib.js`, `server/seed-source/data.js`.

### 2.9 Zero-total orders (P2)

- Real: if the voucher covers the whole cart (percent 100, or amount at least the subtotal), `checkout-cart.ts` claims voucher capacity atomically (409 "Mã đã hết lượt sử dụng." when exhausted). It then creates an order with status `paid`, `paidAt` set, timeline "Đã thanh toán (Miễn phí qua mã giảm giá)", and enrols the items immediately. No transfer is requested.
- Rebuild: `createOrderFromCart` always creates `pending`. A 0 ₫ order would show a QR for 0 ₫ and wait for a transfer that never comes. The seed vouchers do not reach 0 (`GIAM100K` needs 800 000 ₫), but an admin-created 100% voucher would.
- Fix: in `createOrderFromCart`, when total is 0, set `paid`, enrol, increment `used` (after the capacity check), add the timeline label, and route to `/checkout/success`.
- Files: `B:commerce-lib.js`, `B:cart-page.jsx` (route target).

### 2.10 Replace-order semantics (P2, decide)

- Real: replacing cancels the old order (`failReason` "Huỷ để tạo đơn mới"; `needsReconciliation` if money was received). The new order is built from the current cart only, so the old order's courses are dropped because the cart rows were already deleted when that order was created. The new timeline label is "Đã tạo đơn mới (thay đơn cũ)" with `replacesOrderId`.
- Spec §3 table says the old courses are "NOT re-added". The ⚠ note in the same section calls that behaviour "a bug to avoid". The two statements contradict each other.
- Rebuild `replaceOrder` (`B:cart-page.jsx`) re-adds the old courses, which follows the ⚠ note and comments "never drop them silently".
- Keep the rebuild behaviour, change the timeline label to "Đã tạo đơn mới (thay đơn cũ)", and ask product to settle the table.
- Files: `B:cart-page.jsx`, `B:commerce-lib.js`.

### 2.11 Late transfer after expiry, overpaid and underpaid (P2, simulate)

- Real: see section 3.1. The learner-visible parts are the states "Đã nhận X / cần Y" (already in rebuild) and the late confirmation that moves an expired order to paid.
- Rebuild: `tickSim` handles only four outcomes (`success`, `expired`, `underpaid`, `qrfail`, `slow`). There is no late-payment outcome and no over-payment.
- Fix: add a late-payment scenario (`late`): an order that is already `failed` with `failReason: 'expired'` becomes `paid` unless the learner owns every item (D2). Timeline "Thanh toán muộn được chấp nhận".
- Files: `B:checkout-page.jsx` (`tickSim`), `B:commerce-lib.js`.

### 2.12 Checkout copy: manual-check result (P2, copy)

- Real text inside the alert "Đã kiểm tra lúc {time}: Codi chưa nhận được tiền", with three steps: "Một số ngân hàng xử lý chậm — Codi vẫn tự kiểm tra tới khi mã hết hạn.", "Sau đó kế toán đối soát thủ công theo nội dung {code}, thường trong 2 giờ làm việc.", "Khi xác nhận xong, khoá học mở ngay và bạn nhận được thông báo. Cần hỗ trợ: hotro@codi.vn." This matches STATE-MACHINES §5.5 (D5).
- Rebuild (`B:checkout-page.jsx`) adds an intro "Cảm ơn bạn. Một số ngân hàng xử lý chậm, nên Codi chưa nhận được tín hiệu tự động." and a step "Codi tiếp tục tự kiểm tra trong 30 phút tới." The second line is not in the real app. The 30-minute claim is consistent with the 30-minute expiry but is still invented copy. Use the real text.
- Button: real shows a spinner plus the countdown label. Rebuild shows "Đang kiểm tra…" during the check. Both are acceptable.
- Files: `B:checkout-page.jsx`.

### 2.13 Checkout cancel: reconciliation and labels (P3)

- Real cancel sets `needsReconciliation` when money was received (`app/api/orders/cancel/route.ts`), and checkout copy says "Nếu bạn đã chuyển khoản, đừng huỷ". Rebuild `cancelOrder` has no such flag. Add `needsReconciliation` to the order so the admin area can show it.
- Other real timeline labels to adopt: "Đã thanh toán (Miễn phí qua mã giảm giá)", "Thanh toán muộn được chấp nhận", "Chuyển thừa {n} ₫ (Cần đối soát)", "Mã giảm giá vượt hạn mức sử dụng khi thanh toán (Cần đối soát)".
- Files: `B:commerce-lib.js`.

### 2.14 Checkout success page (P3)

- Real: subtitle per course "Khóa học tại Codi" (rebuild shows the lecturer name). Empty state title "Chưa có xác nhận thanh toán cho đơn này" plus body "Đơn hàng chưa hoàn tất thanh toán hoặc không tồn tại." (rebuild has no body). Real CTA "Xem giao dịch".
- Files: `B:checkout-page.jsx` (`CheckoutSuccessPage`).

### 2.15 Course detail states (P3)

- In cart: real shows a non-interactive "Đã trong giỏ hàng" pill, primary "Thanh toán" (to `/cart`), and a secondary "Mua ngay". Rebuild shows a disabled button plus "Xem giỏ hàng / Thanh toán", which matches the spec table. Decide whether "Mua ngay" is added.
- Pending payment: real copy is "Đơn hàng đang chờ thanh toán." with "Tiếp tục thanh toán". Rebuild copy is "Đang chờ thanh toán" and "Đơn {code} chưa nhận được tiền.", which follows the spec. Keep the spec copy.
- Load error: real shows heading "Chưa thể tải khoá học", a role=alert message, and "Thử lại" (not on 404). Title for 404 is "Không tìm thấy khoá học". Rebuild has only the 404 state, which is acceptable for a local store, but add the layout for parity.
- Free course price label: real always shows "Học phí khóa học". Rebuild switches to "Học phí" for free courses. Trivial.
- Files: `B:course-detail-page.jsx`, `B:course-card.jsx` (`CourseCta`).

### 2.16 Course detail reviews (P3)

- Real: the summary card appears only when reviews exist, shows the average with "{n} đánh giá", and a breakdown list. Each review shows "{stars}/5 sao" as text and reply heading "Phản hồi từ giảng viên". Empty copy: "Chưa có đánh giá nào cho khoá học này." plus "Đánh giá và nhận xét từ sinh viên đã học sẽ được hiển thị tại đây."
- Real shows only `isVisible` reviews from enrolled learners, at most 50 (`lib/course-review-service.ts`).
- Rebuild: "Chưa có đánh giá nào.", reply heading "Phản hồi của giảng viên" with a "Giảng viên" badge, and a "(bạn)" suffix on the learner's own review (not in real). Align the copy.
- Files: `B:course-detail-page.jsx`.

### 2.17 Catalog URL and search (P3)

- Real: `?course=<id>` redirects to that course's detail page. An unknown id is removed from the URL. The search input has a clear button (aria-label "Xóa từ khóa tìm kiếm").
- Rebuild: neither exists.
- Files: `B:catalog-page.jsx`.

### 2.18 Catalog card accessibility (P3)

- Real: aria-labels on the CTAs, "Thêm vào giỏ: {title}", "Đăng ký miễn phí: {title}", and the cover link "Xem chi tiết: {title}". Rebuild has an aria-label only on the cover link, and the add-to-cart button has no label beyond its text.
- Real `hidden` badge "Tạm ngừng" is unreachable from the public catalog because `/api/courses` returns published courses only, so skip it.
- Files: `B:course-card.jsx`.

---

## 3. Backend-only logic and how to simulate it in the rebuild

### 3.1 SePay webhook (`R:app/api/payments/sepay/callback/route.ts`, 770 lines)

Rules the webhook enforces:
- Auth: `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>`, compared in constant time. 503 when config is missing.
- Ignored (200 response): `transferType !== "in"`, a different `accountNumber`, or no `CODI\d{5}` in `content`/`description`.
- Match: the code is the `studentTransactions.id` and the order `code`. The amount is `transferAmount` or `amountIn`.
- Accumulate `receivedAmount`. Below total: stays `pending` and the ledger row is `pending`. At or above total: `paid`, `paidAt`, enrol all items, increment voucher `usedCount`, notify the buyer.
- Overpaid: `paid` with `needsReconciliation` and timeline "Chuyển thừa …".
- Late payment (order `failed` with `expired`): auto-honour to `paid` unless the learner already owns every item. If they do, the order stays `failed` with reconciliation.
- Cancelled or already paid order receives money: reconciliation flag, status unchanged.
- Ledger: a `payments` row per provider transaction, deduplicated by provider id.
- Expiry is lazy, not scheduled. `GET /api/orders/[id]`, `manual-check` and `new-code` mark expired pending orders as failed when called.

Simulation plan for the rebuild:
- Add a pure `applyTransfer(order, amount, content)` to `B:commerce-lib.js` that mirrors the rules above. It matches by `order.code` in content, accumulates `received`, calls `markPaid` on full payment, applies the late-payment rule, and sets the overpaid and reconciliation flags.
- Change `tickSim` in `B:checkout-page.jsx` to call `applyTransfer` with the amount chosen by the scenario (for example `success` = full, `underpaid` = half, `late` = full after expiry, `overpaid` = total + extra). Scenarios select inputs; the rules live in one place and can be unit-tested.
- Keep the simulation clearly labelled as a simulation (the rebuild already says "minh hoạ trong bản thử nghiệm" on the QR). Do not present it as real SePay integration.

### 3.2 Config and VietQR image

- Config: `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER` (`R:lib/sepay-config.ts`). Receiver name is hard-coded as "CONG TY CODI EDU" in `R:app/api/orders/[id]/route.ts`; the rebuild seed already uses the same name.
- QR: real uses `https://img.vietqr.io/image/{bank}-{account}-compact.png?amount={remaining}&addInfo={code}`. This is a public image URL with no secret, so the rebuild could use it when online. The current placeholder SVG is deliberate. Decide before porting.

### 3.3 Polling

- Real polls `POST /api/orders/{code}/manual-check` every 3 s while pending, and on "Tôi đã chuyển khoản". The rebuild simulates this inside `tickSim`. No change needed beyond 3.1.

### 3.4 Dead or legacy endpoints (do not port)

- `R:app/api/payments/create-transaction/route.ts` (per-course transaction creation) and `R:app/api/payments/check-transaction/[id]/route.ts` have no UI caller. `R:lib/checkout-order.ts` is only used by tests.
- `check-transaction` has no session check and returns the status for any `CODI` id. Flag this to the real-app owner as a security concern (out of rebuild scope).
- `R:app/courses/[slug]/checkout/page.tsx` only redirects to `/checkout`. The rebuild does not need it.

---

## 4. Conflicts between real app, docs, and rebuild; undecided items

Each item states the sources and a recommendation. Decisions here are product calls. Do not change them without the owner.

1. Replace-order course preservation. STATE-MACHINES §3 table says "NOT re-added", the ⚠ note says that is a bug, real code drops them, rebuild re-adds. Recommendation: keep the rebuild (re-add), fix the table text.
2. Voucher expiry boundary. STATE-MACHINES §4 step 3 says valid through end of day. Real compares `expiresAt < now` (instant). Recommendation: pick one. Real behaviour is the safer default for dates stored as timestamps; the spec wording needs an update if so.
3. Applied voucher becomes invalid before checkout. Spec is silent (discount 0 on cart, order created at full price). Real blocks checkout with 409. Rebuild charges full price silently. Recommendation: block with the same message, as real does.
4. Voucher extra rules. Real has `startsAt`, `maxDiscountAmount` and minimum order. Spec §4 does not cover start date or cap. PRODUCT Q16 (scope, per-user limit, stacking) is open. Decide whether to port the two extras.
5. Cancel from the cart without confirm. Real banner has no confirm; STATE-MACHINES G1 requires one. Recommendation: follow G1 (the rebuild should confirm).
6. Catalog sort options. PRODUCT L1 lists "Phù hợp nhất / Mới nhất / Đánh giá cao nhất / Học nhiều nhất". Real matches. Rebuild has price sorts and "Phổ biến nhất" instead. Recommendation: follow PRODUCT L1.
7. Manual-check result. PRODUCT L3 step 4 says button "Đang kiểm tra…", inline "Chưa nhận được tiền — ngân hàng có thể mất 1–5 phút. Codi sẽ tự cập nhật.", tracker stays step 2, short cooldown. STATE-MACHINES §5.5 (D5) says 30 s cooldown and a three-step text. Real follows D5. Rebuild follows D5 with invented copy. Recommendation: D5 with the real text.
8. Support channel. PRODUCT L3 says "Liên hệ hỗ trợ đối soát" with "channel Zalo/hotline per Q5" (Q5 open). G10 and D5 say `hotro@codi.vn`. Real uses `hotro@codi.vn`. Recommendation: `hotro@codi.vn` until Q5 is answered.
9. Expiry and late payment. STATE-MACHINES D1 keeps 30 min. PRODUCT Q4 is still open on the duration and whether an expired QR can be honoured. D2 (decided) says it can. Doc drift: update PRODUCT Q4 status.
10. Hidden course that the learner owns. STATE-MACHINES §2 says detail shows an info notice and learning continues. Real `lib/get-course-detail.ts` filters `status = published`, so the owner gets a 404. Rebuild follows the spec. Real is a bug against the spec.
11. Zero-total order (voucher covers the cart). Undocumented. Real auto-pays and enrols. Recommendation: follow real (item 9 in section 2).
12. In-cart CTA. Spec table: disabled "Đã trong giỏ hàng" and "Xem giỏ hàng / Thanh toán". Real adds "Mua ngay". Decide.
13. Pending-payment copy on the course detail. Spec and rebuild: "Đang chờ thanh toán" with "Đơn {code} chưa nhận được tiền." Real: "Đơn hàng đang chờ thanh toán." Decide. Rebuild follows spec by default.
14. Payments-unavailable state. Spec §5.3 says not implemented in prototype. Real implements it. Decide whether the rebuild simulates it (scenario value, section 2.2).
15. Learner review submission. No learner-facing review submit route or UI is in commerce scope. `saveCourseReview` in `lib/course-review-service.ts` is called from `lib/learning-path-service.ts`. PRODUCT L9 (Submit Course Review) belongs to the learning area. Confirm the owner so reviews are not left out of the port.

Status: DONE_WITH_CONCERNS
Summary: The commerce port covers most visible states. The one real bug is that `/checkout` can create a second pending order when the cart is non-empty (P1). The remaining gaps are P2 items on catalog typeahead and sort, the cart's cancel and undo behaviour, voucher handling at checkout, zero-total orders, and the late-payment simulation. Section 4 lists 15 decisions that need an owner before porting.
Concerns: Several rules in the docs contradict each other (replace-order courses, voucher expiry, cancel confirm, manual-check copy). Do not port those until the product owner decides.
