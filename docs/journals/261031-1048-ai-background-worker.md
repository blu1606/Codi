---
date: 2026-10-31
topic: AI background worker
status: in-progress
---

# AI background worker

## Context

Các tác vụ AI chạy trong request có giới hạn thời gian; VPS là máy dùng chung và database là production. Công việc được chuẩn bị trên nhánh dựa trên `develop`, với danh tính Git Codex.

## Changes and decisions

- Thêm queue PostgreSQL có lease và fencing, worker tuần tự không mở HTTP port, cùng trạng thái công việc cho phân tích GitHub, trích xuất bản đồ kiến thức và tạo quiz. Lộ trình học dùng hàng đợi sẵn có; AI chat vẫn là streaming.
- Khi lease hết hạn, không tự gọi lại model vì lần trước có thể đã được tính phí. Các handler kiểm tra lại quyền, dữ liệu và phiên bản trước khi lưu; GitHub OAuth token không được đưa vào queue.
- Mặc định tắt worker bằng feature flag. Các deadline riêng cho worker được giới hạn; các đường đồng bộ còn lại giữ hành vi tương thích khi cờ tắt.
- Người dùng chọn tiếp tục công khai **snapshot bản đồ đã xác nhận** cho đến khi giảng viên xác nhận bản mới. Danh mục khóa học lấy topic từ snapshot thay vì skill nháp; thông tin học viên cũng cần theo snapshot đã duyệt.
- Quiz AI là bản nháp cho giảng viên duyệt; đánh dấu bản nháp đã áp dụng khi lưu quiz thành công trong cùng transaction.

## Verification and limits

Xác minh trên nhánh làm việc: 2.837 test Vitest đạt; 8 test PostgreSQL bị bỏ qua ở lượt suite chính được chạy riêng bằng PostgreSQL tạm và cả 8 đạt. Monorepo typecheck, UI-lab typecheck, standards check và production webpack build với env/database giả đều đạt. Build có cảnh báo dependency động hiện có từ Varlock. Cluster PostgreSQL tạm đã được dừng/xóa.

Các kết quả này không chứng minh hành vi OAuth hay provider thật và không thay thế kiểm thử tải, rollout hoặc rollback.

Trích xuất bản đồ hiện dựa trên văn bản bài học có giới hạn độ dài; không suy ra rằng đã đọc toàn bộ PDF, slides hoặc video. Không thực hiện lệnh gọi provider tính phí. Migration additive, triển khai worker, cấu hình production và kiểm thử trên database độc lập tương thích vẫn cần hoàn tất theo runbook trước khi bật cờ.

## Next

Chờ người dùng duyệt bước hoàn tất sau kiểm thử theo cổng của `ck:cook`; sau đó mới commit/push và mở PR vào `develop`. Chưa triển khai worker, chưa chạy migration trên server/database production, chưa gọi provider AI thật. Đối chiếu `docs/ai-worker-runbook.md` trước mọi thay đổi production.
