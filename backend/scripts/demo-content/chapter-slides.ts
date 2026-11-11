// Chapter slide decks of the demo courses (chapters 2–5; chapter 1 already has its uploaded deck). Each deck is
// written as data, rendered to a 16:9 HTML page per slide in Codi's style (navy board cover, deep-teal accents,
// Lexend / Be Vietnam Pro) and printed to PDF with Playwright's page.pdf().
import { chromium } from "playwright";

type Slide =
  | { kind: "points"; title: string; lead?: string; points: string[] }
  | { kind: "code"; title: string; lead?: string; code: string; notes?: string[] }
  // "dos": left column is the mistake (✕), right the fix (✓); "pair": two neutral sides of a comparison.
  | { kind: "compare"; tone: "dos" | "pair"; title: string; lead?: string; left: { head: string; items: string[] }; right: { head: string; items: string[] } };
export type Deck = { chapter: number; title: string; subtitle: string; goals: string[]; slides: Slide[]; check: string[] };

export const DECKS: Deck[] = [
  {
    chapter: 1, title: "Dữ liệu có cấu trúc", subtitle: "Mảng, đối tượng và destructuring",
    goals: [
      "Tạo, đọc và cập nhật mảng; biết chỉ số bắt đầu từ 0",
      "Dùng map, filter, find, reduce thay cho vòng lặp thủ công",
      "Mô tả dữ liệu thực tế (đơn hàng, học viên) bằng đối tượng",
      "Tách dữ liệu nhanh bằng destructuring và sao chép bằng spread",
    ],
    slides: [
      { kind: "code", title: "Mảng: danh sách có thứ tự", lead: "Mỗi phần tử có một chỉ số, bắt đầu từ 0.",
        code: `const diem = [7, 9, 4];\n\ndiem[0];        // 7  (phần tử đầu)\ndiem.length;    // 3\ndiem[diem.length - 1]; // 4 (phần tử cuối)\n\ndiem.push(10);  // thêm cuối → trả về 4 (độ dài mới)\ndiem.pop();     // bỏ phần tử cuối → trả về 10\ndiem.includes(9); // true`,
        notes: ["push/pop sửa chính mảng gốc", "Đọc chỉ số không tồn tại → undefined, không báo lỗi"] },
      { kind: "code", title: "map, filter, find: tạo kết quả mới", lead: "Ba hàm này không sửa mảng gốc.",
        code: `const gia = [590000, 1290000, 350000];\n\ngia.map((g) => g * 0.9);\n// [531000, 1161000, 315000]  giảm 10%\n\ngia.filter((g) => g >= 500000);\n// [590000, 1290000]  giữ phần tử thoả điều kiện\n\ngia.find((g) => g > 1000000);\n// 1290000  phần tử ĐẦU TIÊN thoả điều kiện`,
        notes: ["map: cùng số phần tử, giá trị biến đổi", "filter: ít phần tử hơn hoặc bằng", "find: một phần tử hoặc undefined"] },
      { kind: "code", title: "reduce: gộp cả mảng thành một giá trị", lead: "acc giữ kết quả tích luỹ qua từng lần lặp.",
        code: `const orders = [\n  { id: 'DH01', price: 590000, status: 'paid' },\n  { id: 'DH02', price: 1290000, status: 'pending' },\n];\n\n// Tổng tiền: khởi đầu 0\norders.reduce((tong, o) => tong + o.price, 0); // 1880000\n\n// Đếm theo trạng thái: khởi đầu {}\norders.reduce((dem, o) => {\n  dem[o.status] = (dem[o.status] || 0) + 1;\n  return dem;\n}, {}); // { paid: 1, pending: 1 }`,
        notes: ["Luôn truyền giá trị khởi đầu", "Mảng rỗng + có khởi đầu → trả về khởi đầu"] },
      { kind: "code", title: "Đối tượng: dữ liệu có tên", lead: "Cặp khoá: giá trị mô tả một thực thể.",
        code: `const hocVien = { ten: 'Minh Anh', tuoi: 20, khoa: 'JS' };\n\nhocVien.ten;           // 'Minh Anh'\nconst k = 'khoa';\nhocVien[k];            // 'JS'  (tên thuộc tính động)\nhocVien.email;         // undefined\n\nhocVien.tuoi = 21;     // cập nhật\nObject.keys(hocVien);  // ['ten', 'tuoi', 'khoa']\nObject.entries(hocVien); // [['ten','Minh Anh'], ...]`,
        notes: ["Dấu chấm khi biết sẵn tên", "Ngoặc vuông khi tên nằm trong biến"] },
      { kind: "code", title: "Destructuring và spread", lead: "Viết ngắn hơn, đọc rõ hơn.",
        code: `const { ten, tuoi = 18 } = hocVien;   // lấy thuộc tính, có mặc định\nconst { ten: hoTen } = hocVien;      // đổi tên biến\nconst [dau, , ba] = [1, 2, 3];        // dau = 1, ba = 3\n\n// Destructuring ngay ở tham số\nconst tong = orders.reduce((s, { price }) => s + price, 0);\n\n// Spread: sao chép nông rồi ghi đè\nconst capNhat = { ...hocVien, tuoi: 22 };\nconst noi = [...[1, 2], ...[3]];     // [1, 2, 3]`,
        notes: ["Spread chỉ sao chép một tầng (nông)"] },
      { kind: "compare", tone: "dos", title: "Lỗi hay gặp", left: { head: "Viết vậy dễ sai", items: [
        "ds[ds.length]: luôn là undefined", "Quên giá trị khởi đầu của reduce → lỗi với mảng rỗng", "Dùng map khi chỉ cần lọc", "Sửa object gốc khi tưởng đang sửa bản sao",
      ] }, right: { head: "Nên viết", items: [
        "ds[ds.length - 1] hoặc ds.at(-1)", "reduce(fn, 0) hoặc reduce(fn, {})", "filter để lọc, map để biến đổi", "{ ...obj, truongMoi } để tạo bản sao mới",
      ] } },
    ],
    check: [
      "[3, 1, 2].push(4) trả về gì?",
      "Viết hàm tongTheoKhach(orders) bằng reduce và destructuring.",
      "Khác nhau giữa find và filter là gì?",
    ],
  },
  {
    chapter: 2, title: "Luyện tập lập trình", subtitle: "Viết, chạy, đọc lỗi và kiểm thử code",
    goals: [
      "Chạy JavaScript trong trình duyệt và trong trình soạn code của Codi",
      "Đọc thông báo lỗi để tìm đúng dòng sai",
      "Hiểu test mẫu, test ẩn và các trường hợp biên",
      "Giải bài Thống kê đơn hàng theo từng bước",
    ],
    slides: [
      { kind: "points", title: "Quy trình giải một bài code", lead: "Năm bước, lặp lại đến khi mọi test đạt.", points: [
        "1. Đọc đề: hàm tên gì, nhận gì, trả về gì",
        "2. Tự viết 2–3 ví dụ vào/ra, gồm cả trường hợp biên (mảng rỗng, một phần tử, giá 0)",
        "3. Viết phiên bản đơn giản nhất chạy được",
        "4. Bấm Chạy (Ctrl + Enter), đọc Console và kết quả test",
        "5. Sửa từng lỗi một, rồi Nộp bài để chạy cả test ẩn",
      ] },
      { kind: "code", title: "Chạy JavaScript ở đâu?", lead: "Trong trang HTML hoặc ngay trong Codi.",
        code: `<!-- index.html -->\n<body>\n  <h1 id="title">Xin chào</h1>\n  <script src="main.js"></script>\n</body>\n\n// main.js\nconsole.log('Trang đã tải');\nconsole.log(1 + 2, typeof 'Codi');`,
        notes: ["Đặt thẻ script cuối body (hoặc dùng defer)", "Mở DevTools → Console (F12) để xem kết quả", "Trong Codi: nút Chạy hoặc Ctrl + Enter"] },
      { kind: "compare", tone: "pair", title: "Đọc thông báo lỗi", lead: "Tên lỗi cho biết loại sai, số dòng cho biết chỗ sai.", left: { head: "Có thông báo lỗi", items: [
        "SyntaxError: sai cú pháp, thiếu ngoặc hoặc dấu phẩy",
        "ReferenceError: dùng tên chưa khai báo (tinhTong is not defined)",
        "TypeError: dùng sai kiểu (gọi .length trên undefined)",
      ] }, right: { head: "Không báo lỗi nhưng sai", items: [
        "undefined: sai tên thuộc tính (diem.lenght)",
        "NaN: phép tính với undefined (vòng lặp i <= length)",
        "\"52\" thay vì 7: cộng chuỗi với số",
      ] } },
      { kind: "points", title: "Test mẫu và test ẩn", lead: "Đạt test mẫu chưa có nghĩa là bài đúng.", points: [
        "Chạy: chỉ chạy test mẫu, xem được đầu vào và kết quả mong đợi",
        "Nộp bài: chạy mọi test, gồm test ẩn kiểm tra trường hợp biên",
        "Trường hợp biên hay gặp: mảng rỗng, một phần tử, giá trị 0, đúng mốc (xepLoai(8))",
        "Hàm phải return kết quả; chỉ console.log thì test nhận undefined",
      ] },
      { kind: "points", title: "Thử thách: Thống kê đơn hàng", lead: "Ba hàm nhỏ, mỗi hàm một reduce.", points: [
        "tongTien(orders): tổng price, mảng rỗng → 0",
        "donLonNhat(orders): đơn có price lớn nhất, mảng rỗng → null",
        "demTheoTrangThai(orders): { paid: 2, pending: 1 }, mảng rỗng → {}",
        "Gợi ý: chọn giá trị khởi đầu đúng kiểu kết quả (0, đơn đầu tiên, {})",
      ] },
      { kind: "code", title: "Mẫu tư duy với reduce", lead: "Áp dụng trên dữ liệu điểm, rồi tự chuyển sang đơn hàng.",
        code: `const diem = [8, 6, 10, 6];\n\n// Tổng: khởi đầu 0\nconst tong = diem.reduce((s, d) => s + d, 0);       // 30\n\n// Lớn nhất: xử lý mảng rỗng trước\nfunction lonNhat(ds) {\n  if (ds.length === 0) return null;\n  return ds.reduce((max, d) => (d > max ? d : max));\n}\n\n// Đếm: khởi đầu {}\ndiem.reduce((dem, d) => ({ ...dem, [d]: (dem[d] || 0) + 1 }), {});\n// { 6: 2, 8: 1, 10: 1 }`,
        notes: ["Early return cho mảng rỗng", "Đặt tên acc theo ý nghĩa: tong, max, dem"] },
    ],
    check: [
      "Vì sao vòng lặp i <= diem.length cho kết quả NaN?",
      "Test ẩn của tongTien có thể kiểm tra trường hợp nào?",
      "reduce trên mảng rỗng không có giá trị khởi đầu thì sao?",
    ],
  },
  {
    chapter: 3, title: "Trình duyệt và DOM", subtitle: "Chọn, thay đổi phần tử và xử lý sự kiện",
    goals: [
      "Hiểu DOM là cây các nút mà JavaScript đọc và sửa được",
      "Chọn phần tử bằng getElementById, querySelector, querySelectorAll",
      "Thay đổi nội dung an toàn với textContent, tạo phần tử mới",
      "Xử lý sự kiện, chặn hành vi mặc định và dùng event delegation",
    ],
    slides: [
      { kind: "code", title: "DOM: trang web dưới dạng cây", lead: "Trình duyệt đọc HTML và dựng thành cây đối tượng.",
        code: `<ul id="ds">\n  <li class="item">HTML</li>\n  <li class="item active">JavaScript</li>\n</ul>\n\n// Cây DOM tương ứng\ndocument\n └─ ul#ds\n     ├─ li.item          "HTML"\n     └─ li.item.active   "JavaScript"`,
        notes: ["Mỗi thẻ là một nút phần tử", "Chữ bên trong là nút văn bản"] },
      { kind: "code", title: "Chọn phần tử", lead: "querySelector dùng cú pháp selector giống CSS.",
        code: `document.getElementById('ds');            // một phần tử hoặc null\ndocument.querySelector('#ds .active');     // phần tử ĐẦU TIÊN khớp\ndocument.querySelectorAll('.item');        // NodeList mọi phần tử khớp\n\ndocument.querySelectorAll('.item').forEach((li) => {\n  console.log(li.textContent);\n});`,
        notes: ["Không tìm thấy → null; kiểm tra trước khi dùng"] },
      { kind: "compare", tone: "pair", title: "Thay đổi nội dung", left: { head: "textContent", items: [
        "Đọc/gán văn bản thuần", "\"<b>Chào</b>\" hiện nguyên văn", "An toàn với dữ liệu người dùng nhập", "Lựa chọn mặc định khi chỉ đổi chữ",
      ] }, right: { head: "innerHTML", items: [
        "Trình duyệt phân tích chuỗi thành HTML", "\"<b>Chào</b>\" hiện chữ in đậm", "Nguy cơ XSS nếu chèn dữ liệu người dùng", "Chỉ dùng với HTML do chính bạn viết",
      ] } },
      { kind: "code", title: "Tạo và thêm phần tử", lead: "createElement → gán nội dung → gắn vào cây.",
        code: `const ds = document.querySelector('#ds');\n\nconst li = document.createElement('li');\nli.textContent = 'Promise';\nli.classList.add('item');\nds.appendChild(li);           // thêm vào cuối danh sách\n\nli.classList.toggle('active'); // bật/tắt class\nli.remove();                   // xoá khỏi trang`,
        notes: ["classList.add / remove / toggle thay cho sửa className"] },
      { kind: "code", title: "Sự kiện", lead: "Truyền chính hàm, không gọi hàm.",
        code: `const form = document.querySelector('form');\n\nfunction xuLyGui(event) {\n  event.preventDefault();          // không tải lại trang\n  const ten = form.elements.ten.value.trim();\n  if (!ten) return alert('Hãy nhập tên');\n  console.log('Gửi:', ten);\n}\n\nform.addEventListener('submit', xuLyGui);   // đúng\n// form.addEventListener('submit', xuLyGui()); // sai\nform.removeEventListener('submit', xuLyGui); // cùng tham chiếu`,
        notes: ["preventDefault: chặn hành vi mặc định", "stopPropagation: chặn nổi bọt"] },
      { kind: "code", title: "Nổi bọt và event delegation", lead: "Một trình xử lý ở cha cho mọi phần tử con, kể cả con thêm sau.",
        code: `// Click vào <li> → sự kiện nổi bọt lên <ul>\nds.addEventListener('click', (event) => {\n  const li = event.target.closest('li');\n  if (!li || !ds.contains(li)) return;\n  li.classList.toggle('active');\n});\n\n// event.target        phần tử thật sự được click\n// event.currentTarget phần tử gắn trình xử lý (ul)`,
        notes: ["Ít trình xử lý hơn, chạy cả với phần tử thêm sau"] },
    ],
    check: [
      "querySelector và querySelectorAll khác nhau thế nào?",
      "Vì sao nên dùng textContent cho dữ liệu người dùng nhập?",
      "Trong delegation, lấy phần tử được click bằng thuộc tính nào?",
    ],
  },
  {
    chapter: 4, title: "Bất đồng bộ", subtitle: "Promise, async/await và fetch",
    goals: [
      "Giải thích vì sao code bất đồng bộ chạy sau code đồng bộ",
      "Tạo và nối chuỗi Promise với then, catch, finally",
      "Viết async/await gọn gàng, bắt lỗi bằng try/catch",
      "Gọi API bằng fetch và xử lý đủ trạng thái tải, lỗi",
    ],
    slides: [
      { kind: "code", title: "Đồng bộ và bất đồng bộ", lead: "Việc tốn thời gian (mạng, hẹn giờ) không chặn trang.",
        code: `console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');\n\n// In ra: A D C B\n// 1. Code đồng bộ chạy hết: A, D\n// 2. Callback của Promise (microtask): C\n// 3. Callback của setTimeout: B`,
        notes: ["Code đồng bộ luôn chạy xong trước"] },
      { kind: "code", title: "Promise: lời hứa về một kết quả", lead: "pending → fulfilled (resolve) hoặc rejected (reject), chỉ một lần.",
        code: `function choGiay(giay) {\n  return new Promise((resolve, reject) => {\n    if (giay < 0) return reject(new Error('Số giây không hợp lệ'));\n    setTimeout(() => resolve(\`Đã chờ \${giay}s\`), giay * 1000);\n  });\n}\n\nchoGiay(1)\n  .then((kq) => console.log(kq))        // 'Đã chờ 1s'\n  .catch((loi) => console.log(loi.message))\n  .finally(() => console.log('Xong'));`,
        notes: ["Giá trị return trong then được truyền sang then kế tiếp"] },
      { kind: "code", title: "async/await", lead: "Viết code bất đồng bộ như code tuần tự.",
        code: `async function hienThi() {\n  try {\n    const kq = await choGiay(1);   // tạm dừng hàm, không chặn trang\n    console.log(kq);\n  } catch (loi) {\n    console.log('Lỗi:', loi.message);\n  } finally {\n    console.log('Luôn chạy');\n  }\n}\n\nhienThi();  // hàm async luôn trả về Promise`,
        notes: ["await chỉ dùng trong hàm async (hoặc module)", "throw trong async → Promise bị reject"] },
      { kind: "code", title: "Chạy song song với Promise.all", lead: "Gọi trước, chờ sau.",
        code: `// Tuần tự: ~2 giây\nconst a = await choGiay(1);\nconst b = await choGiay(1);\n\n// Song song: ~1 giây\nconst [x, y] = await Promise.all([choGiay(1), choGiay(1)]);\n\n// Promise.all reject ngay khi một Promise reject\n// Promise.allSettled chờ tất cả, trả về từng kết quả`,
        notes: ["Chỉ chạy song song các việc độc lập"] },
      { kind: "code", title: "fetch: gọi API", lead: "fetch chỉ reject khi lỗi mạng: luôn kiểm tra res.ok.",
        code: `const GEO = 'https://geocoding-api.open-meteo.com/v1/search';\n\nasync function timToaDo(ten) {\n  const url = \`\${GEO}?count=1&language=vi&name=\${encodeURIComponent(ten)}\`;\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(\`Lỗi máy chủ (\${res.status})\`);\n  const data = await res.json();\n  if (!data.results?.length) throw new Error('Không tìm thấy thành phố');\n  const { latitude, longitude, name } = data.results[0];\n  return { latitude, longitude, name };\n}`,
        notes: ["res.json() cũng trả về Promise", "encodeURIComponent cho tên có dấu"] },
      { kind: "points", title: "Dự án nhỏ: Ứng dụng thời tiết", lead: "Một luồng hoàn chỉnh, đủ trạng thái.", points: [
        "Ô trống → báo \"Hãy nhập tên thành phố\", không gọi API",
        "Bắt đầu: hiện \"Đang tải…\", khoá nút Tra cứu",
        "timToaDo(ten) → layThoiTiet(lat, lon) → hienThi(ketQua)",
        "Lỗi (không tìm thấy, mạng, res.ok = false): thông báo rõ trong catch",
        "finally: tắt \"Đang tải…\", mở lại nút",
      ] },
    ],
    check: [
      "Đoạn A, setTimeout B, then C, D in theo thứ tự nào?",
      "fetch gặp mã 404 thì Promise fulfilled hay rejected?",
      "Đặt việc tắt \"Đang tải…\" ở đâu để không bao giờ bị kẹt?",
    ],
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function frame(deck: Deck, index: number, total: number, body: string) {
  return `<section class="page"><header><span class="chip">Chương ${deck.chapter + 1}</span><span class="deck">${esc(deck.title)}</span></header>
${body}<footer><span>Codi · JavaScript nền tảng</span><span class="mono">${index} / ${total}</span></footer></section>`;
}

function slideBody(s: Slide) {
  const lead = "lead" in s && s.lead ? `<p class="lead">${esc(s.lead)}</p>` : "";
  if (s.kind === "points") return `<h2>${esc(s.title)}</h2>${lead}<ul class="points">${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  if (s.kind === "compare")
    return `<h2>${esc(s.title)}</h2>${lead}<div class="cols">${[s.left, s.right].map((c, i) =>
      `<div class="col ${s.tone === "pair" ? (i ? "pair b" : "pair a") : i ? "good" : "bad"}"><h3>${esc(c.head)}</h3><ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  return `<h2>${esc(s.title)}</h2>${lead}<div class="codewrap ${s.notes?.length ? "" : "full"}"><pre class="board"><code>${esc(s.code)}</code></pre>${
    s.notes?.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;
}

export function deckHtml(deck: Deck): string {
  const total = deck.slides.length + 3;
  const pages = [
    `<section class="page cover"><div class="line"></div><p class="kicker">JavaScript nền tảng · Chương ${deck.chapter + 1}</p>
<h1>${esc(deck.title)}</h1><p class="sub">${esc(deck.subtitle)}</p><p class="brand"><span class="tile">C</span> Codi</p></section>`,
    frame(deck, 2, total, `<h2>Mục tiêu của chương</h2><p class="lead">Sau chương này, bạn có thể:</p><ol class="goals">${deck.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ol>`),
    ...deck.slides.map((s, i) => frame(deck, i + 3, total, slideBody(s))),
    frame(deck, total, total, `<h2>Tự kiểm tra</h2><p class="lead">Trả lời trước khi làm quiz của bài học.</p><ol class="goals check">${deck.check.map((g) => `<li>${esc(g)}</li>`).join("")}</ol>`),
  ];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Lexend:wght@500;600;700&display=swap">
<style>
@page { size: 1280px 720px; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: "Be Vietnam Pro", "Segoe UI", Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { width: 1280px; height: 720px; padding: 56px 72px 64px; position: relative; overflow: hidden; page-break-after: always; background: #fff; display: flex; flex-direction: column }
.page:last-child { page-break-after: auto }
header { display: flex; align-items: center; gap: 14px; font-size: 16px; color: #475569; margin-bottom: 26px }
.chip { background: #0e7490; color: #fff; border-radius: 999px; padding: 4px 14px; font-weight: 600; font-size: 14px }
footer { position: absolute; left: 72px; right: 72px; bottom: 26px; display: flex; justify-content: space-between; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px }
.mono, code, pre { font-family: "JetBrains Mono", Consolas, monospace }
h1, h2, h3 { font-family: Lexend, "Be Vietnam Pro", sans-serif; letter-spacing: -0.01em }
h2 { font-size: 40px; font-weight: 600; color: #0f172a; margin-bottom: 10px }
h2::after { content: ""; display: block; width: 64px; height: 5px; border-radius: 3px; background: #0e7490; margin-top: 12px }
.lead { font-size: 21px; color: #334155; margin: 8px 0 22px }
.points, .goals { font-size: 25px; line-height: 1.5; padding-left: 0; list-style: none; display: grid; gap: 14px }
.points li { padding-left: 30px; position: relative }
.points li::before { content: ""; position: absolute; left: 4px; top: 15px; width: 10px; height: 10px; border-radius: 50%; background: #0e7490 }
.goals { counter-reset: g }
.goals li { counter-increment: g; display: flex; gap: 18px; align-items: baseline; background: #f1f5f9; border-radius: 12px; padding: 14px 20px }
.goals li::before { content: counter(g); font-family: Lexend, sans-serif; font-weight: 700; color: #fff; background: #0e7490; border-radius: 8px; min-width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px }
.check li { background: #ecfeff }
.codewrap { display: grid; grid-template-columns: 1fr 300px; gap: 28px; flex: 1; min-height: 0 }
.codewrap.full { grid-template-columns: 1fr }
pre.board { font-variant-ligatures: none; background: #0f172a; color: #e2e8f0; border-radius: 14px; padding: 22px 26px; font-size: 17px; line-height: 1.55; white-space: pre; overflow: hidden; border: 1px solid #1e293b; align-self: start; max-height: 470px }
.notes { list-style: none; display: grid; gap: 12px; align-content: start; font-size: 18px; line-height: 1.45 }
.notes li { background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 10px; padding: 12px 14px; color: #164e63 }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 6px }
.col { border-radius: 14px; padding: 22px 26px; border: 1px solid #e2e8f0 }
.col.bad { background: #fff7ed; border-color: #fed7aa }
.col.good { background: #ecfeff; border-color: #a5f3fc }
.col h3 { font-size: 22px; margin-bottom: 12px; color: #0f172a }
.col ul { list-style: none; display: grid; gap: 10px; font-size: 19px; line-height: 1.45 }
.col li { padding-left: 22px; position: relative }
.col.bad li::before { content: "✕"; position: absolute; left: 0; color: #c2410c; font-weight: 700 }
.col.good li::before { content: "✓"; position: absolute; left: 0; color: #0e7490; font-weight: 700 }
.col.pair.a { background: #f8fafc; border-color: #cbd5e1 }
.col.pair.b { background: #ecfeff; border-color: #a5f3fc }
.col.pair li::before { content: ""; position: absolute; left: 4px; top: 11px; width: 8px; height: 8px; border-radius: 50%; background: #0e7490 }
.cover { background: #0f172a; color: #fff; justify-content: center; padding: 72px 96px }
.cover .line { position: absolute; left: 0; right: 0; top: 0; height: 10px; background: linear-gradient(90deg, #22d3ee 0 40%, #60a5fa 40% 60%, #fbbf24 60% 80%, #4ade80 80%) }
.cover .kicker { color: #22d3ee; font-size: 22px; font-weight: 600; margin-bottom: 18px; letter-spacing: 0.02em }
.cover h1 { font-size: 72px; font-weight: 700; line-height: 1.1; margin-bottom: 18px }
.cover .sub { font-size: 28px; color: #cbd5e1 }
.cover .brand { position: absolute; left: 96px; bottom: 56px; display: flex; align-items: center; gap: 12px; font-family: Lexend, sans-serif; font-size: 22px; font-weight: 600 }
.tile { background: #0e7490; color: #fff; width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center }
</style></head><body>${pages.join("\n")}</body></html>`;
}

/** Prints every deck to PDF; returns one buffer per deck in DECKS order. */
export async function renderDecks(decks: Deck[]): Promise<Buffer[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const out: Buffer[] = [];
    for (const deck of decks) {
      // Web fonts are optional: offline, the deck falls back to Segoe UI / Arial (both cover Vietnamese).
      await page.setContent(deckHtml(deck), { waitUntil: "networkidle", timeout: 30_000 }).catch(() => page.setContent(deckHtml(deck), { waitUntil: "load" }));
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      out.push(Buffer.from(await page.pdf({ width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true })));
    }
    return out;
  } finally {
    await browser.close();
  }
}
