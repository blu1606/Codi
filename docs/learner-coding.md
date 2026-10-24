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
   vẫn giữ kết quả lần nộp. Ba lần nộp chạy xong toàn bộ test (`phase=done`)
   nhưng chưa đạt mở lời giải có xác nhận; lỗi syntax/runtime/timeout không tính.
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
| Lời giải | đã đạt hoặc ba lần nộp phase done chưa đạt; verified solution | DB, Vitest transition |
| Năng lực sau xem lời giải | flag theo lần nộp, BKT posterior từ code giới hạn 0.7 | DB integration |
| Test ẩn | chỉ tổng hợp, không có input/name/expected/actual/error/log/phase/timing | Vitest projection sentinel |

JavaScript chạy trong QuickJS WebAssembly, nằm trong Node worker riêng. Không cấp
API Node, filesystem, network, environment hay module loader cho learner code.
Giới hạn guest heap 16 MiB, stack 256 KiB, execution 3 giây. Worker báo ready sau
khởi tạo WASM, sau đó nhận lệnh start. Watchdog khởi tạo 10 giây và watchdog chạy
4,5 giây đều trả 503, không tạo submission; chỉ guest interrupt mới được chấm timeout.
Tối đa 4 worker mỗi process; worker thứ 5 nhận 503 ngay, không xếp hàng.
Tối đa 100 test và 65.536 ký tự source; console 30 dòng,
kết quả 4096 ký tự. Mỗi test dùng context riêng; expected được so sánh ngoài sandbox.
Không chạy Python giả: Python báo chưa sẵn sàng theo lựa chọn triển khai hiện tại.
Không chạy Promise job queue: kết quả async/Promise báo lỗi rõ ràng, không bị chấm như `{}`.
`coding_test_cases.points` dành cho authoring; điểm hiện tại là phần trăm test đạt
không trọng số, đúng §12. Cap mastery 0,7 giữ nguyên theo quyết định hiện tại.

Server kiểm tra session/role, enrollment, onboarding, bài được xuất bản,
course/lesson/assessment và prerequisite. Mutation yêu cầu same-origin.
Run/Submit gồm: transaction ngắn kiểm tra quyền, claim lease và lưu nháp → chạy
sandbox ngoài transaction → transaction ngắn kiểm tra lại quyền, phiên bản đề,
token/TTL rồi ghi kết quả. Khoá enrollment không được giữ trong lúc chạy sandbox.
Lease theo user dùng chung mọi instance/course, TTL 20 giây, cooldown 2 giây.
Lượt chạy đang bận trả 409; cooldown trả 429. Cleanup luôn kiểm tra token, không
xoá lease của request mới hơn. Draft vẫn lưu được khi worker chạy và không bị kết quả ghi đè.
Lịch sử chỉ đọc aggregate SQL, latest submit và lastRunId, không tải source của
mọi submission. Autosave trả `{saved: true, code}` và không đọc lại projection.
Phase hiển thị chỉ lấy test mẫu; thời gian chỉ lấy sample, làm tròn 100 ms.
Thời gian cũ chưa tách sample được ẩn (0 ms). Sample chạy trước hidden để hidden
timeout không làm sai phase hay thời gian sample.
Migration additive `20261018063222_coding_run_leases` thêm bảng RLS cho lease;
cần migrate trước khi deploy. Điều kiện mở lời giải phase done là thay đổi được
người yêu cầu xác nhận ngày 18/10/2026 khi xử lý review #128; không đổi hints theo tổng số lần trượt.

```sh
pnpm test
pnpm --filter web test:coding:db
pnpm run check-types
pnpm run check:standards
pnpm --filter web build
node scripts/verify-coding-trace.mjs
```

DB verification dùng runner thật và rollback dữ liệu kiểm thử. Browser parity,
ảnh mockup/implementation light/dark/mobile còn cần hoàn tất; chưa coi build/DOM
test là xác minh hình ảnh. Chưa đủ điều kiện đóng issue #100 hoặc đưa PR khỏi draft.

## Kiểm tra preview Vercel

`next.config.ts` trace tường minh worker cùng QuickJS JS/WASM và đặt root về monorepo.
`verify-coding-trace.mjs` kiểm tra manifest production có các file runtime cần thiết.
Build/trace local không thay cho việc chạy trên Vercel. Cần preview URL có dữ liệu
coding và learner có enrollment để bấm Chạy rồi xác minh test mẫu trả kết quả.
Hiện GitHub chưa cung cấp preview deployment cho nhánh này; bước kiểm tra đó còn mở.

## Xác minh bản sửa review #128 — 18/10/2026

- `vitest run --coverage`: 708 test / 48 file qua; gồm transition/projection,
  transaction boundary, lease/cooldown, lifecycle/watchdog và WASM thật.
- `check:standards`: 0 vi phạm. Production build và kiểm tra trace worker/WASM qua.
- DB integration với WASM thật qua; dữ liệu fixture và DDL kiểm thử rollback.
  Sau đó migration lease được áp dụng riêng vào DB dev, journal và RLS đã xác nhận.
- Smoke API trên production build local cổng 3002: Run đạt 3/3 test mẫu, 0 test ẩn;
  giữ nguyên điểm, passed và số submit, khôi phục nháp gốc, đăng xuất session test.
  Cổng 3001 đang phục vụ app không có API lesson hiện tại nên không dùng làm bằng chứng.
- Chưa xác minh UI bằng trình duyệt (không có browser kết nối) hoặc Run trên Vercel.
