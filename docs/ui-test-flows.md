# Luồng test UI tự động (Playwright)

Danh mục ca test UI end-to-end cho `apps/web`, chia theo vai trò. Mỗi ca bám theo một luồng trong
[user-flows.md](user-flows.md) và hợp đồng hành vi trong [mockup/PRODUCT.md](mockup/PRODUCT.md) (§5 luồng, §6 trạng
thái màn hình, §7 quy tắc tương tác) và [mockup/STATE-MACHINES.md](mockup/STATE-MACHINES.md).

Tài liệu này chỉ định nghĩa **ca test và cách chạy**. Kết quả từng lần chạy nằm trong `plans/reports/ui-test-*.md`.

## 1. Môi trường

| Hạng mục | Giá trị |
|---|---|
| App | Suite tự chạy `next dev --port 3002` (cổng 3001 để dành cho `pnpm dev` hằng ngày), `BETTER_AUTH_URL=http://localhost:3002` |
| Trình duyệt | `@playwright/test` 1.63.0 (devDependency của `apps/web`), `channel: "chrome"` (Chrome đã cài; đổi bằng `PW_CHANNEL`) |
| DB | DB dev dùng chung (`DATABASE_URL` trong `apps/web/.env`). Điều phối khoảng ghi dữ liệu với các phiên khác; không chạy đồng thời seed hoặc test ghi cùng tài khoản |
| Tài khoản | `pnpm db:seed-accounts` tạo `<base>+student` (LEARNER, đã xác thực), `<base>+gv` (LECTURER), `<base>+admin` (ADMIN) từ `SEED_ACCOUNT_TARGETS` / `SEED_ACCOUNT_PASSWORD`. Script đọc từ `.env`, không in ra |
| Dữ liệu học | `db:seed-onboarding`, `db:seed-learning-path`, `db:seed-lesson-player`, `db:seed-assessments`, `db:seed-coding` (xem `apps/web/package.json`) |
| Tài khoản tạm | Ca đăng ký / quản trị tạo `<base>+uitest<tag><timestamp>`; OTP đọc từ bảng `verification` của DB dev (chỉ khi `E2E_ALLOW_DB=1`), không in ra |
| Thanh toán | Màn checkout cần `SEPAY_*` hợp lệ; chỉ `skip` khi server local do suite khởi động thiếu/sai cấu hình và hiển thị trạng thái không khả dụng. Server đã cấu hình hoặc server ngoài không khả dụng là FAIL. Không thanh toán thật, không giả webhook |

Quy tắc chung cho mọi ca:
- Ghi lại console error, request 4xx/5xx và nội dung badge "N Issues" của Next dev overlay. Overlay có lỗi tính là issue.
- Một ca FAIL phải tái hiện được 2 lần mới ghi nhận.
- Ca nào đổi trạng thái tài khoản seed (ban, đổi role) chỉ được chạy trên tài khoản tạm, hoặc phải hoàn tác.
- Route trong mockup mà `develop` chưa có ghi `NOT-IMPLEMENTED`; nhưng link hiển thị trên UI dẫn tới 404 là `FAIL` (dead link).
- Các trang chính chạy thêm ở viewport 390px.

## 2. Guest + xác thực + mua hàng (`UI-COM-*`)

Tự động: `guest-catalog.spec.ts` (01–12, 14, 60, 63), `auth.spec.ts` (20–27, 29, 32), `cart-checkout.spec.ts` (40–44, 52–55,
57, 58, 63), `admin-users.spec.ts` (13), `roles-guards.spec.ts` (56 trong UI-GRD-05). Chưa tự động: 28 (cần hộp thư), 30, 31, 45,
47–50, 61 (chưa có trên `develop`), 46 (chưa có dòng copy), 51 (cần thanh toán thật), 62 (tốn quota LLM).

| ID | Luồng | Bước | Kỳ vọng |
|---|---|---|---|
| UI-COM-01 | L1 | Guest mở `/courses` | Tiêu đề + thẻ khoá học |
| UI-COM-02 | L1 | Gõ "react" vào ô tìm | Typeahead có "Kết quả hàng đầu", "Xem tất cả kết quả" |
| UI-COM-03 | L1 | Lọc, đọc số lượng, xoá chip | "N khoá học", chip xoá được |
| UI-COM-04 | L1 | Đọc dropdown sắp xếp | Phù hợp nhất / Mới nhất / Đánh giá cao nhất / Học nhiều nhất |
| UI-COM-05 | L1 | Tìm từ vô nghĩa | Empty state "Đặt lại bộ lọc" + "Hỏi AI Codi gợi ý khóa học" |
| UI-COM-06 | L1 | Mở chi tiết, đọc syllabus | Nhãn loại bài (Video, Quiz…) |
| UI-COM-07 | L1 | Quét 3 khoá đầu | Badge "Học thử" |
| UI-COM-08 | Ownership §2 | Khoá trả phí, guest | "Mua ngay" + "Thêm vào giỏ" |
| UI-COM-09 | L2 | Guest bấm "Thêm vào giỏ" | Overlay đăng nhập trên cùng URL |
| UI-COM-10 | L2 | Sai mật khẩu trong overlay | Lỗi inline, overlay giữ nguyên |
| UI-COM-11 | L2 | Đăng nhập từ overlay | Về đúng trang, khoá đã vào giỏ, toast, badge tăng; dọn giỏ |
| UI-COM-12 | L2/L3 | Guest bấm "Mua ngay" | Gate, sau đăng nhập tới checkout |
| UI-COM-13 | L2 | Đăng nhập tài khoản bị vô hiệu | Thông báo "Tài khoản đã bị vô hiệu hoá" |
| UI-COM-14 | L3 | Guest mở `/cart` | Chuyển `/login?returnTo=/cart` |
| UI-COM-20 | A1 | Email sai, mật khẩu 3 ký tự | Lỗi inline / nút bị khoá |
| UI-COM-21 | A1 | Đăng ký tài khoản tạm | Màn OTP 6 ô, hiện email, nút sửa, đếm ngược gửi lại |
| UI-COM-22 | A1 | Nhập OTP sai | Lỗi tiếng Việt inline dưới ô, giữ giá trị |
| UI-COM-23 | A1 | Nhập 2 chữ số | Nút xác thực khoá tới đủ 6 số |
| UI-COM-24 | A1 | Bấm "Sửa" email | Quay lại sửa email |
| UI-COM-25 | A1 | Đọc nút gửi lại | Khoá trong lúc đếm ngược |
| UI-COM-26 | A2 | Quên mật khẩu, email lạ vs email có thật | Xác nhận trung tính + gợi ý "thư rác", không lộ email tồn tại |
| UI-COM-27 | A2 | Mở `/reset-password` không token | Trạng thái liên kết không hợp lệ |
| UI-COM-28 | A2 | Đặt lại thành công | Một CTA "Đăng nhập" (cần inbox — thủ công) |
| UI-COM-29 | A3 | `/settings` → "Chỉnh sửa" → Huỷ | Lưu/Huỷ chỉ hiện khi có thay đổi |
| UI-COM-30 | A3 | Tìm "Tài khoản liên kết" | Mục GitHub |
| UI-COM-31 | L14 | `/profile` | Tab "Hồ sơ năng lực" |
| UI-COM-32 | A3 | Menu → "Đăng xuất" | Header về trạng thái guest |
| UI-COM-40 | L3 | Learner mở `/cart` | 200, giỏ hàng hiển thị (hồi quy lỗi 404) |
| UI-COM-41 | L3 | Đọc giỏ | Dòng khoá học, nút xoá, ô voucher, "Thanh toán" |
| UI-COM-42 | L3 / SM §4 | Voucher sai, hết hạn, hợp lệ | Thông báo đúng nguyên văn, tổng tiền cập nhật đúng |
| UI-COM-43 | L3 | Xoá dòng, bấm "Hoàn tác" | Xoá ngay + toast hoàn tác |
| UI-COM-44 | L3 | Checkout giỏ 2 khoá | Tóm tắt đơn liệt kê đủ cả 2 khoá |
| UI-COM-45 | L3 / SM §5.3 | Trang thanh toán | Đếm ngược "Hết hạn sau mm:ss" dưới QR |
| UI-COM-46 | L3 / §7 | Trang thanh toán | Dòng copy: Ngân hàng, Số TK, Chủ TK, Số tiền, Nội dung |
| UI-COM-47 | L3 / SM §5.5 | "Tôi đã chuyển khoản" | Nút có cooldown + kết quả inline |
| UI-COM-48 | L3 / SM §5.4 | Tracker | Đã tạo đơn → Đang chờ thanh toán → Đã nhận tiền |
| UI-COM-49 | L3 | Ảnh QR lỗi | "Không tải được mã QR" + thông tin dạng chữ |
| UI-COM-50 | L3 / SM §5.6 | Hết hạn, thiếu tiền, chưa nhận | Trạng thái lỗi + mã CODI##### + kênh hỗ trợ |
| UI-COM-51 | §7 | Thanh toán thành công | Không tự chuyển trang; người dùng bấm "Bắt đầu học" |
| UI-COM-52 | L3 / §7 | "Huỷ giao dịch" | Hộp xác nhận, sau đó về giỏ với khoá được trả lại |
| UI-COM-53 | L3 | Giỏ khi có đơn đang chờ | Banner mã đơn + "Huỷ đơn này" |
| UI-COM-54 | L3 | "Mua ngay" khoá chưa sở hữu | Checkout chỉ khoá đó, giỏ không đổi |
| UI-COM-55 | L3 / SM §5.2 | Huỷ đơn chờ | Khoá quay lại giỏ |
| UI-COM-56 | Guard | Lecturer/admin mở `/cart` | Bị chặn hoặc chuyển hướng |
| UI-COM-57 | Header | So badge giỏ với giỏ | Bằng nhau |
| UI-COM-58 | Header / SM §22 | Chuông thông báo | Có số chưa đọc |
| UI-COM-60 | L13 | Guest mở `/ai` | Trang tải được |
| UI-COM-61 | L13 | Landing | 3 thẻ tác vụ, gợi ý cá nhân hoá, nhắc guest đăng nhập |
| UI-COM-62 | L13 | Gửi câu hỏi | Trạng thái suy nghĩ, câu trả lời có thẻ khoá học (tốn quota LLM) |
| UI-COM-63 | Mobile | Catalog, chi tiết, giỏ, checkout, `/ai`, `/login` ở 390px | Không tràn ngang, CTA dùng được |

## 3. Learner — học tập (`UI-LRN-*`)

Tự động: `learner-learning.spec.ts` (01, 02, 10–12, 14, 16, 25, 28, 29), `roles-guards.spec.ts` (26, 27 trong UI-GRD-02). Chưa tự
động: 03, 04, 17–20, 24 (chưa có trên `develop`); 05–09, 13, 15, 21–23 (ghi tiến độ không hoàn tác được nếu không có seed
reset theo lần chạy).

| ID | Luồng | Bước | Kỳ vọng |
|---|---|---|---|
| UI-LRN-01 | Đăng nhập | Learner đăng nhập | Về `/dashboard` → `/dashboard/learner` |
| UI-LRN-02 | L1 | Learner mở `/courses` | Danh sách khoá học |
| UI-LRN-03 | L10 | `/dashboard/learner` | Thẻ học tiếp, mục tiêu tuần, ô thống kê, danh sách khoá |
| UI-LRN-04 | L10 | Tiến độ: "Đang học / Đã hoàn thành" | Accordion theo khoá, điểm từng bài |
| UI-LRN-05 | L4 / SM §7 | `/learn/<course>/onboarding`, bước mục tiêu | Một quyết định mỗi màn, thanh tiến độ, "Bỏ qua" |
| UI-LRN-06 | L4 | Rẽ nhánh bắt đầu | 2 thẻ "Học từ bài 1" / "Tìm điểm bắt đầu của tôi" có mô tả hệ quả |
| UI-LRN-07 | L4 | Diagnostic: "Tôi chưa biết", rời đi rồi quay lại | "Câu x/n", bỏ qua tách khỏi sai, tiếp tục đúng câu |
| UI-LRN-08 | L4 | Kết quả + tạo lộ trình | Điểm mạnh/yếu, "Codi đang xếp lộ trình…", không spinner trống |
| UI-LRN-09 | L4 | AI tạo lộ trình lỗi | Thứ tự mặc định + banner "Lộ trình cá nhân hoá chưa sẵn sàng" + thử lại (cần trigger dev) |
| UI-LRN-10 | L5 / SM §8 | Lộ trình cá nhân | Nhóm theo chương, chip trạng thái, "Vì sao?", "Học tiếp" |
| UI-LRN-11 | L5/L6 | Mở thẳng URL bài bị khoá | Giải thích + "Đến bài cần học trước" |
| UI-LRN-12 | L6 / SM §9 | Bài chưa xong checklist | "Hoàn thành bài học" khoá, liệt kê mục còn thiếu |
| UI-LRN-13 | L6 | Hoàn thành bài | Thông báo cập nhật lộ trình, thẻ "Bài tiếp theo", không tự chuyển |
| UI-LRN-14 | L6b / SM §12 | Chạy bài code `dev-coding-practice` | "x/y bài kiểm thử đạt", tab lọc, mở rộng Input/Expected/Received |
| UI-LRN-15 | L6b | Nộp bài | Ghi nhận bài nộp, panel thành công với "Tiếp tục" |
| UI-LRN-16 | L6b | Lỗi runtime, timeout | Lỗi có số dòng; thông báo timeout rõ ràng |
| UI-LRN-17 | L6c / SM §13 | Panel "AI trợ lý" | Thread theo bài, chip chế độ, chip ngữ cảnh xoá được |
| UI-LRN-18 | L6c | AI lỗi / bị giới hạn | Thông báo inline, "Hỏi giảng viên" vẫn dùng được |
| UI-LRN-19 | L6d / SM §14.2 | "Hỏi giảng viên" | Tạo hội thoại riêng, trạng thái "Chờ giảng viên" |
| UI-LRN-20 | L6 / SM §14.1 | Panel "Hỏi đáp" | Badge "Giảng viên", empty state "Hãy là người đầu tiên đặt câu hỏi" |
| UI-LRN-21 | L7 / SM §10 | Nộp quiz còn câu trống | Cảnh báo "Còn n câu chưa trả lời", vòng điểm, review từng câu, "Làm lại" |
| UI-LRN-22 | L8 / SM §11 | Bài tập tự luận/upload | Nút nộp khoá tới khi có nội dung; "Đã nộp — chờ chấm"; banner điểm khi đã chấm |
| UI-LRN-23 | L9 / SM §15 | Đánh giá khoá đã học xong | Chọn sao trước, text tuỳ chọn, toast, "Sửa đánh giá" |
| UI-LRN-24 | L11 | Trang thống kê | Chọn kỳ, KPI, biểu đồ, "Xem chi tiết" |
| UI-LRN-25 | L12 / SM §18 | `/insights/knowledge-map`, chọn node | Đồ thị chỉ đọc, panel mức thành thạo + "Học bài này" |
| UI-LRN-26 | Guard | Learner mở `/dashboard/lecturer` | Chuyển về `/dashboard` |
| UI-LRN-27 | Guard | Learner mở `/dashboard/admin`, `/dashboard/admin/users` | Chuyển về `/dashboard` |
| UI-LRN-28 | Mobile | Lesson player + dashboard ở 390px | Dùng được; sheet "Danh sách bài học" |
| UI-LRN-29 | Sức khoẻ | Mọi trang learner | Không console error, overlay trống |

## 4. Lecturer + admin + phân quyền (`UI-GRD-*`, `UI-LEC-*`, `UI-ADM-*`)

Tự động: `roles-guards.spec.ts` (GRD-01–09; LEC-15 trong GRD-09), `lecturer.spec.ts` (LEC-01, 03, 04), `admin-users.spec.ts`
(ADM-01, 03, 10, 12–22). Chưa tự động vì route/tính năng chưa có trên `develop`: LEC-02, 05–14, ADM-02, 04–09, 11.

| ID | Luồng | Bước | Kỳ vọng |
|---|---|---|---|
| UI-GRD-01 | Guard | Ẩn danh mở `/dashboard*` | Chuyển `/login` |
| UI-GRD-02 | Guard | Learner mở route lecturer/admin | Chuyển `/dashboard` |
| UI-GRD-03 | Guard | Lecturer mở `/dashboard`, route admin | Chuyển `/dashboard/lecturer` |
| UI-GRD-04 | Guard | Admin mở `/dashboard`, `/dashboard/lecturer` | Chuyển `/dashboard/admin` |
| UI-GRD-05 | Guard / S41 | Lecturer/admin: link giỏ và `/cart` | Không có link giỏ; `/cart` không dùng được |
| UI-GRD-06 | Header S41 | Đọc link header theo role | Lecturer: Giảng dạy, Khoá học. Admin: Quản trị, Khoá học |
| UI-GRD-07 | Dead link | Crawl link nội bộ trên trang chủ staff | Không link nào ra 404 |
| UI-GRD-08 | Đăng xuất | Đăng xuất, mở lại route | Về `/login` |
| UI-GRD-09 | Mobile | Shell ở 390px | Không tràn; drawer có link theo role |
| UI-LEC-01 | S20 | Lecturer đăng nhập | Về `/dashboard/lecturer` |
| UI-LEC-02 | T1 / S20 | Trang chủ lecturer | Ô đếm, danh sách khoá, "Tạo khóa học" |
| UI-LEC-03 | Phân tách role | Trang chủ lecturer | Không có widget dành cho learner |
| UI-LEC-04 | S20 | Mục menu bị disable | Không phải link chết |
| UI-LEC-05 | T1 | `/dashboard/lecturer/new`, `/courses` | S21, S22 |
| UI-LEC-06 | T1 | Editor, quiz builder, coding builder | S22, S23, S23b |
| UI-LEC-07 | T2 / SM §18 | Review knowledge map | S24 |
| UI-LEC-08 | T3 / SM §16–17 | Gửi xét duyệt xuất bản | S25, checklist readiness |
| UI-LEC-09 | T4 / SM §20 | Chấm bài | S26 |
| UI-LEC-10 | T4 / SM §14 | Trả lời hỏi đáp | S27 |
| UI-LEC-11 | T4 / SM §15 | Trả lời đánh giá | S28 |
| UI-LEC-12 | T4 | Tiến độ học viên | S29 |
| UI-LEC-13 | Insights | `/dashboard/lecturer/insights` | S29b |
| UI-LEC-14 | T4 | Snippets phản hồi | `/dashboard/lecturer/snippets` |
| UI-LEC-15 | Mobile | Lecturer ở 390px | Không tràn |
| UI-ADM-01 | S30 | Admin đăng nhập | Về `/dashboard/admin` |
| UI-ADM-02 | S30 | Trang chủ admin | Ô "Cần xử lý" + link hàng đợi |
| UI-ADM-03 | S30 | Mục menu bị disable | Không phải link chết |
| UI-ADM-04 | D1 / SM §17 | `/dashboard/admin/publication` | S32 |
| UI-ADM-05 | D1 / SM §16 | `/dashboard/admin/courses` | S33 |
| UI-ADM-06 | D1 / SM §5 | `/dashboard/admin/orders` | S34 |
| UI-ADM-07 | D1 / SM §4 | `/dashboard/admin/vouchers` | S35 |
| UI-ADM-08 | D1 | `/dashboard/admin/insights`, `/finance` | S36, S37 |
| UI-ADM-09 | D1 | Xem trước như learner | S32b |
| UI-ADM-10 | S31 | Bảng người dùng | Cột, dòng, nhãn "tài khoản của bạn" |
| UI-ADM-11 | D1 / S31 | Tìm kiếm, đếm trạng thái, chip role | Có và lọc đúng |
| UI-ADM-12 | D1 / SM §21 | Hộp vô hiệu hoá | Số ảnh hưởng, ô "Tôi hiểu tác động", lý do bắt buộc |
| UI-ADM-13 | SM §21 | Lý do để trống | Bị từ chối |
| UI-ADM-14 | SM §21 | Sau khi vô hiệu | Session bị thu hồi; đăng nhập báo "vô hiệu hoá" |
| UI-ADM-15 | SM §21 | Kích hoạt lại | Đăng nhập lại được |
| UI-ADM-16 | §7 | Huỷ hộp vô hiệu | Tài khoản vẫn hoạt động |
| UI-ADM-17 | SM §21 / §7 | Đổi role | Hộp xác nhận trước khi lưu |
| UI-ADM-18 | SM §21 | Sau khi đổi role | Có hiệu lực ở lần tải sau |
| UI-ADM-19 | §7 | Chọn role nhưng chưa lưu | Không lưu; "Lưu" khoá khi không đổi |
| UI-ADM-20 | SM §21 | Dòng của chính mình | Không có nút khoá |
| UI-ADM-21 | Mobile | Trang người dùng ở 390px | Không tràn |
| UI-ADM-22 | Sức khoẻ | Tải trang người dùng | Không lỗi, overlay trống |

## 5. Chạy test

Suite nằm trong repo: `apps/web/e2e/` + `apps/web/playwright.config.ts`. Spec dùng hậu tố `*.spec.ts`, nên Vitest
(`apps/web/src/**/*.test.ts`) không nhặt nhầm.

```bash
pnpm test:e2e                                   # từ gốc repo: setup + desktop + mobile-390
E2E_ALLOW_DB=1 pnpm test:e2e                    # thêm các ca cần tài khoản tạm (đọc OTP từ DB dev)
pnpm --filter web exec playwright test cart-checkout -g "UI-COM-4"   # một file / lọc theo ID
pnpm --filter web exec playwright show-report   # mở báo cáo HTML (apps/web/playwright-report/)
```

PowerShell:

```powershell
$env:E2E_ALLOW_DB = '1'
pnpm test:e2e
Remove-Item Env:E2E_ALLOW_DB
```

Kiểm tra collection mà không khởi động app, đăng nhập hoặc ghi DB:

```bash
pnpm --filter web exec playwright test --list --reporter=list
```

**Không có chế độ read-only chỉ bằng cách bỏ `E2E_ALLOW_DB`.** Setup vẫn tạo session; các ca OTP vẫn đăng ký
tài khoản/gửi email; giỏ hàng, đơn hàng và nháp code vẫn có thể thay đổi. Cờ này chỉ mở các ca đọc OTP trực tiếp
từ DB để xác thực tài khoản tạm. Xác nhận target và điều phối các tác dụng phụ trước khi chạy suite.

| Biến | Ý nghĩa |
|---|---|
| `SEED_ACCOUNT_TARGETS`, `SEED_ACCOUNT_PASSWORD` | Bắt buộc. Đọc từ `apps/web/.env`; tài khoản là alias `+student` / `+gv` / `+admin` của mục đầu tiên |
| `E2E_ALLOW_DB=1` | Cho phép tạo tài khoản tạm và đọc OTP từ bảng `verification` (`DATABASE_URL`). Không đặt thì các ca đó `skip` |
| `E2E_BASE_URL` | Mặc định `http://localhost:3002`. Đặt khác thì suite không tự khởi động server |
| `PW_CHANNEL` | Kênh trình duyệt, mặc định `chrome` (bundled browser không được cài) |
| `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER` | Cần để mở màn thanh toán. Khi endpoint trả 503 do thiếu cấu hình, các ca cần màn này ghi rõ lý do không chạy được. Không thực hiện chuyển khoản hay giả webhook |

Cách chạy:
- `webServer` khởi động `next dev --port 3002` (kèm `BETTER_AUTH_URL`) rồi tự tắt khi xong; nếu cổng 3002 đã có server thì
  dừng báo lỗi, không tự dùng lại server có thể trỏ DB/cấu hình khác. Cổng 3001 không bị đụng tới.
- Project `setup` (`auth.setup.ts`) đăng nhập 3 tài khoản seed và lưu storage state vào `apps/web/e2e/.auth/` (gitignore).
- `workers: 1`, chạy tuần tự vì DB dùng chung. Không retry ở máy cá nhân.
- Project `mobile-390` chỉ chạy test gắn tag `@mobile` và kiểm tra không tràn ngang.
- Fixture `health` (`e2e/fixtures.ts`) đánh fail mọi test có console error, page error hoặc response cùng origin 4xx/5xx
  ngoài danh sách nhiễu đã ghi chú (lỗi hydration đã biết được kiểm riêng ở UI-LRN-29 / UI-ADM-22). Các phản hồi lỗi
  chủ đích được giới hạn đúng page, method, path, status và số lần trong thao tác; mặc định một lần. Riêng guard GET giỏ
  cho phép tối đa hai lần do effect mount chạy lại trong dev StrictMode (đã đo thực tế); vẫn lưu trong attachment `browser-health`.
  Voucher hợp lệ phải khớp phép tính WELCOME20 (20%, tối thiểu 500000 VND, không trần), không chỉ đổi chữ tổng tiền.
- Dọn dẹp: test chỉ xoá đúng khoá học mình thêm vào giỏ, huỷ đơn mình tạo, hoàn tác khoá/đổi role trên tài khoản tạm. Không bao
  giờ khoá hoặc hạ quyền tài khoản seed. Checkout từ giỏ chạy trên tài khoản tạm vì đơn từ giỏ lấy hết dòng trong giỏ.
- Alias `+uitest…` vẫn được giữ trong DB sau lần chạy; suite không xoá tài khoản. Các ca coding xác nhận phản hồi lưu
  nháp từ server khi nhập và khi khôi phục code ban đầu, thay vì chờ toàn trang hết request.
- Ảnh VietQR bị chặn và trace tắt để báo cáo không chứa số tài khoản nhận tiền.
- Ca lệch spec được viết theo spec và để FAIL thật (không `skip`, không `test.fail`); danh sách nằm trong báo cáo lần chạy.
- UI-COM-12/44/52/54 cần màn thanh toán: thiếu điều kiện chạy thì ghi `skip`, không tính các bước chưa kiểm tra là pass.
  UI-COM-52 phải xác nhận huỷ qua UI, trở về `/cart` và thấy khoá học được trả lại; cleanup API không thay thế bước này.
- Có 74 ca hành vi và 3 ca setup. Kết quả JSON ở `apps/web/test-results/results.json`, HTML ở
  `apps/web/playwright-report/`. Báo cáo thô, ảnh lỗi và storage state chỉ dùng cục bộ: có thể chứa email hoặc dữ liệu
  tài khoản thử, không commit hay tải công khai.
- E2E chạy thủ công. CI chưa chạy E2E vì suite cần DB dev dùng chung, tài khoản seed
  và có thể gửi email xác thực. Chỉ đưa vào CI khi có DB, mailbox và dữ liệu fixture riêng, có cơ chế dọn theo lần chạy.

| File | ID |
|---|---|
| `guest-catalog.spec.ts` | UI-COM-01–12, 14, 60, 63 |
| `auth.spec.ts` | UI-COM-20–27, 29, 32 |
| `cart-checkout.spec.ts` | UI-COM-40–44, 52–55, 57, 58, 63 |
| `learner-learning.spec.ts` | UI-LRN-01, 02, 10–12, 14, 16, 25, 28, 29 |
| `roles-guards.spec.ts` | UI-GRD-01–09 (kèm UI-LRN-26/27, UI-COM-56, UI-LEC-15) |
| `lecturer.spec.ts` | UI-LEC-01, 03, 04 |
| `admin-users.spec.ts` | UI-ADM-01, 03, 10, 12–22, UI-COM-13 |

### Giới hạn chứng minh và kiểm tra nghiệp vụ

- COM52/53/55 yêu cầu dialog hủy ở cả checkout và banner giỏ: "Giữ đơn hàng" giữ pending/cart, xác nhận mới gọi hủy,
  về `/cart` và kiểm tra course ID được phục hồi. Response thành công và pending banner biến mất chưa phải truy vấn độc lập
  trạng thái `cancelled` của đúng order. COM44/55 dọn cả order lẫn course ID kể cả khi thêm dòng thứ hai thất bại.
- Helper hành vi admin đi qua confirmation/consent; chỉ helper **cleanup** tương thích thao tác trực tiếp của implementation cũ.
  ADM12 dùng tài khoản mới không có enrollment/order/course để kiểm tra số 0 và tách acknowledgement khỏi reason hợp lệ.
  ADM13 bật acknowledgement rồi thử reason rỗng/whitespace; nếu UI chặn submit thì server validation chưa được kiểm chứng.
  Khi product thiếu dialog, các bước gate/session/reactivation sau đó **chưa chạy**, không diễn giải là tất cả đều hỏng.
- Menu admin/lecturer chưa triển khai phải không tương tác; menu đã triển khai phải mở đúng route/page. Không bắt buộc
  một tính năng mãi ở trạng thái "Sắp ra mắt". Annotation ghi rõ destination chưa được kiểm tra.
- COM06 kiểm tra từng dòng bài trong syllabus đã mở; COM11 kiểm tra giỏ persisted và badge; LRN14 loại `0/0`, thao tác
  filter và đối chiếu input/expected/actual. GRD07 kiểm tra đích browser, không nhận redirect login/dashboard sai là pass.
- Assertion copy độc lập dùng soft assertion vẫn làm test FAIL, nhưng cho phép kiểm tra tiếp bảo toàn input/navigation.
  CTA chính không được nới để khớp implementation; control hiện hữu có thể được thao tác riêng để phân biệt lỗi copy và hành vi.
- COM26 hiện chỉ kiểm tra recovery cho địa chỉ lạ; so sánh email thật/lạ trong catalog chưa được tự động chứng minh.
  Ảnh QR bị chặn vì dữ liệu nhận tiền: COM54 không chứng minh tải QR thành công hoặc UI fallback khi ảnh lỗi.
  Settlement thật, inbox recovery, paid AI và submit tiến độ vẫn ngoài phạm vi chạy này.
- Báo cáo phải gắn với snapshot cụ thể. Run lịch sử 58 pass (3 setup + 55 behavior), 18 fail cả hai lần, 1 flaky, 0 skip
  không tự xác nhận các sửa test sau audit nghiệp vụ; ghi riêng kết quả mới và các nhánh dừng sớm.

Ghi kết quả vào `plans/reports/ui-test-<yymmdd-hhmm>-<area>.md`.
