# Bài tập code — issue #100

S11g / Flow L6b, trong trang `/learn/[courseId]/[lessonId]`.

## Mở bài mẫu

```sh
pnpm db:migrate
pnpm --filter web db:seed-coding
pnpm dev:web
```

Đăng nhập bằng tài khoản learner dev đã seed. Mở URL in từ lệnh seed;
khóa học `dev-coding-practice` được ẩn khỏi danh mục công khai. Seed không xoá
bản nháp hay lần nộp cũ. Nếu muốn làm lại, dùng “Đặt lại” trong bài.

## Các bước test thủ công

1. Giữ `return 0` và bấm **Chạy**: 2/3 test mẫu đạt, chưa hoàn thành checklist.
2. Bấm **Nộp bài**: 2/5 test đạt, điểm 40; test ẩn chỉ hiện tổng hợp 0/2.
3. Thay thân hàm bằng `return numbers.filter(n => n % 2 === 0).reduce((sum, n) => sum + n, 0);`.
   Bấm Ctrl/⌘+Enter: 3/3 test mẫu đạt, kết quả nộp cũ vẫn được tính.
4. Bấm **Nộp bài**: 5/5 đạt, điểm 100 và checklist code hoàn thành.
5. Sửa lại `return 0` và chỉ **Chạy**: kết quả nộp 100 vẫn được giữ.
   **Nộp bài**: điểm còn 40, checklist trở về chưa đạt (D7).
6. Sửa code, đợi “Đã lưu nháp”, tải lại trang: code được khôi phục từ DB.
7. Thử `function sumEven( {`: lỗi cú pháp. Thử `throw new Error('test');`:
   lỗi khi chạy, console có dòng lỗi. Thử `while (true) {}`: quá thời gian.
8. **Đặt lại** → huỷ giữ code; xác nhận khôi phục starter và xoá đầu ra,
   vẫn giữ kết quả lần nộp. Ba lần nộp chưa đạt mở lời giải có xác nhận.
9. Bấm “Giải thích lỗi này”: bảng ngữ cảnh có input/expected/received và code.
   AI tutor đầy đủ thuộc #101; hiện có thể sao chép ngữ cảnh, chưa gửi AI.
10. Kiểm tra light/dark và màn hình 375px: editor, bộ lọc test, lỗi và nút thao tác.

## Hiện thực và giới hạn

| Chuyển trạng thái | Hiện thực | Kiểm tra |
|---|---|---|
| Lưu và khôi phục nháp | coding_workspaces theo exercise/enrollment | DB rollback, UI |
| Chạy test mẫu | mode=run, is_passed không được tính | WASM, DB, UI, API |
| Nộp toàn bộ test | mode=submit, lưu kết quả từng test, latest counts | DB, UI, contract |
| Syntax/runtime/timeout | code_run_phase, console, dòng lỗi | WASM, UI |
| Sandbox không sẵn sàng | 503, không tạo bài chấm giả, giữ nháp | DB, UI |
| Đặt lại | xác nhận, không đổi counted submission | DB, UI |
| Lời giải | đã đạt hoặc ba lần nộp chưa đạt; verified solution | DB, contract |
| Năng lực sau xem lời giải | flag theo lần nộp, BKT posterior từ code giới hạn 0.7 | DB integration |
| Test ẩn | chỉ tổng hợp, không có input/name/expected/actual/error/log | DB projection |

JavaScript chạy trong QuickJS WebAssembly, nằm trong Node worker riêng. Không cấp
API Node, filesystem, network, environment hay module loader cho learner code.
Giới hạn guest heap 16 MiB, stack 256 KiB, execution 3 giây, có hard worker deadline
4.5 giây gồm khởi tạo. Tối đa 100 test và 65.536 ký tự source; console 30 dòng,
kết quả 4096 ký tự. Mỗi test dùng context riêng; expected được so sánh ngoài sandbox.
Không chạy Python giả: Python báo chưa sẵn sàng theo lựa chọn triển khai hiện tại.

Server kiểm tra session/role, enrollment, onboarding, bài được xuất bản,
course/lesson/assessment và prerequisite. Mutation yêu cầu same-origin.
Advisory lock theo user và enrollment lock ngăn chạy đồng thời/lần nộp ghi đè.
Migration additive `20261017113000_coding_workspace`, RLS bật cho bảng mới.

```sh
pnpm test
pnpm --filter web test:coding:db
pnpm run check-types
pnpm run check:standards
pnpm --filter web build
```

DB verification dùng runner thật và rollback dữ liệu kiểm thử. Browser parity,
ảnh mockup/implementation light/dark/mobile còn cần hoàn tất; chưa coi build/DOM
test là xác minh hình ảnh. Chưa đủ điều kiện đóng issue #100 hoặc đưa PR khỏi draft.
