# Đánh giá DB schema V5 + Thiết kế lại v6

Ngày: 2026-09-21
Input: `AI_Personalized_Learning_V5_NEW_STANDALONE.sql` (29 bảng)
Output: `database/schema-v6.sql` (28 bảng) + `database/ERD.drawio` (10 tab) + `database/exports/` (PNG, SVG, PDF)

---

## 1. Kết luận nhanh

Nhận xét của GV đúng cả hai vế, và còn thiếu một vế thứ ba:

| Vấn đề | Mức | Số lượng |
|---|---|---|
| **Lỗi kỹ thuật làm hệ thống không chạy được** | Nghiêm trọng | 2 lỗi chặn + 2 lỗi runtime |
| **Thiếu nghiệp vụ** (UC không có chỗ lưu) | Cao | 9 chỗ |
| **Chia bảng quá mức** | Trung bình | 3 bảng |

Hai lỗi đầu tiên chưa ai phát hiện vì schema **chưa từng được chạy với dữ liệu thật** — chúng chỉ nổ ở hàng thứ hai.

---

## 2. Lỗi kỹ thuật

### 2.1 `NULL UNIQUE` — user thứ hai không insert được (CHẶN)

```sql
password_reset_token VARCHAR(255) NULL UNIQUE,   -- users
course_code          VARCHAR(50)  NULL UNIQUE,   -- courses
```

SQL Server coi **NULL bằng NULL** trong ràng buộc UNIQUE, nên **chỉ một hàng được phép NULL**. Hầu hết user không có token reset ⇒ insert user thứ hai là `Violation of UNIQUE KEY constraint`. Tương tự, chỉ đúng một course được để trống `course_code`.

Đây là điểm khác biệt nổi tiếng giữa SQL Server và Postgres/MySQL — code chạy ngon ở MySQL sẽ chết ở SQL Server.

**Sửa:** filtered index.
```sql
CREATE UNIQUE INDEX UX_users_password_reset_token
    ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;
```

### 2.2 Xung đột cascade lúc runtime — không xoá được assessment đã có bài nộp

Mình viết một linter chạy trên cả hai schema:

```
=== V5 ===  tables 29 | FK 50 (cascade 21) | 16 runtime cascade conflicts
=== V6 ===  tables 28 | FK 59 (cascade 14) | LINT CLEAN
```

Lỗi cốt lõi:

```
DELETE trên assessments  → cascade vào quiz_questions
                         → cascade vào assessment_submissions → assessment_answers
assessment_answers.question_id → quiz_questions  là NO ACTION
```

Thứ tự xoá không xác định ⇒ khi engine xoá `quiz_questions` trước, `assessment_answers` vẫn trỏ tới ⇒ **FK violation, cả lệnh DELETE fail**. Lỗi này lan từ 4 gốc khác nhau: `assessments`, `lessons`, `chapters`, `courses` — tức là **không xoá được cả một khoá học** nếu có ai đã làm bài.

*(Trong 16 cảnh báo, 4 cái liên quan `parent_comment_id` tự trỏ chính nó nhiều khả năng là false positive — SQL Server xử lý được khi xoá cả tập. 12 cái còn lại là thật.)*

**Sửa:** `assessments → assessment_submissions` chuyển sang NO ACTION. Bài đã chấm không được biến mất theo; muốn gỡ assessment thì đặt `status = 'DISABLED'`.

### 2.3 Cascade từ `courses` toả ra quá rộng

V5 cascade từ `courses` xuống gần như mọi thứ. Vì `lesson_skills` đến được từ **cả** `lessons` lẫn `skills`, và `quiz_questions` đến được từ **cả** `assessments` lẫn `skills`, DELETE một course là một mớ phụ thuộc thứ tự.

**Sửa:** bỏ hết cascade từ `courses`. Khoá học vốn được gỡ bằng `status = 'DISABLED'`, không bao giờ xoá cứng — cascade chẳng mang lại gì ngoài rủi ro. Số cascade giảm 21 → 14.

---

## 3. Thiếu nghiệp vụ

Đối chiếu từng UC trong `UC-by-actor.drawio` với schema:

| # | UC | Thiếu gì ở V5 | v6 giải quyết |
|---|---|---|---|
| 1 | UC-12 Set Course Learning Goal | Chỉ có `paths.target_goal NVARCHAR(500)` — text tự do, lại **đặt sai chỗ**: goal là *input* của việc sinh path, không phải *output* | `enrollments.learning_goal` VARCHAR có CHECK + `target_skill_id` |
| 2 | **BKT không triển khai được** | `student_skill_mastery` chỉ có `mastery_score`. Không có chỗ nào chứa 4 tham số BKT (P_init, P_learn, P_guess, P_slip) | 4 cột trên `skills` + CHECK `guess + slip < 1` (ràng buộc định danh của Beck) |
| 3 | Bài diagnostic không truy được về concept | Diagnostic là bài test **cấp khoá** nên không có lesson; V5 không có đường nào từ câu trả lời đầu vào tới skill | `quiz_questions.lesson_id` — xem mục 12 |
| 4 | UC-13 Diagnostic | `assessments.lesson_id NOT NULL` ⇒ bài test đầu vào của **khoá** phải gắn tạm vào một lesson nào đó | `course_id NOT NULL` + `lesson_id NULL` + filtered unique: 1 diagnostic / khoá |
| 5 | Cache lộ trình | Không có gì để biết mastery đã đổi đủ nhiều hay chưa ⇒ phải gọi LLM sau **mọi** lesson | `paths.mastery_snapshot_hash` + `generation_trigger` + `source_submission_id` |
| 6 | UC-26 Extract Course Knowledge Map | Không ghi nhận map do AI sinh, không biết sinh lúc nào, từ nội dung nào | 4 cột `knowledge_map_*` trên `courses` + `skills.source` |
| 7 | UC-16 "video, PDF/slide, reading text" | `lessons` chỉ có **một** `video_url` + một blob text. PDF/slide không có chỗ lưu | Bảng `lesson_materials` |
| 8 | UC-21 Post Course Question | `lesson_comments.lesson_id NOT NULL` ⇒ **không hỏi được câu hỏi cấp khoá** | `course_discussions` với `lesson_id` NULL |
| 9 | UC-31 Respond to Course Review | `course_reviews` không có cột nào để Lecturer trả lời | `lecturer_reply` + `replied_by` + `replied_at` |

Ngoài ra V5 không ghi lại **ai** đổi giá khoá học (UC-38 nói Admin sở hữu giá), và không ghi **ai** khoá/mở tài khoản (UC-40).

---

## 4. Chia bảng quá mức

| Bảng V5 | Vấn đề | v6 |
|---|---|---|
| `quiz_details` | Bảng 1:1 chứa đúng **3 cột BIT** | Gộp vào `assessments` |
| `assignment_details` | Bảng 1:1 chứa **4 cột** | Gộp vào `assessments` |
| `assessment_comments` | Bảng comment phân luồng trên bài nộp, nhưng **không UC nào** dùng. Feedback chấm bài đã nằm ở `assessment_submissions.grading_feedback` | Bỏ |
| `lesson_comments` + `assessment_comments` | Hai bảng comment gần như giống hệt | Gộp thành `course_discussions` |

Riêng `chapters` **giữ nguyên**, dù UC chốt "Course → Lesson". Không mâu thuẫn: UC `Course Content` cố ý gộp chi tiết lại, còn DB thì cần cấu trúc chương thật.

`vouchers` và `order_items` cũng giữ — xem mục 6.

**Kết quả: 29 → 28 bảng, mà nghiệp vụ phủ nhiều hơn hẳn.**

---

## 5. Các sửa khác

| Hạng mục | V5 | v6 |
|---|---|---|
| Kiểu thời gian | `DATETIME` + `GETDATE()` (giờ local, không timezone) | `DATETIME2(3)` + `SYSUTCDATETIME()` |
| Vai trò người dùng | 1 role/user | `user_roles` có `granted_by` / `revoked_at` — đúng nghĩa grant/revoke, và Lecturer học được khoá khác |
| Đếm lesson / thời lượng | Cột denormalize `total_lessons`, `total_duration_minutes` không có cơ chế cập nhật ⇒ chắc chắn lệch | View `vw_course_stats` |
| `p_mastery` | `DECIMAL(5,2)` thang 0–100 | `DECIMAL(6,5)` thang 0–1 — nó là **xác suất** BKT |
| Skill | Toàn cục, `skill_name` UNIQUE toàn hệ thống ⇒ AI hai khoá sinh "Recursion" là va nhau | Theo khoá: `UNIQUE(course_id, skill_name)` |
| Mastery | Theo `student_id` | Theo `enrollment_id` (vì skill giờ theo khoá) |
| Index | 26, thiếu index cho `courses(status)` mà UC-03 lọc mọi lần | 43, gồm index phủ cho catalog và filtered index cho hàng đợi chấm bài |
| Ràng buộc trạng thái | Không có | `status='GRADED'` bắt buộc có điểm + thời điểm chấm; `PUBLISHED` bắt buộc có giá; ... |
| Log AI | Không có token / latency | Có, để báo cáo định lượng được chi phí AI |

Check constraint: **58 → 82**.

---

## 6. Voucher / giỏ hàng — ĐÃ LÀM

Giữ voucher + giỏ hàng nên phải bổ sung UC. Đã thêm vào **cả** `UC-by-actor.drawio` **và** bảng use case trong RDS:

| UC | Actor | Quan hệ |
|---|---|---|
| UC-10 `Add Course to Cart` | Learner | — |
| UC-13 `Apply Voucher` | Learner | `<<extend>>` `Purchase Course` — đơn hàng vẫn đi được dù không có mã |
| UC-33 `Create Voucher` | Admin | nhóm mới `Voucher Administration` |
| UC-34 `Update Voucher` | Admin | vô hiệu hoá mã là alternate flow |

Tổng **43 → 47 UC**. Learner 11→13, Admin 8→10. Đã đánh số lại toàn bộ UC-01..UC-47 trong RDS.

Script so khớp xác nhận: `diagram: 47 | document: 47 | MATCH`.

`Apply Voucher` là quan hệ `extend` thứ hai trong toàn model (cùng `Recover Password`) và đúng nghĩa sách vở: hành vi tuỳ chọn tại một extension point trong luồng checkout.

---

## 7. Kiểm chứng — đã chạy trên SQL Server thật

Máy có sẵn **SQL Server 2022 (16.0.1000.6)**. Lưu ý: database `Codi` trên máy đã tồn tại (tạo 21/09 09:51), nên mình **không đụng vào nó** — test trên database tạm `Codi_v6_verify` rồi xoá.

### 7.1 DDL

```
batches to run: 46
ALL 46 BATCHES EXECUTED WITHOUT ERROR

tables 28 | views 2 | foreign keys 59 | check constraints 82
cascade deletes 14 | filtered indexes 8 | seeded roles 3
```

Khớp chính xác số liệu linter dự đoán.

### 7.2 Smoke test — `database/smoke_test.sql`

20 kịch bản, mỗi cái cố tình vi phạm một ràng buộc để xem nó có chặn không. **20 PASS / 0 FAIL.**

Đáng chú ý, test đầu tiên **tái hiện lỗi V5** bằng chính SQL Server:

```
--- 0. the V5 bug, reproduced ---
  PASS  second NULL rejected: Violation of UNIQUE KEY constraint
        'UQ__#v5_styl__...'. The duplicate key value is (<NULL>).
  PASS  three users inserted, all with NULL password_reset_token
```

Đoạn này đưa cho GV xem là đủ chứng minh, không cần giải thích lý thuyết.

Các ràng buộc đã chứng minh có hiệu lực: xuất bản khoá không giá · BKT `guess+slip ≥ 1` · skill tự làm tiên quyết cho chính nó · hai diagnostic trong một khoá · diagnostic gắn vào lesson · assignment thiếu submission format · learning goal thiếu target skill · enroll trùng · submission GRADED không điểm · `p_mastery` ngoài [0,1] · hai learning path ACTIVE · review trùng enrollment · xoá assessment đã có bài chấm.

Hai view cũng trả về số liệu đúng: `total_lessons=1, average_rating=5.0` và `average_mastery=0.142`.

### 7.3 Kiểm tra tĩnh

`database/lint_schema.py` chạy trên cả hai schema:

```
V5:  29 bảng | 50 FK (21 cascade) | 16 runtime cascade conflicts
V6:  28 bảng | 59 FK (14 cascade) | LINT CLEAN
```

ERD sinh tự động từ chính file SQL nên hình và DDL không thể lệch.

---

## 8. Còn phải quyết

1. **Giá trị khởi tạo BKT.** Đang để `P_init=0.1, P_learn=0.2, P_guess=0.2, P_slip=0.1`. Với trắc nghiệm 4 đáp án thì `P_guess=0.25` sát hơn — team chọn con số nào? Sửa ở `DEFAULT` của bảng `skills`.
2. **Ngưỡng cache lộ trình.** `mastery_snapshot_hash` đã có chỗ, nhưng "mastery đổi bao nhiêu thì gọi lại LLM" vẫn cần một con số để viết NFR và test.
3. **`skill_prerequisites` cùng khoá.** SQL Server không biểu diễn được ràng buộc "hai skill phải cùng course" bằng CHECK. Đang để application lo — muốn thêm trigger không?
4. **Đặt tên PK/UNIQUE tường minh?** Hiện các primary key và unique constraint không được đặt tên nên SQL Server tự sinh hậu tố ngẫu nhiên (`PK__courses__8F1EF7AE948AAB00`). Hệ quả: hai lần dựng cùng một schema ra hai bộ tên khác nhau, nên không diff sạch được giữa các máy. Đặt tên tay (`PK_courses`) sẽ gọn hơn nhưng phải sửa cả 28 bảng — làm hay để vậy?

---

## 9. ERD: ba mức zoom

| Tab | Mức | Dùng khi nào |
|---|---|---|
| **0. Conceptual** | 15 khái niệm nghiệp vụ, không cột. Có vòng lặp thích ứng `Mastery → Path → Study → Submission → Mastery` và đánh dấu nét đứt xanh chỗ AI làm việc | Slide mở đầu, giải thích hệ thống cho người chưa biết |
| **1. Module Map** | 28 bảng gom theo 8 nhóm, mũi tên là **quan hệ giữa nhóm** kèm số FK | Nhìn kiến trúc tổng thể, biết bảng nào thuộc nhóm nào |
| **2–9. Module** | Từng nhóm một, đủ mọi cột với cờ PK/FK và kiểu dữ liệu, cùng mọi quan hệ. Bảng thuộc nhóm khác vẽ bằng hộp nét đứt | Khi code, khi viết Table Descriptions trong RDS |

Dưới mỗi hộp ở tab Conceptual có ghi tên bảng thật, nên đi từ khái niệm xuống DDL không bị đứt mạch.

## 10. Export

`python database/export_erd.py` → `database/exports/`

- **PNG** (scale 2) — chèn slide, xem nhanh
- **SVG** — chèn Word/in, nét không vỡ khi zoom
- **Codi-ERD.pdf** — cả 10 trang trong một file để nộp

Script tự tìm draw.io desktop ở các đường dẫn thường gặp; không thấy thì báo cách export tay.

### Vì sao không dùng Excalidraw

Excalidraw mạnh ở sơ đồ phác kiểu vẽ tay để brainstorm. Với ERD 28 bảng × ~11 cột thì nó thua rõ: không có shape bảng có hàng, không auto-layout theo cột, và quan trọng nhất là **không sinh được từ file SQL** — nghĩa là mỗi lần sửa DDL phải vẽ lại tay, và hình sẽ lệch với schema. drawio giữ được ràng buộc "hình sinh từ SQL".

## 11. Quy trình khi sửa schema

```
sửa database/schema-v6.sql
  → python database/lint_schema.py     # bắt lỗi cấu trúc
  → python database/gen_erd.py         # vẽ lại ERD
  → python database/export_erd.py      # xuất PNG/SVG/PDF
```

Không sửa `ERD.drawio` bằng tay — chạy lại `gen_erd.py` sẽ ghi đè.

---

## 12. Sửa theo feedback GV — quiz gắn với bài học, không gắn với skill

**Feedback:** bảng quiz nên gắn với bảng bài học thay vì gắn với skills.

GV có lý ở một điểm mình bỏ sót: `quiz_questions.skill_id` không hề ràng buộc skill đó phải thuộc bài học chứa câu hỏi. Một câu hỏi của bài 1 gắn được với skill của bài 9 mà DB không chặn.

### Đã sửa

| | Trước | Sau |
|---|---|---|
| Cột | `quiz_questions.skill_id` → `skills` | `quiz_questions.lesson_id` → `lessons` |
| Index | `IX_quiz_questions_skill` | `IX_quiz_questions_lesson` |
| Đường tới concept | câu hỏi → skill (trực tiếp) | câu hỏi → lesson → `lesson_skills` → skill |

Skill giờ **chỉ khai báo một chỗ duy nhất**: trên lesson, qua `lesson_skills`. Không còn hai nơi gắn concept nên không còn lệch nhau.

### Vì sao không bỏ hẳn mà đổi thành `lesson_id`

Bỏ trắng thì diagnostic chết. `assessments.lesson_id` **bắt buộc NULL** với bài diagnostic (ràng buộc `CK_assessments_diagnostic_shape`, vì đó là bài test cấp khoá). Nếu câu hỏi cũng không trỏ tới lesson nào thì:

```
câu trả lời diagnostic → assessment → lesson (NULL) → ✗ không tới được skill
```

Nghĩa là bài kiểm tra đầu vào — thứ seed toàn bộ BKT và sinh lộ trình lần đầu — sẽ không cập nhật được mastery nào cả. Tính năng lõi của đề tài đứt ngay bước một.

Với `quiz_questions.lesson_id`, mỗi câu hỏi diagnostic chỉ ra nó kiểm tra nội dung của bài nào:

```
câu trả lời diagnostic → lesson → lesson_skills → skill  ✓
```

Cột này **NULL được**, và với quiz của một bài học thì bỏ trống là đúng (đã suy ra từ `assessments.lesson_id`). Nó chỉ bắt buộc với diagnostic.

### Đánh đổi phải chấp nhận

Trước đây mỗi câu hỏi chỉ ra đúng một concept, nên sai câu nào biết yếu concept đó. Giờ bằng chứng dừng ở mức bài học: **một bài dạy 3 concept thì cả 3 nhận cùng một bằng chứng**, không phân biệt được học viên yếu cái nào.

Cách giảm thiểu, không cần sửa schema: khuyến khích AI khi trích bản đồ kiến thức thì **chia nhỏ bài học sao cho mỗi bài tập trung 1–2 concept**. Càng ít concept trên một bài, BKT càng chính xác.

### Kiểm chứng

- `lint_schema.py`: **LINT CLEAN** — 28 bảng, 59 FK, 82 check, không có xung đột cascade nào phát sinh.
- ERD đã sinh lại: tab *5. Assessment* giờ chỉ còn `quiz_questions → assessments` và `quiz_questions → lessons`.
- `smoke_test.sql` bổ sung một kiểm tra: câu hỏi diagnostic phải truy được về đúng 2 skill qua lesson của nó.
- **Đã chạy lại trên SQL Server 2022**: 46/46 batch không lỗi, smoke test **21/21 PASS** (tăng 1 test so với trước, chính là test diagnostic → lesson → skills).
- **Database `Codi` trên máy đã cập nhật** bằng migration có sẵn thay vì dựng lại — xem mục 13.

---

## 13. Cập nhật database `Codi` trên máy — bằng migration, không dựng lại

Sau khi đổi `quiz_questions`, database `Codi` trên máy lệch với schema. Dựng lại là cách nhanh nhất nhưng sẽ **mất `Diagram_0`** — sơ đồ quan hệ đã lưu trong SSMS.

Nên mình so từng đối tượng giữa `Codi` (đang chạy) và một bản dựng mới, để biết chính xác phải sửa gì:

```
tables             identical (28)
columns            DIFFERS
     only in live Codi : quiz_questions.skill_id  bigint
     only in new schema: quiz_questions.lesson_id bigint
foreign keys       DIFFERS
     only in live Codi : FK_quiz_questions_skill
     only in new schema: FK_quiz_questions_lesson
check constraints  identical (82)
```

Đúng 3 đối tượng, nên viết migration thay vì drop:

**`database/migrations/001-quiz-question-links-to-lesson.sql`**

Script viết theo kiểu idempotent (`IF EXISTS` / `IF NOT EXISTS`) nên chạy nhiều lần không sao, và an toàn với dữ liệu — cột bị bỏ vốn nullable và chưa ai dùng. Teammate nào đang giữ DB bản cũ cũng chạy đúng file này là xong, khỏi mất dữ liệu test.

Sau khi chạy, diff lại (lọc các tên `PK__`/`UQ__` auto-sinh):

```
tables             identical (28)
columns            identical (312)
foreign keys       identical (59)
check constraints  identical (82)
indexes            identical (58)

the two databases match
```

`Diagram_0` còn nguyên, `roles` vẫn 3 dòng seed. Database tạm `Codi_v6_verify` đã xoá.
