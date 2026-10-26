# BÁO CÁO ĐÁNH GIÁ TRẢI NGHIỆM NGƯỜI DÙNG & ĐIỂM NGHẼN (UI/UX - CONTENT - FLOW)
**Dự án:** Nền tảng học lập trình cá nhân hóa Codi (`index.html`)  
**Phương pháp:** Kiểm thử trải nghiệm thực tế (End-to-End Browser Testing & DOM Audit)  
**Đối tượng khảo sát:** 4 vai trò — **Guest** (Khách vãng lai), **Learner** (Học viên), **Lecturer** (Giảng viên), **Admin** (Quản trị viên)  
**Ngày thực hiện:** 12/10/2026  

---

## PHẦN 1: TÓM TẮT CÁC ĐIỂM CẦN CẢI THIỆN (QUICK WINS & BOTTLENECK SUMMARY)

| Phân hệ / Vai trò | Mức độ | Điểm nghẽn chính | Hướng cải thiện ngắn gọn |
|---|:---:|---|---|
| **Chung (System)** | **High** | Lỗi 404 `favicon.ico` gây ô nhiễm console; thiếu thông báo hoàn tác cho một số tác vụ tức thì. | Thêm favicon và hoàn thiện Toast/Undo cho các thao tác xóa/cập nhật. |
| **Guest (Khách)** | **High** | **Đứt gãy luồng chuyển đổi:** Bấm "Thêm vào giỏ" hiện dialog đăng nhập nhưng sau khi đăng nhập thành công chưa có hiệu ứng visual chỉ rõ khóa học đã vào giỏ; chưa có nút "Mua ngay / Thanh toán nhanh" bỏ qua bước giỏ hàng cho khách vãng lai. | Giữ nguyên context (redirect về đúng giỏ hàng hoặc trang thanh toán kèm khóa học đã chọn) và bắn toast thông báo rõ ràng. |
| **Guest (Khách)** | **Medium** | Trình tìm kiếm `/courses` không có gợi ý tự động (auto-suggest); rỗng kết quả tìm kiếm cần nút xóa bộ lọc nhanh hơn và nút hỏi AI Codi nổi bật hơn. | Bổ sung thanh tìm kiếm thông minh và làm rõ CTA "Hỏi trợ lý AI Codi tìm khóa học". |
| **Learner (Học viên)** | **Critical** | **Bẫy Onboarding cứng nhắc:** Học viên mới mua khóa học bị chặn 100% không thể xem bất kỳ bài học nào cho đến khi hoàn thành bài test đầu vào (Diagnostic Test). Người dùng muốn học ngay theo thứ tự mặc định sẽ bị ức chế. | Cung cấp tùy chọn *"Bỏ qua bài kiểm tra đầu vào (Học theo thứ tự mặc định)"* có cảnh báo rõ ràng. |
| **Learner (Học viên)** | **High** | **Thanh toán VietQR:** Thời gian chờ đối soát ngân hàng không có nút "Tôi đã chuyển khoản" để trigger kiểm tra tức thì; chưa hiển thị mã QR dự phòng dạng Text copy số tài khoản/ngân hàng nếu ảnh QR lỗi mạng. | Thêm thẻ copy nhanh STK/Ngân hàng/Cú pháp và nút chủ động kiểm tra trạng thái thanh toán. |
| **Learner (Học viên)** | **Medium** | **Coding Sandbox (Bài thực hành code):** Chưa có phím tắt chạy code (Ctrl+Enter / Cmd+Enter); vùng hiển thị test case chưa nêu rõ dữ liệu đầu vào (Input/Expected/Actual) khi test bị fail. | Thêm phím tắt chuẩn dev và bảng so sánh trực quan Input vs Output. |
| **Lecturer (Giảng viên)** | **High** | **Bản đồ kiến thức (Knowledge Map):** AI gợi ý concept và prerequisite còn thiếu trực quan hóa dạng đồ thị nút (Node Graph) trực quan kéo thả; khi có vòng lặp (Cycle), cảnh báo còn chung chung. | Vẽ đường nối rõ ràng giữa các concept và chỉ rõ cặp bài học nào gây ra vòng lặp phụ thuộc. |
| **Lecturer (Giảng viên)** | **Medium** | **Chấm bài (Grading Queue):** Thiếu tính năng chấm nhanh hàng loạt (Batch Grading) hoặc mẫu phản hồi nhanh (Canned Feedback) cho các lỗi phổ biến của học viên. | Thêm các mẫu nhận xét sẵn và bộ lọc phân loại bài nộp theo bài tập/thời gian. |
| **Admin (Quản trị)** | **High** | **Duyệt xuất bản khóa học:** Admin có thể duyệt và đặt giá nhưng thiếu bản xem trước (Live Preview) toàn bộ bài học dưới góc độ học viên trước khi bấm Duyệt. | Bổ sung nút "Xem trước như học viên" (Preview as Learner) trong modal duyệt khóa học. |
| **Admin (Quản trị)** | **Medium** | **Vô hiệu hóa tài khoản:** Thiếu hiển thị hậu quả trực tiếp (ví dụ: các khóa học đang sở hữu, các đơn hàng đang chờ) ngay trong hộp thoại xác nhận vô hiệu hóa. | Liệt kê chi tiết tác động trước khi Admin nhập lý do khóa tài khoản. |

---

## PHẦN 2: CHI TIẾT ĐÁNH GIÁ DƯỚI GÓC ĐỘ NGƯỜI DÙNG

### 1. GÓC NHÌN GUEST (KHÁCH VÃNG LAI)
> *"Tôi là người lần đầu ghé thăm Codi. Tôi muốn biết Codi có gì khác biệt, tìm khóa học tôi cần, xem giá, chất lượng giảng viên và thử đăng ký dễ dàng nhất mà không bị ép buộc rườm rà."*

#### A. Trải nghiệm Trang chủ (`/`) & Thanh điều hướng (Header)
* **Điểm sáng:**
  * Khẩu hiệu giá trị (Value Proposition) rõ ràng: *"Học đúng thứ bạn cần, theo thứ tự hợp lý với bạn"*.
  * Điều hướng tối giản: Chỉ gồm `Khoá học`, `AI Chat`, và nút `Đăng nhập`.
* **Điểm nghẽn UI/UX:**
  * **Thiếu CTA Hero thứ cấp:** Nút chính dẫn vào khóa học, nhưng thiếu nút *"Tìm hiểu cách AI xếp lộ trình"* cho người dùng tò mò về công nghệ cốt lõi của Codi.
  * **Chưa có xem trước học thử (Preview Lesson):** Khách không thể bấm xem thử 1 video ngắn hay 1 bài đọc mẫu để đánh giá chất lượng bài giảng trước khi tạo tài khoản.

#### B. Trải nghiệm Danh mục khóa học (`/courses`)
* **Điểm nghẽn:**
  * Bộ lọc danh mục, trình độ, mức giá nằm ngang nhưng khi lọc ra 0 kết quả, trạng thái Empty State chỉ thông báo chữ mà chưa tự động reset các tiêu chí đối nghịch (ví dụ chọn vừa Miễn phí vừa Nâng cao).
  * Chưa có sắp xếp (Sort by): Không có tùy chọn sắp xếp theo *"Mới nhất"*, *"Đánh giá cao nhất"*, *"Học nhiều nhất"*.

#### C. Trang chi tiết khóa học (`/courses/[slug]`) & Chuyển đổi (Conversion)
* **Điểm nghẽn nghiêm trọng:**
  * **Accordion Đề cương:** Nút "Mở rộng tất cả / Thu gọn tất cả" hoạt động tốt, nhưng danh sách bài học không gắn nhãn trực quan các bài "Có code thực hành" hay "Có Quiz" bằng icon màu sắc, nhìn một danh sách dài dễ ngợp.
  * **Luồng "Thêm vào giỏ" / "Mua ngay":**
    * Khi khách bấm "Thêm vào giỏ", một hộp thoại đăng nhập bật lên với thông điệp: *"Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động."*
    * **Vấn đề UX:** Khách chưa có tài khoản sẽ phải bấm chuyển sang "Tạo tài khoản", trải qua bước OTP 6 số. Nếu sau khi xác thực OTP, hệ thống chuyển thẳng về Dashboard thay vì giữ nguyên trang thanh toán của khóa học họ vừa chọn, khách sẽ bị mất dấu (Drop-off funnel).

---

### 2. GÓC NHÌN LEARNER (HỌC VIÊN)
> *"Tôi đã trả tiền mua khóa học. Tôi muốn vào học ngay, biết mình đang ở đâu, lộ trình tiếp theo là gì, và khi gặp khó khăn về code thì có người hoặc AI trợ giúp ngay lập tức."*

#### A. Bàn làm việc (`/dashboard`)
* **Điểm sáng:**
  * Khu vực Hero *"Tiếp tục học"* rất nổi bật, chiếm trọn sự chú ý, có thanh % tiến độ và nút hành động to rõ.
* **Điểm nghẽn:**
  * Các chỉ số phụ (Giờ học tích lũy, Bài hoàn thành, Điểm trung bình) trình bày còn khô khan, thiếu yếu tố động lực học tập (Gamification: Streak ngày học liên tục, huy hiệu kỹ năng).

#### B. Giỏ hàng (`/cart`) & Thanh toán VietQR (`/checkout`)
* **Điểm sáng:**
  * Xử lý mã giảm giá rất mượt: Nhập `WELCOME20` hoặc `REACT10` tính toán giảm giá ngay tức thì, có thông báo lỗi rõ ràng nếu mã hết hạn hoặc không đủ điều kiện đơn tối thiểu.
  * Tự động loại bỏ khóa học đã sở hữu khỏi giỏ hàng kèm Alert giải thích, tránh mua trùng lặp.
* **Điểm nghẽn:**
  * **Trang thanh toán VietQR (`/checkout`):**
    * Đồng hồ đếm ngược 30 phút trực quan, nhưng chỉ dựa vào Polling tự động. Khi học viên chuyển khoản xong trên app ngân hàng điện thoại, họ có xu hướng muốn bấm một nút *"Tôi đã chuyển khoản"* để hệ thống kiểm tra ngay lập tức thay vì phải chờ 3–5 giây thụ động.
    * Trong trường hợp học viên thanh toán thiếu tiền (kịch bản `underpaid`) hoặc mã hết hạn (kịch bản `expired`), thông báo lỗi chưa kèm nút hỗ trợ trực tiếp (Chat Zalo/Hotline hỗ trợ đối soát).

#### C. Thiết lập lộ trình cá nhân hóa (Onboarding & Diagnostic Test)
* **Điểm nghẽn cốt tử:**
  * **Ép buộc làm bài kiểm tra:** Sau khi thanh toán, học viên bị bắt buộc làm bài kiểm tra 3 bước (Mục tiêu -> Trình độ -> Giờ học) và bài test trắc nghiệm đầu vào.
  * Không có nút *"Tôi là người mới hoàn toàn, muốn học tuần tự"* hoặc *"Để sau"*. Điều này tạo ra rào cản tâm lý lớn cho những người chỉ muốn mua xong là mở ngay video bài 1 để học.
* **Điểm sáng:**
  * Sau khi hoàn thành Diagnostic Test, AI giải thích lý do vì sao một số bài học được đẩy lên trước hoặc cho phép bỏ qua (Skippable), tạo cảm giác lộ trình thực sự "may đo" cho người học.

#### D. Trải nghiệm Phòng học (Lesson Player - `/learn/[courseId]/[lessonId]`)
* **Điểm sáng:**
  * Giao diện Focus Mode ẩn thanh điều hướng rườm rà, tập trung 100% vào nội dung bài học.
  * Tích hợp 2 Drawer bên phải: **AI trợ lý** (giải thích đoạn code, trả lời thắc mắc ngữ cảnh) và **Hỏi đáp giảng viên**.
* **Điểm nghẽn Coding Sandbox (`lesson-react-p01`):**
  * Vùng soạn thảo code giả lập tốt nhưng chưa có tính năng Format Code (Prettier shortcut).
  * Khi test case chạy thất bại, bảng thông báo lỗi chỉ ghi chung chung, thiếu Diff màu đỏ/xanh giữa `Kết quả thực tế (Received)` và `Kết quả kỳ vọng (Expected)`.

---

### 3. GÓC NHÌN LECTURER (GIẢNG VIÊN)
> *"Tôi muốn tạo khóa học nhanh chóng, biết AI đã phân tích cấu trúc bài giảng của tôi thế nào, và xử lý nhanh chóng các bài tập học viên nộp để các bạn không phải chờ đợi."*

#### A. Khu vực Giảng dạy (`/teach`)
* **Điểm sáng:**
  * Menu bên trái có Counter số lượng cần xử lý cực kỳ trực quan: `Chấm bài (5)`, `Hỏi đáp (4)`, `Đánh giá (4)`. Giảng viên đăng nhập vào là thấy ngay việc cần làm.
* **Điểm nghẽn Bản đồ kiến thức (`/teach/courses/[id]?tab=kmap`):**
  * **Kiểm tra vòng lặp phụ thuộc (Cyclic Dependency):** Khi AI phân tích hoặc giảng viên thêm liên kết tiên quyết mà tạo thành vòng tròn lặp (A -> B -> C -> A), hệ thống báo lỗi nhưng chưa làm nổi bật (Highlight) đường nối bị lỗi, khiến giảng viên phải dò thủ công từng cặp concept.
  * Nút "Chấp nhận tất cả gợi ý của AI" (Accept all suggestions) cần có bước xác nhận tóm tắt số lượng concept và liên kết được thêm vào.

#### B. Hàng đợi chấm bài (`/teach/grading`)
* **Điểm sáng:**
  * Cho phép xem link GitHub/Demo của học viên, nhập điểm 0-100 và viết nhận xét chi tiết.
* **Điểm nghẽn:**
  * Chưa có lịch sử chấm bài đã qua (Tab "Đã chấm") để giảng viên xem lại và chỉnh sửa điểm số nếu học viên khiếu nại hoặc nộp bài cải thiện.

---

### 4. GÓC NHÌN ADMIN (QUẢN TRỊ VIÊN)
> *"Tôi chịu trách nhiệm về vận hành, tài chính, kiểm duyệt nội dung và an toàn tài khoản người dùng."*

#### A. Duyệt xuất bản khóa học (`/admin/courses`)
* **Điểm sáng:**
  * Kiểm tra đầy đủ checklist điều kiện: Có đề cương, có bài test đầu vào, có mục tiêu rõ ràng.
  * Buộc Admin phải định giá chính thức (VND) trước khi phê duyệt.
  * Nếu từ chối, bắt buộc nhập lý do cụ thể gửi về giảng viên.
* **Điểm nghẽn:**
  * Chưa có tính năng kiểm tra bản quyền hoặc quét từ khóa nhạy cảm tự động trong nội dung bài học của giảng viên.

#### B. Quản lý người dùng (`/admin/users`)
* **Điểm sáng:**
  * Phân quyền (Learner, Lecturer, Admin) có modal xác nhận rõ ràng.
  * Thao tác vô hiệu hóa tài khoản (Deactivate) được thiết kế an toàn (Danger modal, buộc nhập lý do, giải thích rõ phiên đăng nhập sẽ bị thu hồi ngay).
* **Điểm nghẽn:**
  * Chưa có bộ lọc theo trạng thái: Hiện chỉ tìm kiếm bằng chữ, chưa có dropdown lọc nhanh `Chỉ xem tài khoản bị khóa` hoặc `Chỉ xem Giảng viên`.

#### C. Đơn hàng & Đối soát giao dịch (`/admin/orders`)
* **Điểm sáng:**
  * Hiển thị mã đơn `CODI#####` đồng bộ với cú pháp VietQR của học viên, rất thuận tiện khi đối soát sao kê ngân hàng.
  * Drawer chi tiết đơn hàng hiển thị đầy đủ Timeline (Tạo đơn -> Nhận tiền -> Hoàn tiền/Hủy).
* **Điểm nghẽn:**
  * Thiếu nút "Xuất báo cáo Excel/CSV" để kế toán đối soát định kỳ hàng tuần/tháng.

---

## PHẦN 3: ĐÁNH GIÁ CHẤT LƯỢNG NỘI DUNG (CONTENT & TONE OF VOICE)

1. **Ngôn ngữ & Thuật ngữ:**
   * Sử dụng tiếng Việt tự nhiên, chuẩn mực, tôn trọng quy tắc thiết kế (không viết hoa tùy tiện toàn bộ chữ cái).
   * Các thuật ngữ kỹ thuật (JSX, Props, State, App Router, BKT Mastery) được giữ nguyên chuẩn ngành IT, giải thích ngắn gọn, dễ hiểu cho học viên mới.
2. **Thông báo lỗi & Trạng thái (Feedback Copywriting):**
   * Các câu thông báo lỗi form và voucher rất thân thiện: Thay vì "Lỗi mã", app ghi rõ: *"Mã giảm giá không tồn tại. Kiểm tra lại chính tả."* hoặc *"Đơn hàng cần tối thiểu 500.000 ₫ để dùng mã này."*
   * Tuy nhiên, ở màn hình lỗi tải bài học hoặc kịch bản AI không phản hồi, cần bổ sung gợi ý: *"Vui lòng thử lại sau ít phút hoặc liên hệ đội ngũ hỗ trợ qua Zalo/Email"*.

---

## PHẦN 4: LỘ TRÌNH ĐỀ XUẤT CẢI THIỆN (ACTIONABLE ROADMAP)

* **Ưu tiên 1 (P0 - Sửa ngay):**
  1. Thêm tùy chọn *"Bỏ qua bài kiểm tra đầu vào (Học theo thứ tự mặc định)"* trong luồng Onboarding để mở khóa trải nghiệm học ngay cho học viên.
  2. Bổ sung nút copy nhanh STK ngân hàng và nút *"Tôi đã chuyển khoản"* ở màn hình thanh toán VietQR.
  3. Đảm bảo sau khi đăng nhập từ nút "Thêm vào giỏ", hệ thống điều hướng thẳng đến giỏ hàng hoặc tiếp tục thanh toán khóa học tương ứng.
* **Ưu tiên 2 (P1 - Nâng cấp UX):**
  1. Bổ sung bộ lọc trạng thái và nút xuất CSV trong Quản lý đơn hàng của Admin.
  2. Thêm tab "Lịch sử đã chấm" trong khu vực Giảng viên.
  3. Thêm phím tắt `Ctrl + Enter` chạy code và bảng so sánh Expected/Actual trong bài thực hành code.
* **Ưu tiên 3 (P2 - Tối ưu hóa & Đánh bóng UI):**
  1. Bổ sung Node Graph trực quan kéo thả cho Bản đồ kiến thức (Knowledge Map).
  2. Tích hợp thanh Streak ngày học và huy hiệu khuyến khích tại Dashboard học viên.
