# Tối ưu hiệu năng: các hướng có bằng chứng

Ngày 2026-11-04. Dựa trên lượt đo sức chứa trên server dev (README, mục Hiệu năng) và lượt profile trên stack Docker
local cùng image (`8b2e82a`).

## Kết luận

Gần 40% CPU của app là chi phí cố định cho mỗi câu SQL (dựng câu bằng drizzle-orm 21%, thư viện `pg` và giao thức
khoảng 8%, ghi socket 10%), còn logic nghiệp vụ chỉ khoảng 2%. Database cũng tỉ lệ với số câu. Vì vậy sức chứa phụ
thuộc gần như trực tiếp vào số câu SQL cho mỗi request. Học viên sinh khoảng 86% số câu SQL của traffic đo (535 trên
623 câu cho mỗi 100 request).

Ở mức bão hoà (khoảng 115 req/s), app dùng khoảng 88% và DB khoảng 84% của một core, tức khoảng 1,7 trên 2 core của
VPS. Chạy thêm tiến trình app một mình chỉ giúp ít; phải giảm việc trên mỗi request trước.

## Số câu SQL mỗi request (đo bằng `log_statement = all`)

| Endpoint | Câu SQL |
|---|---:|
| `GET /api/courses` | 1 |
| `GET /api/courses/:slug` | 4 |
| `GET /api/auth/get-session` | 2 |
| `GET /api/learn/:courseId/path` | 18 |
| `GET /api/learn/:courseId/access/:lessonId` | 12 |
| `GET /api/learn/:courseId/lessons/:lessonId` | 29 |
| `POST /api/learn/:courseId/lessons/:lessonId (study)` | 43 |

Trong 29 câu của lượt đọc bài học:

- câu 1–2: tra phiên đăng nhập (mọi API cần đăng nhập đều có);
- câu 3–4, 6–7, 16–17: kiểm tra bị khoá và lấy vai trò, lặp 3 lần (`learningViewer`, rồi `requireLearner` trong hai
  lần gọi `context`);
- câu 8–11 và 18–21: ghi danh, khoá học, danh sách bài học kèm tiến độ, mức thành thạo, nạp 2 lần
  (`loadLearningLessonAccess` rồi `createLearningPathService.get`).

Danh sách bài học lấy mọi cột, kể cả nội dung bài (trung bình 2,6 KB, tối đa 17 KB): khoảng 57 KB không dùng tới cho
mỗi lần mở một bài của khoá 11 bài. Index đã đủ cho mọi truy vấn trên.

## Các hướng, theo hiệu quả ước tính

Ước tính giả định CPU tỉ lệ với số câu SQL; mỗi hướng cần đo lại bằng `perf/k6/capacity.js`.

| # | Thay đổi | Câu SQL giảm (trên 623 / 100 request) | File | Rủi ro |
|---|---|---:|---|---|
| 1 | Cache catalogue và chi tiết khoá học công khai trong bộ nhớ 30 giây | ≈ 112 (18%) | `src/server.ts` hoặc route của rebuild | Nội dung mới hiện chậm tối đa 30 giây |
| 2 | Kiểm tra quyền học viên 1 lần mỗi request, gộp 2 câu thành 1 | ≈ 80 (13%) | `learning-path-service.ts`, `lesson-player-service.ts`, `packages/auth/src/rbac.ts` | Thấp; có test RBAC |
| 3 | Bật cache phiên trong cookie của Better Auth (`session.cookieCache`, 60 giây) | ≈ 40 (6%) | `packages/auth/src/index.ts` | Đăng xuất ở thiết bị khác có hiệu lực chậm tối đa 60 giây; khoá tài khoản vẫn có hiệu lực ngay vì vẫn kiểm tra ở bước 2 |
| 4 | Dùng lại ngữ cảnh khoá học đã nạp khi đọc và lưu bài | ≈ 40 (6%) | `lesson-player-service.ts`, `learning-path-service.ts` | Trung bình; đụng logic lộ trình |
| 5 | Chỉ lấy các cột cần cho danh sách bài học | ít câu hơn không đổi, giảm dữ liệu | `learning-path-service.ts` | Thấp |
| 6 | Chạy 2 tiến trình app (Node cluster) sau khi làm 1–4 | dùng core thứ hai | `src/server.ts`, `deploy/compose.yml` | Rate limit và AI worker phải chạy đúng một bản |

Làm 1–4: khoảng 623 → 350 câu cho mỗi 100 request (giảm khoảng 44%), ước tính sức chứa từ 100 lên khoảng 150–180
req/s. Thêm 6 khi DB còn dư CPU.

Không đáng làm lúc này: thêm index (đã đủ), tăng pool kết nối (DB không phải chỗ chờ), biên dịch TypeScript trước thay
cho `tsx` lúc chạy (esbuild chỉ khoảng 1% CPU).

## Lưu ý về nguồn code

Các file ở hướng 2, 3, 4, 5 được lấy nguyên từ Codi và repo đồng bộ định kỳ với Codi `develop`. Sửa ở đây sẽ phải
mang theo mỗi lần đồng bộ (ghi vào `plans/261102-2319-codi-develop-sync/`), hoặc sửa ở Codi rồi đồng bộ về. Hướng 1
và 6 chỉ đụng code riêng của rebuild.

## Câu hỏi còn mở

- Sửa hướng 2–5 ở rebuild hay ở Codi?
- Nội dung catalogue chậm cập nhật 30 giây có chấp nhận được không?
