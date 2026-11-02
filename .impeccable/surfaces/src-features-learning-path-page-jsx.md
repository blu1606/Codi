---
version: 1
slug: "src-features-learning-path-page-jsx"
primary_target: "src/features/learning/path-page.jsx"
related_targets: ["src/features/learning/path-views.jsx"]
---

Surface: the course path page `/learn/:courseId` (AI-ranked personal learning path). Mode: Operate.

Audience and job: a learner sees what to study next, why the AI chose it, what changed since last time, and the whole course in one view; in the primary scene the page is projected for examiners, so order, status and the next action must read from a distance.

Constraints: keep the committed Codi world (deep cyan-teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG AA, status never by colour alone). Keep every existing state: no path yet, generating, failed with retry, entry-test offer, update notice, completion, recently changed lessons, locked, skippable, the map view and the lesson detail. Mobile turns the board into stacked rows.

## Direction contract

THESIS: The path is a live ranked board, one table in AI order where the current row carries the action and a changed row stays lit until the learner has seen it. Refuses the default stack of a hero card, an explanation panel and chapter accordions.

OWN-WORLD: One white board with hairline rows and fixed columns (#, Bài, Chương, Loại, Thời lượng, Trạng thái, Vì sao); numbers and minutes in tabular JetBrains Mono; the current row tinted teal-soft and taller with the only filled teal button; changed rows tinted amber with a "Đã đổi thứ tự" chip; status as icon plus text.

STORY: The learner reads the course title and progress, sees row 4 with its reason and "Học tiếp", notices row 6 moved up after the last quiz, and filters to Chưa học or switches to the map when needed.

FIRST VIEWPORT: Header; title row with goal on the left and 3/13 progress plus "Chỉnh mục tiêu" on the right; a segmented filter (Tất cả · Chưa học · Đã xong) and "Xem dạng bản đồ"; the board with completed chapters collapsed into one row, the current row first, then the remaining lessons in path order.

FORM: Departure board, position 5 of 6 on the ordered list (dealt), seed:73e7880f59c72561.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
