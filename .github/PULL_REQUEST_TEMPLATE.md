## Mô tả thay đổi (Summary)
<!-- Tóm tắt ngắn gọn các thay đổi trong PR này: thay đổi gì và vì sao. -->

## Liên kết Issue (Related Issue)
Closes #<!-- Số thứ tự issue, ví dụ: Closes #12. Mỗi PR phải có issue trước. -->

## Loại thay đổi (Type of Change)
- [ ] 🚀 Tính năng mới (feat)
- [ ] 🐛 Sửa lỗi (fix)
- [ ] 🎨 Tái cấu trúc / UI styling (refactor)
- [ ] 📝 Tài liệu (docs)
- [ ] 🔧 Cấu hình / CI/CD (chore / infra)

## Đối chiếu mockup (bắt buộc nếu PR chạm màn hình / nghiệp vụ)
<!-- Nguồn sự thật: docs/mockup/ (xem docs/mockup/README.md). UI được khác, state/luồng/token KHÔNG được khác. -->
Màn hình: <!-- vd S05, S06 --> · Mockup route: <!-- vd #/cart --> · Entity: <!-- vd Order, Cart -->

| Mockup state / transition | Hiện thực (schema / server action / component) | Test |
|---|---|---|
|  |  |  |

### Ảnh chụp từng state (bắt buộc)
<!-- Mỗi state 1 dòng. Kéo-thả ảnh trực tiếp vào PR. Learner: thêm ảnh mobile 375px. -->
| State | Mockup | Implementation (light) | Implementation (dark) |
|---|---|---|---|
|  |  |  |  |

### Checklist parity
- [ ] Enum state + chuyển trạng thái khớp `docs/mockup/STATE-MACHINES.md` (không thêm/bớt state)
- [ ] Guard/điều kiện chuyển trạng thái kiểm tra ở server, có test Vitest cho từng transition và guard
- [ ] Đủ mọi screen state trong `PRODUCT.md` §6 (loading / empty / error / edge)
- [ ] Quy tắc §7: confirm (+ lý do) vs undo toast, không auto-redirect, mastery có nhãn chữ
- [ ] Chỉ dùng token semantic theo `docs/mockup/DESIGN-TOKENS.md` (light + dark)
- [ ] Không sửa `docs/mockup/**` (nếu mockup sai → ghi rõ ở đây và hỏi PO)
- Khác biệt UI có chủ ý / điểm mockup chưa rõ: <!-- liệt kê -->

## Cách kiểm tra (Testing & Verification)
- [ ] Đã chạy `pnpm run check:standards` (0 vi phạm design tokens)
- [ ] Đã chạy `pnpm run check-types` (0 lỗi TypeScript)
- [ ] Đã chạy `pnpm test`
- [ ] Đã đi hết luồng trên trình duyệt với từng vai trò liên quan

## Checklist trước khi merge
- [ ] Code tuân thủ coding standards và design tokens của dự án
- [ ] Không commit file nhạy cảm (`.env`, secrets, credentials)
- [ ] PR đã được phân loại và pass toàn bộ CI check
