/**
 * lecturer-ai-create.js — "Tạo bằng AI" for whole lessons and code exercises (simulated, deterministic).
 *
 * Codi.lecturerAI.openCreate(courseId, kind)   kind: 'lesson' | 'code'
 *   form (chương, chủ đề, mục tiêu, độ dài/độ khó) → AI soạn bản nháp → duyệt → thêm vào khoá học.
 *   - Bài giảng: tiêu đề, bài đọc (mục tiêu, khái niệm, ví dụ, lỗi hay gặp, tự kiểm tra) + tối đa 3 câu quiz
 *     duyệt từng câu (Chấp nhận / Bỏ). Bài video/slide vẫn cần giảng viên tải tệp lên.
 *   - Bài code: đề bài theo bước, code khởi đầu, lời giải mẫu, test (có test ẩn), gợi ý. Giá trị mong đợi của
 *     test lấy bằng cách chạy thật lời giải mẫu (Codi.code.run), nên bài thêm vào đã có kết quả "Chạy thử".
 * Nothing reaches learners until the lecturer adds it; the code draft opens in the code editor for review.
 * Depends on Codi.lecturerAI (js/lecturer-ai.js), Codi.code, Codi.teach.
 */
(function () {
  'use strict';
  const { html, icon, ui } = Codi;
  const AI = () => Codi.lecturerAI;
  const raw = Codi.raw;

  // ───────────────────────── code exercise templates ─────────────────────────
  // Picked by keywords in the topic (then the course title). Solutions are real and are run to fill expected values.
  const CODE = [
    { k: /reducer|state|giỏ|react|usereducer/i, fn: 'gioHangReducer', title: 'Reducer giỏ hàng',
      ins: ['Viết `gioHangReducer(state, action)` nhận mảng sản phẩm `{ id, qty }` và trả về mảng mới.', 'Action `{ type: "them", id }`: thêm sản phẩm với `qty: 1`, hoặc tăng `qty` nếu đã có.', 'Action `{ type: "xoa", id }`: bỏ sản phẩm khỏi giỏ. Action khác: trả về `state` cũ, không sửa trực tiếp state.'],
      starter: 'function gioHangReducer(state, action) {\n  // Viết code của bạn ở đây\n  return state;\n}\n',
      solution: `function gioHangReducer(state, action) {
  switch (action.type) {
    case 'them': {
      const co = state.find((x) => x.id === action.id);
      if (co) return state.map((x) => (x.id === action.id ? { ...x, qty: x.qty + 1 } : x));
      return [...state, { id: action.id, qty: 1 }];
    }
    case 'xoa':
      return state.filter((x) => x.id !== action.id);
    default:
      return state;
  }
}
`,
      tests: [['Thêm sản phẩm mới', 'gioHangReducer([], { type: "them", id: "a" })', 0], ['Thêm sản phẩm đã có', 'gioHangReducer([{ id: "a", qty: 1 }], { type: "them", id: "a" })', 1], ['Xoá sản phẩm', 'gioHangReducer([{ id: "a", qty: 1 }, { id: "b", qty: 2 }], { type: "xoa", id: "a" })', 2], ['Action lạ trả về state cũ', '(() => { const s = [{ id: "a", qty: 1 }]; return gioHangReducer(s, { type: "khac" }) === s; })()', 2], ['Không sửa trực tiếp state cũ', '(() => { const s = [{ id: "a", qty: 1 }]; gioHangReducer(s, { type: "them", id: "a" }); return s[0].qty; })()', 1]],
      hints: ['Dùng `switch (action.type)` để tách từng loại action.', 'Muốn tăng `qty` mà không sửa state cũ, dùng `map` và tạo đối tượng mới `{ ...x, qty: x.qty + 1 }`.', 'Nhánh `default` trả về chính `state` được truyền vào.'] },
    { k: /chuỗi|string|slug|url|ký tự|đường dẫn/i, fn: 'taoSlug', title: 'Tạo đường dẫn thân thiện (slug)',
      ins: ['Viết `taoSlug(tieuDe)` trả về chuỗi chữ thường, các từ nối bằng dấu `-`.', 'Bỏ dấu tiếng Việt, đổi `đ` thành `d`.', 'Bỏ ký tự đặc biệt và dấu `-` thừa ở đầu, cuối.'],
      starter: 'function taoSlug(tieuDe) {\n  // Viết code của bạn ở đây\n}\n',
      solution: `function taoSlug(tieuDe) {
  return tieuDe
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`,
      tests: [['Tiêu đề không dấu', 'taoSlug("Hello World")', 0], ['Bỏ dấu tiếng Việt', 'taoSlug("Học React cơ bản")', 0], ['Đổi đ thành d', 'taoSlug("Đồ án tốt nghiệp")', 1], ['Bỏ ký tự đặc biệt', 'taoSlug("  JavaScript: 10 mẹo hay!  ")', 2], ['Chuỗi rỗng', 'taoSlug("")', 2]],
      hints: ['`normalize("NFD")` tách chữ và dấu, sau đó xoá các dấu bằng regex.', '`đ` không tách được bằng normalize, cần thay riêng.', 'Thay mọi cụm ký tự không phải chữ/số bằng `-`, rồi cắt `-` ở hai đầu.'] },
    { k: /đối tượng|object|nhóm|group|đếm theo|thống kê/i, fn: 'demTheo', title: 'Đếm theo nhóm',
      ins: ['Viết `demTheo(danhSach, khoa)` trả về đối tượng đếm số phần tử theo giá trị của `khoa`.', 'Ví dụ: `demTheo([{ lop: "A" }, { lop: "A" }], "lop")` trả về `{ A: 2 }`.', 'Bỏ qua phần tử không có `khoa`.'],
      starter: 'function demTheo(danhSach, khoa) {\n  // Viết code của bạn ở đây\n}\n',
      solution: `function demTheo(danhSach, khoa) {
  const ketQua = {};
  for (const x of danhSach) {
    if (x[khoa] === undefined) continue;
    ketQua[x[khoa]] = (ketQua[x[khoa]] || 0) + 1;
  }
  return ketQua;
}
`,
      tests: [['Hai nhóm', 'demTheo([{ lop: "A" }, { lop: "B" }, { lop: "A" }], "lop")', 0], ['Một nhóm', 'demTheo([{ cap: "Cơ bản" }, { cap: "Cơ bản" }], "cap")', 1], ['Danh sách rỗng', 'demTheo([], "lop")', 2], ['Bỏ qua phần tử thiếu khoá', 'demTheo([{ lop: "A" }, { ten: "An" }], "lop")', 2]],
      hints: ['Bắt đầu với một đối tượng rỗng `{}` để chứa kết quả.', 'Với mỗi phần tử, đọc `x[khoa]` rồi tăng bộ đếm tương ứng.', 'Dùng `(ketQua[k] || 0) + 1` để xử lý lần đầu gặp một nhóm.'] },
    { k: /lọc|filter|sắp xếp|sort|tìm|search/i, fn: 'locKhoaHoc', title: 'Lọc và sắp xếp khoá học',
      ins: ['Viết `locKhoaHoc(danhSach, giaToiDa)` với mỗi khoá học có dạng `{ ten, gia }`.', 'Chỉ giữ khoá có `gia` nhỏ hơn hoặc bằng `giaToiDa`, xếp theo giá tăng dần.', 'Trả về mảng tên khoá học.'],
      starter: 'function locKhoaHoc(danhSach, giaToiDa) {\n  // Viết code của bạn ở đây\n}\n',
      solution: `function locKhoaHoc(danhSach, giaToiDa) {
  return danhSach
    .filter((k) => k.gia <= giaToiDa)
    .sort((a, b) => a.gia - b.gia)
    .map((k) => k.ten);
}
`,
      tests: [['Lọc theo giá', 'locKhoaHoc([{ ten: "React", gia: 1290000 }, { ten: "Git", gia: 0 }], 500000)', 0], ['Sắp xếp tăng dần', 'locKhoaHoc([{ ten: "B", gia: 300 }, { ten: "A", gia: 100 }, { ten: "C", gia: 200 }], 1000)', 1], ['Bằng đúng giá tối đa', 'locKhoaHoc([{ ten: "A", gia: 500 }], 500)', 2], ['Không khoá nào phù hợp', 'locKhoaHoc([{ ten: "A", gia: 900 }], 100)', 2]],
      hints: ['Dùng `filter` để bỏ khoá đắt hơn `giaToiDa`.', '`sort((a, b) => a.gia - b.gia)` xếp tăng dần theo giá.', 'Cuối cùng `map` để chỉ lấy tên.'] },
    { k: /mảng|array|tổng|reduce|đơn hàng|tính/i, fn: 'tinhTongDonHang', title: 'Tính tổng đơn hàng',
      ins: ['Viết `tinhTongDonHang(sanPham)` với mỗi sản phẩm có dạng `{ gia, soLuong }`.', 'Trả về tổng `gia * soLuong` của cả đơn.', 'Bỏ qua sản phẩm có `soLuong` nhỏ hơn hoặc bằng 0.'],
      starter: 'function tinhTongDonHang(sanPham) {\n  // Viết code của bạn ở đây\n}\n',
      solution: `function tinhTongDonHang(sanPham) {
  return sanPham.reduce((tong, sp) => (sp.soLuong > 0 ? tong + sp.gia * sp.soLuong : tong), 0);
}
`,
      tests: [['Một sản phẩm', 'tinhTongDonHang([{ gia: 100, soLuong: 2 }])', 0], ['Nhiều sản phẩm', 'tinhTongDonHang([{ gia: 50, soLuong: 1 }, { gia: 20, soLuong: 3 }])', 0], ['Đơn rỗng', 'tinhTongDonHang([])', 1], ['Bỏ qua số lượng 0', 'tinhTongDonHang([{ gia: 100, soLuong: 0 }])', 2], ['Bỏ qua số lượng âm', 'tinhTongDonHang([{ gia: 10, soLuong: -1 }, { gia: 5, soLuong: 2 }])', 2]],
      hints: ['`reduce` với giá trị khởi đầu `0` cộng dồn từng sản phẩm.', 'Đơn rỗng phải trả về `0`, không phải `undefined`.', 'Thêm điều kiện `soLuong > 0` trước khi cộng.'] },
    { k: /.*/, fn: 'demTu', title: 'Đếm số từ trong câu',
      ins: ['Viết `demTu(cau)` trả về số từ trong câu.', 'Các từ cách nhau bởi một hoặc nhiều khoảng trắng.', 'Câu rỗng hoặc chỉ có khoảng trắng trả về `0`.'],
      starter: 'function demTu(cau) {\n  // Viết code của bạn ở đây\n}\n',
      solution: `function demTu(cau) {
  const gon = cau.trim();
  return gon ? gon.split(/\\s+/).length : 0;
}
`,
      tests: [['Câu ngắn', 'demTu("Xin chào Codi")', 0], ['Nhiều khoảng trắng', 'demTu("học   lập  trình")', 1], ['Câu rỗng', 'demTu("")', 2], ['Chỉ có khoảng trắng', 'demTu("    ")', 2]],
      hints: ['`trim()` bỏ khoảng trắng ở hai đầu.', '`split(/\\s+/)` tách theo một hoặc nhiều khoảng trắng.', 'Xử lý riêng trường hợp chuỗi rỗng sau khi trim.'] },
  ];
  // test tuple: [name, call, step]; the last two tests are hidden from "Chạy" and only run on "Nộp bài".
  async function codeDraft(c, f) {
    const t = CODE.find((x) => x.k.test(f.topic)) || CODE.find((x) => x.k.test(c.title));
    let tests = t.tests.map(([name, call, step], i) => ({ id: 'ct-ai-' + Date.now().toString(36) + i, name, call, step, hidden: i >= t.tests.length - 2 }));
    if (f.difficulty === 'easy') tests = tests.slice(0, 3).map((x) => Object.assign(x, { hidden: false }));
    const res = await Codi.code.run(t.solution, tests.map((x) => ({ id: x.id, call: x.call })), { language: 'javascript' });
    const by = {}; (res.results || []).forEach((r) => { by[r.id] = r; });
    tests.forEach((x) => { const r = by[x.id]; x.expected = r && r.ok ? JSON.parse(r.actual) : null; x.ok = !!(r && r.ok); });
    const passed = tests.filter((x) => x.ok).length;
    return {
      title: 'Thử thách: ' + (f.topic.trim() || t.title), durationMin: f.difficulty === 'hard' ? 30 : f.difficulty === 'easy' ? 15 : 20,
      code: {
        kind: 'challenge', language: 'javascript', fileName: t.fn.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + '.js',
        instructions: t.ins.slice(), starter: t.starter, solution: t.solution,
        tests: tests.map((x) => ({ id: x.id, name: x.name, call: x.call, expected: x.expected, step: x.step, hidden: x.hidden })),
        hints: f.difficulty === 'hard' ? t.hints.slice(0, 2) : t.hints.slice(),
        solutionCheck: { ok: passed === tests.length && tests.length > 0, passed, total: tests.length, at: new Date().toISOString() },
      },
      template: t.title,
    };
  }

  // ───────────────────────── lesson draft ─────────────────────────
  const LENGTH = { short: ['Ngắn', 5, 3], medium: ['Vừa', 10, 4], long: ['Dài', 20, 6] };
  function lessonDraft(c, f) {
    const topic = f.topic.trim(); const [, minutes, n] = LENGTH[f.length];
    const facts = AI().factsFor(c, topic).slice(0, n);
    const points = facts.length ? facts.map((x) => `- **${x.a}** — ${x.e}`) : [`- Định nghĩa và vai trò của ${topic}`, `- Cách dùng ${topic} trong một ví dụ nhỏ`, `- Khi nào không nên dùng ${topic}`];
    const reading = [
      `## ${topic}`,
      `**Mục tiêu:** ${f.goal.trim() || `sau bài này, bạn giải thích được ${topic} là gì và áp dụng được vào một ví dụ nhỏ.`}`,
      '### Khái niệm chính', points.join('\n'),
      '### Lỗi thường gặp', facts.length ? facts.slice(0, 2).map((x) => `- Nhầm "${x.w[0]}" với "${x.a}".`).join('\n') : `- Áp dụng ${topic} khi chưa nắm rõ yêu cầu bài toán.\n- Bỏ qua trường hợp biên khi thử ví dụ.`,
      '### Tự kiểm tra', `- Giải thích ${topic} bằng lời của bạn trong 2–3 câu.\n- Viết lại ví dụ trong bài mà không nhìn tài liệu.`,
    ].join('\n\n');
    const lesson = { title: topic.charAt(0).toUpperCase() + topic.slice(1), durationMin: minutes, reading, type: f.lessonType };
    const questions = f.quiz ? AI().generateQuestions(c, { title: topic, conceptIds: [] }, { count: 3, difficulty: 'medium' }).map((q) => Object.assign(q, { state: 'pending' })) : [];
    return { lesson, questions };
  }

  // ───────────────────────── sheet ─────────────────────────
  let cr = null; let handle = null; let job = null;
  const course = () => Codi.course(cr.courseId);
  function formBody() {
    const c = course(); const f = cr.form; const isCode = cr.kind === 'code';
    return html`<div class="stack-4 la">
      <div class="viz-seg-ctrl" role="group" aria-label="Loại nội dung">${[['lesson', 'Bài giảng'], ['code', 'Bài code']].map(([k, t]) => html`<button type="button" aria-pressed="${String(cr.kind === k)}" data-cr-kind="${k}">${t}</button>`)}</div>
      <p class="small muted">${isCode ? 'AI soạn đề bài theo bước, code khởi đầu, lời giải mẫu, test và gợi ý. Lời giải được chạy thật để điền giá trị mong đợi của test.' : 'AI soạn bài đọc (mục tiêu, khái niệm, lỗi hay gặp, tự kiểm tra) và tối đa 3 câu quiz. Bạn duyệt trước khi thêm vào khoá.'}</p>
      <div class="field"><label for="cr-ch">Thêm vào chương</label><select id="cr-ch" data-cr-f="chapterId">${c.chapters.length ? c.chapters.map((ch, i) => html`<option value="${ch.id}" ${f.chapterId === ch.id ? raw('selected') : ''}>Chương ${i + 1}: ${ch.title}</option>`) : html`<option value="">Chương 1 (tạo mới)</option>`}</select></div>
      <div class="field ${cr.err ? 'is-invalid' : ''}"><label for="cr-topic">${isCode ? 'Bài code luyện kỹ năng gì?' : 'Chủ đề bài giảng'} <span class="req">*</span></label>
        <input id="cr-topic" value="${f.topic}" data-cr-f="topic" placeholder="${isCode ? 'Ví dụ: lọc và sắp xếp mảng, reducer giỏ hàng' : 'Ví dụ: useEffect và vòng đời component'}" aria-describedby="cr-topic-help">
        <span class="field-help" id="cr-topic-help">${isCode ? 'AI chọn dạng bài phù hợp nhất với chủ đề; bạn sửa lại được trong trình soạn bài code.' : 'Càng cụ thể, bài đọc càng sát nội dung.'}</span>
        ${cr.err ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${cr.err}</span></p>` : ''}</div>
      <div class="field"><label for="cr-goal">Học viên cần làm được gì sau bài? <span class="muted">(không bắt buộc)</span></label><textarea id="cr-goal" rows="2" data-cr-f="goal">${f.goal}</textarea></div>
      ${isCode ? html`<div class="field"><label for="cr-diff">Độ khó</label><select id="cr-diff" data-cr-f="difficulty">${[['easy', 'Dễ — 3 test, không có test ẩn'], ['medium', 'Vừa — có 2 test ẩn'], ['hard', 'Khó — có test ẩn, ít gợi ý hơn']].map(([v, t]) => html`<option value="${v}" ${f.difficulty === v ? raw('selected') : ''}>${t}</option>`)}</select></div>
        ${c.language === 'python' || /python/i.test(c.title) ? ui.alert({ type: 'info', title: 'Bản nháp viết bằng JavaScript', body: 'Python đang được mô phỏng trong prototype nên AI soạn bài bằng JavaScript.' }) : ''}`
      : html`<div class="grid-2">
          <div class="field"><label for="cr-type">Hình thức</label><select id="cr-type" data-cr-f="lessonType">${[['reading', 'Bài đọc'], ['video', 'Video (tải video sau)'], ['pdf', 'Slide / PDF (tải tệp sau)']].map(([v, t]) => html`<option value="${v}" ${f.lessonType === v ? raw('selected') : ''}>${t}</option>`)}</select></div>
          <div class="field"><label for="cr-len">Độ dài</label><select id="cr-len" data-cr-f="length">${Object.keys(LENGTH).map((k) => html`<option value="${k}" ${f.length === k ? raw('selected') : ''}>${LENGTH[k][0]} · khoảng ${LENGTH[k][1]} phút</option>`)}</select></div></div>
        <label class="check"><input type="checkbox" data-cr-f="quiz" ${f.quiz ? raw('checked') : ''}> Kèm 3 câu quiz cuối bài</label>`}
      ${cr.step === 'generating' ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>${isCode ? 'AI đang soạn đề, lời giải và chạy thử test…' : 'AI đang soạn bài giảng…'}</span><button type="button" class="btn btn-ghost btn-sm" data-cr-stop>${icon('x', { cls: 'icon-sm' })} Dừng</button></div>` : ''}
      ${cr.step === 'error' ? ui.alert({ type: 'danger', title: 'AI chưa soạn được bản nháp', body: 'Thông tin bạn nhập vẫn được giữ.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-cr-go>Thử lại</button>` }) : ''}
      ${cr.step === 'limit' ? ui.alert({ type: 'warn', title: 'Đã dùng hết lượt tạo bằng AI trong giờ này', body: 'Thử lại sau ít phút hoặc soạn thủ công từ "Thêm nội dung".' }) : ''}
    </div>`;
  }
  const qState = { pending: ['badge-accent', 'Chờ duyệt'], accepted: ['badge-success', 'Đã chấp nhận'], discarded: ['', 'Đã bỏ'] };
  function lessonReview() {
    const r = cr.result;
    return html`<div class="stack-4 la">
      ${ui.alert({ type: 'info', title: 'Bản nháp do AI soạn', body: 'Đọc lại và sửa trực tiếp bên dưới. Chỉ câu quiz bạn chấp nhận mới được thêm.' })}
      <div class="grid-2"><div class="field"><label for="cr-title">Tên bài học</label><input id="cr-title" value="${r.lesson.title}" data-cr-r="title"></div>
        <div class="field"><label for="cr-dur">Thời lượng (phút)</label><input id="cr-dur" type="number" min="1" value="${r.lesson.durationMin}" data-cr-r="durationMin"></div></div>
      <div class="field"><label for="cr-read">Bài đọc</label><textarea id="cr-read" rows="14" data-cr-r="reading">${r.lesson.reading}</textarea><span class="field-help">Hỗ trợ **in đậm**, \`code\` và danh sách bắt đầu bằng "- ".</span></div>
      ${r.lesson.type !== 'reading' ? html`<p class="small text-warn">${icon('alert-triangle', { cls: 'icon-sm' })} Bài ${r.lesson.type === 'video' ? 'video' : 'slide/PDF'} cần tải tệp lên trước khi gửi duyệt.</p>` : ''}
      ${r.questions.length ? html`<section class="la-block"><div class="row-between"><strong class="small">${r.questions.length} câu quiz · ${r.questions.filter((q) => q.state === 'accepted').length} đã chấp nhận</strong><button type="button" class="btn btn-secondary btn-sm" data-cr-q-all>Chấp nhận tất cả</button></div>
        <ol class="la-qs">${r.questions.map((q, i) => html`<li class="la-q ${q.state === 'discarded' ? 'is-off' : ''}">
          <div class="row-between"><strong class="small">Câu ${i + 1}</strong><span class="badge ${qState[q.state][0]}">${qState[q.state][1]}</span></div>
          <p class="small">${q.text}</p>
          <ul class="rv-opts">${q.options.map((o, k) => html`<li class="${k === q.correctIndex ? 'is-correct' : ''}">${k === q.correctIndex ? html`${icon('check-circle', { cls: 'icon-sm' })}<span class="sr-only">Đáp án đúng: </span>` : html`<span class="rv-opt-dot" aria-hidden="true"></span>`}<span>${o}</span></li>`)}</ul>
          <p class="xsmall muted">Giải thích: ${q.explanation}</p>
          <div class="row" style="gap:8px"><button type="button" class="btn btn-primary btn-sm" data-cr-q="${i}" data-v="accepted">Chấp nhận</button><button type="button" class="btn btn-ghost btn-sm" data-cr-q="${i}" data-v="discarded">Bỏ</button></div></li>`)}</ol>
        <p class="xsmall muted">Muốn sửa câu chữ hoặc đáp án, chấp nhận rồi chỉnh trong trình soạn quiz.</p></section>` : ''}
    </div>`;
  }
  function codeReview() {
    const r = cr.result; const cd = r.code; const chk = cd.solutionCheck;
    return html`<div class="stack-4 la">
      ${ui.alert({ type: chk.ok ? 'success' : 'warn', title: chk.ok ? `Lời giải mẫu đạt ${chk.passed}/${chk.total} test` : `Lời giải mẫu mới đạt ${chk.passed}/${chk.total} test`, body: `Dạng bài: ${r.template}. Sau khi thêm, bài mở trong trình soạn bài code để bạn chỉnh và chạy lại.` })}
      <div class="grid-2"><div class="field"><label for="cr-title">Tên bài</label><input id="cr-title" value="${r.title}" data-cr-r="title"></div>
        <div class="field"><label for="cr-dur">Thời lượng (phút)</label><input id="cr-dur" type="number" min="1" value="${r.durationMin}" data-cr-r="durationMin"></div></div>
      <section class="la-block"><strong class="small">Đề bài</strong><ol class="small">${cd.instructions.map((s) => html`<li>${s.replace(/`/g, '')}</li>`)}</ol></section>
      <details class="panel"><summary class="small strong">Code khởi đầu · ${cd.fileName}</summary><pre class="la-code"><code>${cd.starter}</code></pre></details>
      <details class="panel"><summary class="small strong">Lời giải mẫu</summary><pre class="la-code"><code>${cd.solution}</code></pre></details>
      <section class="la-block"><strong class="small">${cd.tests.length} test · ${cd.tests.filter((t) => t.hidden).length} test ẩn</strong>
        <div class="table-wrap"><table class="table"><caption class="sr-only">Test do AI soạn</caption><thead><tr><th>Test</th><th>Biểu thức</th><th>Mong đợi</th></tr></thead><tbody>
          ${cd.tests.map((t) => html`<tr><th scope="row"><span class="small">${t.name}</span>${t.hidden ? html` <span class="badge">Ẩn</span>` : ''}</th><td class="mono xsmall">${t.call}</td><td class="mono xsmall">${t.expected === null ? '—' : JSON.stringify(t.expected)}</td></tr>`)}
        </tbody></table></div></section>
      <section class="la-block"><strong class="small">Gợi ý mở dần</strong><ol class="small">${cd.hints.map((h) => html`<li>${h.replace(/`/g, '')}</li>`)}</ol></section>
    </div>`;
  }
  const body = () => (cr.step === 'review' ? (cr.kind === 'code' ? codeReview() : lessonReview()) : formBody());
  function footer() {
    if (cr.step === 'review') return html`<button class="btn btn-ghost" data-cr-back>Sửa yêu cầu</button><button class="btn btn-secondary" data-cr-go>Tạo lại</button><button class="btn btn-primary" data-cr-apply>${cr.kind === 'code' ? 'Thêm và mở trình soạn' : 'Thêm vào khoá học'}</button>`;
    return html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-cr-go ${cr.step === 'generating' ? raw('disabled') : ''}>${icon('sparkles', { cls: 'icon-sm' })} Tạo bản nháp</button>`;
  }
  const refresh = () => { if (handle) { handle.setBody(body()); handle.setFooter(footer()); } };

  function generate() {
    const c = course(); const f = cr.form;
    if (!f.topic.trim()) { cr.err = cr.kind === 'code' ? 'Nhập kỹ năng bài code cần luyện.' : 'Nhập chủ đề bài giảng.'; refresh(); const t = handle.el.querySelector('#cr-topic'); if (t) t.focus(); return; }
    cr.err = null;
    job = AI().task({
      onLimit() { cr.step = 'limit'; refresh(); },
      onStart() { cr.step = 'generating'; refresh(); },
      onError() { cr.step = 'error'; refresh(); },
      onDone(res) { if (!cr) return; cr.result = res; cr.step = 'review'; refresh(); },
    }, () => (cr.kind === 'code' ? codeDraft(c, f) : lessonDraft(c, f)), 1500);
  }
  function apply() {
    const c = course(); const r = cr.result;
    if (!c.chapters.length) c.chapters.push({ id: c.id + '-ch' + Date.now().toString(36), title: 'Chương 1', lessons: [] });
    const ch = c.chapters.find((x) => x.id === cr.form.chapterId) || c.chapters[c.chapters.length - 1];
    const id = 'lesson-' + Date.now().toString(36);
    let l;
    if (cr.kind === 'code') {
      l = { id, title: r.title.trim() || 'Bài code mới', type: 'code', durationMin: Math.max(1, Number(r.durationMin) || 20), conceptIds: [], reading: '', quiz: null, assignment: null, code: r.code, aiDraft: true };
    } else {
      const qs = r.questions.filter((q) => q.state === 'accepted').map((q) => { const o = Object.assign({}, q, { aiReviewed: true }); delete o.state; return o; });
      l = { id, title: r.lesson.title.trim() || 'Bài học mới', type: r.lesson.type, durationMin: Math.max(1, Number(r.lesson.durationMin) || 10), conceptIds: [], reading: r.lesson.reading, quiz: qs.length ? { id: id + '-quiz', passingScore: 70, questions: qs } : null, assignment: null, aiDraft: true };
    }
    ch.lessons.push(l);
    Codi.teach.contentChanged(c); Codi.teach.persist();
    const kind = cr.kind; handle.close();
    if (kind === 'code') { Codi.go(`/teach/courses/${c.id}/code/${id}`); ui.toast('Đã thêm bài code do AI soạn. Kiểm tra đề, test rồi bấm "Lưu bài".', { type: 'success' }); }
    else { Codi.go(`/teach/courses/${c.id}/content?lesson=${id}`); ui.toast(`Đã thêm bài "${l.title}" vào ${ch.title}.${l.type !== 'reading' ? ' Nhớ tải tệp lên cho bài này.' : ''}`, { type: 'success' }); }
  }

  function openCreate(courseId, kind, chapterId) {
    const c = Codi.course(courseId);
    cr = { courseId, kind: kind === 'code' ? 'code' : 'lesson', step: 'form', err: null, result: null,
      form: { chapterId: chapterId || (c.chapters.length ? c.chapters[c.chapters.length - 1].id : ''), topic: '', goal: '', length: 'medium', quiz: true, difficulty: 'medium', lessonType: 'reading' } };
    handle = ui.sheet({
      title: 'Tạo bằng AI', wide: true, body: body(), footer: footer(),
      onClose: () => { if (job) job.stop(); cr = null; handle = null; },
      onMount(h) {
        h.el.addEventListener('input', (e) => {
          const t = e.target; if (!cr) return;
          if (t.dataset.crF && t.type !== 'checkbox' && t.tagName !== 'SELECT') cr.form[t.dataset.crF] = t.value;
          if (t.dataset.crR) { const tgt = cr.kind === 'code' ? cr.result : (t.dataset.crR === 'title' || t.dataset.crR === 'durationMin' || t.dataset.crR === 'reading' ? cr.result.lesson : cr.result); tgt[t.dataset.crR] = t.value; }
        });
        h.el.addEventListener('change', (e) => {
          const t = e.target; if (!cr || !t.dataset.crF) return;
          if (t.type === 'checkbox') cr.form[t.dataset.crF] = t.checked;
          else if (t.tagName === 'SELECT') { cr.form[t.dataset.crF] = t.value; refresh(); }
        });
        h.el.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b || !cr) return;
          if (b.dataset.crKind && cr.step !== 'generating') { cr.kind = b.dataset.crKind; cr.err = null; cr.step = 'form'; refresh(); }
          else if (b.hasAttribute('data-cr-go')) generate();
          else if (b.hasAttribute('data-cr-stop')) { if (job) job.stop(); cr.step = 'form'; refresh(); ui.toast('Đã dừng tạo bản nháp.'); }
          else if (b.hasAttribute('data-cr-back')) { cr.step = 'form'; refresh(); }
          else if (b.hasAttribute('data-cr-apply')) apply();
          else if (b.dataset.crQ) { cr.result.questions[b.dataset.crQ].state = b.dataset.v; refresh(); }
          else if (b.hasAttribute('data-cr-q-all')) { cr.result.questions.forEach((q) => { if (q.state !== 'discarded') q.state = 'accepted'; }); refresh(); }
        });
      },
    });
  }

  Codi.lecturerAI.openCreate = openCreate;
})();
