---
version: 1
slug: "src-features-commerce-course-detail-page-jsx"
primary_target: "src/features/commerce/course-detail-page.jsx"
related_targets: ["src/features/commerce/course-card.jsx"]
---

Surface: Course detail `/courses/:slug` (src/features/commerce/course-detail-page.jsx, course-card.jsx for CTAs). Mode: Persuade into Operate: the visitor decides, then buys (or continues).

Audience and job: a guest or learner decides whether this course fits, what the AI path does for it, and buys it (or resumes it if owned). Owners see progress; lecturers and admins see a role note instead of a buy action.

Constraints: keep the committed world. Keep every state: owned (progress, "Tiếp tục học"), pending payment, in cart, free enrolment, lecturer/admin note, hidden course for an owner, not found, load error with retry (?error=1), hidden course for non-owner. One filled primary in the purchase panel: "Mua ngay" (paid), "Đăng ký miễn phí" (free), "Tiếp tục học" (owned). "Thêm vào giỏ" stays secondary. Reviews come from enrolled learners only (existing filter). Outline keeps accordion behaviour with expand and collapse all.

## Direction contract

THESIS: The decision is made from proof before price. Outcomes, what the AI path does for this course, and real reviews come first; the purchase panel stays beside them as the single action. Refused: the default spec sheet (hero, price box, long curriculum) that asks for the buy before any reason.

OWN-WORLD: White ground, #f1f5f9 quiet panels, hairlines #e5e7eb, one dark object only inside the AI path diagram (#0f172a strip). Deep teal #0e7490 only on the single primary action and the rating stars' text pair. Be Vietnam Pro, Lexend headings, tabular numerals for price and minutes. Status shown with text and icon.

STORY: The visitor reads the promise, sees three things they will learn and the AI steps, reads two reviews and the rating spread, scans the outline, and presses "Mua ngay" or "Đăng ký miễn phí" in the purchase panel that stays in view.

FIRST VIEWPORT: Breadcrumb, title, summary, the stats row, then the purchase panel in the right column (sticky from 1024 px up; static below). Left column starts with "Bạn sẽ học được gì" and the AI path strip (three steps: lộ trình theo thứ tự tiên quyết, giải thích lý do từng bước, cập nhật sau mỗi bài). Reviews, outline, requirements and lecturer follow in that order.

FORM: Proof-first decision sheet. Dealt lead: grounded candidate 3 (proof-first), with the outline from candidate 1 kept as the curriculum section. Other dealt candidates: stepper (4) and path-first (2). Challenger worlds were declined as they replace the established palette and type. seed:87405436d5ed03b8.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
