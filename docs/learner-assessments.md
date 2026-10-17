# Quiz và Assignment — issue #99

S11c/S11d, flow L7/L8 nằm trong `/learn/[courseId]/[lessonId]`. Hợp đồng:
`docs/mockup/STATE-MACHINES.md` §10–11, quyết định D6/D8.

| State / transition | Hiện thực | Kiểm thử |
|---|---|---|
| Chưa làm → answering; lưu từng đáp án | `assessment-service.ts`, submission draft + assessment_answers | DB rollback + component |
| Cảnh báo chưa trả lời → quay lại / vẫn nộp | Dialog; server buộc confirmUnanswered khi còn câu trống | API + component + DB |
| Answering → graded, pass/fail, xem đáp án | Server chấm, lưu quiz_percent, score, is_passed; review chỉ trả sau nộp | Contract + DB + component |
| Graded → retake, không giới hạn | Attempt mới; attempt id chống request từ tab/lần làm cũ; xoá đáp án đang hiển thị | DB + component |
| Chưa nộp → draft, khôi phục nháp | assignment_draft trên submission; tự lưu và flush khi rời trang | DB + component |
| Uploading → thành công / lỗi / thử lại | XHR progress; đọc stream có giới hạn ở server; private R2 adapter | API size/attachment + component upload error + DB adapter |
| Draft → pending | Guard theo submission_format; cập nhật checklist, không cần điểm | Contract + DB + component |
| Pending → sửa nháp → pending / huỷ | Giữ bài đã nộp trong các cột gốc, bản sửa ở assignment_draft; nộp lại cập nhật cùng row | DB + component |
| Graded → xem điểm, nhận xét, ngày chấm | Chỉ đọc; server từ chối draft/upload/nộp lại/huỷ | Contract + DB + component |

## Lưu trữ và migration

Migration `20261017073000_quiz_assignment` chỉ thêm `assignment_draft` JSONB,
`quiz_percent` integer nullable và check 0–100. Các bài cũ chưa có quiz_percent vẫn dùng
score/maxScore; bài mới dùng phần trăm làm tròn theo §10, tránh sai lệch khi scale vào numeric(6,2).

Mọi writer lấy enrollment lock giống #98, rồi khoá row submission để không ghi đè điểm
giảng viên vừa chấm. Role đang hoạt động, enrollment, onboarding, publication, course/lesson,
assessment và prerequisite được kiểm tra ở server. Quiz single_choice/predict_output
được hỗ trợ theo mockup; bộ câu hỏi thiếu đáp án hoặc loại khác bị từ chối trước khi bắt đầu,
không chấm đoán. Điểm và đáp án đúng không lấy từ client. AI không chấm bài.

Tệp cần `R2_ASSIGNMENT_BUCKET` là **bucket private riêng**, tắt public access, khác bucket
avatar `R2_BUCKET`. Dùng cùng R2 credential đã có nếu credential có quyền trên bucket này.
Không dùng CDN/avatar URL cho bài nộp. Download qua endpoint có session/ownership gate,
attachment, octet-stream và nosniff. Tối đa min(max_file_size_mb, 20) MB; lỗi cấu hình/storage
không tạo tệp giả hoặc làm mất bài cũ. Không tự mở public access hay tạo bucket.
Nên đặt lifecycle dọn object không còn được tham chiếu sau các lần đổi tệp/huỷ nháp.

## Chạy kiểm tra

```sh
pnpm db:migrate
pnpm --filter web test:assessments:db
pnpm --filter web db:seed-assessments
pnpm test
pnpm run check-types
pnpm run check:standards
pnpm --filter web build
```

DB verification dùng transaction rollback: quyền, prerequisite, publication, diagnostic isolation,
quiz grading/review secrecy/retake/stale attempt, draft/upload/submit/pending replacement/cancel,
download riêng và D6/D8. Storage trong DB verification dùng adapter bộ nhớ; không chứng minh
R2 thật đã được cấu hình hay upload thành công.

Seed chỉ thêm khoá học **hidden** cho các tài khoản learner dev đã seed trước, không thay đổi
bài làm đã có. Các state tạo course `dev-assessment-{initial,answering,pass,fail,draft,pending,graded}`;
lệnh in route có lesson UUID. Không có scenario flag trong production.

Đã chạy ngày 17/10/2026: 576 test Vitest qua; typecheck web/db/ui/auth, token audit (0 vi phạm),
production build và DB verification rollback qua. Đã áp dụng migration additive lên DB dev
và seed đủ 7 state. R2 thật chưa kiểm thử: credential hiện tại trả AccessDenied khi ListBuckets;
R2_ASSIGNMENT_BUCKET chưa được cấu hình. Cần tạo bucket private riêng và cấp credential
quyền object read/write trên bucket đó, rồi thêm tên bucket vào `.env` và khởi động lại app.

## Browser walkthrough và ảnh parity còn cần hoàn tất

Phiên triển khai không có browser khả dụng qua Computer Use (`browsers: []`, `iab` unavailable).
Không coi DOM test/build là visual QA. PR giữ draft đến khi có ảnh mockup và implementation.

Mỗi dòng cần mockup + implementation light/dark desktop và mobile 375px:

| State | Route / thao tác | Ảnh |
|---|---|---|
| Quiz chưa làm | initial | Chưa chụp |
| Answering, lưu và khôi phục | answering; chọn đáp án rồi reload | Chưa chụp |
| Unanswered warning, cancel | answering; đến câu cuối → Nộp bài | Chưa chụp |
| Submitting | nộp quiz trong kết nối chậm | Chưa chụp |
| Pass + review | pass → Xem đáp án và giải thích | Chưa chụp |
| Fail + review | fail → Xem đáp án và giải thích | Chưa chụp |
| Retake | pass → Làm lại, kiểm tra checklist khoá | Chưa chụp |
| Assignment chưa nộp | initial | Chưa chụp |
| Uploading | chọn tệp hợp lệ, dùng private bucket | Chưa chụp |
| Upload lỗi + thử lại | chọn tệp >20MB hoặc ngắt mạng | Chưa chụp |
| Draft restored | draft | Chưa chụp |
| Pending | pending | Chưa chụp |
| Resubmit + cancel | pending → Nộp lại → sửa → huỷ / nộp | Chưa chụp |
| Graded + feedback | graded | Chưa chụp |
| API load/save error + retry | ngắt mạng, tải lại / thao tác | Chưa chụp |
