/**
 * Codi.lecturerAI — AI helpers for lecturer authoring and grading (simulated, deterministic).
 * Port of docs/mockup/js/lecturer-ai.js (+ openCreate from lecturer-ai-create.js, installed by ./lecturer-ai-create.jsx),
 * aligned with the real app where it has the feature (quiz review gate, boundary-test suggestions).
 *
 * Rules: nothing the AI produces reaches learners until the lecturer accepts it; every step has
 * in-progress / success / failure states; failures follow the aiAssistant scenario flag
 * (thinking = stays until "Dừng", error, ratelimit). Scanned PDFs (file name contains "scan") fail extraction.
 *
 * Public API (Codi.lecturerAI) — this file:
 *   openImport(courseId, lessonId, { onApplied }?) → void   side sheet: upload → extract → choose outputs → generate
 *                                                            → review (real accept/discard gate) → apply
 *   generateQuestions(course, lesson, { count, difficulty }) → question[] (aiGenerated, aiReviewed:false, 4 options)
 *   suggestRubric(instructions, maxScore) → rubric[] ({ id, name, points, desc })
 *   suggestTests(code) → Promise<test[]>   real generateAiCodingTestCases: function name from the solution
 *                        (fallback "solution"), candidates f([]) f(0) f("") f(-1) f([1, 2, 3]) f(null) minus existing
 *                        calls, first 3 run with the solution, keep the ones that return. Each test:
 *                        { id, name: "Trường hợp biên: <call>", call, expectedText, step: 0, hidden: true, isSample: false, ok: true }
 *                        Throws when the solution is empty.
 *   gradeSuggestion(submission, assignment) → { scores: { [criterionId]: points }, feedback }   (legacy sync helper)
 *   task({ onStart, onDone, onError, onLimit }, produce, ms?) → { stop() }   scenario-aware async runner
 *   factsFor(course, title) → fact[] topic facts ({ q, a, w[], e }) reused by the draft generator
 * Installed by sibling modules (imported below):
 *   openCreate                                                        ./lecturer-ai-create.jsx
 *   quizReview, generateQuizQuestions, validateQuestionDraft          ./quiz-ai-review.jsx
 *   runKnowledgeMapAnalysis, acceptAllPlan, acceptAll, kmapGraph      ./kmap-ai.jsx
 *   getAiGradingDraft, gradingDraft                                   ./grading-ai.jsx
 */
import { Codi } from '../../lib/codi';
import { Alert, Icon, Stepper } from '../../components/ui/primitives';
import { BANK, bankFor, genericFacts, rot } from './ai-bank';
import { QuizReviewList, toReviewItems, validateQuestionDraft } from './quiz-ai-review';
import './kmap-ai';
import './grading-ai';

const now = () => new Date().toISOString();

// ───────────────────────── scenario-aware runner ─────────────────────────
function task(h, produce, ms) {
  const flag = Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') { if (h.onLimit) h.onLimit(); return { stop() {} }; }
  if (h.onStart) h.onStart();
  if (flag === 'thinking') return { stop() {} };
  let stopped = false;
  const t = setTimeout(() => {
    if (flag === 'error') { if (h.onError) h.onError(); return; }
    Promise.resolve()
      .then(produce)
      .then((r) => { if (!stopped && h.onDone) h.onDone(r); })
      .catch((e) => { console.error('[lecturerAI.task]', e); if (!stopped && h.onError) h.onError(e); });
  }, ms || 1300);
  return { stop() { stopped = true; clearTimeout(t); } };
}

// ───────────────────────── content generators ─────────────────────────
const pickBank = (c, l) => bankFor(`${l.title} ${c.title}`);
function generateQuestions(c, l, opts) {
  const count = (opts && opts.count) || 5; const diff = (opts && opts.difficulty) || 'medium';
  const b = pickBank(c, l);
  const facts = b ? b.facts : genericFacts(l.title);
  // Always 4 distinct options with one correct answer, like the real generation contract.
  return Array.from({ length: Math.min(count, facts.length) }, (_, i) => {
    const f = facts[i];
    const options = rot([f.a].concat(f.w.slice(0, 3)), (i * 2 + 1) % 4);
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
  const hasUI = /giao diện|trang|component|ứng dụng|hiển thị/i.test(instructions || '');
  const parts = hasUI
    ? [['Chức năng đúng yêu cầu', 0.4, 'Mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.'], ['Trạng thái tải & lỗi', 0.2, 'Có trạng thái đang tải, thông báo lỗi và cách thử lại.'], ['Cấu trúc code', 0.2, 'Tách component/hàm hợp lý, đặt tên rõ.'], ['Trình bày bài nộp', 0.2, 'README giải thích cách chạy và cách làm.']]
    : [['Kết quả đúng', 0.5, 'Đúng với mọi ví dụ trong đề.'], ['Xử lý đầu vào bất thường', 0.2, 'Giá trị rỗng, âm, sai kiểu.'], ['Code dễ đọc', 0.3, 'Ngắn gọn, đặt tên rõ, không lặp.']];
  let used = 0;
  return parts.map(([name, w, desc], i) => { const pts = i === parts.length - 1 ? max - used : Math.round(max * w * 2) / 2; used += pts; return { id: Codi.uid('r'), name, points: pts, desc }; });
}
// Real generateAiCodingTestCases (deterministic, JavaScript only). Expected values come from the solution,
// so the lecturer should still check them against the brief.
async function suggestTests(code) {
  const solution = String((code && code.solution) || '');
  if (!solution.trim()) throw new Error('Cần có lời giải mẫu để chạy thử và sinh test case biên.');
  const m = /function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/.exec(solution);
  const fn = m ? m[1] : 'solution';
  const existing = new Set(((code && code.tests) || []).map((t) => String(t.call || '').replace(/\s+/g, '')));
  const calls = [`${fn}([])`, `${fn}(0)`, `${fn}("")`, `${fn}(-1)`, `${fn}([1, 2, 3])`, `${fn}(null)`]
    .filter((call) => !existing.has(call.replace(/\s+/g, '')))
    .slice(0, 3);
  if (!calls.length || !(Codi.code && Codi.code.run)) return [];
  const stamp = Date.now().toString(36);
  const probes = calls.map((call, i) => ({ id: `ai-test-${stamp}-${i}`, name: `Trường hợp biên: ${call}`, call }));
  const res = await Codi.code.run(solution, probes, { language: 'javascript' });
  const by = {}; ((res && res.results) || []).forEach((r) => { by[r.id] = r; });
  return probes
    .filter((p) => by[p.id] && by[p.id].ok && typeof by[p.id].actual === 'string')
    .map((p) => ({ ...p, expectedText: by[p.id].actual, step: 0, hidden: true, isSample: false, ok: true }));
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
// The sheet body/footer read the module state; update({}) re-evaluates them.
const refresh = () => { if (handle) handle.update({}); };
const target = () => { const c = Codi.course(imp.courseId); return { c, l: Codi.lesson(c, imp.lessonId) }; };

function ImportBody() {
  if (!imp) return null;
  const { l } = target();
  if (!l) return null;
  const step = imp.step;
  const steps = ['Tải tài liệu', 'Chọn nội dung cần tạo', 'Duyệt kết quả'];
  const at = step === 'upload' || step === 'extracting' || step === 'extract-error' ? 0 : step === 'options' || step === 'generating' || step === 'gen-error' || step === 'limit' ? 1 : 2;
  return (
    <div className="stack-4 la">
      <p className="small muted">Bài: <strong>{l.title}</strong>. AI chỉ tạo bản nháp — chỉ những mục bạn chấp nhận mới được thêm vào bài.</p>
      <Stepper steps={steps} current={at} />
      {step === 'upload' && (
        <div className="la-drop">
          <Icon name="upload" className="icon-lg" /><strong>Tải lên tài liệu hoặc slide</strong><span className="small muted">PDF, PPTX hoặc DOCX, tối đa 50MB. Tệp PDF dạng ảnh chụp không đọc được chữ.</span>
          <label className="btn btn-primary" htmlFor="la-file">Chọn tệp</label>
          <input id="la-file" className="sr-only" type="file" accept=".pdf,.pptx,.ppt,.docx" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) extract(f); }} />
          {l.material && l.material.fileName
            ? <button type="button" className="btn btn-secondary" onClick={pickSample}>Dùng tài liệu đã có: {l.material.fileName}</button>
            : <button type="button" className="btn btn-ghost" onClick={pickSample}>Dùng tài liệu mẫu</button>}
        </div>
      )}
      {step === 'extracting' && (
        <div className="la-progress" role="status"><div className="progress"><span style={{ width: imp.pct + '%' }} /></div><span className="small">Đang đọc {imp.file.name}… {imp.pct}%</span></div>
      )}
      {step === 'extract-error' && (
        <Alert type="danger" title="Không đọc được chữ trong tệp" body={`${imp.file.name} có vẻ là PDF dạng ảnh chụp. Hãy tải bản PDF có chữ hoặc tệp PPTX/DOCX.`}
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={restart}>Chọn tệp khác</button>} />
      )}
      {['options', 'generating', 'gen-error', 'limit'].includes(step) && (
        <>
          <div className="la-file"><Icon name="file-text" className="icon-sm" /><span className="small"><strong>{imp.file.name}</strong> · đã đọc {imp.file.pages} trang · {imp.outline.length} mục</span><button type="button" className="btn btn-ghost btn-sm" onClick={restart}>Đổi tệp</button></div>
          <details className="panel"><summary className="small strong">Các mục AI đọc được</summary><ol className="small" style={{ marginTop: 8 }}>{imp.outline.map((x, i) => <li key={i}>{x}</li>)}</ol></details>
          <fieldset className="stack-2" disabled={step === 'generating'}><legend className="small"><strong>Tạo bằng AI</strong></legend>
            {Object.keys(OUT).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={!!imp.opts[k]} onChange={(e) => { imp.opts[k] = e.target.checked; refresh(); }} /> {OUT[k]}
                {k === 'summary' && l.reading ? <> <span className="xsmall muted">(sẽ thay bài đọc hiện tại)</span></> : null}
              </label>
            ))}
            {imp.opts.quiz && (
              <div className="grid-2">
                <div className="field"><label htmlFor="la-count">Số câu</label>
                  <select id="la-count" value={String(imp.opts.count)} onChange={(e) => { imp.opts.count = Number(e.target.value); refresh(); }}>{[3, 5, 8].map((n) => <option key={n} value={String(n)}>{n}</option>)}</select></div>
                <div className="field"><label htmlFor="la-diff">Độ khó</label>
                  <select id="la-diff" value={imp.opts.difficulty} onChange={(e) => { imp.opts.difficulty = e.target.value; refresh(); }}>{[['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              </div>
            )}
          </fieldset>
          {step === 'generating' && (
            <div className="ai-thinking-row" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>AI đang tạo từ {imp.file.pages} trang tài liệu…</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={stop}><Icon name="x" className="icon-sm" /> Dừng</button></div>
          )}
          {step === 'gen-error' && (
            <Alert type="danger" title="AI chưa tạo được nội dung" body="Tài liệu vẫn được giữ. Thử lại hoặc soạn thủ công."
              actions={<button type="button" className="btn btn-secondary btn-sm" onClick={generate}>Thử lại</button>} />
          )}
          {step === 'limit' && <Alert type="warn" title="Đã dùng hết lượt tạo bằng AI trong giờ này" body="Thử lại sau ít phút hoặc soạn thủ công." />}
        </>
      )}
      {step === 'review' && <ReviewBody />}
    </div>
  );
}

function ReviewBody() {
  const r = imp.result;
  const setSummary = (state) => { r.summary.state = state; refresh(); };
  return (
    <div className="stack-4">
      {r.summary && (
        <section className="la-block">
          <div className="row-between"><strong className="small">Tóm tắt bài đọc</strong>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className={`btn btn-sm ${r.summary.state === 'accepted' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={r.summary.state === 'accepted'} onClick={() => setSummary('accepted')}>Chấp nhận</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={r.summary.state === 'discarded'} onClick={() => setSummary('discarded')}>Bỏ</button>
            </span></div>
          <label className="sr-only" htmlFor="la-sum">Tóm tắt</label>
          <textarea id="la-sum" rows={7} value={r.summary.text} onChange={(e) => { r.summary.text = e.target.value; refresh(); }} />
        </section>
      )}
      {r.items.length > 0 && (
        <section className="la-block">
          <strong className="small">Câu hỏi quiz</strong>
          <QuizReviewList items={r.items} setItems={(fn) => { r.items = fn(r.items); refresh(); }} />
        </section>
      )}
      {r.concepts.length > 0 && (
        <section className="la-block"><strong className="small">Khái niệm đề xuất</strong><p className="xsmall muted">Được thêm vào Bản đồ kiến thức ở trạng thái "đề xuất" để bạn xem lại.</p>
          <div className="ai-chips">{r.concepts.map((k, i) => (
            <button key={i} type="button" className="ai-chip" aria-pressed={k.state === 'accepted'} onClick={() => { k.state = k.state === 'accepted' ? 'pending' : 'accepted'; refresh(); }}>
              {k.state === 'accepted' ? <Icon name="check" className="icon-sm" /> : null}{k.name}
            </button>
          ))}</div>
        </section>
      )}
    </div>
  );
}

const acceptedItems = (r) => r.items.filter((it) => it.state === 'accepted' && !validateQuestionDraft(it.question).length);
const acceptedCount = () => { const r = imp && imp.result; if (!r) return 0; return (r.summary && r.summary.state === 'accepted' ? 1 : 0) + acceptedItems(r).length + r.concepts.filter((k) => k.state === 'accepted').length; };
function ImportFooter() {
  if (!imp) return null;
  if (imp.step !== 'review') {
    const can = imp.step === 'options' && Object.keys(OUT).some((k) => imp.opts[k]);
    return (
      <>
        <button type="button" className="btn btn-ghost" data-close="">Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!can} onClick={generate}><Icon name="sparkles" className="icon-sm" /> Tạo bằng AI</button>
      </>
    );
  }
  const n = acceptedCount();
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => { imp.step = 'options'; refresh(); }}>Quay lại</button>
      <button type="button" className="btn btn-primary" disabled={!n} onClick={apply}>Thêm vào bài học ({n} mục)</button>
    </>
  );
}

function extract(file) {
  const cur = imp;
  cur.file = { name: file.name, size: file.size || 0, pages: 0 }; cur.step = 'extracting'; cur.pct = 0; refresh();
  const fail = /scan|anh-chup|chup/i.test(file.name);
  const t = setInterval(() => {
    if (imp !== cur || cur.step !== 'extracting') { clearInterval(t); return; }
    cur.pct = Math.min(100, cur.pct + 25);
    if (fail && cur.pct >= 50) { clearInterval(t); cur.step = 'extract-error'; refresh(); return; }
    if (cur.pct >= 100) {
      clearInterval(t);
      const { c, l } = target(); const b = pickBank(c, l);
      cur.file.pages = 8 + (file.name.length % 17);
      cur.outline = (b ? b.facts.map((f) => f.a) : ['Giới thiệu', 'Khái niệm chính', 'Ví dụ', 'Lỗi thường gặp']).slice(0, 6);
      cur.step = 'options';
    }
    refresh();
  }, 300);
}
function pickSample() {
  const { c, l } = target();
  extract({ name: (l.material && l.material.fileName) || `${c.slug}-${l.id}.pdf`, size: 1 });
}
function restart() { imp.step = 'upload'; refresh(); }
function stop() { if (job) job.stop(); imp.step = 'options'; refresh(); Codi.ui.toast('Đã dừng tạo nội dung.'); }
function generate() {
  const cur = imp; const { c, l } = target();
  job = task({
    onLimit() { cur.step = 'limit'; refresh(); },
    onStart() { cur.step = 'generating'; refresh(); },
    onError() { cur.step = 'gen-error'; refresh(); },
    onDone(res) { if (imp !== cur) return; cur.result = res; cur.step = 'review'; refresh(); },
  }, () => ({
    summary: cur.opts.summary ? { text: summaryFor(c, l, cur.file.name), state: 'pending' } : null,
    items: cur.opts.quiz ? toReviewItems(generateQuestions(c, l, cur.opts)) : [],
    concepts: cur.opts.concepts ? conceptsFor(c, l) : [],
  }), 1600);
}
function apply() {
  const { c, l } = target(); const r = imp.result; const file = imp.file;
  let n = 0;
  Codi.set((s) => {
    l.material = { fileName: file.name, kind: (file.name.split('.').pop() || 'pdf').toLowerCase(), pages: file.pages };
    if (r.summary && r.summary.state === 'accepted') { l.reading = r.summary.text; n += 1; }
    const qs = acceptedItems(r).map((it) => ({ ...it.question, aiGenerated: true, aiReviewed: true }));
    if (qs.length) { if (!l.quiz) l.quiz = { id: l.id + '-quiz', passingScore: 70, questions: [] }; l.quiz.questions.push(...qs); n += qs.length; }
    const ks = r.concepts.filter((k) => k.state === 'accepted');
    if (ks.length) {
      const db = s.db; if (!db.knowledgeMaps) db.knowledgeMaps = {};
      const m = db.knowledgeMaps[c.id] || (db.knowledgeMaps[c.id] = { status: 'ready', updatedAt: now(), concepts: [], edges: [] });
      ks.forEach((k) => { if (!m.concepts.some((x) => x.name === k.name)) m.concepts.push({ id: Codi.uid('k'), name: k.name, lessonIds: [l.id], review: 'suggested' }); });
      if (m.status === 'confirmed') m.status = 'ready'; n += ks.length;
    }
    if (Codi.teach && Codi.teach.contentChanged) Codi.teach.contentChanged(c);
  });
  const done = imp.onApplied;
  handle.close();
  if (done) done();
  Codi.ui.toast(`Đã thêm ${n} mục vào bài “${l.title}”.`, { type: 'success' });
}

function openImport(courseId, lessonId, opts) {
  if (handle) handle.close();
  imp = { courseId, lessonId, onApplied: opts && opts.onApplied, step: 'upload', opts: { summary: true, quiz: true, concepts: true, count: 5, difficulty: 'medium' }, outline: [], result: null };
  handle = Codi.ui.sheet({
    title: 'Tạo nội dung từ tài liệu', wide: true,
    body: () => <ImportBody />,
    footer: () => <ImportFooter />,
    onClose: () => { if (job) job.stop(); imp = null; handle = null; },
  });
}

// Topic facts reused by the lesson/code draft generator (lecturer-ai-create.jsx).
const factsFor = (c, title) => { const b = pickBank(c, { title }); return b ? b.facts : []; };

Object.assign(Codi, {
  lecturerAI: { ...(Codi.lecturerAI || {}), openImport, generateQuestions, suggestRubric, suggestTests, gradeSuggestion, task, factsFor },
});
