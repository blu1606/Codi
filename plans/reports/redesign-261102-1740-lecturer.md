# Lecturer redesign report (2026-11-02)

Mode: Operate. Surfaces: grading (`/teach/grading`, `/teach/grading/:id`) and course editor (`/teach/courses/:id`, /info, /kmap, /publish).

## Substitutions (disclosed)

- The owner delegated the run, so the impeccable decision page was not served. The roll was recorded and the assigned lead was built. No structured question tool was available, so no user choice was asked.
- Build path is code-led. No comps were generated, and no HTML sketches were written for the cards.
- Visual evidence: Playwright screenshots at 1440, 1024 and 390 px, in light mode. Dark mode was not captured.
- Mobbin and web research were not run for this round. Structure choices rest on the impeccable reference and the surface briefs, not on cited sources.

## Structures considered

Grading (`concept-seed --scope surface --mode operate --candidate-count 6`, key a30d0788, seed:a8db53b3733d412f). Grounded list: 1 ledger batch grading, 2 inbox triage three-pane, 3 document review with docked grade (lead), 4 criterion-by-criterion wizard, 5 AI-first review card, 6 focus deck. Dealt 3, 5, 6; lead 3 built. Challenger raise: gate-board row that stays marked until opened. Declined: specimen, plate section, airport signage, timetable rack, streaming wall.

Course editor (key a9d21611, seed:3986047a64671fd6). Grounded list: 1 outline timetable with readiness, 2 two-pane tree and editor, 3 spine-led workspace with blocker reader (lead), 4 readiness kanban, 5 chapter card rails, 6 checklist cockpit. Dealt 3, 1, 2; lead 3 built, with the timetable from 1 fused into its stage.

## What changed

- `src/features/lecturer/grading-page.jsx`: stage and dock layout (`tc-stage`, `tc-dock`). AI draft first in the dock. Footer carries the single filled primary, a dirty-state line, and the next-item actions. The stale-view check, reason prompt, history sheet, snippets and unsaved guard are unchanged.
- `src/features/lecturer-ai/grading-ai.jsx`: "Dùng bản nháp này" and "Thử lại" demoted to secondary (one primary per screen). Job mechanism and states unchanged.
- `src/features/lecturer/course-editor.jsx`: `lessonIssues()` (same rules as `readiness()` applied per lesson). Lesson rows are a timetable with a column header; chapter headers show blocker counts; publish tab has a blocker reader (one filled primary only when nothing blocks) and conditions grouped by step. Rail, ⋯ menus, drag and drop, delete guards and review flags unchanged.
- `src/features/lecturer/lecturer.css` and `src/styles/lecturer.css`: grid for timetable (≥1180 px), stacked fallback below; dock sizing; reader styles. The `.tc-reply` 2px left stripe was replaced by a full 1px border and tint. No other side stripes in my files.
- Surface briefs: `.impeccable/surfaces/src-features-lecturer-grading-page-jsx.md` and `...-course-editor-jsx.md`.

## Evidence

- `npx vite build` passes (scratchpad build-lecturer).
- `node lect-shots.js` (scratchpad e2e/lect): no horizontal scroll at 1440, 1024 and 390 px, no console errors on lecturer pages.
- `node smoke.js`: 59 ok in the run I observed; no FAIL line seen. Treat as partial.
- `node axe.js`: "no violations".

## Not verified

- Dark mode screenshots (script supports DARK=1; not run).
- The `.tc-dock` sticky behaviour and the mobile sticky footer were checked only via the 390 px capture (no horizontal scroll), not by viewing the image.

## Shared changes needed (not made)

- `src/styles/app.css` still defines `.split-view` (minmax 280–380); lecturer.css overrides `.tc-split` for the lecturer grid. No shared edit was needed.

## Open questions

1. Should the dock AI draft collapse once applied, so the rubric sits above the fold?
2. Should the queue carry the gate-board "changed row stays marked" raise? It was recorded as the challenger raise but not implemented.
3. Is the 1180 px timetable breakpoint acceptable for the projector scene?
