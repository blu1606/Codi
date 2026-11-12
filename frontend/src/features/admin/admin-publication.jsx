/**
 * S32 "Duyệt xuất bản" (admin) — port of docs/mockup/js/admin-review.js on the Codi publication actions.
 * Route: /admin/publication?tab=pending|changes|approved&id=<courseId>&view=criteria|content|flags|history
 *
 * Queue on the left (getAdminPublicationQueue, counted tabs); on the right the course (getAdminCourseReview) with
 * four views — Tiêu chí (saveCriterionVerdict, applyAutoCriteria), Xem trước (publication-preview.jsx: the course as
 * the learner or the lecturer sees it, with flags anchored in place: addReviewFlag), Cờ (updateFlagStatus,
 * deleteReviewFlag; rule pre-check getRulePrecheck and the model pass runAiPrecheck, both proposals until accepted), Lịch sử (rounds). Decisions: approvePublication
 * (blocked by the server's blockingReasons), requestChanges, rejectPublication — all with consequence dialogs; the
 * backend notifies the lecturer. S32b: "Xem trước như học viên" opens the preview in learner view.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Icon, Alert, Empty, SpinnerBlock } from '../../components/ui/primitives';
import { AdminShell, parsePrice, confirmImpact } from './admin-shell';
import { useAction, pubAction, attempt, LEVEL_LABEL } from './admin-data';
import { CRITERIA, ROUND_STATUS as ROUND, lessonsOf, anchorOf } from './publication-rules';
import { SevBadge, FlagCard, addFlag } from './review-flags';
import { PreviewView } from './publication-preview';

const { fmt } = Codi;
const VIEWS = ['criteria', 'content', 'flags', 'history'];

// View state survives navigation between queue items of the same course (mockup module state).
// node: 'info' | 'entry' | lessonId shown in the preview; mode: 'learner' | 'author'; focus: flag id to scroll to.
let view = { courseId: null, tab: 'criteria', node: 'info', mode: 'learner', focus: null, check: null }; // check: {state:'running'|'done'|'error', rules, ai, token}
const priceDraft = {};
const rerender = () => Codi.rerender();
const forCourse = (id) => {
  if (view.courseId !== id) {
    if (view.check && view.check.ctrl) view.check.ctrl.abort(); // leaving the course stops waiting for its check
    view = { courseId: id, tab: 'criteria', node: 'info', mode: 'learner', focus: null, check: null };
  }
  return view;
};
const MAX_PRICE = 2147483647; // real approve bound (int4 column)
const nodeOf = (f) => { const a = anchorOf(f); return a.type === 'course' || a.type === 'chapter' ? 'info' : a.type === 'entry' || a.entry ? 'entry' : a.lessonId || 'info'; };
/** Opens the preview at a flag's place and scrolls to it. */
function gotoFlag(tab, f) {
  view.node = nodeOf(f); view.focus = f.id;
  Codi.go(`/admin/publication?tab=${tab}&id=${view.courseId}&view=content`);
}
function openLearnerPreview(tab) {
  view.mode = 'learner'; view.node = 'info';
  Codi.go(`/admin/publication?tab=${tab}&id=${view.courseId}&view=content`);
}

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
// Pre-check on the server (dashboard/admin/publication): getRulePrecheck runs the fixed rules only; runAiPrecheck also
// asks the model to check each quiz against its lesson text. Both return proposals; a flag exists only once accepted.
// Rule proposals are saved as the admin's own flags; only model proposals carry the "AI đề xuất" source.
// "Dừng" aborts the wait; the server cannot be told to stop, so a stopped AI run still counts against the hourly cap.
async function runCheck(ctx, withAi) {
  if (view.check && view.check.ctrl) view.check.ctrl.abort();
  const token = {};
  const ctrl = new AbortController();
  view.check = { state: 'running', ai: withAi, token, ctrl }; view.tab = 'flags'; rerender();
  try {
    const res = await api.actionWith('dashboard/admin/publication', withAi ? 'runAiPrecheck' : 'getRulePrecheck', [ctx.requestId], { signal: ctrl.signal });
    // a stopped or replaced run never applies its late result
    if (ctrl.signal.aborted || !view.check || view.check.token !== token) return;
    const ai = res.ai && res.ai.status === 'ok' ? { ...res.ai, proposals: res.ai.proposals.map((x) => ({ ...x, source: 'ai' })) } : res.ai;
    view.check = { state: 'done', ran: withAi, rules: res.rules.map((x) => ({ ...x, source: 'admin' })), ai };
  } catch (e) {
    if (ctrl.signal.aborted || !view.check || view.check.token !== token) return;
    view.check = { state: 'error', message: (e && e.message) || 'Chưa chạy được kiểm tra.' };
  }
  rerender();
}
function stopCheck() {
  const check = view.check;
  if (!check || check.state !== 'running') return;
  check.ctrl.abort();
  view.check = null; rerender();
  Codi.ui.toast(check.ai ? 'Đã dừng chờ kết quả. Lượt rà soát AI này vẫn được tính vào giới hạn mỗi giờ.' : 'Đã dừng kiểm tra.');
}
const pending = (check) => [...check.rules, ...(check.ai && check.ai.status === 'ok' ? check.ai.proposals : [])].filter((x) => !x.done);
function skipProposal(x) { x.done = true; rerender(); }
async function acceptProposals(ctx, pick) {
  let added = 0;
  for (const x of pick) {
    try { await addFlag(ctx, x.target, x.severity, x.comment, x.source); x.done = true; added += 1; } catch (e) { Codi.ui.toast(e.message, { type: 'danger' }); break; }
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
  const res = await Codi.ui.confirm({ title: `Duyệt và xuất bản "${c.title}"?`, body: `Giá bán: ${price ? fmt.vnd(price) : 'Miễn phí'}.`, consequence: 'Khoá học xuất hiện ngay trong danh mục và học viên mua được với giá này. Giảng viên nhận thông báo.', confirmLabel: 'Duyệt và xuất bản' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('approvePublication', c.id, ctx.requestId, price), 'Đã xuất bản khoá học.'))) return;
  delete priceDraft[c.id];
  Codi.go('/admin/publication?tab=approved&id=' + c.id);
}
async function requestChanges(ctx, c, r) {
  const fixes = CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status === 'fix');
  const open = r.flags.filter((f) => f.status !== 'closed');
  if (!fixes.length && !open.length) { Codi.ui.toast('Chưa có tiêu chí "Cần sửa" hay cờ nào để gửi. Gắn cờ trước khi yêu cầu sửa.', { type: 'warn' }); return; }
  const res = await confirmImpact({ title: `Yêu cầu sửa "${c.title}"?`, body: <p>{`Gửi ${fixes.length} tiêu chí cần sửa và ${open.length} cờ (${open.filter((f) => f.severity === 'must').length} bắt buộc) cho giảng viên.`}</p>, consequence: 'Khoá học chuyển sang "Bị từ chối" và không được bán. Giảng viên sửa theo từng cờ rồi gửi lại thành vòng duyệt mới.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).', reasonLabel: 'Lời nhắn chung cho giảng viên', reasonPlaceholder: 'Ví dụ: Nội dung tốt, cần bổ sung tài liệu bài 4 và sửa đáp án quiz.', confirmLabel: 'Gửi yêu cầu sửa' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('requestChanges', c.id, ctx.requestId, res.reason), 'Đã gửi yêu cầu sửa cho giảng viên.'))) return;
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
}
async function reject(ctx, c) {
  const res = await confirmImpact({ title: `Từ chối "${c.title}"?`, body: <p>Dùng khi khoá học không phù hợp chính sách hoặc chất lượng chung chưa đạt. Nếu chỉ cần sửa vài chỗ, hãy dùng &quot;Yêu cầu sửa&quot;.</p>, consequence: 'Khoá học chuyển sang "Bị từ chối" và không được bán. Giảng viên thấy lý do và vẫn có thể sửa rồi gửi lại.', requireReason: true, minReason: 5, reasonError: 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).', reasonLabel: 'Lý do từ chối', danger: true, confirmLabel: 'Từ chối và gửi lý do' });
  if (!res.ok) return;
  if (!(await attempt(() => pubAction('rejectPublication', c.id, ctx.requestId, res.reason), 'Đã từ chối và gửi lý do cho giảng viên.'))) return;
  Codi.go('/admin/publication?tab=changes&id=' + c.id);
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

function ProposalList({ ctx, items }) {
  return (
    <ul className="rv-flags">{items.map((x, i) => (x.done ? null : (
      <li key={i} className="rv-flag is-suggestion"><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><SevBadge s={x.severity} />{x.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}<span className="small strong">{x.target.label}</span></div><p className="small">{x.comment}</p>
        <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-primary btn-sm" onClick={() => acceptProposals(ctx, [x])}>Thêm cờ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => skipProposal(x)}>Bỏ qua</button></div></li>
    )))}</ul>
  );
}

function checkPanel(d, ctx, check) {
  const ls = lessonsOf(d.course);
  const quizLessons = ls.filter((l) => l.quiz && l.quiz.questions && l.quiz.questions.length).length;
  const start = (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => runCheck(ctx, false)}>Chạy kiểm tra quy tắc</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => runCheck(ctx, true)} disabled={!quizLessons} title={quizLessons ? undefined : 'Khoá học chưa có bài nào có quiz'}><Icon name="sparkles" className="icon-sm" /> Rà soát quiz bằng AI</button>
    </div>
  );
  if (!check) {
    return (
      <div className="rv-ai stack-2"><div className="stack-1"><strong className="small">Kiểm tra tự động</strong>
        <p className="xsmall muted"><strong>Kiểm tra theo quy tắc</strong> chạy ngay, không gọi AI: mô tả, bài kiểm tra đầu vào, tệp bài học, quiz, bài code và thang chấm.</p>
        <p className="xsmall muted"><strong>Rà soát quiz bằng AI</strong> gọi một mô hình ngôn ngữ để đối chiếu từng câu quiz với nội dung chữ của bài. Thường mất 30 đến 60 giây tuỳ số bài có quiz.</p>
        <p className="xsmall muted">Kết quả chỉ là đề xuất. Chưa có gì thành cờ cho đến khi bạn bấm &quot;Thêm cờ&quot;, và bạn có thể bỏ qua từng đề xuất.</p></div>
        {start}</div>
    );
  }
  if (check.state === 'running') {
    return (
      <div className="rv-ai" aria-busy="true"><span className="ai-thinking-row"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>{check.ai ? `Đang kiểm tra quy tắc; AI đang đối chiếu quiz của ${quizLessons} bài với nội dung bài. Thường mất 30 đến 60 giây. "Dừng" chỉ ngừng chờ kết quả; lượt rà soát vẫn được tính vào giới hạn mỗi giờ.` : 'Đang kiểm tra theo quy tắc…'}</span></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stopCheck}><Icon name="x" className="icon-sm" /> Dừng</button></div>
    );
  }
  if (check.state === 'error') return <Alert type="danger" title="Chưa chạy được kiểm tra" body={`${check.message} Bạn vẫn duyệt thủ công bình thường.`} actions={start} />;
  const left = pending(check);
  const rules = check.rules.filter((x) => !x.done);
  const ai = check.ai;
  const aiItems = ai && ai.status === 'ok' ? ai.proposals.filter((x) => !x.done) : [];
  return (
    <section className="rv-ai is-done stack-3">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}><strong className="small">{left.length ? `Kết quả kiểm tra · còn ${left.length} đề xuất chưa xử lý` : 'Kết quả kiểm tra · đã xử lý hết đề xuất'}</strong>
        <span className="row" style={{ gap: 8 }}>{left.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => acceptProposals(ctx, left)}>Thêm tất cả ({left.length})</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { view.check = null; rerender(); }}>Chạy lại</button></span></div>
      <div className="stack-2"><strong className="xsmall muted">Theo quy tắc ({check.rules.length})</strong>
        {rules.length ? <ProposalList ctx={ctx} items={check.rules} /> : <p className="xsmall muted">{check.rules.length ? 'Đã xử lý mọi đề xuất theo quy tắc.' : 'Không phát hiện vấn đề theo quy tắc.'}</p>}</div>
      {check.ran && ai && ai.status === 'ok' && (
        <div className="stack-2"><strong className="xsmall muted row" style={{ gap: 4 }}><Icon name="sparkles" className="icon-sm" /> AI đối chiếu quiz với bài học ({ai.proposals.length} đề xuất từ {ai.lessonsRead} bài{ai.lessonsSkipped ? `, bỏ qua ${ai.lessonsSkipped} bài không có nội dung chữ` : ''})</strong>
          {aiItems.length ? <ProposalList ctx={ctx} items={ai.proposals} /> : <p className="xsmall muted">{ai.proposals.length ? 'Đã xử lý mọi đề xuất của AI.' : 'AI không thấy quiz nào lệch với nội dung bài.'}</p>}
          <p className="xsmall muted">AI có thể sai — đề xuất chỉ thành cờ khi bạn chấp nhận.</p></div>
      )}
      {check.ran && ai && ai.status === 'unavailable' && <Alert type={ai.code === 'rate_limited' ? 'warn' : 'danger'} title="Lượt rà soát AI chưa chạy được" body={`${ai.message} Kết quả theo quy tắc ở trên vẫn dùng được.`} actions={ai.code === 'rate_limited' ? null : <button type="button" className="btn btn-secondary btn-sm" onClick={() => runCheck(ctx, true)}><Icon name="sparkles" className="icon-sm" /> Rà soát lại bằng AI</button>} />}
    </section>
  );
}

function flagsView({ d, r, ro, ctx, tab }) {
  // The backend already orders open before closed, must before should.
  const live = r.flags;
  return (
    <div className="stack-4">
      {!ro && checkPanel(d, ctx, view.check)}
      {!live.length ? <div className="viz-empty">Chưa có cờ nào. Gắn cờ ngay tại chỗ trong thẻ "Xem trước" hoặc chạy kiểm tra tự động.</div> : (
        <ul className="rv-flags">{live.map((f) => (
          <FlagCard key={f.id} f={f} ctx={ctx} ro={ro} target={<button type="button" className="btn-link rv-flag-target" onClick={() => gotoFlag(tab, f)}><Icon name="map" className="icon-sm" /> {f.targetLabel}</button>} />
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

/** Thousands separators for the price field ("10000" → "10.000"); parsePrice reads both forms back. */
const formatPrice = (n) => {
  if (n == null || n === '') return '';
  const v = parsePrice(n);
  return v === null ? String(n) : v.toLocaleString('vi-VN');
};

function decisionCard(d, item, ctx) {
  const c = d.course; const r = d.round;
  const def = proposed(c, item);
  const price = priceDraft[c.id] !== undefined ? priceDraft[c.id] : formatPrice(def);
  const why = d.blockingReasons;
  const onPriceBlur = (e) => {
    const n = parsePrice(e.target.value);
    if (n === null) return; // keep what was typed; approve() reports the error
    e.target.value = formatPrice(n);
    priceDraft[c.id] = e.target.value;
  };
  return (
    <section className="card rv-decision"><div className="card-body stack-3">
      <h3 className="tc-h">Kết luận vòng {r.round}</h3>
      <div className={`field ${priceDraft.err ? 'is-invalid' : ''}`} style={{ maxWidth: 320 }}><label htmlFor="pub-price">Giá bán (VND) <span className="req">*</span></label>
        <input key={c.id} id="pub-price" className="mono" inputMode="numeric" defaultValue={price} aria-describedby="pub-price-help" onBlur={onPriceBlur} onChange={(e) => { priceDraft[c.id] = e.target.value; }} />
        <span id="pub-price-help" className="field-help">Giảng viên đề xuất: {c.proposedPrice == null ? 'chưa đề xuất' : fmt.vnd(c.proposedPrice)}. Nhập 0 cho khoá miễn phí.</span>
        {priceDraft.err && <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{priceDraft.err}</span></p>}</div>
      {why.length
        ? <div className="rv-why"><strong className="small">Chưa thể duyệt:</strong><ul className="small">{why.map((x) => <li key={x}>{x}</li>)}</ul></div>
        : <p className="small text-success"><Icon name="check-circle" className="icon-sm" /> Đủ điều kiện duyệt.</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={why.length > 0} onClick={() => approve(ctx, c, item, why)}>Duyệt và xuất bản</button>
        <button type="button" className="btn btn-secondary" onClick={() => requestChanges(ctx, c, r)}>Yêu cầu sửa</button>
        <button type="button" className="btn btn-danger-outline" onClick={() => reject(ctx, c)}>Từ chối</button>
      </div>
      <ul className="rv-decision-hints xsmall muted" aria-label="Hậu quả của từng lựa chọn">
        <li><strong>Duyệt và xuất bản:</strong> khoá học bán ngay với giá đã nhập. Giảng viên nhận thông báo.</li>
        <li><strong>Yêu cầu sửa:</strong> giảng viên sửa theo các cờ rồi gửi lại thành vòng mới; khoá học chưa bán trong lúc đó.</li>
        <li><strong>Từ chối:</strong> chỉ khi khoá học không đạt chính sách hoặc chất lượng chung. Giảng viên thấy lý do và vẫn có thể sửa rồi gửi lại.</li>
      </ul>
      </div></section>
  );
}

function Detail({ tab, item, q }) {
  const res = useAction('dashboard/admin/publication', 'getAdminCourseReview', [item.id]);
  const d = res.data;
  // After "jump to place" from the Cờ list: scroll the flag into view once the preview has rendered it.
  useEffect(() => {
    if (!d || view.courseId !== item.id || view.tab !== 'content' || !view.focus) return;
    const el = document.getElementById(`rv-flag-${view.focus}`);
    if (!el) return;
    view.focus = null;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-focus');
    setTimeout(() => el.classList.remove('is-focus'), 1600);
  });
  if (!d) {
    if (res.loading) return <SpinnerBlock text="Đang tải khoá học…" />;
    if (item.status !== 'pending') {
      // Published before the detailed review flow existed: no publication request to show.
      return (
        <section className="card"><div className="card-body stack-3"><h2 className="tc-h">{item.title}</h2><p className="small muted">Khoá học được duyệt trước khi có quy trình duyệt chi tiết. Giá đang bán: {fmt.vnd(item.price)}.</p>
          <Link className="btn btn-secondary" style={{ width: 'fit-content' }} to="/admin/courses">Mở Khoá học đã xuất bản</Link></div></section>
      );
    }
    return <Alert type="danger" title="Không tải được khoá học" body={res.error ? res.error.message : ''} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => res.reload()}>Thử lại</button>} />;
  }
  const v = forCourse(item.id);
  if (q.view && VIEWS.includes(q.view)) v.tab = q.view;
  const r = d.round; const c = d.course;
  const ro = item.status !== 'pending' || r.status !== 'in_review';
  const ctx = { courseId: c.id, requestId: r.id };
  const nFlags = r.flags.filter((f) => f.status !== 'closed').length;
  const fixedCarried = r.flags.filter((f) => f.carried && f.status === 'fixed').length;
  const preview = () => <PreviewView d={d} r={r} ro={ro} ctx={ctx} tab={tab} node={v.node} mode={v.mode}
    onNode={(n) => { v.node = n; v.focus = null; rerender(); }} onMode={(m) => { v.mode = m; rerender(); }} />;
  const body = { criteria: criteriaView, content: preview, flags: flagsView, history: historyView }[v.tab]({ d, r, ro, ctx, tab });
  return (
    <div className="stack-4" aria-busy={res.loading}><section className="card"><div className="card-body stack-4">
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}><div className="stack-1"><h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{c.title}</h2>
        <span className="small muted">{d.instructor ? d.instructor.name : item.instructorName} · {c.category} · {LEVEL_LABEL[c.level] || c.level} · Vòng {r.round} · gửi {fmt.relative(r.requestedAt)}</span></div>
        <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openLearnerPreview(tab)}><Icon name="eye" className="icon-sm" /> Xem trước như học viên</button></div></div>
      {r.status !== 'in_review' && <Alert type={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warn'} title={`Vòng ${r.round}: ${ROUND[r.status]}`} body={r.reviewNote || ''} />}
      {!ro && fixedCarried > 0 && <Alert type="info" title={`Giảng viên đã sửa ${fixedCarried} cờ của vòng trước`} body={'Mở "Xem trước" để thấy phần đã sửa ngay tại chỗ, rồi đóng cờ.'} actions={v.tab !== 'content' ? <Link className="btn btn-secondary btn-sm" to={`/admin/publication?tab=${tab}&id=${item.id}&view=content`}>Xem phần đã sửa</Link> : null} />}
    </div></section>{!ro && decisionCard(d, item, ctx)}<section className="card"><div className="card-body stack-4">
      <div className="tabs" role="tablist" style={{ margin: 0 }}>
        {[['criteria', 'Tiêu chí'], ['content', 'Xem trước'], ['flags', `Cờ${nFlags ? ' (' + nFlags + ')' : ''}`], ['history', 'Lịch sử']].map(([k, l]) => (
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
    detail = <div className="card"><Empty icon="clipboard-check" title={tab === 'pending' ? 'Không có khoá học chờ duyệt' : 'Không có khoá học'} body={tab === 'pending' ? 'Yêu cầu mới từ giảng viên sẽ xuất hiện ở đây.' : ''} /></div>;
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
        )) : <p className="small muted" style={{ padding: 16 }}>{queue ? 'Không có khoá học.' : 'Đang tải…'}</p>}</div>
        <div className="split-detail">{detail}</div>
      </div>
    </AdminShell>
  );
}
