// S26 grading queue + split grading view. Port of the real grading-queue-client.tsx / grading/actions.ts:
// course · assignment · date filters, rubric or single score, pass threshold as a percent of maxScore, score edits
// that need a reason (≥ 3 chars) and are kept in a history sheet, snippet picker with {{placeholders}}, "save and
// grade next". The AI grading draft is owned by the lecturer-ai feature (Codi.lecturerAI.gradingDraft).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon } from '../../components/ui/primitives';
import { shell, myCourses, byCourse, persist, decimal, me, promptReason } from './teach-api';

const { fmt } = Codi;
const DAY = 86400000;
const lessonOf = (s) => Codi.lesson(Codi.course(s.courseId), s.lessonId);
const assignmentOf = (s) => { const l = lessonOf(s); return (l && l.assignment) || null; };
const rubricOf = (s) => { const a = assignmentOf(s); return (a && a.rubric) || []; };
const parseNum = (t) => Number(String(t ?? '').replace(',', '.').trim());
const round1 = (n) => Math.round(n * 10) / 10;
/** Pass threshold in percent (real default 50); older rows carry only the absolute passScore. */
export const passPercent = (s) => {
  const a = assignmentOf(s);
  const p = s.passingScore ?? (a && a.passingScore);
  if (p != null) return Number(p);
  return s.passScore != null && s.maxScore ? Math.round((s.passScore / s.maxScore) * 100) : 50;
};
export const feedbackSnippets = () => Codi.db().feedbackSnippets || [];
const snippetBody = (s) => (s.body != null ? s.body : s.text || '');
/** Real applySnippetPlaceholders: {{x}} and {x} both work; name falls back to "em", score to "—". */
export const applySnippet = (text, name, score) => String(text)
  .replace(/\{\{\s*ten_hoc_vien\s*\}\}|\{ten_hoc_vien\}/g, name || 'em')
  .replace(/\{\{\s*diem\s*\}\}|\{diem\}/g, score === '' || score == null || Number.isNaN(score) ? '—' : decimal(score));

const DATE_OPTS = [['all', 'Tất cả ngày nộp'], ['today', 'Hôm nay'], ['7days', '7 ngày qua'], ['30days', '30 ngày qua']];
function dateStart(k) {
  const d = new Date(); d.setHours(0, 0, 0, 0); // local midnight, like the real filter
  if (k === 'today') return d.getTime();
  if (k === '7days') return d.getTime() - 6 * DAY;
  if (k === '30days') return d.getTime() - 29 * DAY;
  return null;
}

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
  const list = feedbackSnippets().filter((s) => !s.lecturerId || s.lecturerId === (me() || {}).id);
  return (
    <>
      <div className="dialog-body stack-3">
        <p className="small muted">Chọn mẫu để chèn vào nhận xét. Các biến tên và điểm số sẽ được tự động điền.</p>
        {list.length ? list.map((s) => (
          <div key={s.id} className="panel stack-2"><div className="row-between"><strong className="small">{s.title}</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onInsert(applySnippet(snippetBody(s), learnerName, score), s.title); handle.close(); }}>Chèn</button></div>
            <p className="xsmall muted od-clamp-3" style={{ whiteSpace: 'pre-line' }}>{snippetBody(s)}</p></div>
        )) : <div className="stack-2" style={{ textAlign: 'center', padding: 24 }}><p className="small muted">Chưa có mẫu nhận xét nào.</p><Link className="small" to="/teach/snippets" onClick={() => handle.close()}>Tạo mẫu ngay trong trang quản lý mẫu <Icon name="chevron-right" className="icon-sm" /></Link></div>}
      </div>
      <div className="dialog-footer row-between"><Link className="small muted" to="/teach/snippets" onClick={() => handle.close()}>Quản lý danh sách mẫu →</Link><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Đóng</button></div>
    </>
  );
}
const openSnippetPicker = (props) => Codi.ui.modal({ title: 'Mẫu nhận xét', raw: true, body: (h) => <SnippetPicker handle={h} {...props} /> });

function openHistory(s) {
  const u = Codi.user(s.userId) || { name: 'học viên' };
  const list = (s.history || []).slice().reverse(); // newest first
  Codi.ui.sheet({
    title: 'Lịch sử chỉnh sửa điểm',
    body: <div className="stack-3"><p className="small muted">Bài nộp của {u.name}</p>
      {list.length ? list.map((h, i) => (
        <div key={i} className="panel stack-1"><div className="row-between small strong"><span>Lần sửa {list.length - i}</span><span className="xsmall muted">{fmt.datetime(h.at)}</span></div>
          <p className="small">Điểm cũ: <strong className="mono">{decimal(h.oldScore)}</strong> → Điểm mới: <strong className="mono text-accent">{decimal(h.newScore)}</strong></p>
          {h.reason && <p className="xsmall muted"><em>Lý do: &quot;{h.reason}&quot;</em></p>}
          {h.feedback && <p className="xsmall muted od-clamp-2">Nhận xét: {h.feedback}</p>}</div>
      )) : <p className="small muted" style={{ textAlign: 'center', padding: 24 }}>Không có lần chỉnh sửa nào trước đó.</p>}</div>,
  });
}

/** Stable call site for Codi.lecturerAI.gradingDraft; without it, the real disabled "Sắp có" state. */
function AiGradingSlot({ sel, onApply }) {
  const AI = Codi.lecturerAI;
  if (AI && typeof AI.gradingDraft === 'function') return AI.gradingDraft({ submission: sel, assignment: assignmentOf(sel) || { rubric: [] }, onApply });
  return (
    <div className="stack-1"><span className="row" style={{ gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" disabled><Icon name="sparkles" className="icon-sm" /> AI gợi ý điểm và nhận xét</button><span className="badge badge-neutral">Sắp có</span></span>
      <p className="small muted" role="status">AI chấm bài chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm.</p></div>
  );
}

function GradeForm({ sel, nextPending, go }) {
  const u = Codi.user(sel.userId) || { name: 'Học viên', email: '' };
  const rb = rubricOf(sel);
  const [scores, setScores] = useState(() => { const prev = sel.rubricScores || {}; return Object.fromEntries(rb.map((k) => [k.id, prev[k.id] == null || Number.isNaN(prev[k.id]) ? '' : String(prev[k.id])])); });
  const [score, setScore] = useState(sel.score == null ? '' : String(sel.score));
  const [feedback, setFeedback] = useState(sel.feedback || '');
  const [error, setError] = useState(null);
  const [loadedAt] = useState(sel.gradedAt || null); // stale-view check, like the real view token
  const calc = rb.length ? rubricTotal(rb, scores) : null;
  const current = rb.length ? calc.total : parseNum(score);
  const pct = passPercent(sel);
  const passAbs = round1((pct / 100) * sel.maxScore);

  const save = async (action) => {
    setError(null);
    const s = Codi.db().submissions.find((x) => x.id === sel.id);
    if (!s) { setError('Không thể lưu điểm bài tập.'); return; }
    if ((s.gradedAt || null) !== loadedAt) { setError('Bài nộp đã được thay đổi bởi một phiên làm việc khác. Vui lòng tải lại trang.'); return; }
    if (s.status !== 'pending' && s.status !== 'graded') { setError('Không thể chấm bài nộp ở trạng thái bản nháp (chưa nộp).'); return; }
    if (!myCourses().some((c) => c.id === s.courseId)) { setError('Bạn không còn quyền chấm bài.'); return; }
    let finalScore; let rubricScores = null;
    if (rb.length) {
      if (!calc.isValid) { setError(Object.values(calc.errors)[0] || 'Vui lòng chấm đủ tất cả các tiêu chí theo rubric.'); return; }
      finalScore = calc.total;
      rubricScores = Object.fromEntries(rb.map((k) => [k.id, parseNum(scores[k.id])]));
    } else {
      const raw = String(score).replace(',', '.').trim(); const n = parseFloat(raw);
      if (raw === '' || Number.isNaN(n) || n < 0 || n > s.maxScore) { setError(`Nhập điểm hợp lệ từ 0 đến ${s.maxScore}.`); return; }
      finalScore = round1(n);
    }
    const wasGraded = s.status === 'graded';
    const changed = wasGraded && s.score !== finalScore;
    let reason = null;
    if (changed) {
      const r = await promptReason({
        title: 'Sửa điểm bài đã chấm',
        body: <p className="small muted">Bạn đang sửa điểm từ <strong className="text-fg">{decimal(s.score)}</strong> thành <strong className="text-accent">{decimal(finalScore)}</strong>.</p>,
        consequence: 'Học viên sẽ nhận thông báo điểm bài tập đã được cập nhật.', reversible: 'Lịch sử chỉnh sửa điểm sẽ được lưu lại.',
        label: 'Lý do', min: 3, error: 'Vui lòng nhập lý do điều chỉnh điểm số (tối thiểu 3 ký tự).', confirmLabel: 'Cập nhật điểm',
      });
      if (!r.ok) return;
      reason = r.reason;
      if ((s.gradedAt || null) !== loadedAt) { setError('Bài nộp đã được thay đổi bởi một phiên làm việc khác. Vui lòng tải lại trang.'); return; }
    }
    const now = new Date().toISOString();
    if (changed) { if (!s.history) s.history = []; s.history.push({ oldScore: s.score, newScore: finalScore, feedback: feedback.trim(), reason, at: now, gradedBy: (me() || {}).id || null }); }
    Object.assign(s, { score: finalScore, feedback: feedback.trim(), status: 'graded', gradedAt: now, passingScore: pct, passed: finalScore >= (pct / 100) * s.maxScore });
    if (rubricScores) s.rubricScores = rubricScores;
    const l = lessonOf(s);
    Codi.notify(s.userId, { title: wasGraded ? 'Điểm bài tập đã được cập nhật' : 'Bài tập đã được chấm', body: `${l ? l.title : 'Bài tập'} — ${decimal(finalScore)}/${s.maxScore} điểm`, link: '/progress' });
    persist(false);
    Codi.ui.toast('Đã lưu điểm và gửi thông báo cho học viên.', { type: 'success' });
    if (action === 'next' && nextPending) go({ status: 'pending', id: nextPending.id });
    else go({ status: 'graded', id: s.id });
  };
  const insert = (text, title) => { setFeedback((cur) => (cur.trim() ? `${cur.trim()}\n\n${text}` : text)); Codi.ui.toast(`Đã chèn mẫu "${title}"`, { type: 'success' }); };
  const applyAI = (d) => {
    if (!d) return;
    if (rb.length && d.scores) setScores((prev) => ({ ...prev, ...Object.fromEntries(rb.filter((k) => d.scores[k.id] != null).map((k) => [k.id, String(d.scores[k.id])])) }));
    else if (!rb.length && d.score != null) setScore(String(d.score));
    if (d.feedback) setFeedback((fb) => (fb.trim() ? `${fb.trim()}\n\n${d.feedback}` : d.feedback));
  };

  return (
    <form className="stack-4" onSubmit={(e) => { e.preventDefault(); save('stay'); }} noValidate>
      <div className="card-header"><div className="row" style={{ minWidth: 0 }}><Avatar user={u} /><div className="stack-1" style={{ minWidth: 0 }}><strong className="small od-truncate">{u.name}</strong><span className="xsmall muted od-truncate">{u.email}</span></div></div>
        <span className={`badge ${sel.status === 'graded' ? 'badge-success' : 'badge-warn'}`}>{sel.status === 'graded' ? 'Đã chấm' : 'Chờ chấm'}</span></div>
      <div className="card-body stack-4">
        {error && <Alert type="danger" body={error} />}
        {rb.length ? (
          <fieldset className="stack-2 tc-rubric-grade"><legend className="field-label">Chấm theo thang điểm Rubric <span className="req">*</span></legend>
            {rb.map((k) => (
              <div key={k.id} className={`tc-rg-row ${calc.errors[k.id] && error ? 'is-invalid' : ''}`}><label className="stack-1 od-fill" htmlFor={`g-r-${k.id}`}><span className="small strong">{k.name}</span>{k.desc && <span className="xsmall muted">{k.desc}</span>}</label>
                <span className="row" style={{ gap: 4 }}><input id={`g-r-${k.id}`} className="mono" type="number" min="0" max={k.points} step="0.5" value={scores[k.id] ?? ''} onChange={(e) => setScores({ ...scores, [k.id]: e.target.value })} /><span className="xsmall muted od-nowrap">/ {k.points}</span></span></div>
            ))}
            <div className="panel row-between small" role="status"><strong>Tổng điểm: <span className="mono text-accent">{decimal(calc.total)}/{sel.maxScore}</span></strong><span className="muted">Ngưỡng đạt: {pct}%</span></div></fieldset>
        ) : (
          <div className="field"><span className="row-between"><label htmlFor="g-score">Điểm (0–{sel.maxScore}) <span className="req">*</span></label><span className="xsmall muted">Ngưỡng đạt: {decimal(passAbs)}/{sel.maxScore}</span></span>
            <input id="g-score" name="score" className="mono" type="number" min="0" max={sel.maxScore} step="0.5" placeholder="Ví dụ: 8.5" value={score} onChange={(e) => setScore(e.target.value)} /></div>
        )}
        <AiGradingSlot sel={sel} onApply={applyAI} />
        <div className="field"><span className="row-between"><label htmlFor="g-fb">Nhận xét cho học viên</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSnippetPicker({ learnerName: u.name, score: Number.isNaN(current) ? '' : current, onInsert: insert })}><Icon name="list" className="icon-sm" /> Mẫu nhận xét</button></span>
          <textarea id="g-fb" name="feedback" rows={6} placeholder="Điểm làm tốt, điểm cần cải thiện, gợi ý bước tiếp theo..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <span className="field-help">Bấm <strong>&quot;Mẫu nhận xét&quot;</strong> để chèn mẫu có sẵn kèm tên và điểm số.</span></div>
        <div className="stack-2 tc-grade-actions">
          <button className="btn btn-primary btn-block" type="submit">{sel.status === 'graded' ? 'Cập nhật điểm' : 'Lưu điểm'}</button>
          {nextPending ? <>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => save('next')}>Lưu và chấm bài tiếp theo <Icon name="arrow-right" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => go({ status: 'pending', id: nextPending.id })}>Bỏ qua, sang bài tiếp theo →</button>
          </> : <p className="xsmall muted" style={{ textAlign: 'center' }}>Đây là bài chờ chấm cuối cùng.</p>}
          {sel.status === 'graded' && <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => openHistory(Codi.db().submissions.find((x) => x.id === sel.id) || sel)}><Icon name="clock" className="icon-sm" /> Xem lịch sử điểm ({(sel.history || []).length} lần sửa)</button>}
        </div>
      </div>
    </form>
  );
}

export function GradingPage({ params, query }) {
  useCodi();
  const status = query.status === 'graded' ? 'graded' : 'pending';
  const mine = myCourses();
  const courseF = mine.some((c) => c.id === query.course) ? query.course : 'all';
  const assignOpts = (courseF === 'all' ? mine : mine.filter((c) => c.id === courseF)).flatMap((c) => Codi.lessons(c).filter((l) => l.assignment).map((l) => ({ id: l.id, title: l.title, course: c.title })));
  const assignF = assignOpts.some((a) => a.id === query.assignment) ? query.assignment : 'all';
  const dateF = DATE_OPTS.some(([k]) => k === query.date) ? query.date : 'all';
  const since = dateStart(dateF);
  const all = byCourse(Codi.db().submissions);
  const scoped = all.filter((s) => (courseF === 'all' || s.courseId === courseF) && (assignF === 'all' || s.lessonId === assignF) && (since == null || new Date(s.submittedAt).getTime() >= since));
  const pendingSorted = scoped.filter((s) => s.status === 'pending').sort((a, b) => (a.submittedAt > b.submittedAt ? 1 : -1));
  const gradedSorted = scoped.filter((s) => s.status === 'graded').sort((a, b) => ((a.gradedAt || '') < (b.gradedAt || '') ? 1 : -1));
  const list = status === 'pending' ? pendingSorted : gradedSorted;
  const sel = params.submissionId ? all.find((s) => s.id === params.submissionId) : list[0];
  const qs = (o = {}) => {
    const sp = new URLSearchParams();
    sp.set('status', o.status || status);
    const c = o.course !== undefined ? o.course : courseF; if (c !== 'all') sp.set('course', c);
    const a = o.assignment !== undefined ? o.assignment : assignF; if (a !== 'all') sp.set('assignment', a);
    const d = o.date !== undefined ? o.date : dateF; if (d !== 'all') sp.set('date', d);
    return '?' + sp.toString();
  };
  const go = ({ id, ...o }) => Codi.go(`/teach/grading${id ? '/' + id : ''}${qs(o)}`);
  const item = (s) => {
    const u = Codi.user(s.userId) || { name: 'Học viên' }; const c = Codi.course(s.courseId); const l = Codi.lesson(c, s.lessonId);
    return (
      <Link key={s.id} className="split-list-item" to={`/teach/grading/${s.id}${qs()}`} aria-current={sel && sel.id === s.id ? 'true' : undefined}>
        <span className="row-between"><strong className="small">{u.name}</strong>{s.status === 'graded' ? <span className="badge badge-success">{decimal(s.score)}/{s.maxScore}</span> : <span className="xsmall muted">{fmt.relative(s.submittedAt)}</span>}</span>
        <span className="xsmall muted od-truncate">{l ? l.title : 'Bài tập'} · {c ? c.title : ''}</span></Link>
    );
  };
  let detail;
  if (!sel) {
    detail = <div className="card"><Empty icon="clipboard-check" title={status === 'pending' ? 'Không có bài nào chờ chấm' : 'Chưa có bài đã chấm'} body={status === 'pending' ? 'Bạn đã chấm hết các bài nộp. Bài làm mới của học viên sẽ xuất hiện tại đây.' : 'Các bài sau khi chấm điểm sẽ được lưu trữ tại tab này.'} /></div>;
  } else {
    const c = Codi.course(sel.courseId); const l = Codi.lesson(c, sel.lessonId);
    const nextPending = pendingSorted.find((s) => s.id !== sel.id) || null;
    const hasWork = sel.fileName || sel.link || sel.note;
    detail = (
      <div className="tc-grade">
        <section className="card">
          <div className="card-header"><div className="stack-1"><span className="xsmall muted">{c ? c.title : ''}</span><h2 className="tc-h">{l ? l.title : 'Bài tập'}</h2><span className="xsmall muted">Nộp lúc {fmt.datetime(sel.submittedAt)}</span></div></div>
          <div className="card-body stack-4">
            <div className="stack-1"><strong className="xsmall muted">Yêu cầu bài tập</strong><div className="panel small" style={{ whiteSpace: 'pre-line' }}>{(l && l.assignment && l.assignment.instructions) || 'Không có nội dung yêu cầu cụ thể.'}</div></div>
            <div className="stack-2"><strong className="xsmall muted">Nội dung bài nộp</strong>
              {sel.fileName && <div className="panel row-between"><span className="row small" style={{ minWidth: 0 }}><Icon name="file-text" className="icon-sm" /> <span className="mono od-truncate">{sel.fileName}</span></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => Codi.ui.toast(`Bản thử nghiệm: tệp "${sel.fileName}" không có nội dung thật.`, { type: 'info' })}><Icon name="download" className="icon-sm" /> Tải về</button></div>}
              {sel.link && <div className="panel row small"><Icon name="external-link" className="icon-sm" /> <a className="mono od-truncate" href={sel.link} target="_blank" rel="noopener noreferrer">{sel.link}</a></div>}
              {sel.note && <div className="stack-1"><span className="xsmall muted">Ghi chú của học viên:</span><div className="panel small" style={{ whiteSpace: 'pre-line' }}>{sel.note}</div></div>}
              {!hasWork && <p className="small muted">Không có tệp hay liên kết đính kèm.</p>}
            </div>
          </div>
        </section>
        <aside className="card"><GradeForm key={sel.id + '|' + sel.status + '|' + (sel.gradedAt || '')} sel={sel} nextPending={nextPending} go={go} /></aside>
      </div>
    );
  }
  return shell('/teach/grading', <>
    <div className="page-header"><div><h1>Chấm bài</h1><p className="muted">Chấm từng bài; học viên nhận thông báo ngay khi có điểm.</p></div></div>
    <div className="tabs" role="tablist">{[['pending', 'Chờ chấm', pendingSorted.length], ['graded', 'Đã chấm', gradedSorted.length]].map(([k, l, n]) => (
      <Link key={k} className="tab" role="tab" aria-selected={status === k} to={`/teach/grading${qs({ status: k })}`}>{l} <span className="count">{n}</span></Link>
    ))}</div>
    <div className="row tc-filters" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <div className="field"><label className="sr-only" htmlFor="g-course">Lọc theo khoá học</label><select id="g-course" value={courseF} onChange={(e) => go({ course: e.target.value, assignment: 'all' })}><option value="all">Tất cả khoá học</option>{mine.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div className="field"><label className="sr-only" htmlFor="g-assign">Lọc theo bài tập</label><select id="g-assign" value={assignF} onChange={(e) => go({ assignment: e.target.value })}><option value="all">Tất cả bài tập</option>{assignOpts.map((a) => <option key={a.id} value={a.id}>{a.title}{courseF === 'all' ? ` · ${a.course}` : ''}</option>)}</select></div>
      <div className="field"><label className="sr-only" htmlFor="g-date">Lọc theo ngày nộp</label><select id="g-date" value={dateF} onChange={(e) => go({ date: e.target.value })}>{DATE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    </div>
    <div className="split-view tc-split"><div className="split-list" role="navigation" aria-label="Danh sách bài nộp">{list.length ? list.map(item) : <p className="small muted" style={{ padding: 16 }}>Không có bài nào trong danh sách.</p>}</div><div className="split-detail">{detail}</div></div>
  </>);
}
