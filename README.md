# Codi rebuild

[![CI/CD](https://github.com/blu1606/Codi/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/blu1606/Codi/actions/workflows/ci-cd.yml)
![unit tests](https://img.shields.io/badge/unit%20tests-138%20passed-2ea44f)
![e2e](https://img.shields.io/badge/Playwright-15%2F15%20passed-2ea44f)
![npm audit](https://img.shields.io/badge/npm%20audit-0%20high%2Fcritical-2ea44f)
![capacity](https://img.shields.io/badge/s%E1%BB%A9c%20ch%E1%BB%A9a-160%20req%2Fs%20%40%20p95%20%3C%20500%20ms-2a78d6)
![p95](https://img.shields.io/badge/p95%20%40%20160%20req%2Fs-290%20ms-2a78d6)
![errors](https://img.shields.io/badge/l%E1%BB%97i-0%25-2ea44f)
![saturation](https://img.shields.io/badge/b%C3%A3o%20ho%C3%A0-~206%20req%2Fs-eb6834)
[![Mozilla Observatory](https://img.shields.io/badge/Mozilla%20Observatory-A%2B%20(135%2F100)-2ea44f)](https://developer.mozilla.org/en-US/observatory/analyze?host=codi.hoangblue.dev)
[![SSL Labs](https://img.shields.io/badge/SSL%20Labs-A%2B-2ea44f)](https://www.ssllabs.com/ssltest/analyze.html?d=codi.hoangblue.dev&hideResults=on)
![security probe](https://img.shields.io/badge/security%20probe-28%20pass%2C%200%20warn%2C%200%20fail-2ea44f)

Nền tảng học lập trình Codi, bản dựng lại: frontend React (Vite) chạy trên backend của Codi (API Next.js chuyển
sang Hono) với PostgreSQL, đóng gói thành một Docker image.

- Kiến trúc hệ thống (CI/CD, production runtime, giám sát và sao lưu): [docs/system-architecture/](docs/system-architecture/README.md)
- Chạy trên máy: [docs/getting-started.md](docs/getting-started.md)
- Deploy, release và rollback: [docs/deployment.md](docs/deployment.md)
- CI/CD (kiểm tra mọi PR, deploy lên VPS khi merge vào `main`): [docs/ci-cd.md](docs/ci-cd.md)
- Kiểm thử bảo mật: [docs/security-testing.md](docs/security-testing.md)
- Kiểm thử hiệu năng (chi tiết): [docs/performance-testing.md](docs/performance-testing.md)

## Bảo mật

Quét ngày 2026-11-04 trên server dev `codi.hoangblue.dev` (bản `823225e`) bằng hai công cụ chấm điểm của bên thứ ba,
cộng với bộ kiểm tra của dự án:

| Công cụ | Đơn vị | Chấm gì | Kết quả |
|---|---|---|---|
| [HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=codi.hoangblue.dev) | Mozilla | Security header, cookie, HSTS, CSP | **A+ (135/100)**, đạt 12/12 mục |
| [SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=codi.hoangblue.dev&hideResults=on) | Qualys | Cấu hình HTTPS/TLS | **A+**: chỉ TLS 1.2 và 1.3, có HSTS, không cảnh báo |
| `npm run security:probe` | dự án | Probe hộp đen: header, file bí mật, lỗi lộ thông tin, input kiểu injection, Origin/CORS, API cần đăng nhập | 28 đạt, 0 cảnh báo, 0 lỗi |
| `npm run security:check` | dự án | Bí mật trong code, file nhạy cảm trong git, `npm audit` | Đạt, 0 lỗ hổng high/critical |
| `npm test`, `npm run test:e2e` | dự án | Phân quyền, phiên đăng nhập, OTP, quyền sở hữu khoá học, chặn theo vai trò và CSP trên trình duyệt | đạt toàn bộ |

**Content-Security-Policy** chỉ cho phép tài nguyên cùng origin, cộng với đúng các nguồn bên ngoài app dùng: Google
Fonts, trình phát YouTube, ảnh QR của SePay và ảnh đại diện Google/GitHub. Script không được chạy code inline hay
`eval` (phần kiểm tra cú pháp của trình soạn code dùng `acorn` thay cho `new Function`). [e2e/csp.spec.ts](e2e/csp.spec.ts)
mở các trang chính của cả bốn vai trò, kể cả bài học có video YouTube, và báo lỗi nếu trình duyệt chặn bất cứ thứ gì.
Kết quả quét gốc: [security/scans/2026-11-04/](security/scans/2026-11-04/). Chi tiết các lớp kiểm tra:
[docs/security-testing.md](docs/security-testing.md).

Quét lại:

```bash
curl -s -X POST "https://observatory-api.mdn.mozilla.net/api/v2/scan?host=codi.hoangblue.dev"   # trả về grade, score
curl -s "https://api.ssllabs.com/api/v3/analyze?host=codi.hoangblue.dev&publish=off&startNew=on&all=done"
# gọi lại lệnh SSL Labs (bỏ startNew=on) mỗi 10 giây đến khi status = READY, hạng nằm ở endpoints[].grade
```

## Hiệu năng

Đo ngày 2026-11-04 trên server dev `codi.hoangblue.dev` (VPS 2 vCPU, 4 GB RAM, app giới hạn 1 GB), bản build
`cc74269`, máy tạo tải đặt ở Việt Nam. Mọi số liệu đã gồm khoảng 75 ms đường mạng tới server.

**Kết quả:** server giữ được p95 dưới 500 ms tới **160 request/giây** (p95 290 ms, không lỗi). Từ 180 req/s độ trễ
tăng vọt, và server bão hoà ở khoảng **206 req/s**: gửi thêm tải thì không xử lý được nhiều hơn, chỉ chờ lâu hơn.

![Thời gian phản hồi theo tải](docs/assets/perf-latency.svg)

![CPU của server theo tải](docs/assets/perf-cpu.svg)

| Tải gửi tới (req/s) | Xử lý được (req/s) | p50 | p95 | p99 | Lỗi | CPU app | CPU DB |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 100,0 | 70 ms | 217 ms | 427 ms | 0% | 74% | 43% |
| 140 | 140,0 | 75 ms | 321 ms | 838 ms | 0% | 89% | 55% |
| **160** | **160,0** | **72 ms** | **290 ms** | **505 ms** | **0%** | **84%** | **52%** |
| 180 | 178,7 | 116 ms | 1,3 s | 1,9 s | 0% | 96% | 57% |
| 200 | 187,0 | 102 ms | 3,8 s | 5,0 s | 0% | 99% | 56% |
| 240 | 205,9 | 109 ms | 4,5 s | 5,8 s | 0% | 102% | 56% |

CPU tính theo % của một core (100% = một core). Bảng gộp: [levels.json](perf/runs/2026-11-04-dev-server/levels.json).

### 160 req/s tương ứng bao nhiêu người dùng

Ước tính theo định luật Little, với các giả định thường dùng cho web học trực tuyến (cần đối chiếu với số liệu thật
khi có người dùng):

- Một người đang học gửi khoảng 1 request mỗi 5–10 giây, nên 160 req/s ≈ **800–1.600 người online cùng lúc**.
- Giờ cao điểm chiếm khoảng 20% lượt truy cập trong ngày, mỗi phiên khoảng 20 phút, nên số người online lúc cao
  điểm ≈ số người dùng mỗi ngày / 15. Server này vì vậy phục vụ được khoảng **12.000–24.000 người dùng mỗi ngày**.

### Tối ưu đã áp dụng

CPU profile của app cho thấy gần 40% thời gian là chi phí cố định của mỗi câu SQL (dựng câu bằng drizzle-orm 21%,
driver `pg` khoảng 8%, ghi socket 10%), còn logic nghiệp vụ chỉ khoảng 2%. Vì vậy cách tăng sức chứa là bớt câu SQL
cho mỗi request, không phải tăng tài nguyên. Ba thay đổi, giảm từ khoảng 623 xuống 420 câu SQL cho mỗi 100 request:

1. **Cache catalogue và trang chi tiết khoá học 30 giây** ([public-course-cache.ts](backend/src/lib/public-course-cache.ts)):
   cùng một kết quả cho mọi người xem; các request đến cùng lúc dùng chung một lần truy vấn; xoá ngay khi giảng viên
   hoặc admin sửa khoá học.
2. **Kiểm tra quyền một lần mỗi request, một câu SQL** ([rbac.ts](backend/packages/auth/src/rbac.ts)): trước đây
   đọc một bài học kiểm tra quyền 3 lần, mỗi lần 2 câu.
3. **Danh sách bài học không kéo nội dung của mọi bài**: chỉ bài đang mở mới lấy nội dung.

### Nút thắt còn lại

- **App Node.js chạy một luồng nên chỉ dùng được một core.** Từ 180 req/s, app chạm 100% của một core trong khi
  PostgreSQL chỉ khoảng 56% và core thứ hai của VPS gần như rảnh. Bước tiếp theo để tăng sức chứa là chạy 2 tiến trình
  app.
- **API bài học vẫn là phần nặng nhất**: đọc bài 24 câu SQL, lưu tiến độ 36 câu; trong lượt đo, `POST …/lessons/:id`
  (lưu tiến độ) có trung vị 585 ms và đọc bài 458 ms, so với catalogue 77 ms. Ngữ cảnh khoá học vẫn được nạp hai lần
  mỗi lần đọc bài.
- Trang tĩnh (`/`, `/courses`) và catalogue vẫn nhanh (p95 dưới 250 ms) ngay cả khi API học bài đã quá tải.

### Cách đo và lý do chọn

| Kỹ thuật | Lý do |
|---|---|
| **Mô hình lưu lượng đến** (`ramping-arrival-rate` của k6) thay vì số người dùng ảo cố định | Người dùng thật không chờ server rảnh mới bấm. Với số người ảo cố định, server càng chậm thì càng ít request được gửi, và kết quả trông tốt hơn thực tế. Lưu lượng đến cố định giữ đúng X request mỗi giây, nên thấy được lúc server không theo kịp (cột "xử lý được" thấp hơn "gửi tới"). |
| **Đổi "số người dùng" thành request/giây** (định luật Little) | 10.000 người dùng không có nghĩa 10.000 người bấm cùng lúc. Đo theo request/giây là đại lượng server thật sự phải chịu, và quy đổi ngược ra số người dùng bằng giả định ghi rõ. |
| **Tăng tải theo bậc, mỗi bậc giữ 1 phút** (breakpoint test) | Tìm điểm vỡ: bậc cuối còn đạt SLO là sức chứa. Giữ mỗi bậc đủ lâu để hàng đợi ổn định thay vì đo lúc chuyển bậc. |
| **SLO: p95 dưới 500 ms, lỗi dưới 1%** | p95 phản ánh trải nghiệm của 1/20 người chậm nhất, không bị trung bình che đi. 500 ms là ngưỡng người dùng vẫn thấy trang phản hồi ngay. |
| **Trộn traffic thật: 70% khách xem, 30% học viên đăng nhập học bài** | Đo một endpoint riêng lẻ cho số đẹp nhưng sai: các API bài học nặng hơn catalogue nhiều lần, nên tỉ lệ trộn quyết định sức chứa. |
| **Đo CPU, RAM, kết nối DB phía server song song** ([collect-server-stats.sh](perf/collect-server-stats.sh)) | Độ trễ phía client chỉ cho biết chậm; số liệu server cho biết chậm vì đâu (ở đây: app chạm trần một luồng). |
| **CPU profile và đếm câu SQL mỗi request trước khi tối ưu** | Tối ưu theo số đo thay vì đoán: profile chỉ ra chi phí nằm ở số câu SQL, nên mọi thay đổi đều nhắm vào việc bớt câu. |
| **Đăng nhập trước trong `setup()`** | Toàn bộ tải đi ra từ một IP, mà Better Auth chỉ cho 3 lần đăng nhập mỗi 10 giây trên một IP. Đăng nhập dưới tải sẽ đo rate limiter chứ không đo app. |
| **Máy tạo tải tách khỏi server được đo** | k6 chạy trên chính server sẽ tranh CPU với app. Giá phải trả là cộng thêm khoảng 75 ms mạng, đã ghi rõ trên biểu đồ. |
| **Loại các bậc bị việc khác chen vào** | Script bỏ mọi bậc có container mới xuất hiện trên server giữa chừng (deploy, migration, job chạy một lần); container có sẵn từ đầu (app, DB, agent giám sát) được coi là môi trường bình thường. Lượt này bậc 120 req/s bị loại vì một container chạy thoáng qua. |
| **Tự dừng khi p95 trên 5 s hoặc lỗi trên 5%** | Bảo vệ server: khi đã vượt điểm vỡ, đo thêm chỉ làm chậm người khác mà không thêm thông tin. |

Hạn chế: một lần đo, từ một máy, trên server đang dùng chung; chưa có soak test (chạy nhiều giờ để tìm rò bộ nhớ) và
spike test. Kết quả là mốc để so giữa các bản build, không phải cam kết sức chứa.

### Dữ liệu đo

Lượt đo trên: [perf/runs/2026-11-04-dev-server/run4-optimised-100-240rps/](perf/runs/2026-11-04-dev-server/run4-optimised-100-240rps/)
gồm `capacity.json` (kết quả theo bậc), `server-stats.csv` (CPU, RAM, kết nối DB theo giây), `summary.json` (toàn
bộ số liệu k6, đã bỏ session) và `k6-output.log`. Các lượt đo cũ hơn (trước tối ưu) và so sánh trên máy nằm trong
[perf/runs/](perf/runs/).

### Chạy lại perf test

Cần [k6](https://k6.io) (`winget install k6`), Node 22 và SSH vào server. **Không chạy trên production thật**:
script từ chối các host production trừ khi đặt `ALLOW_DEV_SERVER=<host>` cho server dev của chính mình.

```bash
# 0. Biến dùng chung
BASE=https://codi.hoangblue.dev
RUN=perf/k6/results/$(date +%Y%m%d-%H%M)
CSV=C:/Users/<bạn>/.codi-loadtest/accounts.csv
mkdir -p $RUN

# 1. Sao lưu DB của server trước khi tạo tài khoản test
ssh codi-vps 'docker exec codi-rebuild-db pg_dump -U codi -d codi -Fc > /opt/codi-rebuild/backups/codi-$(date +%Y%m%d-%H%M%S)-before-loadtest.dump'

# 2. Tạo tài khoản test qua SSH tunnel (script chỉ nhận DATABASE_URL trỏ về localhost)
DBIP=$(ssh codi-vps 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" codi-rebuild-db')
ssh -N -L 5546:$DBIP:5432 codi-vps &        # mở tunnel, nhớ kill khi xong
cd backend && DATABASE_URL=postgresql://codi:<mật khẩu DB>@localhost:5546/codi \
  npx tsx scripts/seed-loadtest-accounts.ts --count 120 --course javascript-nen-tang --out $CSV && cd ..

# 3. Ghi số liệu server (chạy nền, đủ dài để phủ cả lượt đo)
ssh codi-vps 'sh -s 1260' < perf/collect-server-stats.sh > $RUN/server-stats.csv &

# 4. Chạy bài đo: giữ LOAD_RPS rồi tăng theo STEPS, mỗi bậc STEP_HOLD_S giây
k6 run -e BASE_URL=$BASE -e I_UNDERSTAND_TARGET=1 -e ALLOW_DEV_SERVER=codi.hoangblue.dev \
  -e ACCOUNTS_CSV=$CSV -e COURSE_SLUG=javascript-nen-tang \
  -e LOAD_RPS=100 -e LOAD_HOLD_S=60 -e STEPS=120,140,160,180,200,240 -e STEP_HOLD_S=60 -e LEARNER_VUS=120 \
  -e SUMMARY_DIR=$RUN perf/k6/capacity.js | tee $RUN/capacity-run.log

# 5. Lưu kết quả vào repo, vẽ lại biểu đồ (docs/assets/*.svg) và bảng gộp levels.json
node scripts/perf-archive.mjs $RUN perf/runs/<ngày>-<server>/<tên lượt>
node scripts/perf-charts.mjs perf/runs/<ngày>-<server>/<tên lượt>

# 6. Dọn dẹp: xoá tài khoản test (qua tunnel như bước 2) và file mật khẩu
cd backend && DATABASE_URL=postgresql://codi:<mật khẩu DB>@localhost:5546/codi \
  npx tsx scripts/seed-loadtest-accounts.ts --cleanup && cd .. && rm $CSV
```

Thời gian: bước 4 mất khoảng 3,3 giây cho mỗi tài khoản học viên để đăng nhập trước (120 tài khoản ≈ 7 phút), cộng
70 giây cho mỗi bậc. Các bài k6 khác (smoke, browse, learner journey, stress) và Lighthouse chạy trên stack Docker
local: xem [docs/performance-testing.md](docs/performance-testing.md).
