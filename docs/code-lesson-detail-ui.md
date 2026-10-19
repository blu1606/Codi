# Issue #141 — detail học code và hướng dẫn theo bước

Issue: https://github.com/blu1606/Codi/issues/141, sub-issue của #94; liên quan #138, #98, #100.
Nhánh từ `develop`: `fix/code-lesson-detail-ui`. Worktree: `../Codi-code-detail-ui`.
Chưa tạo PR; báo người dùng xem trước theo yêu cầu.

## Thay đổi

- Sidebar danh sách liền, bài đang mở dùng `aria-current` và nền accent; trạng thái có icon/chữ cho trình đọc màn hình. Loại bài và thời lượng lấy từ nội dung đã xuất bản, không suy đoán từ tên bài.
- Header hiển thị chương · loại bài · thời lượng. Link về lộ trình trên header chỉ dành cho mobile; desktop dùng link ở sidebar.
- Tutorial giữ đúng các bước trong mockup: mục lục, thanh bước, nội dung markdown, Bước trước / Tiếp, editor có tên file/ngôn ngữ/số dòng/tô cú pháp, Console và phím tắt. Ở vùng nội dung hẹp, hai cột xếp dọc.
- Server lưu `current`, `visited`, `drafts`, `runs` trong `coding_workspaces.tutorial_progress`, tách từng bước. Chuyển bước chờ lưu nháp; lỗi lưu giữ nguyên code và có Thử lại. Khôi phục cần xác nhận, chỉ ảnh hưởng bước được chọn.
- Nội dung/code lời giải không được trả về trước khi người học chọn Hiện lời giải. Mục lục cho phép chọn bước như mockup. Đã ghé bước cuối thì checklist tutorial đạt; bài challenge vẫn cần lần nộp gần nhất đạt tất cả test.
- Mỗi lần ghi lặp lại guard vai trò, ghi danh, onboarding, xuất bản và tiên quyết ở server. Run dùng QuickJS/WASM thật, lease/cooldown dùng chung với challenge; console-only steps chạy với biểu thức `null` trong cùng sandbox.
- Seed giữ cấu trúc tutorial và tên file thay vì gộp các bước thành challenge. Không sửa `docs/mockup/**`.
- AI trợ lý/Hỏi đáp thuộc #101; nhánh develop hiện chưa có panel đó để tích hợp. Không thêm nút mở panel giả. Phần này cần tích hợp khi #101 sẵn sàng.

## Migration và dữ liệu

Migration `20261019102323_coding_tutorial_steps` chỉ thêm `coding_exercises.file_name`, `coding_exercises.tutorial_steps` (mặc định `[]`) và `coding_workspaces.tutorial_progress` (nullable). Challenge cũ giữ mặc định và cách chấm cũ.

**Chưa áp dụng migration/seed lên Supabase dùng chung.** Để xem UI bằng dữ liệu thật sau khi duyệt thay đổi: nạp biến môi trường của DB dev, chạy migration bằng workflow của repo, rồi chạy `pnpm db:seed-mockup` để cập nhật nội dung tutorial. Seed bảo toàn tiến độ người học. Mở bài “Hướng dẫn: Viết và chạy JavaScript” trong khóa `course-js-001`.

Script kiểm thử dưới đây không cần áp dụng migration lên DB dùng chung: tạo bảng code tạm có cột mới, tạo fixture trong một transaction và luôn rollback. Không reset tài khoản/tiến độ đang dùng.

```sh
pnpm --filter web test:tutorial:db
pnpm test
pnpm run check:standards
pnpm run check-types
pnpm --filter web build
node scripts/verify-coding-trace.mjs
```

Kết quả ngày 19/10/2026: **913 tests / 68 files đạt**, typecheck web/db/ui/auth đạt, design-token audit 0 vi phạm, production build đạt. Trace của cả coding và tutorial có worker, QuickJS và WASM. Script DB rollback đạt với runner thật, gồm lưu/khôi phục nháp từng bước, gate lời giải, checklist, loại bài sidebar, lỗi cú pháp/runtime/timeout, sandbox unavailable và guard quyền/xuất bản/ghi danh. Không có migration hoặc seed được lưu vào DB dùng chung.

## Đối chiếu state

| Mockup state / transition | Triển khai | Kiểm tra |
|---|---|---|
| Mục lục, bước đầu/giữa/cuối, `cp-step` | `LessonTutorial`, `tutorialTransition`, JSONB progress | unit, DOM, DB rollback |
| `stepDrafts`/`stepRuns`, `cp-reset` | draft theo step; xác nhận reset | unit, DOM, DB rollback |
| Lời giải bị che / `cp-tut-solution` | projection chỉ có title, body/code null khi gated | unit, DOM, API, DB rollback |
| Chạy, lỗi cú pháp/runtime/timeout | `createTutorialService` + runner + lease | DB rollback với WASM thật |
| Sandbox không sẵn sàng | lỗi 503, code nháp vẫn được lưu | DOM, DB rollback |
| Tutorial done vs challenge submit | `lessonChecklist` đọc visited từ server | unit, DB rollback |
| Bài khóa / ghi danh sai / bài nháp | `loadLearningLessonAccess` + assessment scope | API, DB rollback |

## Kiểm tra giao diện còn cần thực hiện

Phiên làm việc không có trình duyệt kết nối (`cua.getState()` không có browser; mở IAB trả “Browser is not available”). DOM tests không thay thế kiểm tra hình ảnh. Chưa xác nhận visual parity hoặc ảnh screenshot desktop/mobile light/dark.

| State | Mockup | Desktop light | Desktop dark | Mobile 375px |
|---|---|---|---|---|
| Bước 1, editor và Console trống | Ảnh người dùng / tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Mục lục, bước giữa, code nháp | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Lỗi cú pháp/runtime/timeout, lỗi lưu + retry | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Lời giải bị che / đã hiện; bước cuối | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Loading / tải lỗi / sandbox unavailable | S11g | Chờ chụp | Chờ chụp | Chờ chụp |
| Bài challenge cũ và sidebar mobile | S11 / S11g | Chờ chụp | Chờ chụp | Chờ chụp |

Chưa đánh dấu screenshot/browser QA hoàn thành; chưa mở PR.
