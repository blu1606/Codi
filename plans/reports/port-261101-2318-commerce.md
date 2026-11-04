# Port report: commerce (catalog, detail, cart, checkout, home, /ai)

Date: 2026-11-02 (Asia/Bangkok). Sources: `Codi/apps/web/src` (read only). Reports: `scout-261101-2318-commerce.md`,
home and /ai rows of `scout-261101-2318-shell-account.md`.

Verification:
- `npx vite build --outDir <scratchpad>/build-commerce --emptyOutDir` passed. Earlier runs failed on other agents'
  in-progress files (`lecturer-ai.css`, shell `ForgotPasswordPage`). Those passed once their owners finished.
- Seed: `node -e "import('./server/seed-data.js').then(m=>m.loadSeed())"` loads. All 14 base orders, plus the
  admin patch's orders, carry the contract fields. No timeline entry lacks a `type`.
- Unit tests: `src/features/commerce/commerce-lib.test.js`, 12/12 pass. They cover `applyTransfer` (ignored, full,
  partial accumulation, overpaid, late honoured or owned, partial after expiry, cancelled, voucher over limit), the
  catalog filter and sort, sort normalising, and the typeahead. The project has no test runner, so the file header
  gives the esbuild + `node --test` command.

## Rows done

Commerce scout:

| # | Row | Result |
|---|---|---|
| 1 | P1 duplicate pending order via `/checkout` | `createOrderFromCart` refuses with `PENDING_ORDER_EXISTS` unless `replaceOrderId` names the pending order. `CreatingOrder` resumes it with a replace navigation, as the real 409 path does, and has a StrictMode guard. An expired pending order is failed first, then the new order is created (real `checkout-cart.ts`). |
| 2 | Checkout entry / unavailable / create error / not found | Skeleton "Đang tạo đơn hàng…". `CheckoutError` titles: "Thanh toán tạm thời không khả dụng", "Lỗi tạo đơn hàng", "Không tìm thấy đơn hàng". It shows the message, "Mã đơn: …", the support line with mailto, "Về giỏ hàng" and "Xem khoá học". Unavailable is driven by `paymentOutcome: 'unavailable'` (see shared requests). |
| 3 | Catalog sort | "Phù hợp nhất / Mới nhất / Đánh giá cao nhất / Học nhiều nhất". When searching, title matches rank first. Legacy `price-asc`, `price-desc` and `relevant` URLs fall back to `popular`. |
| 4 | Typeahead | Live search with "Gợi ý tìm kiếm" (max 5), "Kết quả hàng đầu" (up to 4 courses plus topics, badges "Khóa học" / "Chủ đề", level or category on the right), "Xem tất cả kết quả · n kết quả", and the empty message "Không tìm thấy gợi ý nào cho “q”". It is keyboard navigable (wraps, Enter, Esc). Matching covers title, description, category and topics. Topics come from confirmed knowledge maps, accepted or edited concepts only (real `topicEligibility`). |
| 5 | Cart "Huỷ đơn này" | Outline button with "Đang huỷ…". The order is cancelled with no confirm (real) and its courses return to the cart. On failure the page shows an error alert. |
| 6 | Undo window | In-page alert with "Hoàn tác (Ns)" counting down from 10 s, then it clears. A parallel toast with a "Hoàn tác" action lasts 10 s. |
| 7 | Voucher apply / invalid at checkout | "Đang áp dụng…" while applying. An invalid applied voucher blocks checkout with the voucher message (alert "Lỗi" plus the inline error and "Bỏ mã giảm giá"). The learner is never charged full price silently. Hint "Chỉ để test: …" is verbatim. |
| 8 | Voucher rules | Real order: not found, inactive, `startsAt` in the future, `expiresAt < now` as an instant comparison, usage limit, minimum order. The percent discount is capped by `maxDiscount`. Dates are formatted in Asia/Ho_Chi_Minh. |
| 9 | Zero-total order | Voucher capacity is checked and claimed. The order is created `paid` with timeline "Đã thanh toán (Miễn phí qua mã giảm giá)", the courses are enrolled, and the learner lands on `/checkout?order=…` in the paid state (real redirect target). |
| 10 | Late payment, overpaid, underpaid | Pure `applyTransfer(order, {amount, content, at}, {ownsAll, voucher})` mirrors the SePay callback rules. `receiveTransfer` applies its side effects (enrol, voucher `used`, notify). `tickSim` only picks the amount: success = due, underpaid = half once, overpaid = due + 50 000 ₫, late = expire, then the full transfer arrives 8 s later. |
| 11 | Replace-order | Rebuild behaviour kept: the old courses join the new order. The old order is cancelled with `cancelReason` "Huỷ để tạo đơn mới", and the new order has timeline "Đã tạo đơn mới (thay đơn cũ)" and `replacesOrderId`. All validation runs before the old order is cancelled. The modal button shows "Đang xử lý…". |
| 12 | Manual-check copy | Real three steps verbatim, with a spinner and the countdown label on the button. |
| 13 | Expired / failed / cancelled / paid | Real copy: "Codi đã nhận đủ tiền lúc …", the cancelled body with code and support line, and the failed body with support line. "Tạo mã mới" has a busy state. Expiry is lazy on view (real GET). |
| 14 | Cancel reconciliation | `cancelOrder` sets `cancelledAt`, `cancelReason` and `needsReconciliation` when money was received, and re-adds the courses to the cart. |
| 15 | Success page | Subtitle "Khóa học tại Codi". The empty state now has the body "Đơn hàng chưa hoàn tất thanh toán hoặc không tồn tại." |
| 16 | Card aria-labels | "Xem chi tiết: …", "Thêm vào giỏ: …", "Đăng ký miễn phí: …". A lecturer or admin who owns the course sees "Tiếp tục học". |
| 17 | Detail purchase states | In cart: the "Đã trong giỏ hàng" pill, "Thanh toán" and "Mua ngay". Pending: "Đơn hàng đang chờ thanh toán." plus the order code. Price label is always "Học phí khóa học". Role copy is "giảng viên" / "quản trị viên". |
| 18 | Detail load error | "Chưa thể tải khoá học" with "Thử lại" (simulated with `?error=1`, the same convention as the catalog). Not found: "Không tìm thấy khoá học" with no retry. |
| 19 | Reviews | Only visible reviews from enrolled learners, max 50. Each shows "{n}/5 sao" and "Phản hồi từ giảng viên". The summary renders when reviews exist. Real two-line empty state. "(bạn)" and the badge are removed. |
| 20 | `?course=` deep link and clear button | A known id redirects to the detail page with replace. An unknown id is dropped from the URL. The clear button has aria-label "Xóa từ khóa tìm kiếm". |
| 21 | Buy now | Real guards: the course must be paid and published, and must not be owned. An existing pending order holding the course is resumed. |

Shell-account rows (home and /ai):

| # | Row | Result |
|---|---|---|
| 1 | Hero | Real subtitle, CTAs "Bắt đầu học ngay" → `/dashboard` and "Khám phá khóa học" → `/courses`, stats row. Title kept Vietnamese, see deviations. |
| 2 | Features | Real heading, paragraph and 4 items, first one highlighted. |
| 3 | Popular courses | Sorted by enrolment, 4 items. Loading (sr "Đang tải khóa học…", first visit), error (`?error=1`, "Thử lại"), empty copy. Cards show level, "n học viên", duration, category label on the cover, and CTA "Bắt đầu học" with aria-label. |
| 4 | AI Mentor | Real heading, paragraph, two benefits, link "Trò chuyện với AI Mentor". The illustration is a small static chat about `Set`, labelled with the real alt text. |
| 5 | Footer | Brand text, "Nền tảng / Tài nguyên / Hỗ trợ / Liên hệ" with real links. Shown on home only. |
| 34 | AI feedback reasons | The 5 real reasons. The toasts already matched. |
| 35 | AI deep links | `?topic=` prefill (existing). `?prompt=` is sent even when a chat exists. `?action=add-cart\|enroll-free&courseId=` replays through `requireAuth`. Handled params are removed with a replace navigation. |
| 36 | AI skeleton | First-visit skeleton (sr "Đang tải trợ lý AI…"). |
| §4.11 | /ai access | Role guard removed (real has none). Lecturers and admins see "Xem chi tiết" CTAs. The "Tiếp tục thanh toán" CTA now opens the pending order. |

## Rows skipped

- Shell-account 6, logo intro animation (P3): it flies the logo into the header logo, which the shell owns. It is
  also an animation-only nicety. Left for the shell or polish pass.
- Hero image collage: the real app uses external 21st.dev CDN stock photos. There are no local assets and I did
  not invent imagery.
- AI "context error" ("Vui lòng tải lại trang trước khi gửi câu hỏi.", P3): the rebuild has no async context load
  that can fail, and no scenario flag exists for it.
- Commerce 23, learner order history: it exists in `shell/account-pages.jsx` (shell-owned, already richer than real).
- Commerce 24, legacy endpoints: no UI caller.
- VietQR image (§3.2): the placeholder SVG is kept. The seed bank `Vietcombank` is not a VietQR bank code and the
  prototype must work offline.
- "Học thử" lesson badge: the lecturer patch adds `isFreePreview`, but it is not in my row list. It is trivial to
  add later on the curriculum rows.

## Deviations from the mockup docs (for `docs/deviations-from-mockup.md`, not in my write set)

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

## Shared change requests

1. Dev drawer (`src/features/shell/dev-drawer.jsx`, shell owner): add `paymentOutcome` options
   `['late', 'Chuyển khoản muộn (sau khi hết hạn)']`, `['overpaid', 'Chuyển thừa tiền']` and
   `['unavailable', 'Cổng thanh toán không khả dụng']`. The checkout code already handles all three. Without these
   options the states are reachable only by editing `localStorage`.
2. Admin owner: `applyTransfer` and `cancelOrder` set `needsReconciliation = true` in the same cases as the real
   webhook and cancel route (money on a cancelled or expired order, overpayment, voucher over limit, late payment
   for owned courses). After an honoured late payment they set it back to `false`. Timeline types written:
   `created`, `paid`, `late_paid`, `late_owned`, `partial_payment`, `overpaid`, `voucher_over_limit`,
   `received_after_close`, `expired`, `cancelled`, `replaced`. Every entry also carries `label` for display.
   `admin-orders.jsx` renders `t.label`, but the admin patch's generated entries have no `label`. They should
   render `t.label || t.note || t.type`.
3. Controller: copy the deviations above into `docs/deviations-from-mockup.md`.

## New seed fields (`server/seed-source/patches/20-commerce.js`)

- `orders[]`: `received` (total for paid or refunded, else 0), `expiresAt` (createdAt + 30 min), `failReason`
  ("Sai nội dung chuyển khoản" for the seeded failed order, matching its label), `cancelledAt` (from the timeline),
  `cancelReason` ("Người mua đã huỷ"), `isBuyNow` (false) and `replacesOrderId` (null).
- `orders[].timeline[]`: `type` and `by` added to every existing entry. The learner is the actor for create and
  cancel, the admin for refund, and null (system) for the rest.
- `vouchers[]`: `startsAt: null`, `maxDiscount: null`.
- Runtime-only fields set by transitions: `updatedAt` (bumped on every event; the admin KPIs read it) and
  `qrFailed` (existing).

## Unresolved questions

1. Hero title: Vietnamese mockup title (current) or the real English title?
2. Should the cart "Huỷ đơn này" get the G1 confirm dialog after all? The real app has none, so I followed it.
