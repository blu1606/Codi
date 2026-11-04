# Navbar + global search — 2026-11-02

Status: DONE. Mode: Operate, inheriting the incumbent world (teal accent, Lexend / Be Vietnam Pro / JetBrains Mono, light + dark).
The impeccable context loader ran. As a subagent I had no question tool, so the brief was taken as final.

## What changed

| File | Change |
|---|---|
| `src/features/shell/nav-config.js` (new) | Role nav items with live counts, account links, searchable pages + keywords, and `normalize()` (NFD, strip marks, đ→d). |
| `src/features/shell/global-search.jsx` (new) | Command palette, `SearchTrigger`, `openSearch()`, Ctrl/Cmd+K and `/` shortcuts. |
| `src/features/shell/brand-link.jsx` (new) | `/brand/codi-logo.svg` + "Codi" link to the role home. Falls back to the CSS "C" mark if the image fails to load. |
| `src/features/shell/header.jsx` | Rewritten as one header for all roles, with a left drawer at ≤1024 px and updated account menu items. |
| `src/features/shell/dev-drawer.jsx` | The toggle is now `DevToggle`, a 40 px icon button in the header actions. Its accessible name stays "Kịch bản thử nghiệm", and Alt+K still works. |
| `src/features/shell/github-api.jsx` | The GitHub consent brandline uses the logo mark instead of a book icon. |
| `src/components/layout/app-layout.jsx` | The focus header uses `BrandLink` (to the role home) and `DevToggle`. The exit link is kept. |
| `src/styles/app.css` | Removed the dead `.main-nav` rules and restyled the dev toggle/drawer block. New block: `APP HEADER + GLOBAL SEARCH`. |

## Behaviour

- **Nav per role:**
  - Guest: Khoá học, Lộ trình AI.
  - Learner: Bàn làm việc, Khoá học, Học tập, Thống kê, AI tư vấn.
  - Lecturer: Tổng quan, Khoá học của tôi, Chấm bài (badge), Hỏi đáp (badge), Doanh thu.
  - Admin: Tổng quan, Duyệt xuất bản (badge), Người dùng, Đơn hàng (badge), Tài chính.
- **Badge sources:**
  - Lecturer badges use `counts()` from the lecturer sidebar.
  - Admin publication badge counts pending courses, the same query as the sidebar.
  - The orders badge counts `needsReconciliation`, which is the orders page's own "Cần đối soát" filter.
- **Active state:** the active item gets `aria-current="page"` on nested routes, teal text, and a 3 px teal rail on the header's bottom rule.
- **Width:** the header is 1440 px wide by default. Pages with `.ln-split` or `.workspace` get a full-width variant with 24 px padding, so the brand lines up with `.ln-bar` and the workspace nav (measured x=24 in both).
- **Narrower screens:**
  - Below 1280 px, nav icons and the user's first name are hidden.
  - At ≤1024 px, a hamburger opens a left `<Sheet>` (focus trap, Esc, focus returns to the button). It contains search, the nav items with badges, the cart, account links, the theme options, and Đăng xuất.
  - At ≤1024 px, search becomes an icon button.
  - At ≤640 px, guests see only "Đăng nhập" in the header; "Đăng ký" is in the drawer.
  - At ≤420 px, the header theme button is hidden; theme is still in the drawer and account menu.
- **Search palette:**
  - Semantics: `role="dialog"`, `aria-modal`, a labelled combobox, and a grouped listbox with `aria-activedescendant`.
  - Keys: arrows (Ctrl+Home/End jump to the ends), Enter opens, Esc clears the query and then closes, Tab stays inside, and focus is restored on close.
  - Groups are ordered by their best match, with at most 6 items each. Courses, users and orders add a "Xem tất cả n …" row when there are more.
  - Sources:
    - Published courses; owned courses come first, marked "Đang học" and linked to `/learn/:id`.
    - Lessons of owned courses (learner) or own courses (lecturer, linked to the editor).
    - Role pages.
    - Learner: their own orders.
    - Lecturer: pending submissions and questions.
    - Admin: courses awaiting review, users, orders and vouchers.
    - Actions: theme switch, Đăng xuất, and "Hỏi AI Codi: q" (`/ai?prompt=`).
  - An empty query shows recent picks (localStorage per user, wrapped in try/catch and validated) and suggested pages.
  - With no results, it shows an empty state and keeps the AI action.
  - Matching is case- and diacritic-insensitive ("gio hang", "nguyen").
  - Respects `prefers-reduced-motion`.

## Verification

- `npx vite build`: passes (only the existing chunk-size warning).
- Playwright `e2e/nav.js` (screenshots in `scratchpad/e2e/nav/`):
  - All four roles at 1440 and 390 px, light and dark, with the drawer open at 390.
  - No horizontal overflow, header height 64, logo image loads.
  - No header target under 44 px except the 40 px dev toggle, which the controller specified.
- Search results (top results per group):

| Query | Guest | Learner | Lecturer | Admin |
|---|---|---|---|---|
| props | React course | lesson "Truyền dữ liệu bằng Props" | same lesson, linked to the editor | React course |
| gio hang | Giỏ hàng | Giỏ hàng | AI only | AI only |
| CODI | pages | the learner's own orders (added after the first run) | AI only | orders `CODI…` plus users `@codi.vn` |
| nguyen | AI only | AI only | submission by Nguyễn Minh Anh, plus lessons/questions | users Nguyễn … |

- Keyboard-only test:
  - "/" opens the palette with the combobox focused.
  - Arrows move `aria-activedescendant` and `aria-selected`.
  - Focus stays trapped after 4 Tabs.
  - Enter navigates to `/insights/knowledge-map`.
  - Esc returns focus to the trigger.
  - With no results, Enter runs the AI action and goes to `/ai`.
- `node smoke.js`: no FAIL.
- `node axe.js`: no violations.
- New `e2e/axe-nav.js`: no violations. It covers the open palette (empty and with a query) and the open drawer, for 4 roles × light/dark × 1440/390. It caught a yellow `<mark>` background and a scroll region that keyboard users could not reach; both are fixed.

## Concerns / follow-ups

- `src/features/commerce/home-page.jsx:163` still draws the old CSS "C" mark in the home page footer/hero. It is outside my file ownership; the commerce owner should switch it to `<BrandMark />` from `src/features/shell/brand-link.jsx`.
- The palette and its shortcuts are mounted by the default header only. Focus-layout pages (checkout, settings, onboarding, Tutor) keep their exit-only header by design.
- The dev toggle lives in the header next to the brand at narrow widths. It is prototype-only, but it now appears in header screenshots.
- No unit test file was added. The matching logic is covered by the Playwright query runs. If a `vitest` unit test for `normalize` and highlight is wanted, it can go in `src/features/shell/`.
