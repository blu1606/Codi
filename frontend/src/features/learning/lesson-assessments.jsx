/**
 * Quiz and assignment of a lesson (port of real components/lesson-assessment.tsx: QuizAssessment,
 * AssignmentAssessment, SubmissionContent). Data: GET/POST /api/learn/:courseId/lessons/:lessonId/assessments/:id
 * (AssessmentView); the server grades the quiz and keeps the assignment draft.
 *
 * Quiz: an attempt is a draft submission (answers saved on every choice) graded on submit; the checklist needs the
 * latest attempt to pass (D6). Assignment: draft autosave (600 ms), per-assessment size limit (max 20 MB), file
 * removal, resubmit only while pending, graded work cannot be resubmitted. File upload goes through the backend's
 * signed upload (POST .../file prepare → PUT → confirm); without R2 storage the server's error is shown as is.
 * Code assignments (AssessmentView.codeLanguage set by the server) open Codi.code.assignment: the learner writes the
 * code here, runs it on the server and submits the code itself; the lecturer's link/file format stays as an option.
 * After every change that affects the checklist, onChange() reloads the lesson.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Alert, Icon, SpinnerBlock } from '../../components/ui/primitives';
import { codeBlock } from '../coding/code-api';
import { assessmentBase, errorText, scoreText } from './learning-store';

const scrollToId = (id) => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const pctText = (n) => String(Math.round(Number(n) || 0));

function Shell({ id, label, bare, busy, children }) {
  // bare: rendered inside the lesson page's task tab (no card); the action row is pinned to the tab's bottom.
  if (bare) return <section className="ln-task" id={id} aria-label={label} aria-busy={busy || undefined}>{children}</section>;
  return <section className="card" id={id} aria-busy={busy || undefined}><div className="card-body stack-4">{children}</div></section>;
}
function LoadBox({ id, label, bare, loading, error, reload }) {
  return (
    <Shell id={id} label={label} bare={bare}>
      {loading ? <SpinnerBlock text="Đang tải…" />
        : <Alert type="danger" body={errorText(error, 'Không thể tải bài.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Thử lại</button>} />}
    </Shell>
  );
}

// ───────────────────────── quiz ─────────────────────────
export function QuizSection({ courseId, lessonId, assessmentId, bare = false, onContinue, onChange }) {
  const url = assessmentBase(courseId, lessonId, assessmentId);
  const { data: q, loading, error: loadError, reload, setData } = useApi(url);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!q) return <LoadBox id="quiz" label="Quiz" bare={bare} loading={loading} error={loadError} reload={reload} />;

  const pass = q.passingScore != null ? q.passingScore : 70;
  const sub = q.submission;
  const questions = q.questions || [];
  const draft = sub && sub.status === 'draft';
  const graded = sub && sub.status === 'graded';
  const answerOf = (questionId) => ((sub && sub.answers) || []).find((a) => a.questionId === questionId);
  const missing = questions.filter((x) => { const a = answerOf(x.id); return !a || a.optionId == null; }).length;

  const run = async (command, errMsg) => {
    setBusy(true); setError(null);
    try {
      const view = await api.post(url, command);
      setData(view);
      return view;
    } catch (e) { setError(errorText(e, errMsg)); return null; } finally { setBusy(false); }
  };
  const startAttempt = async (kind) => {
    if (busy) return;
    const view = await run(kind === 'retake' ? { type: 'quiz-retake', submissionId: sub.id } : { type: 'quiz-open' }, 'Không thể lưu quiz.');
    if (view) { setIndex(0); requestAnimationFrame(() => scrollToId('quiz')); if (onChange) onChange(); }
  };
  const answer = async (question, optionId) => {
    if (!draft) return;
    setError(null);
    // Optimistic choice; the server reply replaces it (or the previous answer comes back on failure).
    setData((v) => ({ ...v, submission: { ...v.submission, answers: [...v.submission.answers.filter((a) => a.questionId !== question.id), { questionId: question.id, optionId }] } }));
    try { setData(await api.post(url, { type: 'quiz-answer', submissionId: sub.id, questionId: question.id, optionId })); }
    catch (e) { setError(errorText(e, 'Không thể lưu đáp án. Hãy chọn lại.')); reload(); }
  };
  const submit = async () => {
    if (busy) return;
    if (missing) {
      const res = await Codi.ui.confirm({ title: `Còn ${missing} câu chưa trả lời`, body: 'Câu chưa trả lời sẽ được tính là sai. Bạn muốn nộp bài ngay?', confirmLabel: 'Vẫn nộp bài', cancelLabel: 'Quay lại làm tiếp' });
      if (!res.ok) return;
    }
    const view = await run({ type: 'quiz-submit', submissionId: sub.id, confirmUnanswered: missing > 0 }, 'Không thể lưu quiz.');
    if (!view) return;
    if (onChange) onChange();
    const s = view.submission;
    Codi.ui.toast(s && s.isPassed ? `Bạn đạt ${pctText(s.quizPercent)}%. Tốt lắm!` : 'Quiz chưa đạt. Bạn có thể làm lại.', { type: s && s.isPassed ? 'success' : 'warn' });
  };

  const head = (
    <div className="stack-1"><h2 className="ln-h">{q.title || 'Quiz cuối bài'}</h2>
      <span className="small muted">{questions.length} câu · điểm đạt {pass}% · làm lại không giới hạn</span></div>
  );
  let body;
  if (q.unavailableReason) {
    body = <Alert type="info" body={q.unavailableReason} />;
  } else if (!sub) {
    body = <div className="ln-dock"><button type="button" className="btn btn-primary" onClick={() => startAttempt('open')} disabled={busy} aria-busy={busy || undefined}>Làm quiz</button></div>;
  } else if (graded) {
    const percent = sub.quizPercent != null ? sub.quizPercent : sub.score;
    const review = sub.review || [];
    body = (
      <>
        <div className="panel row ln-quiz-result">
          <p className="ln-score" aria-label={`Kết quả quiz: ${pctText(percent)}% đúng`}>{pctText(percent)}<span className="ln-score-unit">%</span></p>
          <div className="stack-1">
            <strong className={sub.isPassed ? 'text-success' : 'text-warn'}>{sub.isPassed ? 'Đạt' : 'Chưa đạt'}</strong>
            <span className="small muted">Điểm đạt: {pass}% · Lần làm {sub.attempt || 1}</span>
            <span className="small muted">Làm lại không giới hạn; lần gần nhất được tính.</span>
          </div>
        </div>
        <details className="panel ln-quiz-review"><summary className="strong small">Xem đáp án và giải thích</summary>
          <ol className="stack-4 ln-review-list">{questions.map((x, i) => {
            const a = answerOf(x.id); const rv = review.find((r) => r.questionId === x.id);
            const chosen = a && a.optionId != null ? x.options.find((o) => o.id === a.optionId) : null;
            const right = rv ? x.options.find((o) => o.id === rv.correctOptionId) : null;
            return (
              <li key={x.id} className="stack-1">
                <strong className="small">{i + 1}. {x.text}</strong>
                {rv ? (
                  <>
                    <span className="small">Bạn chọn: {chosen ? chosen.text : 'Chưa trả lời'}</span>
                    <span className={`small ${rv.isCorrect ? 'text-success' : 'text-warn'}`}>{rv.isCorrect ? 'Đúng' : 'Sai'} · Đáp án đúng: {right ? right.text : ''}</span>
                    {rv.explanation && <span className="small muted">{rv.explanation}</span>}
                  </>
                ) : <span className="small muted">Kết quả từ lần làm trước (không lưu chi tiết từng câu).</span>}
              </li>
            );
          })}</ol>
        </details>
        <div className="row ln-dock">
          <button type="button" className="btn btn-secondary" onClick={() => startAttempt('retake')} disabled={busy} aria-busy={busy || undefined}><Icon name="rotate-ccw" className="icon-sm" /> Làm lại</button>
          <a className="btn btn-secondary" href="#checklist" onClick={(e) => { e.preventDefault(); if (onContinue) onContinue(); else scrollToId('checklist'); }}>Tiếp tục</a>
        </div>
      </>
    );
  } else {
    const i = Math.min(index, questions.length - 1); const x = questions[i];
    if (!x) body = <Alert type="info" body="Quiz chưa có câu hỏi. Vui lòng liên hệ giảng viên." />;
    else {
      const a = answerOf(x.id);
      const prev = q.previousQuizPercent != null ? q.previousQuizPercent : q.previousScore;
      body = (
        <>
          {prev != null && <p className="small muted">Kết quả lần trước: {pctText(prev)}%. Cần nộp lần làm hiện tại để tính kết quả.</p>}
          <div className="row-between small"><strong>Câu {i + 1}/{questions.length}</strong><span className="muted">{questions.length - missing}/{questions.length} đã trả lời</span></div>
          <div className="ln-qnav" role="group" aria-label="Đi đến câu hỏi">{questions.map((y, k) => {
            const ya = answerOf(y.id); const answered = !!ya && ya.optionId != null;
            return <button key={y.id} type="button" disabled={busy} className={`${answered ? 'is-answered' : ''} ${k === i ? 'is-current' : ''}`.trim()} aria-label={`Câu ${k + 1}${answered ? ', đã trả lời' : ', chưa trả lời'}`} aria-current={k === i ? 'step' : undefined} onClick={() => setIndex(k)}><i /></button>;
          })}</div>
          <fieldset className="stack-3 ln-fieldset" disabled={busy}>
            <legend className="ln-question">{x.text}</legend>
            {x.codeSnippet && <pre className="ln-code"><code>{x.codeSnippet}</code></pre>}
            <div className="choice-list">{x.options.map((o) => {
              const on = !!a && a.optionId === o.id;
              return <label key={o.id} className={`choice ${on ? 'is-selected' : ''}`}><input type="radio" name={`quiz-${lessonId}-${x.id}`} value={o.id} checked={on} onChange={() => answer(x, o.id)} /><span className="choice-body"><span className="choice-title">{o.text}</span></span></label>;
            })}</div>
          </fieldset>
          <div className="row-between ln-dock">
            <button type="button" className="btn btn-ghost" onClick={() => setIndex(i - 1)} disabled={busy || i === 0}><Icon name="arrow-left" /> Câu trước</button>
            {i < questions.length - 1
              ? <button type="button" className="btn btn-secondary" onClick={() => setIndex(i + 1)} disabled={busy}>Câu tiếp <Icon name="arrow-right" /></button>
              : <button type="button" className="btn btn-primary" onClick={submit} disabled={busy} aria-busy={busy || undefined}>{busy ? 'Đang gửi…' : 'Nộp bài'}</button>}
          </div>
        </>
      );
    }
  }
  return (
    <Shell id="quiz" label={q.title || 'Quiz cuối bài'} bare={bare} busy={busy}>
      {head}
      {q.instructions && <p className="small">{q.instructions}</p>}
      {error && <Alert type="danger" body={error} />}
      {body}
    </Shell>
  );
}

// ───────────────────────── assignment ─────────────────────────
const linkValid = (value) => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
};
const fileLimitMb = (a) => Math.min(20, Math.max(1, Number(a && a.maxFileSizeMb) || 20));
const CODE_LANG = { javascript: 'JavaScript', typescript: 'TypeScript' };
// What a code assignment's editor opens with; submitting it unchanged is not a submission.
const CODE_STARTER = '// Viết code bài làm ở đây, rồi bấm “Chạy” để xem kết quả.\n';
const hasCode = (code) => !!code && !!code.trim() && code.trim() !== CODE_STARTER.trim();
// A code assignment's instructions may carry a ```js block (sample data, a skeleton): the editor opens with it,
// so the learner's code can use what the brief refers to, and the brief shows only the text around it.
const CODE_FENCE = /```(?:js|javascript|ts|typescript)?[^\S\n]*\n([\s\S]*?)```/;
const starterOf = (instructions) => {
  const m = CODE_FENCE.exec(instructions || '');
  return m ? `${CODE_STARTER}${m[1].replace(/\s+$/, '')}\n` : CODE_STARTER;
};
const briefOf = (instructions) => (instructions || '').replace(CODE_FENCE, '(Code mẫu đã có sẵn trong trình soạn thảo bên dưới.)').trim();

function SubmissionContent({ sub }) {
  return (
    <div className="stack-1 small ln-sub-content">
      {sub.code && (
        <div className="stack-1"><span className="xsmall muted">Code đã nộp ({CODE_LANG[sub.codeLanguage] || 'JavaScript'})</span>{codeBlock(sub.code, 'javascript')}</div>
      )}
      {sub.fileName && <span className="row"><Icon name="file-text" className="icon-sm" /> {sub.fileName}</span>}
      {sub.linkUrl && <a className="row" href={/^https?:\/\//.test(sub.linkUrl) ? sub.linkUrl : undefined} target="_blank" rel="noopener noreferrer"><Icon name="link" className="icon-sm" /> {sub.linkUrl}</a>}
      {sub.answerText && <p className="ln-pre">{sub.answerText}</p>}
    </div>
  );
}

/** Draft fields the form edits: the resubmit draft of a pending submission, the draft submission itself, or empty. */
function draftOf(sub) {
  if (sub && sub.draft) return { linkUrl: sub.draft.linkUrl || '', answerText: sub.draft.answerText || '', code: sub.draft.code || '', fileName: sub.draft.fileName || '' };
  if (sub && sub.status === 'draft') return { linkUrl: sub.linkUrl || '', answerText: sub.answerText || '', code: sub.code || '', fileName: sub.fileName || '' };
  return { linkUrl: '', answerText: '', code: '', fileName: '' };
}

export function AssignmentSection({ courseId, lessonId, assessmentId, bare = false, onChange }) {
  const url = assessmentBase(courseId, lessonId, assessmentId);
  const { data: a, loading, error: loadError, reload, setData } = useApi(url);
  if (!a) return <LoadBox id="assignment" label="Bài tập" bare={bare} loading={loading} error={loadError} reload={reload} />;
  return <AssignmentBody key={a.id} a={a} url={url} bare={bare} setData={setData} onChange={onChange} courseId={courseId} lessonId={lessonId} />;
}

/** Criteria of a JSON rubric ([{ name, desc, points }], the lecturer builder format), or null for free text. */
function rubricItems(raw) {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const items = list.filter((x) => x && typeof x === 'object' && (x.name || x.desc));
    return items.length ? items : null;
  } catch {
    return null;
  }
}

function RubricList({ raw }) {
  const items = rubricItems(raw);
  if (!items) return <p className="small ln-pre">{raw}</p>;
  return (
    <ul className="stack-1" style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((k, i) => (
        <li key={k.id || i} className="small">
          <strong>{k.name}</strong>{Number(k.points) ? ` (${k.points} điểm)` : ''}{k.desc ? <span className="muted">: {k.desc}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function AssignmentBody({ a, url, bare, setData, onChange, courseId, lessonId }) {
  const sub = a.submission;
  const format = a.submissionFormat || 'file_or_link';
  const codeLang = a.codeLanguage || null;
  const limitMb = fileLimitMb(a);
  const maxScore = Number(a.maxScore) || 10;
  const passPct = a.passingScore != null ? Number(a.passingScore) : 50;
  const stored = draftOf(sub);
  const starter = codeLang ? starterOf(a.instructions) : '';
  const [fields, setFields] = useState({ link: stored.linkUrl, note: stored.answerText, code: stored.code || starter });
  const [editing, setEditing] = useState(!sub || sub.status === 'draft' || !!(sub && sub.draft));
  const [saved, setSaved] = useState(stored.linkUrl || stored.answerText || stored.fileName || hasCode(stored.code) ? 'Đã khôi phục bản nháp.' : 'Bản nháp được lưu tự động.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const timer = useRef(null);
  const lastFile = useRef(null);
  const pending = useRef(null);

  const post = (command) => api.post(url, command);
  // The fields a draft or submit command carries; code only for assignments with the code editor.
  const payload = (f) => ({ linkUrl: f.link.trim(), answerText: f.note, ...(codeLang ? { code: hasCode(f.code) ? f.code : '' } : {}) });
  const flushDraft = async () => {
    clearTimeout(timer.current);
    if (!pending.current) return true;
    const next = pending.current; pending.current = null;
    try { setData(await post({ type: 'assignment-draft', ...payload(next) })); return true; } catch { return false; }
  };
  // Keep the last keystrokes when the learner leaves before the debounce fires.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current) { const next = pending.current; pending.current = null; post({ type: 'assignment-draft', ...payload(next) }).catch(() => {}); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next) => {
    setFields(next); setSaved('Chưa lưu…');
    clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(async () => {
      const ok = await flushDraft();
      setSaved(ok ? 'Đã lưu bản nháp.' : 'Chưa lưu được bản nháp. Vui lòng thử lại.');
    }, 600);
  };
  const fileName = stored.fileName;
  const linkTrim = fields.link.trim();
  const formatReady = format === 'file' ? !!fileName : format === 'link' ? !!linkTrim : format === 'text' ? !!fields.note.trim() : !!fileName || !!linkTrim;
  const ready = (!!codeLang && hasCode(fields.code)) || formatReady;
  const linkError = touched && fields.link && !linkValid(fields.link) ? 'Đường dẫn chưa hợp lệ. Hãy bắt đầu bằng https://' : null;

  const upload = async (file) => {
    if (busy) return;
    lastFile.current = file;
    setUploadError(null); setError(null);
    if (file.size > limitMb * 1024 * 1024) { setUploadError(`Tệp vượt quá ${limitMb}MB. Hãy nén lại hoặc nộp đường dẫn.`); return; }
    if (!file.size) { setUploadError('Tệp bài làm trống hoặc không hợp lệ.'); return; }
    setBusy(true); setProgress(0);
    try {
      await flushDraft();
      // Signed upload: the server issues a short-lived PUT URL (R2), the browser uploads, then the server confirms.
      const ticket = await api.post(`${url}/file`, { type: 'prepare', name: file.name, size: file.size });
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ticket.url);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Tải lên thất bại. Vui lòng thử lại.')));
        xhr.onerror = () => reject(new Error('Tải lên thất bại do mất kết nối.'));
        xhr.send(file);
      });
      setData(await api.post(`${url}/file`, { type: 'confirm', token: ticket.token }));
      setSaved('Đã lưu tệp và bản nháp.');
    } catch (e) {
      setUploadError(errorText(e, 'Tải lên thất bại. Vui lòng thử lại.'));
    }
    setBusy(false); setProgress(null);
  };
  const removeFile = async () => {
    if (busy) return;
    setBusy(true);
    await flushDraft();
    try { setData(await post({ type: 'assignment-remove-file' })); lastFile.current = null; }
    catch (e) { setError(errorText(e, 'Không thể gỡ tệp.')); }
    setBusy(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setTouched(true); setError(null);
    if (linkTrim && !linkValid(linkTrim)) return;
    if (!ready) return;
    setBusy(true);
    clearTimeout(timer.current); pending.current = null;
    try {
      setData(await post({ type: 'assignment-submit', ...payload(fields) }));
      setEditing(false); setUploadError(null);
      if (onChange) onChange();
      Codi.ui.toast('Đã nộp bài tập. Bạn có thể hoàn thành bài học ngay.', { type: 'success' });
    } catch (err) {
      setError(errorText(err, 'Không thể nộp bài.'));
    } finally { setBusy(false); }
  };
  const openResubmit = async () => {
    if (busy || !sub) return;
    setBusy(true); setError(null);
    try {
      const reopened = { link: sub.linkUrl || '', note: sub.answerText || '', code: sub.code || starter };
      setData(await post({ type: 'assignment-draft', ...payload(reopened) }));
      setFields(reopened);
      setSaved('Bản nháp được lưu tự động.');
      setEditing(true);
    } catch (err) { setError(errorText(err, 'Không thể mở bản nháp.')); }
    setBusy(false);
  };
  const cancelResubmit = async () => {
    if (busy) return;
    clearTimeout(timer.current); pending.current = null;
    setBusy(true);
    try { setData(await post({ type: 'assignment-cancel' })); setEditing(false); }
    catch (err) { setError(errorText(err, 'Chưa thể huỷ nộp lại. Vui lòng thử lại.')); }
    setBusy(false);
  };

  const graded = sub && sub.status === 'graded';
  const isPending = sub && sub.status === 'pending';
  let content;
  if (graded) {
    const passed = sub.isPassed != null ? sub.isPassed : (sub.score / maxScore) * 100 >= passPct;
    content = (
      <div className={`ln-grade ${passed ? 'is-pass' : 'is-fail'} stack-2`}>
        <strong className="row"><Icon name={passed ? 'check-circle' : 'alert-triangle'} /> Đã chấm: {scoreText(sub.score)}/{maxScore}</strong>
        <p className="small">{passed ? 'Đạt' : 'Chưa đạt'}</p>
        <span className="xsmall muted">Nhận xét của giảng viên{sub.gradedAt ? ` · ${Codi.fmt.date(sub.gradedAt)}` : ''}</span>
        <p className="small ln-pre">{sub.feedback || 'Không có nhận xét.'}</p>
        <p className="xsmall muted">Bài đã chấm không thể nộp lại.</p>
        <SubmissionContent sub={sub} />
      </div>
    );
  } else if (isPending && !editing) {
    content = (
      <div className="stack-3">
        <Alert type="info" title="Đã nộp — chờ chấm" body={`${sub.submittedAt ? `Nộp lúc ${Codi.fmt.datetime(sub.submittedAt)}. ` : ''}Bạn đã có thể hoàn thành bài học; điểm sẽ có sau khi giảng viên chấm.`} />
        <SubmissionContent sub={sub} />
        <div className="ln-dock"><button type="button" className="btn btn-secondary btn-sm" onClick={openResubmit} disabled={busy} aria-busy={busy || undefined}>Nộp lại (trước khi được chấm)</button></div>
      </div>
    );
  } else {
    const fileOk = format === 'file' || format === 'file_or_link';
    const linkOk = format === 'link' || format === 'file_or_link';
    const formId = `as-${a.id}`;
    const fileAndLink = (
      <>
        {fileOk && (
          <div className="field"><label htmlFor={`${formId}-file`}>Tệp bài làm{format === 'file' ? ' (bắt buộc)' : ''}</label>
            <input id={`${formId}-file`} type="file" disabled={busy} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) upload(f); }} />
            <span className="field-help">Tối đa {limitMb}MB</span>
            {fileName && (
              <div className="row ln-file-row"><span className="small">Tệp đã lưu: {fileName}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={removeFile} disabled={busy}>Gỡ tệp</button></div>
            )}
            {progress !== null && <div className="stack-1" role="status"><div className="progress" role="progressbar" aria-label="Tiến độ tải lên" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + '%' }} /></div><span className="small">Đang tải lên… {progress}%</span></div>}
            {uploadError && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{uploadError} {lastFile.current && <button type="button" className="btn-link" onClick={() => upload(lastFile.current)} disabled={busy}>Thử lại</button>}</span></p>}
          </div>
        )}
        {linkOk && (
          <div className={`field ${linkError ? 'is-invalid' : ''}`}><label htmlFor={`${formId}-link`}>Đường dẫn bài làm{format === 'link' ? ' (bắt buộc)' : ''}</label>
            <input id={`${formId}-link`} type="url" maxLength={2000} value={fields.link} placeholder="https://github.com/…" disabled={busy}
              onBlur={() => setTouched(true)} aria-invalid={!!linkError} aria-describedby={linkError ? `${formId}-link-err` : undefined}
              onChange={(e) => update({ ...fields, link: e.target.value })} />
            {linkError && <p className="field-error" id={`${formId}-link-err`}><Icon name="alert-circle" className="icon-sm" /><span>{linkError}</span></p>}
          </div>
        )}
      </>
    );
    content = (
      <form className={`stack-4 ${bare ? 'ln-task-fill' : ''}`.trim()} noValidate onSubmit={submit}>
        {isPending && <Alert type="info" body="Bài đã nộp vẫn được giữ cho đến khi bạn nộp lại." />}
        {codeLang ? (
          <>
            <div className="stack-2">
              <div className="stack-1"><strong className="small">Bài làm ({CODE_LANG[codeLang]})</strong>
                <span className="field-help">Viết code ngay tại đây và bấm Chạy để chạy trên máy chủ. Khi nộp, giảng viên nhận đúng đoạn code này.</span></div>
              {Codi.code && Codi.code.assignment
                ? Codi.code.assignment({ courseId, lessonId, assessmentId: a.id, title: a.title, instructions: a.instructions, language: codeLang, value: fields.code, readonly: busy, onCode: (code) => update({ ...fields, code }) })
                : null}
            </div>
            {(fileOk || linkOk) && (
              <details className="panel ln-alt-submit" open={!!(fileName || fields.link) || undefined}>
                <summary className="small strong">Hoặc nộp {fileOk && linkOk ? 'tệp hoặc đường dẫn' : fileOk ? 'tệp' : 'đường dẫn'}</summary>
                <div className="stack-4">{fileAndLink}</div>
              </details>
            )}
          </>
        ) : fileAndLink}
        <div className="field"><label htmlFor={`${formId}-note`}>{format === 'text' ? 'Bài làm (bắt buộc)' : 'Ghi chú cho giảng viên (không bắt buộc)'}</label>
          <textarea id={`${formId}-note`} rows={4} maxLength={10000} value={fields.note} disabled={busy} onChange={(e) => update({ ...fields, note: e.target.value })} />
          <span className="field-help" role="status">{saved}</span></div>
        {error && <Alert type="danger" body={error} />}
        <div className="ln-dock stack-2"><div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || !ready || !!linkError} aria-busy={busy || undefined}><Icon name="upload" className="icon-sm" /> {busy ? 'Đang gửi…' : 'Nộp bài tập'}</button>
          {isPending && <button type="button" className="btn btn-ghost" onClick={cancelResubmit} disabled={busy}>Huỷ nộp lại</button>}
        </div>
        {!ready && <p className="small muted">Cần {codeLang ? 'code bài làm' : format === 'file' ? 'tệp bài làm' : format === 'link' ? 'đường dẫn' : format === 'text' ? 'bài làm' : 'tệp hoặc đường dẫn'} trước khi nộp.</p>}</div>
      </form>
    );
  }
  return (
    <Shell id="assignment" label={a.title || 'Bài tập'} bare={bare} busy={busy}>
      <h2 className="ln-h">{a.title || 'Bài tập'}</h2>
      {a.instructions && <div className="panel stack-1"><span className="xsmall muted">Yêu cầu</span><p className="small ln-pre">{codeLang ? briefOf(a.instructions) : a.instructions}</p></div>}
      <p className="small muted">Thang điểm {maxScore} · điểm đạt {passPct}%{a.dueDays ? ` · hạn nộp ${a.dueDays} ngày sau khi mở bài` : ''}</p>
      {a.rubric && (
        <details className="panel ln-rubric" open={!!graded}><summary className="small strong">Thang chấm</summary>
          <RubricList raw={a.rubric} /></details>
      )}
      {error && !editing && <Alert type="danger" body={error} />}
      {content}
    </Shell>
  );
}
