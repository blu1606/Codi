# Issue #141 — detail học code và hướng dẫn theo bước

Issue: https://github.com/blu1606/Codi/issues/141, sub-issue của #94; liên quan #138, #98, #100.
Nhánh từ `develop`: `fix/code-lesson-detail-ui`. Worktree: `../Codi-code-detail-ui`.
Người dùng đã xem và đồng ý mở PR vào `develop`, liên kết #141, ngày 19/10/2026.

## Thay đổi

- Sidebar danh sách liền, bài đang mở dùng `aria-current` và nền accent; trạng thái có icon/chữ cho trình đọc màn hình. Loại bài và thời lượng lấy từ nội dung đã xuất bản, không suy đoán từ tên bài.
- Trang học dùng toàn bộ chiều rộng, sidebar 296px; phần hướng dẫn/yêu cầu nằm cạnh editor nền tối. Video và tài liệu bổ sung của bài code nằm trong mục tham khảo thu gọn phía dưới workspace.
- Khóa `dev-practice-quiz-code` có hai bài riêng: **Quiz: Kiểu dữ liệu và chuỗi** rồi **Thực hành code: Tổng các số chẵn**. Bài code giữ URL cũ; mỗi bài có checklist riêng. Không gộp quiz vào workspace code.
- Header hiển thị chương · loại bài · thời lượng. Link về lộ trình trên header chỉ dành cho mobile; desktop dùng link ở sidebar.
- Tutorial giữ đúng các bước trong mockup: mục lục, thanh bước, nội dung markdown, Bước trước / Tiếp, editor có tên file/ngôn ngữ/số dòng/tô cú pháp, Console và phím tắt. Ở vùng nội dung hẹp, hai cột xếp dọc.
- Server lưu `current`, `visited`, `drafts`, `runs` trong `coding_workspaces.tutorial_progress`, tách từng bước. Chuyển bước chờ lưu nháp; lỗi lưu giữ nguyên code và có Thử lại. Khôi phục cần xác nhận, chỉ ảnh hưởng bước được chọn.
- Nội dung/code lời giải không được trả về trước khi người học chọn Hiện lời giải. Mục lục cho phép chọn bước như mockup. Đã ghé bước cuối thì checklist tutorial đạt; bài challenge vẫn cần lần nộp gần nhất đạt tất cả test.
- Mỗi lần ghi lặp lại guard vai trò, ghi danh, onboarding, xuất bản và tiên quyết ở server. Run dùng QuickJS/WASM thật, lease/cooldown dùng chung với challenge; console-only steps chạy với biểu thức `null` trong cùng sandbox.
- Seed giữ cấu trúc tutorial và tên file thay vì gộp các bước thành challenge. Không sửa `docs/mockup/**`.
- AI trợ lý/Hỏi đáp thuộc #101; nhánh develop hiện chưa có panel đó để tích hợp. Không thêm nút mở panel giả. Phần này cần tích hợp khi #101 sẵn sàng.

## Migration và dữ liệu

Migration `20261019102323_coding_tutorial_steps` chỉ thêm `coding_exercises.file_name`, `coding_exercises.tutorial_steps` (mặc định `[]`) và `coding_workspaces.tutorial_progress` (nullable). Challenge cũ giữ mặc định và cách chấm cũ.

Đã áp dụng migration trên **DB phát triển** và cập nhật đúng tutorial 7 bước của `course-js-001` bằng `scripts/prepare-code-ui-preview.ts --apply`. Script kiểm tra danh sách migration đang chờ trước khi chạy và không thay enrollment, câu trả lời, lần nộp hay workspace cũ. Không chạy seed toàn bộ mockup.

Đã tách bài trong khóa phát triển bằng `pnpm --filter web db:split-practice -- --apply` (hoặc chạy trực tiếp `tsx --env-file=.env scripts/split-practice-dev.ts --apply` tại `apps/web`). Không có `--apply` thì chạy trong transaction luôn rollback để xem trước và xác minh. Script giữ assessment ID cũ, chuyển quiz và liên kết câu hỏi sang bài mới; không tạo lại câu hỏi, lần làm hay đáp án. Lộ trình đang hoạt động chèn quiz trước code, không trùng vị trí. Bài gộp đã hoàn thành được giữ kết quả cho cả hai bài; tiến độ khóa được tính lại. Kiểm tra fingerprint toàn bộ các dòng attempt/answer/workspace trước và sau, đồng thời chạy lại để kiểm tra tính idempotent.

Đây là script tách dữ liệu phát triển đã có, không thay đổi cấu trúc câu hỏi diagnostic hoặc reset bài kiểm tra đầu vào. Script seed thử nghiệm gộp quiz/code cũ ở worktree khác không còn phù hợp với cách tổ chức này; không chạy lại script đó trên dữ liệu đã tách.

Các URL xem thử trên dev server cổng 3001:

- Quiz: `/learn/dev-practice-quiz-code/c937bd55-1283-493e-bca0-31047cd80aa3`
- Code: `/learn/dev-practice-quiz-code/eeb00ab1-10c0-4d69-a0fc-731c1788f101`
- Tutorial theo ảnh: `/learn/course-js-001/bedaf193-5537-4de7-a390-f4b157b55307`

Script kiểm thử dưới đây không cần áp dụng migration lên DB dùng chung: tạo bảng code tạm có cột mới, tạo fixture trong một transaction và luôn rollback. Không reset tài khoản/tiến độ đang dùng.

```sh
pnpm --filter web test:tutorial:db
pnpm test
pnpm run check:standards
pnpm run check-types
pnpm --filter web build
node scripts/verify-coding-trace.mjs
```

Kết quả ngày 19/10/2026: **913 tests / 68 files đạt**, typecheck web/db/ui/auth đạt, design-token audit 0 vi phạm, production build của bản chỉnh bố cục và tách quiz đạt. Trace của cả coding và tutorial có worker, QuickJS và WASM. Script DB rollback đạt với runner thật, gồm lưu/khôi phục nháp từng bước, gate lời giải, checklist, loại bài sidebar, lỗi cú pháp/runtime/timeout, sandbox unavailable và guard quyền/xuất bản/ghi danh.

## Đối chiếu state

| Mockup state / transition | Triển khai | Kiểm tra |
|---|---|---|
| Mục lục, bước đầu/giữa/cuối, `cp-step` | `LessonTutorial`, `tutorialTransition`, JSONB progress | unit, DOM, DB rollback |
| `stepDrafts`/`stepRuns`, `cp-reset` | draft theo step; xác nhận reset | unit, DOM, DB rollback |
| Lời giải bị che / `cp-tut-solution` | projection chỉ có title, body/code null khi gated | unit, DOM, API, DB rollback |
| Chạy, lỗi cú pháp/runtime/timeout | `createTutorialService` + runner + lease | DB rollback với WASM thật |
| Sandbox không sẵn sàng | lỗi 503, code nháp vẫn được lưu | DOM, DB rollback |
| Tutorial done vs challenge submit | `lessonChecklist` đọc visited từ server | unit, DB rollback |
| Bài khóa / ghi danh sai / bài nháp | `loadLearningLessonAccess` + assessment scope | API, DB rollback |

## Kiểm tra giao diện

Đã kiểm tra bằng Chromium headless tại 1233×800 và 375×812, dùng tài khoản QA tạm riêng và xóa tài khoản đó sau khi xong. Tutorial chạy Console thật, chuyển bước và khôi phục code nháp đạt. Quiz được mở từ sidebar trên trang code, giữ lựa chọn sau reload, trả lời đủ 3 câu và chấm đạt; hai trang không hiển thị lẫn quiz/editor. Không có page error hoặc tràn ngang. Đã sửa lỗi hydration ở menu tài khoản/thông báo và độ rộng header mobile phát hiện trong lượt kiểm tra đầu.

Ảnh đối chiếu được lưu tại [`screenshots/issue-141/`](screenshots/issue-141/) và nhúng trong bảng ảnh của PR. Ảnh mockup được chụp từ route `/learn/course-js-001/lesson-js-p01` của prototype; ảnh triển khai dùng dữ liệu QA riêng, không có thông tin tài khoản thật.

| State | Mockup | Desktop light | Desktop dark | Mobile 375px |
|---|---|---|---|---|
| Bước 1, editor và Console | Ảnh người dùng / tutorialView | `code-ui-tutorial-desktop-light.png` | `code-ui-tutorial-desktop-dark.png` | `code-ui-tutorial-mobile.png` |
| Mục lục, bước giữa, code nháp | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Lỗi cú pháp/runtime/timeout, lỗi lưu + retry | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Lời giải bị che / đã hiện; bước cuối | tutorialView | Chờ chụp | Chờ chụp | Chờ chụp |
| Loading / tải lỗi / sandbox unavailable | S11g | Chờ chụp | Chờ chụp | Chờ chụp |
| Bài challenge cũ | S11 / S11g | `code-ui-challenge-desktop.png` | Chờ chụp | Chờ chụp |
| Quiz riêng | Yêu cầu người dùng | `code-ui-quiz-desktop.png` | Chờ chụp | Chờ chụp |

Các state lỗi/edge trong bảng đã được kiểm thử bằng unit/DOM/DB; ảnh chi tiết của những state này vẫn cần bổ sung trong review. Không đánh dấu đầy đủ bằng chứng hình ảnh cho các mục còn ghi “Chờ chụp”.

## Sửa lỗi Retry trong review PR #142

Run giờ lấy code hiện tại của editor ngay trước khi gửi lệnh, sau khi chờ lưu nháp. Callback Thử lại không thể gửi lại snapshot code cũ rồi ghi đè bản nháp mới.

Hai regression test chạy component thật với transport có kiểm soát và `tutorialTransition`/`tutorialView` thật: Run(old) thất bại → sửa new → Thử lại trước debounce 650 ms hoặc trong khi autosave đang pending. Cả hai test thất bại trên bản cũ; sau sửa, lệnh Run, draft trả về, editor và lần mở lại component đều giữ new.

Kiểm chứng ngày 19/10/2026: 915 tests / 68 files đạt với coverage (`--maxWorkers=1`); typecheck toàn monorepo, design-token audit (0 vi phạm) và script kiểm tra PostgreSQL/QuickJS thật đều đạt; fixture và bảng tạm được rollback. Lượt coverage đầu với hai worker gặp timeout ở test coding-runner có sẵn, lượt đầy đủ chạy tuần tự sau đó đạt.

Browser regression ở bản sửa này chưa chạy: browser inventory trống và thử mở IAB trả `Browser is not available: iab`. Bằng chứng DOM/DB này không thay cho xác minh browser hoặc phê duyệt UI độc lập.
