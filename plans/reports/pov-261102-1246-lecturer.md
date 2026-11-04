# POV review: lecturer (Trần Quốc Huy, usr-lecturer-001)

Scope: `src/features/lecturer/**`, `src/features/lecturer-ai/**`, `src/styles/lecturer.css`. No shared files edited.
Method: Playwright walk at 1366x900 and 390x844 (scripts and screenshots in `…/scratchpad/e2e/pov-lecturer/`). Persona tasks performed end to end: create course, read the rejected course's review feedback, run AI grading on a submission, apply and save, reply to a Q&A question, open the publish checklist, filter to learners who need support and message one. Mobbin and web research cited below. The `impeccable` critique ran in degraded single-context form (see Impeccable critique).

## Commits

| Commit | Change |
|---|---|
| `b046c5b` | Publish checklist: each unmet condition names its action ("Viết mô tả", "Thêm bài học", "Nhập giá", "Tạo bài kiểm tra", "Xem và xác nhận", …) instead of four identical "Sửa ngay" links. |
| `a30b9b8` | Grading: save actions are sticky at the bottom of the form. Verified: "Lưu điểm" at y=748 of 900 after scrolling. |
| `36207c3` | Grading: a graded submission with no per-criterion breakdown shows a notice with the saved score, instead of a blank rubric and "Tổng điểm 0/10". Verified on sub-004 (score 9). |
| `4ef27e8` | AI grading draft: "Mô phỏng" badge next to "AI đề xuất" on the finished draft, matching the running state. Verified. |
| `c61bfe2` | Phones: after picking a question or submission, the detail pane scrolls into view (`reveal-on-select.js`). Verified at 390px: Q&A detail 586px → 193px from top; grading detail → 0. |
| `7ae11d7` | Content tab: rare lesson and chapter actions (AI import, rename, add assignment, move, delete) moved into one labelled ⋯ menu. Chi tiết and Quiz stay visible. Verified: menu opens, "Đổi tên" opens the rename field. |
| `2de975e` | Grading: unsaved score or feedback edits set the shared dirty guard. "Bỏ qua, sang bài tiếp theo" asks first (confirm with consequence); switching submissions asks via the existing guard. Verified: skip → confirm shown; Huỷ keeps the draft; list switch → confirm shown and URL unchanged. Closing the tab uses the existing `beforeunload` prompt. |
| `e29e83a` | Course editor: step rail (Thông tin → Nội dung → Bản đồ kiến thức → Xuất bản) replaces the tab bar. Each step shows Đã đủ / Còn N việc / Sẵn sàng gửi, from the same `readiness()` checks, plus "Bước tiếp theo". Every step is still a link to its tab. `/teach/new` shows the four steps before creating. |
| `65dc76a` | Progress: learners get a "Tình trạng" reason list (Chưa bắt đầu học; Không hoạt động N ngày, measured to the data's as-of date; Quiz TB < 60%; Đang chờ trả lời). "Cần hỗ trợ (N)" filter. Row actions: "Trả lời" (deep link to the waiting question), "Nhắn" (in-app notification with a reply-ready draft), "Xem chi tiết" (sheet now starts with the reasons). Course card shows "N học viên cần hỗ trợ". |
| `39eaf69` | Progress table: row actions kept on one line; dropped the "Gợi ý dùng" column, which read "Chưa ghi nhận" for every learner. The unavailable-data note stays in the panel. Verified: table fits its container, no horizontal overflow at 1366px. |

Gates: `vite build` passes after each commit (0 errors). Final `smoke.js`: 59 ok, 0 FAIL. Final `axe.js`: "no violations".

## Persona walk: findings

### 1. Create course and authoring order
- Create form (4 fields) → editor with empty state works on desktop and phone.
- Fixed (`e29e83a`): no guided order existed. A new lecturer only found the missing price, outcomes and entry test at the publish tab. The step rail shows completion per step and names the next one.
- Evidence: Udemy's course authoring uses a left rail grouped Plan / Create / Publish with completion ticks and "Submit for Review" at the bottom. https://mobbin.com/flows/d56599b1-676e-4b0b-ac3d-398f1b0bfe68 and https://mobbin.com/flows/5dbac0dc-8625-41ac-a6c6-4bc96a611655. Setup checklists with per-step state: Time2book https://mobbin.com/screens/2e6265e9-a171-4d31-b7f7-fe0433cfe5c0, Pipedrive "Before you start" https://mobbin.com/screens/a95ff875-d1b9-440c-802f-60379db1ee3a.
- Variant chosen: a horizontal four-step rail above the content, not a left rail, because the app already has a left sidebar and the editor width is needed for the lesson tree. Tabs and routes unchanged.
- Left: the Content tab intro is one long paragraph of UI instructions. Low impact.

### 2. Lesson row actions (Content tab)
- Fixed (`7ae11d7`): eight controls per row, three of them icon-only (AI, rename, move), now Chi tiết + Quiz visible and one labelled ⋯ menu. Chapter row follows the same pattern.
- Evidence: WCAG 2.4.4 (link purpose from text) https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context; the Materials-style "one primary visible" rule from the impeccable critique method.
- Trade-off: "Thêm bài tập" moved into the menu. It was a labelled button before; it is now one tap further.

### 3. Publish checklist
- Fixed (`b046c5b`): repeated identical "Sửa ngay" links. Named per-target actions instead.
- Already good, unchanged: the "x/5 đạt" counter, the blocker summary, and the rejection feedback with "Đánh dấu đã sửa". Whop and Vercel use the same readiness-list pattern: https://mobbin.com/screens/11c1db5a-5a81-4f39-8722-de70adf6a925 and https://mobbin.com/screens/dc17d998-fce6-46e8-9149-acb19053d7ed

### 4. AI grading (the main backlog)
- Walked: queue → "AI gợi ý điểm và nhận xét" → running stages → draft → "Dùng bản nháp này" → "Lưu điểm".
- Good, unchanged: the draft never sets the grade by itself; the "AI chỉ gợi ý" alert says so; the queue shows "Lỗi AI" and "Có gợi ý AI"; unassessed criteria show "–".
- Fixed: sticky save bar (`a30b9b8`); rubric-less graded notice (`36207c3`); simulated label on the finished draft (`4ef27e8`).
- Fixed (`2de975e`): skip and list switching dropped unsaved edits silently. Now the existing guard asks first, with the consequence stated.
- Left: no keyboard shortcut to save and advance. Speed suggestion, not a defect.

### 5. Q&A
- Desktop reply flow works (select, type, send, toast, thread updates).
- Fixed (`c61bfe2`): on phones the reply form sat below the whole list.

### 6. Struggling learner (/teach/progress)
- Confirmed path before the change: the course table listed learners and quiz averages, but nothing said who was stuck or why, and there was no message or Q&A action. A lecturer had to read every row.
- Fixed (`65dc76a`, `39eaf69`): reasons per learner, a "Cần hỗ trợ" filter, and three row actions (Trả lời / Nhắn / Xem chi tiết). Verified on the React course: the filter shows 7 of 30 learners. "Nhắn" opens a sheet with a draft message, sends a notification, and closes. "Trả lời" deep-links to that learner's unanswered question.
- Honest limit: "Nhắn" sends an in-app notification. The app has no chat channel. The form says so.
- Thresholds (14 days, quiz 60%) are my choice, measured to `analyticsAsOf` (12/10/2026), not today, because the seed data stops there.

### 7. Reviews, snippets, insights (screens checked)
- Reviews: labelled "Phản hồi" actions and a "Đã phản hồi" state; the filter tabs work. No change needed.
- Insights: KPI tiles and the period switch read clearly. Minor: at 1366px the first KPI value ("29.340.000 ₫") touches the tile edge. Not fixed; it is a shared stat-tile style. Listed below.
- Snippets: checked by its labelled buttons (Tạo mẫu, Sửa, Xoá); screenshot reviewed at 390px only.

### 8. Overview and navigation
- Good: the rejection banner links straight to the fix; backlog tiles link to their queues.
- Shared: at 1366px the global-search field covered the "Doanh thu" nav item in the earlier capture. In the most recent insights capture the nav item is visible; see shared request 1.

## Impeccable critique

Method: `impeccable critique` on `/teach/courses/course-solid-001`, `/teach/grading/sub-001` and `/teach/progress/course-react-001`, mode Operate.

⚠️ DEGRADED: single-context (non-interactive run; Assessment A and B not run as isolated sub-agents; no live-browser overlay; no snapshot persisted; the question step is skipped because this run cannot ask the user).

- **Assessment B (detector, deterministic):** `impeccable detect --json` on the lecturer route sources and `lecturer.css` returned 0 findings (exit 0).
- **Assessment A (design review, this context):**
  - Specificity: grounded in this product. The step rail uses the course readiness rules, the ⋯ menu holds lecturer-only actions, and the progress reasons use Codi's own states. It would not fit an unrelated product unchanged.
  - Priority issues found, and what happened to each:
    1. Course authoring had no order → step rail (`e29e83a`).
    2. Lesson rows had unlabeled icon actions → labelled ⋯ menu (`7ae11d7`).
    3. Grading save action below the fold → sticky (`a30b9b8`).
    4. Progress had no "who is stuck" signal → reasons and filter (`65dc76a`).
    5. Progress table too wide, hint column always empty → column removed, row fits (`39eaf69`).
  - Persona red flags: no remaining blocker found on the three routes.
  - Strengths: the readiness list is a real gate with a counted summary; the AI draft is labelled as a draft in three places.
  - Minor, open: insights KPI value touches its tile edge at 1366px (shared stat-tile style); the Content tab intro paragraph is long.
- **Questions skipped:** this run is non-interactive, so there are no questions to ask the user.

## Shared change requests (not edited; for the owner of shared files)
1. Header, at 1366px: the global-search field can cover the "Doanh thu" nav item. Suggested: below ~1440px, collapse search to its icon button, or cap search width so nav keeps full width. Owner: shell header.
2. Editor tab bar on phones: the "Xuất bản" tab is clipped at 390px. The editor now uses the step rail instead of the tab bar, so this may already be fixed on the current build; verify before acting. Owner: none if the rail stays.
3. Stat tile (insights): the first KPI value touches the tile's right edge at 1366px. Suggested: `min-width: 0` and `overflow-wrap` on `.stat-value`, or a smaller value size at narrow tile widths. Owner: `src/styles/app.css` (`.stat-tile`).

## Is a busy lecturer able to clear the backlog fast?
Improved. Overview counts link straight to each queue. The grading skip and list switch now ask before dropping edits, and the save bar stays visible. One submission is about three clicks (run, apply, save) plus reading the draft. The support queue is one filter click away. Still open: no keyboard shortcut to save and advance.

## Status
DONE_WITH_CONCERNS

Summary: Items 1–5 of the controller's request are done. Commits: `b046c5b`, `a30b9b8`, `36207c3`, `4ef27e8`, `c61bfe2` (first pass), then `7ae11d7`, `2de975e`, `e29e83a`, `65dc76a`, `39eaf69`. The impeccable critique ran in degraded single-context form; detector is clean. Shared requests listed above.

Concerns:
- The impeccable critique is degraded (no isolated sub-agents, no live overlay, no snapshot). Assessment A is this run's own judgement.
- "Nhắn" is an in-app notification, not a chat, because the app has no chat channel.
- Learner-support thresholds (14 days, quiz < 60%) are a judgement call, measured to the data's as-of date.
- Not walked to the same depth: snippets (mobile only), and the mobile layout of the new step rail and the progress table.
- The untracked `plans/reports/pov-261102-1246-admin.md` belongs to another agent and is not part of this work.
