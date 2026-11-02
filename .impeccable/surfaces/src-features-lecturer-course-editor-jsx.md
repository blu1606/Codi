---
version: 1
slug: "src-features-lecturer-course-editor-jsx"
primary_target: "src/features/lecturer/course-editor.jsx"
related_targets: ["src/features/lecturer/teach-api.jsx","src/features/lecturer/kmap-tab.jsx"]
---

Surface: lecturer course editor `/teach/courses/:courseId` with tabs Thông tin (/info), Nội dung (default), Bản đồ kiến thức (/kmap), Xuất bản (/publish). Mode: Operate.

Audience and job: a lecturer prepares a course for publication: keeps the curriculum in order (chapters, lessons, ⋯ actions, drag and drop), gets quizzes and code exercises ready, sees exactly what blocks submission, and submits for review. Primary scene: a laptop at 1366-1920 px projected for examiners; mobile must work.

Constraints: keep the committed Codi world (teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG 2.1 AA, status by text as well as colour, 44 px touch targets). Keep the authoring step rail as the spine (Thông tin → Nội dung → Bản đồ kiến thức → Xuất bản) with its per-step counts. Keep every state and behaviour: locked review read-only mode, published and hidden banners, rejected and changes-requested rounds with flags and "Đánh dấu đã sửa", delete guards with undo, rename, arrow moves, drag and drop across chapters, free-preview and materials, AI-generated quiz questions awaiting review, code challenge test state, info validation and unsaved guard, KMap tab, submit confirmation.

## Direction contract

THESIS: The course is laid out as a timetable: chapters are the rows of a departure board, lessons sit in fixed columns with the same rhythm, and each lesson's readiness is a mark in its own cell. The publish case reads as a list of blockers, not a checklist of everything. Refuses the default stacked cards with a row of buttons on each lesson.

OWN-WORLD: Neutral ground with white work surfaces; teal accent for the current step and the one filled primary; hairline rules between rows instead of boxed rows; fixed-width numeric columns in JetBrains Mono for lesson numbers and minutes; readiness shown as a text chip with a check or alert icon; warn and danger reserved for blockers.

STORY: The lecturer opens the content step, sees which steps are still open on the rail, scans the timetable for lessons marked "Cần sửa", opens the one that needs a rubric or a review, returns, and when the rail says ready reads the blocker list (empty) and submits.

FIRST VIEWPORT: Header with course title, status and the step rail; then the chapter timetable: at 1440 px a column header (No., Bài học, Loại, Thời lượng, Kiểm tra, Trạng thái, actions) above chapter groups; each chapter a hairline group with its number, title, lesson count and blocker count; lesson rows with their marks; the add-lesson primary sits at the top right of the timetable. The publish tab's first viewport is a blocker summary with the first action, then the grouped conditions.

FORM: Spine-led workspace: rail on top, the timetable as the stage, a blocker reader for publication (concept-seed lead, dealt index 3 of six; grounded list: outline timetable with readiness rail, two-pane chapter tree and editor, spine-led workspace with blocker reader, readiness kanban, chapter card rails, single-column checklist cockpit). Fused from the outline timetable (its column rhythm and numeric cells) and kept within the spine. seed:3986047a64671fd6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
