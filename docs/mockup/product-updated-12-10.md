# PRODUCT.md — Update 12/10/2026

> Change log for `PRODUCT.md` after (1) the prototype UX audit `report_uiux_audit.md` (Gemini Antigravity, 4 roles, 12/10/2026) and (2) a second Mobbin research pass (6 parallel streams, web).
> Audience: OpenDesign prototyping agent and the Codi team. `PRODUCT.md` remains the source of truth; this file explains what changed and why.

---

## 1. Audit finding → what changed in PRODUCT.md

| # | Role · Severity | Audit finding | Change in PRODUCT.md | Evidence strength |
|---|---|---|---|---|
| 1 | Learner · **Critical** | Diagnostic test blocks all lessons | **Start fork** after goal setup: "Học từ bài 1" (default order, open now) vs "Tìm điểm bắt đầu của tôi" (Khuyến nghị); diagnostic retakeable later via a persistent card; goal steps get "Bỏ qua". Q7 resolved → decision 31. (Flow L4, S08b, S10, S12, §7.20) | Strong — Duolingo, Babbel, Docusign, Preply |
| 2 | Learner · High | VietQR: no "I've transferred" button, no text fallback if QR fails, no support on underpaid/expired | Countdown under QR + stated consequence; copy rows double as **text fallback** with a QR-failed state; **"Tôi đã chuyển khoản"** manual check (cooldown, polling continues); every problem state shows `CODI#####` + support entry. (Flow L3, S06, §7.19, decision 33) | Medium — countdown/support patterns found; *no reference for the manual-check button or expired-regenerate* |
| 3 | Guest · High | After sign-in/registration from "Thêm vào giỏ", no visible confirmation; user may land on dashboard | Gated flow keeps OTP inside the overlay with the course visible; always returns to the same page; toast "Đã thêm … · Xem giỏ hàng" + cart badge + CTA switch. (Flow L2, S02, decision 32) | Medium — Walmart, Shop; *confirmation toast not observed* |
| 4 | Guest · High | No "Mua ngay" shortcut | Not adopted yet → **Q27** (no evidence; conflicts with multi-course cart A1) | None |
| 5 | Guest · Medium | No autosuggest; weak empty state; no sort | Grouped **typeahead**, **sort dropdown**, one-tap **"Đặt lại bộ lọc"** + equal-weight "Hỏi AI Codi". (Flow L1, S01, decision 35) | Strong — Codecademy, Coursera, Skillshare, Turo, Navan, Fey |
| 6 | Guest · Medium | Syllabus rows lack type labels; no preview lesson | **Type icon + label** per syllabus row (decision 36); "Học thử" badge → **Q23** (data model has no preview flag) | Strong for labels; none for the preview player |
| 7 | Learner · Medium | Coding sandbox: no Ctrl+Enter, no Input/Expected/Actual diff, no format | New **Flow L6b / S11g Coding exercise**: 3 panes, Run keycap, format action, test list with filter tabs, expandable Input · Expected · Received, "Giải thích lỗi này" → AI. Scope → **Q24** (not in UC model). (decision 38) | Medium — Codecademy, Browserbase, Postman, Adaline; *no coloured diff reference* |
| 8 | Learner · Medium | Dashboard stats dry; wants streaks/badges | **Weekly goal tracker** (calm, from onboarding time commitment). Streaks/badges **not adopted** — conflicts with non-goal → **Q26** | Strong for weekly goal (Coursera); streaks REJECTED by prior decision |
| 9 | Lecturer · High | Knowledge map: no node graph; cycle error generic; "Accept all" unconfirmed | **List | Sơ đồ** toggle, node side panel, cycle banner naming the loop + highlighted nodes/closing edge, save disabled; "Chấp nhận tất cả" count summary. (Flow T2, S24, decision 39) | Medium — WRITER, Twenty, Copy.ai, n8n, Jira, AirOps; *edge highlighting & toggle not observed* |
| 10 | Lecturer · Medium | Grading: no "Đã chấm" history, no canned feedback, wants batch grading | **Chờ chấm / Đã chấm** tabs with counts, filters, edit past grade (Q30), **"Mẫu nhận xét"** snippets with placeholders. Batch grading **not adopted** — conflicts with decision 25 → **Q25** | Strong for snippets (Plain, Zillow, Reddit); medium for history tab |
| 11 | Admin · High | No "Preview as learner" before approval | **"Xem trước như học viên"** with persistent preview bar + exit back to review item. (Flow D1, S32b) | Medium — Teachable (admin-role preview only) |
| 12 | Admin · Medium | Deactivate dialog lacks concrete impact | Impact list with counts (owned courses, pending orders, courses taught) + "Tôi hiểu tác động" checkbox before reason. (S31) | Strong — Coda, Lovable, Adobe |
| 13 | Admin · Medium | Users: no status/role quick filters | Status summary counts as filters + removable role chips. (S31) | Medium — Airwallex, Miro, Deel |
| 14 | Admin · Medium | Orders: no CSV/Excel export | Export dialog: date presets, fixed timezone, apply-current-filters, columns, live summary; CSV. Excel → **Q28** | Strong — Stripe, Whop, Dub, Upwork |
| 15 | System · High | Missing undo on instant actions | Rule §7.17: **undo toast** for reversible self-actions; consequence dialog for actions affecting others/money | Strong — Netflix, Asana, Coda |
| 16 | Admin · — | No copyright/sensitive-content scan | Out of scope → **Q29**, listed in §12 | — |
| 17 | System · High | `favicon.ico` 404 | Not a UX decision — engineering issue, listed in §12 | — |
| 18 | Guest · — | Homepage lacks secondary CTA explaining AI path | Logged as **Q31** (homepage outside the original scope) | — |

## 1b. Decisions confirmed by the product owner (12/10, after this update)

| Question | Decision | Where it landed |
|---|---|---|
| **Q26** Streaks & badges | **Add** — study-day streak inside the weekly goal + skill badges per concept reaching "Thành thạo". Still no XP, leagues, leaderboards, daily quests. | Decision 37, Flow L10, S12, §8 pattern updated (Codecademy → ADAPT), §12 non-goals narrowed |
| **Q24** Coding exercise | **In scope.** UC model updated: new Learner UC **Submit Coding Exercise** (auto-graded by test cases, precondition of Complete Course Lesson when present); Course Content now includes coding exercises (instructions, starter code, test cases); AI assistant may explain a failed test but never grades. | Decision 38, Flow L6b, S11g, new S23b builder, Flow T1 step 6; `gen_uc_diagram.py` → `UC-by-actor.drawio` regenerated; PlantUML 03, 04, 06, all updated |
| **Q27** "Mua ngay" | **Add** — primary "Mua ngay" + secondary "Thêm vào giỏ" on course detail; single-course order straight to checkout, cart untouched. Modelled as an alternate flow of Purchase Course. | Decision 42, Flow L1, Flow L3 trigger, S02 |
| **Q28** Export format | **CSV only.** | Decision 41, Flow D1 |

Section 2 below is kept for history; Q25 (batch grading) is still open.

## 1c. Analytics & visual knowledge map (12/10, round 3)

Brainstorm → 3 Mobbin streams (admin system, admin finance, learner stats + concept graph) → proposal (`plans/reports/proposal-261012-1325-codi-analytics-charts-and-knowledge-graph-report.md`) → approved by the product owner:

| Item | Decision | Where |
|---|---|---|
| Knowledge map | **Visual layered graph is the default** for lecturers (list = accessible alternative) | Decision 43, Flow T2, S24 |
| Learner knowledge map | **Add** read-only "Bản đồ kiến thức của tôi", nodes coloured by mastery + text label | Decision 44, Flow L12, S13c |
| Learner statistics | **Separate page** "Thống kê học tập": C1 KPI · C2 hours vs goal · C3 activity calendar + streak · C4 mastery bars with diagnostic marker · C5 score trend · C6 quiz donut | Decision 45, Flow L11, S13b |
| Admin analytics | **Two pages, keep all widgets**: "Quan sát hệ thống" A1–A9, "Tài chính" B1–B9. Tổng quan subset shown first, "Xem chi tiết" expands the rest; each card has its own detail view (table + CSV) | Decision 46, Flow D1, S36, S37 |
| Lecturer progress | Reuse mastery bars / score trend aggregated per course | Decision 47, Flow T4 |
| Default period | 30 ngày vs previous period (Q13 resolved) | Decision 48 |
| Chart rules | One question per chart; never colour-only; no radar; donut only for single-quiz result; inverted metrics; n < 20 warning; per-card states | §7.21–23 |

Q32 → yes, "ước tính" label (decision 49). Q33 → yes, lecturers see their own courses' revenue (decision 50, S29b).

## 1d. AI advisor & in-lesson AI tutor redesign (12/10, round 4)

Trigger: product owner screenshots — "chưa native, chưa interactive, chưa đúng chuyên môn". 2 Mobbin streams → proposal (`plans/reports/proposal-261012-1334-codi-ai-advisor-and-tutor-redesign-report.md`) → approved:

| Decision | Content | Where |
|---|---|---|
| 51 | Tutor with 3-step hint ladder, Socratic first, never full solution; hint usage visible to lecturer, **no score penalty** | Flow L6c, S11a, Flow T4 |
| 52 | AI may propose ≤ ~3-line diffs the learner can **apply** (Hoàn tác + Chạy lại test) | Flow L6c |
| 53 | AI entry points inside content: selection toolbar, "Giải thích lỗi này", "Vì sao test này chưa đạt?"; removable context chips; thread per lesson | Flow L6c, S11a, S11a' |
| 54 | `/ai` answers = course cards, comparison table, suggested order; **multi-course roadmap saving out of scope** | Flow L13, S17, §12 |
| 55 | **Guests can use `/ai`**; personalisation after sign-in; intake answers reused by onboarding | Flow L13 |
| 56 | **"Hỏi giảng viên"** → private, multi-message conversation with the lecturer, pre-filled with AI context; resolvable; handled in Q&A inbox | Flow L6d, S11b, S11h, Flow T4 |

Interaction rules §7.23–26 added (AI contextual, never solves, answers as UI, one-click hand-off). New open question Q34 (sharing/closing private conversations, expected reply time). No UC change needed: conversations map to Post Course Question / Answer Course Question.
Evidence gaps: goal line on bars, diagnostic ghost marker, queue-age widget, time-to-pay histogram, zoom + path highlight together.

## 2. Decisions that needed you (audit vs existing PRODUCT.md)

Per review rules, these were **not** silently reversed.

**Q25 — Batch grading**
- Original decision (#25): grading is one submission at a time, no bulk.
- Audit: lecturers want batch grading to reduce learner wait.
- Trade-off: speed vs feedback quality per learner (a coding course's value is in individual feedback).
- Options: (a) keep as is + snippets + "Bài tiếp theo"; (b) bulk only for non-scoring actions (export, mark viewed, apply the same snippet); (c) full batch scoring. **Recommend (b).**

**Q26 — Streaks & badges**
- Original decision (§12 non-goal): no gamification.
- Audit: dashboard stats are dry; wants streak + skill badges.
- Trade-off: engagement vs added scope and a tone that pressures adult learners; Mobbin shows calm alternatives work (Coursera weekly goal).
- Options: (a) weekly goal only (now in PRODUCT.md); (b) weekly goal + study-day streak, no badges/XP; (c) full gamification. **Recommend (a) or (b).**

## 3. Other new open questions

Q23 preview lessons · Q24 coding-exercise scope vs UC model · Q27 "Mua ngay" · Q28 Excel export · Q29 content scanning · Q30 notify on grade edit · Q31 homepage AI explainer. Q7 is now **resolved** (skip allowed); follow-up: re-prompt cadence and whether the UC spec needs an alternate flow for "study in default order".

## 4. Evidence gaps (still designed from requirements, not references)

- "Tôi đã chuyển khoản" button and expired-QR regenerate state.
- Confirmation toast/badge after gated sign-in; "Mua ngay".
- Guest preview-lesson player.
- Coloured Expected vs Received diff; format-code action; Submit/Check vs Run split.
- Red edge for a prerequisite cycle; list ↔ graph toggle.
- Editing a past grade from history.
- Preview in the *learner* role (reference previews as admin).
- Excel export option.

## 5. Sections of PRODUCT.md touched

Header · §4.1 journey · §5 Flows L1, L2, L3, L4, **L6b (new)**, L10, T2, T4, D1 · §6 S01, S02, S06, S08, **S08b (new)**, S10, **S11g (new)**, S12, S24, S26, S31, S32, **S32b (new)**, S34 · §7 rules 17–20 · §8 "Revision 2026-10-12" pattern block (19 patterns) · §9 24 new rows · §10 decisions 31–41 · §11 Q7 resolved, Q23–Q31 · §12 non-goals.

## 6. Research method (round 2)

Six bounded Mobbin streams run in parallel by sub-agents, each inspecting returned screen images and returning compact evidence packets: guest conversion; payment confirm & recovery; skip diagnostic & motivation; coding exercise; knowledge graph & grading; admin preview & impact. ~33 Mobbin calls total, web platform (iOS bank-transfer results were discarded as off-target). All links are canonical `mobbin_url`s; no images embedded (Mobbin image URLs expire).

## 7. Decisions 14/10/2026 (product owner)

Resolved from `STATE-MACHINES.md` §24; mockup JS updated to match.

| ID | Decision | Mockup change |
|---|---|---|
| D1 | Unpaid order expires after 30 minutes → `failed` (`failReason='expired'`), "Tạo mã mới" creates a new order | none (already so) |
| D4 | "Mua ngay" = single-course order straight to checkout; cart and cart voucher untouched (decision 42) | `learner-commerce.js` `createBuyNowOrder`, `cm-buy-now` |
| D6 | Lesson completion requires **passing** the quiz (latest attempt, unlimited retakes) | `learner-learning.js` checklist "Đạt quiz (≥ x%)" |
| D12 | Deactivated account cannot sign in; all sessions revoked immediately | `core.js` `currentUser()` ignores non-active users |
