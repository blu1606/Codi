# Codi design tokens — mockup → `packages/ui`

The values below come from `css/app.css :root` and `css/charts.css`. They are **binding**: every screen in
`apps/web` must render with these values. Layout and composition are free; colours, type, radius, spacing scale and
the mastery/chart palettes are not.

Today `packages/ui/src/styles/globals.css` still ships the default shadcn neutral palette and `Inter Variable`.
Porting this file into it is the first foundation task; until then do not hand-roll replacements per page.

## How to use in code

- Use shadcn/Tailwind semantic classes only: `bg-primary`, `text-muted-foreground`, `border-border`,
  `bg-success-soft text-success`, `bg-mastery-3`… Never primitive palette classes (`text-red-500`, `bg-cyan-700`)
  and never hex in TSX. `pnpm run check:standards` enforces this.
- Dark mode = `.dark` on `<html>` (next-themes). Every token below has a dark value; define both.
- Status is never colour-only: pair with icon or text (`Đã thanh toán`, `Chờ duyệt`, mastery text label).

## Colour — semantic mapping

| Mockup var | Light | Dark | shadcn var (globals.css) | Tailwind class |
|---|---|---|---|---|
| `--canvas` / `--bg` | `#ffffff` | `#0f172a` | `--background` | `bg-background` |
| `--surface` | `#ffffff` | `#1e293b` | `--card`, `--popover` | `bg-card` |
| `--subtle` | `#f1f5f9` | `#1e293b` | `--muted`, `--secondary` | `bg-muted` |
| `--fg` | `#111827` | `#f1f5f9` | `--foreground`, `--card-foreground` | `text-foreground` |
| `--muted` (text) | `#475569` | `#cbd5e1` | `--muted-foreground` | `text-muted-foreground` |
| `--faint` | `#64748b` | `#94a3b8` | `--faint` (add) | `text-faint` |
| `--border` | `#e5e7eb` | `#334155` | `--border`, `--input` | `border-border` |
| `--border-strong` | `#cbd5e1` | `#475569` | `--border-strong` (add) | `border-border-strong` |
| `--accent` | `#0e7490` | `#06b6d4` | `--primary`, `--ring` | `bg-primary`, `ring-ring` |
| `--accent-hover` | `#155e75` | `#0891b2` | `--primary-hover` (add) | `hover:bg-primary-hover` |
| `--accent-active` | `#164e63` | `#0e7490` | `--primary-active` (add) | `active:bg-primary-active` |
| `--accent-on` | `#ffffff` | `#0f172a` | `--primary-foreground` | `text-primary-foreground` |
| `--accent-soft` | `#ecfeff` | `#164e63` | `--accent` | `bg-accent` |
| `--accent-soft-border` | `#a5f3fc` | `#0e7490` | `--accent-border` (add) | `border-accent-border` |
| `--success` / `-soft` | `#15803d` / `#f0fdf4` | `#22c55e` / `#1b4d2e` | `--success`, `--success-soft` (add) | `text-success`, `bg-success-soft` |
| `--warn` / `-soft` | `#b45309` / `#fffbeb` | `#eab308` / `#4a3d0f` | `--warning`, `--warning-soft` (add) | `text-warning`, `bg-warning-soft` |
| `--danger` / `-soft` | `#dc2626` / `#fef2f2` | `#ef4444` / `#4d1f1f` | `--destructive`, `--destructive-soft` (add) | `text-destructive`, `bg-destructive-soft` |
| `--info` / `-soft` | `#0369a1` / `#f0f9ff` | `#3b82f6` / `#1e3a5f` | `--info`, `--info-soft` (add) | `text-info`, `bg-info-soft` |
| `--star` | `#b45309` | `#eab308` | `--star` (add) | `text-star` |
| `--overlay` | `rgba(15,23,42,.45)` | `rgba(0,0,0,.65)` | `--overlay` (add) | dialog/sheet overlay |

`--accent-foreground` (shadcn) = `--accent` mockup (`#0e7490` / `#06b6d4`) so soft-teal chips read as teal text.
Every "(add)" var also needs a `--color-*: var(--*)` line in `@theme inline`.

## Mastery scale (5 stops, always with text "Chưa học / Đang học / Thành thạo")

| Stop | Light | Dark | Var |
|---|---|---|---|
| 0 | `#cbd5e1` | `#475569` | `--mastery-0` |
| 1 | `#94a3b8` | `#64748b` | `--mastery-1` |
| 2 | `#67b7c9` | `#06b6d4` | `--mastery-2` |
| 3 | `#1f8fa8` | `#0891b2` | `--mastery-3` |
| 4 | `#0e7490` | `#06b6d4` | `--mastery-4` |

Reference component: `Codi.ui.mastery(level)` in `js/core.js`.

## Charts palette (`css/charts.css`)

Port the `--viz-*` block (light + dark) unchanged as `--chart-*`/`--viz-*` vars: series `--viz-1…5`
(`#007f9e #eb6834 #4a3aa7 #eda100 #e87ba4`), previous period `--viz-prev #8b95a5` (dashed), goal/threshold
`--viz-ref #b45309` (dashed), grid/axis, status good/warning/serious/critical, sequential ramp `--viz-s0…s4`.
Chart rules are in `PRODUCT.md` §7.21 (no radar, donut only for a single quiz result, n < 20 warning…).

## Typography

| Role | Family | Tailwind |
|---|---|---|
| Body / UI | Be Vietnam Pro 400/500/600/700 | `font-sans` (replace `Inter Variable`) |
| Headings h1–h4 | Lexend 500/600/700, `letter-spacing: -0.01em`, line-height 1.25 | `font-display` |
| Code | JetBrains Mono 400/500, ligatures off | `font-mono` |

Scale: xs 12 · sm 14 · base 16 (line-height 1.55) · lg 20 (h3) · xl 24 (h2) · 2xl 32 (h1) · 3xl 40. Load via
`next/font/google` with `subsets: ["latin", "vietnamese"]`. No `uppercase` on Vietnamese text.

## Spacing, radius, elevation, motion

- Spacing: 4px grid — 4, 8, 12, 16, 20, 24, 32, 48 (Tailwind default spacing scale already matches).
- Radius: sm 6px · md 8px · lg 12px · pill 9999px. Set explicitly in `@theme inline`
  (`--radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;`) instead of the shadcn `calc()` defaults.
- Elevation: `--elev-raised` (cards), `--elev-pop` (menus, dialogs) — values in `css/app.css`.
- Focus ring: 2px background gap + 2px `--primary` (`ring-2 ring-ring ring-offset-2`). Always visible on keyboard focus.
- Motion: fast 150ms, base 200ms, ease `cubic-bezier(0.2, 0, 0, 1)`; respect `prefers-reduced-motion`.
- Layout: header 64px, content max-width 1200px. Touch targets ≥ 44px.

## Exceptions

`.login-cyber-violet` in `apps/web/src/index.css` is a scoped login-page palette that predates the mockup. Keep it
scoped; do not reuse it elsewhere.
