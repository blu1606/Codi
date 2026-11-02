/**
 * Topic fact banks shared by the simulated lecturer AI (quiz generation, document import, lesson drafts).
 * Each fact is one multiple-choice question: { q, a, w[3], e } (question, correct answer, 3 distractors, explanation).
 * Simulation only: the real app calls an LLM; the port picks facts deterministically by keywords.
 */
export const BANK = [
  { k: /next|server component|app router|vercel/i, facts: [
    { q: 'Trong App Router, component trong thư mục app/ mặc định là loại nào?', a: 'Server Component', w: ['Client Component', 'Web Component', 'Pure Component'], e: 'Component là Server Component cho tới khi tệp có chỉ thị "use client".' },
    { q: 'Muốn dùng useState trong một component, bạn cần làm gì?', a: 'Thêm "use client" ở đầu tệp', w: ['Đổi đuôi tệp thành .client.js', 'Bọc component trong Suspense', 'Không cần làm gì'], e: 'Hook chỉ chạy trong Client Component.' },
    { q: 'fetch trong Server Component có tham số nào để cache 60 giây?', a: '{ next: { revalidate: 60 } }', w: ['{ cache: 60 }', '{ timeout: 60 }', '{ ttl: "60s" }'], e: 'revalidate đặt thời gian làm mới dữ liệu.' },
    { q: 'Tệp nào định nghĩa giao diện dùng chung cho một nhóm trang?', a: 'layout.js', w: ['page.js', 'loading.js', 'route.js'], e: 'layout.js bao các trang con và giữ trạng thái khi chuyển trang.' },
    { q: 'Tệp loading.js dùng để làm gì?', a: 'Hiện giao diện chờ khi trang đang tải dữ liệu', w: ['Định nghĩa API', 'Cấu hình cache', 'Khai báo biến môi trường'], e: 'Next.js tự bọc trang trong Suspense với loading.js.' },
    { q: 'Server Component có thể đọc trực tiếp cơ sở dữ liệu không?', a: 'Có, vì chạy trên máy chủ', w: ['Không bao giờ', 'Chỉ khi có "use client"', 'Chỉ trong môi trường dev'], e: 'Server Component chạy trên máy chủ nên truy cập được tài nguyên phía máy chủ.' },
  ] },
  { k: /react|jsx|state|hook|props|component|reducer/i, facts: [
    { q: 'JSX được biên dịch thành gì?', a: 'Lời gọi React.createElement (hoặc jsx())', w: ['HTML tĩnh', 'Chuỗi template', 'JSON'], e: 'Trình biên dịch chuyển JSX thành lời gọi hàm tạo phần tử.' },
    { q: 'Vì sao không nên sửa trực tiếp state (ví dụ state.push)?', a: 'React so sánh tham chiếu nên không biết state đã đổi', w: ['Vì sẽ báo lỗi cú pháp', 'Vì state là hằng số', 'Vì làm chậm trình duyệt'], e: 'Tạo mảng/đối tượng mới để React phát hiện thay đổi.' },
    { q: 'Prop key trong danh sách dùng để làm gì?', a: 'Giúp React nhận biết phần tử nào thay đổi', w: ['Đặt thứ tự hiển thị', 'Tạo id cho CSS', 'Bắt buộc với mọi phần tử'], e: 'key ổn định giúp React tái sử dụng đúng phần tử.' },
    { q: 'useEffect với mảng phụ thuộc rỗng [] chạy khi nào?', a: 'Một lần sau lần render đầu tiên', w: ['Mỗi lần render', 'Không bao giờ', 'Trước lần render đầu'], e: 'Không có phụ thuộc nên effect không chạy lại.' },
    { q: 'Props trong component con có được sửa không?', a: 'Không, props chỉ đọc', w: ['Có, như biến thường', 'Chỉ với số', 'Chỉ trong useEffect'], e: 'Dữ liệu chảy một chiều từ cha xuống con.' },
  ] },
  { k: /javascript|mảng|hàm|đối tượng|biến|dom|async|promise/i, facts: [
    { q: '[1, 2, 3].map(x => x * 2) trả về gì?', a: '[2, 4, 6]', w: ['[1, 2, 3]', '6', 'undefined'], e: 'map trả về mảng mới sau khi áp dụng hàm cho từng phần tử.' },
    { q: 'Hàm không có return trả về giá trị nào?', a: 'undefined', w: ['null', '0', '""'], e: 'Mọi hàm không return đều trả về undefined.' },
    { q: 'filter khác find ở điểm nào?', a: 'filter trả về mảng mọi phần tử thoả, find trả về phần tử đầu tiên', w: ['Không khác', 'find nhanh hơn nên luôn dùng find', 'filter sửa mảng gốc'], e: 'Chọn theo số kết quả bạn cần.' },
    { q: 'await chỉ dùng được ở đâu?', a: 'Trong hàm async (hoặc cấp cao nhất của module)', w: ['Trong mọi hàm', 'Chỉ trong vòng lặp', 'Chỉ trong try/catch'], e: 'await cần ngữ cảnh async.' },
    { q: 'const {name} = user được gọi là gì?', a: 'Destructuring', w: ['Hoisting', 'Currying', 'Spread'], e: 'Destructuring tách thuộc tính ra biến.' },
  ] },
];

/** First bank whose keywords match the text, or null. */
export const bankFor = (text) => BANK.find((b) => b.k.test(String(text || ''))) || null;

/** Stable rotation so the correct answer is not always first. */
export const rot = (arr, n) => arr.slice(n % arr.length).concat(arr.slice(0, n % arr.length));

/** Topic-free starter facts about one lesson/course title (the lecturer is expected to edit them). */
export const genericFacts = (title) => [
  { q: `Mục tiêu chính của bài “${title}” là gì?`, a: `Hiểu và áp dụng được nội dung “${title}”`, w: ['Học thuộc định nghĩa', 'Cài đặt phần mềm', 'Không có mục tiêu cụ thể'], e: 'Câu hỏi khởi động — nên sửa cho sát nội dung tài liệu.' },
  { q: `Khi áp dụng “${title}”, lỗi hay gặp nhất là gì?`, a: 'Bỏ qua trường hợp biên', w: ['Viết quá nhiều chú thích', 'Đặt tên quá dài', 'Dùng quá ít biến'], e: 'Nên thay bằng lỗi cụ thể trong tài liệu.' },
];
