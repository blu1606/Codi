# Course onboarding — issue #96

S08, S08b, S09a–c · Flow L4 · `STATE-MACHINES.md` §6–8 · D11/D16.

## Entry point and data

`/learn/[courseId]/onboarding` requires a signed-in user with an active learner grant. The JSON API
`/api/learn/[courseId]/onboarding` repeats the role guard and scopes every enrollment lookup to the session owner.
Suspended enrollments are rejected; an already owned hidden course remains accessible. Cookie-authenticated
writes require the same Origin. The browser never receives correctness flags or explanations before submission.

Migration `20261015142500_course_onboarding` adds the mockup's goal values to the existing enum, plus persisted
draft/step/editing, self-assessed level and diagnostic cursor fields. Existing enum values and records remain valid.
No existing tables, columns or values are removed. Apply with the project's `db:migrate` command.

Each mutation locks the owner's enrollment row inside a transaction. Answers belong to a draft assessment
submission; server checks the active attempt, current question and option ownership. Back/next and choices are
saved immediately; a reload offers continuation from the saved question. A retake creates a new attempt,
retaining earlier submissions. Duplicate submission returns the result without applying evidence twice.

Diagnostic correctness is calculated by code, never an LLM. BKT uses each accepted concept's configured
initial/learn/guess/slip parameters and its existing posterior. Known correct/incorrect answers update the
posterior; “Tôi chưa biết” is stored separately and supplies no correctness likelihood evidence. With no prior
evidence its UI level stays 0. Diagnostic internal points satisfy submission storage constraints but never
count toward a lesson grade. Goal edits and late diagnostics do not write lesson completion or quiz records.

## Handoff to #97

Choosing the default fork creates a real system path and ordered published lesson rows. Postponing a diagnostic
retake preserves the active AI path, including its items and skippable flags (D11). Otherwise it creates/reuses
a default path. A default path is an ordering; prerequisite enforcement belongs to the course-home/player modules.

The result's “Xem lộ trình của tôi” and saving an edited goal persist `student_enrollments.path_status = generating`.
This is the durable generation request for #97, which consumes the saved goal, latest graded diagnostic and
mastery vector, then updates the path/version/state. #96 does not claim to generate an AI path. The destination
`/learn/[courseId]`, generation execution/recovery and full course-home goal-edit entry are supplied by #97.
The onboarding ready view already has the confirmed goal-edit and late diagnostic entry actions.

## Development data and checks

Run from `apps/web` with the development `.env`:

```text
pnpm db:seed-onboarding
pnpm test:onboarding:db
```

The seed creates `dev-onboarding-typescript`, three published lessons, three accepted concepts and a published
diagnostic. It enrolls only the accounts from `SEED_ACCOUNT_TARGETS` or, when unset, accounts bearing both the
`+student@` email tag and `(Student)` name suffix of `seed-accounts.ts`. It does not reset existing progress.
The DB verification script creates isolated fixture rows inside a transaction and rolls them back after checking
ownership, goals, resume, answer scoping, grading, idempotency, retake, default paths, D11 and completed lessons.
These scripts refuse `NODE_ENV=production`. They are separate from the application API's real-data behavior.

Open http://localhost:3001/learn/dev-onboarding-typescript/onboarding with a seeded learner account.
Password sign-in preserves this onboarding return destination. Social sign-in and new-account return routing
retain their existing behavior.

## 📸 Dán ảnh kiểm tra tại đây — người dùng bổ sung

Ảnh và kiểm tra trình duyệt do người dùng thực hiện theo yêu cầu ngày 15/10/2026.
Tải ảnh trực tiếp lên PR; điền bảng cùng tên trong mô tả PR. Mục này đang chờ xác minh thủ công,
không chặn triển khai issue kế tiếp theo chỉ dẫn mới của người dùng.

Mockup: mở `docs/mockup/index.html`, Alt+K để chọn learner và kịch bản. UI thật: URL khoá dev ở trên.
Chọn giao diện sáng/tối bằng menu header; mở DevTools thiết lập chiều rộng 375px cho ảnh mobile.

| State cần chụp | Cách mở | Mockup | Light | Dark | Mobile 375px |
|---|---|---|---|---|---|
| Goal bước 1, chưa chọn/đã chọn | Enrollment chưa thiết lập; chọn mục tiêu | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Goal bước 2 | Tiếp tục → trình độ tự đánh giá | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Goal bước 3 | Tiếp tục → giờ/tuần; kiểm tra Quay lại | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Bỏ qua goal → start fork | Bỏ qua tại một bước | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Start fork + ghi chú mất cá nhân hoá | Sau bước 3; chụp hai lựa chọn | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Diagnostic intro | Tìm điểm bắt đầu của tôi | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Câu hỏi, đáp án thường, Tôi chưa biết | Bắt đầu; chụp từng lựa chọn | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Resume cùng câu và đáp án | Trả lời rồi tải lại trang | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Submitting | Câu cuối → Xem kết quả; làm chậm Network để chụp request thật | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Result + mastery, điểm mạnh/lỗ hổng | Nộp đủ các câu, gồm đúng/sai/chưa biết | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Không có bài diagnostic | Khoá dev khác không có diagnostic, chọn nhánh kiểm tra | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Loading/lỗi/thử lại | DevTools Network throttle/chặn API, rồi bỏ chặn và Tải lại | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Để sau giữ AI path, bài đã học | Sau khi có AI path từ #97, làm diagnostic muộn rồi Để sau | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Chỉnh mục tiêu + xác nhận | Ready view → Chỉnh mục tiêu; lưu ba bước | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |
| Yêu cầu sinh lộ trình đã lưu | Result → Xem lộ trình của tôi; kết nối full flow ở #97 | Dán ảnh | Dán ảnh | Dán ảnh | Dán ảnh |

- [ ] Đi luồng trong trình duyệt, Tab/Shift+Tab, focus, Escape và không cuộn ngang tại 375px.
- [ ] Đối chiếu mẫu Claude do người dùng cung cấp.
- [ ] Dán đủ ảnh vào PR; chỉ đánh dấu những trạng thái đã kiểm tra thật.
