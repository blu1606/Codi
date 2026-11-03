---
version: 2
slug: "src-features-commerce-catalog-page-jsx"
primary_target: "frontend/src/features/commerce/catalog-page.jsx"
related_targets: ["frontend/src/features/commerce/course-card.jsx"]
---

Surface: Catalog `/courses` (frontend/src/features/commerce/catalog-page.jsx). Mode: Operate.

Audience and job: a learner or visitor finds a programming course fast (typeahead search, category, level, price, sort) and opens one. Laptop in the evening, or a phone.

Constraints: keep Codi's world (teal, Be Vietnam Pro / Lexend, light + dark, AA). Keep the typeahead (query suggestions, top results, "Xem tất cả kết quả"), URL-held filters (replace, not push), chips and "Xóa bộ lọc", ?course= deep link, loading skeleton, load error with retry, empty result with reset and "Hỏi AI Codi gợi ý khóa học", and the ownership-aware CTA from course-card.jsx (CourseCta, `quiet` variant).

## Direction contract

THESIS: The owner rated the comparison-ledger catalogue 0/10 as unfriendly; it is replaced by the familiar storefront pattern (Coursera / Udemy, and the owner's VLearn prototype): a big search field, a category pill row, a result bar, and a card grid.

FIRST VIEWPORT: page header; search field (max 720px); category pills ("Tất cả" plus real categories, pressed pill ink-filled); result bar with the count left and Trình độ, Giá, Sắp xếp selects right; then course cards (16:9 cover with category label, two-line title, lecturer, rating · level · duration, price or "Đã sở hữu", one secondary action). Three columns at 1200px, one column below 640px with 21:9 covers; the pill row scrolls horizontally on phones.

REFUSES: a dense table as the shopping surface, a filled primary button on every card, eyebrows above titles.
