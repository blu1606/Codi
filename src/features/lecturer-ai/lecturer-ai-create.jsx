/**
 * "Tạo bằng AI" for whole lessons and code exercises (simulated, deterministic).
 * Port of docs/mockup/js/lecturer-ai-create.js. Installs one member on Codi.lecturerAI:
 *
 *   openCreate(courseId, kind: 'lesson'|'code', chapterId?) → void
 *     form (chương, chủ đề, mục tiêu, độ dài/độ khó) → AI soạn bản nháp → duyệt → thêm vào khoá học.
 *     - Bài giảng: tiêu đề, bài đọc (mục tiêu, khái niệm, ví dụ, lỗi hay gặp, tự kiểm tra) + tối đa 3 câu quiz
 *       duyệt từng câu (Chấp nhận / Bỏ). Bài video/slide vẫn cần giảng viên tải tệp lên.
 *     - Bài code: đề bài theo bước, code khởi đầu, lời giải mẫu, test (có test ẩn), gợi ý. Giá trị mong đợi của
 *       test lấy bằng cách chạy thật lời giải mẫu (Codi.code.run), nên bài thêm vào đã có kết quả "Chạy thử".
 * Nothing reaches learners until the lecturer adds it; the code draft opens in the code editor for review.
 * The lecturer workspace ("Thêm nội dung" menu) calls Codi.lecturerAI.openCreate(c.id, 'lesson'|'code', chapterId).
 * Depends on Codi.lecturerAI (./lecturer-ai-api.jsx), Codi.code (run), Codi.teach (contentChanged).
 */
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import './lecturer-ai-api';

const AI = () => Codi.lecturerAI;

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
  const res = Codi.code && Codi.code.run
    ? await Codi.code.run(t.solution, tests.map((x) => ({ id: x.id, call: x.call })), { language: 'javascript' })
    : { results: [] };
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
      // Same field the editor writes when a save verifies the solution (real solutionVerifiedAt).
      solutionVerifiedAt: passed === tests.length && tests.length > 0 ? new Date().toISOString() : null,
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
const refresh = () => { if (handle) handle.update({}); };
const setForm = (key, value) => { cr.form[key] = value; refresh(); };

function FormBody() {
  const c = course(); const f = cr.form; const isCode = cr.kind === 'code';
  return (
    <div className="stack-4 la">
      <div className="viz-seg-ctrl" role="group" aria-label="Loại nội dung">
        {[['lesson', 'Bài giảng'], ['code', 'Bài code']].map(([k, t]) => (
          <button key={k} type="button" aria-pressed={cr.kind === k} onClick={() => { if (cr.step === 'generating') return; cr.kind = k; cr.err = null; cr.step = 'form'; refresh(); }}>{t}</button>
        ))}
      </div>
      <p className="small muted">{isCode ? 'AI soạn đề bài theo bước, code khởi đầu, lời giải mẫu, test và gợi ý. Lời giải được chạy thật để điền giá trị mong đợi của test.' : 'AI soạn bài đọc (mục tiêu, khái niệm, lỗi hay gặp, tự kiểm tra) và tối đa 3 câu quiz. Bạn duyệt trước khi thêm vào khoá.'}</p>
      <div className="field"><label htmlFor="cr-ch">Thêm vào chương</label>
        <select id="cr-ch" value={f.chapterId} onChange={(e) => setForm('chapterId', e.target.value)}>
          {c.chapters.length ? c.chapters.map((ch, i) => <option key={ch.id} value={ch.id}>Chương {i + 1}: {ch.title}</option>) : <option value="">Chương 1 (tạo mới)</option>}
        </select></div>
      <div className={`field ${cr.err ? 'is-invalid' : ''}`}><label htmlFor="cr-topic">{isCode ? 'Bài code luyện kỹ năng gì?' : 'Chủ đề bài giảng'} <span className="req">*</span></label>
        <input id="cr-topic" value={f.topic} onChange={(e) => setForm('topic', e.target.value)} placeholder={isCode ? 'Ví dụ: lọc và sắp xếp mảng, reducer giỏ hàng' : 'Ví dụ: useEffect và vòng đời component'} aria-describedby="cr-topic-help" aria-invalid={cr.err ? 'true' : undefined} />
        <span className="field-help" id="cr-topic-help">{isCode ? 'AI chọn dạng bài phù hợp nhất với chủ đề; bạn sửa lại được trong trình soạn bài code.' : 'Càng cụ thể, bài đọc càng sát nội dung.'}</span>
        {cr.err && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{cr.err}</span></p>}</div>
      <div className="field"><label htmlFor="cr-goal">Học viên cần làm được gì sau bài? <span className="muted">(không bắt buộc)</span></label>
        <textarea id="cr-goal" rows={2} value={f.goal} onChange={(e) => setForm('goal', e.target.value)} /></div>
      {isCode ? (
        <>
          <div className="field"><label htmlFor="cr-diff">Độ khó</label>
            <select id="cr-diff" value={f.difficulty} onChange={(e) => setForm('difficulty', e.target.value)}>
              {[['easy', 'Dễ — 3 test, không có test ẩn'], ['medium', 'Vừa — có 2 test ẩn'], ['hard', 'Khó — có test ẩn, ít gợi ý hơn']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select></div>
          {c.language === 'python' || /python/i.test(c.title) ? <Alert type="info" title="Bản nháp viết bằng JavaScript" body="Python đang được mô phỏng trong prototype nên AI soạn bài bằng JavaScript." /> : null}
        </>
      ) : (
        <>
          <div className="grid-2">
            <div className="field"><label htmlFor="cr-type">Hình thức</label>
              <select id="cr-type" value={f.lessonType} onChange={(e) => setForm('lessonType', e.target.value)}>
                {[['reading', 'Bài đọc'], ['video', 'Video (tải video sau)'], ['pdf', 'Slide / PDF (tải tệp sau)']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select></div>
            <div className="field"><label htmlFor="cr-len">Độ dài</label>
              <select id="cr-len" value={f.length} onChange={(e) => setForm('length', e.target.value)}>
                {Object.keys(LENGTH).map((k) => <option key={k} value={k}>{LENGTH[k][0]} · khoảng {LENGTH[k][1]} phút</option>)}
              </select></div>
          </div>
          <label className="check"><input type="checkbox" checked={f.quiz} onChange={(e) => setForm('quiz', e.target.checked)} /> Kèm 3 câu quiz cuối bài</label>
        </>
      )}
      {cr.step === 'generating' && (
        <div className="ai-thinking-row" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>{isCode ? 'AI đang soạn đề, lời giải và chạy thử test…' : 'AI đang soạn bài giảng…'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={stop}><Icon name="x" className="icon-sm" /> Dừng</button></div>
      )}
      {cr.step === 'error' && (
        <Alert type="danger" title="AI chưa soạn được bản nháp" body="Thông tin bạn nhập vẫn được giữ."
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={generate}>Thử lại</button>} />
      )}
      {cr.step === 'limit' && <Alert type="warn" title="Đã dùng hết lượt tạo bằng AI trong giờ này" body={'Thử lại sau ít phút hoặc soạn thủ công từ "Thêm nội dung".'} />}
    </div>
  );
}

const Q_STATE = { pending: ['badge-accent', 'Chờ duyệt'], accepted: ['badge-success', 'Đã chấp nhận'], discarded: ['', 'Đã bỏ'] };
function LessonReview() {
  const r = cr.result; const set = (k, v) => { r.lesson[k] = v; refresh(); };
  return (
    <div className="stack-4 la">
      <Alert type="info" title="Bản nháp do AI soạn" body="Đọc lại và sửa trực tiếp bên dưới. Chỉ câu quiz bạn chấp nhận mới được thêm." />
      <div className="grid-2">
        <div className="field"><label htmlFor="cr-title">Tên bài học</label><input id="cr-title" value={r.lesson.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field"><label htmlFor="cr-dur">Thời lượng (phút)</label><input id="cr-dur" type="number" min="1" value={r.lesson.durationMin} onChange={(e) => set('durationMin', e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="cr-read">Bài đọc</label><textarea id="cr-read" rows={14} value={r.lesson.reading} onChange={(e) => set('reading', e.target.value)} />
        <span className="field-help">Hỗ trợ **in đậm**, `code` và danh sách bắt đầu bằng "- ".</span></div>
      {r.lesson.type !== 'reading' && <p className="small text-warn"><Icon name="alert-triangle" className="icon-sm" /> Bài {r.lesson.type === 'video' ? 'video' : 'slide/PDF'} cần tải tệp lên trước khi gửi duyệt.</p>}
      {r.questions.length > 0 && (
        <section className="la-block">
          <div className="row-between"><strong className="small">{r.questions.length} câu quiz · {r.questions.filter((q) => q.state === 'accepted').length} đã chấp nhận</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { r.questions.forEach((q) => { if (q.state !== 'discarded') q.state = 'accepted'; }); refresh(); }}>Chấp nhận tất cả</button></div>
          <ol className="la-qs">{r.questions.map((q, i) => (
            <li key={q.id} className={`la-q ${q.state === 'discarded' ? 'is-off' : ''}`}>
              <div className="row-between"><strong className="small">Câu {i + 1}</strong><span className={`badge ${Q_STATE[q.state][0]}`}>{Q_STATE[q.state][1]}</span></div>
              <p className="small">{q.text}</p>
              <ul className="rv-opts">{q.options.map((o, k) => (
                <li key={k} className={k === q.correctIndex ? 'is-correct' : ''}>
                  {k === q.correctIndex ? <><Icon name="check-circle" className="icon-sm" /><span className="sr-only">Đáp án đúng: </span></> : <span className="rv-opt-dot" aria-hidden="true" />}<span>{o}</span>
                </li>
              ))}</ul>
              <p className="xsmall muted">Giải thích: {q.explanation}</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { q.state = 'accepted'; refresh(); }}>Chấp nhận</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { q.state = 'discarded'; refresh(); }}>Bỏ</button>
              </div>
            </li>
          ))}</ol>
          <p className="xsmall muted">Muốn sửa câu chữ hoặc đáp án, chấp nhận rồi chỉnh trong trình soạn quiz.</p>
        </section>
      )}
    </div>
  );
}

function CodeReview() {
  const r = cr.result; const cd = r.code; const chk = cd.solutionCheck;
  const set = (k, v) => { r[k] = v; refresh(); };
  return (
    <div className="stack-4 la">
      <Alert type={chk.ok ? 'success' : 'warn'} title={chk.ok ? `Lời giải mẫu đạt ${chk.passed}/${chk.total} test` : `Lời giải mẫu mới đạt ${chk.passed}/${chk.total} test`}
        body={`Dạng bài: ${r.template}. Sau khi thêm, bài mở trong trình soạn bài code để bạn chỉnh và chạy lại.`} />
      <div className="grid-2">
        <div className="field"><label htmlFor="cr-title">Tên bài</label><input id="cr-title" value={r.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field"><label htmlFor="cr-dur">Thời lượng (phút)</label><input id="cr-dur" type="number" min="1" value={r.durationMin} onChange={(e) => set('durationMin', e.target.value)} /></div>
      </div>
      <section className="la-block"><strong className="small">Đề bài</strong><ol className="small">{cd.instructions.map((s, i) => <li key={i}>{s.replace(/`/g, '')}</li>)}</ol></section>
      <details className="panel"><summary className="small strong">Code khởi đầu · {cd.fileName}</summary><pre className="la-code"><code>{cd.starter}</code></pre></details>
      <details className="panel"><summary className="small strong">Lời giải mẫu</summary><pre className="la-code"><code>{cd.solution}</code></pre></details>
      <section className="la-block"><strong className="small">{cd.tests.length} test · {cd.tests.filter((t) => t.hidden).length} test ẩn</strong>
        <div className="table-wrap"><table className="table"><caption className="sr-only">Test do AI soạn</caption>
          <thead><tr><th>Test</th><th>Biểu thức</th><th>Mong đợi</th></tr></thead>
          <tbody>{cd.tests.map((t) => (
            <tr key={t.id}><th scope="row"><span className="small">{t.name}</span>{t.hidden ? <> <span className="badge">Ẩn</span></> : null}</th>
              <td className="mono xsmall">{t.call}</td><td className="mono xsmall">{t.expected === null ? '—' : JSON.stringify(t.expected)}</td></tr>
          ))}</tbody>
        </table></div></section>
      <section className="la-block"><strong className="small">Gợi ý mở dần</strong><ol className="small">{cd.hints.map((h, i) => <li key={i}>{h.replace(/`/g, '')}</li>)}</ol></section>
    </div>
  );
}

function CreateBody() {
  if (!cr || !course()) return null;
  if (cr.step === 'review') return cr.kind === 'code' ? <CodeReview /> : <LessonReview />;
  return <FormBody />;
}
function CreateFooter() {
  if (!cr) return null;
  if (cr.step === 'review') {
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={() => { cr.step = 'form'; refresh(); }}>Sửa yêu cầu</button>
        <button type="button" className="btn btn-secondary" onClick={generate}>Tạo lại</button>
        <button type="button" className="btn btn-primary" onClick={apply}>{cr.kind === 'code' ? 'Thêm và mở trình soạn' : 'Thêm vào khoá học'}</button>
      </>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-ghost" data-close="">Huỷ</button>
      <button type="button" className="btn btn-primary" disabled={cr.step === 'generating'} onClick={generate}><Icon name="sparkles" className="icon-sm" /> Tạo bản nháp</button>
    </>
  );
}

function stop() { if (job) job.stop(); cr.step = 'form'; refresh(); Codi.ui.toast('Đã dừng tạo bản nháp.'); }
function generate() {
  const cur = cr; const c = course(); const f = cur.form;
  if (!f.topic.trim()) {
    cur.err = cur.kind === 'code' ? 'Nhập kỹ năng bài code cần luyện.' : 'Nhập chủ đề bài giảng.';
    refresh();
    const t = document.getElementById('cr-topic'); if (t) t.focus();
    return;
  }
  cur.err = null;
  const kind = cur.kind;
  job = AI().task({
    onLimit() { cur.step = 'limit'; refresh(); },
    onStart() { cur.step = 'generating'; refresh(); },
    onError() { cur.step = 'error'; refresh(); },
    onDone(res) { if (cr !== cur) return; cur.result = res; cur.step = 'review'; refresh(); },
  }, () => (kind === 'code' ? codeDraft(c, f) : lessonDraft(c, f)), 1500);
}
function apply() {
  const c = course(); const r = cr.result; const kind = cr.kind; const chapterId = cr.form.chapterId;
  const id = 'lesson-' + Date.now().toString(36);
  let l; let ch;
  Codi.set(() => {
    if (!c.chapters.length) c.chapters.push({ id: c.id + '-ch' + Date.now().toString(36), title: 'Chương 1', lessons: [] });
    ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[c.chapters.length - 1];
    if (kind === 'code') {
      l = { id, title: String(r.title).trim() || 'Bài code mới', type: 'code', durationMin: Math.max(1, Number(r.durationMin) || 20), conceptIds: [], reading: '', quiz: null, assignment: null, code: r.code, aiDraft: true };
    } else {
      const qs = r.questions.filter((q) => q.state === 'accepted').map((q) => { const o = { ...q, aiReviewed: true }; delete o.state; return o; });
      l = { id, title: String(r.lesson.title).trim() || 'Bài học mới', type: r.lesson.type, durationMin: Math.max(1, Number(r.lesson.durationMin) || 10), conceptIds: [], reading: r.lesson.reading, quiz: qs.length ? { id: id + '-quiz', passingScore: 70, questions: qs } : null, assignment: null, aiDraft: true };
    }
    ch.lessons.push(l);
    if (Codi.teach && Codi.teach.contentChanged) Codi.teach.contentChanged(c);
  });
  handle.close();
  if (kind === 'code') { Codi.go(`/teach/courses/${c.id}/code/${id}`); Codi.ui.toast('Đã thêm bài code do AI soạn. Kiểm tra đề, test rồi bấm "Lưu bài".', { type: 'success' }); }
  else { Codi.go(`/teach/courses/${c.id}/content?lesson=${id}`); Codi.ui.toast(`Đã thêm bài "${l.title}" vào ${ch.title}.${l.type !== 'reading' ? ' Nhớ tải tệp lên cho bài này.' : ''}`, { type: 'success' }); }
}

function openCreate(courseId, kind, chapterId) {
  const c = Codi.course(courseId);
  if (!c) { Codi.ui.toast('Không tìm thấy khoá học.', { type: 'danger' }); return; }
  if (handle) handle.close();
  cr = { courseId: c.id, kind: kind === 'code' ? 'code' : 'lesson', step: 'form', err: null, result: null,
    form: { chapterId: chapterId || (c.chapters.length ? c.chapters[c.chapters.length - 1].id : ''), topic: '', goal: '', length: 'medium', quiz: true, difficulty: 'medium', lessonType: 'reading' } };
  handle = Codi.ui.sheet({
    title: 'Tạo bằng AI', wide: true,
    body: () => <CreateBody />,
    footer: () => <CreateFooter />,
    onClose: () => { if (job) job.stop(); cr = null; handle = null; },
  });
}

Codi.lecturerAI.openCreate = openCreate;
