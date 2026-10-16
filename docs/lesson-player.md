# Issue #98 — trang học bài, checklist và hoàn thành

Nhánh: `feat/98-lesson-player`, PR riêng vào `develop`. Phụ thuộc #95 → #96 → #97; chưa tự merge các PR trước.

## Mở để kiểm tra và chụp ảnh

Chạy `pnpm --filter web db:seed-lesson-player` để lấy URL bài học của DB local (dòng `locked:` dành cho bài khóa), sau đó chạy `pnpm dev:web`, đăng nhập bằng tài khoản **học viên dev đã seed**. Các khóa dưới đây có nhãn “dữ liệu dev”, tách khỏi khóa và tiến độ hiện có. Không cần reset onboarding.

| Trạng thái | URL trên máy |
|---|---|
| Bài đọc, chưa học | `/learn/dev-player-reading/<lessonId từ seed>` |
| Video, tự lưu và khôi phục vị trí | `/learn/dev-player-video/<lessonId từ seed>` |
| PDF ba trang | `/learn/dev-player-pdf/<lessonId từ seed>` |
| Tài liệu lỗi, thử lại, vẫn đọc tóm tắt được | `/learn/dev-player-error/<lessonId từ seed>` |
| Checklist: đã học, quiz chưa đạt, assignment chờ chấm | `/learn/dev-player-checklist/<lessonId từ seed>` |
| Checklist code: lần nộp gần nhất chưa đạt | `/learn/dev-player-code/<lessonId từ seed>` |
| Vào URL bài đang khóa | `/learn/dev-player-reading/<lessonId từ seed>` |
| Đã hoàn thành, thông báo cập nhật và bài tiếp theo | `/learn/dev-player-completed/<lessonId từ seed>` |
| Hoàn thành khóa, sao và modal đánh giá | `/learn/dev-player-complete/<lessonId từ seed>` |

1. **Reading:** chụp trước khi bấm “Đánh dấu đã học xong”; nút hoàn thành bị khóa và ghi “Còn thiếu: Học nội dung”. Bấm đánh dấu → chụp nút hoàn thành được mở. Bấm hoàn thành → hiện bài tiếp theo, trang không tự chuyển.
2. **Video:** bấm phát, dừng ở khoảng giây 2; tải lại phải khôi phục gần vị trí đó. Xem hết tự đánh dấu đã học. Video CC0 mẫu của MDN dài khoảng 5 giây, chỉ dùng kiểm tra player.
3. **PDF:** chờ tài liệu tải; xem lần lượt đủ 3 trang để tự đánh dấu học xong. Vị trí trang và danh sách trang đã xem lưu trên server. Có nút mở PDF riêng và bản văn bản của trang để đọc bằng công cụ hỗ trợ.
4. **Materials loading/error:** bật Network throttling trong DevTools rồi tải lại để chụp loading. Khóa `error` tham chiếu một file thực sự không tồn tại; “Thử lại” thực hiện tải lại, không giả thành công. Phần đọc dự phòng vẫn dùng được.
5. **Checklist:** quiz lần gần nhất chưa đạt vẫn khóa hoàn thành, mặc dù assignment đã nộp/chờ chấm. Trang code cần kết quả **nộp bài** đạt; “Chạy” không tính.
6. **Locked:** mở URL khóa trực tiếp → có lời giải thích và “Đến bài cần học trước”.
7. **Completed:** chụp trước khi ẩn thông báo cập nhật; bấm “Học tiếp” mới chuyển bài.
8. **Course complete/review:** chụp card chúc mừng → bấm một sao để mở form → chọn 1–5 sao, nhận xét không bắt buộc → lưu → “Sửa đánh giá” nạp lại đánh giá của mình. Xem nhận xét tại `/courses/dev-player-complete#reviews`.
9. Chụp mỗi trạng thái ở Light, Dark và Mobile 375px; mobile mở “Danh sách bài học” để kiểm tra sheet.

Các thao tác học/ẩn thông báo là dữ liệu thật và vẫn giữ sau F5. Seed chạy lại **không reset** tiến độ/đánh giá; không dùng khóa đã thao tác để chụp lại trạng thái “chưa học” nếu chưa có yêu cầu reset riêng.

## 📸 DÁN ẢNH KIỂM TRA TẠI ĐÂY

Kéo ảnh vào bảng tương ứng trong PR, thay các ô “Dán ảnh”. Chưa đánh dấu browser/visual QA hoàn thành.

| State | Mockup | Light | Dark | Mobile 375px |
|---|---|---|---|---|
| S11 bài đọc, checklist chưa đủ | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| S11 video + resume | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| S11 PDF + trang đã xem | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Materials loading | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Materials error + retry + bài đọc | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Checklist quiz chưa đạt / assignment chờ chấm | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Checklist code chưa đạt | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Bài khóa khi vào URL trực tiếp | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Đủ điều kiện hoàn thành | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| S11e đã hoàn thành + thay đổi + bài tiếp | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| S11f hoàn thành khóa + sao + gợi ý khóa | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| S14 tạo/sửa đánh giá | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Nhận xét công khai ở chi tiết khóa học | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |

Mockup chuẩn: `docs/mockup/index.html`, Alt+K → Học viên; `#/learn/:courseId/:lessonId`. L6/L9; S11, S11e, S11f, S14. Bản Claude được chia sẻ có thể khác phiên bản trong repo.

## Phạm vi và tích hợp

- API `GET/POST /api/learn/[courseId]/lessons/[lessonId]`: private/no-store, session owner, learner active, enrollment không suspended, bài/chương published, điều kiện tiên quyết theo #97; POST kiểm Origin và schema strict.
- `open`, `study`, `video`, `pdf-page`, `complete` đều lặp lại guard ở transaction. API không nhận “passed”, checklist, điểm số, enrollment hoặc user từ client.
- Study là xác nhận của người học, không phải bằng chứng BKT. Video hết/PDF đã xem đủ trang tự đánh dấu; nút đánh dấu thủ công vẫn có cho bài không phải code, như mockup. Không giả player/timer/latency.
- D6: quiz published, lần làm có attempt cao nhất phải graded/submitted và đạt ngưỡng; draft retake cũng chặn. D7: code chỉ tính lần `submit` gần nhất, bỏ qua `run`. Assignment cần bất kỳ lần đã nộp (pending/graded), không cần đạt điểm.
- Transaction hoàn thành giữ điểm và bài đã hoàn thành, ghi progress/enrollment/hoạt động, dùng hook BKT + path #97, phát thông báo một lần. Retry/duplicate không tạo thêm path hoặc notification. AI cập nhật chạy bằng durable job #97 sau commit, có fallback; không dùng AI để chấm.
- Đánh giá dùng lại API path #97, upsert theo enrollment; aggregate sao/số lượt từ review visible, danh sách công khai tối đa 50 nhận xét mới nhất. Không công khai email, enrollment hoặc bài nộp.
- #99 tiếp tục quiz/assignment/code trong player; #100/#101 tiếp tục AI và hỏi đáp. #98 đọc kết quả thật của các hoạt động đó để khóa hoàn thành, không tạo UI chấm/nộp giả trong lúc chờ module sau. Writer assessment phải lấy cùng enrollment lock trước khi thay đổi attempt để serialize với `completeLesson`.
- Migration `20261016114500_lesson_media_progress`: chỉ thêm `lesson_progress.media_progress` JSONB. Video vẫn ghi `last_position_seconds`; PDF/media giữ resume riêng theo material.
- PDF.js dùng assets theo version trong `public/pdfjs/` (được tạo trước `pnpm dev:web`/build, không commit bản sao dependency). PDF bên ngoài cần CORS và URL truy cập được; lỗi được hiển thị kèm bài đọc dự phòng.

## Lệnh kiểm tra

```sh
pnpm --filter web db:seed-lesson-player
pnpm --filter web test:lesson-player:db
pnpm test:coverage
pnpm run check:standards
pnpm run check-types
pnpm --filter web build
```

DB verification tạo fixture riêng trong transaction rồi rollback. Manual browser walkthrough và ảnh do người dùng thực hiện; không suy ra đã kiểm tra browser chỉ từ DOM tests/build/HTTP smoke.

## Sửa theo review PR #126

- Video dùng duration của material để clamp, không dùng thời lượng ước tính cả bài. Material chưa có duration vẫn lưu resume và nhận ended.
- POST video/PDF trả kết quả gọn, bỏ truy vấn assessment/path items; open/study/complete dựng view sau khi nhả enrollment lock. Guard dùng cùng logic prerequisite với layout.
- Focus dùng GET; gộp pause/ended; lỗi lưu nằm cạnh tài liệu, có thử lưu riêng. Gateway không JSON có thông báo tiếng Việt.
- Quiz xét phần trăm chính xác: 69,5% không đạt 70%.
- Review công khai dùng CourseReview và listPublicCourseReviews chung. Helper lưu/ẩn/hiện cập nhật rating/reviewCount trong transaction. Helper visibility là persistence nội bộ; caller phải kiểm quyền kiểm duyệt và xác nhận trước khi gọi.
- Media mẫu chuyển khỏi public sang dev-fixtures; route /dev/lesson-player chỉ chạy development và bị loại khỏi production tracing. PDF.js vẫn là dependency runtime.

### Xác minh sau sửa (17/10/2026)

- #126: 523 unit/DOM/API tests qua; typecheck web/db/ui, token audit và production build qua. Coverage hiện chỉ cấu hình cho module admin, không phải coverage toàn bộ lesson player.
- DB verification rollback qua, gồm video không có material duration dù lesson 600 giây, clamp theo material, quiz 69,5% không đạt 70%, PDF từng trang, guard, completion idempotent và ẩn/hiện review cập nhật aggregate.
- Một lần lưu media trong transaction kiểm thử DB dev: 745 ms. Đây không phải phép đo end-to-end trên browser.
- #124: chỉ đồng bộ review; 297 tests, typecheck web và token audit qua. File review mock không dùng đã bỏ.
- Phần review dùng chung có cùng ancestry (`fix/shared-course-reviews`). `merge-tree` giữa hai nhánh không còn conflict ở type, getter, component hoặc test review. Còn conflict độc lập ở `sign-in-form.tsx` và `sign-up-form.tsx` giữa onboarding #123 và commerce #124; chưa nhập auth của #124 vào #126 theo phạm vi đã chốt.
- Không tự merge PR hoặc bỏ draft; manual browser walkthrough và bảng screenshot vẫn cần hoàn tất như phần trên.
