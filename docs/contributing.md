# Hướng dẫn đóng góp (Contributing Guide)

Chào mừng bạn đến với dự án **Codi**! Tài liệu này cung cấp các tiêu chuẩn và quy trình phát triển nhằm đảm bảo tính ổn định và đồng nhất của codebase.

---

## 1. Quy ước đặt tên nhánh (Branch Naming)

Mọi nhánh tính năng đều phải được tách từ nhánh `develop` và tuân thủ định dạng:

- `feat/<tên-tính-năng>`: Tính năng mới (ví dụ: `feat/ai-course-advisor`)
- `fix/<tên-lỗi>`: Sửa lỗi (ví dụ: `fix/dashboard-token-styling`)
- `refactor/<khu-vực>`: Tái cấu trúc code hoặc chuẩn hoá UI
- `docs/<chủ-đề>`: Cập nhật tài liệu kỹ thuật
- `chore/<nội-dung>`: Cấu hình dependencies, công cụ build
- `hotfix/<tên-lỗi>`: Vá lỗi khẩn cấp trực tiếp từ `main`

---

## 2. Quy ước thông điệp Commit (Conventional Commits)

Chúng tôi sử dụng chuẩn Conventional Commits với cấu trúc:
`<loại>(<phạm-vi>): <mô-tả-ngắn-gọn>`

### Các loại hợp lệ:
- `feat`: Thêm chức năng người dùng mới
- `fix`: Sửa lỗi phát sinh
- `refactor`: Thay đổi code không đổi tính năng bên ngoài
- `style`: Định dạng code, chuẩn hóa UI tokens
- `docs`: Sửa đổi tài liệu
- `chore`: Thay đổi quy trình build, package config, hoặc CI

*Ví dụ:* `feat(auth): add remember-me persistence and token cookie`

---

## 3. Môi trường phát triển cục bộ (Local Workflow)

Trước khi mở PR, hãy đảm bảo các bước kiểm tra sau đã hoàn tất và vượt qua 100%:

```bash
# 1. Cài đặt dependencies (sử dụng pnpm)
pnpm install

# 2. Kiểm tra tuân thủ Design Standards & Tokens
pnpm run check:standards

# 3. Kiểm tra tính tương thích TypeScript toàn monorepo
pnpm run check-types

# 4. Chạy môi trường dev
pnpm run dev:web
```

---

## 4. Quy trình Pull Request (PR Workflow)

1. Tách nhánh từ `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/<ten-tinh-nang>
   ```
2. Thực hiện thay đổi, tuân thủ nguyên tắc:
   - Sử dụng design token từ Tailwind config, không hardcode màu primitive (`text-red-500`, `bg-blue-600`...).
   - Sử dụng icon từ `lucide-react`, không viết thẻ `<svg>` inline trực tiếp trừ khi là brand logo được cấp phép.
3. Chạy `pnpm run check:standards` và `pnpm run check-types` cục bộ.
4. Mở PR vào nhánh `develop` (hoặc `main` nếu là bản release vX.X.X):
   - PR sẽ tự động áp dụng template và gắn reviewer/assignee.
   - Luôn đính kèm `Closes #<issue_id>` để tự động link và đóng issue tương ứng khi merge.
   - Chờ toàn bộ checks trong CI pipeline vượt qua (`CI Gate` xanh) trước khi merge.
