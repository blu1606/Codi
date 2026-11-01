# UI polish: learner area

Date: 2026-11-02. Scope: learner routes (dashboard, course path, onboarding, lesson player incl. reading/video/quiz,
coding lessons p01/p02, tutor, progress, insights hub/stats/knowledge map). Refinement in the incumbent visual world;
no tokens, flows, data, routes or copy changed (two layout-only moves of existing text, noted below).

Process note: ran as a subagent without a structured question tool, so impeccable's interview step was skipped and
decisions were inferred from the brief, PRODUCT.md and the rendered pages (critique, then polish, then craft-floor).

## Course path page (`/learn/:courseId`): reorganised

Before: the hero's flex-wrap collapsed on mobile (title broken over three lines, CTA floated beside a squeezed column).
"Vì sao lộ trình này" was a full-width card *above* the list, and its heading sat glued to the facts. That happened
because `.ln-facts-grid { margin: 0 }` cancelled the `.stack-4` gap. Each of the 11 lessons was its own tall bordered
card, and the current lesson was hard to find. The review button sat next to the primary CTA.

After:
- **Hero = "where am I / what's next".** Course title, goal plus "Chỉnh mục tiêu", and a labelled progress bar on the
  left. On the right, one accent-soft panel shows the current lesson's title and "Bài N · type · duration" meta, with
  a full-width `Học tiếp` as the single primary action. It stacks cleanly at 390px. When the course is complete the
  panel is omitted and the hero becomes a single column.
- "Đánh giá khóa học" / "Sửa đánh giá" moved to the breadcrumb row as a secondary button.
- **Path tab grid:** lessons sit in the main column. On desktop the side column holds "Vì sao lộ trình này" (open)
  and, below it, the sticky step detail panel. Below 1024px the summary becomes a one-line disclosure (closed) above
  the list, and the detail opens in the existing Sheet.
- **Chapters:** each chapter is one card with a header (title, `x/y bài`, and a check plus success colour when the
  chapter is complete). Lessons are compact rows separated by hairlines. Each row shows a status mark (check for
  done, lock for locked, skip icon for skippable, otherwise the number), the title link, the type and duration, the
  mastery chips, the prerequisite advice, the status badge in text, and "Vì sao?". The current row has an
  accent-soft background, a solid "Bắt đầu ở đây" badge and the inline `Học tiếp`. The row picked with "Vì sao?"
  gets an inset ring, and "Mới cập nhật" rows get an info ring. No side stripes.
- The list/map toggle sits in a toolbar row with "11 bài · 5 chương". The map view is unchanged and still animates
  and scrolls to the current node.
- Buttons that used `ln-block` (`display:block`) lost their centring. They now use the shared `.btn-block`.
- Every state is kept: none, generating, failed plus retry, diag card, update notice, offer, completion, highlights,
  locked, skippable, sheet and modal.

## Lesson reading
- `.ln-md` measure is now 62ch. The "0" glyph is wide, so this gives roughly 70–75 real characters per line.
  Paragraph rhythm is one line (16px). Headings have 32px above them and 8px below, so each heading binds to its
  text. The h3 size is 18px. Lists have looser item gaps and muted markers.
- Code blocks are 14px with line-height 1.6 and a hairline border.
- The reading card has 32px padding on desktop and 16px on phone.
- `<pre>` blocks are now `tabindex="0"`. With the narrower measure some code lines scroll horizontally, and axe
  flagged `scrollable-region-focusable`. It is now clean.
- Lesson header: the chapter, type and duration meta moved from above the h1 to below it. The craft floor bans
  kicker labels above headings.

## Lesson player (phone)
- The top bar wrapped into three rows. Now the lesson list button and the prev/next arrows share one row. The
  arrows are icon-only on phones, and their label stays available to screen readers through `.ln-hide-sm`. Below
  that, "Xem lộ trình / AI trợ lý / Hỏi đáp" form an even three-column row. All targets are at least 44px.

## Coding
- Test result rows (`.cp-test-summary`): the chevron and state were top-aligned against single-line names. They
  are now centre-aligned with a 44px minimum height.

## Dashboard
- "Tiếp tục học" (the page's one primary action) now comes first. The weekly goal and skills card moved below it
  in the main column, where it used to sit full-width above everything.

## Progress
- The mastery heading was glued to its grid because `ul.ln-mastery-grid { margin: 0 }` cancelled the stack gap.
  That rule is removed.
- The status cell no longer wraps the check icon above "Hoàn thành". "Chưa hoàn thành" stays on one line.

## Insights
- Removed the debug-looking "C1…C6" codes above the chart card titles. They read as kicker labels.
- Fixed `stack-5`, which is not a defined utility, so the insights pages had no vertical rhythm. Changed it to
  `stack-4`. The period caption is grouped with the toolbar it describes and no longer uses an inline `margin: 0`.
- On the hub cards, the icon now sits inline with the title instead of as an icon tile above it.

## Files changed
- `src/features/learning/path-page.jsx`: hero, breadcrumb row, and passes the summary into LessonPath.
- `src/features/learning/path-views.jsx`: PathSummary is now a disclosure. PathList has chapter cards and compact
  rows. LessonPath owns the selection/sheet state and the grid layout.
- `src/features/learning/learning.css`: hero, path grid, chapter and row styles, reading typography, phone top bar,
  and stack-gap fixes.
- `src/features/learning/lesson-player-page.jsx`: reading-card class, header meta order, top-bar classes.
- `src/features/learning/lesson-markdown.jsx`: focusable `<pre>`.
- `src/features/learning/dashboard-page.jsx`: section order.
- `src/features/learning/progress-page.jsx`: status cell nowrap.
- `src/features/learning/insights-pages.jsx`: card codes removed, stack fix, hub card layout.
- `src/features/coding/coding.css`: test-row alignment.

## Verification
- `npx vite build` (outDir scratchpad/build-learner) passes.
- All routes were shot at 1366x900 and 390x844, in light and dark. There were no page or console errors. Scripts and
  shots are in `scratchpad/e2e/learner/` (`before/`, `after*/`, `final/`).
- axe WCAG 2.1 AA on all learner routes (light 1366, dark 1366, light 390): 0 violations.

## Shared change requests
- `src/styles/app.css`: several feature classes set `margin: 0` on elements that live inside `.stack-*`. Because the
  specificity is equal and these rules come later, they silently cancel the stack gap; I fixed the learner ones
  locally. A note in app.css, or `:where()` on the stack selectors' targets, would prevent the next one.
- Lesson content data: some javascript.info code samples contain blank lines where the source's `*!*` highlight
  markers were stripped (for example `let message;` / blank / `message = 'Hello';`). This is a seed-data issue
  (server/seed), not rendering.
- `src/lib/charts.js` `charts.card` still supports `code` labels. Other areas (lecturer/admin insights) may pass
  them too.

## Unresolved / not done
- Tutor page header keeps the small "Tutor" label above the thread title. I judged it a minor nit and left it,
  because on phones it is the only place the page names itself.
- The "a quiz lesson" route is lesson-js-001 itself (its quiz section). It was checked as part of that page.
