# Critique: lecturer and admin workspaces

Method: ⚠️ DEGRADED: single-context (no sub-agents spawned; `impeccable detect` not run, since the brief did not ask for it). Lenses: impeccable critique, craft-floor, mode-operate (lecturer and admin are Operate surfaces).

Captures: `D:/CODE/Study/FPT/Ki_5/SWP391/codi-rebuild` is untouched. Screenshots are in `C:/Users/LENOVO/AppData/Local/Temp/claude/d--CODE-Study-FPT-Ki-5-SWP391/c9ca5ad5-12fa-4969-93ea-67fd3d672e1a/scratchpad/e2e/lecturer-admin/shots/`. Capture script `.../e2e/lecturer-admin/capture.js` (27 routes, 1440x900 and 390x844, light and dark, full page). Interaction script `.../e2e/lecturer-admin/interactions.js` (quiz AI dialog, content AI import, order drawer, export dialog, grading AI assist, code run).

Coverage: I looked at every desktop-light capture for the pages listed under Pages, plus the order drawer, quiz AI dialog, and one mobile grading shot. The following were captured but not reviewed in detail: `teach-courses`, `teach-new`, `course-info`, `snippets`, `progress-index`, `admin-courses`, `admin-vouchers`, `admin-insights`, and the mobile captures for everything except grading. Dark mode was checked only for body background, not visually. Treat those as open.

Note on the grading AI card: another agent is reworking it. I only critique its position in the layout.

---

## Pages

### /teach (lecturer home)
Mode: Operate. Shot: `teach-home-d-l.png`
1. The rejection alert is correct and first. Good.
2. Four KPI tiles (`5 Bài chờ chấm`, `4 Câu hỏi`, `4 Đánh giá`) and four status tiles (`1 Bản nháp`, `1 Chờ duyệt`, `1 Bị từ chối`, `2 Đã xuất bản`) repeat the same job. Two rows of boxed numbers before the user reaches the course list.
3. The course list is four stacked boxed rows, each with a thumbnail and a "Mở" button. Each row repeats the course title as a link and as a button.

Delete: the status tile row. Fold it into the course list as a filter.
Proposed layout: rejection or pending alert, then a single "Cần xử lý" hairline list (grading, questions, reviews, with counts as the numbers), then "Khoá học" as a plain table with status as text, not a pill.
Effort: S.

### /teach/courses/:id (content tab)
Mode: Operate. Shots: `course-content-d-l.png`, `course-content-m-l.png`
1. Each lesson row has up to eight controls: drag handle, "Chi tiết", "Quiz", "Thêm bài tập", AI, edit, up, down, delete. Up and down arrows duplicate the drag handle. Icons and text labels compete.
2. The chapter header has five icon buttons. Chapter 1 has no up arrow and the last chapter has no down arrow, so the disabled states are visible noise.
3. The explainer box and the "Diagnostic test: Đã có (10 câu)" line are repeated on every lesson-editing tab.
4. Mobile is 3838px tall and the row controls wrap badly.

Delete: the duplicate up/down arrows (keep the drag handle), and the repeated explainer on other tabs.
Proposed layout: a chapter as a hairline section with its title and one "+ Bài học" action. Each lesson is one line: type, title, duration, and a status chip. "Chi tiết" is the row click target. Quiz, Code, AI, and the reorder/delete actions move into an overflow menu.
Effort: M.

### /teach/courses/:id/kmap (react, published) and /teach/courses/course-ts-001/kmap
Mode: Operate. Shots: `course-kmap-d-l.png`, `course-ts-kmap-d-l.png`
1. **The bug is in `src/lib/charts.js`, function `charts.graph`.** Two faults combine:
   - Line 383: `byLayer` is a sparse array. When no node has in-degree 0, which happens in a fully cyclic graph like TS, index 0 stays a hole. Line 384, `Math.max(...byLayer.map(...))`, then returns NaN, so the canvas width is NaN. That produces the console errors `<svg> attribute width: Expected length, "NaN"` and the same for `<path d>`.
   - Line 380: each cycle member gets its own new layer (`maxL += 1`). Every node lands in its own row, so the graph is one column with a huge scroll.
2. The cycle alert and the disabled "Xác nhận" button are correct and honest.
3. The published react graph works, but its nodes sit in a centred tree with 100% zoom and a grey canvas that is empty on the right. The side panel "Chưa chọn khái niệm" is fine.

Delete: the per-cycle-member layering. Replace with: compute the strongly connected components, collapse each into one "cycle group" node, layer the condensed DAG, and draw cycle members side by side inside their group. Also compact layer indices before taking the max.
Effort: M for the layout fix, S for the NaN guard alone.

### /teach/courses/:id/publish
Mode: Operate. Shot: `course-publish-d-l.png`
1. Seven checklist rows, each with a repeated "Đạt" pill on the right. Status is shown twice, once by the check icon and once by the pill.
2. The top banner says "Đã xuất bản" and then the same message appears in the checklist header ("7/7 đạt"). Three places say the same thing.

Delete: the per-row pill; keep the icon and the header count.
Proposed layout: one status line, then the checklist as hairline rows with unlabelled checks, then the action at the end.
Effort: S.

### /teach/courses/:id/quiz/:lessonId and the "Tạo câu hỏi bằng AI" dialog
Mode: Operate. Shots: `quiz-builder-d-l.png`, `ix-quiz-ai-dialog-d-l.png`
1. The layout is right: question list on the left, a 300px settings column on the right with the pass threshold and "Gợi ý trước khi gửi duyệt".
2. The four option rows each carry a radio, a text field, a remove X, and a green band for the correct answer. The band and the radio say the same thing. Pick one.
3. The AI dialog is clean: a clear source choice, a focus field, and a primary "Tạo câu hỏi". It is a modal for a task that needs focus, so it is acceptable. Its footer has "Đóng" and "Tạo câu hỏi" in the same visual weight, with the destructive-looking one not an issue.
4. Mobile is 2509px tall. The question cards stack and become hard to scan.

Delete: the green band on the correct option (keep the radio). Make the question card a hairline section, not a bordered card.
Effort: S.

### /teach/courses/:id/code/:lessonId (code editor)
Mode: Operate. Shot: `code-editor-d-l.png`
1. The page is a form, not an editor. Five tabs, a title field, a duration field, a language select, a file-name field, and three checklist textareas in one card. The code body is hidden behind the "Code khởi đầu" tab.
2. The right column "Chạy thử với lời giải" is a dashed empty state. Useful, but it sits next to a form with no code in view.
3. The three action buttons at the top ("Xem như học viên", "Chạy thử với lời giải", "Lưu bài code") have the same weight, and the primary is in the middle.

Delete: the "Gợi ý (3)" tab if hints can live under the statement. Move the run panel under the code.
Proposed layout: two-pane editor, statement on the left as read-only text with a checklist, code on the right, run results below. Form fields for title and duration move to a small header row.
Effort: M.

### /teach/courses/:id/code/:lessonId/preview
Mode: Read. Shot: `code-preview-d-l.png`
1. This page is the strongest on the list. Statement, sample steps, code panel, and results all read as a real workspace.
2. Only issue: the tab header "Đề bài & Yêu cầu / Gợi ý (3)" is a segmented control inside a card, which doubles the card border.

Keep as the model for the other code pages. Effort: S, cosmetic.

### /teach/grading and /teach/grading/:submissionId
Mode: Operate. Shots: `grading-index-d-l.png`, `grading-sub-d-l.png`, `grading-sub-m-l.png`
1. The three-column layout (queue, submission, rubric) is right on desktop. The submission card is the best reading surface in the lecturer area.
2. Rubric score inputs are empty and show only "/ 4", "/ 2" etc. There is no prefill and no stepper, so each criterion costs one click plus typing. The total "Tổng điểm: 0/10" uses a monospace digit that reads as code.
3. The "AI gợi ý điểm và nhận xét" action sits between the total and the comment box as a ghost text button. It reads as an afterthought for the feature the team is reworking. Layout only: it should sit in the rubric header as a secondary action, not in the flow.
4. Mobile: the queue list takes about 320px before the submission appears, and the rubric is below the fold.
5. Tab bar "Chấm bài / Hỏi đáp / …" on mobile is clipped at the right edge ("Chấ"). It scrolls, but nothing signals that.

Delete: the separate "Lưu điểm" and "Lưu và chấm bài tiếp theo" plus the link under them. Keep one primary and one "Tiếp theo" secondary.
Proposed layout: queue as a narrow sticky list; submission as a hairline section; rubric as a sticky side panel with numeric steppers prefilled to the max score.
Effort: M.

### /teach/questions and /teach/reviews
Mode: Operate. Shots: `questions-d-l.png`, `reviews-d-l.png`
1. Questions: master-detail is right. Two tab systems stack (tab bar and segmented control "Câu hỏi từ học viên (7) / Cuộc hội thoại AI (1)"). Pick one.
2. Reviews: six near-identical bordered cards stacked full width. Short text leaves most of each card empty. Reply area is nested inside the card.

Delete: the segmented control on Questions (merge into the tabs). On Reviews, the nested grey reply box.
Proposed layout: Questions as the master-detail already is. Reviews as a table or hairline list with stars, text, and reply on expand.
Effort: S.

### /teach/progress and /teach/progress/:courseId
Mode: Operate. Shots: `progress-course-d-l.png`, `progress-index-d-l.png`
1. The 28-row table is calm and dense in the right way. Progress bars and figures read well.
2. The grey explainer at the top is three paragraphs of caveats ("không gồm bài kiểm tra đầu vào", "không trừ điểm", and so on). It is the best evidence of provenance on the page, but it sits as the first thing read.
3. "Gợi ý" column is "Chưa ghi nhận" in every row. An empty column of identical text should be hidden until there is data.

Delete: the "Gợi ý" column while empty. Move the caveats into one collapsed "Cách tính" note.
Proposed layout: three KPI figures in a single line, then the table, then the note at the bottom.
Effort: S.

### /teach/insights
Mode: Read. Shot: `teach-insights-d-l.png`
1. This is the closest page to the SOI calm-table direction. Period switcher, five figures, one chart, one table.
2. The per-course table sits inside a card whose header and table each have a border, so a double frame appears.
3. Figures have an arrow and a colour, which is good.

Delete: the outer card around the course table. Keep the header as text.
Effort: S.

### /admin (dashboard)
Mode: Operate. Shot: `admin-dashboard-d-l.png`
1. Four KPI tiles (`35.888.000 ₫`, `39`, `27`, `5`) are the hero-metric template from craft-floor: big number, small label, accent colour. Then four "Cần xử lý" tiles with the same shape. Then two analytics tiles. Then a table. Four boxed sections of cards before the table.
2. The recent-orders table is clean.
3. The "Quan sát" and "Tài chính" tiles are navigation dressed as analytics.

Delete: the four "Cần xử lý" tiles. Replace with one row of counts, each a link.
Proposed layout: a single "Hôm nay cần làm" strip with the counts, then recent orders as a table, then the two analytics links as text rows.
Effort: S.

### /admin/publication
Mode: Operate. Shot: `admin-publication-d-l.png`
1. The decision area is the best admin form: criteria with Đạt / Cần sửa / Không áp dụng, notes, a suggested-status line, and a disabled "Duyệt và xuất bản" with its reason shown. Keep this pattern.
2. The left column holds one item in a 380px box and then empty grey space for the whole page. The queue is too narrow to be a list.
3. Each criterion has three toggle buttons plus a note field. Seven criteria make a 1,300px column. The page is very long for a checklist.

Delete: the left column when the queue is short. Move the queue to a header select.
Proposed layout: queue as a dropdown or a tab row, then the criteria as hairline rows with the three toggles inline, then the verdict block sticky at the bottom.
Effort: M.

### /admin/users
Mode: Operate. Shots: `admin-users-d-l.png`, `admin-users-m-l.png`
1. 109 rows on one page, about 7100px desktop and 7340px mobile. No pagination shown.
2. Every row has a role select and a "Lưu" button, so 109 selects and 109 save buttons are on screen at once. A role change should be a drawer or a menu action.
3. "Vô hiệu hoá" is a red outline button on every row. Destructive actions this common train misclicks.
4. Column headers are readable and the status dot is a good touch.

Delete: the per-row role select and "Lưu". Delete the per-row red button in favour of a row menu.
Proposed layout: search and filter row, a dense table with pagination of 25, row click opens a drawer with role and status.
Effort: M.

### /admin/orders and the order drawer
Mode: Operate. Shots: `admin-orders-d-l.png`, `ix-order-drawer-d-l.png`
1. The table is dense and calm, with mono codes and status pills. This is the right direction for admin tables.
2. The four KPI cards at the top repeat the table's own filters. The "Cần đối soát" and "Quá 24 giờ" chips are the actual work. Promote them.
3. The drawer is clean: customer, course, amount, VietQR transfer block, status timeline, and a footer with a red "Huỷ đơn hàng" primary.
4. The table is 3258px tall with about 40 rows. Pagination is absent.
5. Mobile is 3772px tall. The seven columns do not fit at 390px; no horizontal scroll cue is visible in the capture.

Delete: the four top KPI cards (keep the counts as filter chips).
Proposed layout: filter chips with counts, then the table, then pagination. Drawer stays.
Effort: S.

### /admin/finance
Mode: Read. Shot: `admin-finance-d-l.png`
1. The page is 3971px tall on desktop and 6181px on mobile, with nine sections. Each section is a bordered card with a "Bảng số liệu" link. The link appears seven times.
2. The "Chỉ số doanh thu" block has five figures and then a 6th in a second row. The row break is accidental.
3. The status bar for order states and the reconciliation cards carry the most information and are visually buried under the revenue line chart.
4. The footer "Xuất CSV" card sits alone at the bottom.
5. Provenance is missing. Figures are computed from paid orders, but nothing labels them as real or estimated, and "Hoàn tiền" and "Đơn chờ" mix meanings.

Delete: the separate "Bảng số liệu" links (one toggle for the whole page). Collapse the "Chi tiết thêm" group into tabs.
Proposed layout: one summary strip, then reconciliation as the first working block, then charts on a second tab, then the detail tables under tabs. Mobile should show the summary and the reconciliation list only.
Effort: M.

### Admin pages not reviewed in detail
`/admin/courses`, `/admin/vouchers`, `/admin/insights` (and `/admin/insights/:card`), `/admin/finance/:card`, and the `admin-finance` mobile capture were captured but not reviewed. Do not treat them as passed.

---

## Cross-page systemic issues

1. **Boxed cards everywhere.** Almost every section is a bordered card inside a bordered card. This is the "same-size card" scaffold from craft-floor. SOI's hairline sections would cut the visual weight on every page.
2. **Hero-metric tiles on every dashboard.** Big number, small label, teal accent. Home, admin dashboard, finance, insights, and progress all do it. Accent is used for every number, so none stands out.
3. **Repeated status and explainers.** The same status is shown as a banner, a pill, and a count. Explainer text is repeated on every tab. Consolidate.
4. **Tables with no pagination or density control.** Users (109 rows), orders (40+), progress (28). Mobile has no table strategy: rows stack to 3000px+ or overflow.
5. **Row action overload.** Lesson rows (8 controls), users (role select plus save plus red button per row). Move secondary actions into menus.
6. **Empty and disabled states that take space.** Empty "Gợi ý" column, the one-item queue column on publication, the empty chart area on the course kmap.
7. **No provenance labelling.** Insights, finance, progress, and AI-suggested values carry no REAL, MOCK, INFERRED, or MISSING marker. The progress caveat text is the only case, and it is prose.
8. **Mobile is mostly unaddressed.** Lecturer and admin pages stack into 2,000 to 7,000px pages. Tab bars clip without an affordance.
9. **Monospace for numbers and codes is inconsistent.** Order codes and "Tổng điểm" use mono; other figures use the sans. Use mono only for codes.
10. **Dark mode not reviewed visually.** Capture exists; body background switches correctly. A visual pass is still needed.

## The 10 changes with the biggest payoff

1. Fix the kmap layout in `src/lib/charts.js` (`charts.graph`): guard the empty-layer max, compact layers, and collapse cycles into one row or group. Effort M.
2. Reduce course-content row actions to a row click plus an overflow menu, and drop the duplicate up/down arrows. Effort M.
3. Replace the admin users row controls with a drawer and add pagination. Effort M.
4. Restructure admin finance into a summary strip, reconciliation first, and tabbed detail with one "Bảng số liệu" toggle. Effort M.
5. Collapse the hero-metric dashboards (lecturer home, admin dashboard) into one "Cần xử lý" strip of counts. Effort S.
6. Replace bordered cards with hairline sections on the lecturer and admin shells (one layout primitive, not per page). Effort L, but one primitive pays off across all pages.
7. Give the rubric panel prefilled steppers and move the AI assist into the rubric header as a secondary action, coordinated with the other agent's grading work. Effort M.
8. Fold the publication queue into a select and widen the decision column; make the checklist hairline rows with inline toggles. Effort M.
9. Move the progress caveats into one collapsed note and hide the empty "Gợi ý" column. Effort S.
10. Add REAL, MOCK, INFERRED, or MISSING chips to insights, finance, and progress figures, derived from the existing data flags rather than a new model. Effort M.

---

## Status: DONE_WITH_CONCERNS
Summary:
- kmap TS graph bug is in `src/lib/charts.js` `charts.graph`: the sparse `byLayer` array produces NaN width when no node has in-degree 0, and each cycle member is placed in its own row. Fix the layering, not just the guard.
- Lecturer and admin pages are box-heavy: same-size bordered cards and hero-metric tiles on every dashboard.
- Admin users (109 rows with per-row role select and save) and finance (nine stacked sections, about 4000px desktop and 6200px mobile) need structural rework.
- Course content lesson rows carry up to eight controls; the rubric panel leaves scores empty with no prefill.
- Mobile is largely unaddressed, and provenance labels are absent on insights, finance, and progress figures.

Concerns: several captured pages were not reviewed in detail (see Coverage), dark mode was not reviewed visually, and no detector run was done. Unresolved: whether the teal accent should be reserved for primary actions only (SOI style); needs a decision before the layout pass.
