# AI trong Personalized Learning Path — Research & Kiến trúc đề xuất cho Codi

Ngày: 2026-09-21
Lý do: model UC vòng 4 đặt PLP là rule-engine nội bộ, mâu thuẫn với tên đề tài *"using AI to personalize learning path"*.

---

## 1. Câu hỏi 1 — Tính năng này có **cần** AI không?

**Về kỹ thuật: không bắt buộc.** Rule engine làm được: prerequisite graph viết tay + điểm diagnostic → thứ tự lesson. Ưu điểm lớn là **không có cold start** — chạy được từ ngày đầu, không cần dataset.

**Về đề tài: bắt buộc.** Rule-based gọi đúng tên là *adaptive learning*, không phải AI. Với tên đề tài có "using AI", GV sẽ hỏi thẳng "AI nằm ở đâu" — như bạn đã tự nhận ra.

Ranh giới trong literature: AI cần thiết khi **số lượng chiều thích ứng (adaptation means/targets) tăng đến mức không viết rule xuể**. Một khoá học 30 lesson với 5 mức mastery × 3 kiểu learning goal → tổ hợp quá lớn để rule tay bao hết. Đó là lập luận để bảo vệ trước GV.

**Kết luận: giữ AI, nhưng phải chỉ ra được AI làm việc gì mà rule không làm được.**

---

## 2. Câu hỏi 2 — Dùng AI như thế nào? (4 họ kỹ thuật)

| Họ | Làm gì | Data cần | Khả thi 1 kỳ? |
|---|---|---|---|
| **Knowledge Tracing — BKT** | Bayesian, ước lượng xác suất đã thành thạo từng concept theo chuỗi trả lời | Ít (tham số có thể đặt tay) | ✅ Được |
| **Knowledge Tracing — DKT** | LSTM, mô hình hoá diễn biến kiến thức theo thời gian; mạnh hơn BKT ở quan hệ concept phức tạp | **Nhiều** interaction data | ⚠️ Phải mượn dataset public (ASSISTments, EdNet) |
| **Reinforcement Learning (RL-DKT)** | Agent chọn bài kế tiếp tối ưu. Kết quả tốt: giảm 50% dropout, giảm 12.5% thời gian hoàn thành | **Rất nhiều** + môi trường simulate | ❌ Không khả thi |
| **LLM + Knowledge Graph (GraphRAG)** | LLM dựng graph concept + prerequisite từ nội dung khoá, rồi giải thích lộ trình | **Không cần historical data** | ✅ Khả thi nhất |

### Vì sao hướng LLM + Knowledge Graph hợp với Codi

Đây là hướng 2025 mới nhất trong literature (KnowLP / EDU-GraphRAG). Pipeline thực tế của họ:

1. LLM sinh mô tả cho từng knowledge concept
2. LLM **trích quan hệ prerequisite và similarity** giữa các concept → dựng knowledge graph
3. **Thuật toán (không phải LLM)** duyệt graph theo mastery để chọn concept kế tiếp
4. LLM **sinh lời giải thích** vì sao gợi ý nội dung đó

Điểm mấu chốt: **bước 1–2 không cần lịch sử học viên nào cả**. Đây chính là lời giải cho cold start của một đồ án không có user thật.

Lưu ý quan trọng từ literature: các hệ thống tốt đều **hybrid** — ML/LLM lo dự đoán và nhận dạng pattern, rule-based lo ràng buộc và guardrail. Không hệ nào để LLM tự do quyết định tất cả.

---

## 3. Kiến trúc đề xuất cho Codi — AI ở 3 chỗ

```
┌─ LỚP 1: AI dựng bản đồ kiến thức  (chạy 1 lần / mỗi lần đổi nội dung khoá)
│  Input : nội dung lesson Lecturer vừa soạn
│  AI    : LLM trích knowledge concept + quan hệ prerequisite giữa chúng
│  Output: Course Knowledge Map (graph)
│  → Đây là việc con người làm rất tốn công, LLM làm ngay, KHÔNG cần data
│
├─ LỚP 2: Đánh giá năng lực bằng BKT  (ML, nhưng tất định)
│  Input : kết quả diagnostic + quiz + assignment
│  Model : Bayesian Knowledge Tracing - Hidden Markov Model, 4 tham số /concept
│          (P(init), P(learn), P(guess), P(slip))
│  Output: mastery vector - xác suất đã thành thạo từng concept
│
└─ LỚP 3: AI sắp lộ trình + giải thích  (chạy sau diagnostic, và sau mỗi lesson)
   Input : knowledge map + mastery vector + learning goal
   Rule  : thứ tự prerequisite là RÀNG BUỘC CỨNG, AI không được phá
   AI    : trong các lesson hợp lệ, LLM quyết định thứ tự ưu tiên, nhịp độ,
           lesson nào được bỏ qua, và viết lý do bằng ngôn ngữ tự nhiên
   Output: personalized learning path + giải thích cho learner đọc
```

### Vì sao chia như vậy

| Quyết định | Lý do |
|---|---|
| Prerequisite là ràng buộc cứng, không để LLM tự quyết | LLM không tất định; nếu để nó tự do, lộ trình có thể sai thứ tự kiến thức. Đây là guardrail bắt buộc |
| Mastery tính bằng BKT, không bằng LLM | BKT là ML thật (Hidden Markov Model) nhưng suy luận **tất định** - cùng input luôn ra cùng mastery, nên viết được test case. Cho LLM chấm mastery thì không test nổi |
| LLM lo xếp hạng + giải thích | Đây mới là phần "khó viết rule": cân giữa learning goal, điểm yếu, nhịp độ. Và phần giải thích là thứ learner nhìn thấy được — dễ demo trước hội đồng |
| LLM dựng knowledge map | Phần AI thuyết phục nhất, vì không có nó thì Lecturer phải tự khai báo prerequisite cho từng lesson |

### Mở rộng nếu còn thời gian
- Train **DKT** trên dataset public (ASSISTments / EdNet) rồi so AUC với BKT → phần đánh giá của đồ án mạnh hẳn lên, và có bảng số liệu để đưa vào báo cáo.
- **Không** đụng vào RL.

### Ước lượng tham số BKT
Không có dữ liệu học viên lúc khởi động, nên khởi tạo tham số theo giá trị mặc định thường dùng trong literature (ví dụ `P(guess)≈0.2` cho trắc nghiệm 4 đáp án, `P(slip)≈0.1`), rồi fit lại bằng EM khi đã tích được dữ liệu thật. Ghi rõ điều này trong báo cáo — đây là cách xử lý cold start hợp lệ, không phải lỗ hổng.

---

## 4. Thay đổi trong UC diagram

### Trước (sai)
`AI Service` chỉ nối `Ask AI Learning Assistant`. `Generate` / `Update Personalized Learning Path` là rule-engine nội bộ, không nối actor nào → **AI chỉ làm chatbot, không hề personalize gì**. Đúng như bạn nhận xét.

### Sau (đã sửa trong `UC-by-actor.drawio`)

**Tab 3 — Learner:** `AI Service` giờ nối **3** use case:
- `Generate Personalized Learning Path`
- `Update Personalized Learning Path`
- `Ask AI Learning Assistant`

**Tab 4 — Lecturer:** thêm 1 use case:
- `Create Course Content` `<<include>>` **`Extract Course Knowledge Map`** → `AI Service`

Đây là lớp 1 của kiến trúc. Không có nó thì lộ trình không có gì để sắp — nên nó thuộc luồng soạn bài của Lecturer, không phải luồng học của Learner.

Note trong diagram ghi rõ ranh giới AI / rule để trả lời GV ngay trên hình.

---

## 5. Cách trả lời nếu GV hỏi

> **"AI ở đâu trong hệ thống?"**
> Ba chỗ: (1) LLM đọc nội dung khoá để dựng bản đồ kiến thức và quan hệ tiên quyết; (2) LLM xếp thứ tự lộ trình theo mastery và mục tiêu học, rồi viết lý do; (3) chatbot hỏi đáp trong bài.

> **"Sao không dùng rule cho gọn?"**
> Rule làm được thứ tự tiên quyết và chúng em vẫn dùng rule cho đúng chỗ đó — làm guardrail. Nhưng cân giữa learning goal, điểm yếu theo concept và nhịp độ thì tổ hợp quá lớn để viết rule. Và rule không viết được lời giải thích cho learner.

> **"Sao không dùng deep knowledge tracing / RL?"**
> DKT và RL cần lượng interaction data lớn mà một hệ thống mới triển khai chưa có (cold start). Hướng LLM + knowledge graph không cần dữ liệu lịch sử nên chạy được ngay từ khoá học đầu tiên. Phần theo dõi năng lực chúng em dùng **BKT** — cũng là knowledge tracing, nhưng chỉ 4 tham số mỗi concept nên chạy được khi dữ liệu còn ít. Nếu còn thời gian sẽ train DKT trên dataset public để so sánh.

> **"BKT có phải AI không?"**
> Có. BKT là Hidden Markov Model — mô hình xác suất theo dõi trạng thái kiến thức ẩn của học viên qua chuỗi câu trả lời. Nó tất định khi suy luận, nên nhóm vẫn viết được test case cho phần tính mastery.

---

## 6. Các điểm đã chốt (21/09)

| Điểm | Quyết định | Ảnh hưởng tới UC diagram |
|---|---|---|
| Lecturer sửa knowledge map? | **Không.** Map do AI sinh, Lecturer không chỉnh tay | Không thêm UC. Đổi lại: chất lượng map phụ thuộc hoàn toàn vào prompt + nội dung bài — xem rủi ro bên dưới |
| Lớp đánh giá năng lực | **BKT** ngay từ đầu | Không đổi diagram. `Study Course Lesson` và `Submit Course Quiz` là nguồn evidence cho BKT |
| Cache lộ trình | **Có.** Chỉ gọi lại LLM khi mastery đổi vượt ngưỡng | **Không đổi diagram** — xem giải thích 6.1 |

### 6.1 Vì sao cache không làm `include` thành `extend`

Có thể tưởng cache khiến `Update Personalized Learning Path` thành "chạy có điều kiện" → phải đổi sang `<<extend>>`. **Không phải.**

- Hoàn thành lesson thì **luôn** chạy: BKT cập nhật mastery, hệ thống đánh giá lại lộ trình. Đây là hành vi người dùng quan sát được.
- Thứ được cache là **lời gọi LLM**, bỏ qua khi mastery chưa đổi đủ nhiều. Đó là tối ưu nội bộ, thuộc *how*, không phải *what*.
- UC diagram mô tả *what*. Cache ghi ở non-functional requirement và ở phần thiết kế, không vẽ lên diagram.

Giữ `<<include>>`.

### 6.2 Rủi ro của quyết định "Lecturer không sửa knowledge map"

LLM sẽ sai một số quan hệ prerequisite. Không cho Lecturer sửa nghĩa là sai đó lan thẳng vào lộ trình của mọi learner trong khoá. Hai cách giảm thiểu, không cần thêm UC nào:

1. Cho Lecturer **xem** map trong màn hình `Update Course Content` (read-only), để ít nhất phát hiện được khi nó sai.
2. Khi map sai, Lecturer sửa **nội dung bài** cho rõ hơn rồi cho AI trích lại — vòng lặp gián tiếp thay vì sửa trực tiếp.

Nếu sau này quyết định cho sửa, thêm đúng 1 UC `Update Course Knowledge Map` ở tab Lecturer.

---

## 7. Có nên tách AI Service thành use case chính riêng không?

**Không nên biến AI Service thành primary actor.** Nhưng **nên thêm một tab view** — và đã thêm.

### Vì sao không phải primary actor

Theo UML: primary actor là actor **tự khởi xướng** use case vì mục tiêu của chính nó. Supporting actor là bên **cung cấp dịch vụ** khi hệ thống gọi tới.

AI Service trong Codi không bao giờ tự khởi xướng. Mọi use case AI đều bị kích hoạt bởi người:

| Use case AI | Ai kích hoạt |
|---|---|
| `Extract Course Knowledge Map` | Lecturer, qua `Create Course Content` |
| `Generate Personalized Learning Path` | Learner, qua `Complete Course Diagnostic Assessment` |
| `Update Personalized Learning Path` | Learner, qua `Study Course Lesson` |
| `Ask AI Learning Assistant` | Learner, trực tiếp |

Cho AI Service một tab với tư cách primary actor là mắc đúng lỗi kinh điển: **coi một subsystem / dịch vụ ngoài là primary actor**. GV nhiều khả năng bắt lỗi này.

*(Ngoại lệ: nếu sau này có tác vụ AI chạy theo lịch — ví dụ hằng đêm quét lại toàn bộ lộ trình — thì actor khởi xướng là `Scheduler` / `Timer`, vẫn không phải AI Service.)*

### Cái bạn thực sự cần: một view

Vấn đề bạn nêu là đúng, nhưng là vấn đề **trình bày**, không phải vấn đề **mô hình**: AI nằm rải ở 2 tab nên nhìn không ra AI làm gì. Với đề tài tên "using AI", cần một hình cho thấy toàn bộ bề mặt AI.

Đã thêm **tab 6 — `AI Service - Where AI Works`**:
- Người kích hoạt (Lecturer, Learner) ở bên trái — đúng vị trí primary actor.
- 4 use case AI ở giữa, kèm base use case kích hoạt chúng.
- AI Service vẫn ở bên phải, vẫn là supporting actor.
- Note ghi rõ: đây là **view**, mọi use case đã có ở tab 3 hoặc 4, không mô hình hoá trùng.

Một use case diagram được phép vẽ theo bất kỳ lát cắt nào — theo actor, theo subsystem, theo mối quan tâm. Tab này là lát cắt "AI", hoàn toàn hợp lệ, và là hình bạn nên chiếu đầu tiên khi bảo vệ.

---

## 8. Còn phải quyết

1. **LLM provider nào?** `Extract Course Knowledge Map` là tác vụ nặng → chạy async khi Lecturer lưu nội dung, không đồng bộ.
2. **Ngưỡng cache là bao nhiêu?** Mastery đổi bao nhiêu thì gọi lại LLM. Cần con số cụ thể để viết non-functional requirement và để test.
3. **Lecturer có được xem knowledge map (read-only) không?** Xem 6.2 — khuyến nghị có, và không tốn thêm UC nào.

## Nguồn

- [Integrating Reinforcement Learning with Dynamic Knowledge Tracing for personalized learning path optimization — Scientific Reports](https://www.nature.com/articles/s41598-025-23900-4)
- [Deep knowledge tracing and cognitive load estimation for personalized learning path generation — Scientific Reports](https://www.nature.com/articles/s41598-025-10497-x)
- [Education-Oriented Graph Retrieval-Augmented Generation for Learning Path Recommendation (KnowLP / EDU-GraphRAG)](https://arxiv.org/html/2506.22303v1)
- [LLM-Assisted Knowledge Graph Completion for Curriculum and Domain Modelling in Personalized Higher Education Recommendations](https://arxiv.org/pdf/2501.12300)
- [Personalized Learning Path Recommendation Based on Knowledge Graphs: A Survey — MDPI Electronics](https://www.mdpi.com/2079-9292/15/1/238)
- [A Comprehensive Exploration of Personalized Learning in Smart Education](https://arxiv.org/pdf/2402.01666)
- [Artificial intelligence-enabled adaptive learning platforms: A review — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2666920X25000694)
- [AI-based adaptive personalized content presentation and exercises navigation for an effective and engaging E-learning platform — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9244108/)
- [Rule-based AI vs machine learning — WeAreBrain](https://wearebrain.com/blog/rule-based-ai-vs-machine-learning-whats-the-difference/)
