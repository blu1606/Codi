# Issue #98 — trang học bài, checklist và hoàn thành

Nhánh: `feat/98-lesson-player`, PR riêng vào `develop`. Phụ thuộc #95 → #96 → #97; chưa tự merge các PR trước.

## Mở để kiểm tra và chụp ảnh

Chạy `pnpm dev:web`, đăng nhập bằng tài khoản **học viên dev đã seed**. Các khóa dưới đây có nhãn “dữ liệu dev”, tách khỏi khóa và tiến độ hiện có. Không cần reset onboarding.

| Trạng thái | URL trên máy |
|---|---|
| Bài đọc, chưa học | http://localhost:3001/learn/dev-player-reading/dd0f2515-4a74-405f-a03d-d463bca8e206 |
| Video, tự lưu và khôi phục vị trí | http://localhost:3001/learn/dev-player-video/d968a3d3-7eb9-496e-a287-384ded1ed153 |
| PDF ba trang | http://localhost:3001/learn/dev-player-pdf/dfd5454b-2311-4894-aa18-0fee2cfc14ca |
| Tài liệu lỗi, thử lại, vẫn đọc tóm tắt được | http://localhost:3001/learn/dev-player-error/0f263d04-6eac-4763-a3ba-55fbe3875b4c |
| Checklist: đã học, quiz chưa đạt, assignment chờ chấm | http://localhost:3001/learn/dev-player-checklist/2aa7e135-63a1-462e-af5f-16272fb162af |
| Checklist code: lần nộp gần nhất chưa đạt | http://localhost:3001/learn/dev-player-code/f259a5ff-389b-49dd-a811-d4612025a8cc |
| Vào URL bài đang khóa | http://localhost:3001/learn/dev-player-reading/28bafadd-2b71-405d-a77a-113e8b17b07f |
| Đã hoàn thành, thông báo cập nhật và bài tiếp theo | http://localhost:3001/learn/dev-player-completed/7a7ec284-b17a-4ceb-a43b-da7afb73dd6e |
| Hoàn thành khóa, sao và modal đánh giá | http://localhost:3001/learn/dev-player-complete/2f8253cc-ec64-466b-a08e-48d7c476c9f4 |

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
