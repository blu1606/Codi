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

Next.js 15 (App Router) · TypeScript · PostgreSQL 16 · Kysely · Better Auth ·
Tailwind v4 + shadcn/ui · next-intl (vi/en) · Docker · Vercel + Render

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

## Giấy phép

Đồ án môn học. Không dùng lại cho mục đích khác.
