# Lesson page split-pane build ("Chia đôi màn hình") + onboarding fixes

Date: 2026-11-02 · Surface brief: `.impeccable/surfaces/src-features-learning-lesson-player-page-jsx.md` (Operate)

## Outcome

`/learn/:courseId/:lessonId` now uses the approved split layout. It is built from the app's real tokens and components, not the sketch's inline CSS.

- **Lesson bar** (56 px, sticky under the header) has these parts:
  - The "Danh sách bài" button. The sheet it opens now also shows course progress, "Về lộ trình" and "Xem lộ trình".
  - The breadcrumb (course › chapter) and the h1 title. The title stays `#lesson-title`, so it still takes focus after completion.
  - One chip per checklist task, with icon and text. Each chip is done, active (the first unfinished task) or todo, and has an sr-only state. Clicking a chip opens that task's tab, or scrolls the lesson pane for "Học nội dung".
  - A primary "Hoàn thành bài học" button, shown once every task is done.
  - Bài trước / Bài sau. Bài sau becomes the primary button once the lesson is done.
- **Left pane** scrolls on its own. It shows notices (update, completion, prerequisite, offer), then the material:
  - Video sits in a navy frame. Lessons with several materials get a material picker.
  - PDF viewer, then the reading at about 70ch with its "Nguồn tham khảo" sources. Long source links and bare URLs now wrap.
  - "Đánh dấu đã học xong".
  - The checklist and completion block ("Để hoàn thành bài học", the complete button, "Bài tiếp theo", "Đánh giá khóa học").
- **Right pane** shows the tabs Quiz · Bài tập · Code (only those the lesson has) · AI trợ lý · Hỏi đáp (n).
  - The default tab is the first unfinished task tab, or else the first task tab, or else AI.
  - Each tab's primary action is pinned to the bottom of the tab: quiz navigation / Nộp bài / Làm quiz / Làm lại, Nộp bài tập, Chạy / Nộp bài, the tutor composer, and Gửi câu hỏi.
  - All panels stay mounted, so quiz position, assignment draft timers, the editor and the tutor thread survive tab switches.
- **AI tutor** is now `Codi.tutor.embed(courseId, lessonId, { onActivate })`, a non-floating panel. While it is mounted, `open`, `explainError`, `explainRunError` and the selection toolbar for that lesson all go to the AI tab and switch to it. No docked sheet opens and no floating button is rendered.
- **Code lessons** call `Codi.code.view(c, l, { part: 'brief' | 'work', onContinue })`.
  - `brief` goes on the left: requirements, hints, the solution gate, and test results with filters. For tutorials it is the step guide and table of contents.
  - `work` goes on the right: status, failure and sandbox alerts, the editor, the console, and pinned Chạy / Nộp bài.
  - `part` defaults to `'all'`, so lecturer previews are unchanged.
- **Divider** uses `role="separator"` with `aria-valuenow`, min 35 and max 70.
  - Drag uses pointer capture and updates only a CSS variable until release. Keyboard: arrow keys move it 2% (10% with Shift), Home and End jump to the limits, double-click resets it.
  - The width is saved in localStorage (inside try/catch) separately for regular and code lessons and for the ≥1280 and 1024–1279 widths.
- **Responsive**:
  - ≥1280: split, 58/42 by default (46/54 for code lessons).
  - 1024–1279: split with a narrower left pane by default, and icon-only bar buttons that keep sr-only labels.
  - <1024: compact sticky bar, chips on their own row, and top-level tabs "Bài học" · task tabs; the document scrolls.
- **Onboarding fork**: the "Khuyến nghị" badge is now absolutely positioned. Both cards share one structure, and the note and button sit at the bottom of each card. The cards are equal height and both buttons sit on one baseline. The cause was the badge sitting in the flow plus `stack-3` margins on a grid.
- **Video without a URL** now shows a poster with a play button, the title, "Video · N phút", watched %, a mono timecode and a progress track, all inside the navy frame. Note: no video renders on the onboarding page itself; the "empty dark box" was the lesson page's simulated player, so that is where the fix went.

## Files changed

| File | Change |
|---|---|
| `src/features/learning/lesson-player-page.jsx` | rewritten as the split workspace (bar, chips, tabs, divider, panes, Hỏi đáp tab) |
| `src/features/learning/learning.css` | old sidebar/topbar/stepper rules removed; split-pane block added; grid tracks `minmax(0,1fr)`; `.ln-md` link/list wrapping, `hr` |
| `src/features/learning/lesson-assessments.jsx` | `bare` mode (no card, pinned `.ln-dock`), `onContinue` for the quiz "Tiếp tục" |
| `src/features/learning/lesson-materials.jsx` | navy `.ln-frame` around YouTube and the simulated player; poster for videos without a URL |
| `src/features/learning/lesson-markdown.jsx` | `---` renders as `<hr>` (the sources block used it and showed a literal "---") |
| `src/features/learning/onboarding-page.jsx` | fork cards restructured (badge out of flow, `.choice-card-foot`) |
| `src/styles/learning.css` | choice-card styles (flex column, absolute badge, foot pinned, non-clickable card loses hover/pointer) |
| `src/features/coding/code-api.jsx` | `view(c, l, { part, onContinue })`; Challenge/Tutorial views composed from pieces; `.cp-dock` |
| `src/features/coding/tutor-api.jsx` | `Codi.tutor.embed`, embed-aware `open()`, `[data-tutor-scroll]` scroller, `is-embed` class; existing signatures unchanged |
| `src/features/coding/coding.css` | part/brief/work + dock + embedded tutor styles |

## States kept

These states were all exercised or inspected:

- prerequisite notice
- material load failure and retry
- materials save warning ("Thử lưu lại")
- YouTube untracked warning
- PDF page tracking
- quiz start, draft autosave, navigator, submit confirmation, result, retake
- assignment upload with progress and errors, link validation, autosave, pending / resubmit / graded
- sandbox unavailable, run failure and retry, hints, solution gate
- tutorial solution gate
- tutor load fail, rate limit, error, thinking/stop
- private lecturer conversation and public Q&A
- completion with toast and focus, next-lesson CTA
- study-time heartbeat
- `lastActive`
- code evidence sync
- not-found, path-not-set-up and not-enrolled guards

## Verification

- `npx vite build --outDir …/scratchpad/build-lesson --emptyOutDir` passes; only the existing chunk-size warning remains.
- Screenshots in `scratchpad/e2e/lesson-split/` (`lesson-split.js`):
  - Lessons js-001, 003, 006, 004, p01 and p02 at 1440, 1280, 1024 and 390, light and dark.
  - At 390 there is also a shot with the task tab active.
  - No console errors, and no horizontal overflow inside `#app-main` at any width.
- Interactions (`lesson-interact.js`) all behaved as intended:
  - No `.tutor-fab` is rendered.
  - Tabs are correct per lesson.
  - Divider: End → 70, Home → 35, the width persists across reload, and dragging works.
  - "Hỏi AI" from a failing test switches to the AI tab and answers there, with no docked sheet.
  - The lesson-list sheet lists 11 lessons.
- Onboarding fork and poster (`fork-poster.js`): the snapshot is rewritten in the browser and API writes are answered locally, so no stored state changes. At 1280 both cards have top 193, height 354 and button bottom 521.
- `node axe.js` reports no violations.
- `axe-lesson.js` checks the 6 lessons × every tab, at 1440 and 390, light and dark. It reports no violations.

## Concerns / open items

1. **Global header overflows by 2 px at 390.** The header's `.header-actions` ends at x = 392 on every route, including /dashboard. This was already there and is in shell-owned code, outside this phase's write scope.
2. **Another agent is editing the path page in parallel** (`path-views.jsx`, `path-page.jsx`). While their edit was in progress, the dev bundle failed for a few minutes. This page still imports `PathMap`, `PrerequisiteAdvice` and `pathRows` from `path-views.jsx`; keep those exports.
3. **Finish review and DESIGN.md are still to do.** The brief's FINISH line asks for the finish review, a verdict, DESIGN.md and raster provenance. DESIGN.md is outside this phase's write scope and no raster assets were added. The finish review and documenter steps are left to the orchestrator.
4. **The interaction test changed the learner's real data.** It ran the p02 starter code once and asked the tutor one question, so `codeAttempts.lastRun` and the tutor thread for usr-learner-001 / lesson-js-p02 now hold that activity. The DB was not reset.
5. **`docs/deviations-from-mockup.md` may need an entry.** The tutor is now a tab rather than a docked panel or launcher on the lesson page, and Hỏi đáp is a tab rather than a docked sheet. That file was outside this phase's write scope, so the controller should decide whether to record it.
