---
version: 1
slug: "src-features-learning-lesson-player-page-jsx"
primary_target: "src/features/learning/lesson-player-page.jsx"
related_targets: ["src/features/coding/code-api.jsx","src/features/coding/tutor-api.jsx"]
---

Surface: the lesson page `/learn/:courseId/:lessonId` (video, reading, PDF, quiz, assignment upload, coding workspace, AI tutor, Q&A). Mode: Operate.

Audience and job: a learner works through one lesson and knows at every moment what is left to pass it and what comes next; in the primary scene the page is projected for examiners, so the task status and the next action must read from a distance.

Constraints: keep the committed Codi world (deep cyan-teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light + dark, WCAG AA). Every existing state stays (prerequisite notice, save errors, sandbox unavailable, AI rate limit, graded/locked assignment, PDF page tracking). Mobile collapses the two panes into tabs.

## Direction contract

THESIS: The lesson is material on the left and the work on the right; the AI is a tab next to the work, never a floating overlay. Refuses the default stack of video, then reading, then quiz down one long column with a chat bubble on top.

OWN-WORLD: White surfaces on a slate page, hairline dividers, one navy frame only around the video or code editor, teal for the active tab, the single primary action and progress; tabular mono timecodes and scores; status chips with icon plus text.

STORY: The learner sees the lesson title and three task chips (xem, đọc, quiz ≥ 70%) in the bar, studies on the left, does the task on the right, asks the AI in the same pane, and moves on with Bài sau when the chips are done.

FIRST VIEWPORT: 64px header; 56px lesson bar (lesson list button, breadcrumb and title, task chips, Bài trước / Bài sau); left pane about 58% with the 16:9 video in a navy frame, the prerequisite line and the reading; right pane about 42% with tabs Quiz · Bài tập · Code · AI trợ lý · Hỏi đáp and the active task, primary button pinned at its bottom.

FORM: Split pane, position 3 of 6 on the ordered list (dealt), seed:2eae985da3c0837d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
