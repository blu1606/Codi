# Path page rebuilt as the "Sơ đồ tàu điện" transit diagram

Course path page `/learn/:courseId`, Operate mode. Built against the surface brief `.impeccable/surfaces/src-features-learning-path-page-jsx.md`. I ran this as a subagent with no question tool, so I followed the brief as written and had no interview round.

## Files
- `src/features/learning/path-page.jsx` (rewritten). Contains the title row, notices, a grid with the diagram and the side panels, the lesson table, and the detail sheet. It also tracks the "seen order" that feeds the line alerts. It still exports `editGoal`, which the dashboard uses.
- `src/features/learning/path-views.jsx` (rewritten). Contains `pathRows`, `buildLines`, `StepDetail`, `Departures` ("Chuyến tiếp theo"), `LineAlerts` ("Thông báo tuyến") and `LessonTable`. `PrerequisiteAdvice` and `PathMap` are kept unchanged because `lesson-player-page.jsx` imports them.
- `src/features/learning/path-transit.jsx` (new). Holds the network layout, the SVG and HTML-station diagram, zoom and locate, the vertical strip used below 1024px, and the legend.
- `src/features/learning/path-transit.css` (new). Every class uses the `.pt-` prefix. It defines two line-colour token sets: `--pt-net-1..6` for the navy frame and `--pt-line-1..6` for the page surface, which switch to the bright set in dark mode.

## Behaviour
- **Lines:** chapters are drawn in course order. Within a chapter, stations follow the AI path order, and "Bài n" is the lesson's position in the whole path. Chapters sit on two levels joined by 45° transfer corridors, drawn in the white interchange style. The direction of each bend is chosen so it moves away from the labels, which keeps most corridors short.
- **Labels:** labels alternate above and below the line with a fixed 204px width and 15px titles clamped to 2 lines. The full title is in the `title` tooltip. Because the layout reserves space for the labels, they never overlap.
- **Station states:**
  - done: filled white dot
  - upcoming: outlined dot on a dimmed track
  - skippable: dashed outline
  - locked: lock glyph
  - current: large white ring with a "Bạn đang ở đây" pill
  - travelled track: solid, and it draws in once on load unless `prefers-reduced-motion` is set
- **Stations as buttons:** each station is a real button with a 44px hit area. The label is a child of the button, so clicking the label also opens the detail. The aria-label reads "Bài n: title · trạng thái". Every station opens the existing lesson detail in the `Sheet`.
- **Frame controls:** the frame has standard zoom −/+ buttons (87.5–150%, so labels stay at least 13px) and a "Về ga hiện tại" button that scrolls to the current station and focuses it. The frame scrolls sideways inside itself, opens centred on the current station, and fades at its edges.
- **Below 1024px:** the frame shows only the current chapter as a vertical strip, with a native `<select>` to switch chapter and a "Chuyển sang chương n" button.
- **Line alerts:** the order last seen is saved in the learning slice as `record.pathSeen = { order, at }`. Lessons that moved up show "Đã đổi thứ tự · lên n bậc" during the visit that first sees the change, then clear. The "Đã xem" button hides them sooner. Moves that come from `lastUpdate` before any order was seen show "Đã đổi thứ tự". Locked lessons list their prerequisite, up to 3 plus a count of the rest.
- **Lesson table:** grouped by line, with a colour rule and chip on each chapter heading and an x/y count. Columns are #, title, type, minutes (mono), status (icon and text), and "Vì sao?". Fully completed chapters are collapsed behind an `aria-expanded` toggle. Below 860px each row becomes a stacked block.
- **Existing states kept:** no path, generating, failed with retry, DiagCard, UpdateNotice, OfferCard, CompletionCard, the review button, and the "Mới cập nhật" highlight. The old "Bản đồ kiến thức" tab is now a link to `/insights/knowledge-map?course=…`. The list/map toggle and the "Vì sao lộ trình này" panel are removed. Their note now sits under the departures list, and `aiRationale` sits above the table.

## Verification
- `npx vite build` passes. The only warning is the existing chunk-size one.
- I took Playwright screenshots of `course-js-001` and `course-react-001` at 1440, 1024 and 390 in light and dark, saved in `scratchpad/e2e/path-transit/`. None showed page overflow, and there were no console errors.
- `scratchpad/e2e/path-transit-check.js` ran axe on js, react and git at 1440 and 390 in both themes, both with the sheet closed and open: 0 violations. In the same run:
  - every station opened the sheet
  - zoom went to 125%
  - "Về ga hiện tại" focused the current station
  - the moved-lesson alert showed "lên 5 bậc" and was cleared on the next visit
- The full `node axe.js` scan reports "no violations".

## Concerns
- The brief's FINISH clause asks for a finish review, `DESIGN.md` and provenance. I could not write `DESIGN.md` within my file ownership, and I have not run a finish review.
- There are 6 line colours (the brief names 4) because the JS course has 5 chapters. Colours 5 and 6 are violet and rose.
- `PrerequisiteAdvice` still uses the `ln-advice` class from `learning.css`, which the lesson-page agent owns.
- Some seeded AI reasons mention a different goal from the learner's actual one (React). That comes from the seed data, not this page.
