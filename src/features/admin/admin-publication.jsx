/**
 * S32 "Duyệt xuất bản" (admin) — port of docs/mockup/js/admin-review.js.
 * Route: /admin/publication?tab=pending|changes|approved&id=<courseId>&view=criteria|content|flags|history
 *
 * Queue on the left (counted tabs); on the right the course with four views — Tiêu chí, Nội dung (preview + flag any
 * lesson / question / test / assignment), Cờ (flags + AI pre-check), Lịch sử (rounds). Decisions: Duyệt và xuất bản
 * (blocked by Codi.review.canApprove), Yêu cầu sửa, Từ chối (reason required) — all with consequence dialogs.
 * S32b: "Xem trước như học viên" modal with a persistent preview bar.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Alert, Empty, Thumb } from '../../components/ui/primitives';
import { AdminShell, db, persist, parsePrice, confirmImpact } from './admin-shell';
import './review-api';

const { fmt } = Codi;
const R = () => Codi.review;
const TYPE = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
const ROUND = { in_review: 'Đang duyệt', changes_requested: 'Yêu cầu sửa', rejected: 'Từ chối', approved: 'Đã duyệt' };
const VIEWS = ['criteria', 'content', 'flags', 'history'];

// View state survives navigation between queue items of the same course (mockup module state).
let view = { courseId: null, tab: 'criteria', lessonId: null, ai: null }; // ai: {state:'running'|'done'|'error'|'limit', items, token}
const priceDraft = {};
let lastDeleted = null;
const rerender = () => Codi.set(() => {});
const forCourse = (c) => { if (view.courseId !== c.id) view = { courseId: c.id, tab: 'criteria', lessonId: null, ai: null }; return view; };
const round = (id) => R().ensureRound(Codi.course(id));
const countFor = (r, pred) => (r ? r.flags.filter((f) => f.status !== 'closed' && pred(f)).length : 0);
const lecturerLink = (c) => `/teach/courses/${c.id}/publish`;
const MAX_PRICE = 2147483647; // real approve bound (int4 column)

// ───────────────────────── small pieces ─────────────────────────
const SevBadge = ({ s }) => <span className={`badge ${s === 'must' ? 'badge-danger' : 'badge-warn'}`}><Icon name={s === 'must' ? 'alert-circle' : 'alert-triangle'} />{R().SEVERITY[s]}</span>;
const StatusBadge = ({ f }) => <span className={`badge ${f.status === 'closed' ? 'badge-success' : f.status === 'fixed' ? 'badge-accent' : ''}`}>{R().FLAG_STATUS[f.status]}</span>;

function FlagDialog({ handle, d }) {
  const [severity, setSeverity] = useState('must');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const text = comment.trim();
    if (text.length < 10) { setErr(true); return; }
    const r = round(d.course);
    r.flags.push({ id: Codi.uid('fl'), target: { type: d.type, lessonId: d.lessonId || undefined, itemId: d.itemId || undefined, label: d.label }, severity, comment: text, status: 'open', reply: '', source: 'admin', at: new Date().toISOString() });
    handle.close(); persist(); Codi.ui.toast('Đã gắn cờ.', { type: 'success' });
  };
  return (
    <form className="stack-3" onSubmit={submit} noValidate>
      <p className="small"><span className="muted">Vị trí:</span> <strong>{d.label}</strong></p>
      <fieldset className="stack-1"><legend className="small"><strong>Mức độ</strong></legend>
        <label className="check"><input type="radio" name="severity" value="must" checked={severity === 'must'} onChange={() => setSeverity('must')} /> Bắt buộc sửa — chặn việc xuất bản</label>
        <label className="check"><input type="radio" name="severity" value="should" checked={severity === 'should'} onChange={() => setSeverity('should')} /> Nên sửa — góp ý, không chặn</label></fieldset>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="rv-fc">Nhận xét cho giảng viên <span className="req">*</span></label>
        <textarea id="rv-fc" name="comment" rows={3} placeholder="Mô tả vấn đề và cách sửa mong muốn" value={comment} onChange={(e) => { setComment(e.target.value); setErr(false); }} />
        <span className={`field-help ${err ? 'field-error' : ''}`}>{err ? 'Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.' : 'Ít nhất 10 ký tự.'}</span></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="submit" className="btn btn-primary"><Icon name="flag" className="icon-sm" /> Gắn cờ</button></div>
    </form>
  );
}
const openFlag = (c, t) => Codi.ui.modal({ title: 'Gắn cờ', body: (h) => <FlagDialog handle={h} d={{ course: c.id, type: t.type, lessonId: t.lessonId || '', itemId: t.itemId || '', label: t.label }} /> });
const FlagBtn = ({ c, t }) => <button type="button" className="btn btn-ghost btn-sm" onClick={() => openFlag(c, t)}><Icon name="flag" className="icon-sm" /> Gắn cờ</button>;

// ───────────────────────── actions ─────────────────────────
function setCrit(courseId, id, v) { const r = round(courseId); const cur = r.criteria[id] || { note: '' }; cur.status = cur.status === v ? null : v; r.criteria[id] = cur; persist(); }
function setCritNote(courseId, id, note) { const r = round(courseId); r.criteria[id] = Object.assign(r.criteria[id] || {}, { note }); Codi.set(() => {}, { render: false }); }
function critAuto(c) {
  const r = round(c.id); const auto = R().autoCriteria(c); let n = 0;
  R().CRITERIA.forEach((k) => { if ((!r.criteria[k.id] || !r.criteria[k.id].status) && auto[k.id].status) { r.criteria[k.id] = { status: auto[k.id].status, note: auto[k.id].status === 'fix' ? auto[k.id].why : '' }; n += 1; } });
  persist(); Codi.ui.toast(n ? `Đã điền ${n} tiêu chí theo gợi ý. Kiểm tra lại trước khi kết luận.` : 'Không còn tiêu chí nào để điền tự động.');
}
function gotoTarget(lessonId) { view.tab = 'content'; view.lessonId = lessonId || null; Codi.go(`/admin/publication?tab=pending&id=${view.courseId}&view=content`); }
function setFlagState(courseId, id, v) { const f = round(courseId).flags.find((x) => x.id === id); if (f) { f.status = v; persist(); } }
async function deleteFlag(courseId, id) {
  const ok = await Codi.ui.confirm({ title: 'Xoá cờ?', body: 'Bạn có chắc chắn muốn xoá cờ này?', confirmLabel: 'Xoá cờ', danger: true });
  if (!ok.ok) return;
  const r = round(courseId); const i = r.flags.findIndex((x) => x.id === id); if (i < 0) return;
  const [f] = r.flags.splice(i, 1); persist();
  lastDeleted = { courseId, flag: f, index: i };
  Codi.ui.toast('Đã xoá cờ.', { action: { label: 'Hoàn tác', onClick: undoDelete } });
}
function undoDelete() { if (!lastDeleted) return; round(lastDeleted.courseId).flags.splice(lastDeleted.index, 0, lastDeleted.flag); lastDeleted = null; persist(); }

// AI pre-check (simulated; obeys the aiAssistant scenario flag)
function runAi(c) {
  const token = {};
  const flag = Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') { view.ai = { state: 'limit' }; rerender(); return; }
  view.ai = { state: 'running', token }; view.tab = 'flags'; rerender();
  if (flag === 'thinking') return;
  setTimeout(() => {
    if (!view.ai || view.ai.token !== token) return;
    if (flag === 'error') { view.ai = { state: 'error' }; rerender(); return; }
    const r = round(c.id);
    const have = new Set(r.flags.map((f) => f.target.label + '|' + f.comment));
    view.ai = { state: 'done', items: R().aiPrecheck(c).filter((x) => !have.has(x.target.label + '|' + x.comment)) };
    rerender();
  }, 1400);
}
function stopAi() { view.ai = null; rerender(); Codi.ui.toast('Đã dừng rà soát.'); }
function skipAi(i) { const x = view.ai.items[i]; if (x) x.done = true; rerender(); }
function acceptAi(courseId, i) {
  const r = round(courseId);
  const pick = i === 'all' ? view.ai.items.filter((x) => !x.done) : [view.ai.items[i]].filter(Boolean);
  pick.forEach((x) => { x.done = true; r.flags.push({ id: Codi.uid('fl'), target: x.target, severity: x.severity, comment: x.comment, status: 'open', reply: '', source: 'ai', at: new Date().toISOString() }); });
  persist(); Codi.ui.toast(`Đã thêm ${pick.length} cờ.`, { type: 'success' });
}

async function approve(c) {
  const r = round(c.id);
  if (R().canApprove(r).length) return;
  const price = parsePrice(priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(c.proposedPrice != null ? c.proposedPrice : c.price));
  if (price === null || !Number.isSafeInteger(price) || price > MAX_PRICE) { priceDraft.err = 'Giá bán phải là số nguyên không âm (VND), không vượt quá 2.147.483.647.'; rerender(); return; }
  priceDraft.err = null; rerender();
  const res = await Codi.ui.confirm({ title: `Duyệt và xuất bản "${c.title}"?`, body: `Giá bán: ${price ? fmt.vnd(price) : 'Miễn phí'}.`, consequence: 'Khóa học xuất hiện ngay trong danh mục và học viên mua được với giá này. Giảng viên nhận thông báo.', confirmLabel: 'Duyệt và xuất bản' });
  if (!res.ok) return;
  Object.assign(r, { status: 'approved', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId });
  Object.assign(c, { status: 'published', price, approvedAt: r.decidedAt, rejectReason: null, reviewOutcome: null });
  Codi.notify(c.lecturerId, { title: 'Khóa học đã được duyệt', body: `"${c.title}" đã xuất bản với giá ${fmt.vnd(price)}.`, link: lecturerLink(c) });
  delete priceDraft[c.id]; persist(); Codi.ui.toast('Đã xuất bản khóa học.', { type: 'success' });
  Codi.go('/admin/publication?tab=approved&id=' + c.id);
}
async function requestChanges(c) {
  const r = round(c.id);
  const fixes = R().CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status === 'fix');
  const open = r.flags.filter((f) => f.status !== 'closed');
  if (!fixes.length && !open.length) { Codi.ui.toast('Chưa có tiêu chí "Cần sửa" hay cờ nào để gửi. Gắn cờ trước khi yêu cầu sửa.', { type: 'warn' }); return; }
  const res = await confirmImpact({ title: `Yêu cầu sửa "${c.title}"?`, body: <p>{`Gửi ${fixes.length} tiêu chí cần sửa và ${open.length} cờ (${open.filter((f) => f.severity === 'must').length} bắt buộc) cho giảng viên.`}</p>, consequence: 'Khóa học chuyển sang "Bị từ chối" và không được bán. Giảng viên sửa theo từng cờ rồi gửi lại thành vòng duyệt mới.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).', reasonLabel: 'Lời nhắn chung cho giảng viên', reasonPlaceholder: 'Ví dụ: Nội dung tốt, cần bổ sung tài liệu bài 4 và sửa đáp án quiz.', confirmLabel: 'Gửi yêu cầu sửa' });
  if (!res.ok) return;
  Object.assign(r, { status: 'changes_requested', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId, note: res.reason });
  Object.assign(c, { status: 'rejected', reviewOutcome: 'changes', rejectReason: res.reason });
  Codi.notify(c.lecturerId, { title: 'Khóa học cần chỉnh sửa', body: `"${c.title}": ${res.reason}`, link: lecturerLink(c) });
  persist(); Codi.ui.toast('Đã gửi yêu cầu sửa cho giảng viên.');
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
}
async function reject(c) {
  const r = round(c.id);
  const res = await confirmImpact({ title: `Từ chối "${c.title}"?`, body: <p>Dùng khi khóa học không phù hợp chính sách hoặc chất lượng chung chưa đạt. Nếu chỉ cần sửa vài chỗ, hãy dùng &quot;Yêu cầu sửa&quot;.</p>, consequence: 'Khóa học chuyển sang "Bị từ chối" và không được bán. Giảng viên thấy lý do và vẫn có thể sửa rồi gửi lại.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).', reasonLabel: 'Lý do từ chối', danger: true, confirmLabel: 'Từ chối' });
  if (!res.ok) return;
  Object.assign(r, { status: 'rejected', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId, note: res.reason });
  Object.assign(c, { status: 'rejected', reviewOutcome: 'rejected', rejectReason: res.reason });
  Codi.notify(c.lecturerId, { title: 'Khóa học bị từ chối', body: `"${c.title}": ${res.reason}`, link: lecturerLink(c) });
  persist(); Codi.ui.toast('Đã từ chối và gửi lý do cho giảng viên.');
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
}

// S32b preview as learner (persistent bar + exit)
function openPreview(c) {
  const lec = Codi.user(c.lecturerId) || { name: '' };
  Codi.ui.modal({
    size: 'lg', dismissible: false, body: (
      <div className="ad-preview-container">
        <div className="ad-preview-bar"><div><strong>Bạn đang xem trước như học viên</strong> · {c.title}</div>
          <button type="button" className="btn btn-secondary btn-sm" data-close><Icon name="x" className="icon-sm" /> Thoát xem trước</button></div>
        <div className="ad-preview-content stack-4">
          <div><Thumb course={c} /><h1 style={{ margin: '12px 0 0' }}>{c.title}</h1><p className="small muted">{lec.name} · {Codi.category(c.categoryId).name} · {Codi.levelLabel(c.level)} · {c.proposedPrice != null ? fmt.vnd(c.proposedPrice) + ' (giá đề xuất)' : 'Chưa có giá'}</p></div>
          <p>{c.summary}</p>
          {(c.outcomes || []).length > 0 && <div className="stack-2"><h3>Bạn sẽ học được gì</h3><ul className="small">{c.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
          <div className="stack-2"><h3>Nội dung khóa học</h3>{c.chapters.map((ch) => (
            <div key={ch.id || ch.title} className="stack-1"><strong>{ch.title}</strong><ul className="small">{ch.lessons.map((l) => <li key={l.id}>{l.title} <span className="muted">· {TYPE[l.type] || l.type} · {fmt.duration(l.durationMin)}</span></li>)}</ul></div>
          ))}</div>
          <div className="stack-2"><h3>Yêu cầu trước khi học</h3><ul className="small">{((c.requirements || []).length ? c.requirements : ['Không có yêu cầu đặc biệt.']).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
      </div>
    ),
  });
}

// ───────────────────────── views ─────────────────────────
function criteriaView(c, r, ro) {
  const auto = R().autoCriteria(c);
  const marked = R().CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status).length;
  return (
    <div className="stack-3">
      <div className="row-between"><span className="small muted">{marked}/{R().CRITERIA.length} tiêu chí đã chấm</span>
        {!ro && <button type="button" className="btn btn-secondary btn-sm" onClick={() => critAuto(c)}><Icon name="sparkles" className="icon-sm" /> Điền theo gợi ý tự động</button>}</div>
      <ul className="rv-crit">{R().CRITERIA.map((k) => {
        const cur = r.criteria[k.id] || {}; const a = auto[k.id];
        return (
          <li key={k.id} className="rv-crit-row">
            <div className="rv-crit-main"><strong className="small">{k.label}</strong><span className="xsmall muted">{k.help}</span>
              <span className="xsmall rv-auto"><Icon name="sparkles" className="icon-sm" /> Gợi ý: {a.status ? { pass: 'Đạt', fix: 'Cần sửa', na: 'Không áp dụng' }[a.status] : 'Người duyệt tự xác nhận'} — {a.why}</span></div>
            <div className="rv-crit-ctrl">
              <div className="viz-seg-ctrl" role="group" aria-label={`Kết quả: ${k.label}`}>
                {[['pass', 'Đạt'], ['fix', 'Cần sửa'], ['na', 'Không áp dụng']].map(([v, l]) => <button key={v} type="button" aria-pressed={String(cur.status === v)} disabled={ro} onClick={() => setCrit(c.id, k.id, v)}>{l}</button>)}
              </div>
              <label className="sr-only" htmlFor={`rv-note-${k.id}`}>Ghi chú cho {k.label}</label>
              <input key={`${r.id}-${k.id}-${cur.status || ''}`} id={`rv-note-${k.id}`} className="input" placeholder={cur.status === 'fix' ? 'Ghi rõ cần sửa gì (bắt buộc)' : 'Ghi chú (không bắt buộc)'} defaultValue={cur.note || ''} disabled={ro} onChange={(e) => setCritNote(c.id, k.id, e.target.value)} />
            </div>
          </li>
        );
      })}</ul>
    </div>
  );
}

function questionList(c, l, qs, r, ro) {
  if (!qs.length) return <p className="small muted">Chưa có câu hỏi.</p>;
  return (
    <ol className="rv-questions">{qs.map((q, i) => {
      const n = countFor(r, (f) => f.target.itemId === q.id);
      return (
        <li key={q.id || i} className="rv-q">
          <div className="row-between"><strong className="small">Câu {i + 1}. {q.text}</strong>
            <span className="row" style={{ gap: 4 }}>{n ? <span className="badge badge-warn">{n} cờ</span> : null}{q.aiGenerated && <span className="badge badge-accent">AI tạo</span>}{!ro && <FlagBtn c={c} t={{ type: 'question', lessonId: l ? l.id : null, itemId: q.id, label: `Câu ${i + 1}: ${q.text}` }} />}</span></div>
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

function codePreview(c, l, r, ro) {
  const cd = l.code; const chk = cd.solutionCheck;
  if (cd.kind === 'tutorial') {
    return <div className="stack-2"><strong className="small">Hướng dẫn code · {cd.steps.length} bước</strong><ol className="small">{cd.steps.map((s, i) => <li key={i}>{s.title}{s.tests && s.tests.length ? <> <span className="xsmall muted">({s.tests.length} test)</span></> : null}</li>)}</ol></div>;
  }
  return (
    <div className="stack-2">
      <div className="row-between"><strong className="small">Bài code · {cd.tests.length} test ({cd.tests.filter((t) => t.hidden).length} ẩn)</strong>
        {chk && chk.ok ? <span className="badge badge-success"><Icon name="check" />Lời giải đạt {chk.passed}/{chk.total}</span> : <span className="badge badge-danger"><Icon name="alert-circle" />Lời giải chưa chạy đạt</span>}</div>
      <ol className="small">{(cd.instructions || []).map((s, i) => <li key={i}>{String(s).replace(/[`*]/g, '')}</li>)}</ol>
      <div className="table-wrap"><table className="table"><caption className="sr-only">Test của bài code</caption><thead><tr><th>Test</th><th>Biểu thức</th><th>Mong đợi</th><th /></tr></thead><tbody>
        {cd.tests.map((t, i) => (
          <tr key={t.id || i}><th scope="row"><span className="small">{t.name}</span>{t.hidden && <> <span className="badge">Ẩn</span></>}</th><td className="mono xsmall">{t.call}</td><td className="mono xsmall">{JSON.stringify(t.expected)}</td>
            <td>{!ro && <FlagBtn c={c} t={{ type: 'test', lessonId: l.id, itemId: t.id, label: `Test “${t.name}” · ${l.title}` }} />}</td></tr>
        ))}
      </tbody></table></div>
    </div>
  );
}

function lessonPreview(c, l, r, ro) {
  if (!l) return null;
  if (l === 'entry') {
    const et = c.entryTest || { questions: [] };
    return (
      <div className="stack-3"><div className="row-between"><h3 className="tc-h">Bài kiểm tra đầu vào</h3>{!ro && <FlagBtn c={c} t={{ type: 'course', label: 'Bài kiểm tra đầu vào' }} />}</div>
        <p className={`small ${et.questions.length < R().ENTRY_MIN ? 'text-danger' : 'muted'}`}>{et.questions.length} câu · cần ít nhất {R().ENTRY_MIN} câu.</p>
        {questionList(c, null, et.questions, r, ro)}</div>
    );
  }
  const mat = l.material && l.material.fileName ? l.material.fileName : l.fileName;
  const a = l.assignment;
  return (
    <div className="stack-4">
      <div className="row-between"><div className="stack-1"><h3 className="tc-h">{l.title}</h3><span className="xsmall muted">{TYPE[l.type] || l.type} · {fmt.duration(l.durationMin)}</span></div>{!ro && <FlagBtn c={c} t={{ type: 'lesson', lessonId: l.id, label: 'Bài: ' + l.title }} />}</div>
      {['video', 'pdf'].includes(l.type) && (mat
        ? <p className="small"><Icon name="file-text" className="icon-sm" /> <span className="mono">{mat}</span>{l.material && l.material.pages ? <> · {l.material.pages} trang</> : null}</p>
        : <Alert type="danger" title="Chưa có tệp" body={`Bài ${TYPE[l.type].toLowerCase()} này chưa có tệp — học viên sẽ thấy bài trống.`} />)}
      {l.reading && <details className="panel"><summary className="small strong">Bài đọc / tóm tắt</summary><p className="small" style={{ marginTop: 8 }}>{String(l.reading).replace(/[#*`>]/g, '').slice(0, 600)}{l.reading.length > 600 ? '…' : ''}</p></details>}
      {l.quiz && <div className="stack-2"><strong className="small">Quiz · {l.quiz.questions.length} câu · điểm đạt {l.quiz.passingScore}%</strong>{questionList(c, l, l.quiz.questions, r, ro)}</div>}
      {l.code && codePreview(c, l, r, ro)}
      {a && (
        <div className="stack-2"><div className="row-between"><strong className="small">Bài tập</strong>{!ro && <FlagBtn c={c} t={{ type: 'assignment', lessonId: l.id, label: 'Bài tập: ' + l.title }} />}</div>
          <p className="small">{a.instructions}</p>
          <p className="xsmall muted">Nộp: {[a.requiresLink ? 'đường dẫn' : '', a.requiresFile ? `tệp (${a.acceptedTypes || 'mọi loại'})` : ''].filter(Boolean).join(' + ') || 'chưa quy định'} · Điểm {a.passScore}/{a.maxScore} để đạt · hạn {a.dueDays} ngày · nộp muộn: {{ accept: 'vẫn nhận', penalty: `trừ ${a.latePenalty}%`, reject: 'không nhận' }[a.latePolicy] || '—'}</p>
          {(a.rubric || []).length
            ? <div className="table-wrap"><table className="table"><caption className="sr-only">Thang chấm</caption><thead><tr><th>Tiêu chí</th><th className="num">Điểm</th></tr></thead><tbody>{a.rubric.map((k, i) => <tr key={i}><th scope="row"><span className="small strong">{k.name}</span><br /><span className="xsmall muted">{k.desc}</span></th><td className="num">{k.points}</td></tr>)}</tbody></table></div>
            : <Alert type="warn" title="Chưa có thang chấm" body="Học viên không biết bài được chấm theo tiêu chí nào." />}
        </div>
      )}
      {!l.quiz && !l.code && !a && !l.reading && R().materialOk(l) && <p className="small muted">Bài chỉ có {TYPE[l.type] ? TYPE[l.type].toLowerCase() : 'nội dung'}, không có quiz hay bài tập.</p>}
    </div>
  );
}

function contentView(c, r, ro) {
  const ls = Codi.lessons(c);
  const sel = view.lessonId === 'entry' ? 'entry' : ls.find((l) => l.id === view.lessonId) || ls[0];
  const item = (id, title, sub, n, cur) => (
    <li key={id}><button type="button" className="rv-tree-item" aria-current={String(cur)} onClick={() => { view.lessonId = id; rerender(); }}>
      <span className="od-fill stack-1"><span className="small">{title}</span><span className="xsmall muted">{sub}</span></span>{n ? <span className="badge badge-warn">{n}</span> : null}</button></li>
  );
  return (
    <div className="rv-content">
      <nav className="rv-tree" aria-label="Nội dung khóa học"><ul>
        {item('entry', 'Bài kiểm tra đầu vào', `${(c.entryTest || { questions: [] }).questions.length} câu`, countFor(r, (f) => f.target.label === 'Bài kiểm tra đầu vào'), sel === 'entry')}
        {c.chapters.map((ch) => (
          <li key={ch.id || ch.title} className="rv-tree-ch"><span className="xsmall muted">{ch.title}</span><ul>
            {ch.lessons.map((l) => item(l.id, l.title, [TYPE[l.type] || l.type, l.quiz ? `quiz ${l.quiz.questions.length} câu` : '', l.code ? `${l.code.tests ? l.code.tests.length : 0} test` : '', l.assignment ? 'bài tập' : '', !R().materialOk(l) ? 'thiếu tệp' : ''].filter(Boolean).join(' · '), countFor(r, (f) => f.target.lessonId === l.id), sel === l))}
          </ul></li>
        ))}
      </ul></nav>
      <div className="rv-preview">{lessonPreview(c, sel, r, ro)}</div>
    </div>
  );
}

function aiPanel(c, ai) {
  if (!ai) {
    return (
      <div className="rv-ai"><div><strong className="small"><Icon name="sparkles" className="icon-sm" /> Rà soát bằng AI</strong><p className="xsmall muted">AI đọc toàn bộ nội dung và đề xuất cờ. Bạn chấp nhận hoặc bỏ từng đề xuất.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => runAi(c)}>Chạy rà soát</button></div>
    );
  }
  if (ai.state === 'running') {
    const ls = Codi.lessons(c);
    return (
      <div className="rv-ai" aria-busy="true"><span className="ai-thinking-row"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>AI đang đọc {ls.length} bài và {ls.reduce((s, l) => s + (l.quiz ? l.quiz.questions.length : 0), 0)} câu hỏi…</span></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stopAi}><Icon name="x" className="icon-sm" /> Dừng</button></div>
    );
  }
  if (ai.state === 'error') return <Alert type="danger" title="AI rà soát chưa chạy được" body="Bạn vẫn duyệt thủ công bình thường." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => runAi(c)}>Thử lại</button>} />;
  if (ai.state === 'limit') return <Alert type="warn" title="Đã dùng hết lượt rà soát AI trong giờ này" body="Thử lại sau ít phút." />;
  const items = ai.items.filter((x) => !x.done);
  return (
    <section className="rv-ai is-done"><div className="row-between"><strong className="small"><Icon name="sparkles" className="icon-sm" /> AI đề xuất {ai.items.length} cờ · còn {items.length} chưa xử lý</strong>
      {items.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => acceptAi(c.id, 'all')}>Thêm tất cả ({items.length})</button>}</div>
      {items.length ? (
        <ul className="rv-flags">{ai.items.map((x, i) => (x.done ? null : (
          <li key={i} className="rv-flag is-suggestion"><div className="row" style={{ gap: 6 }}><SevBadge s={x.severity} /><span className="small strong">{x.target.label}</span></div><p className="small">{x.comment}</p>
            <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-primary btn-sm" onClick={() => acceptAi(c.id, i)}>Thêm cờ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => skipAi(i)}>Bỏ qua</button></div></li>
        )))}</ul>
      ) : <p className="xsmall muted">Đã xử lý mọi đề xuất.</p>}
      <p className="xsmall muted">AI có thể sai — đề xuất chỉ thành cờ khi bạn chấp nhận.</p></section>
  );
}

function flagsView(c, r, ro) {
  const live = r.flags.slice().sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || (a.severity === 'must' ? -1 : 1));
  return (
    <div className="stack-4">
      {!ro && aiPanel(c, view.ai)}
      {!live.length ? <div className="viz-empty">Chưa có cờ nào. Gắn cờ từ thẻ "Nội dung" hoặc chạy "Rà soát bằng AI".</div> : (
        <ul className="rv-flags">{live.map((f) => (
          <li key={f.id} className={`rv-flag ${f.status === 'closed' ? 'is-closed' : ''}`}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><SevBadge s={f.severity} /><StatusBadge f={f} />{f.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}{f.carried && <span className="badge">Từ vòng trước</span>}</div>
            <button type="button" className="btn-link rv-flag-target" onClick={() => gotoTarget(f.target.lessonId || (f.target.label === 'Bài kiểm tra đầu vào' ? 'entry' : ''))}>{f.target.label}</button>
            <p className="small">{f.comment}</p>
            {f.reply && <p className="small rv-reply"><Icon name="message-circle" className="icon-sm" /> Giảng viên: {f.reply}</p>}
            {!ro && (
              <div className="row" style={{ gap: 8 }}>
                {f.status !== 'closed'
                  ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFlagState(c.id, f.id, 'closed')}><Icon name="check" className="icon-sm" /> Đóng cờ</button>
                  : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlagState(c.id, f.id, 'open')}>Mở lại</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteFlag(c.id, f.id)}><Icon name="trash" className="icon-sm" /> Xoá</button>
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function historyView(c) {
  const rs = R().rounds(c).slice().reverse();
  if (!rs.length) return <div className="viz-empty">Chưa có vòng duyệt nào.</div>;
  return (
    <ol className="rv-history">{rs.map((x) => (
      <li key={x.id}><div className="row-between"><strong className="small">Vòng {x.round} · {ROUND[x.status]}</strong><span className="xsmall muted">Gửi {fmt.datetime(x.submittedAt)}{x.decidedAt ? ' · kết luận ' + fmt.datetime(x.decidedAt) : ''}</span></div>
        <span className="xsmall muted">{x.flags.length} cờ ({x.flags.filter((f) => f.status === 'closed').length} đã đóng)</span>{x.note && <p className="small">{x.note}</p>}</li>
    ))}</ol>
  );
}

function decisionCard(c, r) {
  const price = priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(c.proposedPrice != null ? c.proposedPrice : c.price || '');
  const why = R().canApprove(r);
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
        <button type="button" className="btn btn-primary" disabled={why.length > 0} onClick={() => approve(c)}>Duyệt và xuất bản</button>
        <button type="button" className="btn btn-secondary" onClick={() => requestChanges(c)}>Yêu cầu sửa</button>
        <button type="button" className="btn btn-danger-outline" onClick={() => reject(c)}>Từ chối</button>
      </div></div></section>
  );
}

// ───────────────────────── route ─────────────────────────
export function PublicationPage({ query: q }) {
  useCodi();
  const tab = ['changes', 'approved'].includes(q.tab) ? q.tab : 'pending';
  const groups = { pending: db().courses.filter((c) => c.status === 'pending'), changes: db().courses.filter((c) => c.status === 'rejected'), approved: db().courses.filter((c) => ['published', 'hidden'].includes(c.status)) };
  const list = groups[tab];
  const sel = list.find((c) => c.id === q.id) || list[0];
  let detail;
  if (!sel) {
    detail = <div className="card"><Empty icon="clipboard-check" title={tab === 'pending' ? 'Không có khóa học chờ duyệt' : 'Không có khóa học'} body={tab === 'pending' ? 'Yêu cầu mới từ giảng viên sẽ xuất hiện ở đây.' : ''} /></div>;
  } else {
    const v = forCourse(sel);
    if (q.view && VIEWS.includes(q.view)) v.tab = q.view;
    const ro = sel.status !== 'pending';
    const r = ro ? R().latest(sel) : R().ensureRound(sel);
    const lec = Codi.user(sel.lecturerId);
    if (!r) {
      detail = (
        <section className="card"><div className="card-body stack-3"><h2 className="tc-h">{sel.title}</h2><p className="small muted">Khóa học được duyệt trước khi có quy trình duyệt chi tiết. Giá đang bán: {fmt.vnd(sel.price)}.</p>
          <Link className="btn btn-secondary" style={{ width: 'fit-content' }} to="/admin/courses">Mở Khóa học đã xuất bản</Link></div></section>
      );
    } else {
      const nFlags = r.flags.filter((f) => f.status !== 'closed').length;
      const fixedCarried = r.flags.filter((f) => f.carried && f.status === 'fixed').length;
      const body = { criteria: criteriaView, content: contentView, flags: flagsView, history: historyView }[v.tab](sel, r, ro);
      detail = (
        <div className="stack-4"><section className="card"><div className="card-body stack-4">
          <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}><div className="stack-1"><h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{sel.title}</h2>
            <span className="small muted">{lec ? lec.name : ''} · {Codi.category(sel.categoryId).name} · {Codi.levelLabel(sel.level)} · Vòng {r.round} · gửi {fmt.relative(r.submittedAt)}</span></div>
            <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openPreview(sel)}><Icon name="eye" className="icon-sm" /> Xem trước như học viên</button></div></div>
          {r.status !== 'in_review' && <Alert type={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warn'} title={`Vòng ${r.round}: ${ROUND[r.status]}`} body={r.note || ''} />}
          {sel.status === 'pending' && fixedCarried > 0 && <Alert type="info" title={`Giảng viên đã sửa ${fixedCarried} cờ của vòng trước`} body={'Kiểm tra lại nội dung rồi đóng cờ ở thẻ "Cờ".'} />}
        </div></section>{!ro && decisionCard(sel, r)}<section className="card"><div className="card-body stack-4">
          <div className="tabs" role="tablist" style={{ margin: 0 }}>
            {[['criteria', 'Tiêu chí'], ['content', 'Nội dung'], ['flags', `Cờ${nFlags ? ' (' + nFlags + ')' : ''}`], ['history', 'Lịch sử']].map(([k, l]) => (
              <Link key={k} className="tab" role="tab" aria-selected={String(v.tab === k)} to={`/admin/publication?tab=${tab}&id=${sel.id}&view=${k}`}>{l}</Link>
            ))}
          </div>
          {body}
        </div></section></div>
      );
    }
  }
  return (
    <AdminShell active="/admin/publication">
      <div className="page-header"><div><h1>Duyệt xuất bản</h1><p className="muted">Chấm từng tiêu chí, xem trước nội dung, gắn cờ chỗ cần sửa rồi kết luận.</p></div></div>
      <div className="tabs" role="tablist">
        {[['pending', 'Chờ duyệt'], ['changes', 'Cần sửa / từ chối'], ['approved', 'Đã duyệt']].map(([k, l]) => (
          <Link key={k} className="tab" role="tab" aria-selected={String(tab === k)} to={`/admin/publication?tab=${k}`}>{l} <span className="count">{groups[k].length}</span></Link>
        ))}
      </div>
      <div className="split-view">
        <div className="split-list">{list.length ? list.map((c) => {
          const lr = R().latest(c); const n = lr ? lr.flags.filter((f) => f.status !== 'closed').length : 0;
          return (
            <Link key={c.id} className="split-list-item" to={`/admin/publication?tab=${tab}&id=${c.id}`} aria-current={String(!!sel && sel.id === c.id)}>
              <strong className="small od-clamp-2">{c.title}</strong><span className="xsmall muted">{(Codi.user(c.lecturerId) || {}).name || ''}{lr ? ` · vòng ${lr.round}` : ''}{n ? ` · ${n} cờ mở` : ''}</span></Link>
          );
        }) : <p className="small muted" style={{ padding: 16 }}>Không có khóa học.</p>}</div>
        <div className="split-detail">{detail}</div>
      </div>
    </AdminShell>
  );
}
