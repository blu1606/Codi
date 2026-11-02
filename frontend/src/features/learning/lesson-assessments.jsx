/**
 * Quiz and assignment of a lesson (port of real components/lesson-assessment.tsx: QuizAssessment,
 * AssignmentAssessment, SubmissionContent).
 *
 * Quiz: an attempt is persisted as a draft (answers saved on every choice), keeps the question revision it started
 * with, and is graded on submit (real gradeQuiz). Every answered question is one BKT observation for the lesson's
 * concepts (real learning-path-service). The checklist needs the latest attempt to pass (D6).
 * Assignment: draft autosave (600 ms), per-assessment size limit (max 20 MB), file removal, resubmit only while
 * pending, graded work cannot be resubmitted. Files are simulated: only { name, size, type } is stored.
 * Late policy: the real app stores no late flag and enforces nothing; it shows the due days only.
 */
import { useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import {
  applyObservations, assignmentFileLimitMb, attemptQuestions, gradeQuiz, linkValid, mySubmission, persistNow, quizUnavailable,
  rec, save, scoreText, submissionFormat, uid,
} from './learning-store';

const scrollToId = (id) => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// ───────────────────────── quiz ─────────────────────────
export function QuizSection({ c, r, l, bare = false, onContinue }) {
  const qz = l.quiz;
  const st = r.quiz[l.id] || null;
  const pass = qz.passingScore != null ? qz.passingScore : 70;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inAttempt = !!st && (st.status === 'draft' || st.submitted);
  const questions = attemptQuestions(l, inAttempt ? st : null);
  const unavailable = quizUnavailable(questions);
  const answers = (st && st.answers) || {};
  const missing = questions.filter((q) => answers[q.id] === undefined).length;

  const startAttempt = async (kind) => {
    if (busy) return;
    setBusy(true); setError(null);
    const rr = rec(c.id); const prev = rr.quiz[l.id];
    const before = prev ? JSON.parse(JSON.stringify(prev)) : null;
    // A new start or retake uses the current revision; earlier attempts keep theirs.
    rr.quiz[l.id] = {
      status: 'draft', submitted: false, answers: {}, questions: JSON.parse(JSON.stringify(qz.questions)),
      attempts: prev ? prev.attempts || 0 : 0, score: null, passed: null,
      previousScore: kind === 'retake' && prev && prev.submitted ? prev.score : prev ? prev.previousScore ?? null : null,
    };
    save();
    const ok = await persistNow();
    if (!ok) { rec(c.id).quiz[l.id] = before || undefined; if (!before) delete rec(c.id).quiz[l.id]; save(); setError('Không thể lưu quiz.'); }
    setIndex(0); setBusy(false);
    if (ok) requestAnimationFrame(() => scrollToId('quiz'));
  };
  const answer = async (q, k) => {
    const rr = rec(c.id); const s = rr.quiz[l.id];
    if (!s || s.status !== 'draft') return;
    const before = s.answers[q.id];
    s.answers[q.id] = k; setError(null);
    save();
    if (!(await persistNow())) {
      const s2 = rec(c.id).quiz[l.id];
      if (s2 && s2.answers[q.id] === k) { if (before === undefined) delete s2.answers[q.id]; else s2.answers[q.id] = before; save(); }
      setError('Không thể lưu đáp án. Hãy chọn lại.');
    }
  };
  const submit = async () => {
    if (busy) return;
    if (missing) {
      const res = await Codi.ui.confirm({ title: `Còn ${missing} câu chưa trả lời`, body: 'Câu chưa trả lời sẽ được tính là sai. Bạn muốn nộp bài ngay?', confirmLabel: 'Vẫn nộp bài', cancelLabel: 'Quay lại làm tiếp' });
      if (!res.ok) return;
    }
    setBusy(true); setError(null);
    const rr = rec(c.id); const s = rr.quiz[l.id];
    const snapshot = { quiz: JSON.parse(JSON.stringify(s)), bkt: JSON.parse(JSON.stringify(rr.bkt)), mastery: { ...rr.mastery } };
    const g = gradeQuiz(questions, s.answers, pass);
    Object.assign(s, { status: 'graded', submitted: true, score: g.percent, passed: g.passed, attempts: (s.attempts || 0) + 1, submittedAt: new Date().toISOString() });
    // BKT evidence: each answered question is one observation for every concept the lesson teaches.
    const obs = [];
    questions.forEach((q) => { if (s.answers[q.id] === undefined) return; l.conceptIds.forEach((k) => obs.push({ conceptId: k, correct: s.answers[q.id] === q.correctIndex })); });
    applyObservations(c, rr, obs);
    save();
    const ok = await persistNow();
    setBusy(false);
    if (!ok) {
      const r2 = rec(c.id); r2.quiz[l.id] = snapshot.quiz; r2.bkt = snapshot.bkt; r2.mastery = snapshot.mastery; save();
      setError('Không thể lưu quiz.');
      return;
    }
    Codi.ui.toast(g.passed ? `Bạn đạt ${g.percent}%. Tốt lắm!` : 'Quiz chưa đạt. Bạn có thể làm lại.', { type: g.passed ? 'success' : 'warn' });
  };

  const head = (
    <div className="stack-1"><h2 className="ln-h">{qz.title || 'Quiz cuối bài'}</h2>
      <span className="small muted">{(st && st.status === 'draft' ? questions : qz.questions).length} câu · điểm đạt {pass}% · làm lại không giới hạn</span></div>
  );
  let body;
  if (unavailable) {
    body = <Alert type="info" body={unavailable} />;
  } else if (!st || (!st.submitted && st.status !== 'draft')) {
    body = <div className="ln-dock"><button type="button" className="btn btn-primary" onClick={() => startAttempt('open')} disabled={busy} aria-busy={busy || undefined}>Làm quiz</button></div>;
  } else if (st.status !== 'draft' && st.submitted) {
    const hasDetail = Object.keys(st.answers || {}).length > 0;
    body = (
      <>
        <div className="panel row ln-quiz-result">
          <p className="ln-score" aria-label={`Kết quả quiz: ${Math.round(st.score)}% đúng`}>{Math.round(st.score)}<span className="ln-score-unit">%</span></p>
          <div className="stack-1">
            <strong className={st.passed ? 'text-success' : 'text-warn'}>{st.passed ? 'Đạt' : 'Chưa đạt'}</strong>
            <span className="small muted">Điểm đạt: {pass}% · Lần làm {st.attempts || 1}</span>
            <span className="small muted">Làm lại không giới hạn; lần gần nhất được tính.</span>
          </div>
        </div>
        <details className="panel ln-quiz-review"><summary className="strong small">Xem đáp án và giải thích</summary>
          <ol className="stack-4 ln-review-list">{questions.map((q, i) => {
            const a = (st.answers || {})[q.id]; const ok = a === q.correctIndex;
            return (
              <li key={q.id} className="stack-1">
                <strong className="small">{i + 1}. {q.text}</strong>
                {hasDetail ? (
                  <>
                    <span className="small">Bạn chọn: {a === undefined ? 'Chưa trả lời' : q.options[a]}</span>
                    <span className={`small ${ok ? 'text-success' : 'text-warn'}`}>{ok ? 'Đúng' : 'Sai'} · Đáp án đúng: {q.options[q.correctIndex]}</span>
                    {q.explanation && <span className="small muted">{q.explanation}</span>}
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
    const i = Math.min(index, questions.length - 1); const q = questions[i];
    if (!q) body = <Alert type="info" body="Quiz chưa có câu hỏi. Vui lòng liên hệ giảng viên." />;
    else {
      const a = answers[q.id];
      body = (
        <>
          {st.previousScore != null && <p className="small muted">Kết quả lần trước: {st.previousScore}%. Cần nộp lần làm hiện tại để tính kết quả.</p>}
          <div className="row-between small"><strong>Câu {i + 1}/{questions.length}</strong><span className="muted">{questions.length - missing}/{questions.length} đã trả lời</span></div>
          <div className="ln-qnav" role="group" aria-label="Đi đến câu hỏi">{questions.map((x, k) => {
            const answered = answers[x.id] !== undefined;
            return <button key={x.id} type="button" disabled={busy} className={`${answered ? 'is-answered' : ''} ${k === i ? 'is-current' : ''}`.trim()} aria-label={`Câu ${k + 1}${answered ? ', đã trả lời' : ', chưa trả lời'}`} aria-current={k === i ? 'step' : undefined} onClick={() => setIndex(k)}><i /></button>;
          })}</div>
          <fieldset className="stack-3 ln-fieldset" disabled={busy}>
            <legend className="ln-question">{q.text}</legend>
            {q.codeSnippet && <pre className="ln-code"><code>{q.codeSnippet}</code></pre>}
            <div className="choice-list">{q.options.map((o, k) => (
              <label key={k} className={`choice ${a === k ? 'is-selected' : ''}`}><input type="radio" name={`quiz-${l.id}-${q.id}`} value={k} checked={a === k} onChange={() => answer(q, k)} /><span className="choice-body"><span className="choice-title">{o}</span></span></label>
            ))}</div>
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
  const inner = (
    <>
      {head}
      {qz.instructions && <p className="small">{qz.instructions}</p>}
      {error && <Alert type="danger" body={error} />}
      {body}
    </>
  );
  // bare: rendered inside the lesson page's task tab (no card); the action row is pinned to the tab's bottom.
  if (bare) return <section className="ln-task" id="quiz" aria-label={qz.title || 'Quiz cuối bài'} aria-busy={busy || undefined}>{inner}</section>;
  return <section className="card" id="quiz" aria-busy={busy || undefined}><div className="card-body stack-4">{inner}</div></section>;
}

// ───────────────────────── assignment ─────────────────────────
const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function SubmissionContent({ sub }) {
  return (
    <div className="stack-1 small ln-sub-content">
      {sub.fileName && <span className="row"><Icon name="file-text" className="icon-sm" /> {sub.fileName}{sub.fileSize ? <span className="muted"> · {sizeText(sub.fileSize)}</span> : null}</span>}
      {sub.link && <a className="row" href={/^https?:\/\//.test(sub.link) ? sub.link : undefined} target="_blank" rel="noopener noreferrer"><Icon name="link" className="icon-sm" /> {sub.link}</a>}
      {sub.note && <p className="ln-pre">{sub.note}</p>}
    </div>
  );
}

export function AssignmentSection({ c, r, l, bare = false }) {
  const a = l.assignment;
  const sub = mySubmission(l.id);
  const format = submissionFormat(a);
  const limitMb = assignmentFileLimitMb(a);
  const maxScore = Number(a.maxScore) || 10;
  const passPct = Math.round(((a.passScore != null ? Number(a.passScore) : 5) / maxScore) * 100);
  const stored = r.draft[l.id] || {};
  const [fields, setFields] = useState({ link: stored.link || '', note: stored.note || '' });
  const [editing, setEditing] = useState(!sub || !!stored.resubmit);
  const [saved, setSaved] = useState(stored.link || stored.note || stored.fileName ? 'Đã khôi phục bản nháp.' : 'Bản nháp được lưu tự động.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const timer = useRef(null);
  const uploadTimer = useRef(null);
  const lastFile = useRef(null);
  const pending = useRef(null);

  const writeDraft = (patch) => { const rr = rec(c.id); rr.draft[l.id] = { ...(rr.draft[l.id] || {}), ...patch, savedAt: new Date().toISOString() }; save(false); };
  const flushDraft = async () => {
    clearTimeout(timer.current);
    if (!pending.current) return true;
    const next = pending.current; pending.current = null;
    writeDraft(next);
    return persistNow();
  };
  // Keep the last keystrokes when the learner leaves before the debounce fires.
  useEffect(() => () => { clearTimeout(timer.current); clearInterval(uploadTimer.current); if (pending.current) { writeDraft(pending.current); pending.current = null; persistNow(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next) => {
    setFields(next); setSaved('Chưa lưu…');
    clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(async () => {
      const ok = await flushDraft();
      setSaved(ok ? 'Đã lưu bản nháp.' : 'Chưa lưu được bản nháp. Vui lòng thử lại.');
    }, 600);
  };
  const draft = r.draft[l.id] || {};
  const fileName = draft.fileName || '';
  const linkTrim = fields.link.trim();
  const ready = format === 'file' ? !!fileName : format === 'link' ? !!linkTrim : format === 'text' ? !!fields.note.trim() : !!fileName || !!linkTrim;
  const linkError = touched && fields.link && !linkValid(fields.link) ? 'Đường dẫn chưa hợp lệ. Hãy bắt đầu bằng https://' : null;

  const upload = async (file) => {
    if (busy) return;
    lastFile.current = file;
    setUploadError(null); setError(null);
    if (file.size > limitMb * 1024 * 1024) { setUploadError(`Tệp vượt quá ${limitMb}MB. Hãy nén lại hoặc nộp đường dẫn.`); return; }
    if (!file.size) { setUploadError('Tệp bài làm trống hoặc không hợp lệ.'); return; }
    setBusy(true); setProgress(0);
    await flushDraft();
    // Simulated transfer (no file storage in the prototype). A file name containing "loi" simulates a lost connection.
    await new Promise((resolve, reject) => {
      let pct = 0;
      uploadTimer.current = setInterval(() => {
        pct = Math.min(100, pct + 20);
        setProgress(pct);
        if (/loi/i.test(file.name) && pct >= 60) { clearInterval(uploadTimer.current); reject(new Error('Tải lên thất bại do mất kết nối.')); }
        else if (pct >= 100) { clearInterval(uploadTimer.current); resolve(); }
      }, 250);
    }).then(async () => {
      writeDraft({ ...fields, fileName: file.name, fileSize: file.size, fileType: file.type || '' });
      const ok = await persistNow();
      if (!ok) throw new Error('Không thể tải tệp lên. Vui lòng thử lại.');
      setSaved('Đã lưu tệp và bản nháp.');
      save();
    }).catch((e) => setUploadError(e instanceof Error ? e.message : 'Tải lên thất bại. Vui lòng thử lại.'));
    setBusy(false); setProgress(null);
  };
  const removeFile = async () => {
    if (busy) return;
    setBusy(true);
    await flushDraft();
    writeDraft({ ...fields, fileName: '', fileSize: 0, fileType: '' });
    const ok = await persistNow();
    if (!ok) setError('Không thể gỡ tệp.');
    lastFile.current = null;
    save();
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
    const rr = rec(c.id); const d = { ...(rr.draft[l.id] || {}), ...fields };
    const s = mySubmission(l.id);
    const now = new Date().toISOString();
    const before = s ? { ...s } : null;
    let createdId = null;
    Codi.set((state) => {
      if (s && s.status === 'pending') {
        Object.assign(s, { link: linkTrim || null, fileName: d.fileName || null, fileSize: d.fileSize || null, fileType: d.fileType || null, note: (d.note || '').trim(), submittedAt: now, revision: (s.revision || 1) + 1 });
      } else {
        createdId = Codi.uid('sub');
        state.db.submissions.push({ id: createdId, courseId: c.id, lessonId: l.id, userId: uid(), submittedAt: now, fileName: d.fileName || null, fileSize: d.fileSize || null, fileType: d.fileType || null, link: linkTrim || null, note: (d.note || '').trim(), status: 'pending', score: null, maxScore, passScore: a.passScore != null ? Number(a.passScore) : 5, feedback: '', gradedAt: null, revision: 1 });
      }
      rr.draft[l.id] = {};
    });
    const ok = await persistNow();
    setBusy(false);
    if (!ok) {
      Codi.set((state) => {
        if (createdId) state.db.submissions = state.db.submissions.filter((x) => x.id !== createdId);
        else if (s && before) Object.assign(s, before);
        rec(c.id).draft[l.id] = d;
      });
      setError('Không thể nộp bài.');
      return;
    }
    setEditing(false); setUploadError(null);
    Codi.ui.toast('Đã nộp bài tập. Bạn có thể hoàn thành bài học ngay.', { type: 'success' });
  };
  const openResubmit = async () => {
    if (busy || !sub) return;
    setBusy(true);
    writeDraft({ link: sub.link || '', note: sub.note || '', fileName: sub.fileName || '', fileSize: sub.fileSize || 0, fileType: sub.fileType || '', resubmit: true });
    const ok = await persistNow();
    setBusy(false);
    if (!ok) { setError('Không thể mở bản nháp.'); return; }
    setFields({ link: sub.link || '', note: sub.note || '' });
    setSaved('Bản nháp được lưu tự động.');
    setEditing(true); save();
  };
  const cancelResubmit = async () => {
    if (busy) return;
    clearTimeout(timer.current); pending.current = null;
    setBusy(true);
    rec(c.id).draft[l.id] = {};
    save(false);
    const ok = await persistNow();
    setBusy(false);
    if (!ok) { setError('Chưa thể huỷ nộp lại. Vui lòng thử lại.'); return; }
    setEditing(false); save();
  };

  const graded = sub && sub.status === 'graded';
  let content;
  if (graded) {
    const passed = (sub.score / (sub.maxScore || maxScore)) * 100 >= passPct;
    content = (
      <div className={`ln-grade ${passed ? 'is-pass' : 'is-fail'} stack-2`}>
        <strong className="row"><Icon name={passed ? 'check-circle' : 'alert-triangle'} /> Đã chấm: {scoreText(sub.score)}/{sub.maxScore || maxScore}</strong>
        <p className="small">{passed ? 'Đạt' : 'Chưa đạt'}</p>
        <span className="xsmall muted">Nhận xét của giảng viên{sub.gradedAt ? ` · ${Codi.fmt.date(sub.gradedAt)}` : ''}</span>
        <p className="small ln-pre">{sub.feedback || 'Không có nhận xét.'}</p>
        <p className="xsmall muted">Bài đã chấm không thể nộp lại.</p>
        <SubmissionContent sub={sub} />
      </div>
    );
  } else if (sub && sub.status === 'pending' && !editing) {
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
    content = (
      <form className={`stack-4 ${bare ? "ln-task-fill" : ""}`.trim()} noValidate onSubmit={submit}>
        {sub && sub.status === 'pending' && <Alert type="info" body="Bài đã nộp vẫn được giữ cho đến khi bạn nộp lại." />}
        {fileOk && (
          <div className="field"><label htmlFor={`as-file-${l.id}`}>Tệp bài làm{format === 'file' ? ' (bắt buộc)' : ''}</label>
            <input id={`as-file-${l.id}`} type="file" disabled={busy} accept={a.acceptedTypes || undefined} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) upload(f); }} />
            <span className="field-help">{a.acceptedTypes ? `${a.acceptedTypes} · ` : ''}Tối đa {limitMb}MB</span>
            {fileName && (
              <div className="row ln-file-row"><span className="small">Tệp đã lưu: {fileName}{draft.fileSize ? <span className="muted"> · {sizeText(draft.fileSize)}</span> : null}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={removeFile} disabled={busy}>Gỡ tệp</button></div>
            )}
            {progress !== null && <div className="stack-1" role="status"><div className="progress" role="progressbar" aria-label="Tiến độ tải lên" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + '%' }} /></div><span className="small">Đang tải lên… {progress}%</span></div>}
            {uploadError && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{uploadError} {lastFile.current && <button type="button" className="btn-link" onClick={() => upload(lastFile.current)} disabled={busy}>Thử lại</button>}</span></p>}
          </div>
        )}
        {linkOk && (
          <div className={`field ${linkError ? 'is-invalid' : ''}`}><label htmlFor={`as-link-${l.id}`}>Đường dẫn bài làm{format === 'link' ? ' (bắt buộc)' : ''}</label>
            <input id={`as-link-${l.id}`} type="url" maxLength={2000} value={fields.link} placeholder="https://github.com/…" disabled={busy}
              onBlur={() => setTouched(true)} aria-invalid={!!linkError} aria-describedby={linkError ? `as-link-err-${l.id}` : undefined}
              onChange={(e) => update({ ...fields, link: e.target.value })} />
            {linkError && <p className="field-error" id={`as-link-err-${l.id}`}><Icon name="alert-circle" className="icon-sm" /><span>{linkError}</span></p>}
          </div>
        )}
        <div className="field"><label htmlFor={`as-note-${l.id}`}>{format === 'text' ? 'Bài làm (bắt buộc)' : 'Ghi chú cho giảng viên (không bắt buộc)'}</label>
          <textarea id={`as-note-${l.id}`} rows={4} maxLength={10000} value={fields.note} disabled={busy} onChange={(e) => update({ ...fields, note: e.target.value })} />
          <span className="field-help" role="status">{saved}</span></div>
        {error && <Alert type="danger" body={error} />}
        <div className="ln-dock stack-2"><div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || !ready || !!linkError} aria-busy={busy || undefined}><Icon name="upload" className="icon-sm" /> {busy ? 'Đang gửi…' : 'Nộp bài tập'}</button>
          {sub && sub.status === 'pending' && <button type="button" className="btn btn-ghost" onClick={cancelResubmit} disabled={busy}>Huỷ nộp lại</button>}
        </div>
        {!ready && <p className="small muted">Cần {format === 'file' ? 'tệp bài làm' : format === 'link' ? 'đường dẫn' : format === 'text' ? 'bài làm' : 'tệp hoặc đường dẫn'} trước khi nộp.</p>}</div>
      </form>
    );
  }
  const inner = (
    <>
      <h2 className="ln-h">{a.title || 'Bài tập'}</h2>
      {a.instructions && <div className="panel stack-1"><span className="xsmall muted">Yêu cầu</span><p className="small ln-pre">{a.instructions}</p></div>}
      <p className="small muted">Thang điểm {maxScore} · điểm đạt {passPct}%{a.dueDays ? ` · hạn nộp ${a.dueDays} ngày sau khi mở bài` : ''}</p>
      {(a.rubric || []).length > 0 && (
        <details className="panel ln-rubric" open={!!graded}><summary className="small strong">Thang chấm</summary>
          <ul className="list">{a.rubric.map((k) => (
            <li key={k.id} className="list-row"><div className="list-main"><strong className="small">{k.name}</strong><span className="xsmall muted">{k.desc}</span></div>
              <span className="small od-nowrap">{graded && sub.rubricScores && sub.rubricScores[k.id] != null ? <><strong>{scoreText(sub.rubricScores[k.id])}</strong>/{k.points}</> : `${k.points} điểm`}</span></li>
          ))}</ul></details>
      )}
      {error && !editing && <Alert type="danger" body={error} />}
      {content}
    </>
  );
  if (bare) return <section className="ln-task" id="assignment" aria-label={a.title || 'Bài tập'} aria-busy={busy || undefined}>{inner}</section>;
  return <section className="card" id="assignment" aria-busy={busy || undefined}><div className="card-body stack-4">{inner}</div></section>;
}
