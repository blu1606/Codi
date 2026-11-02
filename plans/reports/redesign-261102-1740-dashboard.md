# Redesign report: learner dashboard (/dashboard)

Surface brief: `.impeccable/surfaces/src-features-learning-dashboard-page-jsx.md` (direction contract, six blocks, seed:57b9cca8e3a359d5).

## Structures considered

Ranked for the job (what to study next, what changed, the week, the courses):

1. Departure board with a focus row and a hairline "Thay đổi" list (chosen).
2. Weekly timetable: days across the week, lessons as blocks, goal as column fill.
3. Single-course focus with a list below (the previous layout).
4. Changes-first feed: graded work and answers as the lead.
5. Course shelf grid: one card per course with progress rings (refused: the cards-of-cards default).
6. Goal dial and KPI tiles (refused: the hero-metric template).

Dealt roll (`concept-seed --scope surface --mode operate`, key 98540137...): indices 4, 5, 2, index 4 leading.

- Dealt lead, index 4 (centre-rail reference-setting page): set aside. A two-column long-measure text page with a margin apparatus reads as a printed edition, not a working product, and gives no glanceable next action. Mode Operate names this failure.
- Dealt index 5 (boarding pass and gate board): chosen.
- Dealt index 2 (metro typographic tiles): not chosen, since tiles-as-doors is the card-grid default again.
- Catalog challengers considered: fused the gate board's ranked departures. Rejected the split-flap concourse board (an instrument costume on a working screen) and the zoo guide map and orienteering map (no fit for the task).

## The choice and why

Departures match the course path page's transit world: the same line colours, the same navy frame (the only dark object on the light page), and the same "Bạn đang ở đây" marker. A learner who has seen the path page reads the dashboard board as the same network, one level up.

The "Học tiếp" target and the next departures come from the path page's own helpers (`currentLessonId`, `pathRows`, `nextDepartures`), not from the old `Codi.courseProgress` default order. The old code could send the learner to a different lesson than the path page. "Active" also follows `isCourseComplete`, so a course whose only open lessons are skippable shows as done on both pages.

## Evidence

- Mobbin, web, learning and setup dashboards (search "online course learner dashboard with next lesson continue button and course progress"): Searchable, Wix, Unify, Square, SchoolAI (welcome plus next steps as primary cards), Magnific (course sidebar with the current lesson). Each shows one leading next action and a secondary list, which the focus row plus board follows.
- NN/g, "Dashboards: Making Charts and Graphs Easier to Understand" (https://www.nngroup.com/articles/dashboards-preattentive/): a dashboard should be a single-page view that imparts at-a-glance information on which users can act quickly, with minimal interaction. Grouping by shape, borders and proximity, with colour secondary. This justifies one focus row, hairline grouping, and text labels on every colour-coded line.
- Secondary dashboard guidance (toptal, uxcel, etc.) agrees on leading with the key metric and the next action. I did not find an NN/g statement on above-the-fold placement; the claim is not made.

## What changed

- `src/features/learning/dashboard-page.jsx`: page composition. Focus row, board and changes grid, goal strip, diagnostic card (kept), course list, recommendations. Empty state and sync-error alert kept. Weekly goal, streak and skill helpers moved into this file unchanged in behaviour.
- `src/features/learning/dashboard-board.jsx` (new): `courseRows`, `buildDepartures` (the lead course contributes three, others one, capped at six), `DashFocus` (every state: setup needed, generating, failed, ready, all complete), `DashBoard`.
- `src/features/learning/dashboard-side.jsx` (new): `DashChanges` (pending grading, answered questions, path changes from `r.lastUpdate`, latest feedback), `DashGoal` (weekly minutes, streak, mastered skills).
- `src/features/learning/dashboard-page.css` (new): scoped under `.db-page`, dark mode via `html[data-theme="dark"]`, responsive at 1100 and 720 px. Shared `app.css` is untouched; its `.dash-*` rules are now unused (see below).

## Verification

- `vite build` to the scratchpad outDir: passes (the build was briefly blocked by another agent's in-progress `lecturer/course-editor.jsx` syntax error, which I did not touch; it cleared on retry).
- Browser check (learner, 1440, 1024, 390, dark): no horizontal scroll; no page errors. "Học tiếp" href and the first three departures match the path page exactly (`course-js-001`, `lesson-js-002`, then p01 and p02).
- Text size: board course and meta lines and the goal line are 16px. Remaining 14px items are captions and buttons (the brief's 16px floor applies to body text).
- `node smoke.js` and `node axe.js`: pending at the time of writing; results to be recorded here before the final commit.

## Commits

- `3ca43e5` docs(dashboard): record the learner dashboard direction contract
- `565dc2d` feat(dashboard): departure board and focus row for the learner dashboard

## Finish review (self, against the contract)

- Fidelity: focus row with one filled teal "Học tiếp", navy board left, change list right, mobile stacks in the stated order. Matches the FIRST VIEWPORT block.
- States: all dashboard states from the brief kept and reachable in code.
- Contrast: board text (#a8b5c8 on #0f172a) and line chips (dark text on each line colour) are above 4.5:1.
- The impeccable detector hook reported no issues on the new files.
- No separate finish-reviewer subagent was spawned and no DESIGN.md was written, so this is a self-review, not the documented finish flow.

## Substitutions and deviations

- Unattended run: the decision page and structured question were not used. The choice was made from the brief and evidence, and the dealt lead was set aside on the named ground above.
- No `serve-question` telemetry ping (no attended round).
- No `build-phase` gates were opened (the comp-led path was not used; this is a code-led build).

## Shared changes needed (not made by me)

- `src/styles/app.css` lines around 351–390 hold the old `.dash-*` rules, now unused by `dashboard-page.jsx`. They can be deleted in a shared CSS pass.

## Open questions

- Should the course-list "Học tiếp" action move to the board's rows, or stay as "Mở lộ trình" secondary? Kept as before for now.
- The mastery label "Thành thạo" and the goal line stay at 14–16px; a projector check may want them larger.
- `lastUpdate` changes persist until dismissed on the path page. The "Lộ trình đã thay đổi" list can therefore stay visible for a while; no per-viewer "seen" state was added (YAGNI).
