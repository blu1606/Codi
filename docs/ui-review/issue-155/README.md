# Issue #155 — kiểm tra tên hiển thị

Nguồn hợp đồng: `docs/mockup/PRODUCT.md` Flow A3, `docs/mockup/js/core.js` (`settingsPage`, `settings-name-input`). Save bị khóa khi tên sau trim trống hoặc trùng tên đã lưu; Hủy giữ tên gốc.

## Phạm vi xác minh

- Vitest: 72 file, 943 test pass, bao gồm guard UI/API, hủy/mở lại, lưu thành công, lỗi HTTP/mạng và thử lại.
- Coverage gate pass; TypeScript pass; design standards pass, 0 vi phạm.
- Trình duyệt: component `AccountSettings` thật với danh tính giả lập, ở 1280×800 và 375×812, light/dark. Cả bốn cấu hình pass; không có page error.
- Browser fixture dùng route tạm `/dev/issue-155` và intercept các request auth/profile. Phản hồi lưu thành công/HTTP 500 được giả lập. Route tạm đã xóa, không nằm trong PR. Ảnh không phải bằng chứng round trip với backend đã đăng nhập.
- Case E2E gốc `UI-COM-29` chưa chạy tới phần behavior: setup thiếu `SEED_ACCOUNT_TARGETS` và `SEED_ACCOUNT_PASSWORD`. Không thay expected hoặc bỏ qua HTTP error trong suite E2E.

Ảnh chỉ chứa dữ liệu giả lập; không có thông tin tài khoản thật. Mockup được mở từ `docs/mockup/index.html`, vai trò learner. Giao diện sản phẩm giữ dialog sẵn có, mockup dùng sửa inline; điều kiện Save và hành vi Hủy khớp nhau.

## Đối chiếu ảnh

Ảnh được lưu trong repository để reviewer xem trực tiếp cùng PR; môi trường tạo PR không hỗ trợ upload tệp đính kèm qua trình duyệt.

| State | Mockup desktop light / dark | Implementation desktop light / dark | Mockup mobile light / dark | Implementation mobile light / dark |
| --- | --- | --- | --- | --- |
| Tên chưa đổi | [light](mockup-desktop-light-unchanged.png) / [dark](mockup-desktop-dark-unchanged.png) | [light](implementation-desktop-light-unchanged.png) / [dark](implementation-desktop-dark-unchanged.png) | [light](mockup-mobile-light-unchanged.png) / [dark](mockup-mobile-dark-unchanged.png) | [light](implementation-mobile-light-unchanged.png) / [dark](implementation-mobile-dark-unchanged.png) |
| Tên đã sửa | [light](mockup-desktop-light-dirty.png) / [dark](mockup-desktop-dark-dirty.png) | [light](implementation-desktop-light-dirty.png) / [dark](implementation-desktop-dark-dirty.png) | [light](mockup-mobile-light-dirty.png) / [dark](mockup-mobile-dark-dirty.png) | [light](implementation-mobile-light-dirty.png) / [dark](implementation-mobile-dark-dirty.png) |
| Hủy rồi mở lại | Tên gốc; Save khóa | [light](implementation-desktop-light-cancel-reopened.png) / [dark](implementation-desktop-dark-cancel-reopened.png) | Tên gốc; Save khóa | [light](implementation-mobile-light-cancel-reopened.png) / [dark](implementation-mobile-dark-cancel-reopened.png) |
| Lưu thất bại | Không có backend thật trong mockup | [light](implementation-desktop-light-save-error.png) / [dark](implementation-desktop-dark-save-error.png) | Không có backend thật trong mockup | [light](implementation-mobile-light-save-error.png) / [dark](implementation-mobile-dark-save-error.png) |
| Lưu thành công rồi mở lại | Tên đã lưu; Save khóa | [light](implementation-desktop-light-saved-reopened.png) / [dark](implementation-desktop-dark-saved-reopened.png) | Tên đã lưu; Save khóa | [light](implementation-mobile-light-saved-reopened.png) / [dark](implementation-mobile-dark-saved-reopened.png) |

## Test hồi quy

`apps/web/src/components/settings/account-settings.test.ts` kiểm tra component thật, mock các dependency không thuộc chỉnh sửa tên và các biên fetch/router/toast. `apps/web/src/app/api/user/profile/route.test.ts` kiểm tra API không gọi `updateUser` khi tên trùng sau trim, dùng session không lấy từ cookie cache.

```sh
pnpm test
pnpm test:coverage
pnpm run check-types
pnpm run check:standards
```
