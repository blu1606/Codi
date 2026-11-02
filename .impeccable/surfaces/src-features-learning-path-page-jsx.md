---
version: 1
slug: "src-features-learning-path-page-jsx"
primary_target: "src/features/learning/path-page.jsx"
related_targets: ["src/features/learning/path-views.jsx"]
---

Surface: the course path page `/learn/:courseId` (AI-ranked personal learning path). Mode: Operate.

Audience and job: a learner sees where they are in the course, what to study next and why, what changed since last time, and the whole course in one view; in the primary scene the page is projected for examiners, so position, status and the next action must read from a distance.

Constraints: keep the committed Codi world (deep cyan-teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG AA, status never by colour alone). Keep every existing state: no path yet, generating, failed with retry, entry-test offer, update notice, completion, recently changed lessons, locked, skippable, the lesson detail. The lesson list must stay fully readable as text next to the diagram.

## Direction contract

THESIS: The course is a transit network: each chapter is a coloured line, each lesson a station, and "Bạn đang ở đây" is the one interchange that matters, with the next departures read off beside it. Refuses the default stack of a hero card, an explanation panel and chapter accordions.

OWN-WORLD: A navy (#0f172a) diagram frame as the page's only dark object on the light Codi ground; chapter lines in four data-series colours (teal, blue, amber, green) bending only at 45 and 90 degrees; white station dots, solid travelled segments, dimmed upcoming ones, a large white ring at the current station; fixed-size Be Vietnam Pro station labels; tabular JetBrains Mono minutes; teal for the single primary action.

STORY: The learner reads the course title and progress, spots the ring on the map, reads the next three departures with their reasons, sees a line alert that lesson 6 moved up after the last quiz, and presses "Học tiếp".

FIRST VIEWPORT: Header; title row (course title, goal, 3/13 progress, "Chỉnh mục tiêu", filled teal "Học tiếp"); a wide navy diagram frame with the four chapter lines and the current-station ring, zoom/locate controls in its corner; beside it a "Chuyến tiếp theo" list (next three lessons, line colour chip, minutes, reason) and "Thông báo tuyến" (moved and locked lessons); below, the full lesson table grouped by line.

FORM: Transit diagram (catalog challenger wayfinding-cartography-signage-midnight-transit-diagram, chosen by the user over the dealt board), seed:73e7880f59c72561.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
