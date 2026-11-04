# Phase 2 report: commerce

Status: done. Home, catalog, course detail, cart, checkout (VietQR + simulated SePay), success and the AI advisor
read and write through the backend. Nothing in `frontend/src/features/commerce/` calls `Codi.db()` / `Codi.set()`
any more. Commits: `5535065` (home, catalog, detail), `9043218` (cart, checkout, payment), `2be44bd` (advisor).

## Screens ported

| Screen | Reads | Writes |
|---|---|---|
| Home `/` | `GET /api/courses?sort=popular&limit=4`; product window: `GET /api/courses/:slug` of the top course | - |
| Catalog `/courses` | `GET /api/courses`, `POST /api/courses/ownership` | add to cart, free enrolment |
| Course detail `/courses/:slug` | `GET /api/courses/:slug`, `GET /api/courses/:slug/lesson-kinds` (new), ownership, `GET /api/learner/overview` (progress when owned) | `POST /api/student/cart`, `POST /api/orders/buy-now`, `POST /api/courses/enroll-free` |
| Cart `/cart` | `GET /api/student/cart?voucher=` | `DELETE`/`POST /api/student/cart` (remove + undo), `POST /api/vouchers/validate`, `POST /api/orders/checkout` (incl. `replaceOrderId`), `POST /api/orders/cancel` |
| Checkout `/checkout?order=CODIxxxxx` | `GET /api/orders/:id`, polled every 3 s (the server expires overdue orders) | `/api/orders/:id/manual-check`, `/api/orders/:id/new-code`, `/api/orders/cancel`, `POST /api/dev/simulate-payment` (new) |
| Success `/checkout/success?order=` | `GET /api/orders/:id` | - |
| AI advisor `/ai` | `GET /api/ai` (catalog, current course, saved intake) | `POST /api/ai`, `POST /api/ai/feedback` |

Adapters and hooks live in `frontend/src/features/commerce/commerce-api.js` (`toCourse`, `toOrder`, `useCatalog`,
`useOwnership`, `addToCart`, `buyNow`, `enrollFree`, `checkoutCart`, `simulatePayment`, `useCartCount`).
`commerce-lib.js` keeps only the pure catalogue filter/typeahead helpers; the in-browser order/voucher/transfer rules
were removed (the backend owns them), as were their unit tests.

Payment scenario (Alt+K `paymentOutcome`): `success` / `overpaid` / `underpaid` post a simulated transfer 6 s after the
checkout opens; `expired` moves the payment deadline to now; `late` expires, then pays 8 s later (the webhook honours
it); `slow` / `qrfail` send nothing; `unavailable` refuses a paid checkout before an order is created (client-side).
Ownership CTAs show a skeleton until `/api/courses/ownership` answers, so buttons never flip under the cursor.

Behaviour changes worth knowing: order URLs use the order code (`?order=CODI12345`), not the legacy `order-…` id;
category filter values are category names; the voucher code is kept in `sessionStorage` until checkout; the advisor
thread lives in `sessionStorage` per user (the backend saves the intake as the goal draft). Rating bars on the detail
page are counted from the visible reviews. A hidden course now returns 404 from the detail API, so the old
"tạm ẩn, bạn vẫn học bình thường" banner cannot show; the `?error=1` simulations were replaced by real error states.

## Backend additions / changes

- New `backend/src/app/api/courses/[slug]/lesson-kinds/route.ts`: public, published courses only →
  `{ lessons: { [lessonId]: { kind, quiz, assignment } } }` (same kind rule as the learning path).
- New `backend/src/app/api/dev/simulate-payment/route.ts`: `POST { orderCode, outcome: paid|underpaid|overpaid|expire }`,
  order owner + Origin check + JSON body; 404 when `NODE_ENV=production`. Calls the real SePay callback handler with the
  local webhook secret (never sent to the browser).
- Vendored lib fixes (minimal): `lib/course-ownership-server.ts` and `lib/buy-now.ts` ignore a pending
  `student_transactions` row whose order exists (the same rule `lib/add-course-to-cart.ts` already uses). Without it,
  an expired order left the course "pending-payment" forever and "Mua ngay" reopened the expired code.

## Stays on the legacy store

Nothing in commerce. The AI advisor's `Codi.github` suggestion card still depends on the shell's GitHub feature.

## Shared-file changes needed (controller)

- `frontend/src/features/shell/header.jsx` lines ~98 and ~121 read `Codi.cart().length` (legacy store), so the cart
  badge is wrong now. Replace with `useCartCount()` from `../commerce/commerce-api` (returns the backend cart count,
  `null` until loaded; it refreshes after every cart/order write).
- Other features linking to checkout must use the order code: `/checkout?order=<code>` (e.g. profile transactions).
- `e2e/flow.js` still resets/reads the legacy snapshot (`/api/reset`, `db.orders`, `db.enrolments`) and will report
  "order in DB: NONE". It should pick the target via `/api/courses` + `/api/courses/ownership` and verify with
  `GET /api/orders/:code` / ownership, as in `scratchpad/e2e/commerce-backend.js`.

## Verification

- `npx vite build` (scratch outDir) passes; `cd backend && npx tsc --noEmit` clean; catalogue unit tests 4/4.
- Playwright (`scratchpad/e2e/commerce-backend.js`, `commerce-scenarios.js`), no console errors except the
  intentional 404 of an unknown slug:
  - guest: home shows 4 popular courses and a real chapter; catalog 5 rows, price filter; detail with typed lessons
    and reviews; unknown slug → "Không tìm thấy khoá học".
  - learner: add to cart → voucher REACT10 (−10%) → Thanh toán → checkout with code → simulated transfer → success
    page; after reload the detail shows "Tiếp tục học" and ownership API says `owned`.
  - scenarios: underpaid alert (495.000/990.000) then cancel returns the course to the cart; expired → "Tạo mã mới"
    opens a new code; late → expired, then paid and success (DB: order paid, enrolled).
  - lecturer: detail shows the role note, catalog CTA "Xem chi tiết".
  - advisor (learner): real answer with course cards and ownership CTAs, vote sent, thread kept after reload.

## Unresolved questions

- The SePay webhook route sits behind the same Vite proxy; real SePay delivery is not exercised locally (by design).
