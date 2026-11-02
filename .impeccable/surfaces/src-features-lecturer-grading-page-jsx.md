---
version: 1
slug: "src-features-lecturer-grading-page-jsx"
primary_target: "src/features/lecturer/grading-page.jsx"
related_targets: ["src/features/lecturer-ai/grading-ai.jsx","src/features/lecturer-ai/grading-jobs.js"]
---

Surface: lecturer grading `/teach/grading` and `/teach/grading/:submissionId` (queue + submission + rubric grading + AI grading job). Mode: Operate.

Audience and job: a lecturer clears a backlog of submissions quickly and correctly: reads the work, scores each rubric criterion, writes feedback, saves and moves on. The AI only proposes; the lecturer applies and saves (rule G5). Primary scene: a laptop at 1366-1920 px, and a phone must still work.

Constraints: keep the committed Codi world (deep cyan-teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG 2.1 AA, status never by colour alone, touch targets 44 px). Keep every existing state and behaviour: queue filters (course, assignment, date), pending/graded tabs, rubric or single score, pass threshold, reason prompt when editing a graded score, history sheet, snippet picker with placeholders, save, save and grade next, skip, unsaved-changes guard, stale-view check, empty states, and the whole AI grading job card (idle, queued, running with stages and partial criteria, cancel, failed with retry/dismiss, rate limit, succeeded with apply, dismiss, re-grade, list badges).

## Direction contract

THESIS: The submission is the stage and the grade is a dock beside it. The lecturer reads the work first, scores it against the rubric in the same view, and the queue is a narrow reference list rather than a competing column. Refuses the default three-column inbox where the form is a generic card stacked on a generic card.

OWN-WORLD: Neutral tinted ground with white work surfaces; one teal accent for selection and the single filled primary; the submission in a quiet reading column; the rubric as a ledger of hairline rows with tabular JetBrains Mono points; status as text badges; AI job as a hairline-bordered strip with a sparkle mark, never a coloured panel.

STORY: The lecturer sees who is next and how many remain, reads the request and the submission, glances at the AI draft that already scored three criteria, adjusts two, types one comment with a snippet, reads the total, and saves and moves on. A changed score asks for its reason; leaving with unsaved edits asks first.

FIRST VIEWPORT: Page header and the status tabs; a filter row; at 1440 px a 300 px queue list on the left (name, wait, assignment, AI badge), then the stage (assignment, submission files/links/notes) and a 400 px dock on the right: AI draft strip first, rubric ledger with running total, feedback field, then a sticky footer with the one filled primary "Lưu điểm" and "Lưu và chấm bài tiếp theo" beside it.

FORM: Document review with a docked grade (concept-seed lead, dealt index 3 of six; grounded list ranked: ledger batch grading, inbox triage three-pane, document review with docked grade, criterion-by-criterion wizard, AI-first review card, focus deck). Challenger raise from the gate board (vernacular boarding-pass and gate-board source): a queue row that changes stays marked until it is opened, so an AI draft that finished while the lecturer was elsewhere is not lost. Declined: variable-font specimen, design-annual plate section, airport signage, timetable slide rack, streaming title wall (costume of the world, not product clarity). seed:a8db53b3733d412f

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
