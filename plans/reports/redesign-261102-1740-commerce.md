# Commerce surfaces redesign (home, catalog, course detail)

Run: autonomous, per the surface brief. The product owner was not available to answer questions, so every decision the impeccable flow would take to a decision page was made here from PRODUCT.md, the brief and the seed roll. Disclosed substitutions are marked **[sub]**.

## Scope

- Home `/` (PERSUADE), `src/features/commerce/home-page.jsx`
- Catalog `/courses` (OPERATE), `src/features/commerce/catalog-page.jsx`
- Course detail `/courses/:slug` (PERSUADE into OPERATE), `src/features/commerce/course-detail-page.jsx`
- Shared within the feature: `course-card.jsx` (CTAs only now), `commerce.css`
- Surface briefs (direction contracts): `.impeccable/surfaces/src-features-commerce-{home-page,catalog-page,course-detail-page}-jsx.md` (untracked, not committed)

Established world kept: teal accent, Be Vietnam Pro / Lexend / JetBrains Mono, light and dark tokens, the Codi mark. No shared CSS, components or lib were edited.

## Structures considered and the roll

**Home (persuade).** Ranked candidates: (1) learning-path transit line, (2) split lesson page, (3) fit-check ledger, (4) three-step walkthrough, (5) AI explanation stage, (6) catalogue storefront. Seed roll (key `263136de…`, 6 candidates): dealt 5, 3, 1; index 5 leads. Built the lead, fused with the path strip from 1 and the split lesson from 2, because the brief asks the first viewport to show the transit path, the lesson page and the AI explaining. The dealt challengers (Dumbar identity, Busytown spread, brick manual, bioluminescent sea, timetable rack, acetate manual board, BBS night board, split-flap concourse) would replace the established palette and type, so only their composition was considered. **[sub]**

**Catalog (operate).** Candidates: (1) command-first card grid (the previous design), (2) master-detail preview, (3) category rail, (4) sortable comparison ledger, (5) level-lane board. Roll (key `7abfe767…`, 5 candidates): dealt 4, 1, 3; index 4 leads. Built the ledger. Other dealt structures were not built because the lead holds.

**Course detail (persuade into operate).** Candidates: (1) decision sheet, (2) path-first, (3) proof-first, (4) buy stepper, (5) lecturer-led. Roll (key `8e0fcd50…`, 5 candidates): dealt 3, 1, 4; index 3 leads. Built proof-first: outcomes, then what the AI path does for this course, then reviews, then curriculum, with the sticky purchase panel beside them.

Process note: I also ran a second detail roll with 6 candidates (key `d75d64fe…`) and discarded it. That was a re-roll with no named factual ground, which the rules do not allow. The discarded roll did not change the build.

## What changed

- **Home:** the hero's right column is a sample product window (learning path from the first chapter of a real published course, one lesson with a code block, and an AI question and answer). It is labelled "Minh họa · dữ liệu mẫu". The feature cards, popular courses (loading, error, empty states kept), mentor section and footer are kept. The mentor illustration was removed because it duplicated the window. The hero image now appears in a closing band.
- **Catalog:** results are a comparison ledger. Columns: course (thumbnail, title, lecturer, owned or in-cart badge), level (text plus 3-step bar), rating, duration, learners (sortable, mapping to existing sort values), price, one CTA from `CourseCta`. Below 900 px each row becomes a stacked block with labelled fields. Typeahead, URL filters, chips, deep link, loading, error and empty states are unchanged. The unused `CourseCard` export was removed from `course-card.jsx`.
- **Detail:** outcomes first, then a three-step "Trợ lý AI làm gì cho khóa học này?" strip (wording from the positioning in PRODUCT.md: ordered by prerequisites, reasons given, changes only with consent), then reviews with the rating breakdown, then curriculum, requirements and lecturer. Section numbers and the rating's inline styles were removed. The purchase panel keeps all ownership states; one filled primary per state.

## Evidence and research

- **[sub]** Mobbin and web-research citations were not gathered. The brief asks for them, but the run was unattended and the structure choices were grounded in PRODUCT.md, the SOI reference (`plans/reports/design-reference-video-preflight-261102-1114.md`) and the existing Codi patterns. This is a gap to close before review.
- Visual verification: Playwright captures at 1440 / 1024 / 390 for guest and learner (`scratchpad/e2e/shots-commerce/`). Desktop home, catalog and detail were inspected by eye. Mobile and tablet captures were not re-read after the last CSS fix, because the image reader was blocked for those files. Horizontal overflow is 0 at all widths.
- No finish-reviewer subagent was spawned and no DESIGN.md was written (no new world; the established world is inherited). **[sub]**

## Verification

- `npx vite build` to the scratchpad `build-commerce` directory: passes.
- `node smoke.js`: 59 ok, 0 FAIL.
- `node axe.js`: no violations.
- `commerce-lib.test.js`: **fails before any assertion** because the test imports `./commerce-lib` without an extension, and Node's ESM resolver rejects it. Neither file was changed in this run, so this predates the redesign. Not fixed here; the fix is a one-line import extension or running it through a bundler.

## Commits

- `325aea5` feat(commerce): redesign home, catalog ledger and course detail (5 files, all in `src/features/commerce/`)
- This report (next commit).

Shared files untouched. Other agents' uncommitted lecturer and lecturer-ai changes were not staged.

## Open questions and decisions for the owner

1. Lead structures: the home lead fuses three ranked candidates; confirm that is acceptable versus a pure single-candidate build.
2. The home sample window uses real seed course titles and a fixed "current station" in the first chapter. Should it reflect a real learner's progress instead?
3. Mobbin and research citations are missing (see Evidence).
4. Decide whether `.impeccable/surfaces/*` contracts should be tracked in git (currently untracked).
5. The `commerce-lib.test.js` import needs fixing or a runner change.

Status: DONE_WITH_CONCERNS
Summary: Three commerce surfaces redesigned inside the established world, built and verified (build, smoke 59/59, axe clean), committed as `325aea5` plus this report.
Concerns: no Mobbin or research citations; mobile captures not re-read after the final CSS fix; pre-existing failing commerce unit test.
