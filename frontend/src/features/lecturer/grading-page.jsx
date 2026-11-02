// S26 grading queue + split grading view on Codi's grading actions (getGradingQueueData / gradeSubmission):
// course · assignment · date filters, rubric or single score, pass threshold as a percent of maxScore, score edits
// that need a reason (≥ 3 chars) and are kept in a history sheet, snippet picker with {{placeholders}}, "save and
// grade next", stale-view protection through the server's view token. The AI grading suggestion card and list badge
// are owned by the lecturer-ai feature (Codi.lecturerAI.gradingDraft / gradingBadge, on Codi's getAiGradingDraft
// action); the lecturer accepts, edits or ignores each suggested item and the AI only fills the form (G5).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRevealOnSelect } from './reveal-on-select';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon } from '../../components/ui/primitives';
import { shell, decimal, promptReason, guard, Loading, LoadError } from './teach-api';
import { act, reloadMine } from './teach-data';

const { fmt } = Codi;
const parseNum = (t) => Number(String(t ?? '').replace(',', '.').trim());
const round1 = (n) => Math.round(n * 10) / 10;
/** Rubric criterion in the form's shape (the backend accepts several field spellings). */
const criterion = (k) => ({ id: String(k.id), name: k.name || k.title || k.label || 'Tiêu chí', desc: k.desc || k.description || '', points: Number(k.points ?? k.maxScore ?? 0) });
/** Real applySnippetPlaceholders: {{x}} and {x} both work; name falls back to "em", score to "—". */
export const applySnippet = (text, name, score) => String(text)
  .replace(/\{\{\s*ten_hoc_vien\s*\}\}|\{ten_hoc_vien\}/g, name || 'em')
  .replace(/\{\{\s*diem\s*\}\}|\{diem\}/g, score === '' || score == null || Number.isNaN(score) ? '—' : decimal(score));

const DATE_OPTS = [['all', 'Tất cả ngày nộp'], ['today', 'Hôm nay'], ['7days', '7 ngày qua'], ['30days', '30 ngày qua']];

/** Real computeRubricTotal: every criterion required and within 0…points; total rounded to 0.1. */
function rubricTotal(rb, scores) {
  let total = 0; const errors = {};
  rb.forEach((k) => {
    const raw = String(scores[k.id] ?? '').trim(); const n = parseNum(raw);
    if (raw === '' || Number.isNaN(n)) errors[k.id] = `Vui lòng nhập điểm cho "${k.name}".`;
    else if (n < 0 || n > k.points) errors[k.id] = `Điểm "${k.name}" phải từ 0 đến ${k.points}.`;
    else total += n;
  });
  return { total: round1(total), errors, isValid: !Object.keys(errors).length };
}

function SnippetPicker({ handle, learnerName, score, onInsert }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { act('snippets', 'getFeedbackSnippets').then(setList, setError); }, []);
  return (
    <>
      <div className="dialog-body stack-3">
        <p className="small muted">Chọn mẫu để chèn vào nhận xét. Các biến tên và điểm số sẽ được tự động điền.</p>
        {error ? <Alert type="danger" body={error.message || 'Không tải được mẫu nhận xét.'} />
          : !list ? <div className="skeleton skeleton-line" style={{ height: 64 }} role="status" aria-label="Đang tải mẫu nhận xét" />
            : list.length ? list.map((s) => (
              <div key={s.id} className="panel stack-2"><div className="row-between"><strong className="small">{s.title}</strong>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onInsert(applySnippet(s.body, learnerName, score), s.title); handle.close(); }}>Chèn</button></div>
                <p className="xsmall muted od-clamp-3" style={{ whiteSpace: 'pre-line' }}>{s.body}</p></div>
            )) : <div className="stack-2" style={{ textAlign: 'center', padding: 24 }}><p className="small muted">Chưa có mẫu nhận xét nào.</p><Link className="small" to="/teach/snippets" onClick={() => handle.close()}>Tạo mẫu ngay trong trang quản lý mẫu <Icon name="chevron-right" className="icon-sm" /></Link></div>}
      </div>
      <div className="dialog-footer row-between"><Link className="small muted" to="/teach/snippets" onClick={() => handle.close()}>Quản lý danh sách mẫu →</Link><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Đóng</button></div>
    </>
  );
}
const openSnippetPicker = (props) => Codi.ui.modal({ title: 'Mẫu nhận xét', raw: true, body: (h) => <SnippetPicker handle={h} {...props} /> });

function openHistory(sel) {
  const list = (sel.history || []).slice().reverse(); // newest first
  Codi.ui.sheet({
    title: 'Lịch sử chỉnh sửa điểm',
    body: <div className="stack-3"><p className="small muted">Bài nộp của {sel.studentName || 'học viên'}</p>
      {list.length ? list.map((h, i) => (
        <div key={i} className="panel stack-1"><div className="row-between small strong"><span>Lần sửa {list.length - i}</span><span className="xsmall muted">{h.at ? fmt.datetime(h.at) : ''}</span></div>
          <p className="small">Điểm cũ: <strong className="mono">{decimal(h.oldScore)}</strong> → Điểm mới: <strong className="mono text-accent">{decimal(h.newScore)}</strong></p>
          {h.reason && <p className="xsmall muted"><em>Lý do: &quot;{h.reason}&quot;</em></p>}
          {h.feedback && <p className="xsmall muted od-clamp-2">Nhận xét: {h.feedback}</p>}</div>
      )) : <p className="small muted" style={{ textAlign: 'center', padding: 24 }}>Không có lần chỉnh sửa nào trước đó.</p>}</div>,
  });
}

/** Submission + assignment in the shape the lecturer-ai grading card reads (the view token pins the suggestion). */
const aiSubmission = (sel) => ({ id: sel.id, viewToken: sel.viewToken, maxScore: sel.maxScore });
const aiAssignment = (sel, rb) => ({ rubric: rb });

/** Stable call site for Codi.lecturerAI.gradingDraft; without it, the real disabled "Sắp có" state. */
function AiGradingSlot({ sel, rb, onApply }) {
  const AI = Codi.lecturerAI;
  if (AI && typeof AI.gradingDraft === 'function') return AI.gradingDraft({ submission: aiSubmission(sel), assignment: aiAssignment(sel, rb), onApply });
  return (
    <div className="stack-1"><span className="row" style={{ gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" disabled><Icon name="sparkles" className="icon-sm" /> AI gợi ý điểm và nhận xét</button><span className="badge badge-neutral">Sắp có</span></span>
      <p className="small muted" role="status">AI chấm bài chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm.</p></div>
  );
}

function GradeForm({ sel, nextPendingId, go, filters }) {
  const u = { name: sel.studentName || 'Học viên', email: sel.studentEmail || '', image: sel.studentAvatar || null };
  const rb = (sel.rubric || []).map(criterion);
  const [scores, setScores] = useState(() => { const prev = sel.rubricScores || {}; return Object.fromEntries(rb.map((k) => [k.id, prev[k.id] == null || Number.isNaN(prev[k.id]) ? '' : String(prev[k.id])])); });
  const [score, setScore] = useState(sel.score == null ? '' : String(sel.score));
  const [feedback, setFeedback] = useState(sel.feedback || '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Unsaved edits: compare with the values the form loaded (or last saved). A dirty form sets the shared guard, so
  // switching submissions, leaving the page and closing the tab ask first (see teach-api guard).
  const snapshot = () => JSON.stringify({ scores, score, feedback });
  const baseline = useRef(null);
  if (baseline.current === null) baseline.current = snapshot();
  const dirty = snapshot() !== baseline.current;
  useEffect(() => {
    if (!dirty) return undefined;
    guard.dirty = { owner: sel.id, label: `Phiếu chấm của ${u.name}`, scope: `/teach/grading/${sel.id}`, reset: () => {} };
    return () => { if (guard.dirty && guard.dirty.owner === sel.id) guard.dirty = null; };
  }, [dirty, sel.id, u.name]);
  const calc = rb.length ? rubricTotal(rb, scores) : null;
  const current = rb.length ? calc.total : parseNum(score);
  const pct = sel.passingScore ?? 50;
  const passAbs = round1((pct / 100) * sel.maxScore);

  const save = async (action) => {
    if (saving) return;
    setError(null);
    let finalScore; let rubricScores;
    if (rb.length) {
      if (!calc.isValid) { setError(Object.values(calc.errors)[0] || 'Vui lòng chấm đủ tất cả các tiêu chí theo rubric.'); return; }
      finalScore = calc.total;
      rubricScores = Object.fromEntries(rb.map((k) => [k.id, parseNum(scores[k.id])]));
    } else {
      const raw = String(score).replace(',', '.').trim(); const n = parseFloat(raw);
      if (raw === '' || Number.isNaN(n) || n < 0 || n > sel.maxScore) { setError(`Nhập điểm hợp lệ từ 0 đến ${sel.maxScore}.`); return; }
      finalScore = round1(n);
    }
    const changed = sel.status === 'graded' && sel.score !== finalScore;
    let reason;
    if (changed) {
      const r = await promptReason({
        title: 'Sửa điểm bài đã chấm',
        body: <p className="small muted">Bạn đang sửa điểm từ <strong className="text-fg">{decimal(sel.score)}</strong> thành <strong className="text-accent">{decimal(finalScore)}</strong>.</p>,
        consequence: 'Học viên sẽ nhận thông báo điểm bài tập đã được cập nhật.', reversible: 'Lịch sử chỉnh sửa điểm sẽ được lưu lại.',
        label: 'Lý do', min: 3, error: 'Vui lòng nhập lý do điều chỉnh điểm số (tối thiểu 3 ký tự).', confirmLabel: 'Cập nhật điểm',
      });
      if (!r.ok) return;
      reason = r.reason;
    }
    setSaving(true);
    let res;
    try {
      res = await act('grading', 'gradeSubmission', {
        submissionId: sel.id, viewToken: sel.viewToken, score: finalScore, feedback: feedback.trim(),
        ...(reason ? { reason } : {}), ...(rubricScores ? { rubricScores } : {}),
        courseFilter: filters.course, assignmentFilter: filters.assignment, dateFilter: filters.date,
      });
    } catch (e) {
      res = { success: false, error: (e && e.message) || 'Không thể lưu điểm bài tập.' };
    }
    setSaving(false);
    if (!res || !res.success) { setError((res && res.error) || 'Không thể lưu điểm bài tập.'); return; }
    baseline.current = snapshot(); guard.dirty = null;
    reloadMine();
    Codi.ui.toast('Đã lưu điểm và gửi thông báo cho học viên.', { type: 'success' });
    const next = res.nextPendingId || nextPendingId;
    if (action === 'next' && next) go({ status: 'pending', id: next });
    else go({ status: 'graded', id: sel.id });
  };
  // Skipping drops unsaved edits, so it asks first; the confirm states the consequence.
  const skip = async () => {
    if (dirty) {
      const r = await Codi.ui.confirm({
        title: 'Bỏ thay đổi chưa lưu?', body: `Điểm và nhận xét bạn vừa nhập cho ${u.name} chưa được lưu.`,
        consequence: 'Chuyển sang bài tiếp theo sẽ bỏ các thay đổi này.', reversible: 'Bạn phải nhập lại nếu muốn giữ chúng.', confirmLabel: 'Bỏ thay đổi, sang bài tiếp theo',
      });
      if (!r.ok) return;
      guard.dirty = null;
    }
    go({ status: 'pending', id: nextPendingId });
  };
  const insert = (text, title) => { setFeedback((cur) => (cur.trim() ? `${cur.trim()}\n\n${text}` : text)); Codi.ui.toast(`Đã chèn mẫu "${title}"`, { type: 'success' }); };
  const applyAI = (d) => {
    if (!d) return;
    if (rb.length && d.scores) setScores((prev) => ({ ...prev, ...Object.fromEntries(rb.filter((k) => d.scores[k.id] != null).map((k) => [k.id, String(d.scores[k.id])])) }));
    else if (!rb.length && d.score != null) setScore(String(d.score));
    if (d.feedback) setFeedback((fb) => (fb.trim() ? `${fb.trim()}\n\n${d.feedback}` : d.feedback));
  };

  return (
    <form className="tc-dock-form" onSubmit={(e) => { e.preventDefault(); save('stay'); }} noValidate aria-busy={saving}>
      <div className="card-header"><div className="row" style={{ minWidth: 0 }}><Avatar user={u} /><div className="stack-1" style={{ minWidth: 0 }}><strong className="small od-truncate">{u.name}</strong><span className="xsmall muted od-truncate">{u.email}</span></div></div>
        <span className={`badge ${sel.status === 'graded' ? 'badge-success' : 'badge-warn'}`}>{sel.status === 'graded' ? 'Đã chấm' : 'Chờ chấm'}</span></div>
      <div className="card-body stack-4 tc-dock-body">
        <AiGradingSlot sel={sel} rb={rb} onApply={applyAI} />
        {error && <Alert type="danger" body={error} />}
        {rb.length ? (
          <fieldset className="stack-2 tc-rubric-grade"><legend className="field-label">Chấm theo thang điểm Rubric <span className="req">*</span></legend>
            {rb.map((k) => (
              <div key={k.id} className={`tc-rg-row ${calc.errors[k.id] && error ? 'is-invalid' : ''}`}><label className="stack-1 od-fill" htmlFor={`g-r-${k.id}`}><span className="small strong">{k.name}</span>{k.desc && <span className="xsmall muted">{k.desc}</span>}</label>
                <span className="row" style={{ gap: 4 }}><input id={`g-r-${k.id}`} className="input mono" type="number" min="0" max={k.points} step="0.5" value={scores[k.id] ?? ''} onChange={(e) => setScores({ ...scores, [k.id]: e.target.value })} /><span className="xsmall muted od-nowrap">/ {k.points}</span></span></div>
            ))}
            <div className="panel row-between small" role="status"><strong>Tổng điểm: <span className="mono text-accent">{decimal(calc.total)}/{sel.maxScore}</span></strong><span className="muted">Ngưỡng đạt: {pct}%</span></div>
            {sel.status === 'graded' && !sel.rubricScores && sel.score != null && <Alert type="info" body={`Bài này được chấm trước khi có thang chi tiết: điểm đã lưu là ${decimal(sel.score)}/${sel.maxScore}. Nhập từng tiêu chí rồi cập nhật điểm để thay thế.`} />}
          </fieldset>
        ) : (
          <div className="field"><span className="row-between"><label htmlFor="g-score">Điểm (0–{sel.maxScore}) <span className="req">*</span></label><span className="xsmall muted">Ngưỡng đạt: {decimal(passAbs)}/{sel.maxScore}</span></span>
            <input id="g-score" name="score" className="mono" type="number" min="0" max={sel.maxScore} step="0.5" placeholder="Ví dụ: 8.5" value={score} onChange={(e) => setScore(e.target.value)} /></div>
        )}
        <div className="field"><span className="row-between"><label className="field-label" htmlFor="g-fb">Nhận xét cho học viên</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSnippetPicker({ learnerName: u.name, score: Number.isNaN(current) ? '' : current, onInsert: insert })}><Icon name="list" className="icon-sm" /> Mẫu nhận xét</button></span>
          <textarea id="g-fb" name="feedback" rows={6} placeholder="Điểm làm tốt, điểm cần cải thiện, gợi ý bước tiếp theo..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <span className="field-help">Bấm <strong>&quot;Mẫu nhận xét&quot;</strong> để chèn mẫu có sẵn kèm tên và điểm số.</span></div>
      </div>
      <div className="tc-grade-actions">
        <p className="xsmall tc-grade-state" role="status" aria-live="polite">{dirty ? <><span className="tc-state-dot" aria-hidden="true" />Có thay đổi chưa lưu</> : 'Không có thay đổi chưa lưu'}</p>
        <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : sel.status === 'graded' ? 'Cập nhật điểm' : 'Lưu điểm'}</button>
        {nextPendingId ? <>
          <button type="button" className="btn btn-secondary btn-block" disabled={saving} onClick={() => save('next')}>Lưu và chấm bài tiếp theo <Icon name="arrow-right" className="icon-sm" /></button>
          <button type="button" className="btn btn-ghost btn-sm btn-block" disabled={saving} onClick={skip}>Bỏ qua, sang bài tiếp theo</button>
        </> : <p className="xsmall muted" style={{ textAlign: 'center' }}>Đây là bài chờ chấm cuối cùng.</p>}
        {sel.status === 'graded' && <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => openHistory(sel)}><Icon name="clock" className="icon-sm" /> Xem lịch sử điểm ({(sel.history || []).length} lần sửa)</button>}
      </div>
    </form>
  );
}

/** Loads the queue for the current filters; refetches whenever they change. */
function useQueue(filters) {
  const key = JSON.stringify(filters);
  const [st, setSt] = useState({ data: null, error: null, key: null });
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, error: null }));
    const f = JSON.parse(key);
    try {
      const data = await act('grading', 'getGradingQueueData', {
        status: f.status, ...(f.course !== 'all' ? { courseId: f.course } : {}), ...(f.assignment !== 'all' ? { assignmentId: f.assignment } : {}),
        ...(f.date !== 'all' ? { date: f.date } : {}), ...(f.id ? { submissionId: Number(f.id) } : {}),
      });
      setSt({ data, error: null, key });
    } catch (error) { setSt((x) => ({ ...x, error })); }
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load, fresh: st.key === key };
}

export function GradingPage({ params, query }) {
  useCodi();
  const detailRef = useRevealOnSelect(params.submissionId || (query.status === 'graded' ? 'graded' : 'pending'));
  const status = query.status === 'graded' ? 'graded' : 'pending';
  const DATE_KEYS = DATE_OPTS.map(([k]) => k);
  const filters = { status, course: query.course || 'all', assignment: query.assignment || 'all', date: DATE_KEYS.includes(query.date) ? query.date : 'all', id: params.submissionId || null };
  const q = useQueue(filters);
  const qs = (o = {}) => {
    const sp = new URLSearchParams();
    sp.set('status', o.status || status);
    const c = o.course !== undefined ? o.course : filters.course; if (c !== 'all') sp.set('course', c);
    const a = o.assignment !== undefined ? o.assignment : filters.assignment; if (a !== 'all') sp.set('assignment', a);
    const d = o.date !== undefined ? o.date : filters.date; if (d !== 'all') sp.set('date', d);
    return '?' + sp.toString();
  };
  const go = ({ id, ...o }) => Codi.go(`/teach/grading${id ? '/' + id : ''}${qs(o)}`);
  const head = <div className="page-header"><div><h1>Chấm bài</h1><p className="muted">Chấm từng bài; học viên nhận thông báo ngay khi có điểm.</p></div></div>;
  if (!q.data) return shell('/teach/grading', <>{head}{q.error ? <LoadError error={q.error} onRetry={q.reload} /> : <Loading rows={5} />}</>);

  const d = q.data;
  const courseF = d.selectedCourseId || 'all';
  const assignF = d.selectedAssignmentId || 'all';
  const assignOpts = (d.assignments || []).filter((a) => courseF === 'all' || a.courseId === courseF);
  const courseTitle = (id) => ((d.courses || []).find((c) => c.id === id) || {}).title || '';
  const list = d.submissions || [];
  const sel = d.selectedSubmission;
  const item = (s) => (
    <Link key={s.id} className="split-list-item" to={`/teach/grading/${s.id}${qs()}`} aria-current={sel && sel.id === s.id ? 'true' : undefined}>
      <span className="row-between"><strong className="small">{s.studentName || 'Học viên'}</strong>{s.status === 'graded' ? <span className="badge badge-success">{decimal(s.score)}/{s.maxScore}</span> : <span className="xsmall muted">{s.submittedAt ? fmt.relative(s.submittedAt) : ''}</span>}</span>
      <span className="xsmall muted od-truncate">{s.lessonTitle || 'Bài tập'} · {s.courseTitle || ''}</span>
      {Codi.lecturerAI?.gradingBadge?.(s.id)}</Link>
  );
  let detail;
  if (!sel) {
    detail = <div className="card"><Empty icon="clipboard-check" title={status === 'pending' ? 'Không có bài nào chờ chấm' : 'Chưa có bài đã chấm'} body={status === 'pending' ? 'Bạn đã chấm hết các bài nộp. Bài làm mới của học viên sẽ xuất hiện tại đây.' : 'Các bài sau khi chấm điểm sẽ được lưu trữ tại tab này.'} /></div>;
  } else {
    const hasWork = sel.fileName || sel.linkUrl || sel.answerText;
    detail = (
      <div className="tc-grade">
        <section className="card tc-stage">
          <div className="card-header"><div className="stack-1"><span className="xsmall muted">{sel.courseTitle || ''}</span><h2 className="tc-h">{sel.lessonTitle || 'Bài tập'}</h2><span className="xsmall muted">{sel.submittedAt ? `Nộp lúc ${fmt.datetime(sel.submittedAt)}` : ''}</span></div></div>
          <div className="card-body stack-4">
            <div className="stack-1"><strong className="xsmall muted">Yêu cầu bài tập</strong><div className="panel small" style={{ whiteSpace: 'pre-line' }}>{sel.instructions || 'Không có nội dung yêu cầu cụ thể.'}</div></div>
            <div className="stack-2"><strong className="xsmall muted">Nội dung bài nộp</strong>
              {sel.fileName && <div className="panel row-between"><span className="row small" style={{ minWidth: 0 }}><Icon name="file-text" className="icon-sm" /> <span className="mono od-truncate">{sel.fileName}</span></span>
                {sel.fileUrl ? <a className="btn btn-ghost btn-sm" href={sel.fileUrl} target="_blank" rel="noopener noreferrer"><Icon name="download" className="icon-sm" /> Tải về</a>
                  : <button type="button" className="btn btn-ghost btn-sm" onClick={() => Codi.ui.toast(`Tệp "${sel.fileName}" chưa có đường dẫn tải về.`, { type: 'info' })}><Icon name="download" className="icon-sm" /> Tải về</button>}</div>}
              {sel.linkUrl && <div className="panel row small"><Icon name="external-link" className="icon-sm" /> <a className="mono od-truncate" href={sel.linkUrl} target="_blank" rel="noopener noreferrer">{sel.linkUrl}</a></div>}
              {sel.answerText && <div className="stack-1"><span className="xsmall muted">Ghi chú của học viên:</span><div className="panel small" style={{ whiteSpace: 'pre-line' }}>{sel.answerText}</div></div>}
              {!hasWork && <p className="small muted">Không có tệp hay liên kết đính kèm.</p>}
            </div>
          </div>
        </section>
        <aside className="card tc-dock" aria-label="Chấm điểm"><GradeForm key={sel.id + '|' + sel.status + '|' + (sel.viewToken || '')} sel={sel} nextPendingId={sel.nextPendingId || null} go={go} filters={{ course: courseF, assignment: assignF, date: d.selectedDate || 'all' }} /></aside>
      </div>
    );
  }
  return shell('/teach/grading', <>
    {head}
    <div className="tabs" role="tablist">{[['pending', 'Chờ chấm', d.counts.pending], ['graded', 'Đã chấm', d.counts.graded]].map(([k, l, n]) => (
      <Link key={k} className="tab" role="tab" aria-selected={status === k} to={`/teach/grading${qs({ status: k })}`}>{l} <span className="count">{n}</span></Link>
    ))}</div>
    <div className="row tc-filters" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <div className="field"><label className="sr-only" htmlFor="g-course">Lọc theo khoá học</label><select id="g-course" value={courseF} onChange={(e) => go({ course: e.target.value, assignment: 'all' })}><option value="all">Tất cả khoá học</option>{(d.courses || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div className="field"><label className="sr-only" htmlFor="g-assign">Lọc theo bài tập</label><select id="g-assign" value={String(assignF)} onChange={(e) => go({ assignment: e.target.value })}><option value="all">Tất cả bài tập</option>{assignOpts.map((a) => <option key={a.id} value={String(a.id)}>{a.title}{courseF === 'all' ? ` · ${courseTitle(a.courseId)}` : ''}</option>)}</select></div>
      <div className="field"><label className="sr-only" htmlFor="g-date">Lọc theo ngày nộp</label><select id="g-date" value={d.selectedDate || 'all'} onChange={(e) => go({ date: e.target.value })}>{DATE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    </div>
    <div className="split-view tc-split" aria-busy={!q.fresh || undefined}><div className="split-list" role="navigation" aria-label="Danh sách bài nộp">{list.length ? list.map(item) : <p className="small muted" style={{ padding: 16 }}>Không có bài nào trong danh sách.</p>}</div><div className="split-detail" ref={detailRef}>{detail}</div></div>
  </>);
}
