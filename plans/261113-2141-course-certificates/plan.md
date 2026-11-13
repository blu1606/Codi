# Chứng chỉ hoàn thành khoá học

Trạng thái: đang làm · Ngày: 13/11/2026

## Mục tiêu

Học viên học xong khoá thì tự nhận chứng chỉ: xem trên web, tải PDF, chia sẻ link, nhận email. Ai có mã hoặc link
cũng xác minh được chứng chỉ thật hay giả ở `/verify`. Admin thu hồi được chứng chỉ (gian lận, hoàn tiền) và khôi
phục lại nếu thu hồi nhầm.

Không làm lần này: giảng viên tuỳ chỉnh mẫu chứng chỉ, bật/tắt chứng chỉ theo khoá, chữ ký tay, chứng chỉ theo
chương. Mobbin cho thấy các nền tảng nhỏ (Teachable, Kajabi, Podia) đều có bật/tắt và trình sửa mẫu, nhưng đề bài
chỉ cần cấp, hiển thị và xác minh.

## Tham khảo (Mobbin)

| Mẫu | Lấy gì |
|---|---|
| [Codecademy](https://mobbin.com/screens/93071642-c4dc-42ec-bd64-ff93afb7646e) | QR dẫn tới trang xác minh, "Save as PDF", "Edit Name" |
| [Uxcel](https://mobbin.com/screens/0c1b9442-fa6b-4b1a-a7de-40576ae7bf00) | Trang chứng chỉ công khai: "Credentials Verified", mã, ngày, chia sẻ LinkedIn, tải xuống |
| [Canva](https://mobbin.com/screens/4fe2534c-ba0f-4a7b-95c7-3989f342fc00) | Màn chúc mừng ngay khi đạt, Credential ID ngắn, nút tải và chia sẻ |
| [Skillshare](https://mobbin.com/screens/7f9a2e7c-e42c-46ce-be3b-658b91c8e92e) | Thông tin phụ trên chứng chỉ: ngày cấp, thời lượng, giảng viên |
| [Teachable](https://mobbin.com/screens/263e666a-53de-46cb-b79e-a1b3b4936c6b), [Podia](https://mobbin.com/flows/289e960b-12b4-48d7-a47d-fe7ed4631b85) | Tự cấp khi hoàn thành khoá; gửi email kèm link xem và tải |

## Phân rã trạng thái

### A. Điều kiện nhận (theo ghi danh)

| Trạng thái | Khi nào | Học viên thấy |
|---|---|---|
| Chưa đủ điều kiện | Còn bài bắt buộc chưa xong (bài "có thể bỏ qua" không bắt buộc) | Thẻ "Chứng chỉ" trên trang lộ trình: còn N bài bắt buộc |
| Đủ điều kiện → cấp ngay | Bài bắt buộc cuối cùng hoàn thành (`selectPath(...).complete`), cùng transaction đánh dấu ghi danh `completed` | Thẻ chúc mừng có nút "Xem chứng chỉ"; thông báo trong app; email |
| Đã hoàn thành trước khi có tính năng | Ghi danh `completed` nhưng chưa có chứng chỉ | Cấp bù lần đầu học viên mở lộ trình hoặc danh sách chứng chỉ |

Mỗi ghi danh có tối đa một chứng chỉ (khoá duy nhất `enrollment_id`). Cấp lại nhiều lần (bấm hoàn thành 2 lần, 2 tab
cùng lúc) không tạo bản thứ hai.

### B. Vòng đời chứng chỉ

| Trạng thái | Vào bằng | Ra bằng | Trang xác minh hiển thị |
|---|---|---|---|
| **Hợp lệ** | Cấp tự động; admin khôi phục | Admin thu hồi | "Chứng chỉ hợp lệ", tên, khoá, ngày cấp, giảng viên, thời lượng |
| **Đã thu hồi** | Admin thu hồi (bắt buộc ghi lý do) | Admin khôi phục | "Chứng chỉ đã bị thu hồi" kèm ngày; lý do chỉ chủ chứng chỉ và admin thấy; bản render có dấu "Đã thu hồi" |

Không có trạng thái "hết hạn": chứng chỉ hoàn thành khoá không hết hạn.

### C. Dữ liệu trên chứng chỉ là ảnh chụp lúc cấp

Tên khoá, tên giảng viên, số bài và thời lượng được lưu lại lúc cấp. Giảng viên đổi tên khoá, thêm bài, ẩn khoá, hay
khoá bị gỡ thì chứng chỉ đã cấp vẫn giữ nguyên nội dung và vẫn xác minh được. Học viên đổi tên tài khoản không đổi
tên trên chứng chỉ.

### D. Sửa tên trên chứng chỉ

- Chủ chứng chỉ được sửa tên in trên chứng chỉ **một lần** (2–80 ký tự), ví dụ viết đủ dấu.
- Sau khi đã sửa, nút bị khoá kèm dòng giải thích. Muốn sửa nữa thì liên hệ admin.
- Không cho sửa khi chứng chỉ đã bị thu hồi.

### E. Trang xác minh `/verify` và `/verify/:code` (công khai, không cần đăng nhập)

| Trạng thái | Hiển thị |
|---|---|
| Chưa nhập | Ô nhập mã `CODI-XXXX-XXXX` và giải thích ngắn |
| Mã sai định dạng | Lỗi ngay tại ô nhập, không gọi server |
| Đang kiểm tra | Khung chứng chỉ dạng xương |
| Hợp lệ | Huy hiệu "Đã xác minh", bản render chứng chỉ, thông tin |
| Đã thu hồi | Huy hiệu đỏ "Đã thu hồi", ngày thu hồi, bản render có dấu thu hồi |
| Không tìm thấy | "Không tìm thấy chứng chỉ với mã này", gợi ý kiểm tra lại |
| Quá nhiều lượt | "Bạn tra cứu quá nhanh", thử lại sau (giới hạn 30 lượt/phút mỗi IP) |
| Lỗi mạng hoặc server | Thông báo và nút "Thử lại" |

Vai trò người xem trên cùng trang:

- **Khách:** chỉ xem.
- **Chủ chứng chỉ:** tải PDF, sao chép link, thêm vào LinkedIn, sửa tên một lần.
- **Admin:** thu hồi hoặc khôi phục.

Trang không lộ email hay ID người dùng.

### F. Thông báo

- Khi cấp: thông báo trong app và email "Chúc mừng, bạn đã nhận chứng chỉ …" kèm link xem.
- Email gửi sau khi transaction ghi xong; gửi lỗi thì chỉ ghi log, không làm hỏng việc hoàn thành bài.
- Khi thu hồi hoặc khôi phục: thông báo trong app cho chủ chứng chỉ.

## Mã chứng chỉ

`CODI-` + 8 ký tự Crockford base32 (không có I, L, O, U), chia 2 nhóm `CODI-7KQ2-M9XA`, khoảng 10^12 tổ hợp. Nhập không
phân biệt hoa thường, bỏ khoảng trắng; O được hiểu là 0, I và L là 1.

## Thiết kế dữ liệu và API

- Bảng `course_certificates`, gồm các cột:
  - định danh: `id`, `code` (unique), `enrollment_id` (unique), `user_id`, `course_id` (set null khi xoá);
  - ảnh chụp lúc cấp: `recipient_name`, `course_title`, `lecturer_name`, `lesson_count`, `total_seconds`;
  - mốc thời gian: `issued_at`, `name_edited_at`;
  - thu hồi: `revoked_at`, `revoked_reason`, `revoked_by`.
- `GET /api/certificates/:code`: công khai, có giới hạn lượt; trả quyền của người xem (chủ, admin).
- `POST /api/certificates/:code`, `{action}`:
  - `rename`: chỉ chủ chứng chỉ;
  - `revoke` (kèm `reason`), `restore`: chỉ admin.
- `GET /api/certificates`: danh sách chứng chỉ của học viên (có cấp bù).
- `CoursePathView.certificate`: `{ code, status }` hoặc null.

## Giao diện

- `/verify`, `/verify/:code`: trang công khai.
- Thẻ hoàn thành khoá (trang lộ trình, cuối bài cuối): nút "Xem chứng chỉ".
- Trang Kết quả học tập: mục "Chứng chỉ của tôi".
- Bản render: tỉ lệ A4 ngang, in ra PDF qua hộp thoại in của trình duyệt, QR trỏ tới `/verify/:code`.

## Kiểm thử

- Unit:
  - sinh mã và chuẩn hoá mã nhập;
  - cấp đúng một lần;
  - snapshot không đổi khi khoá đổi;
  - đổi tên một lần;
  - thu hồi và khôi phục đúng quyền.
- Trình duyệt:
  - học viên demo đã xong khoá mở chứng chỉ;
  - khách xác minh mã đúng, mã sai và mã đã thu hồi;
  - admin thu hồi rồi khôi phục;
  - in PDF.

## Dữ liệu demo

- Seed một học viên đã hoàn thành khoá "JavaScript nền tảng (Demo đầy đủ)": tên "[DEMO CHỨNG CHỈ] Học viên đã hoàn
  thành", có sẵn chứng chỉ.
- Seed thêm một chứng chỉ đã thu hồi để demo trạng thái thu hồi.
- Chạy seed trên prod sau khi phát hành, rồi chụp lại snapshot demo.
