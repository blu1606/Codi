/**
 * window.CodiData — seed data for the Codi UX prototype (fictional sample content).
 * Core deep-clones this into Codi.state.db on first load / reset; feature modules
 * must read and mutate Codi.db(), never CodiData directly.
 *
 * Top-level keys
 *  users[]            {id, name, email, role: learner|lecturer|admin, status: active|inactive, createdAt, lastActive}
 *  categories[]       {id, name}
 *  levels             {Beginner:'Cơ bản', Intermediate:'Trung cấp', Advanced:'Nâng cao'}
 *  courses[]          {id, slug, title, summary, categoryId, level, lecturerId, price, proposedPrice, status,
 *                      rejectReason?, hideReason?, submittedAt?, rating, ratingCount, ratingBreakdown[5..1],
 *                      learnersCount, durationMin (computed), outcomes[], requirements[], hue,
 *                      concepts[{id,name}], prerequisites[{from,to}] (from must be learned before to),
 *                      chapters[{id,title,lessons[]}], entryTest {id,title,isEntryTest,questions[]}|null,
 *                      defaultOrder[lessonId], aiPath[{lessonId, reason, skippable}], pathUpdates[{afterLessonId, changes[{type,lessonId,text}]}]}
 *    lesson           {id, title, type: video|pdf|reading|tutorial|code, durationMin, conceptIds[], reading?,
 *                      code? (tutorial|code lessons — see CODE_* constants below and js/coding-practice.js),
 *                      quiz {id, passingScore, questions[{id, conceptId, text, options[], correctIndex, explanation}]}|null,
 *                      assignment {instructions, requiresFile, requiresLink}|null}
 *  knowledgeMaps      {courseId: {status: analysing|ready|confirmed|failed|stale, updatedAt,
 *                      concepts[{id,name,lessonIds[],review: suggested|accepted|edited|declined}],
 *                      edges[{from,to,review}]}}
 *  orders[]           {id, code, userId, items[{courseId, price}], voucherCode, discount, total, method, status:
 *                      pending|paid|failed|cancelled|refunded, createdAt, paidAt, content, timeline[{at,label}]}
 *  vouchers[]         {id, code, type: percent|amount, value, minOrder, usageLimit|null, used, expiresAt|null, active, scope}
 *  bankInfo           {bank, accountNumber, accountName}
 *  submissions[]      {id, courseId, lessonId, userId, submittedAt, fileName, link, note, status: pending|graded, score, maxScore, feedback, gradedAt}
 *  questions[]        {id, courseId, lessonId, userId, text, createdAt, status: unanswered|answered, replies[{userId, isLecturer, text, at}]}
 *  reviews[]          {id, courseId, userId, stars, text, createdAt, reply {text, at}|null}
 *  enrolments[]       {userId, courseId, enrolledAt}
 *  learnerProgress[]  {userId, courseId, completed[lessonId], quizScores{lessonId:score}, answers{questionId:true|false}, lastActive}
 *  learnerSeed        main learner's study state for owned courses (goal, diagnostic, mastery, assignments...)
 *  codeAttempts[]     {userId, courseId, lessonId, draft, submits, runs, passed, lastScore, solutionViewed,
 *                      failedTests{testId:count}, lastRun, tutorialStep, tutorialVisited[], stepDrafts{}, updatedAt}
 *  notifications[]    {id, userId, title, body, link, read, createdAt}
 */
(function () {
  // ---------- helpers ----------
  const q = (id, conceptId, text, options, correctIndex, explanation) =>
    ({ id, conceptId, text, options, correctIndex, explanation });

  // Builds a course from compact chapter/lesson tuples and a per-concept question bank.
  // bank[conceptId] = [entryQuestion, quizQ1, quizQ2]
  function buildCourse(base, chapters, bank) {
    let n = 0;
    base.chapters = chapters.map((ch, ci) => ({
      id: `${base.id}-ch${ci + 1}`,
      title: ch.title,
      lessons: ch.lessons.map((l) => {
        // Explicit ids (practice lessons) keep the numbered ids of the other lessons stable.
        const id = l.id || `${base.lessonPrefix}-${String((n += 1)).padStart(3, '0')}`;
        const concept = l.c[0];
        const qs = bank && bank[concept] ? bank[concept].slice(1) : [];
        return {
          id,
          title: l.t,
          type: l.type,
          durationMin: l.m,
          conceptIds: l.c,
          reading: l.reading || null,
          quiz: l.quiz === false || !qs.length ? null : { id: `${id}-quiz`, passingScore: 70, questions: qs },
          assignment: l.a || null,
          code: l.code || null,
        };
      }),
    }));
    const all = base.chapters.flatMap((c) => c.lessons);
    base.durationMin = all.reduce((s, l) => s + l.durationMin, 0);
    base.defaultOrder = all.map((l) => l.id);
    base.entryTest = bank
      ? {
          id: `${base.id}-entry`,
          title: 'Bài kiểm tra đầu vào',
          isEntryTest: true,
          questions: base.concepts.map((c) => bank[c.id] && bank[c.id][0]).filter(Boolean),
        }
      : null;
    delete base.lessonPrefix;
    return base;
  }

  const READING_JSX =
    'JSX là cú pháp mở rộng cho JavaScript, cho phép bạn viết giao diện gần giống HTML ngay trong mã JavaScript. Khi build, mỗi thẻ JSX được chuyển thành một lời gọi hàm tạo phần tử React.\n\nĐiểm khác biệt quan trọng: thuộc tính dùng camelCase (className, onClick), biểu thức JavaScript đặt trong dấu ngoặc nhọn {}, và mỗi component chỉ trả về một phần tử gốc.\n\nVí dụ: const greeting = <h1 className="title">Xin chào, {name}!</h1>;\n\nHãy thử thay đổi biến name và quan sát kết quả hiển thị thay đổi theo.';
  const READING_LIST =
    'Khi hiển thị một mảng dữ liệu, ta dùng map() để biến mỗi phần tử thành một phần tử JSX. React cần thuộc tính key ổn định và duy nhất cho mỗi phần tử để biết phần tử nào thay đổi giữa các lần render.\n\nKhông nên dùng chỉ số mảng làm key nếu danh sách có thể sắp xếp lại hoặc xoá phần tử, vì điều đó khiến state của các phần tử bị lẫn.\n\nQuy tắc ngắn gọn: dùng id từ dữ liệu, giữ key ổn định giữa các lần render.';
  const READING_PROJECT =
    'Trong dự án cuối khoá, bạn sẽ xây dựng ứng dụng quản lý công việc gồm: danh sách công việc lấy từ API, thêm/sửa/xoá công việc, lọc theo trạng thái và hai trang (Danh sách, Chi tiết) dùng React Router.\n\nYêu cầu kỹ thuật: dùng useState cho dữ liệu form, useEffect để tải dữ liệu, tách ít nhất 4 component, và xử lý trạng thái đang tải/lỗi khi gọi API.\n\nNộp bài: đường dẫn GitHub và (không bắt buộc) đường dẫn bản demo.';
  const READING_GENERIC =
    'Bài đọc này tóm tắt các ý chính của chủ đề, kèm ví dụ ngắn và lưu ý thường gặp. Đọc kỹ từng phần, chạy lại ví dụ trên máy của bạn, rồi làm quiz cuối bài để kiểm tra mức độ hiểu.';

  // ---------- React question bank ----------
  const reactBank = {
    'c-jsx': [
      q('rq-jsx-0', 'c-jsx', 'Trong JSX, thuộc tính class của HTML được viết thế nào?', ['class', 'className', 'cssClass', 'classList'], 1, 'JSX dùng className vì class là từ khoá của JavaScript.'),
      q('rq-jsx-1', 'c-jsx', 'Cách nhúng biến name vào JSX?', ['{{name}}', '${name}', '{name}', '(name)'], 2, 'Biểu thức JavaScript trong JSX đặt trong một cặp ngoặc nhọn.'),
      q('rq-jsx-2', 'c-jsx', 'Một component có thể trả về hai thẻ anh em không bọc ngoài không?', ['Có, luôn được', 'Không, cần một phần tử gốc hoặc Fragment', 'Chỉ trong class component', 'Chỉ khi dùng TypeScript'], 1, 'Cần bọc trong một phần tử gốc hoặc <>...</>.'),
    ],
    'c-component': [
      q('rq-comp-0', 'c-component', 'Tên component React nên bắt đầu bằng?', ['Chữ thường', 'Chữ hoa', 'Dấu gạch dưới', 'Ký tự $'], 1, 'React coi thẻ chữ thường là thẻ HTML, chữ hoa là component.'),
      q('rq-comp-1', 'c-component', 'Function component trả về gì?', ['Một chuỗi HTML', 'JSX (phần tử React)', 'Một đối tượng DOM', 'Một Promise'], 1, 'Function component trả về phần tử React, thường viết bằng JSX.'),
      q('rq-comp-2', 'c-component', 'Lợi ích chính của việc tách component?', ['Chạy nhanh hơn trên server', 'Tái sử dụng và dễ bảo trì', 'Không cần CSS', 'Tự động tối ưu SEO'], 1, 'Component nhỏ, độc lập giúp tái sử dụng và kiểm thử dễ hơn.'),
    ],
    'c-props': [
      q('rq-props-0', 'c-props', 'Props trong React là gì?', ['Dữ liệu nội bộ có thể thay đổi', 'Dữ liệu truyền từ component cha xuống con', 'Biến toàn cục', 'Thuộc tính CSS'], 1, 'Props là dữ liệu đầu vào, truyền từ cha xuống con.'),
      q('rq-props-1', 'c-props', 'Component con có nên sửa trực tiếp props không?', ['Có', 'Không, props là chỉ đọc', 'Chỉ với mảng', 'Chỉ trong useEffect'], 1, 'Props là chỉ đọc; muốn đổi dữ liệu hãy gọi hàm do cha truyền xuống.'),
      q('rq-props-2', 'c-props', 'Giá trị nằm giữa thẻ mở và thẻ đóng của component được nhận qua prop nào?', ['content', 'inner', 'children', 'body'], 2, 'Nội dung lồng bên trong được truyền qua props.children.'),
    ],
    'c-state': [
      q('rq-state-0', 'c-state', 'useState trả về gì?', ['Một giá trị', 'Một mảng [giá trị, hàm cập nhật]', 'Một đối tượng', 'Một Promise'], 1, 'useState trả về cặp [state, setState].'),
      q('rq-state-1', 'c-state', 'Vì sao không nên gán trực tiếp count = count + 1?', ['Sai cú pháp', 'React không biết để render lại', 'Làm chậm trình duyệt', 'Không có lý do'], 1, 'Chỉ khi gọi hàm set React mới lên lịch render lại.'),
      q('rq-state-2', 'c-state', 'Khi state mới phụ thuộc state cũ, nên viết?', ['setCount(count + 1)', 'setCount(c => c + 1)', 'count++', 'setCount(++count)'], 1, 'Dạng hàm cập nhật đảm bảo dùng giá trị mới nhất.'),
    ],
    'c-event': [
      q('rq-event-0', 'c-event', 'Gắn sự kiện click trong JSX viết thế nào?', ['onclick="handle()"', 'onClick={handle}', 'click={handle}', 'on-click={handle}'], 1, 'Sự kiện dùng camelCase và truyền hàm, không truyền chuỗi.'),
      q('rq-event-1', 'c-event', 'Ngăn form tải lại trang khi submit?', ['return false', 'e.preventDefault()', 'e.stop()', 'Không cần làm gì'], 1, 'Gọi e.preventDefault() trong hàm xử lý submit.'),
      q('rq-event-2', 'c-event', 'Input có value và onChange do state điều khiển gọi là?', ['Uncontrolled input', 'Controlled input', 'Ref input', 'Static input'], 1, 'Controlled input: giá trị luôn đến từ state.'),
    ],
    'c-list': [
      q('rq-list-0', 'c-list', 'Phương thức thường dùng để render danh sách?', ['forEach', 'map', 'reduce', 'filter'], 1, 'map trả về mảng phần tử JSX mới.'),
      q('rq-list-1', 'c-list', 'Thuộc tính key dùng để làm gì?', ['Tạo CSS', 'Giúp React nhận diện phần tử giữa các lần render', 'Bảo mật', 'Sắp xếp danh sách'], 1, 'key giúp React so khớp phần tử khi danh sách thay đổi.'),
      q('rq-list-2', 'c-list', 'Key nào phù hợp nhất?', ['Math.random()', 'Chỉ số mảng khi danh sách có thể sắp xếp', 'id ổn định từ dữ liệu', 'Thời gian hiện tại'], 2, 'id ổn định, duy nhất là lựa chọn an toàn.'),
    ],
    'c-effect': [
      q('rq-effect-0', 'c-effect', 'useEffect với mảng phụ thuộc rỗng [] chạy khi nào?', ['Mỗi lần render', 'Một lần sau lần render đầu', 'Không bao giờ', 'Trước khi render'], 1, 'Mảng rỗng: chạy một lần sau khi component được gắn.'),
      q('rq-effect-1', 'c-effect', 'Hàm trả về từ useEffect dùng để?', ['Trả dữ liệu cho component', 'Dọn dẹp (cleanup)', 'Bắt lỗi', 'Render lại'], 1, 'Hàm cleanup chạy trước lần effect tiếp theo và khi gỡ component.'),
      q('rq-effect-2', 'c-effect', 'Thiếu biến trong mảng phụ thuộc có thể gây ra?', ['Lỗi cú pháp', 'Dùng giá trị cũ (stale)', 'Tăng tốc độ', 'Không ảnh hưởng'], 1, 'Effect có thể đọc giá trị cũ nếu thiếu phụ thuộc.'),
    ],
    'c-fetch': [
      q('rq-fetch-0', 'c-fetch', 'fetch() trả về gì?', ['Dữ liệu JSON', 'Một Promise', 'Một chuỗi', 'Một mảng'], 1, 'fetch trả về Promise của Response.'),
      q('rq-fetch-1', 'c-fetch', 'Nên gọi API khi component vừa hiển thị ở đâu?', ['Trong thân hàm component', 'Trong useEffect', 'Trong CSS', 'Trong key'], 1, 'Gọi API là side effect, đặt trong useEffect.'),
      q('rq-fetch-2', 'c-fetch', 'Khi đang chờ API, giao diện nên?', ['Không hiển thị gì', 'Hiển thị trạng thái đang tải', 'Báo lỗi', 'Tải lại trang'], 1, 'Luôn hiển thị trạng thái đang tải và xử lý lỗi.'),
    ],
    'c-router': [
      q('rq-router-0', 'c-router', 'React Router dùng để?', ['Gọi API', 'Điều hướng giữa các trang trong SPA', 'Quản lý state toàn cục', 'Viết test'], 1, 'Router ánh xạ URL tới component.'),
      q('rq-router-1', 'c-router', 'Thành phần dùng để tạo liên kết không tải lại trang?', ['<a>', '<Link>', '<Route>', '<Nav>'], 1, '<Link> điều hướng phía client.'),
      q('rq-router-2', 'c-router', 'Đọc tham số :id từ URL dùng hook nào?', ['useState', 'useParams', 'useEffect', 'useId'], 1, 'useParams trả về các tham số động của route.'),
    ],
    'c-context': [
      q('rq-ctx-0', 'c-context', 'Context giải quyết vấn đề gì?', ['Tăng tốc render', 'Truyền props qua nhiều tầng (prop drilling)', 'Gọi API', 'Định tuyến'], 1, 'Context chia sẻ dữ liệu mà không truyền qua từng tầng.'),
      q('rq-ctx-1', 'c-context', 'Đọc giá trị context trong function component?', ['useContext', 'useReducer', 'useMemo', 'useRef'], 0, 'useContext(MyContext) trả về giá trị hiện tại.'),
      q('rq-ctx-2', 'c-context', 'Giá trị context được cung cấp bởi?', ['Consumer', 'Provider', 'Router', 'Store'], 1, '<MyContext.Provider value={...}> cung cấp giá trị.'),
    ],
  };

  // ---------- JS question bank ----------
  const jsBank = {
    'j-var': [
      q('jq-var-0', 'j-var', 'Khai báo nào không thể gán lại?', ['var', 'let', 'const', 'Tất cả'], 2, 'const không cho gán lại tham chiếu.'),
      q('jq-var-1', 'j-var', 'Phạm vi của let là?', ['Toàn cục', 'Hàm', 'Khối {}', 'Tệp'], 2, 'let có phạm vi khối.'),
      q('jq-var-2', 'j-var', 'typeof null trả về?', ['"null"', '"object"', '"undefined"', '"number"'], 1, 'Đây là một đặc điểm lịch sử của JavaScript.'),
    ],
    'j-func': [
      q('jq-func-0', 'j-func', 'Arrow function khác function thường ở điểm nào?', ['Không có this riêng', 'Chạy nhanh hơn', 'Không nhận tham số', 'Không trả về giá trị'], 0, 'Arrow function dùng this của phạm vi bao ngoài.'),
      q('jq-func-1', 'j-func', 'Giá trị trả về mặc định của hàm không có return?', ['null', '0', 'undefined', '""'], 2, 'Hàm không return trả về undefined.'),
      q('jq-func-2', 'j-func', 'Closure là gì?', ['Một vòng lặp', 'Hàm ghi nhớ biến của phạm vi tạo ra nó', 'Một kiểu dữ liệu', 'Một lỗi'], 1, 'Closure giữ tham chiếu tới biến bên ngoài.'),
    ],
    'j-array': [
      q('jq-arr-0', 'j-array', 'Phương thức tạo mảng mới chỉ gồm phần tử thoả điều kiện?', ['map', 'filter', 'find', 'push'], 1, 'filter trả về mảng mới.'),
      q('jq-arr-1', 'j-array', '[1,2,3].map(x => x * 2) cho kết quả?', ['[1,2,3]', '[2,4,6]', '6', '[3,2,1]'], 1, 'map áp dụng hàm cho từng phần tử.'),
      q('jq-arr-2', 'j-array', 'reduce thường dùng để?', ['Sắp xếp', 'Gộp mảng thành một giá trị', 'Xoá phần tử', 'Tìm chỉ số'], 1, 'reduce tích luỹ thành một giá trị.'),
    ],
    'j-object': [
      q('jq-obj-0', 'j-object', 'Truy cập thuộc tính có tên động?', ['obj.key', 'obj[key]', 'obj->key', 'obj::key'], 1, 'Dùng ngoặc vuông với biến.'),
      q('jq-obj-1', 'j-object', 'Toán tử spread {...a} dùng để?', ['So sánh', 'Sao chép nông đối tượng', 'Xoá thuộc tính', 'Đóng băng đối tượng'], 1, 'Spread tạo bản sao nông.'),
      q('jq-obj-2', 'j-object', 'const {name} = user gọi là?', ['Destructuring', 'Hoisting', 'Currying', 'Binding'], 0, 'Destructuring tách thuộc tính ra biến.'),
    ],
    'j-dom': [
      q('jq-dom-0', 'j-dom', 'Chọn phần tử đầu tiên khớp selector?', ['getElementsByClassName', 'querySelector', 'querySelectorAll', 'getElement'], 1, 'querySelector trả về phần tử đầu tiên.'),
      q('jq-dom-1', 'j-dom', 'Gắn sự kiện click cho nút?', ['btn.click = fn', 'btn.addEventListener("click", fn)', 'btn.on("click")', 'btn.event(fn)'], 1, 'addEventListener là cách chuẩn.'),
      q('jq-dom-2', 'j-dom', 'Event delegation là?', ['Gắn sự kiện lên phần tử cha để xử lý cho con', 'Xoá sự kiện', 'Sự kiện bất đồng bộ', 'Một thư viện'], 0, 'Tận dụng cơ chế nổi bọt sự kiện.'),
    ],
    'j-async': [
      q('jq-async-0', 'j-async', 'await chỉ dùng được trong?', ['Mọi hàm', 'Hàm async (hoặc module cấp cao nhất)', 'Vòng lặp for', 'Câu lệnh if'], 1, 'await cần ngữ cảnh async.'),
      q('jq-async-1', 'j-async', 'Promise ở trạng thái nào sau khi lỗi?', ['fulfilled', 'rejected', 'pending', 'settled-ok'], 1, 'Lỗi chuyển Promise sang rejected.'),
      q('jq-async-2', 'j-async', 'Bắt lỗi khi dùng await?', ['if/else', 'try/catch', 'switch', 'Không bắt được'], 1, 'Bọc trong try/catch.'),
    ],
  };

  const L = (t, type, m, c, extra) => Object.assign({ t, type, m, c }, extra || {});

  // ---------- coding practice payloads (proposed feature, see PRODUCT.md §13) ----------
  // tests[]: {id, name, call (JS expression evaluated after the learner's code), expected (JSON value), hidden, step}
  const lines = (...rows) => rows.join('\n');
  // React: the reducer used with useReducer is a pure function, so it runs for real without the React library.
  const CODE_CHALLENGE_REACT = {
    kind: 'challenge', language: 'javascript', fileName: 'todoReducer.js',
    instructions: [
      'Với action `{ type: "add", text }`, trả về mảng **mới** có thêm `{ id, text, done: false }` ở cuối. `id` bằng id lớn nhất hiện có cộng 1 (mảng rỗng thì bắt đầu từ 1).',
      'Với action `{ type: "toggle", id }`, đảo giá trị `done` của công việc có `id` đó. Không sửa trực tiếp mảng hay đối tượng cũ.',
      'Với action `{ type: "remove", id }`, bỏ công việc có `id` đó. Action không biết trước thì trả về đúng `state` cũ.',
    ],
    starter: lines(
      '// Reducer dùng với useReducer trong component TaskList:',
      '// const [tasks, dispatch] = useReducer(todoReducer, []);',
      'function todoReducer(state, action) {',
      '  switch (action.type) {',
      "    case 'add':",
      '      // Bước 1: thêm công việc mới',
      '      return state;',
      "    // Bước 2: case 'toggle'",
      "    // Bước 3: case 'remove'",
      '    default:',
      '      return state;',
      '  }',
      '}',
      '',
      "console.log(todoReducer([], { type: 'add', text: 'Học JSX' }));"),
    solution: lines(
      'function todoReducer(state, action) {',
      '  switch (action.type) {',
      "    case 'add': {",
      '      const id = state.reduce((max, t) => Math.max(max, t.id), 0) + 1;',
      '      return [...state, { id, text: action.text, done: false }];',
      '    }',
      "    case 'toggle':",
      '      return state.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));',
      "    case 'remove':",
      '      return state.filter((t) => t.id !== action.id);',
      '    default:',
      '      return state;',
      '  }',
      '}'),
    tests: [
      { id: 'rt-1', step: 0, name: 'add vào mảng rỗng', call: "todoReducer([], { type: 'add', text: 'Học JSX' })", expected: [{ id: 1, text: 'Học JSX', done: false }] },
      { id: 'rt-2', step: 0, name: 'add tính id tiếp theo', call: "todoReducer([{ id: 3, text: 'A', done: true }], { type: 'add', text: 'B' })", expected: [{ id: 3, text: 'A', done: true }, { id: 4, text: 'B', done: false }] },
      { id: 'rt-3', step: 1, name: 'toggle đảo trạng thái', call: "todoReducer([{ id: 1, text: 'A', done: false }], { type: 'toggle', id: 1 })", expected: [{ id: 1, text: 'A', done: true }] },
      { id: 'rt-4', step: 1, name: 'toggle không sửa state cũ', call: "(() => { const s = [{ id: 1, text: 'A', done: false }]; todoReducer(s, { type: 'toggle', id: 1 }); return s[0].done; })()", expected: false, hidden: true },
      { id: 'rt-5', step: 2, name: 'remove bỏ đúng công việc', call: "todoReducer([{ id: 1, text: 'A', done: false }, { id: 2, text: 'B', done: false }], { type: 'remove', id: 1 })", expected: [{ id: 2, text: 'B', done: false }] },
      { id: 'rt-6', step: 2, name: 'action lạ trả về state cũ', call: "(() => { const s = []; return todoReducer(s, { type: 'reset' }) === s; })()", expected: true, hidden: true },
    ],
    hints: [
      'Dùng cú pháp spread `[...state, công việc mới]` để tạo mảng mới thay vì `push`.',
      '`state.map` trả về mảng mới; với phần tử cần đổi, tạo đối tượng mới bằng `{ ...t, done: !t.done }`.',
      '`state.filter((t) => t.id !== action.id)` bỏ đúng một công việc. Nhánh `default` phải `return state` để React biết không có gì thay đổi.',
    ],
    solutionCheck: { ok: true, passed: 6, total: 6, at: '2026-08-15T09:00:00Z' },
  };

  // ---------- courses ----------
  const react = buildCourse(
    {
      id: 'course-react-001', slug: 'react-du-an-thuc-te', lessonPrefix: 'lesson-react',
      title: 'React từ cơ bản đến dự án thực tế',
      summary: 'Xây dựng giao diện web hiện đại với React: component, state, hooks, gọi API và định tuyến — kết thúc bằng một dự án hoàn chỉnh.',
      categoryId: 'cat-frontend', level: 'Intermediate', lecturerId: 'usr-lecturer-001',
      price: 1290000, proposedPrice: 1290000, status: 'published', submittedAt: '2026-08-20T09:00:00Z',
      rating: 4.7, ratingCount: 128, ratingBreakdown: [92, 24, 8, 3, 1], learnersCount: 1340, hue: 190,
      outcomes: ['Hiểu cách React render giao diện từ state', 'Tách giao diện thành component tái sử dụng', 'Quản lý state và xử lý form với hooks', 'Gọi API, xử lý trạng thái tải và lỗi', 'Xây dựng ứng dụng nhiều trang với React Router', 'Hoàn thành một dự án quản lý công việc'],
      requirements: ['Nắm vững JavaScript cơ bản (biến, hàm, mảng, đối tượng)', 'Biết HTML/CSS cơ bản', 'Máy tính cài Node.js 18 trở lên'],
      concepts: [
        { id: 'c-jsx', name: 'JSX' }, { id: 'c-component', name: 'Component' }, { id: 'c-props', name: 'Props' },
        { id: 'c-state', name: 'State (useState)' }, { id: 'c-event', name: 'Sự kiện & Form' }, { id: 'c-list', name: 'Danh sách & key' },
        { id: 'c-effect', name: 'useEffect' }, { id: 'c-fetch', name: 'Gọi API' }, { id: 'c-router', name: 'React Router' }, { id: 'c-context', name: 'Context API' },
      ],
      prerequisites: [
        { from: 'c-jsx', to: 'c-component' }, { from: 'c-component', to: 'c-props' }, { from: 'c-props', to: 'c-state' },
        { from: 'c-state', to: 'c-event' }, { from: 'c-state', to: 'c-list' }, { from: 'c-state', to: 'c-effect' },
        { from: 'c-effect', to: 'c-fetch' }, { from: 'c-component', to: 'c-router' }, { from: 'c-props', to: 'c-context' },
      ],
    },
    [
      { title: 'Nền tảng React', lessons: [
        L('Giới thiệu React và cài đặt môi trường', 'video', 12, ['c-jsx'], { quiz: false }),
        L('JSX hoạt động thế nào', 'reading', 15, ['c-jsx'], { reading: READING_JSX }),
        L('Component đầu tiên của bạn', 'video', 18, ['c-component']),
      ] },
      { title: 'Props, State và sự kiện', lessons: [
        L('Truyền dữ liệu bằng Props', 'video', 20, ['c-props']),
        L('State với useState', 'video', 22, ['c-state'], { a: { instructions: 'Xây dựng component Bộ đếm (Counter) có nút tăng, giảm và đặt lại. Giá trị không được nhỏ hơn 0. Nộp đường dẫn CodeSandbox hoặc GitHub, kèm ghi chú ngắn về cách bạn xử lý giới hạn 0.', requiresFile: false, requiresLink: true } }),
        L('Xử lý sự kiện và form', 'pdf', 16, ['c-event']),
        L('Thử thách: Reducer quản lý danh sách công việc', 'code', 25, ['c-state'], { id: 'lesson-react-p01', quiz: false, code: CODE_CHALLENGE_REACT }),
      ] },
      { title: 'Danh sách và hiệu ứng', lessons: [
        L('Render danh sách và key', 'reading', 14, ['c-list'], { reading: READING_LIST }),
        L('useEffect và vòng đời component', 'video', 24, ['c-effect']),
        L('Gọi API với fetch', 'video', 26, ['c-fetch'], { a: { instructions: 'Tạo trang danh sách người dùng lấy dữ liệu từ https://jsonplaceholder.typicode.com/users. Hiển thị trạng thái đang tải, thông báo lỗi khi API hỏng và nút "Thử lại". Nộp tệp .zip mã nguồn hoặc đường dẫn GitHub.', requiresFile: true, requiresLink: false } }),
      ] },
      { title: 'Ứng dụng nhiều trang', lessons: [
        L('React Router cơ bản', 'video', 20, ['c-router']),
        L('Context API chia sẻ state', 'pdf', 18, ['c-context']),
        L('Dự án: Ứng dụng quản lý công việc', 'reading', 40, ['c-state', 'c-fetch', 'c-router'], { quiz: false, reading: READING_PROJECT, a: { instructions: 'Hoàn thành ứng dụng quản lý công việc theo yêu cầu trong bài đọc. Nộp đường dẫn GitHub (bắt buộc) và tệp ảnh chụp màn hình (không bắt buộc).', requiresFile: false, requiresLink: true } }),
      ] },
    ],
    reactBank
  );
  react.aiPath = [
    { lessonId: 'lesson-react-001', skippable: true, reason: 'Bạn trả lời đúng câu JSX ở bài đầu vào — có thể lướt nhanh phần cài đặt.' },
    { lessonId: 'lesson-react-002', skippable: true, reason: 'JSX đã ở mức Thành thạo; giữ lại để ôn nếu cần.' },
    { lessonId: 'lesson-react-003', skippable: false, reason: 'Component là nền tảng cho mọi bài sau và bạn trả lời sai câu này ở bài đầu vào.' },
    { lessonId: 'lesson-react-004', skippable: false, reason: 'Props là điều kiện bắt buộc trước State và Context.' },
    { lessonId: 'lesson-react-005', skippable: false, reason: 'Mục tiêu "Làm được dự án" cần nắm chắc State — bạn chọn "Tôi chưa biết" ở câu này.' },
    { lessonId: 'lesson-react-006', skippable: false, reason: 'Form xuất hiện trong dự án cuối khoá, nên học ngay sau State.' },
    { lessonId: 'lesson-react-p01', skippable: false, reason: 'Luyện State bằng code chạy thật trước khi làm dự án; danh sách công việc là phần lõi của dự án cuối khoá.' },
    { lessonId: 'lesson-react-007', skippable: false, reason: 'Ngắn và cần cho việc hiển thị danh sách công việc trong dự án.' },
    { lessonId: 'lesson-react-008', skippable: false, reason: 'useEffect là điều kiện trước bài Gọi API.' },
    { lessonId: 'lesson-react-009', skippable: false, reason: 'Phần trọng tâm của dự án; dành nhiều thời gian hơn cho bài này.' },
    { lessonId: 'lesson-react-010', skippable: false, reason: 'Dự án có hai trang nên cần Router trước khi bắt đầu.' },
    { lessonId: 'lesson-react-011', skippable: true, reason: 'Dự án không bắt buộc dùng Context — có thể bỏ qua nếu bạn bị giới hạn thời gian.' },
    { lessonId: 'lesson-react-012', skippable: false, reason: 'Bài tổng hợp, đáp ứng trực tiếp mục tiêu "Làm được dự án".' },
  ];
  // Changes the AI applies after the learner completes a lesson (shown in the path-updated notice).
  react.pathUpdates = [
    { afterLessonId: 'lesson-react-003', changes: [
      { type: 'now-skippable', lessonId: 'lesson-react-004', text: 'Props giờ có thể bỏ qua vì quiz Component của bạn đạt điểm tối đa.' },
      { type: 'unlocked', lessonId: 'lesson-react-010', text: 'React Router đã được mở khoá (đã đủ điều kiện Component).' },
    ] },
    { afterLessonId: 'lesson-react-005', changes: [
      { type: 'moved-up', lessonId: 'lesson-react-007', text: 'Danh sách & key được đưa lên trước Xử lý sự kiện vì bài tập State của bạn cần hiển thị danh sách.' },
      { type: 'unlocked', lessonId: 'lesson-react-008', text: 'useEffect đã được mở khoá.' },
    ] },
    { afterLessonId: '*', changes: [
      { type: 'moved-up', lessonId: null, text: 'Bài tiếp theo được giữ nguyên thứ tự; mức độ thành thạo của bạn đã được cập nhật.' },
    ] },
  ];

  // ---------- coding practice: JavaScript course ----------
  const CODE_TUTORIAL_JS = {
    kind: 'tutorial', language: 'javascript', fileName: 'main.js',
    steps: [
      { title: 'Chào mừng', body: 'Trong bài này bạn viết và chạy JavaScript ngay trên trình duyệt, không cần cài đặt gì.\n\nBên phải là **trình soạn code** (tệp `main.js`) và **Console** hiện kết quả. Bấm **Chạy** để chạy dòng lệnh có sẵn.',
        starter: lines('// Bấm "Chạy" để chạy dòng lệnh bên dưới', 'console.log("Xin chào Codi!");') },
      { title: 'Không gian làm việc', body: 'Mỗi lần bấm **Chạy**, Codi chạy toàn bộ tệp từ trên xuống và in mọi `console.log` vào Console.\n\n- **Ctrl + Enter** (hoặc ⌘ + Enter) cũng chạy code\n- **Tab** thụt lề 2 dấu cách; nhấn **Esc** rồi **Tab** để rời trình soạn\n- Code của từng bước được **lưu nháp tự động**\n\nThử đổi tên trong biến `ten` rồi chạy lại.',
        starter: lines('const ten = "Minh Anh";', 'console.log("Chào " + ten + "!");') },
      { title: 'Hàm xử lý mảng', body: 'Ba hàm bạn sẽ dùng nhiều nhất với mảng:\n\n- `map` tạo mảng mới bằng cách biến đổi từng phần tử\n- `filter` giữ lại phần tử thoả điều kiện\n- `reduce` gộp cả mảng thành một giá trị\n\nChạy thử, rồi đổi điều kiện trong `filter` thành `d >= 8`.',
        starter: lines('const diem = [7, 9, 4, 10, 6];', '', '// map: nhân mỗi điểm với 10', 'console.log(diem.map((d) => d * 10));', '', '// filter: giữ lại điểm từ 5 trở lên', 'console.log(diem.filter((d) => d >= 5));', '', '// reduce: cộng tất cả điểm', 'console.log(diem.reduce((tong, d) => tong + d, 0));') },
      { title: 'Đọc thông báo lỗi', body: 'Lỗi là chuyện bình thường. Chạy đoạn code bên cạnh và đọc Console:\n\n- Dòng 2 in `undefined` vì gõ sai `length` thành `lenght` — JavaScript không báo lỗi, chỉ trả về `undefined`\n- Dòng 3 báo **ReferenceError** vì hàm `tinhTong` chưa được khai báo\n\nSửa cả hai chỗ rồi chạy lại.',
        starter: lines('const diem = [7, 9, 4];', 'console.log(diem.lenght);', 'console.log(tinhTong(diem));') },
      { title: 'Sửa code của mình!', body: 'Hàm `diemTrungBinh` đang trả về `NaN`. Tìm và sửa lỗi để hàm trả về đúng điểm trung bình.\n\nGợi ý: chỉ số cuối cùng của mảng là `length - 1`.',
        starter: lines('function diemTrungBinh(diem) {', '  let tong = 0;', '  for (let i = 0; i <= diem.length; i++) {', '    tong += diem[i];', '  }', '  return tong / diem.length;', '}', '', 'console.log(diemTrungBinh([8, 6, 10]));'),
        tests: [
          { id: 't-avg-1', name: 'diemTrungBinh([8, 6, 10]) trả về 8', call: 'diemTrungBinh([8, 6, 10])', expected: 8 },
          { id: 't-avg-2', name: 'diemTrungBinh([5]) trả về 5', call: 'diemTrungBinh([5])', expected: 5 },
        ] },
      { title: 'Thử thách', body: 'Viết hàm `xepLoai(diem)` trả về:\n\n- `"Giỏi"` nếu điểm từ 8 trở lên\n- `"Khá"` nếu từ 6.5\n- `"Trung bình"` nếu từ 5\n- `"Yếu"` với điểm còn lại\n\nBấm **Chạy** để xem các test.',
        starter: lines('function xepLoai(diem) {', '  // Viết code của bạn ở đây', '}', '', 'console.log(xepLoai(9));'),
        tests: [
          { id: 't-rank-1', name: 'xepLoai(9) trả về "Giỏi"', call: 'xepLoai(9)', expected: 'Giỏi' },
          { id: 't-rank-2', name: 'xepLoai(6.5) trả về "Khá"', call: 'xepLoai(6.5)', expected: 'Khá' },
          { id: 't-rank-3', name: 'xepLoai(5) trả về "Trung bình"', call: 'xepLoai(5)', expected: 'Trung bình' },
          { id: 't-rank-4', name: 'xepLoai(3) trả về "Yếu"', call: 'xepLoai(3)', expected: 'Yếu' },
        ] },
      { title: 'Lời giải (đừng xem trước!)', isSolution: true, body: 'Đây là một cách làm cho hai bước trước. Code của bạn khác vẫn đúng nếu các test đều đạt.',
        starter: lines('function diemTrungBinh(diem) {', '  let tong = 0;', '  for (let i = 0; i < diem.length; i++) {', '    tong += diem[i];', '  }', '  return tong / diem.length;', '}', '', 'function xepLoai(diem) {', '  if (diem >= 8) return "Giỏi";', '  if (diem >= 6.5) return "Khá";', '  if (diem >= 5) return "Trung bình";', '  return "Yếu";', '}', '', 'console.log(diemTrungBinh([8, 6, 10]), xepLoai(9));') },
    ],
  };
  const CODE_CHALLENGE_JS = {
    kind: 'challenge', language: 'javascript', fileName: 'don-hang.js',
    instructions: [
      'Viết hàm `tongTien(orders)` trả về tổng `price` của mọi đơn hàng. Mảng rỗng trả về `0`.',
      'Viết hàm `donLonNhat(orders)` trả về đơn hàng có `price` lớn nhất, hoặc `null` nếu mảng rỗng.',
      'Viết hàm `demTheoTrangThai(orders)` trả về đối tượng đếm số đơn theo `status`, ví dụ `{ paid: 2, pending: 1 }`.',
    ],
    starter: lines(
      '// Đơn hàng mẫu để bạn thử với console.log',
      'const orders = [',
      "  { id: 'DH01', price: 590000, status: 'paid' },",
      "  { id: 'DH02', price: 1290000, status: 'pending' },",
      "  { id: 'DH03', price: 350000, status: 'paid' },",
      '];',
      '',
      '// Bước 1: tổng tiền các đơn',
      'function tongTien(orders) {',
      '  // Viết code của bạn ở đây',
      '}',
      '',
      '// Bước 2: đơn có giá lớn nhất',
      '',
      '// Bước 3: đếm số đơn theo trạng thái',
      '',
      'console.log(tongTien(orders));'),
    solution: lines(
      'function tongTien(orders) {',
      '  return orders.reduce((tong, o) => tong + o.price, 0);',
      '}',
      '',
      'function donLonNhat(orders) {',
      '  if (!orders.length) return null;',
      '  return orders.reduce((max, o) => (o.price > max.price ? o : max));',
      '}',
      '',
      'function demTheoTrangThai(orders) {',
      '  return orders.reduce((dem, o) => {',
      '    dem[o.status] = (dem[o.status] || 0) + 1;',
      '    return dem;',
      '  }, {});',
      '}'),
    tests: [
      { id: 'ct-1', step: 0, name: 'tongTien với 2 đơn', call: 'tongTien([{ price: 100 }, { price: 250 }])', expected: 350 },
      { id: 'ct-2', step: 0, name: 'tongTien với mảng rỗng', call: 'tongTien([])', expected: 0 },
      { id: 'ct-3', step: 0, name: 'tongTien với giá 0', call: 'tongTien([{ price: 590000 }, { price: 1290000 }, { price: 0 }])', expected: 1880000, hidden: true },
      { id: 'ct-4', step: 1, name: 'donLonNhat chọn đơn giá cao nhất', call: "donLonNhat([{ id: 'A', price: 5 }, { id: 'B', price: 9 }])", expected: { id: 'B', price: 9 } },
      { id: 'ct-5', step: 1, name: 'donLonNhat với mảng rỗng', call: 'donLonNhat([])', expected: null },
      { id: 'ct-6', step: 1, name: 'donLonNhat với một đơn', call: "donLonNhat([{ id: 'X', price: 1 }])", expected: { id: 'X', price: 1 }, hidden: true },
      { id: 'ct-7', step: 2, name: 'demTheoTrangThai đếm đúng', call: "demTheoTrangThai([{ status: 'paid' }, { status: 'pending' }, { status: 'paid' }])", expected: { paid: 2, pending: 1 } },
      { id: 'ct-8', step: 2, name: 'demTheoTrangThai với mảng rỗng', call: 'demTheoTrangThai([])', expected: {}, hidden: true },
    ],
    hints: [
      '`reduce` nhận một hàm `(tong, o) => …` và giá trị khởi đầu. Với tổng tiền, giá trị khởi đầu là `0`.',
      'Với `donLonNhat`, kiểm tra mảng rỗng trước, rồi dùng `reduce` giữ lại đơn có `price` lớn hơn.',
      'Với `demTheoTrangThai`, khởi đầu `reduce` bằng `{}` và tăng `dem[o.status]` thêm 1 cho mỗi đơn.',
    ],
    solutionCheck: { ok: true, passed: 8, total: 8, at: '2026-06-01T09:00:00Z' },
  };

  const js = buildCourse(
    {
      id: 'course-js-001', slug: 'javascript-nen-tang', lessonPrefix: 'lesson-js',
      title: 'JavaScript nền tảng',
      summary: 'Nắm chắc JavaScript hiện đại: biến, hàm, mảng, đối tượng, DOM và lập trình bất đồng bộ — nền móng cho mọi framework.',
      categoryId: 'cat-frontend', level: 'Beginner', lecturerId: 'usr-lecturer-001',
      price: 590000, proposedPrice: 590000, status: 'published', submittedAt: '2026-06-02T09:00:00Z',
      rating: 4.8, ratingCount: 312, ratingBreakdown: [251, 44, 12, 4, 1], learnersCount: 2875, hue: 48,
      outcomes: ['Viết JavaScript hiện đại (ES6+)', 'Xử lý dữ liệu với mảng và đối tượng', 'Thao tác DOM và sự kiện', 'Làm việc với Promise và async/await'],
      requirements: ['Không cần kinh nghiệm lập trình trước', 'Biết HTML cơ bản là một lợi thế'],
      concepts: [
        { id: 'j-var', name: 'Biến & kiểu dữ liệu' }, { id: 'j-func', name: 'Hàm' }, { id: 'j-array', name: 'Mảng' },
        { id: 'j-object', name: 'Đối tượng' }, { id: 'j-dom', name: 'DOM & sự kiện' }, { id: 'j-async', name: 'Bất đồng bộ' },
        { id: 'j-closure', name: 'Closure' }, { id: 'j-error', name: 'Xử lý lỗi' }, { id: 'j-module', name: 'Module & ES6' },
        { id: 'j-spread', name: 'Spread & Destructuring' }, { id: 'j-template', name: 'Template Literal' }, { id: 'j-regex', name: 'Regular Expression' },
      ],
      prerequisites: [
        { from: 'j-var', to: 'j-func' }, { from: 'j-func', to: 'j-closure' }, { from: 'j-func', to: 'j-array' },
        { from: 'j-func', to: 'j-object' }, { from: 'j-array', to: 'j-spread' }, { from: 'j-object', to: 'j-spread' },
        { from: 'j-object', to: 'j-dom' }, { from: 'j-func', to: 'j-async' }, { from: 'j-async', to: 'j-error' },
        { from: 'j-var', to: 'j-template' }, { from: 'j-var', to: 'j-regex' }, { from: 'j-func', to: 'j-module' },
      ],
    },
    [
      { title: 'Làm quen JavaScript', lessons: [
        L('Biến, hằng và kiểu dữ liệu', 'video', 16, ['j-var']),
        L('Hàm và phạm vi', 'video', 20, ['j-func'], { a: { instructions: 'Viết hàm formatPrice(n) trả về chuỗi giá VND có dấu chấm phân cách (ví dụ 1290000 → "1.290.000 ₫"). Nộp đường dẫn hoặc tệp .js.', requiresFile: false, requiresLink: true } }),
      ] },
      { title: 'Dữ liệu có cấu trúc', lessons: [
        L('Làm việc với mảng', 'reading', 18, ['j-array'], { reading: READING_GENERIC }),
        L('Đối tượng và destructuring', 'video', 17, ['j-object'], { a: { instructions: 'Cho mảng đơn hàng, viết hàm trả về tổng tiền theo từng khách hàng dùng reduce và destructuring. Nộp tệp .js.', requiresFile: true, requiresLink: false } }),
      ] },
      { title: 'Luyện tập lập trình', lessons: [
        L('Hướng dẫn: Viết và chạy JavaScript', 'tutorial', 20, ['j-array'], { id: 'lesson-js-p01', quiz: false, code: CODE_TUTORIAL_JS }),
        L('Thử thách: Thống kê đơn hàng', 'code', 25, ['j-array'], { id: 'lesson-js-p02', quiz: false, code: CODE_CHALLENGE_JS }),
      ] },
      { title: 'Trình duyệt và DOM', lessons: [
        L('Chọn và thay đổi phần tử DOM', 'video', 19, ['j-dom']),
        L('Sự kiện và event delegation', 'pdf', 15, ['j-dom']),
      ] },
      { title: 'Bất đồng bộ', lessons: [
        L('Promise là gì', 'video', 21, ['j-async']),
        L('async/await và xử lý lỗi', 'video', 19, ['j-async']),
        L('Dự án nhỏ: Ứng dụng thời tiết', 'reading', 30, ['j-dom', 'j-async'], { quiz: false, reading: READING_GENERIC, a: { instructions: 'Xây dựng trang tra cứu thời tiết theo tên thành phố, có trạng thái đang tải và lỗi. Nộp đường dẫn GitHub.', requiresFile: false, requiresLink: true } }),
      ] },
    ],
    jsBank
  );
  js.aiPath = js.defaultOrder.map((id, i) => ({
    lessonId: id,
    skippable: i === 0,
    reason: [
      'Bạn đã biết khai báo biến — có thể lướt nhanh.',
      'Hàm là điều kiện trước Mảng, Đối tượng và Bất đồng bộ.',
      'Kết quả đầu vào cho thấy bạn còn yếu phần mảng.',
      'Cần cho bài DOM và dự án cuối khoá.',
      'Thực hành ngay sau phần mảng giúp bạn nhớ lâu hơn.',
      'Kiểm tra lại kỹ năng mảng trước khi sang DOM.',
      'Mục tiêu "Làm được dự án" cần thao tác DOM thành thạo.',
      'Bổ sung cho bài DOM; ngắn và thực hành nhiều.',
      'Bạn chọn "Tôi chưa biết" ở câu Promise.',
      'Tiếp nối trực tiếp bài Promise.',
      'Bài tổng hợp, đáp ứng mục tiêu dự án.',
    ][i],
  }));
  js.pathUpdates = [{ afterLessonId: '*', changes: [{ type: 'moved-up', lessonId: null, text: 'Thứ tự giữ nguyên; mức độ thành thạo đã được cập nhật.' }] }];

  // Smaller courses: curriculum without question banks.
  const simple = (base, chapters) => {
    const c = buildCourse(Object.assign({ concepts: [], prerequisites: [] }, base), chapters, null);
    c.aiPath = [];
    c.pathUpdates = [];
    return c;
  };
  const node = simple(
    { id: 'course-node-001', slug: 'nodejs-express-rest-api', lessonPrefix: 'lesson-node', title: 'Node.js & Express xây dựng REST API', summary: 'Thiết kế và xây dựng REST API với Node.js, Express, xác thực JWT và PostgreSQL.', categoryId: 'cat-backend', level: 'Intermediate', lecturerId: 'usr-lecturer-002', price: 990000, proposedPrice: 990000, status: 'published', rating: 4.6, ratingCount: 87, ratingBreakdown: [58, 20, 6, 2, 1], learnersCount: 940, hue: 140, outcomes: ['Xây dựng REST API chuẩn', 'Xác thực với JWT', 'Kết nối PostgreSQL'], requirements: ['JavaScript cơ bản'] },
    [{ title: 'Khởi đầu với Node.js', lessons: [L('Node.js và npm', 'video', 15, []), L('Express và routing', 'video', 22, [])] }, { title: 'API và dữ liệu', lessons: [L('Thiết kế REST API', 'reading', 18, [], { reading: READING_GENERIC }), L('Kết nối PostgreSQL', 'video', 25, []), L('Xác thực JWT', 'video', 24, [])] }]
  );
  const python = simple(
    { id: 'course-python-001', slug: 'python-phan-tich-du-lieu', lessonPrefix: 'lesson-py', title: 'Python cho phân tích dữ liệu', summary: 'Làm sạch, phân tích và trực quan hoá dữ liệu với Python, pandas và matplotlib.', categoryId: 'cat-data', level: 'Beginner', lecturerId: 'usr-lecturer-002', price: 890000, proposedPrice: 890000, status: 'published', rating: 4.5, ratingCount: 64, ratingBreakdown: [40, 15, 6, 2, 1], learnersCount: 610, hue: 220, outcomes: ['Đọc và làm sạch dữ liệu', 'Phân tích với pandas', 'Vẽ biểu đồ với matplotlib'], requirements: ['Không cần kinh nghiệm'] },
    [{ title: 'Python cơ bản', lessons: [L('Cú pháp Python', 'video', 18, []), L('Cấu trúc dữ liệu', 'reading', 16, [], { reading: READING_GENERIC })] }, { title: 'pandas', lessons: [L('DataFrame', 'video', 24, []), L('Làm sạch dữ liệu', 'video', 26, []), L('Trực quan hoá', 'pdf', 20, [])] }]
  );
  const git = simple(
    { id: 'course-git-001', slug: 'git-github-cho-nguoi-moi', lessonPrefix: 'lesson-git', title: 'Git & GitHub cho người mới', summary: 'Quản lý phiên bản mã nguồn với Git và cộng tác trên GitHub qua pull request.', categoryId: 'cat-tools', level: 'Beginner', lecturerId: 'usr-lecturer-002', price: 0, proposedPrice: 0, status: 'published', rating: 4.9, ratingCount: 410, ratingBreakdown: [370, 30, 7, 2, 1], learnersCount: 5210, hue: 15, outcomes: ['Dùng Git hằng ngày', 'Làm việc với nhánh', 'Tạo pull request'], requirements: ['Không yêu cầu'] },
    [{ title: 'Git cơ bản', lessons: [L('Commit đầu tiên', 'video', 12, []), L('Nhánh và merge', 'video', 16, [])] }, { title: 'GitHub', lessons: [L('Pull request', 'video', 14, [])] }]
  );
  const ts = simple(
    { id: 'course-ts-001', slug: 'typescript-chuyen-sau', lessonPrefix: 'lesson-ts', title: 'TypeScript chuyên sâu', summary: '', categoryId: 'cat-frontend', level: 'Advanced', lecturerId: 'usr-lecturer-001', price: 0, proposedPrice: null, status: 'draft', rating: 0, ratingCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], learnersCount: 0, hue: 205, outcomes: [], requirements: [] },
    [{ title: 'Hệ thống kiểu', lessons: [L('Kiểu cơ bản và suy luận kiểu', 'video', 18, [])] }]
  );
  const next = simple(
    { id: 'course-next-001', slug: 'nextjs-app-router-thuc-chien', lessonPrefix: 'lesson-next', title: 'Next.js App Router thực chiến', summary: 'Xây dựng ứng dụng Next.js với App Router, Server Components và triển khai lên Vercel.', categoryId: 'cat-frontend', level: 'Advanced', lecturerId: 'usr-lecturer-001', price: 0, proposedPrice: 1490000, status: 'pending', submittedAt: '2026-10-08T14:20:00Z', rating: 0, ratingCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], learnersCount: 0, hue: 260, outcomes: ['Hiểu Server và Client Components', 'Định tuyến với App Router', 'Triển khai lên Vercel'], requirements: ['Đã học React'] },
    [{ title: 'App Router', lessons: [L('Cấu trúc thư mục app/', 'video', 15, []), L('Server Components', 'video', 22, [])] }, { title: 'Dữ liệu & triển khai', lessons: [L('Data fetching và cache', 'reading', 20, [], { reading: READING_GENERIC }), L('Triển khai lên Vercel', 'video', 12, [])] }]
  );
  const solid = simple(
    { id: 'course-solid-001', slug: 'clean-code-solid-javascript', lessonPrefix: 'lesson-solid', title: 'Clean Code & SOLID trong JavaScript', summary: 'Viết mã dễ đọc, dễ bảo trì với các nguyên tắc SOLID.', categoryId: 'cat-frontend', level: 'Intermediate', lecturerId: 'usr-lecturer-001', price: 0, proposedPrice: 790000, status: 'rejected', submittedAt: '2026-09-28T10:00:00Z', rejectReason: 'Bài 2 và bài 3 thiếu tài liệu (video chưa tải lên). Bài kiểm tra đầu vào chỉ có 2 câu, chưa đủ để xếp lộ trình — vui lòng bổ sung ít nhất 6 câu.', rating: 0, ratingCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], learnersCount: 0, hue: 330, outcomes: ['Đặt tên rõ ràng', 'Áp dụng SOLID'], requirements: ['JavaScript cơ bản'] },
    [{ title: 'Clean Code', lessons: [L('Đặt tên có ý nghĩa', 'video', 14, []), L('Hàm nhỏ và một nhiệm vụ', 'video', 16, []), L('Nguyên tắc SOLID', 'pdf', 20, [])] }]
  );
  const jest = simple(
    { id: 'course-jest-001', slug: 'kiem-thu-voi-jest', lessonPrefix: 'lesson-jest', title: 'Kiểm thử JavaScript với Jest', summary: 'Viết unit test và integration test cho ứng dụng JavaScript với Jest.', categoryId: 'cat-tools', level: 'Intermediate', lecturerId: 'usr-lecturer-001', price: 690000, proposedPrice: 690000, status: 'hidden', hideReason: 'Nội dung bài 3 dùng phiên bản Jest đã ngừng hỗ trợ; tạm ẩn đến khi giảng viên cập nhật.', rating: 4.2, ratingCount: 21, ratingBreakdown: [10, 6, 3, 1, 1], learnersCount: 186, hue: 100, outcomes: ['Viết unit test', 'Mock và spy'], requirements: ['JavaScript cơ bản'] },
    [{ title: 'Jest cơ bản', lessons: [L('Cài đặt Jest', 'video', 10, []), L('Matcher', 'video', 15, []), L('Mock', 'video', 18, [])] }]
  );

  const courses = [react, js, node, python, git, ts, next, solid, jest];
  // ---------- assignments: grading rubric + submission rules ----------
  // rubric[]: {id, name, points, desc}; sum of points = maxScore. latePolicy: accept | penalty | reject.
  const RUBRICS = {
    feature: [
      { id: 'r1', name: 'Chức năng đúng yêu cầu', points: 4, desc: 'Mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.' },
      { id: 'r2', name: 'Xử lý trạng thái & lỗi', points: 2, desc: 'Có trạng thái đang tải, thông báo lỗi rõ ràng.' },
      { id: 'r3', name: 'Cấu trúc & đặt tên', points: 2, desc: 'Tách hàm/component hợp lý, tên biến dễ hiểu.' },
      { id: 'r4', name: 'Trình bày bài nộp', points: 2, desc: 'README hoặc ghi chú giải thích cách làm và cách chạy.' },
    ],
    func: [
      { id: 'r1', name: 'Kết quả đúng', points: 5, desc: 'Hàm trả về đúng với các ví dụ trong đề.' },
      { id: 'r2', name: 'Xử lý đầu vào bất thường', points: 2, desc: 'Số âm, giá trị không phải số, mảng rỗng.' },
      { id: 'r3', name: 'Code dễ đọc', points: 3, desc: 'Ngắn gọn, đặt tên rõ, không lặp code.' },
    ],
  };
  const withRules = (a, rubric) => Object.assign({ maxScore: 10, passScore: 5, acceptedTypes: a.requiresFile ? '.zip, .js, .pdf' : '', dueDays: 7, latePolicy: 'penalty', latePenalty: 20, rubric: rubric ? JSON.parse(JSON.stringify(rubric)) : [] }, a);
  courses.forEach((c) => c.chapters.forEach((ch) => ch.lessons.forEach((l) => {
    if (!l.assignment) return;
    const isFunc = /hàm|formatPrice|tổng tiền/i.test(l.assignment.instructions);
    l.assignment = withRules(l.assignment, c.id === 'course-next-001' ? null : isFunc ? RUBRICS.func : RUBRICS.feature);
  })));

  // ---------- pending course "Next.js" — enough real content for a meaningful admin review ----------
  {
    const [l1, l2] = next.chapters[0].lessons; const [l3, l4] = next.chapters[1].lessons;
    l1.material = { fileName: 'app-router-cau-truc.pdf', kind: 'pdf', pages: 18 };
    l2.material = { fileName: 'server-components.pptx', kind: 'pptx', pages: 24 };
    l4.material = null; // video not uploaded yet — the AI pre-check flags it
    l2.quiz = { id: l2.id + '-quiz', passingScore: 70, questions: [
      q('nq-1', null, 'Server Component mặc định chạy ở đâu?', ['Trên máy chủ', 'Trên trình duyệt', 'Trong Service Worker', 'Trong Edge Function'], 0, 'Trong App Router, component mặc định là Server Component.'),
      q('nq-2', null, 'Muốn dùng useState trong một component, cần làm gì?', ['Thêm "use client" ở đầu tệp', 'Đổi tên tệp thành .client.js', 'Không cần làm gì', 'Bọc trong Suspense'], 2, 'Cần chỉ thị "use client" mới dùng được hook.'),
      q('nq-3', null, 'Server Component có thể đọc trực tiếp cơ sở dữ liệu không?', ['Có', 'Không'], 0, 'Server Component chạy trên máy chủ nên truy cập được dữ liệu.'),
    ] };
    l3.assignment = withRules({ instructions: 'Viết trang /posts lấy danh sách bài viết bằng fetch trong Server Component, có cache 60 giây. Nộp đường dẫn GitHub.', requiresFile: false, requiresLink: true }, null);
    next.entryTest = { id: next.id + '-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: [
      q('ne-1', null, 'JSX được biên dịch thành gì?', ['Lời gọi React.createElement', 'HTML tĩnh', 'CSS', 'JSON'], 0, ''),
      q('ne-2', null, 'Hook nào dùng để lưu state?', ['useState', 'useRef', 'useMemo', 'useId'], 0, ''),
      q('ne-3', null, 'Props trong React có thay đổi được trong component con không?', ['Không, props chỉ đọc', 'Có', 'Chỉ với số', 'Chỉ với chuỗi'], 0, ''),
    ] };
  }
  // Rejected course "Clean Code": materials missing on two lessons (matches its review feedback).
  solid.chapters[0].lessons[0].material = { fileName: 'dat-ten.mp4', kind: 'video', pages: null };

  // ---------- course reviews (admin ↔ lecturer, one record per review round) ----------
  // criteria[id] = {status: pass|fix|na, note}; flags[]: {id, target:{type: course|lesson|question|test|assignment, lessonId, itemId, label},
  //   severity: must|should, comment, status: open|fixed|closed, reply, source: admin|ai, at}
  const courseReviews = [
    { id: 'rv-solid-1', courseId: 'course-solid-001', round: 1, status: 'changes_requested', submittedAt: '2026-09-28T10:00:00Z', decidedAt: '2026-09-30T09:40:00Z', reviewerId: 'usr-admin-001',
      note: 'Khoá học có cấu trúc tốt, cần bổ sung tài liệu và bài kiểm tra đầu vào trước khi xuất bản.',
      criteria: { info: { status: 'pass', note: '' }, materials: { status: 'fix', note: 'Bài 2 và 3 chưa có video.' }, quiz: { status: 'na', note: 'Khoá chưa có quiz bài học.' }, entry: { status: 'fix', note: 'Cần ít nhất 5 câu.' }, code: { status: 'na', note: '' }, assignment: { status: 'na', note: '' }, rights: { status: 'pass', note: '' } },
      flags: [
        { id: 'fl-s1', target: { type: 'lesson', lessonId: 'lesson-solid-002', label: 'Bài: Hàm nhỏ và một nhiệm vụ' }, severity: 'must', comment: 'Video chưa được tải lên, học viên sẽ thấy bài trống.', status: 'open', reply: '', source: 'admin', at: '2026-09-30T09:30:00Z' },
        { id: 'fl-s2', target: { type: 'lesson', lessonId: 'lesson-solid-003', label: 'Bài: Nguyên tắc SOLID' }, severity: 'must', comment: 'Tệp PDF bị lỗi khi mở, vui lòng tải lại.', status: 'open', reply: '', source: 'admin', at: '2026-09-30T09:32:00Z' },
        { id: 'fl-s3', target: { type: 'course', label: 'Bài kiểm tra đầu vào' }, severity: 'must', comment: 'Bài kiểm tra đầu vào chỉ có 2 câu, chưa đủ để xếp lộ trình — cần ít nhất 5 câu.', status: 'open', reply: '', source: 'admin', at: '2026-09-30T09:35:00Z' },
        { id: 'fl-s4', target: { type: 'course', label: 'Mô tả khoá học' }, severity: 'should', comment: 'Nên thêm 1–2 dòng về đối tượng học viên phù hợp.', status: 'open', reply: '', source: 'admin', at: '2026-09-30T09:36:00Z' },
      ] },
    { id: 'rv-next-1', courseId: 'course-next-001', round: 1, status: 'in_review', submittedAt: '2026-10-08T14:20:00Z', decidedAt: null, reviewerId: null, note: '', criteria: {}, flags: [] },
  ];

  // ---------- users ----------
  const U = (id, name, email, role, status, createdAt, lastActive) => ({ id, name, email, role, status: status || 'active', createdAt, lastActive });
  const users = [
    U('usr-learner-001', 'Nguyễn Minh Anh', 'minhanh@codi.vn', 'learner', 'active', '2026-08-15T10:30:00Z', '2026-10-11T08:15:00Z'),
    U('usr-learner-002', 'Trần Minh Vũ', 'minhvu@codi.vn', 'learner', 'active', '2026-08-18T14:45:00Z', '2026-10-10T16:20:00Z'),
    U('usr-learner-003', 'Phạm Thảo Linh', 'thaolinh@codi.vn', 'learner', 'active', '2026-08-20T09:00:00Z', '2026-10-09T11:30:00Z'),
    U('usr-learner-004', 'Hoàng Kim Oanh', 'kimoanh@codi.vn', 'learner', 'inactive', '2026-07-30T13:20:00Z', '2026-09-25T10:00:00Z'),
    U('usr-learner-005', 'Lý Hải Đăng', 'haidang@codi.vn', 'learner', 'active', '2026-09-10T15:40:00Z', '2026-10-11T09:45:00Z'),
    U('usr-learner-006', 'Đặng Quốc Anh', 'quocanh@codi.vn', 'learner', 'active', '2026-09-22T08:15:00Z', '2026-10-08T14:25:00Z'),
    U('usr-learner-007', 'Vũ Thị Hương', 'thihuong@codi.vn', 'learner', 'active', '2026-09-25T11:50:00Z', '2026-10-11T07:30:00Z'),
    U('usr-learner-008', 'Bùi Minh Tuấn', 'minhtuan@codi.vn', 'learner', 'active', '2026-09-28T16:00:00Z', '2026-10-10T13:10:00Z'),
    U('usr-learner-009', 'Ngô Bảo Ngọc', 'baongoc@codi.vn', 'learner', 'active', '2026-10-02T08:00:00Z', '2026-10-11T06:50:00Z'),
    U('usr-learner-010', 'Đỗ Thanh Tùng', 'thanhtung@codi.vn', 'learner', 'active', '2026-10-05T19:20:00Z', '2026-10-10T21:05:00Z'),
    U('usr-lecturer-001', 'Trần Quốc Huy', 'quochuy@codi.vn', 'lecturer', 'active', '2026-03-01T08:00:00Z', '2026-10-11T07:55:00Z'),
    U('usr-lecturer-002', 'Lê Thu Hà', 'thuha@codi.vn', 'lecturer', 'active', '2026-03-12T08:00:00Z', '2026-10-10T18:40:00Z'),
    U('usr-admin-001', 'Phạm Gia Bảo', 'giabao@codi.vn', 'admin', 'active', '2026-01-05T08:00:00Z', '2026-10-11T08:30:00Z'),
  ];

  // ---------- knowledge maps ----------
  const mapFrom = (course, status, review) => ({
    status,
    updatedAt: '2026-10-07T10:00:00Z',
    concepts: course.concepts.map((c) => ({
      id: c.id, name: c.name, review,
      lessonIds: course.chapters.flatMap((ch) => ch.lessons).filter((l) => l.conceptIds.includes(c.id)).map((l) => l.id),
    })),
    edges: course.prerequisites.map((e) => Object.assign({ review }, e)),
  });
  const knowledgeMaps = {
    'course-react-001': mapFrom(react, 'confirmed', 'accepted'),
    'course-js-001': mapFrom(js, 'confirmed', 'accepted'),
    'course-next-001': { status: 'confirmed', updatedAt: '2026-10-08T09:00:00Z', concepts: [
      { id: 'n-app', name: 'App Router', lessonIds: ['lesson-next-001'], review: 'accepted' },
      { id: 'n-rsc', name: 'Server Components', lessonIds: ['lesson-next-002'], review: 'accepted' },
      { id: 'n-data', name: 'Data fetching & cache', lessonIds: ['lesson-next-003'], review: 'accepted' },
      { id: 'n-deploy', name: 'Triển khai', lessonIds: ['lesson-next-004'], review: 'accepted' },
    ], edges: [{ from: 'n-app', to: 'n-rsc', review: 'accepted' }, { from: 'n-rsc', to: 'n-data', review: 'accepted' }] },
    // Draft course: AI suggestions with intentional prerequisite cycle (t-basic→t-infer→t-generic→t-basic).
    'course-ts-001': { status: 'ready', updatedAt: '2026-10-10T16:00:00Z', concepts: [
      { id: 't-basic', name: 'Kiểu cơ bản', lessonIds: ['lesson-ts-001'], review: 'suggested' },
      { id: 't-infer', name: 'Suy luận kiểu', lessonIds: ['lesson-ts-001'], review: 'suggested' },
      { id: 't-generic', name: 'Generics', lessonIds: [], review: 'suggested' },
      { id: 't-utility', name: 'Utility Types', lessonIds: [], review: 'suggested' },
      { id: 't-adv', name: 'Nâng cao', lessonIds: [], review: 'suggested' },
      { id: 't-test', name: 'Kiểm thử Type', lessonIds: [], review: 'suggested' },
    ], edges: [
      { from: 't-basic', to: 't-infer', review: 'suggested' },
      { from: 't-infer', to: 't-generic', review: 'suggested' },
      { from: 't-generic', to: 't-utility', review: 'suggested' },
      { from: 't-utility', to: 't-adv', review: 'suggested' },
      { from: 't-adv', to: 't-test', review: 'suggested' },
      { from: 't-test', to: 't-basic', review: 'suggested' }
    ] },
    'course-solid-001': { status: 'stale', updatedAt: '2026-09-27T10:00:00Z', concepts: [
      { id: 's-name', name: 'Đặt tên', lessonIds: ['lesson-solid-001'], review: 'accepted' },
      { id: 's-func', name: 'Hàm nhỏ', lessonIds: ['lesson-solid-002'], review: 'accepted' },
      { id: 's-solid', name: 'SOLID', lessonIds: ['lesson-solid-003'], review: 'accepted' },
    ], edges: [{ from: 's-name', to: 's-func', review: 'accepted' }, { from: 's-func', to: 's-solid', review: 'accepted' }] },
    'course-jest-001': { status: 'confirmed', updatedAt: '2026-07-01T10:00:00Z', concepts: [], edges: [] },
  };
  // Courses with question banks get entry tests; Next has a short one, Solid's is too short (reject reason).
  next.entryTest = { id: 'course-next-001-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: reactBank['c-component'].concat(reactBank['c-router']) };
  solid.entryTest = { id: 'course-solid-001-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: jsBank['j-func'].slice(0, 2) };
  jest.entryTest = { id: 'course-jest-001-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: jsBank['j-func'] };
  node.entryTest = { id: 'course-node-001-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: jsBank['j-async'] };
  python.entryTest = { id: 'course-python-001-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, questions: jsBank['j-var'] };

  // ---------- orders ----------
  const O = (n, userId, items, status, createdAt, paidAt, voucherCode, discount) => {
    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const code = 'CODI' + String(n).padStart(5, '0');
    const timeline = [{ at: createdAt, label: 'Đã tạo đơn' }];
    if (status === 'paid' || status === 'refunded') timeline.push({ at: paidAt, label: 'Đã nhận tiền' });
    if (status === 'refunded') timeline.push({ at: '2026-10-06T10:00:00Z', label: 'Đã hoàn tiền' });
    if (status === 'failed') timeline.push({ at: paidAt || createdAt, label: 'Thanh toán thất bại (sai nội dung chuyển khoản)' });
    if (status === 'cancelled') timeline.push({ at: paidAt || createdAt, label: 'Người mua đã huỷ' });
    return { id: 'order-' + n, code, userId, items, voucherCode: voucherCode || null, discount: discount || 0, total: subtotal - (discount || 0), method: 'Chuyển khoản ngân hàng', status, createdAt, paidAt: status === 'paid' || status === 'refunded' ? paidAt : null, content: code, timeline };
  };
  const I = (courseId, price) => ({ courseId, price });
  const orders = [
    O(10231, 'usr-learner-001', [I('course-js-001', 590000)], 'paid', '2026-08-16T09:10:00Z', '2026-08-16T09:12:00Z'),
    O(10244, 'usr-learner-002', [I('course-react-001', 1290000)], 'paid', '2026-09-02T20:01:00Z', '2026-09-02T20:04:00Z'),
    O(10251, 'usr-learner-003', [I('course-react-001', 1290000), I('course-js-001', 590000)], 'paid', '2026-09-05T11:20:00Z', '2026-09-05T11:31:00Z', 'WELCOME20', 376000),
    O(10262, 'usr-learner-005', [I('course-react-001', 1290000)], 'paid', '2026-09-12T08:00:00Z', '2026-09-12T08:02:00Z', 'REACT10', 129000),
    O(10270, 'usr-learner-006', [I('course-node-001', 990000)], 'failed', '2026-09-18T15:00:00Z', '2026-09-18T18:00:00Z'),
    O(10275, 'usr-learner-006', [I('course-react-001', 1290000)], 'paid', '2026-09-19T09:00:00Z', '2026-09-19T09:05:00Z'),
    O(10281, 'usr-learner-007', [I('course-python-001', 890000)], 'cancelled', '2026-09-24T13:00:00Z', '2026-09-24T13:10:00Z'),
    O(10288, 'usr-learner-007', [I('course-js-001', 590000)], 'paid', '2026-09-26T10:00:00Z', '2026-09-26T10:03:00Z'),
    O(10293, 'usr-learner-008', [I('course-jest-001', 690000)], 'refunded', '2026-09-29T18:00:00Z', '2026-09-29T18:02:00Z'),
    O(10301, 'usr-learner-003', [I('course-node-001', 990000)], 'pending', '2026-10-05T21:00:00Z', null),
    O(10307, 'usr-learner-008', [I('course-js-001', 590000)], 'paid', '2026-10-07T07:40:00Z', '2026-10-07T07:41:00Z'),
    O(10312, 'usr-learner-009', [I('course-react-001', 1290000)], 'paid', '2026-10-09T19:00:00Z', '2026-10-09T19:06:00Z'),
    O(10318, 'usr-learner-010', [I('course-python-001', 890000), I('course-node-001', 990000)], 'paid', '2026-10-10T20:15:00Z', '2026-10-10T20:22:00Z', 'WELCOME20', 376000),
    O(10322, 'usr-learner-010', [I('course-react-001', 1290000)], 'pending', '2026-10-11T07:50:00Z', null),
  ];

  const enrolments = [
    ['usr-learner-001', 'course-js-001', '2026-08-16T09:12:00Z'],
    ['usr-learner-002', 'course-react-001', '2026-09-02T20:04:00Z'],
    ['usr-learner-003', 'course-react-001', '2026-09-05T11:31:00Z'],
    ['usr-learner-003', 'course-js-001', '2026-09-05T11:31:00Z'],
    ['usr-learner-005', 'course-react-001', '2026-09-12T08:02:00Z'],
    ['usr-learner-006', 'course-react-001', '2026-09-19T09:05:00Z'],
    ['usr-learner-007', 'course-js-001', '2026-09-26T10:03:00Z'],
    ['usr-learner-008', 'course-js-001', '2026-10-07T07:41:00Z'],
    ['usr-learner-009', 'course-react-001', '2026-10-09T19:06:00Z'],
    ['usr-learner-010', 'course-python-001', '2026-10-10T20:22:00Z'],
    ['usr-learner-010', 'course-node-001', '2026-10-10T20:22:00Z'],
    ['usr-learner-002', 'course-git-001', '2026-09-01T10:00:00Z'],
  ].map(([userId, courseId, enrolledAt]) => ({ userId, courseId, enrolledAt }));

  // ---------- learner progress (for lecturer analytics) ----------
  // Deterministic pseudo-random so analytics are stable between reloads.
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const progressFor = (userId, course, done) => {
    const lessons = course.defaultOrder.slice(0, done);
    const quizScores = {};
    const answers = {};
    course.chapters.flatMap((c) => c.lessons).filter((l) => lessons.includes(l.id) && l.quiz).forEach((l) => {
      let right = 0;
      l.quiz.questions.forEach((qq) => { const ok = rnd() > 0.3; answers[qq.id] = ok; if (ok) right += 1; });
      quizScores[l.id] = Math.round((right / l.quiz.questions.length) * 100);
    });
    return { userId, courseId: course.id, completed: lessons, quizScores, answers, lastActive: '2026-10-' + String(5 + Math.floor(rnd() * 6)).padStart(2, '0') + 'T10:00:00Z' };
  };
  const learnerProgress = [
    progressFor('usr-learner-002', react, 8), progressFor('usr-learner-003', react, 12), progressFor('usr-learner-005', react, 5),
    progressFor('usr-learner-006', react, 3), progressFor('usr-learner-009', react, 1),
    progressFor('usr-learner-001', js, 4), progressFor('usr-learner-003', js, 9), progressFor('usr-learner-007', js, 6), progressFor('usr-learner-008', js, 2),
  ];

  // ---------- coding practice attempts by other learners (lecturer analytics) ----------
  const CA = (userId, lessonId, extra) => Object.assign({ userId, courseId: 'course-js-001', lessonId, draft: null, submits: 0, failSubmits: 0, runs: 0, passed: false, lastScore: 0, solutionViewed: false, failedTests: {}, lastRun: null, tutorialStep: 0, tutorialVisited: [], stepDrafts: {}, stepRuns: {}, updatedAt: '2026-10-01T10:00:00Z' }, extra || {});
  const codeAttempts = [
    CA('usr-learner-003', 'lesson-js-p01', { runs: 14, tutorialStep: 6, tutorialVisited: [0, 1, 2, 3, 4, 5, 6], updatedAt: '2026-09-14T20:00:00Z' }),
    CA('usr-learner-003', 'lesson-js-p02', { runs: 9, submits: 2, passed: true, lastScore: 100, failedTests: { 'ct-8': 1 }, updatedAt: '2026-09-15T21:10:00Z' }),
    CA('usr-learner-007', 'lesson-js-p01', { runs: 11, tutorialStep: 6, tutorialVisited: [0, 1, 2, 3, 4, 5, 6], updatedAt: '2026-10-02T19:00:00Z' }),
    CA('usr-learner-007', 'lesson-js-p02', { runs: 17, submits: 4, passed: true, lastScore: 100, solutionViewed: true, failedTests: { 'ct-6': 3, 'ct-8': 3, 'ct-5': 1 }, updatedAt: '2026-10-03T22:40:00Z' }),
    CA('usr-learner-008', 'lesson-js-p01', { runs: 4, tutorialStep: 3, tutorialVisited: [0, 1, 2, 3], updatedAt: '2026-10-09T08:00:00Z' }),
    CA('usr-learner-008', 'lesson-js-p02', { runs: 6, submits: 2, passed: false, lastScore: 50, failedTests: { 'ct-4': 2, 'ct-6': 2, 'ct-7': 2, 'ct-8': 2 }, updatedAt: '2026-10-10T07:30:00Z' }),
    CA('usr-learner-003', 'lesson-react-p01', { courseId: 'course-react-001', runs: 12, submits: 3, passed: true, lastScore: 100, failedTests: { 'rt-4': 2 }, updatedAt: '2026-09-22T20:30:00Z' }),
    CA('usr-learner-002', 'lesson-react-p01', { courseId: 'course-react-001', runs: 9, submits: 3, failSubmits: 3, passed: false, lastScore: 67, solutionViewed: true, failedTests: { 'rt-4': 3, 'rt-6': 2 }, updatedAt: '2026-10-05T21:00:00Z' }),
    CA('usr-learner-005', 'lesson-react-p01', { courseId: 'course-react-001', runs: 3, submits: 1, failSubmits: 1, passed: false, lastScore: 33, failedTests: { 'rt-2': 1, 'rt-4': 1, 'rt-5': 1, 'rt-6': 1 }, updatedAt: '2026-10-11T09:00:00Z' }),
  ];

  // ---------- main learner's own study state for the owned JS course ----------
  const learnerSeed = {
    userId: 'usr-learner-001',
    courses: {
      'course-js-001': {
        goal: { goal: 'project', level: 'basic', hours: 5 },
        diagnostic: { status: 'done', right: 3, wrong: 1, unknown: 2 },
        pathStatus: 'ready',
        completed: ['lesson-js-001', 'lesson-js-002', 'lesson-js-003', 'lesson-js-004'],
        currentLessonId: 'lesson-js-005',
        studied: ['lesson-js-001', 'lesson-js-002', 'lesson-js-003', 'lesson-js-004'],
        quizScores: { 'lesson-js-001': 100, 'lesson-js-002': 50, 'lesson-js-003': 100, 'lesson-js-004': 100 },
        assignments: {
          'lesson-js-002': { status: 'graded', submittedAt: '2026-08-25T20:00:00Z', link: 'https://github.com/minhanh/format-price', note: 'Em dùng toLocaleString.', score: 8.5, maxScore: 10, passScore: 5, feedback: 'Làm tốt! Lưu ý xử lý số âm và giá trị không phải số — hàm hiện trả về "NaN ₫". Thêm một kiểm tra đầu vào là đạt điểm tối đa.', gradedAt: '2026-08-27T09:00:00Z' },
          'lesson-js-004': { status: 'pending', submittedAt: '2026-10-09T21:30:00Z', fileName: 'tong-tien-khach-hang.js', note: '' },
        },
        mastery: { 'j-var': 4, 'j-func': 3, 'j-array': 3, 'j-object': 2, 'j-dom': 1, 'j-async': 0 },
        rating: null,
      },
    },
  };

  // ---------- assignment submissions (lecturer grading queue) ----------
  const S = (id, courseId, lessonId, userId, submittedAt, status, extra) => Object.assign({ id, courseId, lessonId, userId, submittedAt, status, fileName: null, link: null, note: '', score: null, maxScore: 10, passScore: 5, feedback: '', gradedAt: null }, extra || {});
  const submissions = [
    S('sub-001', 'course-react-001', 'lesson-react-005', 'usr-learner-005', '2026-10-10T22:10:00Z', 'pending', { link: 'https://codesandbox.io/s/counter-haidang', note: 'Em chặn giá trị âm bằng Math.max.' }),
    S('sub-002', 'course-react-001', 'lesson-react-005', 'usr-learner-006', '2026-10-09T18:30:00Z', 'pending', { link: 'https://github.com/quocanh/react-counter', note: '' }),
    S('sub-003', 'course-react-001', 'lesson-react-009', 'usr-learner-002', '2026-10-08T20:00:00Z', 'pending', { fileName: 'user-list.zip', note: 'Chưa làm được nút Thử lại, em xin góp ý.' }),
    S('sub-004', 'course-react-001', 'lesson-react-012', 'usr-learner-003', '2026-10-06T09:00:00Z', 'graded', { link: 'https://github.com/thaolinh/todo-app', score: 9, feedback: 'Cấu trúc component rõ ràng, xử lý lỗi tốt. Có thể tách hook useTasks để gọn hơn.', gradedAt: '2026-10-07T08:00:00Z' }),
    S('sub-005', 'course-react-001', 'lesson-react-009', 'usr-learner-003', '2026-09-30T09:00:00Z', 'graded', { fileName: 'users-page.zip', score: 8, feedback: 'Tốt. Nên hiển thị skeleton thay vì chữ "Loading".', gradedAt: '2026-10-01T08:00:00Z' }),
    S('sub-006', 'course-js-001', 'lesson-js-004', 'usr-learner-001', '2026-10-09T21:30:00Z', 'pending', { fileName: 'tong-tien-khach-hang.js' }),
    S('sub-007', 'course-js-001', 'lesson-js-002', 'usr-learner-007', '2026-10-04T15:00:00Z', 'pending', { link: 'https://github.com/thihuong/format-price' }),
    S('sub-008', 'course-js-001', 'lesson-js-002', 'usr-learner-001', '2026-08-25T20:00:00Z', 'graded', { link: 'https://github.com/minhanh/format-price', note: 'Em dùng toLocaleString.', score: 8.5, feedback: 'Làm tốt! Lưu ý xử lý số âm và giá trị không phải số — hàm hiện trả về "NaN ₫". Thêm một kiểm tra đầu vào là đạt điểm tối đa.', gradedAt: '2026-08-27T09:00:00Z' }),
  ];

  // ---------- lesson Q&A ----------
  const Q = (id, courseId, lessonId, userId, text, createdAt, replies) => ({ id, courseId, lessonId, userId, text, createdAt, status: replies.some((r) => r.isLecturer) ? 'answered' : 'unanswered', replies });
  const questions = [
    Q('qa-001', 'course-react-001', 'lesson-react-005', 'usr-learner-005', 'Vì sao gọi setCount hai lần liên tiếp mà giá trị chỉ tăng 1?', '2026-10-10T20:00:00Z', []),
    Q('qa-002', 'course-react-001', 'lesson-react-008', 'usr-learner-002', 'useEffect của em bị chạy hai lần khi dev, có phải lỗi không ạ?', '2026-10-09T14:00:00Z', []),
    Q('qa-003', 'course-react-001', 'lesson-react-003', 'usr-learner-006', 'Nên đặt mỗi component một file riêng không ạ?', '2026-10-05T10:00:00Z', [{ userId: 'usr-lecturer-001', isLecturer: true, text: 'Nên, với component dùng lại nhiều nơi. Component nhỏ chỉ dùng nội bộ có thể để chung file.', at: '2026-10-05T16:00:00Z' }]),
    Q('qa-004', 'course-react-001', 'lesson-react-009', 'usr-learner-003', 'Khi API trả về 404 thì fetch có ném lỗi không?', '2026-09-29T09:00:00Z', [{ userId: 'usr-lecturer-001', isLecturer: true, text: 'Không. fetch chỉ reject khi lỗi mạng; bạn cần kiểm tra response.ok.', at: '2026-09-29T13:00:00Z' }]),
    Q('qa-005', 'course-js-001', 'lesson-js-005', 'usr-learner-007', 'querySelectorAll trả về mảng hay gì ạ?', '2026-10-08T19:00:00Z', []),
    Q('qa-006', 'course-js-001', 'lesson-js-003', 'usr-learner-001', 'Khi nào nên dùng for...of thay vì forEach?', '2026-09-10T20:00:00Z', [{ userId: 'usr-lecturer-001', isLecturer: true, text: 'Dùng for...of khi cần break/continue hoặc await bên trong vòng lặp.', at: '2026-09-11T08:00:00Z' }]),
    Q('qa-007', 'course-js-001', 'lesson-js-005', 'usr-learner-003', 'Có nên dùng innerHTML để thêm phần tử không?', '2026-10-02T09:00:00Z', [{ userId: 'usr-learner-007', isLecturer: false, text: 'Mình nghĩ nên tránh nếu nội dung đến từ người dùng.', at: '2026-10-02T11:00:00Z' }]),
  ];

  // ---------- reviews ----------
  const R = (id, courseId, userId, stars, text, createdAt, reply) => ({ id, courseId, userId, stars, text, createdAt, reply: reply || null });
  const reviews = [
    R('rv-001', 'course-react-001', 'usr-learner-003', 5, 'Dự án cuối khoá rất sát thực tế, lộ trình gợi ý giúp mình bỏ qua phần đã biết.', '2026-10-07T09:00:00Z', { text: 'Cảm ơn Linh! Chúc bạn áp dụng tốt vào công việc.', at: '2026-10-07T15:00:00Z' }),
    R('rv-002', 'course-react-001', 'usr-learner-002', 4, 'Nội dung tốt, mong có thêm bài về tối ưu hiệu năng.', '2026-10-03T21:00:00Z'),
    R('rv-003', 'course-react-001', 'usr-learner-006', 3, 'Video phần useEffect hơi nhanh.', '2026-10-01T08:00:00Z'),
    R('rv-004', 'course-js-001', 'usr-learner-007', 5, 'Giải thích dễ hiểu, bài tập vừa sức.', '2026-09-30T20:00:00Z', { text: 'Cảm ơn bạn đã học cùng Codi!', at: '2026-10-01T09:00:00Z' }),
    R('rv-005', 'course-js-001', 'usr-learner-003', 5, '', '2026-09-20T20:00:00Z'),
    R('rv-006', 'course-js-001', 'usr-learner-008', 4, 'Phần bất đồng bộ cần thêm ví dụ.', '2026-10-09T20:00:00Z'),
    R('rv-007', 'course-git-001', 'usr-learner-002', 5, 'Ngắn gọn, đủ dùng.', '2026-09-03T20:00:00Z'),
    R('rv-008', 'course-node-001', 'usr-learner-010', 4, 'Phần JWT rất hữu ích.', '2026-10-11T07:00:00Z'),
  ];

  // ---------- vouchers ----------
  const vouchers = [
    { id: 'v-001', code: 'WELCOME20', type: 'percent', value: 20, minOrder: 500000, usageLimit: 500, used: 132, expiresAt: '2026-12-31', active: true, scope: 'all' },
    { id: 'v-002', code: 'REACT10', type: 'percent', value: 10, minOrder: 0, usageLimit: null, used: 41, expiresAt: null, active: true, scope: 'all' },
    { id: 'v-003', code: 'GIAM100K', type: 'amount', value: 100000, minOrder: 800000, usageLimit: 100, used: 100, expiresAt: '2026-11-30', active: true, scope: 'all' },
    { id: 'v-004', code: 'SUMMER15', type: 'percent', value: 15, minOrder: 0, usageLimit: 300, used: 287, expiresAt: '2026-08-31', active: false, scope: 'all' },
    { id: 'v-005', code: 'BACKEND50K', type: 'amount', value: 50000, minOrder: 0, usageLimit: null, used: 12, expiresAt: '2027-01-31', active: true, scope: 'all' },
  ];

  const notifications = [
    { id: 'n-001', userId: 'usr-learner-001', title: 'Bài tập đã được chấm', body: 'Hàm và phạm vi — 8,5/10. Xem nhận xét của giảng viên.', link: '/progress', read: false, createdAt: '2026-08-27T09:00:00Z' },
    { id: 'n-002', userId: 'usr-learner-001', title: 'Câu hỏi đã có trả lời', body: 'Giảng viên đã trả lời câu hỏi của bạn ở bài "Làm việc với mảng".', link: '/learn/course-js-001/lesson-js-003', read: true, createdAt: '2026-09-11T08:00:00Z' },
    { id: 'n-003', userId: 'usr-lecturer-001', title: 'Có 4 bài tập chờ chấm', body: 'React từ cơ bản đến dự án thực tế, JavaScript nền tảng.', link: '/teach/grading', read: false, createdAt: '2026-10-10T22:10:00Z' },
    { id: 'n-004', userId: 'usr-lecturer-001', title: 'Khoá học bị từ chối', body: 'Clean Code & SOLID trong JavaScript — xem lý do và sửa để gửi lại.', link: '/teach/courses/course-solid-001/publish', read: false, createdAt: '2026-09-30T10:00:00Z' },
    { id: 'n-005', userId: 'usr-admin-001', title: 'Yêu cầu xuất bản mới', body: 'Next.js App Router thực chiến — Trần Quốc Huy.', link: '/admin/publication', read: false, createdAt: '2026-10-08T14:20:00Z' },
  ];

  // ---------- analytics — system, finance, and learner study data ----------
  // Deterministic (seeded) so charts are identical on every load. 180 days ending at ANALYTICS_AS_OF
  // covers the longest preset (Quý = 90 ngày) plus its previous period for "So sánh: kỳ trước".
  // Platform-scale aggregates (DAU, revenue…) are sample data and are labelled as such in the UI.
  const ANALYTICS_AS_OF = '2026-10-12';
  let aSeed = 20261012;
  const ar = () => ((aSeed = (aSeed * 16807) % 2147483647) / 2147483647);
  const DOW = [0.82, 1.0, 1.04, 1.06, 1.02, 0.93, 0.78]; // Sun..Sat — learners study more mid-week evenings
  const analyticsDaily = [];
  const asOf = new Date(ANALYTICS_AS_OF + 'T00:00:00Z');
  for (let i = 179; i >= 0; i--) {
    const d = new Date(asOf); d.setUTCDate(d.getUTCDate() - i);
    const k = DOW[d.getUTCDay()] * (1 + 0.0028 * (179 - i)) * (0.9 + 0.2 * ar());   // weekly rhythm × slow growth × noise
    const dau = Math.round(210 * k);
    const signups = Math.round(18 * k * (0.9 + 0.2 * ar()));
    const verified = Math.round(signups * (0.76 + 0.1 * ar()));
    const firstPurchase = Math.round(verified * (0.3 + 0.08 * ar()));
    const firstLesson = Math.round(firstPurchase * (0.68 + 0.15 * ar()));
    const newEnrolments = Math.round(firstPurchase * 1.35 + 8 * k);
    const diagnosticTaken = Math.round(newEnrolments * (0.52 + 0.12 * ar()));
    const ordersCreated = Math.round(firstPurchase * 1.5 + 3 * k);
    const ordersPaid = Math.round(ordersCreated * (0.76 + 0.1 * ar()));
    const unpaid = ordersCreated - ordersPaid;
    const ordersExpired = Math.round(unpaid * 0.55);
    const ordersUnderpaid = Math.round(unpaid * 0.12);
    const ordersCancelled = unpaid - ordersExpired - ordersUnderpaid;
    const aov = 760000 + Math.round(ar() * 220) * 1000;
    const revenue = ordersPaid * aov;
    const discount = Math.round(revenue * (0.05 + 0.05 * ar()) / 1000) * 1000;
    const refunds = ar() > 0.86 ? 1 : 0;
    const voucherUsage = Math.round(ordersPaid * (0.28 + 0.14 * ar()));
    const aiRequests = Math.round(dau * (1.5 + 0.4 * ar()));
    const latencySpike = i < 9 ? 260 : 0; // a visible regression in the most recent days
    // time-to-pay buckets for paid orders (minutes): <1, 1–5, 5–15, 15–30
    const p1 = Math.round(ordersPaid * 0.18), p2 = Math.round(ordersPaid * 0.46), p3 = Math.round(ordersPaid * 0.24);
    analyticsDaily.push({
      date: d.toISOString().slice(0, 10),
      dau, wau: Math.round(dau * 3.1), signups, verified, firstPurchase, firstLesson, newEnrolments,
      lessonsCompleted: Math.round(dau * (1.4 + 0.4 * ar())),
      diagnosticTaken, startFromLesson1: newEnrolments - diagnosticTaken,
      aiRequests, aiErrors: Math.round(aiRequests * (0.004 + 0.008 * ar())),
      pathRequests: Math.round(newEnrolments * 0.9), pathErrors: Math.round(newEnrolments * 0.9 * (0.01 + 0.03 * ar())),
      rateLimitHits: Math.round(aiRequests * 0.006 * ar()),
      p95Latency: 1180 + Math.round(ar() * 320) + latencySpike,
      cartAdds: Math.round(ordersCreated * 2.3), buyNow: Math.round(ordersCreated * 0.55),
      ordersCreated, ordersFromCart: Math.round(ordersCreated * 0.64),
      ordersPaid, ordersExpired, ordersUnderpaid, ordersCancelled, ordersPending: i < 1 ? 2 : 0,
      revenue, discount, refunds, refundAmount: refunds * aov, voucherUsage,
      payLt1: p1, pay1to5: p2, pay5to15: p3, pay15to30: ordersPaid - p1 - p2 - p3,
    });
  }

  // The demo learner's daily study minutes (120 days, so "kỳ trước" exists for every preset).
  const learnerStudyDays = [];
  for (let i = 119; i >= 0; i--) {
    const d = new Date(asOf); d.setUTCDate(d.getUTCDate() - i);
    const recent = i < 6; // an unbroken run at the end so the streak is visible
    const studied = recent || ar() > 0.42;
    learnerStudyDays.push({ userId: 'usr-learner-001', date: d.toISOString().slice(0, 10), minutes: studied ? 15 + Math.round(ar() * 70) : 0 });
  }
  // Conversations: learner ↔ lecturer on lessons / from AI escalations
  const conversations = [
    {
      id: 'conv-001', courseId: 'course-js-001', lessonId: 'lesson-js-002', learnerId: 'usr-learner-001', lecturerId: 'usr-lecturer-001',
      status: 'resolved', fromAI: false, aiContext: null,
      messages: [
        { from: 'learner', text: 'Em không hiểu sao hàm hoisting chỉ áp dụng cho function declarations mà không áp dụng cho function expressions. Tại sao vậy ạ?', at: '2026-08-20T15:30:00Z' },
        { from: 'lecturer', text: 'Hoisting chỉ có hiệu lực cho hàm được khai báo bằng `function` vì JavaScript engine phải biết tên hàm trước khi thực thi code. Với function expressions, biến được khai báo nhưng giá trị (hàm) chưa được gán. Hãy thử viết một hàm declaration vs expression rồi gọi chúng trước khi định nghĩa để thấy khác biệt.', at: '2026-08-21T08:00:00Z' },
      ], createdAt: '2026-08-20T15:30:00Z'
    },
    {
      id: 'conv-002', courseId: 'course-react-001', lessonId: 'lesson-react-003', learnerId: 'usr-learner-003', lecturerId: 'usr-lecturer-001',
      status: 'open', fromAI: true, aiContext: { summary: 'Learner asked why re-render happens after setState', code: 'setState(newVal)', failingTest: null },
      messages: [
        { from: 'learner', text: 'Cách mà setState hoạt động trong React là gì? Tại sao component lại render lại?', at: '2026-10-10T20:00:00Z' },
        { from: 'lecturer', text: 'setState không thay đổi state ngay — React lên lịch một bản cập nhật. Sau đó React so sánh render cũ với render mới (reconciliation) và chỉ cập nhật những phần thay đổi. Đó là lý do tại sao setState gây re-render.', at: '2026-10-11T09:15:00Z' },
      ], createdAt: '2026-10-10T20:00:00Z'
    },
  ];

  // Feedback snippets with placeholders for lecturers
  const feedbackSnippets = [
    { id: 'fb-001', lecturerId: 'usr-lecturer-001', title: 'Nhận xét chung', text: 'Bài nộp của {ten_hoc_vien} có điểm {diem}/10. Bạn đã làm rất tốt phần logic, nhưng cần chú ý xử lý các edge case.' },
    { id: 'fb-002', lecturerId: 'usr-lecturer-001', title: 'Cần cải thiện', text: 'Mã code của bạn có thể rút gọn hơn bằng cách sử dụng các phương thức Array (map, filter, reduce) thay vì các vòng lặp truyền thống.' },
    { id: 'fb-003', lecturerId: 'usr-lecturer-001', title: 'Rất tốt', text: 'Tuyệt vời! {ten_hoc_vien} đã đạt {diem}/10. Mã code sạch, dễ đọc và xử lý đầy đủ các trường hợp.' },
    { id: 'fb-004', lecturerId: 'usr-lecturer-002', title: 'Bổ sung', text: 'Để cải thiện thêm: hãy thêm error handling và kiểm tra input trước khi xử lý dữ liệu.' },
  ];

  // Hint usage by learners (visible to lecturer in progress)
  const hintUsage = [
    { userId: 'usr-learner-003', courseId: 'course-js-001', lessonId: 'lesson-js-005', level: 2, at: '2026-09-20T19:30:00Z' },
    { userId: 'usr-learner-007', courseId: 'course-js-001', lessonId: 'lesson-js-p02', level: 1, at: '2026-10-03T22:00:00Z' },
    { userId: 'usr-learner-007', courseId: 'course-js-001', lessonId: 'lesson-js-p02', level: 2, at: '2026-10-03T22:15:00Z' },
    { userId: 'usr-learner-002', courseId: 'course-react-001', lessonId: 'lesson-react-p01', level: 1, at: '2026-10-05T20:45:00Z' },
  ];

  window.CodiData = {
    users,
    categories: [
      { id: 'cat-frontend', name: 'Frontend' }, { id: 'cat-backend', name: 'Backend' },
      { id: 'cat-data', name: 'Dữ liệu' }, { id: 'cat-tools', name: 'Công cụ' },
    ],
    levels: { Beginner: 'Cơ bản', Intermediate: 'Trung cấp', Advanced: 'Nâng cao' },
    courses,
    knowledgeMaps,
    orders,
    vouchers,
    bankInfo: { bank: 'Vietcombank', accountNumber: '1029384756', accountName: 'CONG TY CODI EDU' },
    submissions,
    questions,
    reviews,
    enrolments,
    learnerProgress,
    learnerSeed,
    notifications,
    codeAttempts,
    analytics: analyticsDaily,
    analyticsAsOf: ANALYTICS_AS_OF,
    conversations,
    feedbackSnippets,
    courseReviews,
    hintUsage,
    learnerStudyDays,
  };
})();
