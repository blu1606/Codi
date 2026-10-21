# Issue #156 — CTA bài học trong bản đồ kiến thức

Hợp đồng: `docs/mockup/PRODUCT.md` Flow L12, S13c; prerequisite là ràng buộc cứng theo `STATE-MACHINES.md` G6. Panel phải có mastery, bài liên quan và CTA “Học bài này” cho bài được mở khóa.

`ConceptDetails` hiển thị tên bài cạnh link mang kiểu nút primary; accessible name gồm tên bài để phân biệt khi có nhiều CTA. Đích vẫn là `/learn/{courseId}/{lessonId}` với các đoạn URL được encode. Bài bị khóa giữ giải thích prerequisite và không có link; panel không có bài giữ empty state.

Không sửa API, schema, quyền truy cập hoặc state machine. Đích bài học vẫn đi qua `apps/web/src/app/learn/[courseId]/[lessonId]/layout.tsx` và `assertLessonAccess`; `getKnowledgeMap` vẫn tính `lesson.locked` từ `lockInfo` ở server.

## Kiểm thử

**Cập nhật 21/10/2026 sau review PR #160:** đã ghép develop mới nhất và chạy đăng nhập thật trên bản #160 riêng cùng bản tích hợp #165. Cả hai đạt 4/4 ca desktop/mobile × light/dark, kiểm tra CTA, player và server/API prerequisite guard. [Báo cáo, phiên bản và ảnh chụp](real-session-review.md). Các kết quả bên dưới là lượt kiểm thử ban đầu.

- 129 test liên quan pass.
- Full suite + coverage: **72 file, 936 test pass**, với `--maxWorkers=4`. Lượt chạy mặc định trước đó có 1 lỗi `Sandbox unavailable` ở coding-runner.test.ts; lượt chạy lại toàn bộ pass, không sửa test hay source coding runner.
- `pnpm run check-types`: pass.
- `pnpm run check:standards`: pass, 0 vi phạm.
- Browser fixture: component `KnowledgeMap` thật, dữ liệu giả lập, 1280×800 và 375×812, light/dark. Client auth/map response được intercept. Click CTA đi qua server thật khi chưa đăng nhập và chuyển tới `/login` với callbackURL đúng bài học. Không khẳng định lesson player/backend đã đăng nhập hoạt động.
- Case E2E gốc `UI-LRN-25` cần tài khoản seed và dữ liệu khóa dev. Không chạy vì môi trường thiếu cấu hình seed; không thay expected hoặc bỏ qua HTTP errors của suite E2E.

Route fixture tạm `/dev/issue-156` đã xóa sau khi kiểm tra. Server kiểm thử dùng webpack vì Turbopack local gặp lỗi parse/resolve dependency. Không đổi cấu hình bundler của sản phẩm.

## Ảnh đối chiếu

Ảnh chỉ chứa dữ liệu giả lập. Ảnh được lưu trong repository để xem cùng PR vì môi trường không hỗ trợ upload file đính kèm trực tiếp qua trình duyệt.

JS mockup `/insights/knowledge-map` hiện chỉ render graph/legend, không có panel chọn node tương tác. Ảnh mockup bên dưới là tham chiếu graph/mastery; hợp đồng CTA được xác định rõ trong PRODUCT.md Flow L12 và issue #156. Không chỉnh mockup để làm bằng chứng trùng với implementation.

| State | Desktop light / dark | Mobile light / dark |
| --- | --- | --- |
| Mockup graph/mastery | [light](mockup-desktop-light-map.png) / [dark](mockup-desktop-dark-map.png) | [light](mockup-mobile-light-map.png) / [dark](mockup-mobile-dark-map.png) |
| Panel bài mở khóa | [light](implementation-desktop-light-unlocked.png) / [dark](implementation-desktop-dark-unlocked.png) | [light](implementation-mobile-light-unlocked.png) / [dark](implementation-mobile-dark-unlocked.png) |
| Panel bài khóa | [light](implementation-desktop-light-locked.png) / [dark](implementation-desktop-dark-locked.png) | [light](implementation-mobile-light-locked.png) / [dark](implementation-mobile-dark-locked.png) |
| Panel chưa có bài | [light](implementation-desktop-light-empty.png) / [dark](implementation-desktop-dark-empty.png) | [light](implementation-mobile-light-empty.png) / [dark](implementation-mobile-dark-empty.png) |
