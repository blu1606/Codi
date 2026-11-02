/**
 * S32 "Duyệt xuất bản" (admin) — port of docs/mockup/js/admin-review.js on the Codi publication actions.
 * Route: /admin/publication?tab=pending|changes|approved&id=<courseId>&view=criteria|content|flags|history
 *
 * Queue on the left (getAdminPublicationQueue, counted tabs); on the right the course (getAdminCourseReview) with
 * four views — Tiêu chí (saveCriterionVerdict, applyAutoCriteria), Nội dung (preview + flag any lesson / question /
 * test / assignment: addReviewFlag), Cờ (updateFlagStatus, deleteReviewFlag, AI pre-check run on the payload as in
 * Codi), Lịch sử (rounds). Decisions: approvePublication (blocked by the server's blockingReasons),
 * requestChanges, rejectPublication — all with consequence dialogs; the backend notifies the lecturer.
 * S32b: "Xem trước như học viên" modal with a persistent preview bar.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Alert, Empty, Thumb, SpinnerBlock } from '../../components/ui/primitives';
import { AdminShell, parsePrice, confirmImpact } from './admin-shell';
import { useAction, pubAction, attempt, LEVEL_LABEL } from './admin-data';
import { CRITERIA, ENTRY_MIN, SEVERITY, FLAG_STATUS, ROUND_STATUS as ROUND, aiPrecheck, materialOk, lessonsOf } from './publication-rules';

const { fmt } = Codi;
const TYPE = { video: 'Video', pdf: 'Slide/PDF', slide: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
const VIEWS = ['criteria', 'content', 'flags', 'history'];
const ENTRY_LABEL = 'Bài kiểm tra đầu vào';

// View state survives navigation between queue items of the same course (mockup module state).
let view = { courseId: null, tab: 'criteria', lessonId: null, ai: null }; // ai: {state:'running'|'done'|'error'|'limit', items, token}
const priceDraft = {};
let lastDeleted = null;
const rerender = () => Codi.rerender();
const forCourse = (id) => { if (view.courseId !== id) view = { courseId: id, tab: 'criteria', lessonId: null, ai: null }; return view; };
const countFor = (r, pred) => (r ? r.flags.filter((f) => f.status !== 'closed' && pred(f)).length : 0);
const minutes = (l) => Math.round((l.durationSeconds || 0) / 60);
const MAX_PRICE = 2147483647; // real approve bound (int4 column)

// ───────────────────────── small pieces ─────────────────────────
const SevBadge = ({ s }) => <span className={`badge ${s === 'must' ? 'badge-danger' : 'badge-warn'}`}><Icon name={s === 'must' ? 'alert-circle' : 'alert-triangle'} />{SEVERITY[s]}</span>;
const StatusBadge = ({ f }) => <span className={`badge ${f.status === 'closed' ? 'badge-success' : f.status === 'fixed' ? 'badge-accent' : ''}`}>{FLAG_STATUS[f.status]}</span>;

const addFlag = (ctx, target, severity, comment, source) => pubAction('addReviewFlag', ctx.courseId, ctx.requestId, {
  targetType: target.type, lessonId: target.lessonId || null, targetLabel: target.label, severity, comment, source,
});

function FlagDialog({ handle, ctx, t }) {
  const [severity, setSeverity] = useState('must');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const text = comment.trim();
    if (text.length < 10) { setErr(true); return; }
    setBusy(true);
    const ok = await attempt(() => addFlag(ctx, t, severity, text, 'admin'), 'Đã gắn cờ.');
    setBusy(false);
    if (ok) handle.close();
  };
  return (
    <form className="stack-3" onSubmit={submit} noValidate>
      <p className="small"><span className="muted">Vị trí:</span> <strong>{t.label}</strong></p>
      <fieldset className="stack-1"><legend className="small"><strong>Mức độ</strong></legend>
        <label className="check"><input type="radio" name="severity" value="must" checked={severity === 'must'} onChange={() => setSeverity('must')} /> Bắt buộc sửa — chặn việc xuất bản</label>
        <label className="check"><input type="radio" name="severity" value="should" checked={severity === 'should'} onChange={() => setSeverity('should')} /> Nên sửa — góp ý, không chặn</label></fieldset>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="rv-fc">Nhận xét cho giảng viên <span className="req">*</span></label>
        <textarea id="rv-fc" name="comment" rows={3} placeholder="Mô tả vấn đề và cách sửa mong muốn" value={comment} onChange={(e) => { setComment(e.target.value); setErr(false); }} />
        <span className={`field-help ${err ? 'field-error' : ''}`}>{err ? 'Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.' : 'Ít nhất 10 ký tự.'}</span></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="submit" className="btn btn-primary" disabled={busy}><Icon name="flag" className="icon-sm" /> Gắn cờ</button></div>
    </form>
  );
}
const openFlag = (ctx, t) => Codi.ui.modal({ title: 'Gắn cờ', body: (h) => <FlagDialog handle={h} ctx={ctx} t={t} /> });
const FlagBtn = ({ ctx, t }) => <button type="button" className="btn btn-ghost btn-sm" onClick={() => openFlag(ctx, t)}><Icon name="flag" className="icon-sm" /> Gắn cờ</button>;

// ───────────────────────── actions ─────────────────────────
function setCrit(ctx, r, id, v) {
  const cur = r.criteria[id] || {};
  const next = cur.status === v ? null : v;
  attempt(() => pubAction('saveCriterionVerdict', ctx.requestId, id, next, next ? (cur.note || null) : null));
}
function saveCritNote(ctx, r, id, note) {
  const cur = r.criteria[id] || {};
  // A note belongs to a verdict: without a status the backend keeps no row for the criterion.
  if (!cur.status || (cur.note || '') === note.trim()) return;
  attempt(() => pubAction('saveCriterionVerdict', ctx.requestId, id, cur.status, note));
}
async function critAuto(ctx) {
  const res = await attempt(() => pubAction('applyAutoCriteria', ctx.requestId, ctx.courseId));
  if (res) Codi.ui.toast(res.appliedCount ? `Đã điền ${res.appliedCount} tiêu chí theo gợi ý. Kiểm tra lại trước khi kết luận.` : 'Không còn tiêu chí nào để điền tự động.');
}
function gotoTarget(tab, lessonId) { view.tab = 'content'; view.lessonId = lessonId || null; Codi.go(`/admin/publication?tab=${tab}&id=${view.courseId}&view=content`); }
const setFlagState = (id, v) => attempt(() => pubAction('updateFlagStatus', id, v));
async function deleteFlag(ctx, f) {
  const ok = await Codi.ui.confirm({ title: 'Xoá cờ?', body: 'Bạn có chắc chắn muốn xoá cờ này?', confirmLabel: 'Xoá cờ', danger: true });
  if (!ok.ok) return;
  if (!(await attempt(() => pubAction('deleteReviewFlag', f.id)))) return;
  lastDeleted = { ctx, flag: f };
  Codi.ui.toast('Đã xoá cờ.', { action: { label: 'Hoàn tác', onClick: undoDelete } });
}
function undoDelete() {
  if (!lastDeleted) return;
  const { ctx, flag: f } = lastDeleted; lastDeleted = null;
  attempt(() => addFlag(ctx, f.target, f.severity, f.comment, f.source || 'admin'));
}

// AI pre-check (deterministic, on the review payload; obeys the aiAssistant scenario flag)
function runAi(course, r) {
  const token = {};
  const flag = Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') { view.ai = { state: 'limit' }; rerender(); return; }
  view.ai = { state: 'running', token }; view.tab = 'flags'; rerender();
  if (flag === 'thinking') return;
  setTimeout(() => {
    if (!view.ai || view.ai.token !== token) return;
    if (flag === 'error') { view.ai = { state: 'error' }; rerender(); return; }
    const have = new Set(r.flags.map((f) => f.targetLabel + '|' + f.comment));
    view.ai = { state: 'done', items: aiPrecheck(course).filter((x) => !have.has(x.target.label + '|' + x.comment)) };
    rerender();
  }, 1400);
}
function stopAi() { view.ai = null; rerender(); Codi.ui.toast('Đã dừng rà soát.'); }
function skipAi(i) { const x = view.ai.items[i]; if (x) x.done = true; rerender(); }
async function acceptAi(ctx, i) {
  const pick = i === 'all' ? view.ai.items.filter((x) => !x.done) : [view.ai.items[i]].filter(Boolean);
  let added = 0;
  for (const x of pick) {
    try { await addFlag(ctx, x.target, x.severity, x.comment, 'ai'); x.done = true; added += 1; } catch (e) { Codi.ui.toast(e.message, { type: 'danger' }); break; }
  }
  if (added) await attempt(() => Promise.resolve(), `Đã thêm ${added} cờ.`);
  rerender();
}

const proposed = (c, item) => (c.proposedPrice != null ? c.proposedPrice : item.price);

async function approve(ctx, c, item, blocking) {
  if (blocking.length) return;
  const price = parsePrice(priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(proposed(c, item) ?? ''));
  if (price === null || !Number.isSafeInteger(price) || price > MAX_PRICE) { priceDraft.err = 'Giá bán phải là số nguyên không âm (VND), không vượt quá 2.147.483.647.'; rerender(); return; }
  priceDraft.err = null; rerender();
  const res = await Codi.ui.confirm({ title: `Duyệt và xuất bản "${c.title}"?`, body: `Giá bán: ${price ? fmt.vnd(price) : 'Miễn phí'}.`, consequence: 'Khóa học xuất hiện ngay trong danh mục và học viên mua được với giá này. Giảng viên nhận thông báo.', confirmLabel: 'Duyệt và xuất bản' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('approvePublication', c.id, ctx.requestId, price), 'Đã xuất bản khóa học.'))) return;
  delete priceDraft[c.id];
  Codi.go('/admin/publication?tab=approved&id=' + c.id);
}
async function requestChanges(ctx, c, r) {
  const fixes = CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status === 'fix');
  const open = r.flags.filter((f) => f.status !== 'closed');
  if (!fixes.length && !open.length) { Codi.ui.toast('Chưa có tiêu chí "Cần sửa" hay cờ nào để gửi. Gắn cờ trước khi yêu cầu sửa.', { type: 'warn' }); return; }
  const res = await confirmImpact({ title: `Yêu cầu sửa "${c.title}"?`, body: <p>{`Gửi ${fixes.length} tiêu chí cần sửa và ${open.length} cờ (${open.filter((f) => f.severity === 'must').length} bắt buộc) cho giảng viên.`}</p>, consequence: 'Khóa học chuyển sang "Bị từ chối" và không được bán. Giảng viên sửa theo từng cờ rồi gửi lại thành vòng duyệt mới.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).', reasonLabel: 'Lời nhắn chung cho giảng viên', reasonPlaceholder: 'Ví dụ: Nội dung tốt, cần bổ sung tài liệu bài 4 và sửa đáp án quiz.', confirmLabel: 'Gửi yêu cầu sửa' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('requestChanges', c.id, ctx.requestId, res.reason), 'Đã gửi yêu cầu sửa cho giảng viên.'))) return;
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
}
async function reject(ctx, c) {
  const res = await confirmImpact({ title: `Từ chối "${c.title}"?`, body: <p>Dùng khi khóa học không phù hợp chính sách hoặc chất lượng chung chưa đạt. Nếu chỉ cần sửa vài chỗ, hãy dùng &quot;Yêu cầu sửa&quot;.</p>, consequence: 'Khóa học chuyển sang "Bị từ chối" và không được bán. Giảng viên thấy lý do và vẫn có thể sửa rồi gửi lại.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).', reasonLabel: 'Lý do từ chối', danger: true, confirmLabel: 'Từ chối' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('rejectPublication', c.id, ctx.requestId, res.reason), 'Đã từ chối và gửi lý do cho giảng viên.'))) return;
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
}

// S32b preview as learner (persistent bar + exit)
function openPreview(d, item) {
  const c = d.course;
  Codi.ui.modal({
    size: 'lg', dismissible: false, body: (
      <div className="ad-preview-container">
        <div className="ad-preview-bar"><div><strong>Bạn đang xem trước như học viên</strong> · {c.title}</div>
          <button type="button" className="btn btn-secondary btn-sm" data-close><Icon name="x" className="icon-sm" /> Thoát xem trước</button></div>
        <div className="ad-preview-content stack-4">
          <div><Thumb course={{ id: c.id, title: c.title }} /><h1 style={{ margin: '12px 0 0' }}>{c.title}</h1><p className="small muted">{d.instructor ? d.instructor.name : item.instructorName} · {c.category} · {LEVEL_LABEL[c.level] || c.level} · {c.proposedPrice != null ? fmt.vnd(c.proposedPrice) + ' (giá đề xuất)' : 'Chưa có giá'}</p></div>
          <p>{c.summary}</p>
          {d.details.learningOutcomes.length > 0 && <div className="stack-2"><h3>Bạn sẽ học được gì</h3><ul className="small">{d.details.learningOutcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
          <div className="stack-2"><h3>Nội dung khóa học</h3>{c.chapters.map((ch) => (
            <div key={ch.id} className="stack-1"><strong>{ch.title}</strong><ul className="small">{ch.lessons.map((l) => <li key={l.id}>{l.title} <span className="muted">· {TYPE[l.type] || l.type} · {fmt.duration(minutes(l))}</span></li>)}</ul></div>
          ))}</div>
          <div className="stack-2"><h3>Yêu cầu trước khi học</h3><ul className="small">{(d.details.requirements.length ? d.details.requirements : ['Không có yêu cầu đặc biệt.']).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
      </div>
    ),
  });
}

// ───────────────────────── views ─────────────────────────
function criteriaView({ d, r, ro, ctx }) {
  const auto = d.autoCriteria;
  const marked = CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status).length;
  return (
    <div className="stack-3">
      <div className="row-between"><span className="small muted">{marked}/{CRITERIA.length} tiêu chí đã chấm</span>
        {!ro && <button type="button" className="btn btn-secondary btn-sm" onClick={() => critAuto(ctx)}><Icon name="sparkles" className="icon-sm" /> Điền theo gợi ý tự động</button>}</div>
      <ul className="rv-crit">{CRITERIA.map((k) => {
        const cur = r.criteria[k.id] || {}; const a = auto[k.id] || { status: null, why: '' };
        return (
          <li key={k.id} className="rv-crit-row">
            <div className="rv-crit-main"><strong className="small">{k.label}</strong><span className="xsmall muted">{k.help}</span>
              <span className="xsmall rv-auto"><Icon name="sparkles" className="icon-sm" /> Gợi ý: {a.status ? { pass: 'Đạt', fix: 'Cần sửa', na: 'Không áp dụng' }[a.status] : 'Người duyệt tự xác nhận'} — {a.why}</span></div>
            <div className="rv-crit-ctrl">
              <div className="viz-seg-ctrl" role="group" aria-label={`Kết quả: ${k.label}`}>
                {[['pass', 'Đạt'], ['fix', 'Cần sửa'], ['na', 'Không áp dụng']].map(([v, l]) => <button key={v} type="button" aria-pressed={String(cur.status === v)} disabled={ro} onClick={() => setCrit(ctx, r, k.id, v)}>{l}</button>)}
              </div>
              <label className="sr-only" htmlFor={`rv-note-${k.id}`}>Ghi chú cho {k.label}</label>
              <input key={`${r.id}-${k.id}-${cur.status || ''}-${cur.note || ''}`} id={`rv-note-${k.id}`} className="input" placeholder={cur.status === 'fix' ? 'Ghi rõ cần sửa gì (bắt buộc)' : 'Ghi chú (không bắt buộc)'} defaultValue={cur.note || ''} disabled={ro || !cur.status} title={!cur.status && !ro ? 'Chọn kết quả trước khi ghi chú' : undefined} onBlur={(e) => saveCritNote(ctx, r, k.id, e.target.value)} />
            </div>
          </li>
        );
      })}</ul>
    </div>
  );
}

function questionList(ctx, l, qs, r, ro) {
  if (!qs.length) return <p className="small muted">Chưa có câu hỏi.</p>;
  return (
    <ol className="rv-questions">{qs.map((q, i) => {
      const label = `Câu ${i + 1}: ${q.text}`;
      const n = countFor(r, (f) => f.targetType === 'question' && f.targetLabel === label && (f.lessonId || null) === (l ? l.id : null));
      return (
        <li key={q.id || i} className="rv-q">
          <div className="row-between"><strong className="small">Câu {i + 1}. {q.text}</strong>
            <span className="row" style={{ gap: 4 }}>{n ? <span className="badge badge-warn">{n} cờ</span> : null}{q.aiGenerated && <span className="badge badge-accent">AI tạo</span>}{!ro && <FlagBtn ctx={ctx} t={{ type: 'question', lessonId: l ? l.id : null, label }} />}</span></div>
          <ul className="rv-opts">{q.options.map((o, k) => (
            <li key={k} className={k === q.correctIndex ? 'is-correct' : ''}>
              {k === q.correctIndex ? <><Icon name="check-circle" className="icon-sm" /><span className="sr-only">Đáp án đúng: </span></> : <span className="rv-opt-dot" aria-hidden="true" />}
              <span>{o}</span>{k === q.correctIndex && <span className="xsmall">Đáp án đúng</span>}
            </li>
          ))}</ul>
          {q.explanation ? <p className="xsmall muted">Giải thích: {q.explanation}</p> : <p className="xsmall text-warn">Chưa có giải thích.</p>}
        </li>
      );
    })}</ol>
  );
}

function codePreview(ctx, l, ro) {
  const cd = l.code; const chk = cd.solutionCheck; const tests = cd.tests || [];
  return (
    <div className="stack-2">
      <div className="row-between"><strong className="small">Bài code · {tests.length} test ({tests.filter((t) => t.hidden).length} ẩn)</strong>
        {chk && chk.ok ? <span className="badge badge-success"><Icon name="check" />Lời giải đạt {chk.passed}/{chk.total}</span> : <span className="badge badge-danger"><Icon name="alert-circle" />Lời giải chưa chạy đạt</span>}</div>
      <ol className="small">{(cd.instructions || []).map((s, i) => <li key={i}>{String(s).replace(/[`*]/g, '')}</li>)}</ol>
      <div className="table-wrap"><table className="table"><caption className="sr-only">Test của bài code</caption><thead><tr><th>Test</th><th>Biểu thức</th><th /></tr></thead><tbody>
        {tests.map((t, i) => (
          <tr key={t.id || i}><th scope="row"><span className="small">{t.name}</span>{t.hidden && <> <span className="badge">Ẩn</span></>}</th><td className="mono xsmall">{t.call}</td>
            <td>{!ro && <FlagBtn ctx={ctx} t={{ type: 'test', lessonId: l.id, label: `Test “${t.name}” · ${l.title}` }} />}</td></tr>
        ))}
      </tbody></table></div>
    </div>
  );
}

function lessonPreview(ctx, c, l, r, ro) {
  if (!l) return null;
  if (l === 'entry') {
    const qs = (c.entryTest && c.entryTest.questions) || [];
    return (
      <div className="stack-3"><div className="row-between"><h3 className="tc-h">{ENTRY_LABEL}</h3>{!ro && <FlagBtn ctx={ctx} t={{ type: 'course', label: ENTRY_LABEL }} />}</div>
        <p className={`small ${qs.length < ENTRY_MIN ? 'text-danger' : 'muted'}`}>{qs.length} câu · cần ít nhất {ENTRY_MIN} câu.</p>
        {questionList(ctx, null, qs, r, ro)}</div>
    );
  }
  const mat = (l.materials || []).map((m) => m.fileName).find(Boolean);
  const a = l.assignment;
  return (
    <div className="stack-4">
      <div className="row-between"><div className="stack-1"><h3 className="tc-h">{l.title}</h3><span className="xsmall muted">{TYPE[l.type] || l.type} · {fmt.duration(minutes(l))}</span></div>{!ro && <FlagBtn ctx={ctx} t={{ type: 'lesson', lessonId: l.id, label: 'Bài: ' + l.title }} />}</div>
      {['video', 'pdf', 'slide'].includes(l.type) && (mat
        ? <p className="small"><Icon name="file-text" className="icon-sm" /> <span className="mono">{mat}</span></p>
        : <Alert type="danger" title="Chưa có tệp" body={`Bài ${TYPE[l.type].toLowerCase()} này chưa có tệp — học viên sẽ thấy bài trống.`} />)}
      {l.body && <details className="panel"><summary className="small strong">Bài đọc / tóm tắt</summary><p className="small" style={{ marginTop: 8 }}>{String(l.body).replace(/[#*`>]/g, '').slice(0, 600)}{l.body.length > 600 ? '…' : ''}</p></details>}
      {l.quiz && <div className="stack-2"><strong className="small">Quiz · {l.quiz.questions.length} câu · điểm đạt {l.quiz.passingScore}%</strong>{questionList(ctx, l, l.quiz.questions, r, ro)}</div>}
      {l.code && codePreview(ctx, l, ro)}
      {a && (
        <div className="stack-2"><div className="row-between"><strong className="small">Bài tập</strong>{!ro && <FlagBtn ctx={ctx} t={{ type: 'assignment', lessonId: l.id, label: 'Bài tập: ' + l.title }} />}</div>
          <p className="small">{a.instructions}</p>
          {(a.rubric || []).length
            ? <div className="table-wrap"><table className="table"><caption className="sr-only">Thang chấm</caption><thead><tr><th>Tiêu chí</th><th className="num">Điểm</th></tr></thead><tbody>{a.rubric.map((k, i) => <tr key={i}><th scope="row"><span className="small strong">{k.name}</span><br /><span className="xsmall muted">{k.desc}</span></th><td className="num">{k.points}</td></tr>)}</tbody></table></div>
            : <Alert type="warn" title="Chưa có thang chấm" body="Học viên không biết bài được chấm theo tiêu chí nào." />}
        </div>
      )}
      {!l.quiz && !l.code && !a && !l.body && materialOk(l) && <p className="small muted">Bài chỉ có {TYPE[l.type] ? TYPE[l.type].toLowerCase() : 'nội dung'}, không có quiz hay bài tập.</p>}
    </div>
  );
}

function contentView({ d, r, ro, ctx }) {
  const c = d.course;
  const ls = lessonsOf(c);
  const sel = view.lessonId === 'entry' ? 'entry' : ls.find((l) => l.id === view.lessonId) || ls[0];
  const entryCount = (c.entryTest && c.entryTest.questions ? c.entryTest.questions.length : 0);
  const item = (id, title, sub, n, cur) => (
    <li key={id}><button type="button" className="rv-tree-item" aria-current={String(cur)} onClick={() => { view.lessonId = id; rerender(); }}>
      <span className="od-fill stack-1"><span className="small">{title}</span><span className="xsmall muted">{sub}</span></span>{n ? <span className="badge badge-warn">{n}</span> : null}</button></li>
  );
  return (
    <div className="rv-content">
      <nav className="rv-tree" aria-label="Nội dung khóa học"><ul>
        {item('entry', ENTRY_LABEL, `${entryCount} câu`, countFor(r, (f) => f.targetLabel === ENTRY_LABEL), sel === 'entry')}
        {c.chapters.map((ch) => (
          <li key={ch.id} className="rv-tree-ch"><span className="xsmall muted">{ch.title}</span><ul>
            {ch.lessons.map((l) => item(l.id, l.title, [TYPE[l.type] || l.type, l.quiz ? `quiz ${l.quiz.questions.length} câu` : '', l.code ? `${(l.code.tests || []).length} test` : '', l.assignment ? 'bài tập' : '', !materialOk(l) ? 'thiếu tệp' : ''].filter(Boolean).join(' · '), countFor(r, (f) => f.lessonId === l.id), sel === l))}
          </ul></li>
        ))}
      </ul></nav>
      <div className="rv-preview">{lessonPreview(ctx, c, sel, r, ro)}</div>
    </div>
  );
}

function aiPanel(d, r, ctx, ai) {
  const c = d.course;
  if (!ai) {
    return (
      <div className="rv-ai"><div><strong className="small"><Icon name="sparkles" className="icon-sm" /> Rà soát bằng AI</strong><p className="xsmall muted">AI đọc toàn bộ nội dung và đề xuất cờ. Bạn chấp nhận hoặc bỏ từng đề xuất.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => runAi(c, r)}>Chạy rà soát</button></div>
    );
  }
  if (ai.state === 'running') {
    const ls = lessonsOf(c);
    return (
      <div className="rv-ai" aria-busy="true"><span className="ai-thinking-row"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>AI đang đọc {ls.length} bài và {ls.reduce((s, l) => s + (l.quiz ? l.quiz.questions.length : 0), 0)} câu hỏi…</span></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stopAi}><Icon name="x" className="icon-sm" /> Dừng</button></div>
    );
  }
  if (ai.state === 'error') return <Alert type="danger" title="AI rà soát chưa chạy được" body="Bạn vẫn duyệt thủ công bình thường." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => runAi(c, r)}>Thử lại</button>} />;
  if (ai.state === 'limit') return <Alert type="warn" title="Đã dùng hết lượt rà soát AI trong giờ này" body="Thử lại sau ít phút." />;
  const items = ai.items.filter((x) => !x.done);
  return (
    <section className="rv-ai is-done"><div className="row-between"><strong className="small"><Icon name="sparkles" className="icon-sm" /> AI đề xuất {ai.items.length} cờ · còn {items.length} chưa xử lý</strong>
      {items.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => acceptAi(ctx, 'all')}>Thêm tất cả ({items.length})</button>}</div>
      {items.length ? (
        <ul className="rv-flags">{ai.items.map((x, i) => (x.done ? null : (
          <li key={i} className="rv-flag is-suggestion"><div className="row" style={{ gap: 6 }}><SevBadge s={x.severity} /><span className="small strong">{x.target.label}</span></div><p className="small">{x.comment}</p>
            <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-primary btn-sm" onClick={() => acceptAi(ctx, i)}>Thêm cờ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => skipAi(i)}>Bỏ qua</button></div></li>
        )))}</ul>
      ) : <p className="xsmall muted">Đã xử lý mọi đề xuất.</p>}
      <p className="xsmall muted">AI có thể sai — đề xuất chỉ thành cờ khi bạn chấp nhận.</p></section>
  );
}

function flagsView({ d, r, ro, ctx, tab }) {
  // The backend already orders open before closed, must before should.
  const live = r.flags;
  return (
    <div className="stack-4">
      {!ro && aiPanel(d, r, ctx, view.ai)}
      {!live.length ? <div className="viz-empty">Chưa có cờ nào. Gắn cờ từ thẻ "Nội dung" hoặc chạy "Rà soát bằng AI".</div> : (
        <ul className="rv-flags">{live.map((f) => (
          <li key={f.id} className={`rv-flag ${f.status === 'closed' ? 'is-closed' : ''}`}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><SevBadge s={f.severity} /><StatusBadge f={f} />{f.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}{f.carried && <span className="badge">Từ vòng trước</span>}</div>
            <button type="button" className="btn-link rv-flag-target" onClick={() => gotoTarget(tab, f.lessonId || (f.targetLabel === ENTRY_LABEL ? 'entry' : ''))}>{f.targetLabel}</button>
            <p className="small">{f.comment}</p>
            {f.reply && <p className="small rv-reply"><Icon name="message-circle" className="icon-sm" /> Giảng viên: {f.reply}</p>}
            {!ro && (
              <div className="row" style={{ gap: 8 }}>
                {f.status !== 'closed'
                  ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFlagState(f.id, 'closed')}><Icon name="check" className="icon-sm" /> Đóng cờ</button>
                  : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlagState(f.id, 'open')}>Mở lại</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteFlag(ctx, f)}><Icon name="trash" className="icon-sm" /> Xoá</button>
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function historyView({ d }) {
  const rs = d.roundsHistory;
  if (!rs.length) return <div className="viz-empty">Chưa có vòng duyệt nào.</div>;
  return (
    <ol className="rv-history">{rs.map((x) => (
      <li key={x.id}><div className="row-between"><strong className="small">Vòng {x.round} · {ROUND[x.status] || x.status}</strong><span className="xsmall muted">Gửi {fmt.datetime(x.requestedAt)}{x.reviewedAt ? ' · kết luận ' + fmt.datetime(x.reviewedAt) : ''}</span></div>
        <span className="xsmall muted">{x.flagsCount} cờ ({x.closedFlagsCount} đã đóng)</span>{x.note && <p className="small">{x.note}</p>}</li>
    ))}</ol>
  );
}

function decisionCard(d, item, ctx) {
  const c = d.course; const r = d.round;
  const def = proposed(c, item);
  const price = priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(def ?? '');
  const why = d.blockingReasons;
  return (
    <section className="card rv-decision"><div className="card-body stack-3">
      <h3 className="tc-h">Kết luận vòng {r.round}</h3>
      <div className={`field ${priceDraft.err ? 'is-invalid' : ''}`} style={{ maxWidth: 320 }}><label htmlFor="pub-price">Giá bán (VND) <span className="req">*</span></label>
        <input key={c.id} id="pub-price" inputMode="numeric" defaultValue={price} onChange={(e) => { priceDraft[c.id] = e.target.value; }} />
        <span className="field-help">Giảng viên đề xuất: {c.proposedPrice == null ? 'chưa đề xuất' : fmt.vnd(c.proposedPrice)}. Nhập 0 cho khóa miễn phí.</span>
        {priceDraft.err && <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{priceDraft.err}</span></p>}</div>
      {why.length
        ? <div className="rv-why"><strong className="small">Chưa thể duyệt:</strong><ul className="small">{why.map((x) => <li key={x}>{x}</li>)}</ul></div>
        : <p className="small text-success"><Icon name="check-circle" className="icon-sm" /> Đủ điều kiện duyệt.</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={why.length > 0} onClick={() => approve(ctx, c, item, why)}>Duyệt và xuất bản</button>
        <button type="button" className="btn btn-secondary" onClick={() => requestChanges(ctx, c, r)}>Yêu cầu sửa</button>
        <button type="button" className="btn btn-danger-outline" onClick={() => reject(ctx, c)}>Từ chối</button>
      </div></div></section>
  );
}

function Detail({ tab, item, q }) {
  const res = useAction('dashboard/admin/publication', 'getAdminCourseReview', [item.id]);
  const d = res.data;
  if (!d) {
    if (res.loading) return <SpinnerBlock text="Đang tải khóa học…" />;
    if (item.status !== 'pending') {
      // Published before the detailed review flow existed: no publication request to show.
      return (
        <section className="card"><div className="card-body stack-3"><h2 className="tc-h">{item.title}</h2><p className="small muted">Khóa học được duyệt trước khi có quy trình duyệt chi tiết. Giá đang bán: {fmt.vnd(item.price)}.</p>
          <Link className="btn btn-secondary" style={{ width: 'fit-content' }} to="/admin/courses">Mở Khóa học đã xuất bản</Link></div></section>
      );
    }
    return <Alert type="danger" title="Không tải được khóa học" body={res.error ? res.error.message : ''} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => res.reload()}>Thử lại</button>} />;
  }
  const v = forCourse(item.id);
  if (q.view && VIEWS.includes(q.view)) v.tab = q.view;
  const r = d.round; const c = d.course;
  const ro = item.status !== 'pending' || r.status !== 'in_review';
  const ctx = { courseId: c.id, requestId: r.id };
  const nFlags = r.flags.filter((f) => f.status !== 'closed').length;
  const fixedCarried = r.flags.filter((f) => f.carried && f.status === 'fixed').length;
  const body = { criteria: criteriaView, content: contentView, flags: flagsView, history: historyView }[v.tab]({ d, r, ro, ctx, tab });
  return (
    <div className="stack-4" aria-busy={res.loading}><section className="card"><div className="card-body stack-4">
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}><div className="stack-1"><h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{c.title}</h2>
        <span className="small muted">{d.instructor ? d.instructor.name : item.instructorName} · {c.category} · {LEVEL_LABEL[c.level] || c.level} · Vòng {r.round} · gửi {fmt.relative(r.requestedAt)}</span></div>
        <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openPreview(d, item)}><Icon name="eye" className="icon-sm" /> Xem trước như học viên</button></div></div>
      {r.status !== 'in_review' && <Alert type={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warn'} title={`Vòng ${r.round}: ${ROUND[r.status]}`} body={r.reviewNote || ''} />}
      {!ro && fixedCarried > 0 && <Alert type="info" title={`Giảng viên đã sửa ${fixedCarried} cờ của vòng trước`} body={'Kiểm tra lại nội dung rồi đóng cờ ở thẻ "Cờ".'} />}
    </div></section>{!ro && decisionCard(d, item, ctx)}<section className="card"><div className="card-body stack-4">
      <div className="tabs" role="tablist" style={{ margin: 0 }}>
        {[['criteria', 'Tiêu chí'], ['content', 'Nội dung'], ['flags', `Cờ${nFlags ? ' (' + nFlags + ')' : ''}`], ['history', 'Lịch sử']].map(([k, l]) => (
          <Link key={k} className="tab" role="tab" aria-selected={String(v.tab === k)} to={`/admin/publication?tab=${tab}&id=${item.id}&view=${k}`}>{l}</Link>
        ))}
      </div>
      {body}
    </div></section></div>
  );
}

// ───────────────────────── route ─────────────────────────
export function PublicationPage({ query: q }) {
  useCodi(); // module view state re-renders through the store
  const tab = ['changes', 'approved'].includes(q.tab) ? q.tab : 'pending';
  const res = useAction('dashboard/admin/publication', 'getAdminPublicationQueue', [tab]);
  const queue = res.data && res.data.tab === tab ? res.data : null;
  const list = queue ? queue.items : [];
  const sel = list.find((c) => c.id === q.id) || list[0];
  let detail;
  if (!queue) {
    detail = res.error
      ? <Alert type="danger" title="Không tải được hàng chờ duyệt" body={res.error.message} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => res.reload()}>Thử lại</button>} />
      : <SpinnerBlock text="Đang tải hàng chờ duyệt…" />;
  } else if (!sel) {
    detail = <div className="card"><Empty icon="clipboard-check" title={tab === 'pending' ? 'Không có khóa học chờ duyệt' : 'Không có khóa học'} body={tab === 'pending' ? 'Yêu cầu mới từ giảng viên sẽ xuất hiện ở đây.' : ''} /></div>;
  } else {
    detail = <Detail key={sel.id} tab={tab} item={sel} q={q} />;
  }
  const counts = res.data ? res.data.counts : null;
  return (
    <AdminShell active="/admin/publication">
      <div className="page-header"><div><h1>Duyệt xuất bản</h1><p className="muted">Chấm từng tiêu chí, xem trước nội dung, gắn cờ chỗ cần sửa rồi kết luận.</p></div></div>
      <div className="tabs" role="tablist">
        {[['pending', 'Chờ duyệt'], ['changes', 'Cần sửa / từ chối'], ['approved', 'Đã duyệt']].map(([k, l]) => (
          <Link key={k} className="tab" role="tab" aria-selected={String(tab === k)} to={`/admin/publication?tab=${k}`}>{l} {counts && <span className="count">{counts[k]}</span>}</Link>
        ))}
      </div>
      <div className="split-view">
        <div className="split-list">{list.length ? list.map((c) => (
          <Link key={c.id} className="split-list-item" to={`/admin/publication?tab=${tab}&id=${c.id}`} aria-current={String(!!sel && sel.id === c.id)}>
            <strong className="small od-clamp-2">{c.title}</strong><span className="xsmall muted">{c.instructorName} · vòng {c.round}{c.openFlagsCount ? ` · ${c.openFlagsCount} cờ mở` : ''}</span></Link>
        )) : <p className="small muted" style={{ padding: 16 }}>{queue ? 'Không có khóa học.' : 'Đang tải…'}</p>}</div>
        <div className="split-detail">{detail}</div>
      </div>
    </AdminShell>
  );
}
