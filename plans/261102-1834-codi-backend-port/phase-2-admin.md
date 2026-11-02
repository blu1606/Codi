# Phase 2 report: admin

Status: done. Every admin screen reads from and writes to the backend (database `codi`); the only data still taken from
the legacy store are the analytics cards that Codi itself marks unavailable. Commits: `e5df956`, `d027c51`, `060ecca`.

## Screens ported

| Screen | Reads | Writes |
|---|---|---|
| `/admin` dashboard | action `dashboard/admin/getAdminDashboardData` (KPIs, todo counts, 5 recent orders) | none (a recent order opens the order drawer) |
| `/admin/users` | **new** `GET /api/admin/users` (`{users[{id,name,email,image,createdAt,banned,banReason,roleId}],currentUserId}`) | `updateUserRole(id, 'LEARNER'/'LECTURER'/'ADMIN')`, `getUserImpactCounts(id)` (deactivate dialog), `toggleUserBan(id, true, reason)` / `toggleUserBan(id, false)` |
| `/admin/courses` | **new** `GET /api/admin/courses` (`getAdminPublishedCourses`) | `hideCourseAction`, `unhideCourseAction`, `updateCoursePriceAction` (the backend notifies the lecturer) |
| `/admin/orders` and order drawer | `getAdminOrdersExportAction(filter)` (server-side range/status/q/overdue/reconciliation filter), `getAdminOrderDetailAction(id or CODI code)` | `cancelAdminOrderAction(id, reason)`; CSV export re-queries the action with the dialog's filter |
| `/admin/vouchers` | **new** `GET /api/admin/vouchers[?filter=expiring]` | `createVoucherAction`, `updateVoucherAction`, `toggleVoucherActiveAction` |
| `/admin/publication` | `dashboard/admin/publication/getAdminPublicationQueue(tab)`, `getAdminCourseReview(courseId)` | `saveCriterionVerdict`, `applyAutoCriteria`, `addReviewFlag` (admin and accepted AI suggestions), `updateFlagStatus`, `deleteReviewFlag` (undo re-adds the flag), `approvePublication`, `requestChanges`, `rejectPublication` |
| `/admin/insights`, `/admin/insights/:card` | `GET /api/admin/insights/overview?period=` | none |
| `/admin/finance`, `/admin/finance/:card` | `GET /api/admin/finance/overview?period=` | none |
| Admin shell badge | `getAdminPublicationQueue('pending')` counts | none |

`frontend/src/features/admin/admin-data.js` holds the small access layer: `useAdminGet(url)` (useApi plus a re-fetch
after any admin write), `useAction(module, name, args)`, `attempt(fn, successToast)` (toasts the server's Vietnamese
error message) and `notifyAdminChange()`, so the order drawer, which renders in an overlay, refreshes the page behind it.
Loading states use `SpinnerBlock` / `viz-skeleton`; load failures show an `Alert` with "Thử lại".

The AI pre-check in the review screen is deterministic and runs on the review payload in the browser, as in Codi's
`publication-review-client`. `publication-rules.js` mirrors `CRITERIA`, `materialOk` and `aiPrecheck` from
`backend/src/lib/publication-service.ts` (a backend lib cannot be imported by the frontend).

## Backend additions

Three GET route files under `backend/src/app/api/admin/`, ADMIN only (401/403), `Cache-Control: private, no-store`, 500 with
a Vietnamese message on failure: `users/route.ts` (same query as Codi's users page, one row per user with the primary
active role), `courses/route.ts` (`getAdminPublishedCourses`), `vouchers/route.ts` (`getAdminVouchers`). No vendored file
was changed.

## Still on the legacy store, and why

- Analytics cards that Codi marks "Chưa khả dụng": A4 retention, A6 start choice, A9 AI health, the A8 grading-time median
  and B5 checkout funnel. The backend has no source for them (no study log per week, no AI usage log, no checkout events),
  so `admin-metrics.js` `withStoreCards()` still computes them from the store rows, over the same window as the backend data.
- The analytics period choice (`analyticsPrefs` slice) is a UI preference and stays in the store.
- `review-api.js` (`Codi.review`) is still imported by `routes.jsx` because the lecturer workspace reads it; the admin
  screens no longer use it.

## Behaviour that changed with the backend

- Deactivation shows the reason but no date: the `user` table has `banReason` only.
- The cancel reason in the order drawer comes from `failReason` ("Quản trị viên huỷ: …") and the timeline label.
- A criterion note is saved when the field loses focus and only once a verdict is chosen (the backend keeps no row
  without a status); the note field is disabled until then.
- Question and test flags have no item id in the backend, so their per-item counts match by target label.
- Approved-tab courses with no publication request show the "duyệt trước khi có quy trình duyệt chi tiết" card.
- The dashboard revenue is Codi's `getAdminDashboardData` (paid orders by paidAt in the last 30 × 24 h), which can differ
  slightly from finance B1, which uses GMT+7 calendar days.
- Payment manual check is learner-only in Codi (`POST /api/orders/:id/manual-check`, owner); there is no admin manual check.

## Shared-file changes needed (for the controller)

- `frontend/src/features/shell/nav-config.js` imports `needsReconciliation` from `admin/admin-metrics.js` (still exported).
  If the top-nav "Đơn hàng" badge should match the backend, compute it from `getAdminDashboardData().todo` instead of the store.
- E2E (`smoke.js` / `flow.js`): admin checks that read `Codi.db()` users, vouchers or orders should read the API instead.

## Verification

- `npx tsc --noEmit` in `backend`: clean.
- Full `vite build` was blocked by other areas' work in progress (`shell/profile-page.jsx` imports a missing `activitiesOf`).
  An esbuild bundle of `features/admin/routes.jsx` (all admin modules) resolves every import cleanly.
- Playwright as usr-admin-001 (`scratchpad/admin-p2/admin-e2e.js`), no console errors on the admin pages:
  dashboard KPIs and recent orders, with the drawer opening; role change learner→lecturer persists across reload (then
  reverted); deactivate (impact counts, reason, consent) persists, then reactivate; voucher created and switched off,
  persisting across reload (`E2E913831`, `E2E990120` left inactive); a pending order (Hồ Bảo Thảo) cancelled with a reason,
  shown as cancelled after reload; published courses list; insights, finance and the B8 detail render, including a period
  switch; in the publication review, a criterion verdict and a flag persist; rejecting `course-next-001` moved it to "Cần
  sửa / từ chối", and the lecturer's `getPublicationData` returned `status: rejected` with the reason.
- After the reject test, `course-next-001` was put back to pending (request 2 `in_review`, my criterion and flag deleted)
  with a targeted SQL update so other areas keep their seeded pending course. The "Khoá học bị từ chối" notification to
  usr-lecturer-001 remains.

## Unresolved questions

- None blocking. If the owner wants an admin manual payment check, it needs a new backend action (Codi has none).
