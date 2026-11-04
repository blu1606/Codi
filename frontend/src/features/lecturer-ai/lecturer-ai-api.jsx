/**
 * Codi.lecturerAI — AI helpers for lecturer authoring and grading (simulated, deterministic).
 * Port of docs/mockup/js/lecturer-ai.js (+ openCreate from lecturer-ai-create.js, installed by ./lecturer-ai-create.jsx),
 * aligned with the real app where it has the feature (quiz review gate, boundary-test suggestions).
 *
 * Rules: nothing the AI produces reaches learners until the lecturer accepts it; every step has
 * in-progress / success / failure states. The simulated helpers (task, generateQuestions, suggestRubric) follow the
 * aiAssistant scenario flag; the import sheet is real (backend upload, OCR / Whisper extraction, AI draft).
 *
 * Public API (Codi.lecturerAI) — this file:
 *   openImport(courseId, lessonId|null, { chapterId, upload, onApplied }?) → void   side sheet: upload → read (PDF text
 *                        + OCR, PPTX/DOCX, video Whisper + frames) → choose outputs → AI draft → review → apply (null lessonId
 *                        creates the lesson on apply)
 *   generateQuestions(course, lesson, { count, difficulty }) → question[] (aiGenerated, aiReviewed:false, 4 options)
 *   suggestRubric(instructions, maxScore) → rubric[] ({ id, name, points, desc })
 *   suggestTests(code, courseId, lessonId) → Promise<test[]>   backend generateAiCodingTestCases (boundary calls run
 *                        with the solution in the backend sandbox). Each test:
 *                        { id, name, call, expected, expectedText, step: 0, hidden: true, isSample: false, ok: true }
 *                        Throws when the solution is empty.
 *   task({ onStart, onDone, onError, onLimit }, produce, ms?) → { stop() }   scenario-aware async runner
 *   factsFor(course, title) → fact[] topic facts ({ q, a, w[], e }) reused by the draft generator
 * Installed by sibling modules (imported below):
 *   openCreate                                                        ./lecturer-ai-create.jsx
 *   quizReview, generateQuizQuestions, validateQuestionDraft          ./quiz-ai-review.jsx
 *   runKnowledgeMapAnalysis, acceptAllPlan, acceptAll, kmapGraph      ./kmap-ai.jsx
 *   getAiGradingDraft, gradingDraft, gradingBadge                     ./grading-ai.jsx (real getAiGradingDraft action)
 */
import { Codi } from '../../lib/codi';
import { Alert, Icon, Stepper } from '../../components/ui/primitives';
import { bankFor, genericFacts, rot } from './ai-bank';
import { ACCEPT, checkFile, draftLesson, fmtClock, isStoredMedia, readLessonSource, uploadLessonFile } from '../lecturer/lesson-media-api';
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
function suggestRubric(instructions, maxScore) {
  const max = Number(maxScore) || 10;
  const hasUI = /giao diện|trang|component|ứng dụng|hiển thị/i.test(instructions || '');
  const parts = hasUI
    ? [['Chức năng đúng yêu cầu', 0.4, 'Mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.'], ['Trạng thái tải & lỗi', 0.2, 'Có trạng thái đang tải, thông báo lỗi và cách thử lại.'], ['Cấu trúc code', 0.2, 'Tách component/hàm hợp lý, đặt tên rõ.'], ['Trình bày bài nộp', 0.2, 'README giải thích cách chạy và cách làm.']]
    : [['Kết quả đúng', 0.5, 'Đúng với mọi ví dụ trong đề.'], ['Xử lý đầu vào bất thường', 0.2, 'Giá trị rỗng, âm, sai kiểu.'], ['Code dễ đọc', 0.3, 'Ngắn gọn, đặt tên rõ, không lặp.']];
  let used = 0;
  return parts.map(([name, w, desc], i) => { const pts = i === parts.length - 1 ? max - used : Math.round(max * w * 2) / 2; used += pts; return { id: Codi.uid('r'), name, points: pts, desc }; });
}
async function suggestTests(code, courseId, lessonId) {
  const solution = String((code && code.solution) || '');
  if (!solution.trim()) throw new Error('Cần có lời giải mẫu để chạy thử và sinh test case biên.');
  const r = await Codi.teach.act('code', 'generateAiCodingTestCases', courseId, lessonId, {
    solutionCode: solution, instructions: (code && code.instructions) || [],
    existingTests: ((code && code.tests) || []).map((t) => ({ name: t.name, call: t.call, expected: t.expected })),
  });
  const stamp = Date.now().toString(36);
  return ((r && r.tests) || []).map((t, i) => ({ id: `ai-test-${stamp}-${i}`, name: t.name, call: t.call, expected: t.expected, expectedText: t.expectedText, step: 0, hidden: true, isSample: false, ok: true }));
}
// ───────────────────────── import sheet ─────────────────────────
// Real pipeline: upload the file (R2 + temp copy) → the backend reads it (PDF text layer + Tesseract OCR, PPTX/DOCX
// text, or video → ffmpeg + Whisper transcript + key frames) → the AI drafts a reading summary and quiz → the lecturer
// reviews (accept / edit / discard) → apply. Works on a saved lesson, or creates the lesson on apply (new mode).
let imp = null; let handle = null;
const refresh = () => { if (handle) handle.update({}); };
const target = () => { const T = Codi.teach || {}; const c = T.course ? T.course(imp.courseId) : null; const f = c && imp.lessonId && T.findLesson ? T.findLesson(c, imp.lessonId) : null; return { c, l: f ? f.l : null }; };
const isLimit = (e) => e && e.status === 429;
const abortNow = () => { if (imp && imp.ctrl) imp.ctrl.abort(); };
const READING = {
  video: 'Đang tách âm thanh, chép lời giảng (Whisper) và cắt khung hình…',
  pdf: 'Đang đọc chữ trong PDF; trang dạng ảnh được nhận dạng bằng OCR…',
  pptx: 'Đang đọc chữ và ghi chú trên từng slide…',
  docx: 'Đang đọc nội dung tài liệu…',
};
const kindOfName = (name) => (/\.(mp4|m4v|mov|webm|mkv)$/i.test(name) ? 'video' : /\.pptx$/i.test(name) ? 'pptx' : /\.docx$/i.test(name) ? 'docx' : 'pdf');

function SourceFacts({ s }) {
  const bits = s.kind === 'video'
    ? [`${fmtClock(s.durationSec || 0)}`, s.speech ? 'có lời giảng' : 'không có lời giảng', `${s.frames} khung hình`]
    : [s.pages ? `${s.pages} ${s.kind === 'pptx' ? 'slide' : 'trang'}` : null, s.ocrPages ? `${s.ocrPages} trang đọc bằng OCR` : null, `${s.chars.toLocaleString('vi-VN')} ký tự`];
  return <span className="small"><strong>{s.fileName}</strong> · {bits.filter(Boolean).join(' · ')}</span>;
}

function ImportBody() {
  if (!imp) return null;
  const { l } = target();
  if (imp.lessonId && !l) return null;
  const step = imp.step;
  const steps = ['Tải tài liệu', 'Chọn nội dung cần tạo', 'Duyệt kết quả'];
  const at = ['upload', 'uploading', 'reading', 'read-error'].includes(step) ? 0 : step === 'review' ? 2 : 1;
  const s = imp.source;
  return (
    <div className="stack-4 la">
      <p className="small muted">{l ? <>Bài: <strong>{l.title}</strong>. </> : 'AI soạn bài mới từ tài liệu của bạn. '}AI chỉ tạo bản nháp — chỉ những mục bạn chấp nhận mới được thêm vào bài.</p>
      <Stepper steps={steps} current={at} />
      {step === 'upload' && (
        <div className="la-drop">
          <Icon name="upload" className="icon-lg" /><strong>Tải lên tài liệu, slide hoặc video bài giảng</strong>
          <span className="small muted">PDF, PPTX, DOCX (tối đa 50MB) hoặc video MP4, MOV, WEBM (tối đa 500MB, dài tối đa 2 giờ). PDF dạng ảnh chụp được nhận dạng chữ bằng OCR.</span>
          <label className="btn btn-primary" htmlFor="la-file">Chọn tệp</label>
          <input id="la-file" className="sr-only" type="file" accept={ACCEPT.any} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) pickFile(f); }} />
          {(imp.stored || []).map((m) => (
            <button key={m.url} type="button" className="btn btn-secondary" onClick={() => readStored(m)}>Dùng tệp đã có: {m.title}</button>
          ))}
          {imp.pickError && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{imp.pickError}</span></p>}
        </div>
      )}
      {step === 'uploading' && (
        <div className="la-progress" role="status"><div className="progress"><span style={{ width: imp.pct + '%' }} /></div>
          <span className="small row-between">Đang tải {imp.file.name} lên… {imp.pct}%<button type="button" className="btn btn-ghost btn-sm" onClick={restart}><Icon name="x" className="icon-sm" /> Huỷ</button></span></div>
      )}
      {step === 'reading' && (
        <div className="ai-thinking-row" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span>
          <span>{READING[kindOfName(imp.file.name)]}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={restart}><Icon name="x" className="icon-sm" /> Dừng</button></div>
      )}
      {step === 'read-error' && (
        <Alert type="danger" title={imp.limit ? 'Đã dùng hết lượt tạo bằng AI trong giờ này' : 'Không đọc được tài liệu'} body={imp.error}
          actions={<>{imp.retry && <button type="button" className="btn btn-secondary btn-sm" onClick={imp.retry}>Thử lại</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={restart}>Chọn tệp khác</button></>} />
      )}
      {['options', 'generating', 'gen-error', 'limit'].includes(step) && s && (
        <>
          <div className="la-file"><Icon name={s.kind === 'video' ? 'video' : 'file-text'} className="icon-sm" /><SourceFacts s={s} /><button type="button" className="btn btn-ghost btn-sm" onClick={restart}>Đổi tệp</button></div>
          {s.warnings.map((w, i) => <p key={i} className="small text-warn"><Icon name="alert-triangle" className="icon-sm" /> {w}</p>)}
          {imp.storageError && <p className="small text-warn"><Icon name="alert-triangle" className="icon-sm" /> {imp.storageError}</p>}
          {s.outline.length > 0 && <details className="panel"><summary className="small strong">{s.kind === 'video' ? 'Một số đoạn lời giảng AI nghe được' : 'Các mục AI đọc được'}</summary><ol className="small" style={{ marginTop: 8 }}>{s.outline.map((x, i) => <li key={i}>{x}</li>)}</ol></details>}
          <fieldset className="stack-2" disabled={step === 'generating'}><legend className="small"><strong>Tạo bằng AI</strong></legend>
            <label className="check"><input type="checkbox" checked={imp.opts.summary} onChange={(e) => { imp.opts.summary = e.target.checked; refresh(); }} /> Tóm tắt bài đọc
              {l && imp.hasBody ? <> <span className="xsmall muted">(sẽ thay bài đọc hiện tại)</span></> : null}</label>
            <label className="check"><input type="checkbox" checked={imp.opts.quiz} onChange={(e) => { imp.opts.quiz = e.target.checked; refresh(); }} /> Câu hỏi quiz</label>
            {imp.opts.quiz && (
              <div className="grid-2">
                <div className="field"><label htmlFor="la-count">Số câu</label>
                  <select id="la-count" value={String(imp.opts.count)} onChange={(e) => { imp.opts.count = Number(e.target.value); refresh(); }}>{[3, 5, 8, 10].map((n) => <option key={n} value={String(n)}>{n}</option>)}</select></div>
                <div className="field"><label htmlFor="la-diff">Độ khó</label>
                  <select id="la-diff" value={imp.opts.difficulty} onChange={(e) => { imp.opts.difficulty = e.target.value; refresh(); }}>{[['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              </div>
            )}
            {imp.material && !imp.materialSaved && (
              <label className="check"><input type="checkbox" checked={imp.opts.attach} onChange={(e) => { imp.opts.attach = e.target.checked; refresh(); }} /> Đính kèm {s.kind === 'video' ? 'video' : 'tệp'} này vào bài học để học viên xem</label>
            )}
          </fieldset>
          {step === 'generating' && (
            <div className="ai-thinking-row" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span>
              <span>AI đang soạn từ {s.kind === 'video' ? 'lời giảng và khung hình video' : 'nội dung tài liệu'}…</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={stop}><Icon name="x" className="icon-sm" /> Dừng</button></div>
          )}
          {step === 'gen-error' && (
            <Alert type="danger" title="AI chưa tạo được nội dung" body={imp.error || 'Tài liệu vẫn được giữ. Thử lại hoặc soạn thủ công.'}
              actions={<button type="button" className="btn btn-secondary btn-sm" onClick={generate}>Thử lại</button>} />
          )}
          {step === 'limit' && <Alert type="warn" title="Đã dùng hết lượt tạo bằng AI trong giờ này" body={imp.error || 'Thử lại sau ít phút hoặc soạn thủ công.'} />}
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
      {!imp.lessonId && (
        <div className="field"><label htmlFor="la-title">Tên bài học mới <span className="req">*</span></label>
          <input id="la-title" value={r.title} onChange={(e) => { r.title = e.target.value; refresh(); }} />
          <span className="field-help">Bài được thêm vào {imp.chapterTitle}.</span></div>
      )}
      {r.summary && (
        <section className="la-block">
          <div className="row-between"><strong className="small">Tóm tắt bài đọc</strong>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className={`btn btn-sm ${r.summary.state === 'accepted' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={r.summary.state === 'accepted'} onClick={() => setSummary('accepted')}>Chấp nhận</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={r.summary.state === 'discarded'} onClick={() => setSummary('discarded')}>Bỏ</button>
            </span></div>
          <label className="sr-only" htmlFor="la-sum">Tóm tắt</label>
          <textarea id="la-sum" rows={12} value={r.summary.text} onChange={(e) => { r.summary.text = e.target.value; refresh(); }} />
        </section>
      )}
      {r.items.length > 0 && (
        <section className="la-block">
          <strong className="small">Câu hỏi quiz</strong>
          <QuizReviewList items={r.items} setItems={(fn) => { r.items = fn(r.items); refresh(); }} />
        </section>
      )}
      {imp.material && !imp.materialSaved && imp.opts.attach && <p className="small muted"><Icon name="link" className="icon-sm" /> {imp.source.kind === 'video' ? 'Video' : 'Tệp'} “{imp.material.title}” sẽ được đính kèm vào bài.</p>}
    </div>
  );
}

const acceptedItems = (r) => r.items.filter((it) => it.state === 'accepted' && !validateQuestionDraft(it.question).length);
const acceptedCount = () => {
  const r = imp && imp.result; if (!r) return 0;
  return (r.summary && r.summary.state === 'accepted' ? 1 : 0) + acceptedItems(r).length + (imp.material && !imp.materialSaved && imp.opts.attach ? 1 : 0);
};
function ImportFooter() {
  if (!imp) return null;
  if (imp.step !== 'review') {
    const can = imp.step === 'options' && (imp.opts.summary || imp.opts.quiz);
    return (
      <>
        <button type="button" className="btn btn-ghost" data-close="">Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!can} onClick={generate}><Icon name="sparkles" className="icon-sm" /> Tạo bằng AI</button>
      </>
    );
  }
  const n = acceptedCount();
  const isNew = !imp.lessonId;
  return (
    <>
      <button type="button" className="btn btn-ghost" disabled={imp.applying} onClick={() => { imp.step = 'options'; refresh(); }}>Quay lại</button>
      <button type="button" className="btn btn-primary" disabled={imp.applying || (isNew ? !imp.result.title.trim() || imp.result.title.trim().length < 2 : !n)} onClick={apply}>
        {imp.applying ? <><Icon name="loader" className="icon-sm" /> Đang thêm…</> : isNew ? `Tạo bài học${n ? ` (${n} mục)` : ''}` : `Thêm vào bài học (${n} mục)`}</button>
    </>
  );
}

function fail(cur, e, retry) {
  if (imp !== cur || (e && e.name === 'AbortError')) return;
  cur.error = (e && e.message) || 'Vui lòng thử lại.'; cur.limit = isLimit(e); cur.retry = retry || null; cur.step = 'read-error'; refresh();
}
function pickFile(file) {
  const problem = checkFile(file, 'any');
  if (problem) { imp.pickError = problem; refresh(); return; }
  const cur = imp;
  cur.pickError = null; cur.file = { name: file.name, size: file.size }; cur.step = 'uploading'; cur.pct = 0; cur.ctrl = new AbortController(); refresh();
  uploadLessonFile(cur.courseId, file, { signal: cur.ctrl.signal, onProgress: (p) => { if (imp === cur) { cur.pct = p; refresh(); } } })
    .then((up) => { if (imp !== cur) return; startFromUpload(up); })
    .catch((e) => fail(cur, e));
}
/** A file uploaded by this sheet or by the "Thêm bài video / slide" form: read it right away. */
function startFromUpload(up) {
  imp.upload = up.upload; imp.material = up.material; imp.materialSaved = false; imp.storageError = up.storageError || null;
  imp.file = { name: up.upload.fileName };
  readSource({ uploadId: up.upload.id });
}
function readStored(m) {
  imp.file = { name: m.title + (m.type === 'video' ? '.mp4' : '.pdf') }; imp.material = m; imp.materialSaved = true; imp.storageError = null;
  readSource({ materialUrl: m.url, fileName: m.title });
}
function readSource(body) {
  const cur = imp;
  cur.step = 'reading'; cur.ctrl = new AbortController(); refresh();
  readLessonSource(cur.courseId, body, { signal: cur.ctrl.signal })
    .then((s) => {
      if (imp !== cur) return;
      cur.source = s; cur.file = { name: s.fileName }; cur.step = 'options'; refresh();
    })
    .catch((e) => fail(cur, e, () => readSource(body)));
}
function restart() { abortNow(); imp.step = 'upload'; imp.source = null; imp.error = null; refresh(); }
function stop() { abortNow(); imp.step = 'options'; refresh(); Codi.ui.toast('Đã dừng tạo nội dung.'); }
function generate() {
  const cur = imp; const { l } = target();
  cur.step = 'generating'; cur.error = null; cur.ctrl = new AbortController(); refresh();
  draftLesson(cur.courseId, { sourceId: cur.source.sourceId, quizCount: cur.opts.quiz ? cur.opts.count : 0, difficulty: cur.opts.difficulty, lessonTitle: l ? l.title : null }, { signal: cur.ctrl.signal })
    .then(({ draft }) => {
      if (imp !== cur) return;
      cur.result = {
        title: draft.title,
        summary: cur.opts.summary ? { text: draft.summary, state: 'pending' } : null,
        items: cur.opts.quiz ? toReviewItems(draft.questions.map((q) => ({ ...q, id: Codi.uid('q'), conceptId: null }))) : [],
      };
      cur.step = 'review'; refresh();
    })
    .catch((e) => {
      if (imp !== cur || (e && e.name === 'AbortError')) return;
      cur.error = (e && e.message) || null; cur.step = isLimit(e) ? 'limit' : 'gen-error'; refresh();
    });
}
async function apply() {
  const T = Codi.teach || {}; const cur = imp; const r = cur.result;
  const c = T.course ? T.course(cur.courseId) : null;
  if (!c || !T.patchLesson) { Codi.ui.toast('Không tìm thấy khoá học.', { type: 'danger' }); return; }
  cur.applying = true; refresh();
  const body = r.summary && r.summary.state === 'accepted' ? r.summary.text : null;
  const material = cur.material && !cur.materialSaved && cur.opts.attach ? cur.material : null;
  const qs = acceptedItems(r).map((it) => it.question);
  const durationMinutes = cur.source && cur.source.durationSec ? Math.max(1, Math.min(360, Math.ceil(cur.source.durationSec / 60))) : undefined;
  let lessonId = cur.lessonId; let title = target().l ? target().l.title : r.title.trim();
  try {
    if (!lessonId) {
      const ch = c.chapters.find((x) => x.id === cur.chapterId) || c.chapters[c.chapters.length - 1];
      if (!ch) throw new Error('Hãy thêm một chương trước khi thêm bài học.');
      const added = await T.act('course', 'addLesson', c.id, ch.id, title);
      lessonId = added.lesson.id;
      await T.patchLesson(c.id, lessonId, { title, body: body || '', durationMinutes: durationMinutes || 10, addMaterial: material || undefined });
    } else if (body != null || material) {
      await T.patchLesson(c.id, lessonId, { body: body != null ? body : undefined, addMaterial: material || undefined, durationMinutes: material && !cur.hasDuration ? durationMinutes : undefined });
    }
    if (qs.length) await T.appendQuizQuestions(c.id, lessonId, qs);
  } catch (e) {
    cur.applying = false; refresh();
    Codi.ui.toast((e && e.message) || 'Không thể thêm nội dung vào bài học.', { type: 'danger' });
    if (T.reloadCourse) T.reloadCourse(c.id);
    return;
  }
  if (T.reloadCourse) await T.reloadCourse(c.id);
  const done = cur.onApplied; const isNew = !cur.lessonId;
  handle.close();
  if (done) done(lessonId);
  if (isNew) Codi.go(`/teach/courses/${c.id}/content?lesson=${lessonId}`);
  const parts = [body != null ? 'bài đọc' : null, qs.length ? `${qs.length} câu quiz` : null, material ? (material.type === 'video' ? 'video' : 'tệp đính kèm') : null].filter(Boolean);
  Codi.ui.toast(isNew ? `Đã tạo bài “${title}”${parts.length ? ' với ' + parts.join(', ') : ''}.` : `Đã thêm ${parts.join(', ')} vào bài “${title}”.`, { type: 'success' });
}

/**
 * openImport(courseId, lessonId | null, { chapterId?, upload?, onApplied? })
 *   lessonId null: the lesson is created on apply in chapterId, titled from the draft.
 *   upload: an upload response from …/media (the "Thêm bài" form) — the sheet starts reading it right away.
 */
function openImport(courseId, lessonId, opts) {
  const o = opts || {};
  if (handle) handle.close();
  const T = Codi.teach || {}; const c = T.course ? T.course(courseId) : null;
  const ch = c && (c.chapters.find((x) => x.id === o.chapterId) || c.chapters[c.chapters.length - 1]);
  imp = { courseId, lessonId: lessonId || null, chapterId: ch ? ch.id : null, chapterTitle: ch ? ch.title : 'chương cuối', onApplied: o.onApplied,
    step: 'upload', pct: 0, file: null, source: null, result: null, stored: [], hasBody: false, hasDuration: false,
    opts: { summary: true, quiz: true, count: 5, difficulty: 'medium', attach: true } };
  handle = Codi.ui.sheet({
    title: 'Tạo nội dung từ tài liệu', wide: true,
    body: () => <ImportBody />,
    footer: () => <ImportFooter />,
    onClose: () => { abortNow(); imp = null; handle = null; },
  });
  // Files already attached to the lesson (uploaded to Codi) can be read without uploading again.
  if (lessonId && T.act) {
    const cur = imp;
    T.act('course', 'getLessonDetails', courseId, lessonId).then((det) => {
      if (imp !== cur || !det) return;
      cur.hasBody = !!(det.lesson && det.lesson.body && det.lesson.body.trim());
      cur.hasDuration = !!(det.lesson && det.lesson.durationSeconds > 0);
      cur.stored = (det.materials || []).filter((m) => isStoredMedia(m.url)).map((m) => ({ type: m.type, title: m.title, url: m.url }));
      refresh();
    }).catch(() => {});
  }
  if (o.upload) startFromUpload(o.upload);
}

// Topic facts reused by the lesson/code draft generator (lecturer-ai-create.jsx).
const factsFor = (c, title) => { const b = pickBank(c, { title }); return b ? b.facts : []; };

Object.assign(Codi, {
  lecturerAI: { ...(Codi.lecturerAI || {}), openImport, generateQuestions, suggestRubric, suggestTests, task, factsFor },
});
