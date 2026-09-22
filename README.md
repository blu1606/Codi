# Codi

**Nền tảng học lập trình trực tuyến cá nhân hoá lộ trình bằng AI.**

Thay vì bắt mọi học viên đi theo một thứ tự bài học cố định, Codi dựa trên mục tiêu học tập,
bài kiểm tra đầu vào và kết quả học thực tế để sinh ra lộ trình riêng cho từng người.

Đồ án môn SWP391 — Team 4, Đại học FPT.

> **Trạng thái:** đang khởi tạo dự án. Phần thiết kế (use case, ERD, kiến trúc) đã hoàn thiện;
> code ứng dụng đang được xây dựng.

---

## AI nằm ở đâu

| Lớp | Nhiệm vụ | Kỹ thuật |
|---|---|---|
| **1. Bản đồ kiến thức** | Đọc nội dung khoá học, trích các khái niệm và quan hệ tiên quyết | LLM sinh knowledge graph |
| **2. Đánh giá năng lực** | Ước lượng xác suất học viên đã thành thạo từng khái niệm | Bayesian Knowledge Tracing |
| **3. Sắp lộ trình** | Xếp thứ tự bài học theo năng lực và mục tiêu, kèm lời giải thích | LLM, bị ràng buộc bởi graph |

Thứ tự tiên quyết là **ràng buộc cứng** — AI không được phá. Rule lo phần đúng/sai, AI lo phần
cân nhắc và giải thích. Cách chia này cũng tránh được bài toán cold start: lớp 1 và 3 không cần
dữ liệu lịch sử nên chạy được ngay từ khoá học đầu tiên.

---

## Công nghệ

Next.js (App Router) · TypeScript · PostgreSQL 16 (Supabase, dev) · Drizzle ORM · Better Auth ·
Tailwind v4 + shadcn/ui · Vercel · Docker (production, kế hoạch sau)

Lý do chọn và các quyết định kỹ thuật: [`docs/tech-stack.md`](./docs/tech-stack.md)
Hệ thống thiết kế (màu, font, accessibility): [`docs/design-guidelines.md`](./docs/design-guidelines.md)

---

## Lộ trình

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Xác thực người dùng | Đang làm |
| 2 | Khoá học và nội dung | Kế hoạch |
| 3 | Thanh toán | Kế hoạch |
| 4 | Cá nhân hoá lộ trình bằng AI | Kế hoạch |

Công việc được theo dõi trên [Codi — Product Board](https://github.com/users/blu1606/projects/1),
mỗi phase một issue.

---

## Cấu trúc Monorepo & Khởi chạy

Dự án được tổ chức theo mô hình TypeScript Monorepo quản lý bởi `pnpm`:

- `apps/web`: Ứng dụng Next.js (App Router, Better-Auth, Tailwind CSS v4, AI SDK, v.v.)
- `packages/auth`: Cấu hình và logic xác thực (Better-Auth)
- `packages/db`: Drizzle ORM kết nối PostgreSQL
- `packages/ui`: Thư viện component giao diện chia sẻ (shadcn/ui primitives)
- `packages/config`: Các cấu hình dùng chung (TypeScript, ESLint)

### Cài đặt & Chạy ứng dụng

1. **Cài đặt dependencies**:
   ```bash
   pnpm install
   ```

2. **Cấu hình môi trường**:
   Sao chép hoặc chỉnh sửa file `apps/web/.env` với các kết nối cần thiết (Database URL, Google OAuth, Resend, Cloudflare R2, v.v.).

3. **Đồng bộ cơ sở dữ liệu**:
   ```bash
   pnpm run db:push
   ```

4. **Chạy server phát triển**:
   ```bash
   pnpm run dev
   ```
   Ứng dụng web sẽ chạy tại [http://localhost:3001](http://localhost:3001).

---

## Giấy phép

Đồ án môn học. Không dùng lại cho mục đích khác.
