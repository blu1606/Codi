# Codi — Design Guidelines (tokens + component baseline)

Scope: design tokens + shadcn/ui baseline for the auth slice and near-term course UI. No mockups. Verified 2026-09-21.

## 0. Verified stack facts

| Thing | Current | Source |
|---|---|---|
| Tailwind CSS | v4.x (v4.3.2, 2026-06-29). CSS-first `@theme`, no `tailwind.config.js`, single `@import "tailwindcss"`, Lightning CSS, oklch palette | [tailwindcss.com/blog/tailwindcss-v4](https://tailwindcss.com/blog/tailwindcss-v4), [releases.sh/tailwind-css](https://releases.sh/tailwind-css) |
| shadcn/ui theming | oklch CSS vars in `:root`/`.dark` **outside** `@layer base`, mapped via `@theme inline { --color-*: var(--*) }`. No `hsl()` wrapper | [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4), registry `r/colors/neutral.json` (fetched, confirms oklch + `--radius: 0.625rem`) |
| Registry deps | `radix-ui` (single pkg, not `@radix-ui/react-*`), `tw-animate-css` (replaces `tailwindcss-animate`), `class-variance-authority`, `lucide-react` | `ui.shadcn.com/r/styles/new-york-v4/index.json` (fetched) |
| CLI | `npx shadcn@latest init` / `add` | same |

Use **new-york** style. Dark mode = `.dark` class on `<html>` via `next-themes`.

## 1. Typography

Vietnamese coverage **empirically verified** — fetched `fonts.googleapis.com/css2` for each family and confirmed a `unicode-range` block labelled `/* vietnamese */` (U+0102-0103, 0110-0111, 0128-0129, 0168-0169, 01A0-01B0, 1EA0-1EF9, 20AB).

| Role | Family | Why |
|---|---|---|
| Body / UI | **Be Vietnam Pro** | Designed by LAM Type as a Vietnamese/Latin neo-grotesque — diacritic stacking (hook-above over circumflex, `ế ệ ộ ở`) is drawn, not auto-composed. Carries the diacritic-dense running text at 14–16px where collisions actually hurt. 9 weights. Credible/neutral, not flashy. |
| Display / headings | **Lexend** | Wide apertures + low-noise shapes from Shaver-Troup reading-proficiency research — defensible for a learning product. Full Vietnamese subset. Set tighter tracking at ≥30px so it does not read as childlike. |
| Code | **JetBrains Mono** | Tall x-height, disambiguated `l 1 I 0 O` (dotted zero, serifed `1`, tailed `l`), designed for long code reading. Vietnamese subset present (inline `ậ` in prose-in-code renders). |

Rejected: Inter/Poppins (banned + generic), Plus Jakarta Sans (weaker diacritic fitting), Manrope (only 800 max, geometric `l`/`1` confusion), Source Sans 3 (good but reads "documentation", less product).

**Ligatures off for code** — `font-variant-ligatures: none` on `<code>`/editor. Beginners must see `=>` and `!=` as literal characters.

### Type scale (1.200 minor third, 16px base)

| Token | px / rem | Weight | Line-height | Tracking | Use |
|---|---|---|---|---|---|
| `display` | 48 / 3rem | 700 Lexend | 1.05 | -0.02em | Marketing hero only |
| `h1` | 36 / 2.25rem | 700 Lexend | 1.15 | -0.015em | Page title |
| `h2` | 28 / 1.75rem | 600 Lexend | 1.25 | -0.01em | Section |
| `h3` | 22 / 1.375rem | 600 Lexend | 1.3 | -0.005em | Card title |
| `lg` | 18 / 1.125rem | 400/500 BVP | 1.55 | 0 | Lede, lesson body |
| `base` | 16 / 1rem | 400 BVP | 1.6 | 0 | Body — default |
| `sm` | 14 / 0.875rem | 400/500 BVP | 1.5 | 0 | UI labels, inputs, buttons |
| `xs` | 12 / 0.75rem | 500 BVP | 1.4 | 0.01em | Helper, error, badge, timestamp |
| `code` | 14 / 0.875rem | 400 JBM | 1.6 | 0 | Inline + block code |

Body copy never below 14px. Vietnamese needs the 1.5–1.6 line-height floor — stacked diacritics add ~0.12em above cap-height and clip at 1.3.

### `next/font` setup — `app/fonts.ts`

```ts
import { Be_Vietnam_Pro, Lexend, JetBrains_Mono } from "next/font/google";

const S = { subsets: ["latin", "vietnamese"] as const, display: "swap" as const };
export const sans = Be_Vietnam_Pro({ ...S, weight: ["400","500","600","700"], variable: "--font-sans" });
export const display = Lexend({ ...S, weight: ["600","700"], variable: "--font-display" });
export const mono = JetBrains_Mono({ ...S, weight: ["400","500","700"], variable: "--font-mono" });
```

`app/layout.tsx`: `<html lang="vi" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>`. Set `lang="vi"` — it drives hyphenation and screen-reader pronunciation; switch per-locale if i18n lands.

## 2. Color system

**Brand hue: deep cyan-teal, oklch hue ~207** (`oklch(0.52 0.128 207)` = `#007c8e`). Rationale: reads technical/terminal-adjacent without the hacker-green cliché; it is not the default `blue-600` every Next.js template ships, not the AI-product violet, and not the red-heavy palette that dominates Vietnamese ed-tech incumbents. Teal also leaves the warm half of the wheel free for the amber "in-progress" and the mastery gradient's top end.

Targets: **WCAG 2.1 AA** — 4.5:1 body text, 3:1 large text + UI/graphic boundaries + focus rings. All values below were computed (oklch → sRGB → relative luminance) and are listed with measured ratios.

| Token | Light | ratio | Dark | ratio |
|---|---|---|---|---|
| `background` / `foreground` | `oklch(1 0 0)` / `oklch(0.20 0.015 250)` | 18.1 | `oklch(0.18 0.012 250)` / `oklch(0.96 0.003 250)` | 16.7 |
| `muted-foreground` | `oklch(0.50 0.015 250)` | 5.99 | `oklch(0.72 0.012 250)` | 7.59 |
| `primary` (white/dark fg on it) | `oklch(0.52 0.128 207)` | 4.93 | `oklch(0.80 0.115 200)` | 10.1 |
| `success` | `oklch(0.50 0.135 155)` | 5.55 | `oklch(0.78 0.145 155)` | 9.58 |
| `warning` | `oklch(0.53 0.145 70)` | 5.42 | `oklch(0.82 0.145 80)` | 10.2 |
| `destructive` | `oklch(0.52 0.20 27)` | 6.11 | `oklch(0.70 0.185 25)` | 6.23 |
| `info` | `oklch(0.53 0.14 265)` | 5.40 | `oklch(0.78 0.12 265)` | 8.90 |

### Mastery scale (BKT p(mastery) 0.0–1.0)

Five-stop sequential, **monotonically increasing lightness** (L 0.42→0.63 light / 0.54→0.82 dark) along a viridis-like purple→blue→teal→green→chartreuse path. Monotonic L is the property that makes it survive protan/deutan/tritan simulation *and* grayscale — hue is redundant decoration, lightness carries the data. Every stop clears **3:1 vs its background** (non-text graphic threshold).

| Stop | p range | Light | vs white | Dark | vs dark bg |
|---|---|---|---|---|---|
| `mastery-0` | 0.00–0.19 | `oklch(0.42 0.13 285)` | 8.87 | `oklch(0.54 0.15 285)` | 3.53 |
| `mastery-1` | 0.20–0.39 | `oklch(0.48 0.11 255)` | 6.56 | `oklch(0.60 0.13 255)` | 4.75 |
| `mastery-2` | 0.40–0.59 | `oklch(0.54 0.09 205)` | 4.86 | `oklch(0.66 0.10 205)` | 6.29 |
| `mastery-3` | 0.60–0.79 | `oklch(0.60 0.13 158)` | 3.71 | `oklch(0.74 0.14 158)` | 8.65 |
| `mastery-4` | 0.80–1.00 | `oklch(0.63 0.15 128)` | 3.35 | `oklch(0.82 0.17 125)` | 11.19 |

Rule: **never encode mastery by color alone.** Always pair with the numeric percentage or a label (`Chưa học / Đang học / Thành thạo`). Color is the scan layer, text is the truth layer.

### `app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);            --foreground: oklch(0.20 0.015 250);
  --card: oklch(1 0 0);                  --card-foreground: oklch(0.20 0.015 250);
  --popover: oklch(1 0 0);               --popover-foreground: oklch(0.20 0.015 250);
  --primary: oklch(0.52 0.128 207);      --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.968 0.005 240);   --secondary-foreground: oklch(0.28 0.015 250);
  --muted: oklch(0.97 0.004 250);        --muted-foreground: oklch(0.50 0.015 250);
  --accent: oklch(0.955 0.018 205);      --accent-foreground: oklch(0.34 0.09 207);
  --destructive: oklch(0.52 0.20 27);    --destructive-foreground: oklch(1 0 0);
  --success: oklch(0.50 0.135 155);      --success-foreground: oklch(1 0 0);
  --warning: oklch(0.53 0.145 70);       --warning-foreground: oklch(1 0 0);
  --info: oklch(0.53 0.14 265);          --info-foreground: oklch(1 0 0);
  --border: oklch(0.90 0.006 250);       --input: oklch(0.88 0.008 250);
  --ring: oklch(0.52 0.128 207);
  --mastery-0: oklch(0.42 0.13 285);  --mastery-1: oklch(0.48 0.11 255);
  --mastery-2: oklch(0.54 0.09 205);  --mastery-3: oklch(0.60 0.13 158);
  --mastery-4: oklch(0.63 0.15 128);
}

.dark {
  --background: oklch(0.18 0.012 250);   --foreground: oklch(0.96 0.003 250);
  --card: oklch(0.225 0.014 250);        --card-foreground: oklch(0.96 0.003 250);
  --popover: oklch(0.225 0.014 250);     --popover-foreground: oklch(0.96 0.003 250);
  --primary: oklch(0.80 0.115 200);      --primary-foreground: oklch(0.20 0.02 220);
  --secondary: oklch(0.27 0.014 250);    --secondary-foreground: oklch(0.96 0.003 250);
  --muted: oklch(0.27 0.014 250);        --muted-foreground: oklch(0.72 0.012 250);
  --accent: oklch(0.30 0.03 205);        --accent-foreground: oklch(0.93 0.02 200);
  --destructive: oklch(0.70 0.185 25);   --destructive-foreground: oklch(0.18 0.02 25);
  --success: oklch(0.78 0.145 155);      --success-foreground: oklch(0.18 0.02 155);
  --warning: oklch(0.82 0.145 80);       --warning-foreground: oklch(0.18 0.02 70);
  --info: oklch(0.78 0.12 265);          --info-foreground: oklch(0.18 0.02 265);
  --border: oklch(1 0 0 / 12%);          --input: oklch(1 0 0 / 16%);
  --ring: oklch(0.72 0.11 200);
  --mastery-0: oklch(0.54 0.15 285);  --mastery-1: oklch(0.60 0.13 255);
  --mastery-2: oklch(0.66 0.10 205);  --mastery-3: oklch(0.74 0.14 158);
  --mastery-4: oklch(0.82 0.17 125);
}

@theme inline {
  --font-sans: var(--font-sans);  --font-display: var(--font-display);  --font-mono: var(--font-mono);
  --color-background: var(--background);   --color-foreground: var(--foreground);
  --color-card: var(--card);               --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);         --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);         --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);     --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);             --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);           --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive); --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);         --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);         --color-warning-foreground: var(--warning-foreground);
  --color-info: var(--info);               --color-info-foreground: var(--info-foreground);
  --color-border: var(--border);  --color-input: var(--input);  --color-ring: var(--ring);
  --color-mastery-0: var(--mastery-0);  --color-mastery-1: var(--mastery-1);  --color-mastery-2: var(--mastery-2);
  --color-mastery-3: var(--mastery-3);  --color-mastery-4: var(--mastery-4);
  --radius-sm: calc(var(--radius) - 4px);  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);              --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; font-synthesis-weight: none; }
  code, pre, kbd { font-variant-ligatures: none; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
}
```

## 3. Spacing, radius, elevation, borders

**Spacing** — Tailwind v4 default `--spacing: 0.25rem`. Allowed steps only: `1 2 3 4 6 8 12 16 24` (4–96px). Intra-component gap `2`/`3`; label→control `2`; field→field `4`; card padding `6`; section rhythm `12` mobile / `16` desktop. Auth card max-width `24rem` (`max-w-sm`); profile form `42rem` (`max-w-2xl`).

**Radius** — base `0.625rem`. `sm` (6px) badge/tag; `md` (8px) input, button, select; `lg` (10px) card, dialog, popover; `xl` (14px) marketing panel; `full` avatar + pill.

**Elevation** — light mode uses shadow, dark mode uses **surface lightness** (`card` L 0.225 vs `background` L 0.18) plus a 1px `--border`; dark shadows are near-invisible and just add mud. Levels: `0` flat/inline; `shadow-xs` card at rest; `shadow-sm` hover/dropdown; `shadow-md` dialog/sheet. Nothing above `md`.

**Borders** — 1px `--border` everywhere. Inputs use `--input` (slightly darker than `--border`, so the interactive affordance survives without a fill). Focus ring: `ring-[3px] ring-ring/50 border-ring`, never `outline: none` without a replacement. Error state swaps to `border-destructive ring-destructive/20`.

## 4. Component baseline — auth slice

```bash
npx shadcn@latest init
npx shadcn@latest add button input label field form card separator checkbox \
  alert sonner avatar dialog alert-dialog dropdown-menu tabs badge \
  input-otp progress skeleton spinner tooltip
```

| Component | Used by | Customization needed |
|---|---|---|
| `field` | every form | Primary a11y backbone — composes label + control + description + error and wires `aria-describedby`/`aria-invalid`. Prefer over hand-rolled markup. |
| `form` | all forms | react-hook-form + zod resolver. |
| `button` | all | Add `variant="google"` (white/`--card` bg, `--border` 1px, official mark SVG) and wire `disabled` + `<Spinner>` into a `loading` prop. |
| `input` | all | Add `type="password"` show/hide toggle as a composed `PasswordInput` — the toggle is an `<button type="button" aria-pressed>`, not a div. |
| `input-otp` | email verification | 6 digits, `inputMode="numeric"`, auto-submit on complete, paste-whole-code support. |
| `progress` | password strength, mastery bar | Needs a color-by-value variant; add `aria-valuetext` in words, not just a number. |
| `avatar` | profile, header | Fallback = initials from full name; Vietnamese names — take first char of **last** word (given name), e.g. "Nguyễn Hoàng Vân" → `V`. |
| `dialog` / `alert-dialog` | avatar upload, delete-account confirm | `alert-dialog` only for destructive confirm. |
| `sonner` | async feedback | Toast for *success* only; errors stay inline in the form. `richColors`, `position="bottom-right"` desktop / `top-center` mobile. |
| `alert` | form-level errors | `variant="destructive"` for the submit-failure summary block. |
| `tabs` | profile view / edit | |
| `skeleton` / `spinner` | loading | Skeleton for page/data load, spinner for in-button action. |

Not yet: `table`, `sheet`, `calendar`, `command`, `chart` — YAGNI until course/admin UI.

## 5. Form + validation UX

| Concern | Convention |
|---|---|
| Validation timing | `mode: "onTouched"` + `reValidateMode: "onChange"`. Never validate while first typing. |
| Error placement | Inline, **below** the control, 12px `--destructive`, with a 14px alert icon. `role="alert"` so it announces on appear. |
| Summary | Only for server/submit-level failures (bad credentials, rate limit, network). `<Alert variant="destructive">` above the first field, focused programmatically on arrival. Do **not** duplicate per-field errors into the summary. |
| Loading | Button `disabled` + `aria-busy="true"` + inline `<Spinner>`; label swaps to a verb ("Đang tạo tài khoản…"). Keep button width stable to avoid layout shift. Disable inputs too, do not unmount them. |
| Success | Redirect + `toast.success`, or inline `--success` state for in-place saves (profile edit). Never a bare toast for a destructive/irreversible action. |
| Password strength | zxcvbn-style score → segmented 4-bar meter using `mastery`-independent colors (`destructive → warning → success`). Meter is advisory, **not** a hard gate; the hard rule is min length (≥8) + not-breached. Announce via `aria-live="polite"` with words: "Mật khẩu yếu / trung bình / mạnh". |
| Server field errors | Map to RHF `setError(field, …)` so they render in the same place as client errors. |
| Autofill | Correct `autoComplete`: `email`, `new-password`, `current-password`, `one-time-code`, `name`. Password managers break silently without these. |

**A11y requirements (non-negotiable):** every control has a real `<label htmlFor>`; placeholder is never the label. Invalid controls get `aria-invalid="true"` and `aria-describedby` pointing at *both* helper text and error ids. After a failed submit, move focus to the summary alert (or the first invalid field) — do not rely on scroll. Async errors land in an `aria-live="assertive"` region; async status (e.g. "Đang gửi lại email…") in `aria-live="polite"`. Never `aria-live` a region that also receives focus — it double-announces.

## 6. Accessibility baseline

- **Focus visible:** `:focus-visible` only, `ring-[3px] ring-ring/50` + `border-ring`. Ring must clear 3:1 against the adjacent surface — verified: light `#007c8e` 4.93 vs white, dark `#35b9c0` 7.92 vs `#0e1217`.
- **Targets:** ≥44×44px on touch. Small icon buttons get an invisible expanded hit area (`before:absolute before:-inset-2`), not a bigger glyph. Adjacent targets ≥8px apart.
- **Motion:** global `prefers-reduced-motion` block above. Default transitions ≤200ms, `ease-out`. No parallax, no auto-playing motion in auth.
- **Dark-mode contrast check:** all dark tokens verified against `--background` `#0e1217` and `--card` `#171c22`; lowest is `destructive` at 5.89 on card (passes AA text). Never reuse a light-mode brand value in dark — `oklch(0.52 …)` on a dark surface is ~2.3:1.
- Do not disable zoom. `<meta name="viewport" content="width=device-width, initial-scale=1">` with no `maximum-scale`.
- Vietnamese: test every string with `ễ ộ ự ằ Đ` at 12px and in `xs` badges — clipping shows up first in tight line-heights and uppercase transforms. **Avoid `text-transform: uppercase` on Vietnamese** — uppercase diacritics (`Ễ Ộ`) collide with the line above and hurt readability.

## 7. Avatar upload UX

Recommendation: **no in-app cropper for MVP.** Center-crop to square client-side, cap at 2MB, downscale to 512×512 with `createImageBitmap` + canvas before upload. A cropper is a real component with drag/zoom/keyboard-accessibility cost, and avatars render at ≤96px — the payoff is negligible. Revisit if users complain.

| State | Treatment |
|---|---|
| Empty | Initials on `--secondary`, `--secondary-foreground` text, `rounded-full`. Never a generic grey person glyph — initials are faster to scan in lists. |
| Hover / focus | Dim overlay `bg-foreground/50` + camera icon + label "Đổi ảnh". Keyboard-reachable: the whole avatar is a `<button>` opening the file picker; `:focus-visible` shows the same overlay plus the ring. |
| Uploading | Keep the old image, overlay a determinate ring at 60% opacity + percentage. `aria-live="polite"` announces start and completion once each, not per percent. |
| Success | Crossfade to new image 150ms + brief `--success` ring. No toast (the change is visible). |
| Error | Revert to previous image, inline `--destructive` text below with the actual cause ("Ảnh quá 2MB" / "Chỉ nhận JPG, PNG, WebP") and a Retry button. Never a bare "Upload failed". |
| Remove | Secondary text button under the avatar → `alert-dialog` confirm → back to initials. |

Accept `image/jpeg,image/png,image/webp`. Validate MIME **and** magic bytes server-side; client `accept` is a hint, not a control.

## Unresolved questions

1. Brand — is there an existing Codi logo/color mandated by the SWP391 brief? The teal is chosen on product grounds and will need to yield to an existing mark.
2. Locale default — is the UI Vietnamese-first with English content, or fully bilingual with a switcher? Affects `lang`, font subsetting, and string-length budgets in buttons.
3. Mastery bands — are the 5 bands (0.2 width) the ones the BKT model actually reports against, or does the backend define different thresholds (e.g. 0.95 = mastered)? Tokens are band-count-agnostic but the mapping table must match the model.
4. Avatar storage — S3/R2 presigned upload vs API passthrough? Changes the progress/error states (presigned gives real byte progress, passthrough usually does not).
5. Does the auth slice need MFA/TOTP? If yes, `input-otp` gets a second usage and the component list needs `qr-code` handling.
