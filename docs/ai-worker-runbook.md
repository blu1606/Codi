# Worker AI chạy nền

Worker chạy như một tiến trình riêng và kết nối ra PostgreSQL, GitHub và nhà cung cấp AI. Không cần mở cổng HTTP công khai. Queue `ai_jobs` chỉ giữ thông tin cần để xử lý; không ghi token, cookie hay câu trả lời AI. Một số job có nội dung người dùng trong payload: không ghi payload ra log, và payload được xóa khi job hoàn thành hoặc thất bại.

Worker nhận tối đa một job một lúc. Các job có lease và cơ chế fencing để kết quả cũ không ghi đè kết quả mới. Nếu worker chết hoặc lease hết hạn, worker tiếp theo đánh dấu job thất bại sau khi cập nhật trạng thái nghiệp vụ trong cùng transaction; không tự gọi lại model vì request trước có thể đã tính phí. Có thể cần người dùng chủ động thử lại.

Trước khi đưa vào production:

1. Kiểm tra migration additive và thử migration trên database riêng có schema tương đương; không dùng `db:push` hay chạy migration thử trên database production.
2. Xác minh các biến môi trường mà từng handler cần, cấp cho worker qua cấu hình bảo mật trên server. Không đưa giá trị vào Git, container image hoặc GitHub Actions log. Chỉ bật provider sau khi được phép sử dụng.
3. Build và kiểm tra image worker trên bản commit dự kiến. Compose có profile `ai-worker` riêng, không publish port và giới hạn CPU/RAM. Mỗi lần deploy production phải bao gồm profile này để worker đã bật được recreate từ cùng image revision bất biến với web.
4. Theo dõi job thất bại, lease hết hạn và log đã loại bỏ dữ liệu nhạy cảm. Kiểm tra ảnh hưởng CPU/RAM tới các ứng dụng khác trên VPS. Tắt tính năng bằng cấu hình/triển khai được kiểm thử nếu có sự cố.

Profile worker được khai báo trong compose của repo; production dùng `/etc/codi/compose.yml` đã cài sẵn trên VPS. Script `/usr/local/sbin/codi-deploy` được đồng bộ từ `scripts/ops/codi-deploy` trong release và chạy Compose với profile `ai-worker`, để web/worker cùng revision được recreate và rollback cùng nhau. Compose trên VPS phải giữ profile, không publish port, giới hạn tài nguyên và env file bảo mật. Script không chạy migration và không tự bật feature flag.

## Khởi chạy và vận hành

Lệnh trong image có đầy đủ dependencies: `pnpm --filter web worker:ai`. Đặt `AI_BACKGROUND_WORKER_ENABLED=true` cho cả web và worker chỉ sau khi worker, schema và quyền database tương thích đã được kiểm chứng. Công tắc mặc định tắt: đường GitHub/quiz đồng bộ hiện tại vẫn hoạt động và lộ trình học tiếp tục dùng `after()`.

Chạy đúng **một** instance worker khi dùng cấu hình giới hạn một job đồng thời; không công bố port. Cho tiến trình đủ thời gian hoàn thành job khi tắt (grace period lớn hơn timeout job dài nhất), rồi xác minh việc phục hồi sau restart trước khi dùng thực tế. Chưa có kiểm chứng tải hay thử provider tính phí trong nhánh này. Bản đồ kiến thức hiện đọc tiêu đề, mô tả và nội dung văn bản bài học, chưa trích xuất nội dung PDF, slide hoặc video.

Người dùng đã chọn giữ các mục bản đồ kiến thức từng được giảng viên duyệt khi phân tích lại. Nếu đề xuất mới yêu cầu thay đổi liên kết của mục cũ, xử lý hiện tại dừng an toàn; cần luồng so sánh/duyệt riêng để hỗ trợ thay đổi đó. Bản đồ đã xác nhận trước đó phải tiếp tục là snapshot công khai khi job đang chạy, thất bại hoặc kết quả mới đang chờ duyệt; chỉ thay snapshot sau khi giảng viên xác nhận bản mới. Việc hiển thị snapshot ở các đường catalogue/learner cần được kiểm thử theo từng trạng thái trước rollout.

Tác vụ bản đồ kiến thức và quiz có giới hạn mặc định 5 job/người/loại/ngày UTC, bao gồm cả job thất bại; cấu hình bằng `AI_DAILY_JOB_LIMIT` (1–999). Giới hạn này chỉ là số lượt, không phải ngân sách tiền hay thay thế hạn mức provider. GitHub giữ cơ chế ngân sách riêng.

Khi bật worker, các job đang chờ có thể được xử lý ngay, bao gồm hàng đợi lộ trình sẵn có. Kiểm tra provider, quyền và chi phí đã được người dùng cho phép trước khi bật; không bật để thử kết nối với queue production. Để dừng nhận job mới, tắt cờ trên web trước, cho worker chạy hết lượt hiện tại rồi dừng worker; không xóa thủ công job hoặc payload khi chưa đánh giá tác động.

## Phạm vi và thời gian xử lý

- **Bản đồ kiến thức:** xử lý tối đa 100 bài học/lượt; mỗi bài dùng tối đa 200 ký tự tiêu đề, 400 ký tự mô tả và 1.200 ký tự đầu của nội dung chữ. PDF, slide, video và phần chữ vượt giới hạn chưa được trích xuất. AI chỉ tạo đề xuất; giảng viên phải xem và xác nhận trước khi áp dụng.
- **Hồ sơ GitHub:** yêu cầu người dùng cho phép và tài khoản GitHub đã liên kết. Worker xác minh lại quyền và danh tính liên kết; token không được lưu vào queue. Deadline tổng ở worker là 175 giây, trong đó thu thập tối đa 90 giây và phân tích AI tối đa 75 giây. Đường đồng bộ cũ giữ deadline ngắn hơn.
- **Quiz:** worker dùng tối đa 12.000 ký tự văn bản bài học hoặc tối đa 6.000 ký tự văn bản được dán, và tạo tối đa 10 câu/lượt. Kết quả là bản nháp để giảng viên xem; chỉ thêm những câu được chọn. Khi lưu quiz thành công, các bản nháp AI đã áp dụng được đánh dấu đã xử lý trong cùng transaction. Nếu rời trang trước khi lưu, câu hỏi chưa lưu vào quiz và bản nháp vẫn có thể xuất hiện lại để tiếp tục.
- **Lộ trình học:** worker xử lý hàng đợi lộ trình có sẵn. Các deadline trong code vẫn được giữ; không phải mọi tác vụ AI đều được kéo dài thời gian chỉ nhờ chuyển sang worker.

Lease của queue chung là 300 giây; timeout model cho KMap và quiz worker là 180 giây. Đây là các giới hạn, không phải cam kết thời gian hoàn thành. Thử khởi động lại trong lúc đang chạy và graceful shutdown bằng fixture độc lập trước khi chọn `stop_grace_period`; worker đang xử lý có thể cần gần hết thời gian của job trước khi thoát.

## Cấu hình và rollout

`AI_BACKGROUND_WORKER_ENABLED` mặc định `false`. Khi `true`, cả web và worker phải thấy cấu hình tương thích; web tạo job và worker xử lý. Không dùng cờ này để kiểm tra sống của worker: có thể bật cờ trong khi worker chưa chạy, khiến job chờ. `AI_DAILY_JOB_LIMIT` là quota áp dụng tại web khi tạo job; các instance web cần cấu hình giống nhau. Đặt cờ về `false` khôi phục đường đồng bộ GitHub/quiz và lịch `after()` cho lộ trình; bản đồ kiến thức quay lại trạng thái không khả dụng. Việc đổi cờ không tự hoàn tất hoặc huỷ các job đang có.

Worker cần kết nối database, cấu hình Better Auth và cấu hình provider cần thiết cho từng tác vụ; hồ sơ GitHub còn dùng cấu hình GitHub OAuth và các biến budget `GITHUB_PROFILE_BUDGET_KEY`, `GITHUB_PROFILE_BUDGET_SLOT`, `GITHUB_PROFILE_CANDIDATE_SHA`. Chỉ worker cần cấu hình provider phục vụ các job nền; kiểm tra riêng các chức năng web đồng bộ khác trước khi thay đổi env của web. Không đưa giá trị cấu hình nhạy cảm vào tài liệu, image, repo hoặc log.

Thứ tự đề xuất: hoàn tất kiểm thử và review trên database độc lập; xem xét migration `ai_jobs` và kế hoạch phục hồi; tích hợp worker vào pipeline production trên `main` mà không mang theo thay đổi ngoài phạm vi; sau đó triển khai schema/web/worker tương thích theo kế hoạch được duyệt. Giữ cờ tắt cho tới khi worker và giám sát sẵn sàng, có quyền sử dụng provider và đã đánh giá hàng đợi hiện hữu. Triển khai, migration production, khả năng rollback và các luồng OAuth/provider thực tế chưa được chứng minh chỉ bằng các fixture UI hoặc kiểm thử giả lập.
