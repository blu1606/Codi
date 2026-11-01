# UI polish: admin area (2026-11-02)

Scope: /admin, /admin/courses, /admin/users, /admin/orders (incl. drawer), /admin/vouchers, /admin/publication,
/admin/insights (+ /:card), /admin/finance (+ /:card). Operate mode: refinement of the incumbent world, no redesign,
no behaviour/data/route changes. Copy kept verbatim except one added status line on Users.

Method: impeccable polish pass with a lightweight inline critique. The full dual-agent critique and the snapshot
step were skipped, so the critique counts as a degraded run. Each route was screenshotted at 1366x900 and 390x844
in light and dark mode before and after the changes (scratchpad `e2e/admin/{before,vp,after*,final}`).

## Changes

| Route | Problem seen | Fix |
|---|---|---|
| Insights / Finance (+ detail) | Wrapped in `.page stack-5`. `.stack-5` does not exist, so section headings sat flush on the cards, and `.page` added a second container inset, so these pages were misaligned with every other admin page (h1 32px lower and 16px further right; mobile content inset twice). | Replaced with `stack-4 ad-analytics`. Section heads get `--space-8` above (`--space-6` on mobile). The not-found branch no longer uses `.page`. |
| Finance B1 detail | KPI values (`37.590.000 ₫`) overflowed their tiles and clipped labels at 1366px. | Scoped to `.ad-analytics`: KPI min column is now 190px and the value font is `clamp(20px,1.7vw,24px)`. charts.js is untouched. |
| Users | Mobile page overflowed by 389px: the absolutely positioned `.sr-only` labels in the rows escaped the table scroller. | `.ad-table-wrap { position: relative }` on the users table. |
| Users | Filter chips rendered as underlined links. Long names wrapped under the avatar. The role select got squeezed to "Học viê". The chip groups used inline margins. | Added an `.ad-chips` cluster (no underline, consistent gap), set the name cell to nowrap and gave `.ad-role` a 136px minimum width. |
| Users (109 rows) | The real app (`Codi/apps/web/.../admin/users`) has no pagination, so I kept it simple: no pager. | Added a "N / 109 tài khoản khớp bộ lọc" status line when any filter is active. Denser rows now that names don't wrap. |
| Orders | The time segmented control wrapped every label onto two lines ("7 / ngày"). | Added `.ad-filters-orders`: the first grid track is `minmax(300px,max-content)` and the segments are nowrap and full width. On mobile it falls back to one column. |
| Courses | Course titles wrapped into 2–3 lines in a narrow column. Lecturer names wrapped. The ghost action buttons read as plain bold text with no affordance. | Title column min 240px, lecturer nowrap, and the actions now use `btn-secondary btn-sm`, which matches the Users and Vouchers rows. |
| Dashboard | The "Mở danh sách" links in the "Cần xử lý" tiles sat at different heights. The entry-card unit ("học viên mới") wrapped into a cramped right column. | `.ad-todo` tiles are flex columns with the link pinned to the bottom; `.ad-entry-unit` is nowrap. |
| Publication | The sticky "Kết luận" card covered about 40% of the 900px viewport and hid the criteria being graded. The content tree's active item used a 3px side stripe (a craft-floor ban), and the chapter labels were `uppercase` (the brand forbids uppercase Vietnamese). | The decision card is now static; it follows the review card, which is the order the reviewer works in. The active tree item uses the soft accent background plus weight. Chapter labels are semibold, not uppercase. These `.rv-*` rules are shared with the lecturer publish tab and only lose the stripe and uppercase there. |

Vouchers and the order drawer looked fine in both themes and needed no change. Dark mode was checked on every route
and no issues were found.

## Files
- src/features/admin/admin-analytics.jsx: container classes.
- src/features/admin/admin-users.jsx: chip clusters, filter result line, table/name-cell classes.
- src/features/admin/admin-orders.jsx: filter grid class.
- src/features/admin/admin-courses.jsx: column classes, action button variant.
- src/features/admin/admin-dashboard.jsx: `ad-todo` tile class.
- src/styles/admin.css: the rules above; removed the sticky decision rule, the side stripe and the uppercase.

## Verify
- `npx vite build` into scratchpad/build-admin passes (only the existing chunk-size warning).
- Every admin route at 1366 and 390, light and dark: no console errors, no horizontal page overflow.

## Shared change requests
- app.css: `.table-wrap { position: relative; }` globally. Any table with `.sr-only` labels inside cells can widen
  the page on mobile, as /admin/users did. I fixed it locally with `.ad-table-wrap`.
- admin.css still has global `.stat-value` / `.text-danger|warn|success` rules that predate this pass. I left them
  alone because other areas may rely on them; they could be moved to app.css or scoped.
- `.split-view` list column (shared) is wide for the publication queue that usually has one item; optional.
