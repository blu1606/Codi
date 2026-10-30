# Kiểm thử hiệu năng: Lighthouse CI và k6

Tài liệu này mô tả hai lớp kiểm tra hiệu năng của Codi:

- **Lighthouse CI**: đo tốc độ tải trang (LCP, TBT, điểm Performance, dung lượng JavaScript) cho mọi PR trên preview của chính PR đó. Hiện chỉ cảnh báo, chưa chặn merge.
- **k6**: test tải cho API và hành trình học viên (đăng nhập → khoá học → bài học → lưu tiến độ). Chỉ chạy thủ công.

Kế hoạch và lý do chọn: `plans/261030-1902-k6-lighthouse-ci/plan.md` (thư mục `plans/` không được commit).

## Quy tắc an toàn

1. **Không bao giờ chạy k6 vào production.** Mọi script từ chối chạy nếu thiếu `BASE_URL` hoặc `I_UNDERSTAND_TARGET=1`. Workflow `perf.yml` chỉ nhận URL `https://*.vercel.app` và từ chối URL trùng biến `PRODUCTION_URL`.
2. **Chỉ test trên preview có database riêng.** Preview, production và máy dev hiện dùng chung một project Supabase. Test tải trên database đó sẽ ghi dữ liệu thật và làm chậm người dùng thật. Trước khi chạy, phải có preview `perf/*` trỏ `DATABASE_URL` tới database test.
3. **Không gọi route AI hoặc thanh toán.** Tutor, advisor, sinh lộ trình, phân tích GitHub, quiz AI, route thanh toán và webhook đều bị chặn trong `perf/k6/lib/http.js`. Hành trình học viên chỉ gọi `study` (lưu tiến độ) và, khi có `ENABLE_WRITES=1`, nộp quiz. Lệnh `complete` không được dùng vì nó kích hoạt cập nhật lộ trình.
4. **Tài khoản test không commit.** File CSV nằm ngoài repo; `.gitignore` chặn `perf/k6/**/*.csv` và `perf/k6/results/`.
5. **Mục tiêu tải cần được duyệt.** Chạy `stress.js` hoặc `VUS` lớn chỉ sau khi nhóm đồng ý và biết giới hạn gói Vercel/Supabase.

## Lighthouse CI

### Chạy cục bộ

Lighthouse đo trên bản build production, không đo `next dev`:

```bash
pnpm --filter web build
pnpm start:web                                    # terminal khác, cổng 3000
LHCI_BASE_URL=http://localhost:3000 \
LHCI_COURSE_SLUG=<slug-khoa-hoc> \
pnpm exec lhci autorun --upload.target=filesystem
```

- Cấu hình: `lighthouserc.cjs` (mobile, 3 lần chạy mỗi URL, `/`, `/courses`, một trang khoá học, `/login`).
- Ngưỡng hiện ở chế độ `warn`: điểm Performance ≥ 0.8, LCP ≤ 2500 ms, TBT ≤ 300 ms, JavaScript ≤ 300 KiB.
- Bỏ qua `LHCI_COURSE_SLUG` thì chỉ đo các trang tĩnh. Có thể lấy slug bằng `node scripts/lhci-resolve-course.mjs http://localhost:3000`.
- Báo cáo nằm trong `.lighthouseci/` (đã được ignore).

### Trong CI

- **PR vào `develop`**: job `lighthouse` trong `.github/workflows/deploy.yml` chạy sau bước deploy preview, đo đúng preview của PR. Kết quả hiển thị trong Step Summary và artifact `lighthouse-pr-<số PR>`. Job có `continue-on-error`, không chặn merge. PR từ fork không có preview nên job bị bỏ qua.
- **Push `develop`**: `.github/workflows/lighthouse-develop.yml` đo trang `/courses` trên URL trong biến repository `DEVELOP_PREVIEW_URL` (hoặc input `base_url` khi chạy tay) và cập nhật badge.

## Seed tài khoản test k6

Script `packages/db/src/seed-loadtest-accounts.ts` tạo `loadtest+001@codi.test` … và ghi danh các tài khoản vào một khoá học đã xuất bản. Chỉ chạy trên database test.

```bash
# Tạo 200 tài khoản; CSV ghi ra ~/.codi-loadtest/accounts.csv (ngoài repo)
pnpm --filter @codi-1/db db:seed-loadtest -- --count 200 --course <slug-khoa-hoc>

# Xoá đúng các tài khoản loadtest+NNN@codi.test và dữ liệu liên quan
pnpm --filter @codi-1/db db:seed-loadtest -- --cleanup
```

- Chạy lại an toàn: tài khoản đã có được cập nhật, ghi danh không tạo trùng, và **mật khẩu được đổi mới mỗi lần chạy**, nên luôn ghi lại CSV sau khi seed.
- Script dùng `DATABASE_URL` trong `apps/web/.env` (qua `varlock run`). Không đặt URL production vào đó khi chạy seed.
- Với `--out`, CSV nằm ngoài repository. Nếu đặt trong repo, script cảnh báo.

## Chạy k6 cục bộ

Cài k6 (`winget install k6` hoặc xem https://grafana.com/docs/k6/latest/set-up/install-k6/). Mọi lệnh cần các biến sau:

```bash
export BASE_URL=https://<preview>.vercel.app
export I_UNDERSTAND_TARGET=1
export ACCOUNTS_CSV=~/.codi-loadtest/accounts.csv
export COURSE_SLUG=<slug-khoa-hoc-da-ghi-danh>
```

| Script | Mô tả | Tải mặc định |
|---|---|---|
| `perf/k6/smoke.js` | Một người dùng chạy hành trình một lần | 1 VU |
| `perf/k6/browse.js` | Khách không đăng nhập đọc trang chủ, catalogue, chi tiết khoá | ramp tới 200 VU, giữ 3 phút |
| `perf/k6/learner-journey.js` | Học viên đăng nhập và học | ramp tới 50 VU trong 2 phút, giữ 3 phút |
| `perf/k6/stress.js` | Hành trình học viên, tăng 25 VU mỗi phút tới `VUS` (mặc định 300) | — |

```bash
k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=... -e COURSE_SLUG=... perf/k6/smoke.js
k6 run ... -e VUS=100 -e DURATION=5m perf/k6/learner-journey.js
k6 run ... -e ENABLE_WRITES=1 perf/k6/learner-journey.js     # có nộp quiz
```

Biến tuỳ chọn: `VUS`, `DURATION`, `RAMP` (thời gian tăng tải), `ENABLE_WRITES=1`, `SUMMARY_DIR` (mặc định `perf/k6/results`).

Ngưỡng:

- Đọc (`type:read`) p95 < 500 ms; ghi (`type:write`) p95 < 1000 ms; lỗi < 1%.
- Dừng sớm (`abortOnFail`) khi tỉ lệ lỗi vượt 5%, để không đánh sập môi trường test.

Kết quả: `summary.json` (máy đọc được) và bảng tóm tắt trên terminal. Mỗi request có tag `type` và `name`, nên các URL động (slug, id) được gom lại theo tên.

## Chạy k6 trên GitHub Actions

Workflow `.github/workflows/perf.yml` chỉ chạy khi bấm **Run workflow** (`workflow_dispatch`). Input:

- `base_url`: URL preview `https://*.vercel.app` (có database test).
- `script`: `smoke`, `browse`, `learner-journey` hoặc `stress`.
- `vus`, `duration`, `course_slug`, `enable_writes`.

Cần cấu hình trước:

- Secret repository `LOADTEST_ACCOUNTS_CSV`: nội dung CSV (có dòng tiêu đề `email,password`).
- Biến repository `PRODUCTION_URL` (tuỳ chọn, khuyến nghị): workflow từ chối nếu `base_url` trùng URL này.
- Biến repository `DEVELOP_PREVIEW_URL` (cho badge Lighthouse trên `develop`).

Artifact: `k6-results-<run>` (summary.json, k6-output.txt) và `lighthouse-pr-<số PR>`.

## Badge trên README

Badge lấy từ nhánh `badges` (chỉ chứa JSON, tạo bởi CI, không chứa mã nguồn):

| Badge | File | Nguồn | Cập nhật |
|---|---|---|---|
| Coverage, Unit Tests | `ci/coverage.json`, `ci/tests.json` | job `badges` trong `ci.yml` | push `develop` |
| Lighthouse | `perf/lighthouse-performance.json` | `lighthouse-develop.yml` (`/courses`, median 3 lần) | push `develop` |
| k6 p95, errors, max VUs | `perf/k6-*.json` | `perf.yml` | sau mỗi lần chạy thủ công |

Badge k6 chỉ được cập nhật sau mỗi lần chạy thủ công; không phản ánh tải thường ngày.

## Các điểm cần kiểm tra khi chạy lần đầu

- Hình dạng response của quiz (`questions`, `submission.id`) được suy ra từ mã nguồn; lần chạy đầu với `ENABLE_WRITES=1` cần xác nhận lại.
- Preview có thể bật Vercel Deployment Protection; khi đó Lighthouse và k6 nhận 401. Cần tắt bảo vệ cho preview test hoặc dùng bypass token.
- Ngưỡng `http_req_duration{type:read}` không có mẫu nào (ví dụ chỉ chạy ghi) có thể bị k6 báo kết quả không xác định.
- Rate limit trong bộ nhớ (`apps/web/src/lib/rate-limit.ts`) áp dụng theo IP; test từ một runner có thể bị giới hạn và làm sai số đo.
