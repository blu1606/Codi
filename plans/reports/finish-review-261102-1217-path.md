disposition: fix

Verdict: SHIP AFTER FIXES. The transit world holds (navy frame, line colours, white ring, interchange corridors, a readable lesson table), but the diagram does not show the whole course and leaves a large dead area. Both problems are visible from the examiner seats.

Unread: react-001-390-*, js-001-1440-dark, js-001-390-dark, react-001-1024-* (sampled 7 of 12 captures; the git-001 route was not captured). Code-led build: there is no approved comp, so fidelity is judged against the direction contract and the quality bar cards.

## persistence
pass. PRODUCT.md is present. The surface brief is recorded at .impeccable/surfaces/src-features-learning-path-page-jsx.md. The FORM seed seed:73e7880f59c72561 was corroborated: concept-seed --check-seed exited 0. Only .impeccable/mocks/decision/* exist, and they are exempt. No comp round means state.json is not required. DESIGN.md is absent and the documenter writes it after this review, so that is not a finding.

## fidelity
- THESIS: chapters as coloured lines, lessons as stations, one "Bạn đang ở đây" interchange: match.
- OWN-WORLD navy frame #0f172a on the light ground: match (--pt-frame). In dark mode it becomes a lifted navy panel. That is an adaptation, cited in the path-transit.css header comment.
- Line colours teal/blue/amber/green, with travelled segments solid and upcoming ones dimmed: match. Chapter 5 is purple because the JS course has 5 chapters. That is an adaptation forced by product truth.
- White ring at the current station plus the label pill: match.
- 45/90-degree bends: match.
- Fixed-size station labels in Be Vietnam Pro, minutes in tabular JetBrains Mono: match.
- Single teal primary "Học tiếp": match.
- FIRST VIEWPORT "four chapter lines" in the frame: contradicted. At 1440 and 1024 the frame shows 2 to 3 chapters. Chapter 1 (and chapter 5 in JS) is off-frame, and labels are cut mid-word at both edges ("ữ liệu có cấu trúc", "ối tượng và destructuring", "Trình duyệt và DOI", "Thử thác / lý danh", "Làm việc với mảng").
- Brief "the whole course in one view": contradicted. At 1440 the diagram is a horizontal strip that scrolls inside the frame.
- Zoom/locate controls in the frame corner: match.
- "Chuyến tiếp theo", next three with line chip, minutes and reason: present. The minutes are buried mid-meta, so they do not read as departures. Partial; see ceiling.
- "Thông báo tuyến", moved and locked lessons: match (alerts.png shows "Đã đổi thứ tự · lên 5 bậc").
- Full lesson table grouped by line, readable as text: match.
- Layout balance at 1440: the frame ends about 290px (JS) or about 540px (React) above the side column, leaving a blank light block. At 1024 the empty "Thông báo tuyến" card is stretched to about 450px of nothing.
- TYPE: adaptation. The condensed uppercase signage face from the quality bar is not adopted. Cited: the surface brief keeps Be Vietnam Pro / Lexend / JetBrains Mono.
- MATERIAL: match. Flat vector is the native medium of a transit diagram, and there is no faked physicality.
- GROUND: match to OWN-WORLD (#0f172a frame, light Codi page).
- Added without approval: the prototype "Kịch bản thử nghiệm" dev toggle (global shell). It overlays the frame corner at 1440, the "Chuyến tiếp theo" heading at 1024, and the station line at 390.

## ceiling
Quality bar devices the build leaves unused:
- (a) The network seen whole, with lines converging on the interchange. Today it is a single scrolling ribbon.
- (b) A departures board with a right-aligned tabular minutes column.
- (c) Severity in the alert header, such as an active count like "2 active", and alert icons that vary by kind. Today every icon is a neutral grey circle.
- (d) Terminus labels at line ends.

## material_fixes
1. Fidelity (FIRST VIEWPORT / whole course). Fix the layout geometry in src/features/learning/path-transit.jsx (constants at lines 13-25, layout ending at line 81):
   - Stop laying chapters end to end on one horizontal strip. Stack each chapter as its own horizontal row, and join consecutive rows with the existing white transfer corridor running down at 45 degrees.
   - This makes net.width fit the frame (about 800px at 1440, about 990px at 1024) at zoom 1, so every line, including chapter 1 and chapter 5, is visible without scrolling.
   - Horizontal scroll stays only for zoom > 1.
   - Keep scrollToCurrent for zoomed states only.
2. Layout (known gap). The stacked rows from fix 1 give the frame a natural height that matches the side column at 1440. Then:
   - In path-transit.css, inside @media (min-width:1280px), add .pt-frame { align-self: stretch; display: flex; flex-direction: column } and .pt-scroll { flex: 1; align-items: center }, so any remainder becomes centred navy inside the frame rather than blank page.
   - Separately, add align-items: start to .pt-side (css line 67) so the 1024 empty-state alerts card stops stretching.
3. Fidelity (labels sliced at frame edges). When the canvas is wider than the frame (zoom > 1), add an edge fade on .pt-scroll, for example mask-image: linear-gradient(90deg, transparent, #000 32px, #000 calc(100% - 32px), transparent), applied only when scrollable. Also clamp scrollToCurrent and the centre restore so the scroll position never lands mid-label.
4. Floor (kicker ban). .pt-dep-line in path-views.jsx:112 puts "Chương 3 · Luyện tập lập trình" as an eyebrow above .pt-dep-title. Move LineChip inline to the left of the title as the line bullet. Fold the chapter name into the meta row after the title, or into the chip aria-label/title, and delete the eyebrow paragraph.
5. Contract STORY (read the next three departures) and ceiling. Restructure .pt-dep-item (css line 194) as grid-template-columns: auto 1fr auto: line chip, then title plus reason, then minutes right-aligned in .pt-mono at --text-lg. Remove the minutes from the inline meta row so the departure time reads from a projector distance.
6. Added without approval (dev toggle overlap). In src/features/shell/dev-drawer.jsx, #dev-toggle is fixed bottom-left and overlays the diagram (1440 and 390) and a panel heading (1024) in the projected demo. Move it to bottom-right, or collapse it to an icon-only tab flush to the viewport edge. It stays reachable via Alt+K.
7. Ceiling (alerts). In the "Thông báo tuyến" panel (path-views.jsx:158-168), put the active alert count in the header next to the h2, for example "3 bài khóa · 1 đổi thứ tự" in muted mono. Give the arrow-up (moved) icon the line-colour background instead of the neutral --subtle (.pt-alert-icon, css line 211), so moved and locked alerts are told apart by shape and colour, not text alone.
8. Responsive polish (390 and 1440):
   - .pt-goal-edit margin-left (css line 54) makes "Chỉnh mục tiêu" wrap with an indent. Reset it to 0 below 768px.
   - The chapter head wraps "Xem các bài" alone on chapter 2 but not on chapter 1. Give count plus toggle a dedicated second row below 768px.
   - The .pt-legend item "Chuyển chương" orphans onto its own line at 1440. With the stacked layout, keep the legend on one row.

## keep
The navy frame as the only dark object on the page, and the white ring with its "Bạn đang ở đây" pill. Keep the white interchange corridors between chapters, the line-coloured chips that carry from the diagram into the grouped lesson table, and the "Mô phỏng" truth labels on the AI reasons.
