## Mô tả thay đổi (Summary)
Triển khai toàn bộ các tính năng Quản lý khóa học đã xuất bản (S33), Đơn hàng & giao dịch (S34), và Voucher (S35) theo đúng yêu cầu Issue #110, `docs/mockup/js/admin.js`, `PRODUCT.md` Flow D1 (§7.12) và `STATE-MACHINES.md` §4, §5:

### 1. S33 Published Courses (`/dashboard/admin/courses`)
- Bảng danh sách khóa học đang mở bán / đã ẩn (`published` / `hidden`), kèm giảng viên, giá VND (hoặc Miễn phí), số học viên đã ghi danh, đánh giá sao.
- **Ẩn khóa học**: Confirm dialog bắt buộc nhập lý do (`requireReason={true}` theo §7.12), nêu rõ tác động (học viên cũ vẫn học bình thường, khóa học đóng bán với học viên mới), cập nhật `status: 'hidden'` và tự động gửi thông báo cho giảng viên kèm lý do.
- **Hiện lại khóa học**: Confirm dialog xác nhận hoàn tác, mở bán lại và gửi thông báo cho giảng viên.
- **Đổi giá khóa học (D13)**: Modal nhập giá mới (validate số nguyên không âm), hiển thị giá cũ → mới, cảnh báo chỉ áp dụng cho đơn hàng mới (đơn pending giữ giá cũ), ghi nhận `priceUpdatedBy`, `priceUpdatedAt`, tự động gửi thông báo giá cũ → giá mới cho giảng viên.

### 2. S34 Orders & Transactions (`/dashboard/admin/orders`)
- **4 Thẻ thống kê (Stat tiles)**: Đơn trong bộ lọc, Đã thanh toán, Chờ thanh toán (kèm số đơn quá hạn > 24h), Doanh thu.
- **Bộ lọc giao dịch**:
  - Khoảng thời gian: Preset `7 ngày`, `30 ngày`, `90 ngày`, `Tất cả`.
  - Trạng thái đơn hàng: `pending`, `paid`, `failed`, `cancelled`, `refunded`.
  - Ô tìm kiếm: Mã giao dịch, người mua, email, tên khóa học.
  - Quick filters: **Đơn cần đối soát** (`needsReconciliation: true` theo D2, D3: thừa tiền, thiếu tiền hết hạn, thanh toán muộn khi đã sở hữu), **Đơn quá hạn** (`> 24h` theo D1).
- **Drawer chi tiết đơn hàng (Sheet)**:
  - Thông tin người mua, chi tiết các khóa học đã đặt, giảm giá voucher, tổng tiền, số tiền thực nhận (nếu underpaid).
  - Khối nội dung chuyển khoản VietQR nổi bật kèm nút sao chép và thông báo "Đã sao chép".
  - Lịch sử trạng thái (Timeline) theo thời gian.
  - **Huỷ đơn hàng**: Nút huỷ đơn (chỉ hiển thị cho đơn `pending`), confirm dialog bắt buộc nhập lý do, chuyển trạng thái `cancelled`, ghi nhận vào `orderEvents` và gửi thông báo cho học viên.
- **Xuất CSV (Export modal)**:
  - Chọn khoảng thời gian preset (`7`, `30`, `90`, `all`), múi giờ cố định GMT+7 (Hà Nội).
  - Tuỳ chọn checkbox "Áp dụng bộ lọc hiện tại".
  - Lựa chọn 10 cột dữ liệu xuất (`code`, `buyer`, `email`, `courses`, `voucher`, `discount`, `total`, `status`, `createdAt`, `paidAt`).
  - Tóm tắt trực tiếp (Live summary: số đơn, số cột, tổng tiền).
  - Tải file CSV định dạng UTF-8 có BOM (`\uFEFF`) để Microsoft Excel tiếng Việt không bị lỗi font.
- Không có luồng hoàn tiền trong app theo quyết định **D18** (giá trị `refunded` chỉ để dành).

### 3. S35 Vouchers (`/dashboard/admin/vouchers`)
- Danh sách voucher: Mã, mức giảm (phần trăm hoặc VND), đơn tối thiểu, tiến trình sử dụng (`usedCount / usageLimit`), hạn dùng (kèm cảnh báo đã hết hạn / hết lượt), công tắc bật/tắt, nút sửa.
- **Tạo / Sửa voucher (Sheet)**:
  - Validate inline: Mã gồm 4–20 ký tự chữ in hoa/số (`A-Z0-9`), duy nhất, không cho sửa mã sau khi tạo.
  - Loại giảm giá: Radio Phần trăm (%) hoặc Số tiền (VND). Phần trăm tối đa 100%.
  - Điều kiện: Đơn tối thiểu (Không yêu cầu / Từ số tiền), Giới hạn lượt dùng (Không giới hạn / Giới hạn N lượt), Hạn dùng (Không hết hạn / Đến ngày cụ thể).
  - Tuân thủ **D14**: 1 mã/đơn, áp dụng toàn bộ giỏ hàng, không cộng dồn.
- **Vô hiệu hoá voucher (§7.12)**: Tắt công tắc kích hoạt confirm dialog cảnh báo ngừng áp dụng cho đơn mới; bật lại tức thì không cần confirm.

### 4. Admin Navigation
- Kích hoạt các liên kết trong menu `/dashboard/admin`: `"Khóa học đã xuất bản"` (`/dashboard/admin/courses`), `"Đơn hàng & giao dịch"` (`/dashboard/admin/orders`), `"Voucher"` (`/dashboard/admin/vouchers`), đảm bảo pass kiểm tra E2E `UI-ADM-03`.

---

## Liên kết Issue (Related Issue)
Closes #110
Liên quan: #81, #103

---

## Loại thay đổi (Type of Change)
- [x] 🚀 Tính năng mới (feat)
- [ ] 🐛 Sửa lỗi (fix)
- [ ] 🎨 Tái cấu trúc / UI styling (refactor)
- [ ] 📝 Tài liệu (docs)
- [ ] 🔧 Cấu hình / CI/CD (chore / infra)

---

## Đối chiếu mockup & State Machine
Màn hình: S33, S34, S35 · Mockup route: `#/admin/courses`, `#/admin/orders`, `#/admin/vouchers` · Flow: D1 · STATE-MACHINES.md §4, §5

| Mockup state / transition | Hiện thực (schema / service / action) | Test Vitest |
|---|---|---|
| S33 `published → hidden` (ad-hide) | `adminHideCourse` / `hideCourseAction`: yêu cầu lý do bắt buộc, cập nhật DB, notify giảng viên | `apps/web/src/lib/admin-courses-service.test.ts` |
| S33 `hidden → published` (ad-unhide) | `adminUnhideCourse` / `unhideCourseAction`: khôi phục trạng thái, notify giảng viên | `apps/web/src/lib/admin-courses-service.test.ts` |
| S33 Đổi giá khóa học (ad-price, D13) | `adminUpdateCoursePrice` / `updateCoursePriceAction`: validate giá, lưu DB, notify giảng viên | `apps/web/src/lib/admin-courses-service.test.ts` |
| S34 Lọc đơn hàng & đối soát (D1, D2, D3) | `getAdminOrders`: lọc theo range, status, q, `needsReconciliation`, `overdueOnly` | `apps/web/src/lib/admin-orders-service.test.ts` |
| S34 `pending → cancelled` (ad-cancel) | `adminCancelOrder` / `cancelAdminOrderAction`: cập nhật status, ghi orderEvents, notify học viên | `apps/web/src/lib/admin-orders-service.test.ts` |
| S34 Xuất CSV (ad-export) | `OrderExportModal`: chọn preset ngày, áp filter, chọn cột, UTF-8 BOM CSV | Client component test & e2e |
| S35 CRUD Voucher (ad-voucher-form, D14) | `createAdminVoucher`, `updateAdminVoucher`, `validateVoucherForm` | `apps/web/src/lib/admin-vouchers-service.test.ts` |
| S35 Bật/tắt Voucher (ad-voucher-toggle, §7.12) | `toggleAdminVoucherActive` / `toggleVoucherActiveAction`: tắt có confirm dialog | `apps/web/src/lib/admin-vouchers-service.test.ts` |

---

### Ảnh chụp từng state (bắt buộc)
> Bảng đối chiếu screenshot từng state theo quy định `AGENTS.md` §2 và `codi-mockup-parity`.

| State | Mockup | Implementation (light) | Implementation (dark) |
|---|---|---|---|
| **S33 Khóa học đã xuất bản** | `#/admin/courses` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S33 Dialog Ẩn khóa học (lý do bắt buộc)** | `ad-hide` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S33 Dialog Đổi giá khóa học** | `ad-price` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S34 Đơn hàng & giao dịch (Bảng + Stat tiles + Filters)** | `#/admin/orders` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S34 Drawer Chi tiết đơn hàng & Timeline** | `ad-order` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S34 Dialog Huỷ đơn hàng** | `ad-order-cancel` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S34 Modal Xuất CSV** | `ad-export` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S35 Danh sách Voucher** | `#/admin/vouchers` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S35 Sheet Tạo / Sửa Voucher** | `ad-voucher-form` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |
| **S35 Dialog Tắt Voucher** | `ad-voucher-toggle` | _(đính kèm screenshot)_ | _(đính kèm screenshot)_ |

---

### Checklist parity
- [x] Enum state + chuyển trạng thái khớp `docs/mockup/STATE-MACHINES.md` (không thêm/bớt state)
- [x] Guard/điều kiện chuyển trạng thái kiểm tra ở server, có test Vitest cho từng transition và guard
- [x] Đủ mọi screen state trong `PRODUCT.md` §6 (loading / empty / error / edge)
- [x] Quy tắc §7.12: confirm (+ lý do) vs undo toast, không auto-redirect, huỷ đơn / tắt mã / ẩn khoá có confirm dialog
- [x] Chỉ dùng token semantic theo `docs/mockup/DESIGN-TOKENS.md` (light + dark)
- [x] Không sửa `docs/mockup/**`

---

## Cách kiểm tra (Testing & Verification)
1. **Kiểm tra tiêu chuẩn mã nguồn & kiểu dữ liệu**:
   ```bash
   pnpm run check:standards   # Kết quả: 0 vi phạm design token
   pnpm run check-types       # Kết quả: 0 lỗi TypeScript
   pnpm test                  # Kết quả: 87/87 test files pass, 1538/1538 tests pass
   ```
2. **Kiểm tra nghiệp vụ thủ công**:
   - Truy cập `/dashboard/admin/courses`:
     - Kiểm tra danh sách khóa học `published` và `hidden`.
     - Nhấn "Ẩn khóa học" -> hiện Confirm dialog -> bắt buộc nhập lý do mới bấm xác nhận được -> trạng thái đổi sang "Đã ẩn".
     - Nhấn "Hiện lại" -> mở bán trở lại.
     - Nhấn "Đổi giá" -> nhập giá mới -> hiển thị preview tính toán -> lưu thành công.
   - Truy cập `/dashboard/admin/orders`:
     - Kiểm tra 4 stat tiles hiển thị chính xác tổng đơn, đã thanh toán, chờ thanh toán, doanh thu.
     - Lọc theo ngày (7, 30, 90, all), lọc trạng thái, tìm kiếm, bấm nút "Cần đối soát".
     - Click vào dòng đơn hàng -> mở drawer chi tiết, kiểm tra các khóa học, voucher, nút sao chép nội dung VietQR, timeline.
     - Bấm "Xuất CSV" -> chọn cột, chọn range -> xuất file và mở bằng Excel hiển thị đúng UTF-8 tiếng Việt.
   - Truy cập `/dashboard/admin/vouchers`:
     - Bấm "Tạo voucher" -> mở Sheet tạo voucher, nhập các điều kiện (mã, loại giảm, min order, usage limit, expiry) -> lưu.
     - Bấm switch tắt voucher -> xuất hiện Confirm dialog cảnh báo ngừng áp dụng đơn mới.
