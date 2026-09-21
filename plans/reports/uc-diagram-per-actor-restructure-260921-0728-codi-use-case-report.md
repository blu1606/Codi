# UC Diagram Codi — Tách theo Actor + Xử lý feedback giảng viên

Cập nhật: 2026-09-21 (vòng 6 — rà lại tab Learner sau khi tách view AI)
Input: `UC.drawio` (bản gốc, 4 package trong 1 trang — giữ nguyên không sửa)
Output: `UC-by-actor.drawio` (7 tab: 1 cây actor, 5 tab actor, 1 view AI)

---

## 1. Quy luật vẽ UC diagram (research)

### Đặt tên
- **Actor** = danh từ, là **vai trò** chứ không phải người/chức danh cụ thể.
- **Use case** = **động từ + danh từ** ("Submit Assignment", "Update User Role").
- **Tên diagram** = `<Actor> - <mô tả nhóm chức năng>` (theo yêu cầu GV).

### 3 quan hệ
| Quan hệ | Ý nghĩa | Mũi tên |
|---|---|---|
| `<<include>>` | Hành vi **bắt buộc**, luôn chạy | base ⇢ included (nét đứt, đầu mở) |
| `<<extend>>` | Hành vi **tuỳ chọn/có điều kiện**, base vẫn đứng độc lập | extending ⇢ base (nét đứt, đầu mở) |
| Generalization | Kế thừa: con có **mọi** use case của cha | con → cha (nét liền, tam giác rỗng) |

Quy tắc kiểm: bước *có thể bỏ qua* → `extend`. Bước *luôn phải chạy* → `include`.

### Lỗi thường gặp
1. Nhầm include ↔ extend (lỗi số 1).
2. Vẽ actor bên trong system boundary.
3. **Functional decomposition** — chẻ UC thành từng thao tác. Dấu hiệu: rất nhiều `include`, base rỗng, mỗi included UC chỉ 1 base dùng.
4. >20 UC trong 1 diagram → phải tách.
5. UC không có primary actor.
6. Vẽ "làm thế nào" thay vì "cái gì".

### Granularity
Cockburn "sea level": mỗi UC = một mục tiêu người dùng hoàn thành trong một lần ngồi.

---

## 2. Feedback GV — cách xử lý

| # | Feedback | Xử lý | Vị trí |
|---|---|---|---|
| 1 | `Browse` và `Search Published Course` bị trùng | Gộp thành **`Search Published Courses`**. Note trong diagram: duyệt catalog và search keyword/filter là cùng một mục tiêu, chỉ khác input | Tab 1 |
| 2 | Đặt tên diagram theo `Actor - mô tả chức năng` | Tên đặt **làm nhãn của system boundary**: `Codi: <Actor> - <nhóm chức năng>`, theo đúng convention file gốc. Tên tab trùng tên đó | Toàn bộ |
| 3 | "Guest sao Sign In được?" | **Bỏ `Sign In` khỏi Guest.** Guest chỉ còn: Search Published Courses, View Course Details, Register Account. `Sign In` / `Sign Out` / `Recover Password` chuyển sang Registered User. Note ghi rõ lý do | Tab 1, 2 |
| 4 | AI Service có thực sự là secondary actor? | **Có, và nối 4 UC** — xem vòng 5 ở mục 9. Bản vòng 2 trả lời sai (chỉ nối chatbot), khiến AI không hề personalize gì, trái tên đề tài | Tab 3, 4 |
| 5 | Làm rõ UC của Learner (xem vid, làm assignment, nộp assignment) | Thêm: `Study Lesson Material`, `Submit Assignment`, `View Assignment Feedback`, `Post Course Question`, `Submit Course Review`. Note liệt kê material = lecture video / PDF-slide / reading text | Tab 3 |
| 6 | Lecturer viết dễ hiểu hơn, chia rõ / gộp | **Giữ động từ CRUD, gộp đối tượng CRUD.** Thay vì CRUD riêng cho Lesson / Quiz / Assignment → một đối tượng chung **`Course Content`**: `Create` / `Update` / `Delete Course Content`. Bỏ `Reorder Course Lessons` và `Update Course Details` (đã nằm trong Course Content). Lecturer từ 15 UC → 9 UC | Tab 4 |
| 7 | Admin gộp active/deactive, grant/revoke | `Activate` + `Inactive User Account` → **`Update User Account Status`**. `Grant` + `Revoke User Role` → **`Update User Role`**. Dùng động từ CRUD `Update` thay vì "Manage". Chi tiết từng thao tác đưa xuống use case specification, có note | Tab 5 |

---

## 3. Chốt nghiệp vụ (từ QnA)

| Hạng mục | Kết quả |
|---|---|
| Kiến trúc AI | ~~Rule-engine nội bộ + LLM cho chatbot~~ → **sửa ở vòng 5**: LLM dựng knowledge map và xếp lộ trình; rule chỉ giữ ràng buộc tiên quyết |
| Nội dung lesson | Video bài giảng, tài liệu đọc (text/PDF/slide), quiz trắc nghiệm (hệ tự chấm), assignment nộp file (Lecturer chấm) |
| Tương tác khác của Learner | Hỏi đáp với Lecturer, đánh giá khoá học. **Không có** certificate |
| Phạm vi Personalized Learning Path | **Trong từng khoá học** (không phải xuyên platform) |
| Cấu trúc khoá | Course → Lesson (2 cấp) |
| Lecturer thêm | Tạo/sửa quiz + ngân hàng câu hỏi, phản hồi review. **Không** tự đặt giá / xem doanh thu |
| Thanh toán | **Tất cả khoá đều trả phí** → bỏ `Enroll in Course`, chỉ còn `Purchase Course` `<<include>>` `Confirm Payment` |
| Giá khoá học | **Admin đặt giá**, không phải Lecturer → UC `Update Course Price` nằm ở tab Admin; `Update Course Details` của Lecturer không bao gồm giá |
| Hoàn tiền | Ngoài scope kỳ này |
| Bài diagnostic | **Lecturer soạn**, dưới dạng một course quiz được đánh dấu là bài kiểm tra đầu vào → `Create / Update Course Quiz` đã bao, không thêm UC |
| Đặt tên | Dùng động từ CRUD (Create/Update/Delete), **tránh từ "Manage"** |
| Quiz/Assignment | Chỉ `Create` + `Update` (xoá là alternate flow của Update) |

---

## 4. Cấu trúc `UC-by-actor.drawio`

| Tab | Tên diagram | UC chính | UC include/extend | Supporting actor |
|---|---|---|---|---|
| 0 | Codi - Actor Hierarchy | — | — | AI Service, Payment System, Email Service |
| 1 | Guest - Course Discovery and Registration | 3 | 1 | Email Service |
| 2 | Registered User - Account and Session | 4 | 1 | — |
| 3 | Learner - Enrollment, Learning and Assessment | 11 | 3 | Payment System, AI Service |
| 4 | Lecturer - Course Authoring and Learner Support | 9 | 2 | AI Service |
| 5 | Admin - User, Course and Transaction Administration | 8 | 1 | — |

### Cây actor
```
Guest  ←  Registered User  ←  { Learner, Lecturer, Admin }
```
`Guest` là actor gốc. Toàn bộ generalization gom vào tab 0 → các tab actor chỉ còn association + include/extend, không còn rối.

### Danh sách UC

**Tab 1 — Guest**
`Search Published Courses` · `View Course Details` · `Register Account` `<<include>>` `Verify Email Address` → Email Service

**Tab 2 — Registered User**
`Sign In` ⇠`<<extend>>`⇠ `Recover Password` · `Sign Out` · `Update Personal Profile` · `Change Password`

**Tab 3 — Learner**
`Purchase Course` `<<include>>` `Confirm Payment` → Payment System
`Set Course Learning Goal`
`Complete Course Diagnostic Assessment` `<<include>>` `Generate Personalized Learning Path` → AI Service
`View Personalized Learning Path`
`Study Course Lesson` `<<include>>` `Update Personalized Learning Path` → AI Service
`Submit Course Quiz` · `Submit Assignment` · `Post Course Question` · `Ask AI Learning Assistant` → AI Service · `Submit Course Review` · `View Learning Progress and Results`

**Tab 4 — Lecturer**
`Create Course`
`Create Course Content` `<<include>>` `Extract Course Knowledge Map` → AI Service
`Update Course Content` · `Delete Course Content`
`Grade Assignment Submission` · `Answer Course Question` · `Respond to Course Review`
`Request Course Publication` `<<include>>` `Validate Publication Requirements`
`View Learner Progress and Results`

**Tab 5 — Admin**
`View Administration Dashboard` · `View User Accounts` · `Update User Account Status` · `Update User Role` · `View Orders and Transactions`
`Review Course Publication Request` `<<include>>` `Validate Course Content` · `Update Course Price` · `Hide Published Course`

### Quy ước layout
- Actor chính ngoài boundary bên trái, nhãn đặt bên trái stick figure để không bị các đường association cắt qua.
- Cột trái = UC do actor chính khởi xướng. Cột phải = UC được include/extend hoặc do hệ thống ngoài phục vụ.
- Supporting actor ngoài boundary bên phải. Note box ở lề ngoài cùng.
- **Không có đường nào cắt qua use case** — đã render cả 6 tab ra PNG để kiểm.

---

## 5. Phân biệt hai UC validate (tránh trùng như bản cũ)

| UC | Ai chạy | Khi nào | Nội dung |
|---|---|---|---|
| `Validate Publication Requirements` | Hệ thống (include từ UC của Lecturer) | Lúc Lecturer bấm gửi duyệt | Kiểm tự động: có giá, có mô tả, có ít nhất 1 lesson |
| `Validate Course Content` | Admin (include từ UC của Admin) | Lúc Admin review request | Kiểm thủ công chất lượng nội dung |

---

## 6. Các điểm đã chốt (vòng 3)

Nguyên tắc chung: **không phức tạp hoá diagram**. Chỉ thêm UC khi đó thực sự là một mục tiêu riêng của actor; còn lại ghi vào note trong diagram và vào use case specification.

| Điểm | Quyết định | Thể hiện trong diagram |
|---|---|---|
| Ai đặt giá khoá học | **Admin** | UC `Update Course Price` ở tab Admin. Note ghi rõ Lecturer không sở hữu giá |
| Hoàn tiền | **Ngoài scope** | Không thêm UC nào |
| Ai soạn bài diagnostic | **Lecturer**, soạn dưới dạng course quiz đánh dấu là bài kiểm tra đầu vào | Không thêm UC. Nằm trong `Course Content`, có note giải thích |
| `Set Course Learning Goal` trước diagnostic | **Có**, là precondition | Không vẽ quan hệ. Note ở tab Learner |
| Guest xem review khoá học | **Có** | Không thêm UC. Note: `View Course Details` đã hiển thị rating + review |

---

## 7. Sửa vòng 4

### 7.1 `Update Personalized Learning Path`: đổi `extend` → `include`, và đổi base

Bản trước: `Submit Course Quiz` ⇠`<<extend>>`⇠ `Update Personalized Learning Path`. **Sai hai chỗ.**

- **Sai base.** Nghiệp vụ thực tế: học xong một lesson mới tính lại lộ trình, lấy cả kết quả quiz lẫn assignment của lesson đó. Base đúng là `Study Course Lesson`, không phải `Submit Course Quiz`.
- **Sai stereotype.** `extend` nghĩa là *có thể không chạy*, và base phải khai báo extension point + guard condition. Ở đây hoàn thành lesson là **luôn** tính lại lộ trình → phải là `include`.

Bản mới: `Study Course Lesson` `<<include>>` `Update Personalized Learning Path`. Nhất quán với cặp `Complete Course Diagnostic Assessment` `<<include>>` `Generate Personalized Learning Path`.

`Study Lesson Material` đổi tên về `Study Course Lesson` (tên trong bản gốc) vì giờ nó mang nghĩa hoàn thành lesson, không chỉ xem tài liệu. Các loại material vẫn ghi trong note.

Cả model giờ chỉ còn **một** quan hệ `extend`: `Recover Password` ⇠`<<extend>>`⇠ `Sign In` — đúng nghĩa vì chỉ chạy khi người dùng không đăng nhập được.

### 7.2 Tên diagram đặt trên boundary

Trước: tiêu đề nổi phía trên boundary + nhãn boundary là `Codi` → hai tên cạnh nhau, rối.

Nay: **nhãn boundary mang luôn tên diagram** — ví dụ `Codi: Learner - Enrollment, Learning and Assessment`. Đúng convention của file gốc (`Codi: Public Access, Account, and Course Enrollment`). Bỏ tiêu đề nổi. Tên tab đặt trùng để dễ tìm.

### 7.3 Lecturer: 15 UC → 9 UC

Gộp **đối tượng** CRUD, không gộp động từ CRUD — giữ đúng ý GV là "tách UC thì nói CRUD":

| Trước (10 UC) | Sau (3 UC) |
|---|---|
| `Update Course Details`, `Create / Update / Delete Course Lesson`, `Reorder Course Lessons`, `Create / Update Course Quiz`, `Create / Update Course Assignment` | `Create Course Content`, `Update Course Content`, `Delete Course Content` |

`Course Content` = mọi thứ bên trong khoá: lesson và material của nó (video, PDF/slide, reading text), quiz, assignment, thứ tự lesson, mô tả khoá. Note trong diagram liệt kê đầy đủ.

Bỏ hẳn theo yêu cầu: `Reorder Course Lessons`, `Update Course Details`.

**Tab Lecturer sau khi gọn (9 UC):**
`Create Course` · `Create Course Content` · `Update Course Content` · `Delete Course Content` · `Grade Assignment Submission` · `Answer Course Question` · `Respond to Course Review` · `Request Course Publication` `<<include>>` `Validate Publication Requirements` · `View Learner Progress and Results`

---

## 8. Việc còn lại

Diagram đã xong. Bước tiếp theo là viết **use case specification**, nơi ghi các chi tiết đã cố tình để ngoài diagram:

- `Create / Update / Delete Course Content` — tách flow theo từng đối tượng: lesson, material, quiz, assignment, thứ tự lesson, mô tả khoá
- `Create / Update Course Content` — cờ đánh dấu quiz nào là bài kiểm tra đầu vào
- `Update User Account Status` — activate / deactivate
- `Update User Role` — grant / revoke
- `Study Course Lesson` — điều kiện coi là hoàn thành lesson (xem hết material + nộp quiz/assignment), vì đây là trigger của `Update Personalized Learning Path`
- `Complete Course Diagnostic Assessment` — precondition: đã `Set Course Learning Goal`
- `View Course Details` — hiển thị kèm rating và review
- `Recover Password` — extension point và guard condition trên `Sign In`

Không còn câu hỏi nghiệp vụ nào đang mở.

---

## 9. Sửa vòng 5 — AI vào đúng vai trò trong learning path

**Vấn đề.** Vòng 2 chốt "rule-engine nội bộ + LLM ngoài cho chatbot", nên `AI Service` chỉ nối `Ask AI Learning Assistant`. Hệ quả: trên diagram, AI **chỉ làm chatbot và không personalize gì** — trái với tên đề tài *using AI to personalize learning path*.

**Đã sửa.**

| Tab | Thay đổi |
|---|---|
| 3 — Learner | `AI Service` nối thêm `Generate Personalized Learning Path` và `Update Personalized Learning Path` (tổng 3 UC) |
| 4 — Lecturer | Thêm `Create Course Content` `<<include>>` `Extract Course Knowledge Map` → `AI Service` |

**Ranh giới AI / rule** (ghi trong note ngay trên diagram):
- **AI**: trích knowledge concept + quan hệ tiên quyết từ nội dung khoá; xếp thứ tự lộ trình theo mastery và learning goal; viết lý do cho learner đọc; chatbot hỏi đáp.
- **Rule (không phải AI)**: thứ tự tiên quyết là **ràng buộc cứng** AI không được phá; mastery tính bằng công thức để còn test được.

Research đầy đủ (4 họ kỹ thuật, vì sao chọn LLM + knowledge graph, cách trả lời GV): `ai-role-in-personalized-learning-path-260921-0824-codi-architecture-research-report.md`

### Câu hỏi còn mở sau vòng 5
1. ~~Lecturer sửa knowledge map?~~ → **Không**, không thêm UC.
2. ~~Lớp đánh giá năng lực?~~ → **BKT**, không đổi diagram.
3. ~~Cache lộ trình?~~ → **Có**, nhưng là tối ưu nội bộ nên `<<include>>` giữ nguyên.
4. ~~AI Service tách thành primary actor?~~ → **Không** (sai UML), thay bằng **tab 6 `AI Service - Where AI Works`**, một view gom cả 4 use case AI về một hình. AI Service vẫn là supporting actor.
5. Còn mở: chọn LLM provider; ngưỡng cache cụ thể; Lecturer có được xem map read-only không.

---

## 10. Rà vòng 6 — tab Learner sau khi tách view AI

Đếm UC từng tab sau vòng 5: Guest 4 · Registered User 5 · **Learner 15** · Lecturer 11 · Admin 9 · AI view 7. Learner là ngoại lệ rõ rệt.

### Trùng thật: 1 chỗ

`View Assignment Feedback` nằm trọn trong `View Learning Progress and Results` — cả hai đều là "xem mình làm được đến đâu". **Đã gộp.** Note ghi rõ `View Learning Progress and Results` gồm điểm quiz, điểm assignment và nhận xét của Lecturer trên từng bài nộp.

### Không trùng, giữ nguyên

| Cặp nghi ngờ | Kết luận |
|---|---|
| `View Personalized Learning Path` vs `View Learning Progress and Results` | Khác mục tiêu: "tiếp theo học gì" vs "mình đang thế nào". Giữ cả hai |
| `Submit Course Quiz` vs `Submit Assignment` | Khác cách chấm (hệ tự chấm vs Lecturer chấm) → khác luồng, khác actor tham gia. Giữ |
| `Set Course Learning Goal` vs `Complete Course Diagnostic Assessment` | Khai báo mục tiêu vs làm bài kiểm tra. Là hai goal riêng, chỉ có quan hệ precondition |
| `Post Course Question` vs `Ask AI Learning Assistant` | Cùng là "gỡ rối" nhưng một bên hỏi người, một bên hỏi AI — khác actor tham gia hoàn toàn. Giữ |

### Sửa layout

`Ask AI Learning Assistant` trước nằm ở cột phải (chỉ vì lý do vẽ, để với tới AI Service) — sai về mặt ngữ nghĩa vì nó là **goal do Learner khởi xướng**, không phải UC được include. Đã chuyển sang cột trái; đặt `AI Service` ngang hàng với nó nên ba đường nối AI vẫn không cắt qua UC nào. Bỏ luôn đường routing vòng dưới đáy.

Giờ quy ước sạch: **cột trái = goal Learner khởi xướng, cột phải = hành vi được include.**

### Trùng giữa tab 3 và tab 6 (view AI)

Tab 6 lặp lại `Complete Course Diagnostic Assessment`, `Study Course Lesson`, `Ask AI Learning Assistant`, `Generate/Update Personalized Learning Path` từ tab 3, và `Create Course Content` từ tab 4.

**Đây là lặp có chủ ý và chấp nhận được.** Trong UML, một use case là một phần tử trong model và được phép xuất hiện trên nhiều diagram — mỗi diagram là một view. Tab 6 phải vẽ lại base use case thì quan hệ `<<include>>` mới đúng; nếu chỉ nối thẳng Learner tới `Generate Personalized Learning Path` thì lại sai, vì Learner không trực tiếp khởi xướng UC đó.

**Cái giá phải trả:** drawio không có model dùng chung, nên đây là lặp theo nghĩa đen. Đổi tên một UC thì phải đổi ở cả hai tab. Đã ghi cảnh báo này trong note của tab 6.

### Kết quả

Learner **15 → 14** UC (11 chính + 3 include). Vẫn là tab lớn nhất nhưng đúng — Learner là actor trung tâm của một nền tảng học tập, và 11 goal đều phân biệt được.
