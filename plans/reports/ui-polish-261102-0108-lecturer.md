# UI polish: lecturer area (261102)

Scope: the lecturer routes under `/teach/**` for `usr-lecturer-001`, in Operate mode. I followed the impeccable polish, critique and craft-floor references and did not redesign anything. I captured 1366x900 and 390x844 in light and dark (`codi-theme` set in localStorage, because `colorScheme` alone does not switch the app theme).

Note: the critique ran in a single context (degraded). I did the design review and the browser evidence inline and did not run them as separate sub-agents. That kept the pass small, as the YAGNI brief asked.

Files touched (all inside my ownership):
- src/features/lecturer/course-editor.jsx, lecturer.css, quiz-builder.jsx, grading-page.jsx, support-pages.jsx, progress-pages.jsx, insights-page.jsx
- src/features/lecturer-ai/grading-ai.jsx, quiz-ai-review.jsx, code-editor-page.jsx, lecturer-ai.css
- src/styles/lecturer.css

## Changes and why

| Route | Before | After |
|---|---|---|
| Course editor, Nội dung tab | Row actions were one flex run of 5–8 buttons. Rows with or without "Thêm bài tập", and code lessons, shifted every icon sideways, so no column lined up. At 390px the chapter title wrapped one word per line next to its actions. | Each lesson row now has two fixed-slot groups. Text links (Chi tiết/Code · Quiz · Thêm bài tập) sit in a 3-column grid. Icon tools (AI · rename · up · down · delete) sit in a 5×36px grid, with an empty slot when a tool is absent, behind a 1px divider. Icons are muted until hover, and delete turns red on hover. Below 1100px the actions move to their own line under the title. Below 640px the chapter actions wrap under the title, the drag grips (pointer-only) are hidden, and rows are separated by hairlines. |
| Course editor, Nội dung tab | The danger card border was a hard-coded `#fecaca`, which was too bright in dark mode. The highlighted lesson used a 3px side stripe (a craft-floor ban). | The border now mixes the `--danger` token. The highlight is a 1px inset ring. |
| Course editor, Thông tin tab | In the 3-column grid, the Danh mục and Trình độ selects stretched to the height of the price field and its help text. | The grid uses `align-items: start`. |
| Quiz builder | The options fieldset had inline `margin:0`, which cancelled the stack gap, so the "Các phương án" legend touched the textarea above. The "Đúng" label was wider than A/B/C/D, so the input of the correct option was offset. | The inline style is replaced by `.tc-opts`, which resets only border and padding. The correct-answer label has a fixed width of 76px. |
| Quiz, "Tạo bằng AI" dialog | Same `.te-fieldset` margin-reset bug: "Nguồn nội dung" was jammed against the intro paragraph. | Added `.lai-fieldset`, which restores the stack gap and the legend spacing. |
| Code editor | Same legend bug on "Các bước yêu cầu đề bài" and the test-case fieldset. Step textareas clipped their text at 2 rows. | `.lai-fieldset` is applied. Step textareas use `field-sizing: content`, between 4.5em and 16em. |
| Code preview | The empty result state ("Bấm "Chạy thử" … "Nộp bài" …") broke into five centred lines, because `.lai-empty-run` is a grid and turned each inline run into a grid item. | `p.lai-empty-run` is displayed as block, so it reads as one sentence. |
| Grading list | The three filter selects wrapped unevenly (two wide, one on a new line). | The filters are an equal 3-column grid (max 960px), one column on mobile. |
| Grading detail | The rubric score inputs were unstyled 24px boxes. The "Nhận xét cho học viên" label was larger than the other labels. | The inputs use `.input` (full height, right-aligned). The label uses `.field-label`. |
| Grading AI draft card | The feedback read "…rõ ràng.." with a double period, because the rubric description already ended in a period. "Bỏ bản nháp" was left orphaned under the primary button. | The trailing punctuation is stripped from the description. The two action buttons share the row width evenly. |
| Hỏi đáp | The reply form was broken: the label and an unstyled 160px monospace textarea sat side by side. | The textarea uses `.textarea`, full width. The label is on its own line. |
| Tiến độ học viên (course) | The progress bar had zero width inside a flex row, so only a small "62%" showed. | The bar fills the cell (minimum 64px), and the percentage is tabular and right-aligned. |
| Doanh thu | axe `scrollable-region-focusable` at 390px: the revenue table scrolls but had no focusable content. | The table wrapper is a focusable named region. |

Already fine and left as is: Tổng quan, Khoá học của tôi, Tạo khoá học, the Bản đồ kiến thức and Xuất bản tabs, Đánh giá, Mẫu nhận xét, and the Doanh thu chart.

## Verification
- `npx vite build --outDir <scratchpad>/build-lecturer --emptyOutDir` passes.
- All 18 routes at desktop-light and mobile-dark show no console or page errors and no horizontal overflow.
- axe WCAG 2.1 AA on all 18 routes × light/dark × 1366/390 is clean after the insights fix.
- I measured the fixes in the browser: progress bar about 77px wide, empty state rendered as block, legend gap 16px, step textareas auto-sized.
- Scripts and screenshots: `<scratchpad>/e2e/lecturer/` (shots.js, ai.js, axe-lect.js, probe.js).

## Shared change requests
1. **src/styles/app.css:435**: `.split-list-item[aria-current="true"]` uses `box-shadow: inset 3px 0 0 var(--accent)`. That is a side stripe wider than 1px, which craft-floor bans, and it shows on the grading and Q&A lists. Suggest the accent-soft background plus a 1px inset ring, or the background alone.
2. **Scenario drawer trigger ("Kịch bản thử nghiệm")**: at 390px it floats over page content. It covers the "Đóng" footer button of the "Tạo câu hỏi bằng AI" sheet and a form label on the code editor. Suggest lifting it above sheet footers, or hiding it while a modal is open (shell owner).
3. **src/styles/app.css:1018**: `.te-fieldset { margin: 0 }` cancels `.stack-*` spacing wherever it is used. I worked around it locally with `.lai-fieldset`. A global fix would be to drop `margin: 0` (fieldsets have no default vertical margin anyway) or to scope it to `margin-inline`.

## Unresolved questions
None.
