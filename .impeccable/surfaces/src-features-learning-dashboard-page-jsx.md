---
version: 1
slug: "src-features-learning-dashboard-page-jsx"
primary_target: "frontend/src/features/learning/dashboard-page.jsx"
related_targets: []
---

Surface: the learner dashboard `/dashboard` (Bàn làm việc). Mode: Operate.

Audience and job: a returning learner (projected for examiners, and used on a laptop in the evening) sees in one glance what to study next across their courses, this week's goal and streak, what changed (graded work, answered questions, path changes) and their courses, with one filled primary "Học tiếp". The "Học tiếp" target and the next-lesson order must match the course path page and the lesson page exactly.

Constraints: keep the committed Codi world (deep cyan-teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG AA, status never by colour alone). Keep every existing state: no course (empty), path generating, path failed, path not set up, default-path diagnostic card, all courses complete, sync error with retry, hidden course note, recommendations. Body text at least 16px for the projected scene.

## Direction contract

THESIS: The dashboard is a departure board for the learner's studies: the next lessons across all their lines are ranked by departure, the course in progress leads, and "Học tiếp" is the one departure to board now. Refuses the default stack of a welcome banner, four equal stat cards, and a grid of course cards.

OWN-WORLD: The navy departure board (#0f172a, #131d33 in dark mode) is the only dark object on the light ground, the same frame the course path page uses. Its rows carry the four transit line colours from the path page (teal, blue, amber, green) as chips; tabular Be Vietnam Pro figures for minutes; a white ring marks the lesson the learner is at. Everything else is hairline sections on the light surface, teal for the single primary action and progress.

STORY: The learner sees their name and "Học tiếp" with the lesson title, reads the next departures on the board with the course they belong to, checks the "Thay đổi" hairline list for graded work, answers and moved lessons, glances at the week's minutes and streak, and presses "Học tiếp".

FIRST VIEWPORT: Header (title "Bàn làm việc", greeting, two secondary links); a focus row with the course thumb, course name, lesson title at display size, "Bài n · kind · minutes", progress, and the single filled teal "Học tiếp"; below it, on desktop, the navy departure board ("Chuyến tiếp theo", up to six rows) left and the "Thay đổi" hairline list right. On mobile the board and the change list stack; the primary stays in the focus row.

FORM: Departure board with hairline change list, fused with the boarding-pass and gate-board catalog challenger (ranked departures, a changed row kept visible; rerank in place) and not the split-flap concourse board (an instrument costume). Dealt structure index 5 of the roll, seed:57b9cca8e3a359d5. The dealt lead (centre-rail reference-setting page) is set aside: a two-column long-measure text page reads as a printed edition, not a working product, and does not give a glanceable next action.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
