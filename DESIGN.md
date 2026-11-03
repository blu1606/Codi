---
name: Codi
description: Vietnamese programming courses with an AI-ranked personal path; a light hairline workspace with one navy board per screen.
colors:
  accent-teal: "#0e7490"
  accent-teal-hover: "#155e75"
  accent-teal-active: "#164e63"
  accent-on: "#ffffff"
  accent-mist: "#ecfeff"
  accent-mist-border: "#a5f3fc"
  paper: "#ffffff"
  slate-wash: "#f1f5f9"
  ink: "#111827"
  slate-muted: "#475569"
  slate-faint: "#64748b"
  hairline: "#e5e7eb"
  hairline-strong: "#cbd5e1"
  success: "#15803d"
  success-soft: "#f0fdf4"
  warn: "#b45309"
  warn-soft: "#fffbeb"
  danger: "#b91c1c"
  danger-soft: "#fef2f2"
  info: "#0369a1"
  info-soft: "#f0f9ff"
  board-navy: "#0f172a"
  board-navy-raise: "#1e293b"
  board-rule: "#334155"
  board-ink: "#f8fafc"
  board-muted: "#a8b5c8"
  line-teal-on-board: "#22d3ee"
  line-blue-on-board: "#60a5fa"
  line-amber-on-board: "#fbbf24"
  line-green-on-board: "#4ade80"
  line-teal-on-page: "#0e7490"
  line-blue-on-page: "#1d4ed8"
  line-amber-on-page: "#b45309"
  line-green-on-page: "#15803d"
  mastery-0: "#cbd5e1"
  mastery-1: "#94a3b8"
  mastery-2: "#67b7c9"
  mastery-3: "#1f8fa8"
  mastery-4: "#0e7490"
typography:
  display:
    fontFamily: "Lexend, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "clamp(28px, 2.4vw + 12px, 40px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Lexend, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title-lg:
    fontFamily: "Lexend, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Lexend, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  window: "16px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent-teal}"
    textColor: "{colors.accent-on}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-teal-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-teal-active}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.slate-wash}"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-sm:
    padding: "6px 12px"
    height: "36px"
  button-lg:
    padding: "14px 24px"
    height: "52px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "24px"
  panel:
    backgroundColor: "{colors.slate-wash}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-neutral:
    backgroundColor: "{colors.slate-wash}"
    textColor: "{colors.slate-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: "24px"
  badge-accent:
    backgroundColor: "{colors.accent-mist}"
    textColor: "{colors.accent-teal-active}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "4px 6px 4px 12px"
    height: "36px"
  tab:
    textColor: "{colors.slate-muted}"
    typography: "{typography.label}"
    padding: "10px 14px"
    height: "44px"
  tab-selected:
    textColor: "{colors.accent-teal}"
  nav-link:
    textColor: "{colors.slate-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  nav-link-current:
    textColor: "{colors.accent-teal-active}"
  search-trigger:
    backgroundColor: "{colors.slate-wash}"
    textColor: "{colors.slate-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 8px 0 12px"
    height: "40px"
  departure-board:
    backgroundColor: "{colors.board-navy}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  line-chip:
    backgroundColor: "{colors.line-teal-on-board}"
    textColor: "{colors.board-navy}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    size: "40px"
---

# Design System: Codi

## Overview

**Creative North Star: "The Concourse and the Board"**

Codi is a bright, quiet concourse of white paper and slate-wash panels divided by hairlines, and on a screen that needs one, a single navy board hangs in it: the transit diagram on the course path, the video or code frame in the lesson, the code stage in the home product window. The learner's everyday pages (Trang chủ, Khoá học, Kết quả học tập) carry no board at all: they are light cards and hairline rows that answer one question each. Everything you read for orientation lives on the concourse; the one thing you look up at lives on the board. Deep cyan-teal marks the single action to take and the place you are.

Density is working-product density for a projected demo: body text at 16 px, captions no smaller than 12 px, 44 px touch targets everywhere, status in words with an icon beside the colour. Structure is carried by hairline rules and tabular columns (comparison ledger, lesson timetable, rubric ledger, change list) rather than stacks of boxed cards. Learning is drawn as transit: chapters are coloured lines, lessons are stations, the current lesson is a white ring, the next lessons are departures.

The system refuses the generic course-site defaults the surfaces were redesigned away from: stock hero photo with three feature cards and a stats row, four equal stat cards over a card grid, a chat bubble floating over the lesson, and generic cards stacked inside generic cards.

**Key Characteristics:**
- White and slate-wash ground, 1px hairlines, almost no shadow at rest.
- One navy object per screen; teal for one primary action, the current place and progress.
- Transit vocabulary: four line colours, station dots, a white "you are here" ring.
- Lexend headings, Be Vietnam Pro body, JetBrains Mono tabular figures for minutes, prices, points and timecodes.
- Light and dark themes, both AA; status never by colour alone.

## Colors

A restrained cool-slate neutral field with a single deep cyan-teal voice, plus a navy board family and a four-line transit palette that appears only in path and departure contexts.

### Primary
- **Deep Lagoon Teal** (accent-teal): the one filled primary button, the selected tab underline, the current nav rail, progress fills, links and the brand mark tile. In dark mode it lifts to bright cyan (#22d3ee) with navy text on top.
- **Lagoon Mist** (accent-mist, with accent-mist-border): AI marks, unread notifications, accent badges and alerts, the soft halo (4 px) around the current station dot.

### Neutral
- **Paper** (paper): page ground and every work surface (cards, panes, header, dialogs).
- **Slate Wash** (slate-wash): quiet panels, ledger header bands, segmented-control tracks, the header search trigger, skeletons.
- **Ink** (ink): primary text. **Slate Muted** (slate-muted): secondary text, idle tabs and nav. **Slate Faint** (slate-faint): timestamps, placeholders.
- **Hairline** (hairline): every divider, row rule and card edge. **Hairline Strong** (hairline-strong): input, secondary-button and chip strokes.

### Board (the dark object)
- **Board Navy** (board-navy; #131d33 in dark mode so it still reads as an object on the #0f172a page): transit diagram frame, departure board, video/code frame (`--code-bg`), home code stage.
- **Board Raise / Rule / Ink / Muted** (board-navy-raise, board-rule, board-ink, board-muted): tool buttons, row rules, text and secondary text on the board.

### Transit lines
- Two sets with the same hues. **On the board** (line-*-on-board: teal, blue, amber, green; violet #c084fc and rose #fb7185 extend the path diagram past four chapters), all at least 6:1 on navy, with navy text in line chips. **On the page** (line-*-on-page), darker so white text reaches 4.5:1; in dark mode the page set switches to the board set.

### Semantic and mastery
- **Success / Warn / Danger / Info** each with a soft tint, used in badges and alerts that always carry a word and an icon.
- **Mastery scale** (mastery-0 to mastery-4): five steps from slate to lagoon teal, drawn as five 8 px squares and always followed by its label ("Chưa học", "Đang học", "Thành thạo").

### Named Rules
**The One Dark Object Rule.** A screen carries at most one navy board. Everything else is paper, slate wash and hairline; a second dark panel turns the board into decoration.

**The One Filled Teal Rule.** One filled teal button per screen or docked panel ("Học tiếp", "Mua ngay", "Lưu điểm"); every other action is secondary, ghost or a link.

**The Two Line Sets Rule.** Line colours on navy use the board set; line colours on paper use the page set. Never put a board-set colour on paper or a page-set colour on navy.

## Typography

**Display Font:** Lexend (with Be Vietnam Pro, system-ui)
**Body Font:** Be Vietnam Pro (with system-ui, Segoe UI, Arial)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Consolas)

**Character:** Lexend gives headings a wide, calm, legible face that reads across a room; Be Vietnam Pro carries Vietnamese diacritics cleanly at body sizes; JetBrains Mono is reserved for code and for numbers that must line up.

### Hierarchy
- **Display** (600, clamp 28–40 px, 1.15, -0.02em): course title on the path page; the dashboard lesson title uses the same voice at clamp 22–30 px.
- **Headline** (600, 32 px, 1.25): page H1.
- **Title** (600, 24 px and 20 px, 1.25): section headings, dialog titles, board headings.
- **Body** (400, 16 px, 1.55): all reading and list text; 14 px for captions and dense table cells; `text-wrap: pretty` on paragraphs, `balance` on headings.
- **Label** (600, 14 px, 1.2): buttons, tabs, field labels. Badges are 12 px/600.
- **Mono** (400, 14 px, tabular): code, minutes, prices, points, timecodes, line numbers, the keyboard hint in the search trigger.

### Named Rules
**The Tabular Figures Rule.** Any number compared down a column (minutes, VND, points, counts) uses tabular figures, in JetBrains Mono or `tabular-nums`, right-aligned in tables.

**The Sentence Case Rule.** No uppercase on Vietnamese text and no tracked-out labels; hierarchy comes from size and weight. Codes the user types (voucher codes) may display uppercase.

## Layout

A 4 px spacing grid (4, 8, 12, 16, 20, 24, 32, 48). Content pages sit in a 1200 px container with 16 px side padding and 32/48 px top/bottom; narrow forms at 720 px, focus flows at 640 px. The header is 64 px, sticky, and runs to 1440 px with 24 px padding; workspace pages (lesson split, lecturer and admin workspaces) run full width.

Signature layouts: the lesson is a split pane (material about 58% left, task about 42% right, 12 px draggable divider, a lesson bar with task chips above) that collapses to tabs on mobile; the path page puts the navy diagram beside a 340 px side column from 1280 px; the learner home sets a main column beside a 340 px aside from 1100 px; the catalogue is a card grid (min 300 px columns); course detail keeps a purchase panel sticky beside the proof from 1024 px; grading keeps a narrow queue, a reading stage and a 400 px grade dock; the course editor timetable gets fixed columns from 1180 px.

Breakpoints actually used: 420, 480, 640, 768, 860, 900, 1024, 1180, 1280, 1440 px. Below each table breakpoint, rows become stacked blocks carrying the same fields, never a hidden column.

### Named Rules
**The Hairline Over Box Rule.** Repeated items are rows separated by 1px hairlines inside one surface, not individual bordered cards.

## Elevation & Depth

Flat by default, tonal by structure. Depth comes from the paper / slate-wash / navy step, not shadow. Shadows appear on things that float (popovers, dialogs, sheets, the typeahead) and on the two signature objects (the navy diagram frame and the home product window).

### Shadow Vocabulary
- **Raised** (`box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08)`): the pressed segment of a segmented control.
- **Pop** (`box-shadow: 0 8px 24px rgba(15,23,42,.14), 0 2px 6px rgba(15,23,42,.08)`): popovers, dialogs, sheets.
- **Board lift** (`box-shadow: 0 12px 32px -12px rgba(15,23,42,.45)`): the navy transit frame only.
- **Window sheet** (`box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 32px rgba(15,23,42,.08)`): the home product window only.
- **Focus ring** (`box-shadow: 0 0 0 2px #fff, 0 0 0 4px <accent>`): every focusable control; on navy, a 2px white outline plus a cyan halo.

### Named Rules
**The Flat-At-Rest Rule.** Cards, panels, tables and the board rows have no shadow at rest; hover changes border or tint, not elevation.

## Shapes

Gently rounded and consistent: 6 px on controls (buttons, inputs, nav links, line chips), 8 px on panels, tables, popovers and the search trigger, 12 px on cards, dialogs and navy boards, 16 px only on the home product window and its imagery, pill for badges, chips, counts and progress bars. The brand mark is a 14/64 rounded teal tile carrying a white path stroke from one station dot to a ring: the transit motif in miniature. Station dots are circles; the current station gets a large white ring; skippable stations are dashed. Path lines bend only at 45 and 90 degrees. Icons are 1.75-stroke round-cap SVG line icons at 16, 20 or 24 px.

## Components

### Buttons
Confident and quiet: solid shape, no gradient, no lift.
- **Shape:** gently rounded (6px), min-height 44 px (36 px small, 52 px large; the path "Học tiếp" runs 56 px at 20 px text).
- **Primary:** deep lagoon teal fill, white 14 px/600 label, 10 px 16 px padding.
- **Hover / Focus:** fill darkens to accent-teal-hover over 150 ms on the standard ease (cubic-bezier(0.2,0,0,1)); focus is the two-ring focus shadow. Busy buttons show a spinner and `aria-busy`; disabled drop to 50% opacity.
- **Secondary:** paper fill, ink text, hairline-strong stroke, slate-wash on hover. **Ghost:** transparent, slate-wash on hover. **Link:** teal underlined text. **Danger / danger-outline** only for destructive confirmations.

### Chips
- **Style:** pill, paper fill, hairline-strong stroke, 14 px text, 36 px tall; filter chips carry a 28 px round remove button.
- **State:** action chips turn their stroke and text teal on hover. Lesson task chips in the lesson bar carry an icon plus text for done/pending.

### Badges and status
- Pill, 24 px, 12 px/600, soft tint with the matching strong text (neutral, accent, success, warn, danger, info, outline, solid); an icon or word always accompanies the colour.

### Cards / Containers
- **Corner Style:** 12 px (cards), 8 px (panels).
- **Background:** paper for cards, slate wash for quiet panels.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px hairline; header and footer rows divided by hairlines.
- **Internal Padding:** 24 px (16 px compact).

### Inputs / Fields
- **Style:** paper fill, 1px hairline-strong stroke, 6 px radius, 44 px tall, 16 px text; labels 14 px/600 above, help text 14 px muted.
- **Focus:** stroke turns teal plus the focus ring.
- **Error:** 14 px danger text with an icon under the field; required marks in danger.

### Navigation
- One 64 px paper header for every role with a hairline bottom rule. Brand mark (28 px) plus "Codi" at 20 px/600. Nav links are 14 px/500 muted, slate-wash on hover; the current link turns accent-teal-active at 600 with a 3 px teal rail sitting on the header rule. Count badges are teal pills. The search trigger is a 40 px slate-wash field with a mono Ctrl K hint, collapsing to an icon button where the nav is full (1025–1439 px) and to a burger plus icon below 1024 px.

### Tabs
- 44 px, 14 px/600 muted labels on a hairline; the selected tab turns teal with a 2 px teal underline.

### Learner home, catalogue and results
Information architecture and layout follow the owner's VLearn learner prototype; Codi keeps its own logo, name, teal accent, type and tokens.
- **Navigation:** Trang chủ (`/dashboard`) · Khoá học (`/courses`) · Kết quả học tập (`/progress`) · AI. Statistics and the knowledge map are tabs of Kết quả học tập (`?tab=stats`, `?tab=map`); the old `/insights*` URLs redirect there.
- **Trang chủ:** the date and "Chào {tên}" as the H1, then sections with plain headings: "Học tiếp" (one card on an accent-mist wash: lesson title at display size, course · chapter · lesson · kind · minutes, course progress, the page's only filled teal button, a cover on the right), "Nhận xét mới của giảng viên", and "Khoá học của tôi" as tappable hairline rows (thumb, title, status badge, done/total, thin progress bar, chevron; five shown, hidden courses only after "Xem tất cả"). The aside holds "Tuần này" (minutes against the goal, seven day dots, streak), waiting grading, mastered skills and suggestions.
- **Khoá học:** search field, a category pill row (the pressed pill is ink-filled), a result bar (count left; level, price and sort right), a grid of course cards (16:9 cover with category label, two-line title, lecturer, rating · level · duration, price and a secondary action).
- **Kết quả học tập / Sổ điểm:** a hairline summary strip of five figures, a warn-soft "Cần làm tiếp" list (unsubmitted drafts, results below the pass mark), then one course at a time picked from a select (grouped Đang học / Đã hoàn thành / Tạm ẩn): course header card, lesson gradebook table (stacked blocks below 640 px), concept mastery grid.
- No eyebrow or pill above a heading; a section is named by its own heading.

### Departure Board (signature)
The transit frame on the path page (the learner home no longer carries a board). 12 px radius, 24 px padding, board-rule hairlines between rows. Each row: a 40 px line chip (line colour, navy mono number), the lesson and its course, tabular minutes. The current row gets a faint white wash and a 1px white inner ring; the "you are here" label is a white pill with navy text. On the path page, chapters are lines, lessons are white station dots, travelled segments solid, upcoming ones dimmed.

### Mastery Meter (signature)
Five 8 px rounded squares filled with the mastery scale up to the learner's level, followed by a 12 px/600 label. Never shown without the label.

### Lesson Split Pane (signature)
Lesson material left, task tabs right (Quiz, Bài tập, Code, AI trợ lý, Hỏi đáp). The AI tutor is a tab beside the work in this surface. The video or code editor sits in a navy frame with 10 px inset; the task primary is pinned at the bottom of the right pane.

## Do's and Don'ts

### Do:
- **Do** keep at most one navy object (#0f172a light, #131d33 dark) per screen, and give it the transit, video or code job.
- **Do** keep one filled teal button per screen or docked panel; make everything else secondary, ghost or link.
- **Do** separate repeated items with 1px hairlines (#e5e7eb) inside one surface; use tabular mono figures for minutes, prices and points.
- **Do** pair every status colour with a word and an icon, and every mastery fill with its label.
- **Do** keep text at 16 px for reading, 44 px minimum targets, and the two-ring focus shadow on every control.
- **Do** use credited free-licence photographs (Pexels, recorded in public/images/CREDITS.json) for course and avatar imagery, and label product illustrations as sample data.

### Don't:
- **Don't** put a second dark panel on a screen that already has its board.
- **Don't** use board-set line colours on paper or page-set line colours on navy.
- **Don't** uppercase or letter-space Vietnamese labels.
- **Don't** add shadows to resting cards, panels or rows; elevation is for things that float.
- **Don't** default to a stock hero with three feature cards and a stats row, or four equal stat cards over a course-card grid.
- **Don't** convey state by colour alone, including the line colours, which always carry a lesson number or chapter name.
