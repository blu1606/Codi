# UI polish: commerce + shell

Area: commerce-shell. Routes: `/`, `/courses`, `/courses/react-du-an-thuc-te`, `/cart`, `/checkout` (pending order), `/checkout/success`, `/ai`, `/login`, `/register` (OTP), `/forgot-password`, `/reset-password`, `/settings`, `/profile`, global header, user menu, notification popover, toasts.

Method: I ran the impeccable critique and polish passes in a single context and checked the result with Playwright at 1366x900 and 390x844, in light and dark. Screenshots are under `scratchpad/e2e/commerce-shell/shots/{before,after1,after2,final}`. The visual identity is unchanged: same tokens, type, accent and copy.

## Root cause found across pages

Many feature rules reset `margin: 0` with the same or a higher specificity than `.stack-*`. That silently cancelled the parent's vertical rhythm. Examples: the checkout subtitle touched the progress stepper, the paragraph under a home h2 sat flush against it, the purchase card facts touched its buttons, and the cart voucher help touched the totals. I fixed this at the narrowest level: I removed the redundant resets (lists and paragraphs already get `margin: 0` from the base rules) and changed the `dl` reset to `:where()`, so a parent stack wins.

## Changes

### Home (Persuade)
- **Hero:** now a two-column grid with copy on the left (7fr) and the illustration on the right (5fr). The controller's asset `/images/hero-learner.webp` is wired in as decorative (`alt=""`, eager, high fetch priority). Below 860px the illustration moves above the copy and shrinks to 320px wide (260px on phones).
  - The copy column stands on its own if the image is removed, because `.cm-hero-media:empty` collapses.
  - The h1 now scales with `clamp(32px … 52px)` and balances onto two lines on desktop.
  - On phones the CTAs go full width and the stats row gets more room.
- **Sections:** spacing between sections is 64px (48px on mobile). The h2-to-lede gap is restored, and the features intro is widened so its h2 no longer breaks after two words.
- **Popular-course cards:**
  - Full-bleed 16:9 cover (the old crop was 1.9:1) with a darker, more readable category pill. The logo badge comes from `<Thumb>`.
  - Card body: title, then lecturer (added; uses existing data), then a meta row (level badge, learners, duration), then the CTA.
  - The loading skeleton now uses the same 16:9 ratio.
- **Mentor section:** stack spacing restored.

### Catalog course card (`course-card.jsx`)
- Full-bleed 16:9 cover. The duplicate image link is `tabIndex=-1 aria-hidden`, so keyboard and screen-reader users meet the title link only once.
- Hierarchy is title (17px, 2-line clamp), then lecturer, then level badge with **rating in bold** and duration, then an owned/in-cart badge only when relevant. The footer has a hairline divider, the price at 20px display size, and the action.
- The border strengthens when the title or cover is hovered.
- **Catalog filters on phones:** they stay two columns under the full-width search. Before, they stacked into five rows that filled the first screen.

### Course detail
- The purchase card now opens with the course cover.
- The layout moved from `layout-aside` to a named-area grid. On desktop the card stays sticky in the right column. On screens 1024px and narrower it now comes **right after the header** instead of after every review, which was a long scroll to reach the buy button.
- DOM order is header, purchase, content, so reading order matches.
- Spacing restored between lede, stats and facts. "Hỏi trợ lý AI Codi" is now a 44px tap target.

### Cart / checkout
- Cart: the h1 now comes before the pending-order and undo alerts, and the summary rhythm is restored.
- Checkout: the stepper gap is restored. The "Đang kiểm tra thanh toán…" status keeps its spinner inline instead of wrapping it onto its own line.

### Shell
- **Profile:**
  - The page is aligned to the header container (it was 1440px wide with 16px edges, out of line with the header).
  - The sidebar is narrower (300px) and the avatar is 168px instead of 320px.
  - The stat tiles stack in the sidebar, so "Ngày hoạt động" no longer wraps.
  - The h1 uses the standard page size, without the leading icon.
- **Profile on mobile:** the activity heatmap box sized itself to its 40rem content and widened the page to about 707px. It now stretches and scrolls inside its box.
- **Settings on mobile:** the stacked workspace nav row no longer stretches into a 60px empty band (this was a global `.workspace` rule; see below).

## Global changes in `src/styles/app.css` (affect every page)
1. `.list` and `.stepper` no longer declare `margin: 0`; the `ul/ol` base rule already resets it. Effect: a parent `.stack-*` now spaces these lists everywhere, as intended.
2. `.workspace` at 1024px and below: `grid-template-rows: auto 1fr`. Effect: the horizontal nav row no longer absorbs the min-height on settings, lecturer and admin pages.
3. Shell-scoped `.shell-*` rules (profile width, photo, stats, mobile heatmap), all inside the SHELL block.

## Files
- `src/features/commerce/home-page.jsx`, `course-card.jsx`, `course-detail-page.jsx`, `cart-page.jsx`, `checkout-page.jsx`, `commerce.css`
- `src/features/shell/profile-page.jsx`
- `src/styles/app.css`
- `src/styles/commerce.css` was not touched. It is an unused placeholder; the feature CSS lives in `src/features/commerce/commerce.css`.

## Verification
- `npx vite build` passes; the only warning is the existing chunk-size one.
- The commerce unit tests pass (12/12).
- No console errors on any of my routes in light or dark at desktop.
- An axe WCAG 2.1 AA scan of all my routes (light and dark, 1366 and 390) found 0 violations.

## Data note
My state-capture scripts added React to the cart and created one pending order (`CODI83589`) for usr-learner-001. They also registered a throwaway `ui…@test.vn` account at the OTP step.

## Left as is (deliberate)
- The course-detail section numbers ("01 · …") come from the source app's copy. I kept them verbatim.
- The header "Khoá học" tab stays active on `/cart` and `/checkout`. `NAV` does this on purpose.

## Shared change requests
- None required.
