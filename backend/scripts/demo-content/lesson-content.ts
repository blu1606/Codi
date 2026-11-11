// Lesson-by-lesson content of the "JavaScript nền tảng" demo courses, addressed by chapter and lesson position
// (0-based) so the same data applies to every copy of the course, whatever its database ids.
// Quiz questions: one correct option of four. Code stays inline in the question text (`…`) because the lecturer quiz
// editor saves only text, options and explanation.

export type QuizItem = { text: string; options: [string, string, string, string]; correct: 0 | 1 | 2 | 3; explanation: string };
export type RubricItem = { id: string; name: string; desc: string; points: number };
export type AssignmentSpec = {
  title: string;
  instructions: string;
  rubric: RubricItem[];
  /** Used only when the lesson has no assignment yet. */
  submissionFormat: "text" | "file" | "link" | "file_or_link";
};
export type CodingTestSpec = { name: string; input: string; expectedOutput: string };
export type LessonSpec = {
  chapter: number;
  lesson: number;
  /** Expected title: a mismatch means the course is not a copy of this one, and the script stops. */
  title: string;
  quiz: QuizItem[];
  assignment?: AssignmentSpec;
  /** Hidden tests added to the lesson's code exercise (matched by name). */
  hiddenTests?: CodingTestSpec[];
};

const q = (text: string, options: QuizItem["options"], correct: QuizItem["correct"], explanation: string): QuizItem => ({ text, options, correct, explanation });

const FORMAT_PRICE_CODE = `// Lời giải mẫu (khoá demo): chèn dấu chấm trước mỗi nhóm 3 chữ số tính từ phải sang
function formatPrice(n) {
  return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ' ₫';
}

console.log(formatPrice(1290000)); // "1.290.000 ₫"
console.log(formatPrice(590000));  // "590.000 ₫"`;

const ORDERS_CODE = `const orders = [
  { id: 'DH01', customer: 'An', amount: 590000 },
  { id: 'DH02', customer: 'Bình', amount: 1290000 },
  { id: 'DH03', customer: 'An', amount: 350000 },
  { id: 'DH04', customer: 'Chi', amount: 200000 },
];

// Lời giải mẫu (khoá demo)
function tongTheoKhach(orders) {
  return orders.reduce((acc, { customer, amount }) => {
    acc[customer] = (acc[customer] || 0) + amount;
    return acc;
  }, {});
}

console.log(tongTheoKhach(orders)); // { An: 940000, 'Bình': 1290000, Chi: 200000 }`;

export const LESSONS: LessonSpec[] = [
  {
    chapter: 0, lesson: 0, title: "Biến, hằng và kiểu dữ liệu",
    quiz: [
      q("Khai báo nào sau đây báo lỗi ngay khi chạy?", ["`let tuoi;`", "`var ten;`", "`const PI;`", "`let diem = 0;`"], 2,
        "`const` bắt buộc gán giá trị ngay khi khai báo, nên `const PI;` gây SyntaxError (Missing initializer in const declaration)."),
      q("Kết quả của biểu thức `\"5\" + 2` là gì?", ["`7`", "`\"52\"`", "`\"7\"`", "`NaN`"], 1,
        "Khi một vế là chuỗi, toán tử `+` nối chuỗi: số 2 được đổi thành \"2\" rồi nối vào \"5\" thành \"52\"."),
      q("Kết quả của `5 === \"5\"` là gì?", ["`true`", "`false`", "`undefined`", "Báo lỗi"], 1,
        "`===` so sánh cả kiểu lẫn giá trị và không tự đổi kiểu: số 5 và chuỗi \"5\" khác kiểu nên kết quả là `false`."),
      q("Biến khai báo bằng `let x;` mà chưa gán có giá trị gì?", ["`null`", "`0`", "`undefined`", "`\"\"` (chuỗi rỗng)"], 2,
        "Biến đã khai báo nhưng chưa gán giá trị luôn mang giá trị `undefined`."),
      q("Kiểu nào dưới đây là kiểu dữ liệu nguyên thủy (primitive)?", ["`boolean`", "`object`", "Mảng (array)", "Hàm (function)"], 0,
        "Các kiểu nguyên thủy gồm string, number, boolean, undefined, null, bigint, symbol. Mảng và hàm đều là object."),
      q("`typeof \"Codi\"` trả về gì?", ["`\"text\"`", "`\"char\"`", "`\"object\"`", "`\"string\"`"], 3,
        "Mọi giá trị đặt trong nháy đơn, nháy kép hoặc backtick đều có kiểu `string`."),
    ],
  },
  {
    chapter: 0, lesson: 1, title: "Hàm và phạm vi",
    quiz: [
      q("Với `function cong(a, b = 3) { return a + b; }`, lời gọi `cong(2)` trả về gì?", ["`5`", "`NaN`", "`2`", "Báo lỗi vì thiếu tham số"], 0,
        "`b = 3` là tham số mặc định: khi không truyền `b`, nó nhận giá trị 3, nên kết quả là 2 + 3 = 5."),
      q("Đoạn `function tao() { let dem = 0; return () => ++dem; } const tang = tao(); tang(); console.log(tang());` in ra gì?",
        ["`0`", "`1`", "`2`", "`undefined`"], 2,
        "Hàm trả về là một closure: nó giữ biến `dem` của lần gọi `tao()`. Lần gọi `tang()` thứ nhất tăng `dem` lên 1, lần thứ hai lên 2."),
      q("Biến khai báo bằng `let` bên trong một hàm có dùng được ở ngoài hàm đó không?",
        ["Được, vì `let` là biến toàn cục", "Không, truy cập từ ngoài sẽ gặp ReferenceError", "Được, nhưng giá trị luôn là `undefined`", "Chỉ được sau khi hàm đã chạy xong"], 1,
        "Biến khai báo trong hàm chỉ sống trong phạm vi của hàm đó. Bên ngoài, tên biến không tồn tại nên JavaScript báo ReferenceError."),
      q("Với `const binhPhuong = x => x * x;`, `binhPhuong(4)` trả về gì?", ["`8`", "`16`", "`\"x * x\"`", "`undefined`"], 1,
        "Arrow function một biểu thức tự trả về giá trị của biểu thức đó: 4 * 4 = 16."),
      q("Cách khai báo nào cho phép gọi hàm ở dòng nằm TRƯỚC dòng khai báo?",
        ["`function chao() { … }`", "`const chao = () => { … };`", "`let chao = function () { … };`", "Không cách nào cho phép"], 0,
        "Function declaration được hoisting cả phần thân, nên gọi trước vẫn chạy. Hàm gán vào `const`/`let` chưa dùng được trước dòng khai báo."),
      q("Biến khai báo bằng `var` có phạm vi nào?", ["Khối `{}`", "Hàm chứa nó", "Chỉ dòng hiện tại", "Tệp HTML"], 1,
        "`var` có phạm vi hàm (function scope), không phải phạm vi khối như `let`/`const`; đây là lý do nên ưu tiên `let`/`const`."),
    ],
    // The brief keeps the code block the learner's editor opens with (see scripts/demo-code-tasks.mjs).
    assignment: {
      title: "Bài tập: Hàm và phạm vi",
      submissionFormat: "link",
      instructions: `Viết hàm formatPrice(n) trả về chuỗi giá VND có dấu chấm phân cách hàng nghìn và ký hiệu ₫ (ví dụ 1290000 → "1.290.000 ₫").

Yêu cầu:
- Hàm nhận số tiền n (số nguyên, đơn vị đồng) và trả về (return) chuỗi, không chỉ in ra màn hình.
- Chèn dấu chấm trước mỗi nhóm 3 chữ số tính từ phải sang; số nhỏ hơn 1.000 giữ nguyên (950 → "950 ₫", 0 → "0 ₫").
- Số âm giữ dấu trừ: -50000 → "-50.000 ₫".
- Khai báo bằng const/let bên trong hàm, không tạo biến toàn cục.

Cách nộp: viết code trong trình soạn thảo và bấm Chạy để thử, hoặc nộp đường dẫn tới bài làm (GitHub, CodePen…).

\`\`\`js
${FORMAT_PRICE_CODE}
\`\`\``,
      rubric: [
        { id: "r1", name: "Kết quả đúng", desc: "1290000 → \"1.290.000 ₫\", 590000 → \"590.000 ₫\", 0 → \"0 ₫\".", points: 4 },
        { id: "r2", name: "Trường hợp biên", desc: "Số nhỏ hơn 1.000 không có dấu chấm; số âm giữ dấu trừ đúng chỗ.", points: 2 },
        { id: "r3", name: "Hàm và phạm vi", desc: "Hàm trả về giá trị bằng return; biến khai báo bằng const/let trong hàm, không dùng biến toàn cục.", points: 2 },
        { id: "r4", name: "Code dễ đọc", desc: "Đặt tên rõ nghĩa, ngắn gọn, có ví dụ chạy thử.", points: 2 },
      ],
    },
  },
  {
    chapter: 0, lesson: 2, title: "Slide tổng hợp: cú pháp JavaScript cốt lõi",
    quiz: [
      q("Khi một biến không cần gán lại giá trị, nên khai báo bằng gì?", ["`var`", "`let`", "`const`", "Không cần khai báo"], 2,
        "Ưu tiên `const` cho mọi biến không gán lại; người đọc biết ngay giá trị đó cố định. Chỉ dùng `let` khi cần gán lại."),
      q("Kết quả của `0 == false` và `0 === false` lần lượt là?", ["`true` và `true`", "`true` và `false`", "`false` và `true`", "`false` và `false`"], 1,
        "`==` đổi kiểu trước khi so sánh (false thành 0) nên ra `true`; `===` không đổi kiểu, number khác boolean nên ra `false`."),
      q("`[1, 2, 3, 4].filter(n => n % 2 === 0)` cho kết quả gì?", ["`[1, 3]`", "`[2, 4]`", "`2`", "`[false, true, false, true]`"], 1,
        "`filter` giữ lại các phần tử làm điều kiện trả về `true`: ở đây là các số chẵn 2 và 4."),
      q("Template string `` `Tổng: ${2 + 3}` `` cho ra chuỗi nào?", ["`\"Tổng: 5\"`", "`\"Tổng: ${2 + 3}\"`", "`\"Tổng: 23\"`", "Báo lỗi cú pháp"], 0,
        "Trong backtick, phần `${…}` được tính rồi chèn vào chuỗi: 2 + 3 = 5."),
      q("Đoạn `console.log(\"A\"); setTimeout(() => console.log(\"B\"), 0); console.log(\"C\");` in theo thứ tự nào?",
        ["A B C", "A C B", "B A C", "C B A"], 1,
        "Callback của `setTimeout` (kể cả 0 ms) chỉ chạy sau khi đoạn code đồng bộ hiện tại chạy xong, nên B in sau C."),
      q("`[10, 20, 30].length` có giá trị bao nhiêu?", ["`2`", "`3`", "`30`", "`60`"], 1,
        "`length` là số phần tử của mảng: 3. Chỉ số cuối cùng mới là `length - 1` = 2."),
    ],
  },
  {
    chapter: 0, lesson: 3, title: "Bài đọc: Quy ước đặt tên và phong cách code",
    quiz: [
      q("Tên biến nào viết đúng quy ước camelCase?", ["`tongTien`", "`TongTien`", "`tong_tien`", "`TONG_TIEN`"], 0,
        "camelCase: từ đầu viết thường, các từ sau viết hoa chữ cái đầu. `TongTien` là PascalCase, `tong_tien` là snake_case."),
      q("Hằng số cấu hình (ví dụ số lần thử tối đa) nên đặt tên thế nào?", ["`soLanThuToiDa`", "`SO_LAN_THU_TOI_DA`", "`So_Lan_Thu_Toi_Da`", "`solanthutoida`"], 1,
        "Theo bài đọc, hằng số cấu hình dùng UPPER_SNAKE_CASE để nổi bật là giá trị cố định của chương trình."),
      q("Tên nào phù hợp nhất cho một class giỏ hàng?", ["`gioHang`", "`gio_hang`", "`GioHang`", "`GIO_HANG`"], 2,
        "Class và component dùng PascalCase: viết hoa chữ cái đầu của mọi từ."),
      q("Tên nào tốt nhất cho biến boolean cho biết người dùng đã đăng nhập hay chưa?", ["`trangThai`", "`daDangNhap`", "`x`", "`dangNhapUser1`"], 1,
        "Biến boolean nên bắt đầu bằng `da`, `co`, `la` (hoặc `is`, `has`) để đọc như một câu hỏi có/không."),
      q("Kỹ thuật \"trả về sớm\" (early return) mang lại lợi ích chính nào?",
        ["Bớt các tầng `if` lồng nhau, code dễ đọc hơn", "Code chạy nhanh gấp đôi", "Bắt buộc phải dùng trong mọi hàm", "Thay thế được cho vòng lặp"], 0,
        "Xử lý các trường hợp đặc biệt rồi `return` ngay ở đầu hàm giúp phần chính không bị lồng sâu trong nhiều `if`."),
      q("Tên hàm nên bắt đầu bằng loại từ nào?", ["Danh từ (`tong`)", "Động từ (`tinhTong`)", "Tính từ (`lon`)", "Số (`1tinhTong`)"], 1,
        "Hàm làm một việc, nên tên bắt đầu bằng động từ: `tinhTong`, `kiemTraEmail`. Tên không được bắt đầu bằng chữ số."),
    ],
  },
  {
    chapter: 1, lesson: 0, title: "Làm việc với mảng",
    quiz: [
      q("`const a = [3, 1, 2]; a.push(4)` trả về giá trị gì?", ["`4` (độ dài mới của mảng)", "`[3, 1, 2, 4]`", "`undefined`", "`3`"], 0,
        "`push` thêm phần tử vào cuối mảng gốc và trả về độ dài mới, ở đây là 4."),
      q("`[5, 12, 8, 130].find(n => n > 10)` trả về gì?", ["`[12, 130]`", "`12`", "`130`", "`1`"], 1,
        "`find` trả về phần tử ĐẦU TIÊN thoả điều kiện (12). Muốn lấy mọi phần tử thoả điều kiện thì dùng `filter`."),
      q("`[1, 2, 3].reduce((tong, n) => tong + n, 0)` cho kết quả gì?", ["`0`", "`3`", "`6`", "`[1, 3, 6]`"], 2,
        "`reduce` bắt đầu với `tong = 0` rồi cộng lần lượt 1, 2, 3: kết quả là 6."),
      q("Sau `const b = a.map(x => x * 2);`, mảng `a` thay đổi thế nào?", ["Không thay đổi", "Mỗi phần tử bị nhân đôi", "Trở thành mảng rỗng", "Bằng đúng mảng `b`"], 0,
        "`map` tạo và trả về mảng MỚI, không sửa mảng gốc."),
      q("`[1, 2, 3].includes(3)` trả về gì?", ["`2`", "`true`", "`false`", "`3`"], 1,
        "`includes` kiểm tra mảng có chứa giá trị hay không và trả về boolean."),
      q("Phần tử đầu tiên của mảng `ds` được truy cập bằng cách nào?", ["`ds[1]`", "`ds[0]`", "`ds.first`", "`ds(0)`"], 1,
        "Chỉ số mảng trong JavaScript bắt đầu từ 0."),
    ],
  },
  {
    chapter: 1, lesson: 1, title: "Đối tượng và destructuring",
    quiz: [
      q("Với `const user = { ten: \"An\", tuoi: 20 };`, biểu thức `user[\"ten\"]` trả về gì?", ["`\"An\"`", "`\"ten\"`", "`undefined`", "Báo lỗi cú pháp"], 0,
        "Ngoặc vuông với tên thuộc tính dạng chuỗi tương đương `user.ten`, trả về \"An\"."),
      q("Sau `const { ten: hoTen } = { ten: \"Lan\" };`, biến `hoTen` có giá trị gì?", ["`\"ten\"`", "`\"Lan\"`", "`undefined`", "Báo lỗi vì `hoTen` chưa khai báo"], 1,
        "Cú pháp `ten: hoTen` lấy thuộc tính `ten` và gán vào biến mới tên `hoTen`."),
      q("Sau `const [a, , b] = [1, 2, 3];`, biến `b` có giá trị gì?", ["`1`", "`2`", "`3`", "`undefined`"], 2,
        "Destructuring mảng theo vị trí; dấu phẩy để trống bỏ qua phần tử thứ hai, nên `b` nhận phần tử thứ ba là 3."),
      q("Sau `const { lop = \"10A\" } = {};`, biến `lop` có giá trị gì?", ["`undefined`", "`null`", "`\"10A\"`", "Báo lỗi"], 2,
        "Giá trị mặc định trong destructuring được dùng khi thuộc tính không có (là `undefined`)."),
      q("`Object.keys({ a: 1, b: 2 })` trả về gì?", ["`[1, 2]`", "`[\"a\", \"b\"]`", "`[[\"a\", 1], [\"b\", 2]]`", "`2`"], 1,
        "`Object.keys` trả về mảng tên thuộc tính; `Object.values` trả về giá trị, `Object.entries` trả về các cặp [tên, giá trị]."),
      q("Đọc một thuộc tính không tồn tại, ví dụ `user.email`, cho kết quả gì?", ["Báo lỗi ReferenceError", "`null`", "`undefined`", "`\"\"`"], 2,
        "Thuộc tính không tồn tại trên object trả về `undefined`, không báo lỗi."),
    ],
    assignment: {
      title: "Bài tập: Đối tượng và destructuring",
      submissionFormat: "file",
      instructions: `Cho mảng đơn hàng orders bên dưới, viết hàm tongTheoKhach(orders) trả về một đối tượng có tổng tiền theo từng khách hàng.

Yêu cầu:
- Kết quả với dữ liệu mẫu: { An: 940000, 'Bình': 1290000, Chi: 200000 }.
- Dùng reduce và destructuring tham số ({ customer, amount }), không dùng vòng lặp for.
- Mảng rỗng trả về đối tượng rỗng {}.
- Không sửa mảng orders gốc.

Cách nộp: viết code trong trình soạn thảo và bấm Chạy để thử, hoặc nộp tệp .js.

\`\`\`js
${ORDERS_CODE}
\`\`\`

Định dạng tệp chấp nhận: .zip, .js, .pdf.`,
      rubric: [
        { id: "r1", name: "Kết quả đúng", desc: "Tổng tiền từng khách đúng với dữ liệu mẫu; mảng rỗng trả về {}.", points: 4 },
        { id: "r2", name: "Dùng reduce và destructuring", desc: "Gộp bằng reduce với giá trị khởi đầu {}, tách { customer, amount } ngay ở tham số.", points: 3 },
        { id: "r3", name: "Không làm thay đổi dữ liệu gốc", desc: "Mảng orders và từng đơn hàng giữ nguyên sau khi gọi hàm.", points: 1 },
        { id: "r4", name: "Code dễ đọc", desc: "Đặt tên rõ nghĩa, ngắn gọn, không lặp code.", points: 2 },
      ],
    },
  },
  {
    chapter: 2, lesson: 0, title: "Hướng dẫn: Viết và chạy JavaScript",
    quiz: [
      q("Thẻ nào nhúng tệp `main.js` vào một trang HTML?", ["`<script src=\"main.js\"></script>`", "`<link href=\"main.js\">`", "`<js src=\"main.js\">`", "`<style src=\"main.js\">`"], 0,
        "Thẻ `<script>` với thuộc tính `src` tải và chạy tệp JavaScript; `<link>` dùng cho CSS."),
      q("`console.log(...)` dùng để làm gì?", ["Hiện hộp thoại cho người dùng", "In giá trị ra Console để kiểm tra", "Lưu dữ liệu vào trình duyệt", "Dừng chương trình"], 1,
        "`console.log` in giá trị ra Console; đây là cách nhanh nhất để xem code đang làm gì."),
      q("Viết sai chính tả `diem.lenght` (thay vì `length`) thì kết quả là gì?", ["SyntaxError", "`0`", "`undefined`", "`NaN`"], 2,
        "Đọc thuộc tính không tồn tại không báo lỗi mà trả về `undefined`, nên lỗi chính tả kiểu này rất dễ bị bỏ sót."),
      q("Gọi `tinhTong(diem)` khi chưa khai báo hàm `tinhTong` sẽ gặp lỗi gì?", ["ReferenceError", "TypeError", "SyntaxError", "Không có lỗi, trả về `undefined`"], 0,
        "Dùng một tên chưa được khai báo ở phạm vi nào cả gây ReferenceError: tinhTong is not defined."),
      q("Vòng lặp `for (let i = 0; i <= diem.length; i++) tong += diem[i];` khiến tổng thành `NaN` vì sao?",
        ["`let` không dùng được trong vòng lặp", "Lặp thừa một lần, đọc `diem[diem.length]` là `undefined`", "`tong` chưa được khai báo", "`+=` không dùng được với số"], 1,
        "Chỉ số cuối là `length - 1`. Với `<=`, lần lặp cuối cộng `undefined` vào tổng nên kết quả thành `NaN`; sửa thành `i < diem.length`."),
      q("Trong trình soạn code của Codi, phím tắt nào chạy code?", ["Ctrl + S", "Ctrl + Enter", "Shift + Tab", "Esc"], 1,
        "Ctrl + Enter (⌘ + Enter trên Mac) chạy code giống nút Chạy; code của từng bước được lưu nháp tự động."),
    ],
    hiddenTests: [
      { name: "diemTrungBinh([7, 8, 9, 6]) trả về 7.5", input: "diemTrungBinh([7, 8, 9, 6])", expectedOutput: "7.5" },
      { name: "xepLoai(8) đúng mốc trả về \"Giỏi\"", input: "xepLoai(8)", expectedOutput: "\"Giỏi\"" },
      { name: "xepLoai(4.9) trả về \"Yếu\"", input: "xepLoai(4.9)", expectedOutput: "\"Yếu\"" },
    ],
  },
  {
    chapter: 2, lesson: 1, title: "Thử thách: Thống kê đơn hàng",
    quiz: [
      q("`[].reduce((tong, o) => tong + o.price, 0)` trả về gì?", ["`0`", "`undefined`", "`NaN`", "Báo lỗi TypeError"], 0,
        "Với mảng rỗng, `reduce` trả về ngay giá trị khởi đầu (0), nên `tongTien([])` ra 0."),
      q("Gọi `reduce` trên mảng rỗng mà KHÔNG truyền giá trị khởi đầu thì sao?", ["Trả về `0`", "Trả về `undefined`", "Báo lỗi TypeError", "Trả về mảng rỗng"], 2,
        "Không có phần tử nào và cũng không có giá trị khởi đầu, `reduce` báo TypeError: Reduce of empty array with no initial value."),
      q("Trong `reduce((acc, o) => …, khoiDau)`, tham số `acc` là gì?", ["Phần tử hiện tại", "Chỉ số của phần tử", "Giá trị tích luỹ qua các lần lặp", "Toàn bộ mảng gốc"], 2,
        "`acc` (accumulator) giữ kết quả tích luỹ; giá trị hàm callback trả về trở thành `acc` của lần lặp sau."),
      q("Khi viết `demTheoTrangThai`, nên chọn giá trị khởi đầu nào cho `reduce`?", ["`0`", "`[]`", "`{}`", "`null`"], 2,
        "Kết quả cần là đối tượng đếm, ví dụ `{ paid: 2, pending: 1 }`, nên bắt đầu từ đối tượng rỗng `{}`."),
      q("Trong `dem[o.status] = (dem[o.status] || 0) + 1`, phần `|| 0` dùng để làm gì?",
        ["Đổi trạng thái thành số", "Lần đầu gặp một trạng thái, `dem[o.status]` là `undefined` nên lấy 0", "Bỏ qua đơn có giá 0", "Không cần thiết, có thể bỏ"], 1,
        "Lần đầu gặp trạng thái mới, `dem[o.status]` là `undefined`; `undefined + 1` ra `NaN`, nên phải thay bằng 0 trước khi cộng."),
      q("Vì sao `donLonNhat([])` nên kiểm tra mảng rỗng trước khi dùng `reduce` không có giá trị khởi đầu?",
        ["Để code chạy nhanh hơn", "Để trả về `null` thay vì gặp lỗi TypeError", "Vì `reduce` không dùng được với object", "Vì đề bài cấm dùng `reduce`"], 1,
        "Đề yêu cầu mảng rỗng trả về `null`. Kiểm tra `if (orders.length === 0) return null;` trước tránh lỗi TypeError của `reduce`."),
    ],
  },
  {
    chapter: 3, lesson: 0, title: "Chọn và thay đổi phần tử DOM",
    quiz: [
      q("`document.querySelectorAll(\".item\")` trả về gì?", ["Phần tử đầu tiên có class item", "Một NodeList chứa mọi phần tử có class item", "Một chuỗi HTML", "`true` nếu tìm thấy"], 1,
        "`querySelectorAll` trả về NodeList gồm mọi phần tử khớp selector; `querySelector` chỉ trả về phần tử đầu tiên."),
      q("`document.getElementById(\"title\")` trả về gì khi trang không có phần tử id title?", ["`undefined`", "`null`", "Một mảng rỗng", "Báo lỗi ngay"], 1,
        "Không tìm thấy thì trả về `null`; gọi tiếp `.textContent` trên `null` mới gây TypeError, nên cần kiểm tra trước."),
      q("Gán `el.textContent = \"<b>Chào</b>\"` thì trang hiển thị gì?", ["Chữ Chào in đậm", "Nguyên văn chuỗi <b>Chào</b>", "Không hiển thị gì", "Báo lỗi"], 1,
        "`textContent` coi giá trị là văn bản thuần, không phân tích HTML. Muốn trình duyệt hiểu thẻ thì dùng `innerHTML`."),
      q("Cách nào tạo và thêm một mục `<li>` mới vào danh sách `ul`?",
        ["`const li = document.createElement(\"li\"); ul.appendChild(li);`", "`ul.add(\"li\")`", "`document.write(\"li\", ul)`", "`ul.li = new Element()`"], 0,
        "`createElement` tạo phần tử mới, `appendChild` (hoặc `append`) gắn nó vào cuối phần tử cha."),
      q("Vì sao không nên gán dữ liệu người dùng nhập trực tiếp vào `innerHTML`?",
        ["Vì `innerHTML` chạy chậm hơn", "Vì kẻ xấu có thể chèn HTML/mã độc (tấn công XSS)", "Vì `innerHTML` không hiển thị tiếng Việt", "Vì `innerHTML` chỉ đọc được, không gán được"], 1,
        "Chuỗi người dùng nhập có thể chứa thẻ HTML độc hại. Với văn bản thuần, dùng `textContent` để an toàn."),
      q("`document.querySelector(\"#menu .active\")` chọn phần tử nào?",
        ["Mọi phần tử có class active", "Phần tử đầu tiên có class active nằm bên trong phần tử id menu", "Phần tử id menu nếu nó có class active", "Phần tử id active"], 1,
        "Khoảng trắng trong selector nghĩa là \"con cháu\": tìm `.active` bên trong `#menu`, và `querySelector` lấy phần tử đầu tiên."),
    ],
  },
  {
    chapter: 3, lesson: 1, title: "Sự kiện và event delegation",
    quiz: [
      q("Gọi `event.preventDefault()` trong sự kiện submit của form để làm gì?", ["Xoá dữ liệu trong form", "Ngăn trình duyệt gửi form và tải lại trang", "Ngăn sự kiện nổi bọt lên phần tử cha", "Gỡ bỏ trình xử lý sự kiện"], 1,
        "`preventDefault` chặn hành vi mặc định của trình duyệt (gửi form, mở link) để JavaScript tự xử lý."),
      q("`event.stopPropagation()` có tác dụng gì?", ["Chặn hành vi mặc định của trình duyệt", "Ngăn sự kiện tiếp tục nổi bọt lên các phần tử cha", "Dừng mọi sự kiện trên trang", "Xoá phần tử khỏi DOM"], 1,
        "`stopPropagation` dừng quá trình lan truyền, nên trình xử lý ở phần tử cha không nhận được sự kiện này."),
      q("Muốn `removeEventListener(\"click\", fn)` gỡ được trình xử lý, cần điều kiện gì?",
        ["`fn` phải là cùng một hàm (cùng tham chiếu) đã truyền cho `addEventListener`", "`fn` phải là arrow function", "Phải gọi trong vòng 1 giây", "Không cần điều kiện gì"], 0,
        "Trình duyệt so sánh theo tham chiếu hàm. Truyền một hàm ẩn danh mới viết lại sẽ không gỡ được trình xử lý cũ."),
      q("Trong event delegation, thuộc tính nào cho biết phần tử con thực sự được click?", ["`event.currentTarget`", "`event.target`", "`event.type`", "`this.parent`"], 1,
        "`event.target` là phần tử phát sinh sự kiện; `event.currentTarget` là phần tử đang gắn trình xử lý (phần tử cha)."),
      q("Một `button` nằm trong `div`, cả hai đều có trình xử lý click. Bấm nút thì thứ tự chạy là?", ["`div` trước, `button` sau", "`button` trước, `div` sau", "Chỉ `button` chạy", "Chỉ `div` chạy"], 1,
        "Mặc định sự kiện nổi bọt (bubbling) từ phần tử được click lên dần các phần tử cha."),
      q("Viết `btn.addEventListener(\"click\", xuLy())` (có dấu ngoặc sau `xuLy`) sai ở đâu?",
        ["Không sai, hai cách viết như nhau", "`xuLy` chạy ngay lập tức và giá trị trả về (thường là `undefined`) bị dùng làm trình xử lý", "Phải viết `onclick` thay cho `click`", "`addEventListener` chỉ nhận arrow function"], 1,
        "Cần truyền chính hàm (`xuLy`), không phải kết quả gọi hàm (`xuLy()`)."),
    ],
  },
  {
    chapter: 4, lesson: 0, title: "Promise là gì",
    quiz: [
      q("Một Promise có ba trạng thái nào?", ["start, run, stop", "pending, fulfilled, rejected", "open, closed, error", "sync, async, await"], 1,
        "Promise bắt đầu ở pending, rồi chuyển một lần duy nhất sang fulfilled (thành công) hoặc rejected (thất bại)."),
      q("`new Promise(resolve => resolve(5)).then(x => x * 2).then(console.log)` in ra gì?", ["`5`", "`10`", "`undefined`", "Một đối tượng Promise"], 1,
        "Giá trị `then` đầu tiên trả về (10) được truyền sang `then` kế tiếp trong chuỗi."),
      q("`.catch(fn)` trong chuỗi Promise dùng để làm gì?", ["Chạy khi Promise thành công", "Bắt lỗi khi một Promise trong chuỗi bị reject", "Huỷ Promise đang chạy", "Chờ mọi Promise xong"], 1,
        "`catch` nhận lỗi của bất kỳ bước nào phía trước trong chuỗi bị reject hoặc ném lỗi."),
      q("`console.log(1); Promise.resolve().then(() => console.log(2)); console.log(3);` in theo thứ tự nào?", ["1 2 3", "1 3 2", "2 1 3", "3 2 1"], 1,
        "Callback của `then` luôn chạy bất đồng bộ, sau khi code đồng bộ hiện tại (in 1 và 3) chạy xong."),
      q("Promise đã resolve có thể chuyển sang rejected sau đó không?", ["Có, nếu gọi `reject` sau", "Không, Promise đã kết thúc thì giữ nguyên trạng thái", "Có, sau 1 giây", "Chỉ khi dùng `finally`"], 1,
        "Promise chỉ chuyển trạng thái một lần. Các lần gọi `resolve`/`reject` sau đó bị bỏ qua."),
      q("Callback truyền vào `new Promise((resolve, reject) => { … })` chạy khi nào?", ["Ngay lập tức, đồng bộ, lúc tạo Promise", "Chỉ khi gọi `.then`", "Sau 0 ms", "Khi trang tải xong"], 0,
        "Hàm executor chạy ngay khi tạo Promise; chỉ các callback của `then`/`catch` mới chạy bất đồng bộ."),
    ],
  },
  {
    chapter: 4, lesson: 1, title: "async/await và xử lý lỗi",
    quiz: [
      q("Một hàm khai báo `async` luôn trả về gì?", ["Giá trị sau `return`", "Một Promise", "`undefined`", "Một callback"], 1,
        "Hàm async luôn trả về Promise: `return x` thành Promise fulfilled với x, `throw` thành Promise rejected."),
      q("`Promise.all([p1, p2])` xử lý thế nào khi `p2` bị reject?", ["Chờ mọi Promise rồi trả về kết quả của `p1`", "Reject ngay với lỗi của `p2`", "Bỏ qua `p2`", "Thử lại `p2`"], 1,
        "`Promise.all` chỉ fulfilled khi tất cả fulfilled; một Promise reject thì cả nhóm reject với lỗi đó. Cần giữ mọi kết quả thì dùng `Promise.allSettled`."),
      q("Từ khoá `await` làm gì?", ["Chặn toàn bộ trình duyệt đến khi xong", "Tạm dừng hàm async đến khi Promise kết thúc rồi lấy giá trị", "Tạo một luồng (thread) mới", "Chuyển Promise thành callback"], 1,
        "`await` chỉ tạm dừng hàm async đang chạy; phần còn lại của trang vẫn hoạt động bình thường."),
      q("`async function lay() { throw new Error(\"Hỏng\"); } lay().catch(e => console.log(e.message));` in ra gì?", ["`Error`", "`Hỏng`", "`undefined`", "Không in gì, chương trình dừng"], 1,
        "Lỗi ném trong hàm async làm Promise trả về bị reject; `.catch` nhận đối tượng lỗi và in `message` là \"Hỏng\"."),
      q("Cách nào chạy hai yêu cầu độc lập song song rồi chờ cả hai?", ["`await a(); await b();`", "`await Promise.all([a(), b()])`", "`a().then(b())`", "`await a() + b()`"], 1,
        "Gọi cả hai trước rồi `await Promise.all` để chúng chạy song song; hai `await` nối tiếp phải chờ lần lượt."),
      q("Khối `finally` trong `try/catch/finally` chạy khi nào?", ["Chỉ khi có lỗi", "Chỉ khi không có lỗi", "Luôn chạy, dù thành công hay lỗi", "Không bao giờ chạy với async"], 2,
        "`finally` luôn chạy, nên là chỗ đặt việc dọn dẹp như tắt trạng thái \"Đang tải…\"."),
    ],
  },
  {
    chapter: 4, lesson: 2, title: "Dự án nhỏ: Ứng dụng thời tiết",
    quiz: [
      q("`fetch(url)` trả về gì?", ["Dữ liệu JSON ngay lập tức", "Một Promise, khi xong cho ra đối tượng Response", "Một chuỗi HTML", "`true` nếu thành công"], 1,
        "`fetch` bất đồng bộ: nó trả về Promise; cần `await` (hoặc `then`) để nhận Response."),
      q("Đọc phần thân JSON của Response `res` bằng cách nào?", ["`res.body`", "`await res.json()`", "`JSON.parse(res)`", "`res.data`"], 1,
        "`res.json()` đọc và phân tích thân phản hồi, và nó cũng trả về Promise nên cần `await`."),
      q("Server trả về mã 404, Promise của `fetch` sẽ thế nào?",
        ["Reject, nhảy vào `catch`", "Vẫn fulfilled; cần tự kiểm tra `res.ok` (hoặc `res.status`)", "Treo mãi không kết thúc", "Tự động thử lại"], 1,
        "`fetch` chỉ reject khi lỗi mạng. Mã 4xx/5xx vẫn là Response bình thường với `res.ok === false`."),
      q("Vì sao cần `encodeURIComponent(tenThanhPho)` khi ghép vào URL?", ["Để mã hoá mật khẩu", "Để tên có dấu và khoảng trắng như \"Hà Nội\" thành chuỗi hợp lệ trong URL", "Để URL ngắn hơn", "Để API trả về tiếng Việt"], 1,
        "Ký tự có dấu, khoảng trắng, & hay ? phải được mã hoá, nếu không URL sẽ sai hoặc bị cắt."),
      q("Nên tắt trạng thái \"Đang tải…\" ở đâu để chắc chắn nó luôn tắt?", ["Ngay sau dòng `fetch`", "Trong khối `finally`", "Chỉ trong `catch`", "Không cần tắt"], 1,
        "`finally` chạy cả khi thành công lẫn khi lỗi, nên trạng thái tải không bị kẹt khi có lỗi."),
      q("Người dùng bấm Tra cứu khi ô thành phố đang trống, ứng dụng nên làm gì?", ["Vẫn gọi API với chuỗi rỗng", "Báo lỗi ngay \"Hãy nhập tên thành phố\" và không gọi API", "Tải lại trang", "Hiện thời tiết của Hà Nội"], 1,
        "Kiểm tra đầu vào trước khi gọi mạng: phản hồi nhanh cho người dùng và tránh yêu cầu vô ích."),
    ],
    assignment: {
      title: "Bài tập: Dự án nhỏ: Ứng dụng thời tiết",
      submissionFormat: "link",
      instructions: `Xây dựng trang tra cứu thời tiết hiện tại theo tên thành phố bằng HTML, CSS và JavaScript thuần (fetch + async/await).

Dữ liệu (miễn phí, không cần API key):
- Tìm toạ độ: https://geocoding-api.open-meteo.com/v1/search?name=<tên thành phố>&count=1&language=vi
- Thời tiết hiện tại: https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,wind_speed_10m,weather_code

Yêu cầu:
1. Có ô nhập tên thành phố và nút Tra cứu; nhấn Enter cũng tra cứu được.
2. Ô trống thì báo "Hãy nhập tên thành phố" và không gọi API.
3. Trong lúc chờ, hiện "Đang tải…" và khoá nút Tra cứu.
4. Hiển thị tên thành phố, nhiệt độ (°C), tốc độ gió (km/h) và mô tả thời tiết từ weather_code (ít nhất: trời quang, có mây, mưa).
5. Không tìm thấy thành phố hoặc lỗi mạng: hiện thông báo lỗi rõ ràng, không để trang trống hay treo "Đang tải…".
6. Tách code thành các hàm nhỏ (ví dụ timToaDo, layThoiTiet, hienThi) và dùng try/catch/finally.

Cách nộp: đẩy mã nguồn lên GitHub (kèm README ghi cách chạy và ảnh chụp màn hình), rồi nộp đường dẫn repo hoặc trang GitHub Pages.`,
      rubric: [
        { id: "r1", name: "Chức năng đúng yêu cầu", desc: "Tra cứu đúng thành phố, hiện nhiệt độ, gió và mô tả thời tiết; Enter và nút đều dùng được.", points: 4 },
        { id: "r2", name: "Xử lý trạng thái và lỗi", desc: "Có trạng thái Đang tải, khoá nút khi chờ; báo lỗi rõ khi ô trống, không tìm thấy thành phố hoặc lỗi mạng.", points: 2 },
        { id: "r3", name: "Cấu trúc code bất đồng bộ", desc: "Tách hàm hợp lý, dùng async/await với try/catch/finally, kiểm tra res.ok, mã hoá tên thành phố trong URL.", points: 2 },
        { id: "r4", name: "Trình bày bài nộp", desc: "README ghi cách chạy, có ảnh chụp màn hình; giao diện gọn, đọc được trên điện thoại.", points: 2 },
      ],
    },
  },
];

export const QUIZ_TARGET = 6;
export const QUIZ_MIN = 5;
export const QUIZ_INSTRUCTIONS = "Chọn một đáp án đúng cho mỗi câu.";
