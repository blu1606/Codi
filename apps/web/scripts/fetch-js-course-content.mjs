#!/usr/bin/env node
/**
 * Builds apps/web/scripts/data/js-course-content.json: the lesson content for the
 * mockup course `course-js-001` "JavaScript nền tảng".
 *
 * - Videos: curated F8 Official YouTube ids (embed only, nothing is downloaded).
 *   Every id is verified through the public oEmbed endpoint; titles come from
 *   oEmbed. oEmbed has no duration, so durations were read once from the
 *   playlist pages and are pinned in VIDEOS below.
 * - Reading: Vietnamese javascript.info (github.com/javascript-tutorial/vi.javascript.info),
 *   pinned to a commit so output is reproducible. License: CC BY-NC, attribution
 *   is added to every lesson body and to `sources`.
 *
 * Usage: node apps/web/scripts/fetch-js-course-content.mjs
 * Requires Node 18+ (global fetch). No dependencies.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'js-course-content.json');

const REPO = 'javascript-tutorial/vi.javascript.info';
const REPO_SHA = '3c4c43270e99af77df6edae9a301b5cd1ff3bb7d'; // master @ 2024-07-15
const LICENSE = 'CC BY-NC 4.0';
const LICENSE_URL = 'https://github.com/javascript-tutorial/vi.javascript.info/blob/master/LICENSE.md';
const F8_CHANNEL = 'https://www.youtube.com/@F8VNOfficial';
const READING_CREDIT =
  'The Modern JavaScript Tutorial (javascript.info) — Ilya Kantor, bản dịch tiếng Việt, giấy phép CC BY-NC, có chỉnh sửa';
const VIDEO_CREDIT = `Video: F8 Official — ${F8_CHANNEL}`;

// Video ids picked from the F8 playlists "Javascript Cơ Bản" (PL_-VfJajZj0VgpFpEVFzS5Z-lkXtBe-x5)
// and "Javascript Nâng Cao" (PL_-VfJajZj0U1MSx1IMu13oLJq2nM97ac). Durations observed on the playlist pages.
const VIDEOS = {
  CLbx37dqYEI: 246, // Khai báo biến
  tCPTBPua1Xo: 689, // Let & Const keyword
  'P-fMQ3elxSE': 1260, // Kiểu dữ liệu trong JavaScript
  '4g9ENVc2KLA': 430, // Hàm trong JavaScript
  '5N8vz_VmszE': 2187, // Scope trong JavaScript (Nâng Cao)
  xtQtGKL0NCI: 2451, // Closure trong JavaScript (Nâng Cao)
  KrYacXScNQk: 1083, // Làm việc với mảng
  '-xZkVmkDwbU': 726, // Array map method
  '-JMh3A556cw': 1422, // Phương thức reduce
  orIXdOPFWeM: 698, // Object trong JavaScript
  J1m4vLDUhEI: 800, // Destructuring
  W0vEUmyvthQ: 273, // Cách sử dụng JS trong file HTML
  y8ZkHEpF9zM: 825, // Phương thức reduce có logic như thế nào?
  gETNXKi3l_U: 1509, // Lấy element trong DOM
  xwcQl75iSNc: 1125, // innerText & textContent
  SXW4QSjk4Js: 724, // Thêm element / innerHTML
  AA3WWZAMv_0: 1618, // DOM events
  '4ZnQur6rewg': 1177, // PreventDefault & StopPropagation
  U624VLOxiTo: 1013, // Event listener
  QJmNEqy0zV0: 817, // Promise (sync async)
  _4F8ihblZFU: 903, // Cách sử dụng Promise
  Ldl571DAlXI: 888, // Promise chain
  pxyxbaq8i8c: 930, // Promise methods (resolve, reject, all)
  XN2mt1i1kjk: 1370, // Promise example
  '8KkM6JFjJZA': 1340, // Fetch
};

const ENGLISH_NOTE =
  '> **Lưu ý:** một phần bài đọc dưới đây chưa được dịch trong bản tiếng Việt của javascript.info nên được giữ nguyên tiếng Anh.';

/**
 * Article selection. `sections` lists H2 titles to keep (whole section) or "H2/H3" to keep the H2
 * heading + its intro + only that H3. Matching is by title prefix. `intro: false` drops the text
 * before the first H2. `english: true` marks articles that are still untranslated.
 */
const LESSONS = {
  'lesson-js-001': {
    videos: ['CLbx37dqYEI', 'tCPTBPua1Xo', 'P-fMQ3elxSE'],
    intro:
      'Bài này giúp bạn khai báo biến với `let`, hằng với `const` và nhận biết các kiểu dữ liệu cơ bản của JavaScript. Hãy để ý rằng `let` và `const` có **phạm vi khối** (chỉ tồn tại trong cặp `{...}` chứa chúng), và `typeof null` trả về `"object"` — một đặc điểm lịch sử của ngôn ngữ. Xem video, đọc phần dưới rồi làm quiz cuối bài.',
    articles: [
      { path: '1-js/02-first-steps/04-variables', sections: ['Biến', 'Các hằng/', 'Tóm tắt'] },
      {
        path: '1-js/02-first-steps/05-types',
        sections: ['Kiểu số', 'Kiểu chuỗi', 'Boolean', 'Giá trị "null"', 'Giá trị "undefined"', 'Toán tử typeof'],
      },
    ],
  },
  'lesson-js-002': {
    videos: ['4g9ENVc2KLA', '5N8vz_VmszE', 'xtQtGKL0NCI'],
    intro:
      'Hàm giúp đóng gói một đoạn xử lý để dùng lại nhiều lần. Bài này đi qua cách khai báo hàm, tham số, giá trị trả về (hàm không có `return` trả về `undefined`) và phạm vi biến. Phần cuối giới thiệu **closure** — hàm ghi nhớ biến của phạm vi nơi nó được tạo ra.',
    articles: [
      {
        path: '1-js/02-first-steps/15-function-basics',
        sections: ['Khai báo hàm', 'Các biến cục bộ', 'Các biến bên ngoài', 'Các tham số', 'Trả về một giá trị'],
      },
      { path: '1-js/06-advanced-functions/03-closure', english: true, sections: ['Code blocks', 'Nested functions'] },
    ],
  },
  'lesson-js-003': {
    videos: ['KrYacXScNQk', '-xZkVmkDwbU', '-JMh3A556cw'],
    intro:
      'Mảng là cấu trúc dữ liệu dùng nhiều nhất khi xử lý danh sách: đơn hàng, học viên, điểm số... Bài đọc tóm tắt cách khai báo, thêm/bớt phần tử, duyệt mảng và các phương thức quan trọng `forEach`, `find`, `filter`, `map`, `reduce`. Chạy lại từng ví dụ trong Console rồi làm quiz cuối bài.',
    articles: [
      {
        path: '1-js/05-data-types/04-array',
        english: true,
        sections: ['Declaration', 'Loops'],
      },
      {
        path: '1-js/05-data-types/05-array-methods',
        english: true,
        intro: false,
        sections: [
          'Iterate: forEach',
          'Searching in array/find and findIndex',
          'Searching in array/filter',
          'Transform an array/map',
          'Transform an array/reduce',
        ],
      },
    ],
  },
  'lesson-js-004': {
    videos: ['orIXdOPFWeM', 'J1m4vLDUhEI'],
    intro:
      'Đối tượng (object) gom nhiều thuộc tính liên quan vào một giá trị, còn destructuring giúp "bóc" các thuộc tính đó ra biến chỉ với một dòng. Hai kỹ thuật này đi cùng nhau trong hầu hết code JavaScript hiện đại, ví dụ khi xử lý danh sách đơn hàng bằng `reduce`.',
    articles: [
      {
        path: '1-js/04-object-basics/01-object',
        sections: [
          'Đối tượng theo nghĩa đen',
          'Dấu ngoặc vuông/',
          'Property value shorthand',
          'Tổng kết',
        ],
      },
      {
        path: '1-js/05-data-types/10-destructuring-assignment',
        english: true,
        sections: ['Object destructuring/', 'Summary'],
      },
    ],
  },
  'lesson-js-p01': {
    videos: ['W0vEUmyvthQ'],
    customBody: () => P01_BODY,
  },
  'lesson-js-p02': {
    videos: ['y8ZkHEpF9zM'],
    customBody: () => P02_BODY,
  },
  'lesson-js-005': {
    videos: ['gETNXKi3l_U', 'xwcQl75iSNc', 'SXW4QSjk4Js'],
    intro:
      'DOM là cây đối tượng mà trình duyệt tạo ra từ HTML; JavaScript đọc và sửa cây này để trang web "sống" lên. Bài này hướng dẫn tìm phần tử bằng `querySelector`/`getElementById`, đổi nội dung bằng `textContent`/`innerHTML`, và tạo, chèn, xóa phần tử.',
    articles: [
      {
        path: '2-ui/1-document/04-searching-elements-dom',
        english: true,
        sections: ['document.getElementById', 'querySelectorAll', 'querySelector', 'Summary'],
      },
      {
        path: '2-ui/1-document/05-basic-dom-node-properties',
        english: true,
        intro: false,
        sections: ['innerHTML: the contents', 'textContent: pure text'],
      },
      {
        path: '2-ui/1-document/07-modifying-document',
        english: true,
        intro: false,
        sections: ['Creating an element', 'Insertion methods', 'Node removal'],
      },
    ],
  },
  'lesson-js-006': {
    videos: ['AA3WWZAMv_0', '4ZnQur6rewg', 'U624VLOxiTo'],
    intro:
      'Sự kiện (event) là tín hiệu cho biết điều gì đó vừa xảy ra: người dùng bấm nút, gõ phím, gửi form... Bài này giải thích `addEventListener`, đối tượng `event`, cơ chế nổi bọt (bubbling) và kỹ thuật **event delegation**: gắn một trình xử lý duy nhất ở phần tử cha thay vì gắn cho từng phần tử con.',
    articles: [
      {
        path: '2-ui/2-events/01-introduction-browser-events',
        english: true,
        intro: false,
        sections: ['addEventListener'],
      },
      {
        path: '2-ui/2-events/02-bubbling-and-capturing',
        english: true,
        sections: ['Bubbling', 'event.target', 'Stopping bubbling'],
      },
      {
        path: '2-ui/2-events/03-event-delegation',
        english: true,
        sections: ['Delegation example', 'Summary'],
      },
    ],
  },
  'lesson-js-007': {
    videos: ['QJmNEqy0zV0', '_4F8ihblZFU', 'Ldl571DAlXI'],
    intro:
      'Nhiều tác vụ trong JavaScript mất thời gian (tải dữ liệu, đọc tệp, hẹn giờ). Promise là đối tượng đại diện cho kết quả "sẽ có trong tương lai" của tác vụ đó, ở một trong ba trạng thái: pending, fulfilled hoặc rejected. Bài này giới thiệu cách tạo Promise, nhận kết quả bằng `then/catch/finally` và nối chuỗi Promise.',
    articles: [
      { path: '1-js/11-async/02-promise-basics', english: true, sections: ['Consumers: then, catch, finally/then', 'Consumers: then, catch, finally/catch'] },
      { path: '1-js/11-async/03-promise-chaining', english: true, sections: ['Returning promises', 'Summary'] },
    ],
  },
  'lesson-js-008': {
    videos: ['pxyxbaq8i8c', 'XN2mt1i1kjk'],
    intro:
      '`async/await` là cú pháp giúp viết code bất đồng bộ trông như code tuần tự: `await` tạm dừng hàm `async` cho tới khi Promise hoàn tất. Lỗi từ Promise bị reject được bắt bằng `try...catch` quen thuộc. Kênh F8 chưa có video riêng về `async/await`, nên hai video đi kèm ôn lại Promise, `reject` và một ví dụ thực tế — nền tảng trực tiếp của `async/await`.',
    articles: [
      { path: '1-js/11-async/08-async-await', english: true, sections: ['Async functions', 'Await', 'Error handling', 'Summary'] },
      {
        path: '1-js/10-error-handling/1-try-catch',
        english: true,
        intro: false,
        sections: ['The "try...catch" syntax'],
      },
      { path: '1-js/11-async/04-promise-error-handling', english: true, sections: ['Unhandled rejections'] },
    ],
  },
  'lesson-js-009': {
    videos: ['8KkM6JFjJZA'],
    intro:
      'Dự án cuối khóa kết hợp mọi thứ đã học: gọi API bằng `fetch`, xử lý bất đồng bộ với `async/await`, cập nhật DOM và hiển thị trạng thái đang tải / lỗi. Phần đầu là hướng dẫn dự án, phần sau là bài đọc về `fetch`.',
    preArticles: () => WEATHER_GUIDE,
    articles: [{ path: '5-network/01-fetch', english: true, sections: ['Summary'] }],
  },
};

const P01_BODY = `Bài hướng dẫn này giúp bạn làm quen với việc viết và chạy JavaScript ngay trong Codi: trình soạn code bên phải chạy tệp \`main.js\`, còn Console hiện kết quả của mọi lệnh \`console.log\`. Đi lần lượt từng bước, đọc kỹ thông báo lỗi và đừng xem lời giải trước khi tự thử.

## Chạy code và đọc Console

- Bấm **Chạy** (hoặc **Ctrl + Enter**, ⌘ + Enter trên Mac) để chạy toàn bộ tệp từ trên xuống dưới.
- \`console.log(giaTri)\` in giá trị ra Console. Có thể in nhiều giá trị một lúc: \`console.log("Tổng:", tong)\`.
- Mỗi bước có code nháp được lưu tự động, nên bạn cứ thoải mái thử nghiệm.

\`\`\`js
const ten = "Minh Anh";
console.log("Chào " + ten + "!");
console.log(\`Chào \${ten}!\`); // template literal cho kết quả giống hệt
\`\`\`

## Ba hàm xử lý mảng hay dùng nhất

| Hàm | Kết quả | Ví dụ |
|---|---|---|
| \`map(fn)\` | Mảng mới, mỗi phần tử đã biến đổi | \`[7, 9].map((d) => d * 10)\` → \`[70, 90]\` |
| \`filter(fn)\` | Mảng mới chỉ gồm phần tử thỏa điều kiện | \`[7, 4].filter((d) => d >= 5)\` → \`[7]\` |
| \`reduce(fn, init)\` | Một giá trị gộp từ cả mảng | \`[7, 9].reduce((t, d) => t + d, 0)\` → \`16\` |

Cả ba **không thay đổi mảng gốc**, nên có thể nối chúng với nhau: \`diem.filter((d) => d >= 5).map((d) => d * 10)\`.

## Đọc thông báo lỗi

- **Gõ sai tên thuộc tính** (\`diem.lenght\`) không gây lỗi: JavaScript chỉ trả về \`undefined\`. Nếu thấy \`undefined\` hoặc \`NaN\` bất ngờ, hãy kiểm tra chính tả.
- **ReferenceError: x is not defined** nghĩa là bạn dùng biến/hàm chưa khai báo (hoặc gõ sai tên).
- **TypeError: ... is not a function** nghĩa là bạn gọi \`()\` trên một giá trị không phải hàm.
- Thông báo lỗi luôn kèm số dòng — hãy đọc từ đó trước.

## Lỗi "lệch một" trong vòng lặp

Chỉ số mảng bắt đầu từ \`0\`, nên phần tử cuối có chỉ số \`length - 1\`. Vòng lặp \`for (let i = 0; i <= arr.length; i++)\` đọc thêm một phần tử không tồn tại (\`undefined\`), làm phép cộng ra \`NaN\`. Điều kiện đúng là \`i < arr.length\`.

\`\`\`js
function diemTrungBinh(diem) {
  let tong = 0;
  for (let i = 0; i < diem.length; i++) {
    tong += diem[i];
  }
  return tong / diem.length;
}
\`\`\`

## Viết hàm có điều kiện

Với các mức xếp loại, hãy kiểm tra **từ mức cao xuống thấp** và \`return\` ngay khi khớp; như vậy không cần \`else\` lồng nhau:

\`\`\`js
function phanLoai(n) {
  if (n >= 100) return "lớn";
  if (n >= 10) return "vừa";
  return "nhỏ";
}
\`\`\`

## Đọc thêm

- Chạy JavaScript trong trang HTML: https://javascript.info/hello-world
- Developer console: https://javascript.info/devtools`;

const P02_BODY = `Thử thách này luyện cách "gộp" một mảng đơn hàng thành con số thống kê: tổng tiền, đơn lớn nhất và số đơn theo trạng thái. Cả ba đều giải gọn được bằng \`reduce\`, kết hợp \`filter\`/\`map\` khi cần. Đọc hướng dẫn dưới đây, rồi tự viết code trước khi xem gợi ý.

## Dữ liệu đầu vào

Mỗi đơn hàng là một đối tượng có \`id\`, \`price\` và \`status\`:

\`\`\`js
const orders = [
  { id: 'DH01', price: 590000, status: 'paid' },
  { id: 'DH02', price: 1290000, status: 'pending' },
  { id: 'DH03', price: 350000, status: 'paid' },
];
\`\`\`

## reduce hoạt động thế nào

\`arr.reduce((acc, item) => ..., init)\` duyệt từng phần tử; giá trị trả về của mỗi lần gọi trở thành \`acc\` cho lần tiếp theo. \`init\` là giá trị khởi đầu của \`acc\`.

\`\`\`js
[1, 2, 3].reduce((tong, x) => tong + x, 0);
// lần 1: tong = 0, x = 1 → 1
// lần 2: tong = 1, x = 2 → 3
// lần 3: tong = 3, x = 3 → 6
\`\`\`

> **Luôn truyền giá trị khởi đầu** khi mảng có thể rỗng: \`[].reduce((a, b) => a + b)\` ném \`TypeError\`, còn \`[].reduce((a, b) => a + b, 0)\` trả về \`0\`.

## Bước 1 — Tổng tiền

Gộp \`price\` của mọi đơn, khởi đầu từ \`0\`. Có thể dùng destructuring ngay trong tham số: \`(tong, { price }) => tong + price\`.

## Bước 2 — Đơn lớn nhất

Mảng rỗng phải trả về \`null\`, nên kiểm tra \`orders.length\` trước. Sau đó dùng \`reduce\` **không** có giá trị khởi đầu: \`acc\` bắt đầu bằng phần tử đầu tiên, và mỗi bước giữ lại đơn có \`price\` lớn hơn.

\`\`\`js
const lonNhat = [3, 8, 5].reduce((max, x) => (x > max ? x : max));
// 8
\`\`\`

## Bước 3 — Đếm theo trạng thái

Lần này \`acc\` là một **đối tượng**, khởi đầu \`{}\`. Với mỗi đơn, tăng \`acc[status]\` thêm 1 (dùng \`?? 0\` hoặc \`|| 0\` cho lần đầu gặp trạng thái đó), rồi **trả về \`acc\`**:

\`\`\`js
const dem = ['a', 'b', 'a'].reduce((acc, k) => {
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
// { a: 2, b: 1 }
\`\`\`

Quên \`return acc\` là lỗi phổ biến nhất: lần lặp sau sẽ nhận \`undefined\`.

## filter và map khi nào?

- Chỉ tính tổng các đơn đã thanh toán: \`orders.filter((o) => o.status === 'paid')\` rồi mới \`reduce\`.
- Lấy danh sách mã đơn: \`orders.map((o) => o.id)\`.

## Kiểm tra trước khi nộp

- Mảng rỗng: \`tongTien([])\` → \`0\`, \`donLonNhat([])\` → \`null\`, \`demTheoTrangThai([])\` → \`{}\`.
- Không sửa mảng \`orders\` gốc.
- Bấm **Chạy** để xem kết quả các test.

## Đọc thêm

- Array methods (map, filter, reduce): https://javascript.info/array-methods`;

const WEATHER_GUIDE = `## Hướng dẫn dự án: Ứng dụng thời tiết

**Yêu cầu bài tập:** xây dựng trang tra cứu thời tiết theo tên thành phố, có trạng thái **đang tải** và **lỗi**, rồi nộp đường dẫn GitHub.

### 1. Khung HTML

\`\`\`html
<form id="search-form">
  <input id="city" placeholder="Nhập tên thành phố, ví dụ: Hà Nội" required>
  <button type="submit">Tra cứu</button>
</form>
<p id="status" role="status"></p>
<section id="result" hidden></section>
\`\`\`

### 2. Gọi API bằng fetch

Có thể dùng [Open-Meteo](https://open-meteo.com/) vì không cần API key: một request đổi tên thành phố sang tọa độ, request thứ hai lấy thời tiết hiện tại.

\`\`\`js
async function layThoiTiet(tenThanhPho) {
  const geoUrl = \`https://geocoding-api.open-meteo.com/v1/search?count=1&language=vi&name=\${encodeURIComponent(tenThanhPho)}\`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) throw new Error(\`Lỗi tìm thành phố (HTTP \${geoRes.status})\`);
  const geo = await geoRes.json();
  if (!geo.results?.length) throw new Error('Không tìm thấy thành phố');

  const { latitude, longitude, name } = geo.results[0];
  const res = await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${latitude}&longitude=\${longitude}&current=temperature_2m,wind_speed_10m\`);
  if (!res.ok) throw new Error(\`Lỗi lấy thời tiết (HTTP \${res.status})\`);
  const data = await res.json();
  return { name, ...data.current };
}
\`\`\`

> \`fetch\` chỉ reject khi lỗi mạng; với HTTP 404/500 nó vẫn resolve, nên phải tự kiểm tra \`response.ok\`.

### 3. Trạng thái đang tải, lỗi và kết quả

\`\`\`js
const form = document.querySelector('#search-form');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const city = form.elements.city.value.trim();
  statusEl.textContent = 'Đang tải...';
  resultEl.hidden = true;
  form.querySelector('button').disabled = true;
  try {
    const w = await layThoiTiet(city);
    resultEl.textContent = \`\${w.name}: \${w.temperature_2m}°C, gió \${w.wind_speed_10m} km/h\`;
    resultEl.hidden = false;
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = \`Không lấy được dữ liệu: \${err.message}\`;
  } finally {
    form.querySelector('button').disabled = false;
  }
});
\`\`\`

### 4. Tiêu chí tự kiểm tra

- Nhập tên hợp lệ → hiện nhiệt độ; tên sai → hiện thông báo lỗi rõ ràng.
- Trong lúc chờ có chữ "Đang tải..." và nút bị khóa để tránh gửi trùng.
- Dùng \`textContent\` (không dùng \`innerHTML\`) khi hiển thị dữ liệu từ API.
- Code tách hàm gọi API và hàm hiển thị; README trong repo GitHub mô tả cách chạy.`;

// ---------- helpers ----------

function slugOf(articlePath) {
  return articlePath.split('/').pop().replace(/^\d+-/, '');
}

function articleSource(articlePath, title, english = false) {
  return {
    title: `${title} — javascript.info (${english ? 'kho bản dịch tiếng Việt, bài chưa dịch' : 'bản tiếng Việt'})`,
    url: `https://github.com/${REPO}/blob/${REPO_SHA}/${articlePath}/article.md`,
    license: LICENSE,
  };
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Request failed for ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchArticle(articlePath) {
  const url = `https://raw.githubusercontent.com/${REPO}/${REPO_SHA}/${articlePath}/article.md`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Article ${articlePath}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith('# ')) throw new Error(`Article ${articlePath}: unexpected content`);
  return text.replace(/\r\n/g, '\n');
}

async function verifyVideo(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  const res = await fetchWithRetry(url);
  if (res.status !== 200) throw new Error(`oEmbed ${id}: HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.title !== 'string' || !data.title) throw new Error(`oEmbed ${id}: missing title`);
  if (!/F8/i.test(`${data.author_name} ${data.author_url}`)) {
    throw new Error(`oEmbed ${id}: unexpected channel ${data.author_name}`);
  }
  return { youtubeId: id, title: data.title, durationSeconds: VIDEOS[id] };
}

// ---------- markdown cleaning ----------

const NOTE_BLOCKS = new Set(['smart', 'warn', 'online', 'summary', 'compare', 'quote']);

function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#96;/g, '`').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function cleanInline(line) {
  return line
    .replace(/\[cut\]/g, '')
    .replace(/`key:([^`]+)`/g, '`$1`')
    .replace(/<code>(.*?)<\/code>/g, (_, inner) => {
      const text = decodeEntities(inner.replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, ''));
      return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
    })
    .replace(/<span class="devtools"[^>]*><\/span>/g, '')
    .replace(/<(b|strong)>(.*?)<\/\1>/g, '**$2**')
    .replace(/<(i|em)>(.*?)<\/\1>/g, '*$2*')
    .replace(/\]\(info:([\w-]+)(#[\w-]+)?\)/g, '](https://javascript.info/$1$2)')
    .replace(/<info:([\w-]+)(#[\w-]+)?>/g, 'https://javascript.info/$1$2');
}

/** Cleans javascript.info markdown: fences, note blocks, special lines, inline syntax. */
function cleanMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(\s*)(`{3,})\s*(\S*)(.*)$/);
    if (fence) {
      const [, indent, ticks, kind, rest] = fence;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ticks) j++;
      if (j >= lines.length) throw new Error(`Unclosed fence at line ${i + 1}`);
      const inner = lines.slice(i + 1, j);
      if (NOTE_BLOCKS.has(kind)) {
        const header = rest.match(/header="([^"]*)"/)?.[1];
        const body = cleanMarkdown(inner.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join('\n')).split('\n');
        if (header) out.push(`${indent}> **${cleanInline(header)}**`, `${indent}>`);
        for (const b of body) out.push(b ? `${indent}> ${b}` : `${indent}>`);
      } else {
        const lang = /^(js|html|css|json|sh)$/.test(kind) ? kind : '';
        out.push(indent + '```' + lang, ...inner.map((l) => l.replace(/\*!\*|\*\/!\*/g, '')), indent + '```');
      }
      i = j;
      continue;
    }
    if (/^\[(iframe|codetabs|js |html |demo|edit|online)/.test(line)) continue;
    // The player drops raw HTML, so HTML tables become GFM tables.
    if (line.trim() === '<table>') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '</table>') j++;
      if (j >= lines.length) throw new Error(`Unclosed <table> at line ${i + 1}`);
      const rows = [...lines.slice(i + 1, j).join(' ').matchAll(/<tr>(.*?)<\/tr>/g)].map((r) =>
        [...r[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map((c) => cleanInline(c[1].trim()).replace(/\|/g, '\\|')),
      );
      if (rows.length) {
        out.push(`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => '---').join('|')}|`);
        for (const r of rows.slice(1)) out.push(`| ${r.join(' | ')} |`);
      }
      i = j;
      continue;
    }
    // javascript.info definition lists ("term" then ": description") become "- term — description".
    const definition = line.match(/^:\s+(.*)$/);
    if (definition && out.length && out[out.length - 1].trim()) {
      out[out.length - 1] = `- ${out[out.length - 1]} — ${cleanInline(definition[1])}`;
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue; // relative diagram images are not available offline
    out.push(cleanInline(line).replace(/!\[[^\]]*\]\((?!https?:)[^)]*\)/g, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Splits an article into title, intro and H2 sections (each with intro + H3 children). Fence-aware. */
function parseArticle(md) {
  const lines = md.split('\n');
  let title = '';
  const intro = [];
  const sections = [];
  let inFence = null;
  let current = null; // H2
  let child = null; // H3
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,})/);
    if (fence) {
      if (!inFence) inFence = fence[1];
      else if (line.trim() === inFence) inFence = null;
    }
    const heading = !inFence && !fence && line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s*\[#[\w-]+\]\s*$/, '').trim();
      if (level === 1 && !title) { title = text; continue; }
      if (level === 2) { current = { title: text, intro: [], children: [] }; child = null; sections.push(current); continue; }
      if (level === 3 && current) { child = { title: text, lines: [] }; current.children.push(child); continue; }
    }
    if (child) child.lines.push(line);
    else if (current) current.intro.push(line);
    else intro.push(line);
  }
  return { title, intro: intro.join('\n'), sections };
}

/** Selects sections and returns markdown with headings shifted one level down (H1 → ##). */
function selectArticle(md, spec) {
  const { title, intro, sections } = parseArticle(md);
  const parts = [`## ${title}`];
  if (spec.intro !== false && intro.trim()) parts.push(intro.trim());
  const used = new Set();
  for (const selector of spec.sections) {
    // A whole-H2 match wins (titles such as "Methods pop/push" contain slashes); otherwise "H2/H3".
    // "H2/" keeps the H2 without its H3 children; exact titles win over prefixes.
    let sec = sections.find((s) => s.title === selector) ?? sections.find((s) => s.title.startsWith(selector));
    let children = sec?.children;
    if (!sec) {
      const cut = selector.indexOf('/');
      if (cut < 0) throw new Error(`Section "${selector}" not found in "${title}"`);
      const [h2, h3] = [selector.slice(0, cut), selector.slice(cut + 1)];
      sec = sections.find((s) => s.title === h2) ?? sections.find((s) => s.title.startsWith(h2));
      children = h3 ? (sec?.children.filter((c) => c.title.startsWith(h3)) ?? []) : [];
      if (!sec || (h3 && children.length === 0)) throw new Error(`Section "${selector}" not found in "${title}"`);
    }
    if (!used.has(sec.title)) {
      parts.push(`### ${sec.title}`);
      if (sec.intro.join('\n').trim()) parts.push(sec.intro.join('\n').trim());
      used.add(sec.title);
    }
    for (const c of children) parts.push(`#### ${c.title}`, c.lines.join('\n').trim());
  }
  return { title, markdown: cleanMarkdown(parts.join('\n\n')) };
}

function sourcesSection(sources, hasVideos) {
  const lines = ['## Nguồn', ''];
  for (const s of sources) {
    const slug = s.articlePath ? ` (bản gốc: https://javascript.info/${slugOf(s.articlePath)})` : '';
    lines.push(`- [${s.title}](${s.url})${slug}`);
  }
  if (sources.length) lines.push(`- ${READING_CREDIT}. Giấy phép: ${LICENSE_URL}`);
  if (hasVideos) lines.push(`- ${VIDEO_CREDIT}`);
  return lines.join('\n');
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

// ---------- build ----------

async function buildLesson(id, spec) {
  const videos = [];
  for (const vid of spec.videos) {
    if (!(vid in VIDEOS)) throw new Error(`${id}: video ${vid} has no pinned duration`);
    videos.push(await verifyVideo(vid));
  }

  const sources = [];
  const parts = [];
  if (spec.customBody) {
    parts.push(spec.customBody());
  } else {
    parts.push(spec.intro);
    if (spec.articles.some((a) => a.english)) parts.push(ENGLISH_NOTE);
    if (spec.preArticles) parts.push(spec.preArticles());
    for (const a of spec.articles) {
      const md = await fetchArticle(a.path);
      const { title, markdown } = selectArticle(md, a);
      parts.push(markdown);
      sources.push({ ...articleSource(a.path, title, a.english), articlePath: a.path });
    }
  }
  parts.push(sourcesSection(sources, videos.length > 0));
  const body = parts.join('\n\n').trim() + '\n';
  return {
    videos,
    body,
    sources: sources.map(({ title, url, license }) => ({ title, url, license })),
  };
}

function validate(content) {
  const errors = [];
  for (const id of Object.keys(LESSONS)) {
    const lesson = content.lessons[id];
    if (!lesson) { errors.push(`${id}: missing`); continue; }
    if (!lesson.body?.trim()) errors.push(`${id}: empty body`);
    if (!/\n## Nguồn\n/.test(lesson.body)) errors.push(`${id}: missing "Nguồn" section`);
    for (const token of ['[cut]', '<info:', '(info:', '*!*', '```js run', '`key:', '[iframe', '[codetabs', '```smart', '```warn']) {
      if (lesson.body.includes(token)) errors.push(`${id}: leftover token ${token}`);
    }
    let inFence = false;
    for (const line of lesson.body.split('\n')) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      const prose = line.replace(/``[^`]*``|`[^`]*`/g, '');
      if (!inFence && /<\/?[a-zA-Z][^>]*>/.test(prose)) errors.push(`${id}: raw HTML outside code: ${line.slice(0, 60)}`);
    }
    const fences = lesson.body.match(/^\s*```/gm)?.length ?? 0;
    if (fences % 2) errors.push(`${id}: unbalanced code fences`);
    for (const v of lesson.videos) {
      if (!/^[\w-]{11}$/.test(v.youtubeId)) errors.push(`${id}: bad youtubeId ${v.youtubeId}`);
      if (!Number.isInteger(v.durationSeconds) || v.durationSeconds <= 0) errors.push(`${id}: bad duration ${v.youtubeId}`);
    }
  }
  return errors;
}

async function main() {
  const lessons = {};
  for (const [id, spec] of Object.entries(LESSONS)) {
    lessons[id] = await buildLesson(id, spec);
    console.log(`${id}: ${lessons[id].videos.length} video(s), ${wordCount(lessons[id].body)} words`);
  }
  const content = {
    attribution: {
      reading: `${READING_CREDIT}. Nguồn: https://github.com/${REPO} (giấy phép ${LICENSE_URL}).`,
      video: `${VIDEO_CREDIT}. Video được nhúng từ YouTube, không tải xuống hay lưu trữ lại.`,
    },
    lessons,
  };
  const errors = validate(content);
  if (errors.length) {
    console.error(`Validation failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(content, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
