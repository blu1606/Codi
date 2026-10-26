# Issue #97 — lộ trình cá nhân và bản đồ kiến thức

Màn S10, S11f, S13c; Flow L5/L12; contract `docs/mockup/STATE-MACHINES.md` §8/§18 và `PRODUCT.md` §7.7–7.9. PR này đã đồng bộ bản sửa review #123 (`75ad4ab`); thứ tự merge: #122 (đã merge) → #123 → PR #125.

## Chạy và mở trang

```sh
pnpm --filter web db:seed-learning-path
pnpm run dev:web
```

Đăng nhập bằng tài khoản learner đã tạo bởi `db:seed-accounts`. Script chỉ thêm các khoá dev riêng cho những tài khoản có cả dấu hiệu email `+student@` và tên `(Student)`; không đặt lại khoá onboarding hay tiến độ đang dùng. Chạy lại không ghi đè enrollment đã thiết lập mục tiêu.

- Luồng thật nối từ #96: `http://localhost:3001/learn/dev-onboarding-typescript`.
- Bản đồ riêng: `http://localhost:3001/insights/knowledge-map` (có bộ chọn khoá).
- Các fixture bên dưới là **dữ liệu phát triển đã lưu DB**, ghi nhãn trong tên khoá/rationale. Phiên bản `development-fixture` không chứng minh model thật đã chạy. Ứng dụng không có cờ giả trạng thái hay fake latency.

| URL sau `http://localhost:3001` | Dùng để kiểm tra / chụp |
|---|---|
| `/learn/dev-path-none` | Chưa thiết lập → CTA vào onboarding |
| `/learn/dev-path-default` | Thứ tự mặc định, card diagnostic, bài tiên quyết bị khoá, tất cả Chưa học |
| `/learn/dev-path-ai` | AI ready, lý do từng bài và mastery có nhãn chữ |
| `/learn/dev-path-failed` | Banner fallback, vẫn mở được bài đủ prerequisite; Thử lại → generating rồi ready/failed theo provider thật |
| `/learn/dev-path-updated` | Thông báo hoàn thành, bài mới mở khoá/có thể bỏ qua, highlight xuất hiện một lần |
| `/learn/dev-path-complete` | Chúc mừng, đánh giá sao, gợi ý khoá tiếp theo khi có khoá phù hợp |
| `/learn/dev-path-unconfirmed` | Tab bản đồ ẩn dữ liệu khi giảng viên chưa xác nhận |

Chụp `/dev-path-updated` **ngay lần mở đầu**: highlight được ghi nhận vào DB sau khi hiển thị, tải lại sẽ không tô lại. Thông báo còn cho tới khi bấm Ẩn thông báo. Có thể dùng tài khoản learner seed khác để chụp lại mà không reset tiến độ. Chuyển Light/Dark trước khi mở trang; dùng tài khoản khác hoặc chụp cả hai theme trước khi tải lại trang.

Trang bài học `/learn/[courseId]/[lessonId]` thuộc #98, chưa có player trong PR này. Layout guard ở #97 sẽ bảo vệ player khi #98 thêm vào. Không dùng ảnh 404 của player làm bằng chứng cho S10/S13c.

## 📸 DÁN ẢNH KIỂM TRA TẠI ĐÂY

Người dùng tự chụp và kéo ảnh trực tiếp vào bảng tương ứng trong PR. Mockup: mở `docs/mockup/index.html`, Alt+K chọn learner; S10 ở `#/learn/:courseId`, bản đồ ở `#/insights/knowledge-map`. Mỗi dòng cần Light, Dark và mobile 375px. Chưa đánh dấu browser/visual QA hoàn thành.

| State / thao tác | Mockup | Light | Dark | Mobile 375px |
|---|---|---|---|---|
| Chưa thiết lập / CTA onboarding | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Mặc định + card Cá nhân hoá / ẩn card | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Generating sau Thử lại / sau diagnostic #96 | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| AI ready + Vì sao? + nhãn mastery | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Failed fallback + Thử lại | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Done / active / next / skippable / locked / todo và lý do khoá | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Updated: diff + highlight lần đầu / sau tải lại | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Chỉnh mục tiêu: confirm → wizard #96 | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Hoàn thành khoá + đánh giá / gợi ý tiếp | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Bản đồ chưa xác nhận / chưa có khoá | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Bản đồ confirmed, tất cả Chưa học | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Sơ đồ: chọn node, prerequisite path, zoom/fit/minimap, bài liên quan | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Danh sách tương đương sơ đồ + đổi khoá | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |
| Loading / lỗi kết nối / retry | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH | DÁN ẢNH |

Fixture `updated` có done/next/skippable (skippable vẫn bị khoá nếu prerequisite chưa đủ). `active` xuất hiện khi #98 lưu trạng thái học; unit test đã kiểm tra phép chiếu state, ảnh player/tiến độ học thật sẽ bổ sung sau #98.

## Server và lưu trữ

- Path enum giữ nguyên `none | generating | ready | failed`; `updated` là diff của phiên bản, không thêm state vào enum.
- Chỉ learner đang hoạt động, không banned, sở hữu enrollment không suspended được đọc/ghi. Identity lấy từ session; mutation kiểm tra same-origin và schema strict. Response private/no-store.
- `learning_path_jobs` lưu yêu cầu với hash input và lease 60 giây. `after()` chạy sau response, provider có timeout 20 giây. Request đồng thời không gọi AI trùng; token/hash ngăn worker cũ ghi đè. Tác vụ bị ngắt được khôi phục khi request/visit tiếp theo đến; chưa có cron/queue ngoài tiến trình để tự chạy khi không có traffic.
- #96 đặt `path_status=generating`; route onboarding đã schedule worker, course home cũng reconcile khi mở. Lần tạo đầu / yêu cầu tạo lại: lỗi provider hoặc output sai → phiên bản `system`, `path_status=failed`, có CTA retry; proposal rỗng hợp lệ → `ready/default`. Riêng job `lesson_completed` của lộ trình AI: khi lỗi, timeout, output sai hoặc rỗng, chạy lại scheduler với các item đã lưu, giữ `ready/ai`, thứ tự, lý do và quyền bỏ qua còn đủ mastery. Prerequisite và bài đã hoàn thành vẫn áp dụng; chỉ log lần gọi AI là thất bại.
- AI SDK dùng provider hiện có (`AI_PROVIDER`, `AI_MODEL`, key tương ứng). Không có key hoặc provider lỗi vẫn học theo mặc định. Model chỉ nhận mục tiêu, metadata bài/khái niệm và BKT; không nhận answer key/code lời giải. AI không chấm điểm.
- Log lỗi chỉ lưu một loại cố định (`provider_error`, `timeout`, `invalid_output`, `provider_unavailable`), không lưu nội dung exception/response lỗi. Schema gửi Gemini giữ `maxItems` (được tài liệu [structured output](https://ai.google.dev/gemini-api/docs/structured-output) hỗ trợ), bỏ `format: uuid` và giới hạn độ dài chuỗi không được tài liệu cam kết; schema phía server vẫn kiểm tra UUID, độ dài, bài trùng/ngoài khoá và prerequisite. Test dùng adapter `@ai-sdk/google` thật với HTTP giả lập để kiểm tra request/validation, không gọi model thật.
- Scheduler áp dụng prerequisite cứng, giữ bài hoàn thành, append bài mới, chặn bỏ qua nếu thiếu bằng chứng mastery >=3 cho mọi khái niệm trong bài. Lesson access kiểm tra lại prerequisite, không tin thứ tự hay trạng thái client.
- Một active path/enrollment; phiên bản cũ superseded để diff. `update_summary`, `highlights_seen_at`, `update_dismissed_at` tách việc xem highlight khỏi việc ẩn thông báo.
- BKT D16 dùng helper #96, không dùng LLM. Evidence ledger chỉ nhận answer đúng/sai đã graded và code `submit`; loại diagnostic (đã xử lý #96), unknown, run và assignment. Hai truy vấn anti-join với `learning_path_evidence` chỉ lấy observation chưa xử lý, gồm câu trả lời được chấm muộn trong submission cũ. Unique ledger vẫn là guard cuối cho concurrency. Ledger và mastery ghi trong cùng transaction, không tính hai lần khi reload.
- `learning_path_completions` nhận lesson_progress đã completed. Hook `reconcileLearningPath(tx, userId, courseId)` chạy trong transaction của #98 sau khi checklist hợp lệ; chỉ server tạo progress/submission. #97 không có endpoint nhận “đã hoàn thành” từ client.
- API ghi của #98 gọi `assertLearningLessonAccess(tx, userId, courseId, lessonId, true)` để khoá enrollment/kiểm tra prerequisite trong cùng transaction trước khi thay đổi progress.
- Card diagnostic chỉ ẩn theo phiên đăng nhập và tab (`sessionStorage`, scope bằng user + thời điểm tạo session, không gửi session token xuống client). Trường DB dismissal cũ được giữ để tương thích migration nhưng không còn quyết định hiển thị. Phiên đăng nhập mới sẽ thấy card nếu vẫn đủ điều kiện.
- Gửi/sửa đánh giá khoá course row rồi upsert review và tính lại `courses.rating`/`reviewCount` từ review đang hiển thị trong cùng transaction; review bị ẩn không tham gia trung bình.
- Knowledge map chỉ trả accepted/edited concepts/edges khi map confirmed. Sơ đồ DAG trái→phải, màu mastery kèm chữ, chọn node highlight ancestor path, danh sách truy cập bàn phím, zoom/fit/minimap. Khái niệm thuộc bài đang được gợi ý có marker bằng chữ ở cả sơ đồ, danh sách và panel chi tiết; không có marker khi chưa thiết lập hoặc đã hoàn thành khoá. Không có mutation cho learner.
- Migration `20261016090000_learning_path_runtime` chỉ thêm 3 bảng runtime và 4 cột. Không drop/rename/reset dữ liệu.

## Kiểm tra

```sh
pnpm test:coverage
pnpm run check-types
pnpm run check:standards
pnpm --filter web test:learning-path:db
pnpm --filter web build
```

DB verification dùng fixture riêng trong transaction rồi rollback: quyền/ownership, các transition ready/failed/retry, thứ tự tiên quyết, đúng một active version, bằng chứng BKT một lần, thông báo/highlight, lease sống/hết hạn, kết quả goal cũ, map confirmed-only, review, giữ completion/điểm. Provider trong bài test được tiêm kết quả có kiểm soát; đó không phải bằng chứng provider thật thành công. Bổ sung hồi quy AI ready → hoàn thành bài → provider lỗi vẫn ready/ai và giữ skip; rating sau thêm/sửa/ẩn review; evidence chấm muộn; marker chuyển sang bài tiếp theo và biến mất khi hoàn tất. Browser walkthrough và ảnh người dùng vẫn còn chờ.
