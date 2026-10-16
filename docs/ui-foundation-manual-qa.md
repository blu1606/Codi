# Issue #95 — kiểm tra và chụp ảnh thủ công

PR: https://github.com/blu1606/Codi/pull/122 · nhánh `feat/95-ui-foundation`.

Người dùng nhận phần chụp ảnh ngày 15/10/2026. Các ô dưới đây chưa được xác minh bằng trình duyệt.

## Mở trang

- UI thật: http://localhost:3001/dev/foundation (chỉ development).
- Mockup: mở `docs/mockup/index.html` trong trình duyệt; Alt+K để đổi vai trò/kịch bản.
- Mẫu Claude: https://claude.ai/artifact/WXxCME9cqxrnT1Ff9AhUD5.
- Chọn Sáng/Tối qua menu giao diện trên header. Chụp desktop và 375px cho phần learner.
- Header và thông báo cần đăng nhập tài khoản dev đúng vai trò. Trang preview không tạo dữ liệu thông báo.

## Danh sách ảnh

Mỗi trạng thái cần ảnh mockup đối chiếu và ảnh UI thật sáng/tối; thêm mobile 375px cho learner.
Có thể ghép nhiều primitive vào cùng ảnh nếu mọi nhãn và trạng thái đều rõ.

| Trạng thái | Cách mở trên UI thật | Mockup | Sáng | Tối | 375px learner |
|---|---|---|---|---|---|
| Header khách | Đăng xuất; kiểm tra không có chuông | ☐ | ☐ | ☐ | ☐ |
| Header học viên | Đăng nhập learner; chụp cả menu mobile mở | ☐ | ☐ | ☐ | ☐ |
| Header giảng viên | Đăng nhập lecturer | ☐ | ☐ | ☐ | — |
| Header quản trị viên | Đăng nhập admin | ☐ | ☐ | ☐ | — |
| Thông báo đang tải | DevTools Network: làm chậm mạng, reload rồi mở chuông trước khi GET hoàn tất | ☐ | ☐ | ☐ | ☐ |
| Thông báo rỗng | Tài khoản dev chưa có thông báo; mở chuông | ☐ | ☐ | ☐ | ☐ |
| Chưa đọc / đã đọc / tất cả đã đọc | Tài khoản dev có thông báo thật; chụp trước và sau từng thao tác | ☐ | ☐ | ☐ | ☐ |
| Lỗi thông báo / thử lại | DevTools chặn `/api/notifications`, mở chuông; bỏ chặn rồi bấm Thử lại | ☐ | ☐ | ☐ | ☐ |
| Xác nhận thường | Preview → Xác nhận thông thường | ☐ | ☐ | ☐ | ☐ |
| Lý do bắt buộc + lỗi trống | Preview → Xác nhận kèm lý do; focus rồi rời ô trống; nhập lý do để kiểm tra nút mở khoá | ☐ | ☐ | ☐ | ☐ |
| Nhập để xác nhận | Preview → Nhập để xác nhận; chụp trước/sau khi nhập `XOÁ` | ☐ | ☐ | ☐ | ☐ |
| Đang xử lý xác nhận | Preview → Xem xác nhận đang xử lý → Xác nhận; trạng thái giữ 8 giây | ☐ | ☐ | ☐ | ☐ |
| Lỗi xác nhận + thử lại | Preview → Xem lỗi và thử lại xác nhận → Xác nhận; chụp lỗi, bấm lại để kiểm tra đóng thành công | ☐ | ☐ | ☐ | ☐ |
| Toast Hoàn tác | Preview → Xoá mục xem thử; chụp toast rồi bấm Hoàn tác, kiểm tra nút được khôi phục | ☐ | ☐ | ☐ | ☐ |
| Sheet bên / docked | Preview → Mở bảng bên; đóng rồi Bật/tắt bảng docked | ☐ | ☐ | ☐ | ☐ |
| Mastery 5 mức; badge course/order/submission | Các card đầu trang preview | ☐ | ☐ | ☐ | ☐ |
| Alert, Empty, Stepper, ProgressRing | Các card còn lại trong preview | ☐ | ☐ | ☐ | ☐ |

Pending/error của hộp xác nhận trên preview là mô phỏng có nhãn rõ, chỉ xác minh giao diện component.
Không dùng ảnh đó để khẳng định API thật đã được kiểm tra end-to-end.
Nếu chưa có dữ liệu hoặc không mở được trạng thái, ghi rõ phần thiếu; không đánh dấu hoàn tất.

## Đính kèm PR

Tải ảnh trực tiếp lên phần mô tả PR, chờ tải xong và điền bảng `State | Mockup | Light | Dark | Mobile 375px`.
PR hiện có 3 ảnh đã tải lên và một dòng `Uploading image.png…` chưa hoàn tất; cần phân loại ba ảnh đó theo trạng thái và thay dòng đang tải bằng ảnh hoàn chỉnh.

Ghi lỗi phát hiện cùng bước tái hiện. Kiểm tra Tab/Shift+Tab, Escape, focus khi mở/đóng modal,
không cuộn ngang ở 375px, và đối chiếu mẫu Claude. Chỉ đánh dấu checklist đã thực sự kiểm tra.
