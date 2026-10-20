# Issue #161 — Knowledge map mockup parity

Epic #94 · S13c · Flow L12 · `/insights/knowledge-map`.

## Implementation

- Geometry matches `docs/mockup/js/charts.js`: nodes 152×60, horizontal gap 24, vertical gap 56, padding 16. Each topological layer is centred; edges run from the prerequisite's bottom centre to the next node's top centre.
- Uses the existing `viz-s1…s4`, `viz-axis`, `viz-on-s4`, surface and border tokens in both themes. Locked nodes retain dashed borders and a lock label; mastery has text and a four-step meter.
- Restores the page header, “Nên ôn tiếp”, legend, “Bảng số liệu” disclosure and sorted “Theo mức thành thạo” chart. The course selector appears only for multiple enrolled courses, as in the mock.
- Selection still highlights ancestors and opens related lessons. Recommendation markers, confirmed-map visibility, ownership and lesson prerequisite checks retain the server contract. No schema/API changes.
- The user explicitly chose to keep **Thống kê học tập** visible but disabled until the statistics module supplies `/insights/stats`; there is no link to a nonexistent route. This dependency must be resolved when that module is integrated.
- PR #160 / issue #156 supplies the explicit lesson CTA separately. This branch starts from develop and leaves `ConceptDetails` lesson rendering untouched so that change can merge independently. Full UI-LRN-25 validation depends on integrating #160.

## Mapping

| Contract | Implementation | Verification |
|---|---|---|
| Read-only layered graph, mastery labels | `KnowledgeMap`, `KnowledgeMapNode`, `knowledgeGraphLayout`, `KnowledgeGraphLines` | Layout and component tests; desktop light geometry/background/radius compared with all 12 prototype nodes |
| Selection and prerequisite path | Existing ancestor traversal and `ConceptDetails` | Component tests and browser selection assertions |
| Locked lesson cannot navigate | Existing API/service lock fields and panel rendering | Existing guard tests; component and browser no-link assertions |
| Diagnostic skipped / no evidence | Level zero, empty meter, no fabricated probability | Component tests and desktop light screenshot |
| Empty / unconfirmed | `EmptyKnowledgeMap` | Existing tests, course-switch test, browser assertions |
| Loading / HTTP failure / retry | Existing fetch lifecycle, visible retry | Component test and browser assertions |
| Multiple courses | Selector, abort previous request, clear selection | Component course-switch test |

## Validation and remaining work

- Full Vitest run: **72 files, 937 tests passed**, with `--coverage --maxWorkers=4`; configured coverage gate passed (98.95% statements, 85.16% branches, 96.96% functions, 98.84% lines). The configured coverage include list is shared infrastructure, not a claim of 98.95% graph coverage.
- Design standards: **0 violations**.
- Package type checks passed after regenerating stale Next route types left by the branch switch.
- Desktop light browser assertions passed for the 12-node geometry/colours/radii, selection, ancestor highlighting, lock guards, table disclosure, unlearned state, empty/unconfirmed state and error retry. Loading was observed; the scratch suite then failed because its response-release callback had not yet been installed. The script was corrected to await the callback, but the subsequent Chrome launch was denied permission. **The complete browser matrix is not marked passed.**
- **Still required before merge:** rerun the corrected browser suite on desktop 1280px and mobile 375px, in light and dark; refresh screenshots after the final chart-label/shadow/spacing polish. Current images show the earlier desktop light pass. Element screenshots include the shared sticky header, which can obscure the page heading; replace them with full-page captures.
- Browser fixtures use the prototype's JavaScript course data and mocked API/session responses, not authenticated production accounts. No seeded authenticated end-to-end run is claimed.
- Temporary fixture route was removed. No `.env`, credentials, fake data or scenario flags are shipped in application code. `docs/mockup/**` is unchanged.
- Images are stored in this repository as review evidence. Direct GitHub drag-and-drop uploads are unavailable in this environment.

## Screenshot evidence (desktop light, pending final refresh)

| State | Mockup | Implementation |
|---|---|---|
| Confirmed map | ![Mock map](mockup-desktop-light-map.png) | ![Map](implementation-desktop-light-map.png) |
| All unlearned | ![Mock unlearned](mockup-desktop-light-unlearned.png) | ![Unlearned](implementation-desktop-light-unlearned.png) |
| Selected, unlocked | Standalone prototype has no interactive panel; Flow L12 defines it | ![Selected](implementation-desktop-light-selected.png) |
| Selected, locked | Same limitation | ![Locked](implementation-desktop-light-locked.png) |
| Table expanded | Data-equivalent table under the graph | ![Table](implementation-desktop-light-table.png) |
| Unconfirmed | Backend condition absent from standalone prototype | ![Unconfirmed](implementation-desktop-light-unconfirmed.png) |
| No enrolments | Empty state | ![Empty](implementation-desktop-light-empty.png) |
| HTTP error | Network condition absent from static prototype | ![Error](implementation-desktop-light-error.png) |
| Loading | Network condition absent from static prototype | ![Loading](implementation-desktop-light-loading.png) |
