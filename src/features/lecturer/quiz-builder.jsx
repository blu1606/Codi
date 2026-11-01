// S23 quiz builder ('/teach/courses/:courseId/quiz/:lessonId', lessonId 'entry' = entry test). Port of the real
// quiz-builder-client.tsx: 2–6 options (4 blank by default), collapsed explanation, inline errors, entry-test
// warning card and per-question lesson links, batch import. AI generation with its accept/discard review gate is
// owned by the lecturer-ai feature and mounted through Codi.lecturerAI.quizReview (see AiQuizSlot).
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon } from '../../components/ui/primitives';
import { shell, notMine, isMine, locked, persist, guard, lecturerAI, ENTRY_MIN, FieldError } from './teach-api';
import { rerender, useView } from './view-store';
import { parseQuizImport, DEFAULT_MAX_QUIZ_OPTIONS } from './quiz-import';

let qb = null; // { key, courseId, lessonId, isEntry, quiz, errors, openExplain:Set }
const qbKey = (cid, lid) => cid + '/' + lid;
const MAX_OPT = DEFAULT_MAX_QUIZ_OPTIONS;
const letter = (i) => String.fromCharCode(65 + i);

/** Real handleSaveQuiz validation: per-question inline errors + passing score 1–100. */
function validateQuiz(quiz) {
  const errors = { questions: {} };
  const ps = Number(quiz.passingScore);
  if (quiz.passingScore === '' || !Number.isFinite(ps) || ps < 1 || ps > 100) errors.passingScore = 'Điểm đạt phải nằm trong khoảng từ 1% đến 100%.';
  quiz.questions.forEach((q, i) => {
    const issues = {};
    if (!q.text.trim()) issues.text = 'Vui lòng nhập nội dung câu hỏi.';
    if (q.options.filter((o) => o.trim()).length < 2) issues.options = 'Cần ít nhất 2 phương án trả lời có nội dung.';
    const c = q.options[q.correctIndex];
    if (q.correctIndex == null || c === undefined || !c.trim()) issues.correct = 'Vui lòng chọn một phương án có nội dung làm đáp án đúng.';
    if (Object.keys(issues).length) errors.questions[i] = issues;
  });
  const has = !!errors.passingScore || Object.keys(errors.questions).length > 0;
  return has ? errors : null;
}
const resetQb = () => { qb = null; };
const markDirty = () => { if (!guard.dirty && qb) guard.dirty = { label: 'Bài trắc nghiệm', scope: '/teach/courses/' + qb.courseId + '/quiz/', reset: resetQb }; };
// any edit clears the inline errors, like the real builder
const change = (fn) => { fn(); if (qb) qb.errors = null; markDirty(); rerender(); };
const blankQuestion = (isEntry) => ({ id: Codi.uid('q'), conceptId: null, ...(isEntry ? { lessonId: null } : {}), text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });

/** Appends questions to the open draft (batch import or accepted AI questions). Returns how many were added. */
function appendQuestions(list) {
  if (!qb || !list.length) return 0;
  const added = list.map((q) => ({ conceptId: null, explanation: '', ...q, id: q.id || Codi.uid('q'), options: q.options.slice(0, MAX_OPT), ...(qb.isEntry ? { lessonId: q.lessonId || null } : {}) }));
  change(() => { qb.quiz.questions.push(...added); });
  return added.length;
}

/** Lesson-row / quiz-panel "Tạo bằng AI từ tài liệu": the quiz draft must be saved first, then reloads. */
export function aiImport(courseId, lessonId) {
  if (qb && qb.lessonId === lessonId && guard.dirty) { Codi.ui.toast('Lưu quiz trước rồi mới nhập tài liệu, để không mất thay đổi.', { type: 'warn' }); return; }
  const AI = lecturerAI(); if (!AI || !AI.openImport) return;
  AI.openImport(courseId, lessonId, { onApplied() { if (qb && qb.lessonId === lessonId) { resetQb(); rerender(); } } });
}

// ───────────────────────── batch import dialog (real quiz-import-dialog.tsx) ─────────────────────────
const EXAMPLE_BLOCK = 'Thủ đô của Việt Nam?\nA. Huế\n* B. Hà Nội\n- Đà Nẵng\nGiải thích: Hà Nội là thủ đô từ năm 1010.\n\nHook nào dùng để lưu state?\n* useState\n- useEffect';
const EXAMPLE_TABS = 'Thủ đô của Việt Nam?\tHuế\tHà Nội\tB\tHà Nội là thủ đô.\nHook nào lưu state?\tuseState\tuseEffect\t1';

function ImportBody({ handle, onImport }) {
  const [text, setText] = useState('');
  const [termSeparator, setTerm] = useState('auto');
  const [questionSeparator, setQSep] = useState('blank');
  const items = useMemo(() => parseQuizImport(text, { termSeparator, questionSeparator, maxOptions: MAX_OPT }), [text, termSeparator, questionSeparator]);
  const valid = items.filter((x) => !x.errors.length);
  const invalid = items.length - valid.length;
  const add = () => { if (!valid.length) return; onImport(valid.map((x) => x.draft)); handle.close(); };
  return (
    <>
      <div className="dialog-body stack-4">
        <p className="small muted">Dán câu hỏi từ Word, Excel, Google Sheets hoặc gõ theo khối. Xem trước bên dưới; chỉ câu hợp lệ mới được thêm vào bài. Bạn vẫn cần lưu bài trắc nghiệm sau khi thêm.</p>
        <div className="grid-2">
          <div className="panel stack-1"><strong className="small">Dạng khối</strong><span className="xsmall muted">Mỗi câu một khối, các khối cách nhau bằng dòng trống. Đáp án đúng có dấu * ở đầu.</span><pre className="tc-example mono xsmall">{EXAMPLE_BLOCK}</pre></div>
          <div className="panel stack-1"><strong className="small">Dạng hàng (Excel, Sheets)</strong><span className="xsmall muted">Mỗi dòng một câu: câu hỏi, các phương án, đáp án đúng (A–F hoặc số thứ tự 1–{MAX_OPT}), rồi giải thích nếu có. Các cột cách nhau bằng tab.</span><pre className="tc-example mono xsmall">{EXAMPLE_TABS}</pre></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="qi-term">Giữa câu và đáp án</label><select id="qi-term" value={termSeparator} onChange={(e) => setTerm(e.target.value)}><option value="auto">Tự động nhận dạng</option><option value="tab">Tab (dạng hàng)</option><option value="line">Dòng mới (dạng khối)</option></select></div>
          <div className="field"><label htmlFor="qi-sep">Giữa các câu</label><select id="qi-sep" value={questionSeparator} onChange={(e) => setQSep(e.target.value)}><option value="blank">Dòng trống</option><option value="semicolon">Dấu ;</option></select></div>
        </div>
        <textarea className="mono small" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán hoặc gõ câu hỏi tại đây..." aria-label="Nội dung câu hỏi cần nhập" spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; const v = t.value; setText(v.slice(0, s) + '\t' + v.slice(t.selectionEnd)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 1; }); } }} />
        <div className="row-between small" aria-live="polite"><strong>{items.length === 0 ? 'Chưa có câu hỏi nào để xem trước' : `${valid.length} câu hợp lệ${invalid ? ` · ${invalid} câu có lỗi` : ''}`}</strong>
          {invalid > 0 && <span className="text-danger row" style={{ gap: 4 }}><Icon name="alert-circle" className="icon-sm" /> Sửa các câu có lỗi để thêm đủ</span>}</div>
        {items.length > 0 && (
          <ol className="tc-import-list" aria-label="Xem trước câu hỏi">{items.map((it) => {
            const ok = !it.errors.length;
            return (
              <li key={it.index} className={`tc-import-item ${ok ? '' : 'is-invalid'}`}>
                <div className="row-between"><strong className="small">Câu {it.index}</strong><span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? 'Hợp lệ' : 'Có lỗi'}</span></div>
                <p className="small">{it.draft.text || <em className="muted">(không có nội dung)</em>}</p>
                {it.draft.options.length > 0 && <ul className="tc-import-opts">{it.draft.options.map((o, k) => (
                  <li key={k} className={`xsmall ${k === it.draft.correctIndex ? 'is-correct' : 'muted'}`}><strong>{letter(k)}.</strong> <span className="od-truncate">{o || '(trống)'}</span>{k === it.draft.correctIndex && <Icon name="check" className="icon-sm" />}</li>
                ))}</ul>}
                {it.draft.explanation && <p className="xsmall muted">Giải thích: {it.draft.explanation}</p>}
                {!ok && <ul className="xsmall text-danger stack-1" role="alert">{it.errors.map((m) => <li key={m} className="row" style={{ gap: 4, alignItems: 'flex-start' }}><Icon name="alert-circle" className="icon-sm" /><span>{m}</span></li>)}</ul>}
              </li>
            );
          })}</ol>
        )}
      </div>
      <div className="dialog-footer"><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!valid.length} onClick={add}><Icon name="check-circle" className="icon-sm" /> Thêm {valid.length} câu</button></div>
    </>
  );
}
function openImport() {
  Codi.ui.modal({
    title: 'Nhập hàng loạt câu hỏi', size: 'lg', raw: true,
    body: (h) => <ImportBody handle={h} onImport={(drafts) => {
      const n = appendQuestions(drafts.map((d) => ({ text: d.text, options: d.options, correctIndex: d.correctIndex, explanation: d.explanation })));
      if (n) Codi.ui.toast(`Đã thêm ${n} câu vào danh sách. Nhớ lưu bài trắc nghiệm.`, { type: 'success' });
    }} />,
  });
}

/**
 * Stable call site for the lecturer-ai feature: Codi.lecturerAI.quizReview({ open, onClose, courseId, lessonId,
 * lessonTitle, maxOptions, onApply }) renders the review dialog; this builder owns the trigger and visibility.
 * onApply receives only the accepted questions; they are appended to the draft (the lecturer still saves).
 * Without the lecturer-ai feature the trigger is disabled with "Sắp có".
 */
function AiQuizSlot({ c, lesson, isEntry, ro }) {
  const [open, setOpen] = useState(false);
  const AI = Codi.lecturerAI;
  const available = !!(AI && typeof AI.quizReview === 'function');
  if (ro) return null;
  if (!available) return <span className="row" style={{ gap: 6 }}><button type="button" className="btn btn-secondary btn-sm" disabled title="Trợ lý AI cho giảng viên chưa sẵn sàng."><Icon name="sparkles" className="icon-sm" /> Tạo bằng AI</button><span className="badge badge-neutral">Sắp có</span></span>;
  const onApply = (questions) => {
    const n = appendQuestions((questions || []).map((q) => ({ ...q, aiGenerated: true, aiReviewed: true })));
    if (n) Codi.ui.toast(`Đã thêm ${n} câu AI tạo vào danh sách. Nhớ lưu bài trắc nghiệm.`, { type: 'success' });
  };
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}><Icon name="sparkles" className="icon-sm" /> Tạo bằng AI</button>
    {AI.quizReview({ open, onClose: () => setOpen(false), courseId: c.id, lessonId: isEntry ? 'entry' : lesson.id, lessonTitle: isEntry ? 'Bài kiểm tra đầu vào' : lesson.title, maxOptions: MAX_OPT, onApply })}
  </>;
}

/** Advisory hints the review pre-check raises (not a publish gate). */
function advisories(quiz) {
  const out = [];
  if (quiz.questions.length && quiz.questions.length < 3) out.push(`Quiz chỉ có ${quiz.questions.length} câu, nên có ít nhất 3 câu.`);
  const two = quiz.questions.filter((q) => q.options.length <= 2).length;
  if (two) out.push(`${two} câu chỉ có 2 lựa chọn nên dễ đoán — nên thêm lựa chọn sai hợp lý.`);
  const noExp = quiz.questions.filter((q) => !(q.explanation || '').trim()).length;
  if (noExp) out.push(`${noExp} câu hỏi chưa có phần giải thích đáp án.`);
  return out;
}

export function QuizBuilderPage({ params }) {
  useCodi(); useView();
  const focusNext = useRef(null);
  const c = Codi.course(params.courseId);
  if (!isMine(c)) return notMine();
  const isEntry = params.lessonId === 'entry';
  const lesson = isEntry ? null : Codi.lesson(c, params.lessonId);
  if (!isEntry && !lesson) return notMine();
  const key = qbKey(c.id, params.lessonId);
  if (!qb || qb.key !== key) {
    const src = isEntry ? c.entryTest : lesson.quiz;
    const quiz = src ? JSON.parse(JSON.stringify(src)) : { id: isEntry ? c.id + '-entry' : lesson.id + '-quiz', passingScore: 70, questions: [] };
    quiz.passingScore = quiz.passingScore || 70;
    quiz.questions.forEach((q) => { q.explanation = q.explanation || ''; if (isEntry && q.lessonId === undefined) q.lessonId = null; });
    qb = { key, courseId: c.id, lessonId: params.lessonId, isEntry, quiz, errors: null, openExplain: new Set() };
  }
  const quiz = qb.quiz; const ro = locked(c); const errs = qb.errors || { questions: {} };
  const dirty = !!guard.dirty && guard.dirty.scope === '/teach/courses/' + c.id + '/quiz/';
  const courseLessons = c.chapters.flatMap((ch) => ch.lessons.map((l) => ({ id: l.id, title: l.title, chapter: ch.title })));

  const addQuestion = () => {
    change(() => quiz.questions.push(blankQuestion(isEntry)));
    const id = 'qt-' + (quiz.questions.length - 1);
    clearTimeout(focusNext.current);
    focusNext.current = setTimeout(() => { const t = document.getElementById(id); if (t) t.focus(); }, 0);
  };
  const moveQ = (i, dir) => { const a = quiz.questions; const j = i + dir; if (j < 0 || j >= a.length) return; change(() => { [a[i], a[j]] = [a[j], a[i]]; }); };
  const delQ = (i) => {
    if (quiz.questions.length <= 1) { Codi.ui.toast('Bài quiz cần có ít nhất 1 câu hỏi.', { type: 'danger' }); return; }
    change(() => quiz.questions.splice(i, 1));
  };
  const addOpt = (q) => {
    if (q.options.length >= MAX_OPT) { Codi.ui.toast(`Mỗi câu hỏi tối đa ${MAX_OPT} phương án lựa chọn.`, { type: 'danger' }); return; }
    change(() => q.options.push(''));
  };
  const delOpt = (q, k) => {
    if (q.options.length <= 2) { Codi.ui.toast('Mỗi câu hỏi cần tối thiểu 2 phương án lựa chọn.', { type: 'danger' }); return; }
    change(() => { q.options.splice(k, 1); if (q.correctIndex === k) q.correctIndex = 0; else if (q.correctIndex > k) q.correctIndex -= 1; });
  };
  const save = () => {
    if (ro) return;
    if (!quiz.questions.length) { Codi.ui.toast('Vui lòng thêm ít nhất một câu hỏi.', { type: 'danger' }); return; }
    const v = validateQuiz(quiz);
    if (v) { qb.errors = v; rerender(); Codi.ui.toast('Quiz chưa hợp lệ — xem các lỗi được đánh dấu.', { type: 'danger' }); return; }
    const clean = JSON.parse(JSON.stringify(quiz));
    clean.passingScore = Number(clean.passingScore);
    if (qb.isEntry) c.entryTest = Object.assign(clean, { title: 'Bài kiểm tra đầu vào', isEntryTest: true });
    else Codi.lesson(c, qb.lessonId).quiz = clean;
    guard.dirty = null; const wasEntry = qb.isEntry; resetQb(); persist(false);
    Codi.ui.toast(wasEntry ? 'Đã lưu Bài kiểm tra đầu vào thành công!' : 'Đã lưu Quiz bài học thành công!', { type: 'success' });
    Codi.go('/teach/courses/' + c.id + '/content');
  };
  const adv = advisories(quiz);

  return shell('/teach/courses', <>
    <div className="row-between tc-qb-head" style={{ marginBottom: 16 }}>
      <div className="stack-2"><Link className="small" to={`/teach/courses/${c.id}/content`}><Icon name="arrow-left" className="icon-sm" /> Quay lại khoá học: {c.title}</Link>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><h1>{isEntry ? 'Bài kiểm tra đầu vào (Diagnostic Test)' : `Quiz: ${lesson.title || 'Bài học'}`}</h1>
          {isEntry ? <span className="badge badge-accent">Xếp lộ trình đầu vào</span> : <span className="badge badge-neutral">Quiz bài học</span>}
          {ro && <span className="badge badge-warn">Đang chờ duyệt — Chỉ đọc</span>}</div>
        <p className="small muted">{isEntry ? 'Bài kiểm tra giúp hệ thống BKT phân tích kỹ năng và đề xuất lộ trình học thích ứng cho từng học viên.' : 'Kiểm tra kiến thức cốt lõi ngay sau khi học viên hoàn thành nội dung bài học.'}</p></div>
      {!ro && <div className="row" style={{ gap: 12 }}>{dirty && <span className="small muted row" style={{ gap: 4 }}><Icon name="alert-circle" className="icon-sm text-warn" /> Có thay đổi chưa lưu</span>}
        <button type="button" className="btn btn-primary" onClick={save}><Icon name="save" className="icon-sm" /> Lưu bài trắc nghiệm</button></div>}
    </div>
    {ro && <div style={{ marginBottom: 16 }}><Alert type="warn" title="Khoá học đang chờ duyệt" body="Bạn đang xem nội dung ở chế độ chỉ đọc. Để chỉnh sửa bài quiz, hãy đợi ban quản trị hoàn tất quá trình duyệt hoặc yêu cầu bổ sung." /></div>}
    <div className="tc-qb" data-dirty-scope>
      <div className="stack-3">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}><strong className="small row" style={{ gap: 6 }}><Icon name="clipboard-check" className="icon-sm" /> Danh sách câu hỏi ({quiz.questions.length} câu)</strong>
          {!ro && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openImport}><Icon name="clipboard" className="icon-sm" /> Nhập hàng loạt</button>
            <AiQuizSlot c={c} lesson={lesson} isEntry={isEntry} ro={ro} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addQuestion}><Icon name="plus" className="icon-sm" /> Thêm câu hỏi</button></div>}</div>
        {quiz.questions.map((q, i) => {
          const qe = errs.questions[i] || {};
          const showExp = !!q.explanation || qb.openExplain.has(q.id);
          return (
            <section key={q.id || i} className={`card ${q.aiGenerated && q.aiReviewed === false ? 'tc-q-ai' : ''}`}><div className="card-body stack-3">
              <div className="row-between"><span className="row" style={{ gap: 8 }}><strong className="small">Câu {i + 1}</strong>{q.aiGenerated && <span className={`badge ${q.aiReviewed === false ? 'badge-accent' : 'badge-neutral'}`}><Icon name="sparkles" />{q.aiReviewed === false ? 'AI tạo · chưa duyệt' : 'AI tạo · đã duyệt'}</span>}
                {!ro && q.aiGenerated && q.aiReviewed === false && <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(() => { q.aiReviewed = true; })}><Icon name="check" className="icon-sm" /> Đã kiểm tra câu này</button>}</span>
                {ro ? null : (
                  <div className="tc-row-actions">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label={`Chuyển câu ${i + 1} lên`} title="Di chuyển lên"><Icon name="arrow-up" className="icon-sm" /></button>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => moveQ(i, 1)} disabled={i === quiz.questions.length - 1} aria-label={`Chuyển câu ${i + 1} xuống`} title="Di chuyển xuống"><Icon name="arrow-down" className="icon-sm" /></button>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => delQ(i)} aria-label={`Xoá câu ${i + 1}`} title="Xoá câu hỏi"><Icon name="trash" className="icon-sm" /></button></div>
                )}</div>
              <div className={`field ${qe.text ? 'is-invalid' : ''}`}><label htmlFor={`qt-${i}`}>Nội dung câu hỏi <span className="req">*</span></label><textarea id={`qt-${i}`} rows={2} value={q.text} placeholder="Nhập nội dung câu hỏi trắc nghiệm..." onChange={(e) => change(() => { q.text = e.target.value; })} disabled={ro} aria-invalid={!!qe.text} /><FieldError>{qe.text}</FieldError></div>
              {isEntry && (
                <div className="field"><label htmlFor={`ql-${i}`}>Bài học tương ứng (BKT liên kết kỹ năng)</label>
                  <select id={`ql-${i}`} value={q.lessonId || ''} disabled={ro} onChange={(e) => change(() => { q.lessonId = e.target.value || null; })}>
                    <option value="">-- Chọn bài học để BKT đánh giá kỹ năng --</option>
                    {courseLessons.map((l) => <option key={l.id} value={l.id}>{l.chapter ? `[${l.chapter}] ` : ''}{l.title}</option>)}</select>
                  <span className="field-help">BKT đọc kỹ năng của bài học này để cập nhật mức độ thành thạo khi học viên làm bài kiểm tra đầu vào.</span></div>
              )}
              <fieldset className={`stack-2 tc-opts ${qe.options || qe.correct ? 'is-invalid' : ''}`}><legend className="field-label" style={{ marginBottom: 8 }}>Các phương án lựa chọn (Click chọn đáp án đúng) <span className="req">*</span></legend>
                {q.options.map((o, k) => (
                  <div key={k} className={`tc-opt ${q.correctIndex === k ? 'is-correct' : ''}`}>
                    <label className="tc-correct" title={q.correctIndex === k ? 'Đáp án đúng' : 'Đánh dấu là đáp án đúng'}><input type="radio" name={`correct-${i}`} checked={q.correctIndex === k} onChange={() => change(() => { q.correctIndex = k; })} disabled={ro} /> {q.correctIndex === k ? 'Đúng' : letter(k)}</label>
                    <input className="input od-fill" value={o} placeholder={`Phương án ${letter(k)}...`} aria-label={`Phương án ${letter(k)} của câu ${i + 1}`} onChange={(e) => change(() => { q.options[k] = e.target.value; })} disabled={ro} />
                    {!ro && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => delOpt(q, k)} aria-label={`Xoá phương án ${letter(k)}`} title="Xoá phương án này"><Icon name="x" className="icon-sm" /></button>}</div>
                ))}
                <FieldError>{qe.options || qe.correct}</FieldError>
                {!ro && q.options.length < MAX_OPT && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => addOpt(q)}><Icon name="plus" className="icon-sm" /> Thêm phương án</button>}
              </fieldset>
              {showExp ? (
                <div className="field"><label htmlFor={`qe-${i}`}><Icon name="help-circle" className="icon-sm" /> Giải thích đáp án (học viên sẽ thấy sau khi nộp bài)</label><textarea id={`qe-${i}`} rows={2} value={q.explanation} placeholder="Giải thích vì sao phương án này là đúng..." onChange={(e) => change(() => { q.explanation = e.target.value; })} disabled={ro} /></div>
              ) : !ro && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => { qb.openExplain.add(q.id); rerender(); setTimeout(() => { const t = document.getElementById(`qe-${i}`); if (t) t.focus(); }, 0); }}><Icon name="plus" className="icon-sm" /> Thêm giải thích</button>}
            </div></section>
          );
        })}
        {!quiz.questions.length && <div className="card"><Empty icon="clipboard-check" title="Chưa có câu hỏi" body="Thêm câu hỏi trắc nghiệm, đánh dấu rõ đáp án đúng." actions={ro ? null : <button type="button" className="btn btn-primary" onClick={addQuestion}><Icon name="plus" /> Thêm câu hỏi</button>} /></div>}
      </div>
      <aside className="card tc-qb-side"><div className="card-body stack-4">
        <div className="stack-1"><h2 className="tc-h">Thiết lập Quiz</h2><span className="xsmall muted">Cấu hình điều kiện vượt qua bài kiểm tra.</span></div>
        <div className={`field ${errs.passingScore ? 'is-invalid' : ''}`}><label htmlFor="qb-pass">Điểm đạt tối thiểu (%)</label>
          <span className="row" style={{ gap: 8 }}><input id="qb-pass" type="number" min="1" max="100" style={{ width: 96 }} value={quiz.passingScore} onChange={(e) => change(() => { quiz.passingScore = e.target.value === '' ? '' : Number(e.target.value); })} disabled={ro} aria-invalid={!!errs.passingScore} /><span className="xsmall muted">% câu trả lời đúng</span></span>
          <FieldError>{errs.passingScore}</FieldError>
          <span className="field-help">Học viên phải đạt từ mức điểm này trở lên để hoàn thành bài học.</span></div>
        {isEntry && quiz.questions.length < ENTRY_MIN && <Alert type="warn" title={`Cần ít nhất ${ENTRY_MIN} câu hỏi`} body={`Hiện có ${quiz.questions.length} câu. Bài kiểm tra đầu vào cần tối thiểu ${ENTRY_MIN} câu hỏi để đạt điều kiện xuất bản khoá học.`} />}
        <div className="row-between small muted tc-qb-total"><span>Tổng số câu hỏi:</span><strong className="text-fg">{quiz.questions.length}</strong></div>
        {adv.length > 0 && <div className="stack-1"><strong className="xsmall">Gợi ý trước khi gửi duyệt</strong><ul className="xsmall muted tc-probs">{adv.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {!ro && !isEntry && <button type="button" className="btn btn-ghost btn-sm" onClick={() => aiImport(c.id, lesson.id)}><Icon name="upload" className="icon-sm" /> Tạo từ tài liệu / slide</button>}
        <Link className="btn btn-ghost btn-block" to={`/teach/courses/${c.id}/content`}>Quay lại nội dung</Link>
      </div></aside>
    </div>
  </>);
}

