---
version: 1
slug: "src-features-commerce-home-page-jsx"
primary_target: "src/features/commerce/home-page.jsx"
related_targets: ["src/features/commerce/commerce.css"]
---

Surface: Home `/` (src/features/commerce/home-page.jsx). Mode: Persuade.

Audience and job: a guest judges in under a minute whether Codi (AI-guided Vietnamese programming courses) fits, then acts: start learning or browse courses. Primary scene: examiners watch a projected demo at 1366-1920 px; mobile must still work. Evidence: seed data only; no testimonials, customers or metrics. Product screens are labelled as sample ("Minh họa · dữ liệu mẫu"). Course photos are Pexels, credited in CREDITS.json.

Constraints: keep the committed world (deep teal accent, Be Vietnam Pro, Lexend, JetBrains Mono, light and dark, WCAG AA). Keep copy and every state: popular-course loading skeleton once per session, load error with retry (?error=1), empty catalogue, footer links, mentor section. Actions: primary "Bắt đầu học ngay" (/dashboard), secondary "Khám phá khóa học" (/courses).

## Direction contract

THESIS: The product proves the offer. A real lesson window (learning path, lesson text, AI explaining it) sits in the first viewport beside the promise. Refused: the category default of a stock hero photo, three feature cards and a stats row.

OWN-WORLD: Light Codi ground #ffffff with #f1f5f9 panels and hairlines #e5e7eb. Deep teal #0e7490 only on the primary action, the current station and AI marks. One dark object: a #0f172a code and product stage. Be Vietnam Pro body, Lexend headings, JetBrains Mono for code. Status colours always paired with text.

STORY: The visitor reads the promise, sees the product explain a real JavaScript idea step by step next to a path strip that shows the next lesson, understands that the path is AI-guided and ordered by prerequisites, then presses "Bắt đầu học ngay" or browses courses.

FIRST VIEWPORT: Left column (5/12): H1 in two lines, a three-line lede, filled teal primary, bordered secondary, then a hairline row of three facts (Lộ trình, Khóa học, Trợ lý AI). Right column (7/12): one product window, 16px radius, 1px border, a single sheet shadow. Inside: a path strip (vertical stations, current station ringed), the lesson text with one code block, and the AI explanation as a question and answer. Caption "Minh họa · dữ liệu mẫu". The primary action is visible at 1366x768 without scrolling.

FORM: Asymmetric statement plus product window. Dealt lead: grounded candidate 5 (AI explanation stage), fused with the path strip of candidate 1 and the split lesson of candidate 2. Declined the dealt challengers (Dumbar identity, Busytown spread, brick manual, bioluminescent sea, timetable rack, manual acetate board, BBS night board, split-flap concourse) because they would replace the established palette and type; only their composition was considered. seed:ac2bd95f217bf0f8.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
