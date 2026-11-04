---
version: 2
slug: "src-features-learning-dashboard-page-jsx"
primary_target: "frontend/src/features/learning/dashboard-page.jsx"
related_targets: ["frontend/src/features/learning/progress-page.jsx", "frontend/src/features/commerce/catalog-page.jsx"]
---

Surface: the learner home `/dashboard` (Trang chủ). Mode: Operate.

Audience and job: a returning learner opens Codi in the evening on a laptop or phone and needs, in one glance, the lesson to study now, how this week is going, and their courses. The "Học tiếp" target must match the course path page exactly.

Constraints: keep Codi's identity (logo, name, deep cyan-teal accent, Be Vietnam Pro / Lexend, light + dark, WCAG AA, status never by colour alone). Every number comes from GET /api/learner/overview or the leading course's path. Keep every state: no course, path not set up, path generating or failed, default-path diagnostic card, all courses complete, load error with retry, hidden courses.

## Direction contract

THESIS: The home answers three questions in order: what do I study now, how is my week, which courses do I have. The owner rated the previous departure-board dashboard 0/10 ("cực kì rối"); it is replaced, not polished.

REFERENCE: The owner's VLearn learner prototype (TrangChu, home, SoDiem): date line and "Chào {tên}", a soft "Học tiếp" task card with one primary action and the cover on the right, course rows with status pill and chevron, a light aside. Codi keeps its own logo, name, teal and type.

REFUSES: a second dark board, a repeated current lesson in two blocks, count tiles that show zeros, raw path-change feeds, header buttons that duplicate the navigation, eyebrow labels above headings.

FIRST VIEWPORT: date + greeting; "Học tiếp" card (lesson title, course · chapter · lesson · kind · minutes, progress, filled "Học tiếp", ghost "Xem lộ trình"); aside "Tuần này". On mobile the card comes first, then the week, then courses.
