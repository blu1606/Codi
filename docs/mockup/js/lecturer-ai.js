/**
 * lecturer-ai.js — AI helpers for lecturer authoring and grading (simulated, deterministic).
 * Refs: Gemini Notebook (add sources → generate quiz), Asana (upload file → "Continue with AI"), SchoolAI quiz doc.
 *
 * Rules: nothing the AI produces reaches learners until the lecturer accepts it; every step has
 * in-progress / success / failure states; failures follow the aiAssistant scenario flag
 * (thinking = stays until "Dừng", error, ratelimit). Scanned PDFs (file name contains "scan") fail extraction.
 *
 * API (Codi.lecturerAI):
 *   openImport(courseId, lessonId)        side sheet: upload → extract → choose outputs → generate → review → apply
 *   generateQuestions(course, lesson, {count, difficulty}) → questions (aiGenerated)
 *   suggestRubric(instructions, maxScore) → rubric[]
 *   suggestTests(code) → Promise<tests[]> with expectedText computed by running the solution (editor draft shape)
 *   gradeSuggestion(submission, assignment) → {scores:{criterionId: points}, feedback}
 *   task(handlers, produce, ms)           scenario-aware async runner used by the screens
 */
(function () {
  'use strict';
  const { html, icon, ui } = Codi;
  const persist = (render) => Codi.set(() => {}, { render: render !== false });
  const now = () => new Date().toISOString();

  // ───────────────────────── scenario-aware runner ─────────────────────────
  function task(h, produce, ms) {
    const flag = Codi.state.scenario.aiAssistant;
    if (flag === 'ratelimit') { h.onLimit && h.onLimit(); return { stop() {} }; }
    h.onStart && h.onStart();
    if (flag === 'thinking') return { stop() {} };
    const t = setTimeout(() => {
      if (flag === 'error') { h.onError && h.onError(); return; }
      Promise.resolve(produce()).then((r) => h.onDone && h.onDone(r));
    }, ms || 1300);
    return { stop() { clearTimeout(t); } };
  }

  // ───────────────────────── content generators ─────────────────────────
  // Small fact banks by topic; each fact becomes one multiple-choice question.
  const BANK = [
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
  const pickBank = (c, l) => (BANK.find((b) => b.k.test(`${l.title} ${c.title}`)) || null);
  // Stable shuffle so the correct answer is not always first.
  const rot = (arr, n) => arr.slice(n % arr.length).concat(arr.slice(0, n % arr.length));
  function generateQuestions(c, l, opts) {
    const count = opts.count || 5; const diff = opts.difficulty || 'medium';
    const b = pickBank(c, l);
    const facts = b ? b.facts : [
      { q: `Mục tiêu chính của bài “${l.title}” là gì?`, a: `Hiểu và áp dụng được nội dung “${l.title}”`, w: ['Học thuộc định nghĩa', 'Cài đặt phần mềm', 'Không có mục tiêu cụ thể'], e: 'Câu hỏi khởi động — nên sửa cho sát nội dung tài liệu.' },
      { q: `Khi áp dụng “${l.title}”, lỗi hay gặp nhất là gì?`, a: 'Bỏ qua trường hợp biên', w: ['Viết quá nhiều chú thích', 'Đặt tên quá dài', 'Dùng quá ít biến'], e: 'Nên thay bằng lỗi cụ thể trong tài liệu.' },
    ];
    return Array.from({ length: Math.min(count, facts.length) }, (_, i) => {
      const f = facts[i];
      const wrong = diff === 'easy' ? f.w.slice(0, 2) : f.w;
      const shift = (i * 2 + 1) % (wrong.length + 1);
      const options = rot([f.a].concat(wrong), shift);
      return { id: Codi.uid('q'), conceptId: (l.conceptIds || [])[0] || null, text: f.q, options, correctIndex: options.indexOf(f.a), explanation: f.e, aiGenerated: true, aiReviewed: false, difficulty: diff };
    });
  }
  function summaryFor(c, l, fileName) {
    const b = pickBank(c, l);
    const points = b ? b.facts.slice(0, 4).map((f) => `- ${f.a}: ${f.e}`) : [`- Khái niệm chính của bài “${l.title}”`, '- Ví dụ minh hoạ và cách áp dụng', '- Lỗi thường gặp và cách tránh'];
    return `## Tóm tắt: ${l.title}\n\nTóm tắt từ tài liệu ${fileName}.\n\n${points.join('\n')}\n\nSau bài này, học viên làm được các ý trên và tự kiểm tra bằng quiz cuối bài.`;
  }
  function conceptsFor(c, l) {
    const b = pickBank(c, l);
    const base = b === BANK[0] ? ['Server Component', 'Client Component', 'Cache dữ liệu'] : b === BANK[1] ? ['JSX', 'State bất biến', 'Effect'] : b === BANK[2] ? ['Hàm', 'Mảng', 'Bất đồng bộ'] : [l.title];
    return base.map((name) => ({ name, state: 'pending' }));
  }
  function suggestRubric(instructions, maxScore) {
    const max = Number(maxScore) || 10;
    const hasUI = /giao diện|trang|component|ứng dụng|hiển thị/i.test(instructions);
    const parts = hasUI
      ? [['Chức năng đúng yêu cầu', 0.4, 'Mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.'], ['Trạng thái tải & lỗi', 0.2, 'Có trạng thái đang tải, thông báo lỗi và cách thử lại.'], ['Cấu trúc code', 0.2, 'Tách component/hàm hợp lý, đặt tên rõ.'], ['Trình bày bài nộp', 0.2, 'README giải thích cách chạy và cách làm.']]
      : [['Kết quả đúng', 0.5, 'Đúng với mọi ví dụ trong đề.'], ['Xử lý đầu vào bất thường', 0.2, 'Giá trị rỗng, âm, sai kiểu.'], ['Code dễ đọc', 0.3, 'Ngắn gọn, đặt tên rõ, không lặp.']];
    let used = 0;
    return parts.map(([name, w, desc], i) => { const pts = i === parts.length - 1 ? max - used : Math.round(max * w * 2) / 2; used += pts; return { id: Codi.uid('r'), name, points: pts, desc }; });
  }
  // Edge-case calls derived from the first test's call shape; expected values come from the solution.
  async function suggestTests(code) {
    const first = (code.tests || [])[0]; if (!first) return [];
    const m = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(first.call); if (!m) return [];
    const fn = m[1]; const isArr = /\(\s*\[/.test(first.call);
    const cands = isArr
      ? [{ name: 'mảng rỗng', call: `${fn}([])` }, { name: 'một phần tử', call: first.call.replace(/\[\s*(.+?)\s*(,\s*\{|,\s*\d|\])/, (s, a) => `[${a}]`) }, { name: 'gọi hai lần cho cùng kết quả', call: `(() => { const a = ${first.call}; const b = ${first.call}; return JSON.stringify(a) === JSON.stringify(b); })()` }]
      : [{ name: 'giá trị 0', call: `${fn}(0)` }, { name: 'số âm', call: `${fn}(-1)` }, { name: 'chuỗi rỗng', call: `${fn}("")` }];
    const existing = new Set(code.tests.map((t) => t.call.replace(/\s/g, '')));
    const fresh = cands.filter((t) => !existing.has(t.call.replace(/\s/g, '')));
    const tests = fresh.map((t, i) => ({ id: 'ai-t' + Date.now().toString(36) + i, name: t.name, call: t.call, expectedText: '', step: first.step || 0, hidden: i > 0 }));
    // Python is simulated, so expected values cannot be computed — the lecturer fills them in.
    if (code.language === 'python') return tests.map((t) => Object.assign(t, { ok: false, error: 'Python đang mô phỏng — hãy tự nhập giá trị mong đợi.' }));
    const res = await Codi.code.run(code.solution, tests, { language: code.language });
    const by = {}; (res.results || []).forEach((r) => { by[r.id] = r; });
    // actual is already stable JSON text, which is exactly what the test editor stores
    return tests.map((t) => { const r = by[t.id]; return Object.assign(t, r && r.ok ? { expectedText: r.actual, ok: true } : { ok: false, error: (r && r.error) || res.error || 'Lời giải báo lỗi với đầu vào này' }); });
  }
  function gradeSuggestion(sub, a) {
    const strong = (sub.link ? 1 : 0) + (sub.fileName ? 1 : 0) + ((sub.note || '').length > 20 ? 1 : 0);
    const scores = {};
    (a.rubric || []).forEach((k, i) => { const ratio = [0.9, 0.75, 0.8, 0.6][i % 4] - (strong ? 0 : 0.2); scores[k.id] = Math.max(0, Math.round(k.points * ratio * 2) / 2); });
    const weakest = (a.rubric || []).slice().sort((x, y) => scores[x.id] / x.points - scores[y.id] / y.points)[0];
    const feedback = `Bài làm đáp ứng phần lớn yêu cầu${sub.note ? ', ghi chú của bạn giúp mình hiểu cách làm' : ''}. Điểm cần cải thiện nhất: ${weakest ? weakest.name.toLowerCase() + ' — ' + weakest.desc.toLowerCase() : 'trình bày bài nộp'}. Gợi ý: kiểm tra lại các trường hợp biên trước khi nộp lần sau.`;
    return { scores, feedback };
  }

  // ───────────────────────── import sheet ─────────────────────────
  let imp = null; let handle = null; let job = null;
  const OUT = { summary: 'Tóm tắt bài đọc', quiz: 'Câu hỏi quiz', concepts: 'Khái niệm của bài' };
  function body() {
    const c = Codi.course(imp.courseId); const l = Codi.lesson(c, imp.lessonId);
    const step = imp.step;
    const steps = ['Tải tài liệu', 'Chọn nội dung cần tạo', 'Duyệt kết quả'];
    const at = step === 'upload' || step === 'extracting' || step === 'extract-error' ? 0 : step === 'options' || step === 'generating' || step === 'gen-error' || step === 'limit' ? 1 : 2;
    return html`<div class="stack-4 la">
      <p class="small muted">Bài: <strong>${l.title}</strong>. AI chỉ tạo bản nháp — chỉ những mục bạn chấp nhận mới được thêm vào bài.</p>
      ${ui.stepper ? ui.stepper(steps, at) : ''}
      ${step === 'upload' ? html`<div class="la-drop">
          ${icon('upload', { cls: 'icon-lg' })}<strong>Tải lên tài liệu hoặc slide</strong><span class="small muted">PDF, PPTX hoặc DOCX, tối đa 50MB. Tệp PDF dạng ảnh chụp không đọc được chữ.</span>
          <label class="btn btn-primary" for="la-file">Chọn tệp</label><input id="la-file" class="sr-only" type="file" accept=".pdf,.pptx,.ppt,.docx" data-la-file>
          ${l.material && l.material.fileName ? html`<button type="button" class="btn btn-secondary" data-la-sample>Dùng tài liệu đã có: ${l.material.fileName}</button>` : html`<button type="button" class="btn btn-ghost" data-la-sample>Dùng tài liệu mẫu</button>`}</div>` : ''}
      ${step === 'extracting' ? html`<div class="la-progress" role="status"><div class="progress"><span style="width:${imp.pct}%"></span></div><span class="small">Đang đọc ${imp.file.name}… ${imp.pct}%</span></div>` : ''}
      ${step === 'extract-error' ? ui.alert({ type: 'danger', title: 'Không đọc được chữ trong tệp', body: `${imp.file.name} có vẻ là PDF dạng ảnh chụp. Hãy tải bản PDF có chữ hoặc tệp PPTX/DOCX.`, actions: html`<button type="button" class="btn btn-secondary btn-sm" data-la-restart>Chọn tệp khác</button>` }) : ''}
      ${['options', 'generating', 'gen-error', 'limit'].includes(step) ? html`
        <div class="la-file">${icon('file-text', { cls: 'icon-sm' })}<span class="small"><strong>${imp.file.name}</strong> · đã đọc ${imp.file.pages} trang · ${imp.outline.length} mục</span><button type="button" class="btn btn-ghost btn-sm" data-la-restart>Đổi tệp</button></div>
        <details class="panel"><summary class="small strong">Các mục AI đọc được</summary><ol class="small" style="margin-top:8px">${imp.outline.map((x) => html`<li>${x}</li>`)}</ol></details>
        <fieldset class="stack-2" ${step === 'generating' ? Codi.raw('disabled') : ''}><legend class="small"><strong>Tạo bằng AI</strong></legend>
          ${Object.keys(OUT).map((k) => html`<label class="check"><input type="checkbox" data-la-opt="${k}" ${imp.opts[k] ? Codi.raw('checked') : ''}> ${OUT[k]}${k === 'summary' && l.reading ? html` <span class="xsmall muted">(sẽ thay bài đọc hiện tại)</span>` : ''}</label>`)}
          ${imp.opts.quiz ? html`<div class="grid-2"><div class="field"><label for="la-count">Số câu</label><select id="la-count" data-la-num="count">${[3, 5, 8].map((n) => html`<option ${imp.opts.count === n ? Codi.raw('selected') : ''}>${n}</option>`)}</select></div>
            <div class="field"><label for="la-diff">Độ khó</label><select id="la-diff" data-la-set="difficulty">${[['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']].map(([v, t]) => html`<option value="${v}" ${imp.opts.difficulty === v ? Codi.raw('selected') : ''}>${t}</option>`)}</select></div></div>` : ''}
        </fieldset>
        ${step === 'generating' ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang tạo từ ${imp.file.pages} trang tài liệu…</span><button type="button" class="btn btn-ghost btn-sm" data-la-stop>${icon('x', { cls: 'icon-sm' })} Dừng</button></div>` : ''}
        ${step === 'gen-error' ? ui.alert({ type: 'danger', title: 'AI chưa tạo được nội dung', body: 'Tài liệu vẫn được giữ. Thử lại hoặc soạn thủ công.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-la-generate>Thử lại</button>` }) : ''}
        ${step === 'limit' ? ui.alert({ type: 'warn', title: 'Đã dùng hết lượt tạo bằng AI trong giờ này', body: 'Thử lại sau ít phút hoặc soạn thủ công.' }) : ''}` : ''}
      ${step === 'review' ? reviewBody() : ''}
    </div>`;
  }
  function reviewBody() {
    const r = imp.result;
    const qBlock = (q, i) => html`<li class="la-q ${q.state === 'discarded' ? 'is-off' : ''}">
      <div class="row-between"><strong class="small">Câu ${i + 1}</strong><span class="badge ${q.state === 'accepted' ? 'badge-success' : q.state === 'discarded' ? '' : 'badge-accent'}">${{ pending: 'Chờ duyệt', accepted: 'Đã chấp nhận', discarded: 'Đã bỏ' }[q.state]}</span></div>
      ${q.editing ? html`<label class="sr-only" for="la-qt-${i}">Câu hỏi</label><textarea id="la-qt-${i}" rows="2" data-la-q="${i}" data-f="text">${q.text}</textarea>
        ${q.options.map((o, k) => html`<div class="row" style="gap:8px"><input type="radio" name="la-c-${i}" aria-label="Đáp án đúng ${k + 1}" ${q.correctIndex === k ? Codi.raw('checked') : ''} data-la-correct="${i}" data-k="${k}"><input class="input od-fill" value="${o}" aria-label="Lựa chọn ${k + 1}" data-la-q="${i}" data-f="opt" data-k="${k}"></div>`)}
        <label class="sr-only" for="la-qe-${i}">Giải thích</label><textarea id="la-qe-${i}" rows="2" data-la-q="${i}" data-f="explanation">${q.explanation}</textarea>`
      : html`<p class="small">${q.text}</p><ul class="rv-opts">${q.options.map((o, k) => html`<li class="${k === q.correctIndex ? 'is-correct' : ''}">${k === q.correctIndex ? icon('check-circle', { cls: 'icon-sm' }) : html`<span class="rv-opt-dot" aria-hidden="true"></span>`}<span>${o}</span></li>`)}</ul><p class="xsmall muted">Giải thích: ${q.explanation}</p>`}
      <div class="row" style="gap:8px"><button type="button" class="btn btn-primary btn-sm" data-la-q-state="${i}" data-v="accepted">Chấp nhận</button><button type="button" class="btn btn-secondary btn-sm" data-la-q-edit="${i}">${q.editing ? 'Xong' : 'Sửa'}</button><button type="button" class="btn btn-ghost btn-sm" data-la-q-state="${i}" data-v="discarded">Bỏ</button></div></li>`;
    return html`<div class="stack-4">
      ${r.summary ? html`<section class="la-block"><div class="row-between"><strong class="small">Tóm tắt bài đọc</strong><span class="row" style="gap:8px"><button type="button" class="btn btn-sm ${r.summary.state === 'accepted' ? 'btn-primary' : 'btn-secondary'}" data-la-sum="accepted" aria-pressed="${String(r.summary.state === 'accepted')}">Chấp nhận</button><button type="button" class="btn btn-ghost btn-sm" data-la-sum="discarded" aria-pressed="${String(r.summary.state === 'discarded')}">Bỏ</button></span></div>
        <label class="sr-only" for="la-sum">Tóm tắt</label><textarea id="la-sum" rows="7" data-la-sum-text>${r.summary.text}</textarea></section>` : ''}
      ${r.questions.length ? html`<section class="la-block"><div class="row-between"><strong class="small">${r.questions.length} câu hỏi · ${r.questions.filter((q) => q.state === 'accepted').length} đã chấp nhận</strong><button type="button" class="btn btn-secondary btn-sm" data-la-accept-all>Chấp nhận tất cả</button></div>
        <ol class="la-qs">${r.questions.map(qBlock)}</ol></section>` : ''}
      ${r.concepts.length ? html`<section class="la-block"><strong class="small">Khái niệm đề xuất</strong><p class="xsmall muted">Được thêm vào Bản đồ kiến thức ở trạng thái "đề xuất" để bạn xem lại.</p>
        <div class="ai-chips">${r.concepts.map((k, i) => html`<button type="button" class="ai-chip" aria-pressed="${String(k.state === 'accepted')}" data-la-concept="${i}">${k.state === 'accepted' ? icon('check', { cls: 'icon-sm' }) : ''}${k.name}</button>`)}</div></section>` : ''}
    </div>`;
  }
  const acceptedCount = () => { const r = imp.result; if (!r) return 0; return (r.summary && r.summary.state === 'accepted' ? 1 : 0) + r.questions.filter((q) => q.state === 'accepted').length + r.concepts.filter((k) => k.state === 'accepted').length; };
  function footer() {
    if (imp.step !== 'review') return html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-la-generate ${imp.step === 'options' && Object.keys(OUT).some((k) => imp.opts[k]) ? '' : Codi.raw('disabled')}>${icon('sparkles', { cls: 'icon-sm' })} Tạo bằng AI</button>`;
    const n = acceptedCount();
    return html`<button class="btn btn-ghost" data-la-back>Quay lại</button><button class="btn btn-primary" data-la-apply ${n ? '' : Codi.raw('disabled')}>Thêm vào bài học (${n} mục)</button>`;
  }
  const refresh = () => { if (handle) { handle.setBody(body()); handle.setFooter(footer()); } };

  function extract(file) {
    imp.file = { name: file.name, size: file.size || 0, pages: 0 }; imp.step = 'extracting'; imp.pct = 0; refresh();
    const fail = /scan|anh-chup|chup/i.test(file.name);
    const t = setInterval(() => {
      if (!imp) return clearInterval(t);
      imp.pct = Math.min(100, imp.pct + 25);
      if (fail && imp.pct >= 50) { clearInterval(t); imp.step = 'extract-error'; refresh(); return; }
      if (imp.pct >= 100) {
        clearInterval(t);
        const c = Codi.course(imp.courseId); const l = Codi.lesson(c, imp.lessonId); const b = pickBank(c, l);
        imp.file.pages = 8 + (file.name.length % 17);
        imp.outline = (b ? b.facts.map((f) => f.a) : ['Giới thiệu', 'Khái niệm chính', 'Ví dụ', 'Lỗi thường gặp']).slice(0, 6);
        imp.step = 'options';
      }
      refresh();
    }, 300);
  }
  function generate() {
    const c = Codi.course(imp.courseId); const l = Codi.lesson(c, imp.lessonId);
    job = task({
      onLimit() { imp.step = 'limit'; refresh(); },
      onStart() { imp.step = 'generating'; refresh(); },
      onError() { imp.step = 'gen-error'; refresh(); },
      onDone(res) { imp.result = res; imp.step = 'review'; refresh(); },
    }, () => ({
      summary: imp.opts.summary ? { text: summaryFor(c, l, imp.file.name), state: 'pending' } : null,
      questions: imp.opts.quiz ? generateQuestions(c, l, imp.opts).map((q) => Object.assign(q, { state: 'pending' })) : [],
      concepts: imp.opts.concepts ? conceptsFor(c, l) : [],
    }), 1600);
  }
  function apply() {
    const c = Codi.course(imp.courseId); const l = Codi.lesson(c, imp.lessonId); const r = imp.result;
    l.material = { fileName: imp.file.name, kind: (imp.file.name.split('.').pop() || 'pdf').toLowerCase(), pages: imp.file.pages };
    let n = 0;
    if (r.summary && r.summary.state === 'accepted') { l.reading = r.summary.text; n += 1; }
    const qs = r.questions.filter((q) => q.state === 'accepted').map((q) => { const o = Object.assign({}, q, { aiReviewed: true }); delete o.state; delete o.editing; return o; });
    if (qs.length) { if (!l.quiz) l.quiz = { id: l.id + '-quiz', passingScore: 70, questions: [] }; l.quiz.questions.push(...qs); n += qs.length; }
    const ks = r.concepts.filter((k) => k.state === 'accepted');
    if (ks.length) {
      const db = Codi.db(); const m = db.knowledgeMaps[c.id] || (db.knowledgeMaps[c.id] = { status: 'ready', updatedAt: now(), concepts: [], edges: [] });
      ks.forEach((k) => { if (!m.concepts.some((x) => x.name === k.name)) m.concepts.push({ id: Codi.uid('k'), name: k.name, lessonIds: [l.id], review: 'suggested' }); });
      if (m.status === 'confirmed') m.status = 'ready'; n += ks.length;
    }
    if (Codi.teach && Codi.teach.contentChanged) Codi.teach.contentChanged(c);
    const done = imp.onApplied;
    persist(); handle.close();
    if (done) done();
    ui.toast(`Đã thêm ${n} mục vào bài “${l.title}”.`, { type: 'success' });
  }

  function openImport(courseId, lessonId, opts) {
    imp = { courseId, lessonId, onApplied: opts && opts.onApplied, step: 'upload', opts: { summary: true, quiz: true, concepts: true, count: 5, difficulty: 'medium' }, outline: [], result: null };
    handle = ui.sheet({
      title: 'Tạo nội dung từ tài liệu', wide: true, body: body(), footer: footer(),
      onClose: () => { if (job) job.stop(); imp = null; handle = null; },
      onMount(h) {
        h.el.addEventListener('change', (e) => {
          const t = e.target;
          if (t.hasAttribute('data-la-file') && t.files[0]) extract(t.files[0]);
          if (t.dataset.laOpt) { imp.opts[t.dataset.laOpt] = t.checked; refresh(); }
          if (t.dataset.laNum) imp.opts[t.dataset.laNum] = Number(t.value);
          if (t.dataset.laSet) imp.opts[t.dataset.laSet] = t.value;
          if (t.dataset.laCorrect) imp.result.questions[t.dataset.laCorrect].correctIndex = Number(t.dataset.k);
        });
        h.el.addEventListener('input', (e) => {
          const t = e.target;
          if (t.hasAttribute('data-la-sum-text')) imp.result.summary.text = t.value;
          if (t.dataset.laQ) { const q = imp.result.questions[t.dataset.laQ]; if (t.dataset.f === 'opt') q.options[t.dataset.k] = t.value; else q[t.dataset.f] = t.value; }
        });
        h.el.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const c = Codi.course(imp.courseId); const l = Codi.lesson(c, imp.lessonId);
          if (b.hasAttribute('data-la-sample')) extract({ name: (l.material && l.material.fileName) || `${c.slug}-${l.id}.pdf`, size: 1 });
          else if (b.hasAttribute('data-la-restart')) { imp.step = 'upload'; refresh(); }
          else if (b.hasAttribute('data-la-generate')) generate();
          else if (b.hasAttribute('data-la-stop')) { if (job) job.stop(); imp.step = 'options'; refresh(); ui.toast('Đã dừng tạo nội dung.'); }
          else if (b.hasAttribute('data-la-back')) { imp.step = 'options'; refresh(); }
          else if (b.hasAttribute('data-la-apply')) apply();
          else if (b.dataset.laSum) { imp.result.summary.state = b.dataset.laSum; refresh(); }
          else if (b.dataset.laQState) { const q = imp.result.questions[b.dataset.laQState]; q.state = b.dataset.v; q.editing = false; refresh(); }
          else if (b.dataset.laQEdit) { const q = imp.result.questions[b.dataset.laQEdit]; q.editing = !q.editing; refresh(); }
          else if (b.hasAttribute('data-la-accept-all')) { imp.result.questions.forEach((q) => { if (q.state !== 'discarded') q.state = 'accepted'; q.editing = false; }); refresh(); }
          else if (b.dataset.laConcept) { const k = imp.result.concepts[b.dataset.laConcept]; k.state = k.state === 'accepted' ? 'pending' : 'accepted'; refresh(); }
        });
      },
    });
  }

  // Topic facts reused by the lesson/code draft generator (js/lecturer-ai-create.js).
  const factsFor = (c, title) => { const b = pickBank(c, { title }); return b ? b.facts : []; };
  Codi.lecturerAI = { openImport, generateQuestions, suggestRubric, suggestTests, gradeSuggestion, task, factsFor };
})();
