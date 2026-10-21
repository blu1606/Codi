# Issue #161 — Knowledge map mockup parity

Epic #94 · Module #97 · S13c / Flow L12 · `/insights/knowledge-map`.

## Implementation

- Matches the mockup's top-down geometry: 152×60 nodes, 24 horizontal gap, 56 vertical gap, 16 canvas padding and centred topological rows. Prerequisite edges use curved arrows.
- Restores the page heading, recommendation, five-level legend, four-step node meters, table disclosure and sorted mastery chart. Selection keeps ancestor highlighting and the related lesson panel.
- Uses actual API concepts, edges, mastery, ownership and prerequisite locks. Multiple courses retain a selector; unconfirmed maps remain hidden. No application API/schema or server guard changes.
- The page and embedded course-home containers use `min-w-0` so the 888px graph scrolls inside its canvas at 375px rather than widening the whole document.
- Adds **Học tập của tôi → Chức năng & Lối tắt → Bản đồ kiến thức**.
- **Thống kê học tập** is visible but disabled as explicitly chosen by the user until the statistics module supplies a real route.
- PR #160 / issue #156 remains separate at its original commit. This PR leaves lesson links in `ConceptDetails` unchanged; integrating the explicit “Học bài này” CTA and running UI-LRN-25 belongs to #160.

## Development course

`scripts/seed-knowledge-map-dev.ts` creates only a separate course `dev-knowledge-map-161` for an explicitly supplied learner ID. It has 12 concepts, 12 prerequisites, 12 lessons, 6 quizzes and a ready default path. Reading and quiz content come from the existing development exports. Existing learner activity is preserved on reruns.

Run from `apps/web`:

```sh
pnpm db:seed-knowledge-map -- --user-id=<learner-id>
# Explicitly list this development simulation in the catalog:
pnpm db:seed-knowledge-map -- --user-id=<learner-id> --catalog
```

The user authorized creating this development dataset and listing it on the test catalog as **JavaScript nền tảng — Mô phỏng bản đồ kiến thức**. It does not add seed fallbacks or scenario flags to application code. It changes no account passwords and requires no seed account password.

Test entry: `/courses` → search “Mô phỏng bản đồ kiến thức” → **Tiếp tục học** → **Bản đồ kiến thức**. Direct course: `/learn/dev-knowledge-map-161`.

## Validation

Updated 21/10/2026: [real-session verification on the updated develop base and a separate #133/#160/#144 integration checkout](real-session-review.md), including authenticated navigation, server/API prerequisite guards, lecturer compatibility, current checks, and the existing lecturer mobile-layout limitation. The results below describe the original UI implementation run.

- Full Vitest + configured coverage gate: **72 files, 937 tests passed**. Coverage: 98.95% statements, 85.16% branches, 96.96% functions, 98.84% lines. Coverage includes configured shared infrastructure, not a claim of graph-wide coverage.
- Workspace `pnpm -r check-types`: passed after regenerating Next route types.
- Design standards: **0 violations**.
- Real service verification: confirmed graph, 12 nodes / 12 edges / layers **1–3–5–3**, 3 mastered, only “Xử lý lỗi” locked, next review “Bất đồng bộ”; 12 lesson rows, 6 quiz rows, ready default path, first lesson access allowed. The real catalog API includes the simulation.
- Browser: **desktop 1280px / mobile 375px × light / dark passed**. Compared every node's geometry, background and radius with the prototype; selection, ancestor highlighting, lock/no-link, table, all-unlearned, empty/unconfirmed, error/retry and loading passed. No document overflow or browser page errors.
- Current full-page screenshots below use the actual application component and a fresh real-service payload from the development course. API/session interception is used only by the temporary screenshot harness; the photos do not claim an authenticated lesson-player E2E run. Forced loading/error/unconfirmed/empty states are fixture responses.
- Temporary screenshot route removed. No `.env`, credentials or browser state committed; `docs/mockup/**` unchanged. Images are committed alongside the implementation because direct GitHub drag-and-drop upload is unavailable.

## Current full-page screenshots

Mockup references: [desktop light](mockup-desktop-light-map.png), [desktop dark](mockup-desktop-dark-map.png), [mobile light](mockup-mobile-light-map.png), [mobile dark](mockup-mobile-dark-map.png). The static prototype has no interactive node panel; Flow L12 defines selection/related lessons.

| State | Desktop light | Desktop dark | Mobile light | Mobile dark |
|---|---|---|---|---|
| Bản đồ | ![Bản đồ](implementation-desktop-light-map.png) | ![Bản đồ](implementation-desktop-dark-map.png) | ![Bản đồ](implementation-mobile-light-map.png) | ![Bản đồ](implementation-mobile-dark-map.png) |
| Chọn bài mở khoá | ![Chọn bài mở khoá](implementation-desktop-light-selected.png) | ![Chọn bài mở khoá](implementation-desktop-dark-selected.png) | ![Chọn bài mở khoá](implementation-mobile-light-selected.png) | ![Chọn bài mở khoá](implementation-mobile-dark-selected.png) |
| Chọn khái niệm bị khoá | ![Chọn khái niệm bị khoá](implementation-desktop-light-locked.png) | ![Chọn khái niệm bị khoá](implementation-desktop-dark-locked.png) | ![Chọn khái niệm bị khoá](implementation-mobile-light-locked.png) | ![Chọn khái niệm bị khoá](implementation-mobile-dark-locked.png) |
| Bảng số liệu | ![Bảng số liệu](implementation-desktop-light-table.png) | ![Bảng số liệu](implementation-desktop-dark-table.png) | ![Bảng số liệu](implementation-mobile-light-table.png) | ![Bảng số liệu](implementation-mobile-dark-table.png) |
| Chưa có bằng chứng | ![Chưa có bằng chứng](implementation-desktop-light-unlearned.png) | ![Chưa có bằng chứng](implementation-desktop-dark-unlearned.png) | ![Chưa có bằng chứng](implementation-mobile-light-unlearned.png) | ![Chưa có bằng chứng](implementation-mobile-dark-unlearned.png) |
| Chưa xác nhận | ![Chưa xác nhận](implementation-desktop-light-unconfirmed.png) | ![Chưa xác nhận](implementation-desktop-dark-unconfirmed.png) | ![Chưa xác nhận](implementation-mobile-light-unconfirmed.png) | ![Chưa xác nhận](implementation-mobile-dark-unconfirmed.png) |
| Chưa ghi danh | ![Chưa ghi danh](implementation-desktop-light-empty.png) | ![Chưa ghi danh](implementation-desktop-dark-empty.png) | ![Chưa ghi danh](implementation-mobile-light-empty.png) | ![Chưa ghi danh](implementation-mobile-dark-empty.png) |
| Lỗi / thử lại | ![Lỗi / thử lại](implementation-desktop-light-error.png) | ![Lỗi / thử lại](implementation-desktop-dark-error.png) | ![Lỗi / thử lại](implementation-mobile-light-error.png) | ![Lỗi / thử lại](implementation-mobile-dark-error.png) |
| Đang tải | ![Đang tải](implementation-desktop-light-loading.png) | ![Đang tải](implementation-desktop-dark-loading.png) | ![Đang tải](implementation-mobile-light-loading.png) | ![Đang tải](implementation-mobile-dark-loading.png) |
