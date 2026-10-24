# PR #160 — xác minh sau review, 21/10/2026

Đối chiếu [review mới](https://github.com/blu1606/Codi/pull/160#pullrequestreview-5594530942): mã nguồn CTA được chấp nhận, cần chứng minh luồng học sau đăng nhập và giữ CTA khi ghép #165.

**Bổ sung sau review tiếp theo:** [bàn giao snapshot tích hợp, source runner, log gốc và 8 case đăng nhập thật cho trạng thái chưa xác nhận/không có bài liên quan](integration-handoff/README.md). Hồ sơ mới giữ rõ build tích hợp cũ chưa có exit 0 và lỗi type của lần thử webpack; không đổi các kết quả lịch sử dưới đây thành lần chạy mới.

## Phiên bản và kết quả

| Candidate | Phiên bản sản phẩm đã chạy | E2E mới |
|---|---|---|
| #160 riêng + develop hiện tại | `4981058b64c3ee861c488b74ff38decf2e2651c7` | 4 pass, 0 fail/skip/flaky |
| Bản tích hợp #165/#133/#160/#144 | `c20c4ef21c6463f85f374a42f0b7c43d38d28ccd` | 4 pass, 0 fail/skip/flaky |

Cả hai dùng base develop `437c1e8df16969a54b1fb96f0ff3e02a09c15e7a`. Bản tích hợp đã chứa CTA #160 tại `45d3bd5`; các dependency PR vẫn riêng biệt. Lượt mới chạy cùng file `knowledge-map-cta.spec.ts` trên hai server production, không coi kết quả cũ là kết quả mới. Những thay đổi sau các candidate trên chỉ bổ sung test, runner và tài liệu.

Kiểm tra mới trên #160 riêng: toàn bộ Vitest **85 file / 1.520 test pass** (`--maxWorkers=4`); workspace TypeScript pass; design standards **0 vi phạm**; production build exit **0**. Happy DOM vẫn có cảnh báo iframe YouTube đã tồn tại. Bản tích hợp dùng artifact production đã có từ lượt #165; không tuyên bố đã chạy lại build hoặc toàn bộ unit suite của bản tích hợp trong lượt này.

## Hợp đồng đã kiểm tra

Ma trận Chromium: **1280×800 và 375×844**, mỗi kích thước có light/dark. Đây là kiểm tra viewport mobile, không phải chứng nhận thiết bị vật lý.

| State / hành động | Assertion |
|---|---|
| Đăng nhập học viên | Form `/login` thật, tài khoản có role và phiên thật |
| Chọn concept khóa trong bảng của bản đồ | Có lý do prerequisite; panel không có link bài học |
| Chọn concept mở khóa | Có nhãn mastery; link có tên truy cập chính xác `Học bài này: Bài Hàm QA` và đích course/lesson chính xác |
| CTA trên mobile | Nằm trong viewport; click chính CTA mở đúng tiêu đề bài và link về lộ trình |
| Player/API bài mở | Player thật hiển thị, API cùng phiên trả **200** |
| Truy cập thẳng URL bài khóa | Server layout hiển thị lý do “Bạn cần học ‘Hàm QA’ trước”, không mount player |
| Gọi API bài khóa độc lập | API cùng phiên trả **403** |
| Theo link prerequisite | Mở lại được đúng bài học tiên quyết |

Không intercept auth/map/lesson API, không bỏ qua HTTP errors và không dùng title link thay cho CTA. Shared health fixture vẫn áp dụng các loại noise đã được repo khai báo (bao gồm hydration warning); không thêm exclusion mới. API 403 được assert riêng qua `page.request`, độc lập với việc ẩn link ở giao diện.

Lượt này xác minh Flow L12/issue #156, không coi các vấn đề riêng của #133 hoặc #144 là đã được sửa. Không thay application API/schema/guard hoặc `docs/mockup/**`.

## Dữ liệu và chạy lại

Runner `apps/web/scripts/verify-knowledge-map-cta.mjs` tạo hai identity QA ngẫu nhiên với email đã xác minh, mật khẩu sinh ngẫu nhiên và một khóa học QA có ba bài. Bài đầu hoàn thành/mastery cao, bài thứ hai mở, bài thứ ba bị khóa. Không gửi email hoặc sửa tài khoản/tiến độ sẵn có. Cần flag `--allow-dev-db`; runner từ chối `NODE_ENV=production`.

`finally` chỉ xóa course/identity thuộc lượt chạy, kiểm tra không còn session, credential, enrollment hoặc skill của lượt đó. **Cả hai lượt đã báo dọn sạch thành công.** Không lưu credentials hoặc browser storage state vào repo. Metadata đã lược bỏ dữ liệu tài khoản: [standalone](real-session/standalone/results.json), [integration](real-session/integration/results.json).

Build và khởi động server production từ checkout cần kiểm tra, đặt `BETTER_AUTH_URL` khớp địa chỉ server. Sau đó chạy từ `apps/web`, với cấu hình DB development:

```powershell
# #160 riêng (QA server tại localhost:3160)
$env:E2E_BASE_URL = 'http://localhost:3160'
node scripts/verify-knowledge-map-cta.mjs --allow-dev-db

# Bản tích hợp có #165 và CTA #160 (QA server tại localhost:3265)
$env:E2E_BASE_URL = 'http://localhost:3265'
node scripts/verify-knowledge-map-cta.mjs --allow-dev-db
```

Runner dùng `--no-deps` vì tự cấp tài khoản QA cho bốn ca; không cần seed password của các tài khoản dùng chung. Bộ E2E tổng quát và case UI-LRN-25 cũ không bị sửa expected; lượt này là bốn ca UI-LRN-25 chuyên biệt có fixture cô lập.

## Ảnh đăng nhập thật — #160 riêng

Ảnh có dữ liệu QA tạm; bảng đối chiếu mockup và empty state ban đầu vẫn ở [README.md](README.md). Ảnh full-page giữ vị trí sticky header tại thời điểm chụp sau thao tác cuộn.

| State | Desktop light | Desktop dark | 375px light | 375px dark |
|---|---|---|---|---|
| Panel khóa, không link | [Ảnh](real-session/standalone/locked-desktop-light.png) | [Ảnh](real-session/standalone/locked-desktop-dark.png) | [Ảnh](real-session/standalone/locked-mobile-light.png) | [Ảnh](real-session/standalone/locked-mobile-dark.png) |
| Panel mở, có CTA | [Ảnh](real-session/standalone/unlocked-desktop-light.png) | [Ảnh](real-session/standalone/unlocked-desktop-dark.png) | [Ảnh](real-session/standalone/unlocked-mobile-light.png) | [Ảnh](real-session/standalone/unlocked-mobile-dark.png) |
| Player thật | [Ảnh](real-session/standalone/player-desktop-light.png) | [Ảnh](real-session/standalone/player-desktop-dark.png) | [Ảnh](real-session/standalone/player-mobile-light.png) | [Ảnh](real-session/standalone/player-mobile-dark.png) |
| Server chặn URL khóa | [Ảnh](real-session/standalone/server-locked-desktop-light.png) | [Ảnh](real-session/standalone/server-locked-desktop-dark.png) | [Ảnh](real-session/standalone/server-locked-mobile-light.png) | [Ảnh](real-session/standalone/server-locked-mobile-dark.png) |

## Ảnh đăng nhập thật — bản tích hợp #165

| State | Desktop light | Desktop dark | 375px light | 375px dark |
|---|---|---|---|---|
| Panel khóa, không link | [Ảnh](real-session/integration/locked-desktop-light.png) | [Ảnh](real-session/integration/locked-desktop-dark.png) | [Ảnh](real-session/integration/locked-mobile-light.png) | [Ảnh](real-session/integration/locked-mobile-dark.png) |
| Panel mở, giữ CTA #160 | [Ảnh](real-session/integration/unlocked-desktop-light.png) | [Ảnh](real-session/integration/unlocked-desktop-dark.png) | [Ảnh](real-session/integration/unlocked-mobile-light.png) | [Ảnh](real-session/integration/unlocked-mobile-dark.png) |
| Player thật | [Ảnh](real-session/integration/player-desktop-light.png) | [Ảnh](real-session/integration/player-desktop-dark.png) | [Ảnh](real-session/integration/player-mobile-light.png) | [Ảnh](real-session/integration/player-mobile-dark.png) |
| Server chặn URL khóa | [Ảnh](real-session/integration/server-locked-desktop-light.png) | [Ảnh](real-session/integration/server-locked-desktop-dark.png) | [Ảnh](real-session/integration/server-locked-mobile-light.png) | [Ảnh](real-session/integration/server-locked-mobile-dark.png) |

CI vẫn cần chạy trên head được push trước khi merge.
