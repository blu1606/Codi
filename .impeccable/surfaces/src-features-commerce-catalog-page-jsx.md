---
version: 1
slug: "src-features-commerce-catalog-page-jsx"
primary_target: "frontend/src/features/commerce/catalog-page.jsx"
related_targets: ["frontend/src/features/commerce/course-card.jsx"]
---

Surface: Catalog `/courses` (frontend/src/features/commerce/catalog-page.jsx). Mode: Operate.

Audience and job: a visitor finds a programming course fast (typeahead search, category, level, price, sort), compares candidates on price, level, rating and duration, and opens one. Primary scene: a laptop in a demo room; text must read from a distance.

Constraints: keep the committed world. Keep the typeahead (query suggestions, top results, "Xem tất cả kết quả"), URL-held filters (replace, not push), chips and "Xóa bộ lọc", ?course= deep link, loading skeleton, load error with retry (?error=1), empty result with reset and "Hỏi AI Codi gợi ý khóa học". Each row keeps the ownership-aware CTA from course-card.jsx (CourseCta).

## Direction contract

THESIS: The catalogue is a comparison ledger, not a grid of equal cards. Every course is one row of comparable facts, and the sort headers are the comparison tools. Refused: the card grid as the default working surface.

OWN-WORLD: White ground, #f1f5f9 header band, hairline row dividers #e5e7eb, selected or sorted column in deep teal #0e7490 with a 2px underline. Level shown as text plus a 3-step bar (Beginner 1, Intermediate 2, Advanced 3). Tabular JetBrains Mono for minutes and prices. Be Vietnam Pro throughout; compact density (row 72px).

STORY: The visitor types, sees suggestions, filters to Trình độ Cơ bản, sorts by Đánh giá, compares the first three rows by eye, and opens the course that fits.

FIRST VIEWPORT: Page header, search row with typeahead and the four filters in one line, chips and count, then the ledger starting above the fold. Columns: Khóa học (thumbnail 56px, title, lecturer), Trình độ, Đánh giá, Thời lượng, Học viên, Học phí, action. Sortable headers use aria-sort and map to the existing sort values where one exists. Below 900 px each row becomes a stacked block with the same fields.

FORM: Sortable comparison ledger with the filter bar above. Dealt lead: grounded candidate 4 (sortable comparison ledger). Other dealt candidates were command-first card grid (1) and master-detail preview (3). Challenger worlds were not adopted because they change the palette and type. seed:ba91ca0a7901ff42.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
