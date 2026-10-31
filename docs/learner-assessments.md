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
| Uploading → thành công / lỗi / thử lại | Metadata → presigned PUT trực tiếp R2 → HEAD + xác nhận; XHR progress | API + component PUT 8MB + DB adapter; R2 thật còn chờ bucket |
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
Upload không đưa tệp qua Vercel Function. `POST .../file` nhận JSON metadata tối đa
12.000 byte: `{type:"prepare",name,size}` trả URL PUT hạn 300 giây và ticket HMAC;
`{type:"confirm",token}` kiểm tra owner/course/lesson/assessment, phiên bản bài làm,
HEAD size thực tế (đúng size đã ký, không vượt giới hạn). Ticket chỉ chứa hash phiên bản,
không nhét nội dung ghi chú vào URL hay ticket. PUT chỉ ghi `assignment-uploads/<uuid>`.
Xác nhận dùng CopyObject với ETag/If-Match sang `assignments/<uuid>` khác, tránh URL PUT
còn hạn sửa tệp đã nộp. File bytes chỉ đi browser ↔ R2, copy chạy trong R2; server app
không buffer tệp upload. SDK dùng checksum `WHEN_REQUIRED`, tránh ký checksum của body
rỗng cho PUT từ browser. Thiếu bucket/credential trả 503 có thông báo cấu hình rõ.

Sau commit, xoá key cũ không còn được bài nộp/nháp tham chiếu. Huỷ nộp lại/gỡ tệp nháp
giữ nguyên tệp trong bài đã nộp cho tới khi thực sự nộp lại. Copy/transaction thất bại
dọn key đích mới. Lỗi xoá được ghi log không kèm key hay nội dung học viên, và cần sweep
định kỳ để thử lại; không chỉ dựa vào best effort trong request.

Trước khi dùng bucket thật, quản trị viên cần cấu hình:

- Bucket private riêng, tắt cả public R2.dev/custom domain; không dùng bucket avatar.
- CORS cho chính xác origin app, method PUT và header Content-Type. Không cần cookie R2.
- Lifecycle **chỉ prefix `assignment-uploads/`**, expire sau 1 ngày; không expire toàn bucket
  hoặc prefix `assignments/` vì sẽ xoá cả bài nộp đang được tham chiếu.
- Tài liệu bài học dùng cùng private bucket nhưng có prefix riêng `lesson-material-uploads/`
  (tệp tạm chờ xác nhận) và `lesson-materials/` (tệp đang được tham chiếu). Có thể expire
  riêng `lesson-material-uploads/` sau 1 ngày; tuyệt đối không áp dụng lifecycle lên
  `lesson-materials/`. CORS upload tối đa 200 MB vẫn chỉ cần PUT và Content-Type.
- Lịch chạy `pnpm --filter web storage:assignments:sweep --apply` hằng ngày trong môi trường
  tin cậy có quyền DB read và bucket list/delete. Bỏ `--apply` để dry run. Script chỉ xoá
  object quá 24h không có reference ở cả `file_url` và `assignment_draft.fileKey`, kiểm tra lại
  DB trước khi xoá; không log key, signed URL hay dữ liệu cá nhân. Không expose script qua API.
- `pnpm --filter web test:assessments:r2` đọc CORS/lifecycle, thử PUT 8MB/20MB, HEAD,
  copy có ETag, download đúng bytes và PUT lại không đổi file đích, rồi dọn tệp thử.
  Credential smoke test cần thêm quyền đọc cấu hình bucket; credential runtime chỉ cần
  object read/write/delete. Script không tự tạo bucket hay thay CORS/lifecycle/public access.

Chưa có bucket private trong phiên sửa review ngày 17/10/2026 (người dùng xác nhận).
R2 thật và cấu hình/lịch cleanup production **chưa được xác minh**; đây vẫn là điều kiện
trước merge. Mock adapter/DOM test không thay thế test R2 hoặc browser CORS.

## Sửa review #127

`quizTransition` và `assignmentTransition` là hàm thuần trong contract; service gọi chúng
trước mọi ghi DB. Unit test bao phủ open/answer/submit/retake, stale submissionId,
non-draft/double-submit, confirmUnanswered, lưu nháp/nộp mới/thay pending/huỷ/gỡ tệp,
thiếu nháp/thiếu bài làm/link sai và mọi learner mutation khi graded (D8).

Execute project trực tiếp từ context đã kiểm tra và các row RETURNING, không dựng context
lộ trình lần hai trong enrollment lock. Quiz answer dùng upsert; quiz submit ghi answer
theo batch. Client vẫn xếp hàng request; chọn radio/navigation không khoá trong lúc lưu
answer. Toast và kết quả lần trước dùng quizPercent, fallback score chỉ cho dữ liệu cũ.
Pagehide flush nháp bằng request keepalive, ngoài cleanup khi chuyển trang; việc lưu lúc
browser/process bị đóng đột ngột vẫn là best effort, đặc biệt khi đang có request trong hàng đợi.

Benchmark DB dev (rollback, quiz 10 câu, không phải latency HTTP production), 17/10/2026:
10 lần lưu đáp án lần lượt 932, 934, 929, 935, 966, 1086, 1033, 1038, 992, 1010 ms.
Mỗi lần chỉ dựng context một lần. DB dev vẫn có latency gần 1 giây; cần đo lại ở deployment
cùng vùng DB trước khi kết luận performance production.

GET trả `unavailableReason` cho quiz có bộ câu không hỗ trợ và UI không hiện nút mở quiz
sẽ lỗi 409. D6 vẫn giữ nguyên: quiz chưa hợp lệ cần giảng viên sửa trước khi hoàn thành bài.
Authoring/publishing chưa có implementation trong nhánh này; khi triển khai phải dùng
`requireQuizQuestions` để chỉ publish single_choice/predict_output hợp lệ. Không tự đổi enum DB
hoặc nới D6 cho multiple_choice/fill_in_blank. Cần chốt ràng buộc này với phần authoring.

`timeLimitMinutes` và `shuffleQuestions` chưa được áp dụng trong learner quiz theo mockup
§10: không có timer, thứ tự ổn định theo position. Authoring không nên trình bày hai cấu hình
này như tính năng đã hoạt động cho tới PR triển khai riêng.

UC-29: nộp lại cập nhật cùng row và `submittedAt`. Command chấm bài phải gửi kèm
`submittedAt` đã xem, khoá submission theo thứ tự hiện tại và từ chối 409 nếu timestamp đổi,
để tránh chấm nội dung giảng viên chưa xem. Đây là hợp đồng cho PR chấm bài tiếp theo.
#128 cần đồng bộ lại sau commit sửa này vì sửa nhiều file assessment chung.

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

Lần triển khai ban đầu ngày 17/10/2026: 576 test Vitest qua; typecheck web/db/ui/auth, token audit (0 vi phạm),
production build và DB verification rollback qua. Lần sửa review: **642 test / 42 file** qua,
typecheck web/db/auth/ui và production build qua, token audit 0 vi phạm. DB verification bổ sung
HEAD size/scope/ticket replay, upload 8MB, gỡ tệp/huỷ nháp và cleanup đã qua, rollback toàn bộ.
Đã áp dụng migration additive lên DB dev
và seed đủ 7 state. R2 thật chưa kiểm thử: credential hiện tại trả AccessDenied khi ListBuckets;
R2_ASSIGNMENT_BUCKET chưa được cấu hình. Cần tạo bucket private riêng và cấp credential
quyền object read/write trên bucket đó, rồi thêm tên bucket vào `.env` và khởi động lại app.

## Browser walkthrough và ảnh parity còn cần hoàn tất

Phiên triển khai và phiên sửa review không có browser khả dụng qua Computer Use (`browsers: []`, `iab` unavailable).
Không coi DOM test/build là visual QA. Ảnh mockup và implementation từng state vẫn cần bổ sung trước merge.

Mỗi dòng cần mockup + implementation light/dark desktop và mobile 375px:

| State | Route / thao tác | Mockup | Implementation light/dark | Mobile 375px light/dark |
|---|---|---|---|---|
| Quiz chưa làm | initial | Chưa chụp | Chưa chụp | Chưa chụp |
| Answering, lưu và khôi phục | answering; chọn đáp án rồi reload | Chưa chụp | Chưa chụp | Chưa chụp |
| Unanswered warning, cancel | answering; đến câu cuối → Nộp bài | Chưa chụp | Chưa chụp | Chưa chụp |
| Submitting | nộp quiz trong kết nối chậm | Chưa chụp | Chưa chụp | Chưa chụp |
| Pass + review | pass → Xem đáp án và giải thích | Chưa chụp | Chưa chụp | Chưa chụp |
| Fail + review | fail → Xem đáp án và giải thích | Chưa chụp | Chưa chụp | Chưa chụp |
| Retake | pass → Làm lại, kiểm tra checklist khoá | Chưa chụp | Chưa chụp | Chưa chụp |
| Assignment chưa nộp | initial | Chưa chụp | Chưa chụp | Chưa chụp |
| Uploading | chọn tệp hợp lệ, dùng private bucket | Chưa chụp | Chưa chụp | Chưa chụp |
| Upload lỗi + thử lại | chọn tệp >20MB hoặc ngắt mạng | Chưa chụp | Chưa chụp | Chưa chụp |
| Draft restored | draft | Chưa chụp | Chưa chụp | Chưa chụp |
| Pending | pending | Chưa chụp | Chưa chụp | Chưa chụp |
| Resubmit + cancel | pending → Nộp lại → sửa → huỷ / nộp | Chưa chụp | Chưa chụp | Chưa chụp |
| Graded + feedback | graded | Chưa chụp | Chưa chụp | Chưa chụp |
| Gỡ tệp | draft → gỡ, pending → gỡ → huỷ/nộp lại | Chưa chụp | Chưa chụp | Chưa chụp |
| Quiz không hỗ trợ | thông báo liên hệ giảng viên, không có CTA mở | Chưa chụp | Chưa chụp | Chưa chụp |
| API load/save error + retry | ngắt mạng, tải lại / thao tác | Chưa chụp | Chưa chụp | Chưa chụp |
