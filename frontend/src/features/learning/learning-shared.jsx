/** Shared pieces of the learning loop: guards, path-update notice, adaptive offer, completion + review (S14). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Empty, Icon, Stars } from '../../components/ui/primitives';
import {
  STATUS, TYPE_LABEL, applyOffer, conceptName, isCourseComplete, offerChoices, rec, save, uid,
} from './learning-store';

export function StatusBadge({ st }) {
  return <span className={`badge ${STATUS[st][1]}`}><Icon name={STATUS[st][2]} />{STATUS[st][0]}</span>;
}

export function NotEnrolled({ c }) {
  return (
    <div className="page page-narrow">
      <Empty icon="lock" title="Bạn chưa sở hữu khoá học này" body="Mua hoặc đăng ký khoá học để bắt đầu học." actions={<Link className="btn btn-primary" to={`/courses/${c.slug}`}>Xem khoá học</Link>} />
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page page-narrow">
      <Empty icon="map" title="Không tìm thấy khoá học" actions={<Link className="btn btn-primary" to="/dashboard">Về bàn làm việc</Link>} />
    </div>
  );
}

/** Returns a guard element (not found / not enrolled) or null when the learner may open the course. */
export function courseGuard(c) {
  if (!c) return <NotFound />;
  if (!Codi.isEnrolled(c.id)) return <NotEnrolled c={c} />;
  return null;
}

/** Diagnostic suggestion shown when the learner skipped the entry test (dashboard + path). */
export function DiagCard({ c }) {
  // Real dashboard: dismissing shows an undo toast.
  const dismiss = () => {
    const r = rec(c.id); r.diag.diagCardDismissed = true; save();
    Codi.ui.toast('Đã ẩn thông báo cá nhân hoá lộ trình.', { action: { label: 'Hoàn tác', onClick: () => { rec(c.id).diag.diagCardDismissed = false; save(); } } });
  };
  const take = () => {
    const r = rec(c.id);
    r.diag = { status: 'intro', index: 0, answers: {}, diagCardDismissed: r.diag.diagCardDismissed };
    save(false);
    Codi.go('/learn/' + c.id + '/onboarding?view=intro');
  };
  return (
    <section className="card"><div className="card-body stack-3" role="status">
      <div className="row-between"><strong>Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)</strong>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} aria-label={`Ẩn thông báo cá nhân hoá ${c.title}`}><Icon name="x" className="icon-sm" /></button></div>
      <p className="small muted">Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={take}>Làm bài kiểm tra đầu vào</button>
    </div></section>
  );
}
export const showDiagCard = (r) => r.pathSource === 'default' && r.pathStatus === 'ready' && r.diag.status === 'skipped' && !r.diag.diagCardDismissed;

const UPDATE_ICONS = { 'moved-up': 'arrow-up', 'now-skippable': 'skip-forward', unlocked: 'unlock' };
export function UpdateNotice({ c, r, inPlayer }) {
  const u = r.lastUpdate;
  if (!u) return null;
  const done = Codi.lesson(c, u.afterLessonId);
  const next = u.nextLessonId ? Codi.lesson(c, u.nextLessonId) : null;
  const dismiss = () => { rec(c.id).lastUpdate = null; save(); };
  return (
    <section className="card ln-update" aria-live="polite"><div className="card-body stack-3">
      <div className="row-between"><span className="row strong"><Icon name="check-circle" className="text-success" /> Đã hoàn thành: {done ? done.title : ''}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Ẩn thông báo</button></div>
      <div className="stack-2"><strong>Lộ trình đã được cập nhật</strong>
        <ul className="list ln-changes">{u.changes.map((ch, i) => <li key={i}><Icon name={UPDATE_ICONS[ch.type] || 'info'} className="icon-sm" /><span>{ch.text}</span></li>)}</ul>
        {inPlayer && <Link className="small" to={`/learn/${c.id}`}>Xem lộ trình đầy đủ</Link>}
      </div>
      {next ? (
        <div className="panel row-between"><div className="stack-1"><span className="xsmall muted">Bài tiếp theo</span><strong>{next.title}</strong><span className="xsmall muted">{TYPE_LABEL[next.type]} · {Codi.fmt.duration(next.durationMin)}</span></div><Link className="btn btn-primary" to={`/learn/${c.id}/${next.id}`}>Học tiếp</Link></div>
      ) : isCourseComplete(c, r) ? (
        <div className="panel row-between"><strong>Bạn đã hoàn thành khoá học</strong><Link className="btn btn-primary" to={`/learn/${c.id}`}>Xem tổng kết</Link></div>
      ) : null}
    </div></section>
  );
}

function ReviewBlock({ c }) {
  const mine = Codi.db().reviews.find((x) => x.courseId === c.id && x.userId === uid());
  if (mine) {
    return <div className="row"><Stars n={mine.stars} /><span className="small muted">Bạn đã đánh giá {mine.stars}/5</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview(c.id, mine.stars)}>Sửa đánh giá</button></div>;
  }
  return (
    <div className="stack-2"><span className="small">Bạn thấy khoá học thế nào?</span>
      <div className="star-input" role="group" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => openReview(c.id, n)} aria-label={`${n} sao`}><Icon name="star" /></button>)}</div></div>
  );
}

export function CompletionCard({ c }) {
  const next = Codi.db().courses.find((x) => x.status === 'published' && !Codi.isEnrolled(x.id) && x.id !== c.id);
  return (
    <section className="card ln-complete"><div className="card-body stack-4">
      <div className="row"><Icon name="graduation-cap" className="icon-lg text-success" /><div className="stack-1"><h2>Chúc mừng! Bạn đã hoàn thành khoá học</h2><p className="small muted">{c.title}</p></div></div>
      <ReviewBlock c={c} />
      {next && <div className="panel row-between"><div className="stack-1"><span className="xsmall muted">Khoá học gợi ý tiếp theo</span><strong>{next.title}</strong></div><Link className="btn btn-secondary" to={`/courses/${next.slug}`}>Xem khoá học</Link></div>}
    </div></section>
  );
}

function undoOffer(courseId, at) {
  const r = rec(courseId); const a = r.adjustment;
  if (!a || a.at !== at) return;
  r.order = a.before.order; r.skippable = a.before.skippable; r.offer = a.offer; r.adjustment = null; r.highlight = [];
  save();
  Codi.ui.toast('Đã hoàn tác. Lộ trình trở về như trước.');
}

// Non-blocking offer after a completion: an insight plus the options that apply right now (decisions 66–67).
export function OfferCard({ c, r, onViewPath }) {
  if (!r.offer) return null;
  const ch = offerChoices(c, r); const off = r.offer;
  const names = (ids) => ids.map((k) => conceptName(c, k)).join(', ');
  const titles = (ids) => ids.map((id) => Codi.lesson(c, id).title).join(', ');
  const lines = [];
  if (off.strong.length) lines.push(`Codi thấy bạn đã nắm vững ${names(off.strong)}.`);
  if (off.weak.length) lines.push(`Bạn còn chưa chắc về ${names(off.weak)}.`);
  if (!lines.length) lines.push('Codi chưa có đủ kết quả quiz hoặc bài code để đánh giá bài này.');
  const options = [
    ['skip', 'Bỏ qua bài đã vững', ch.skip, `${ch.skip.length} bài mà mọi khái niệm đã Thành thạo: ${titles(ch.skip)}`],
    ['practice', 'Luyện thêm', ch.practice, `Đưa ${ch.practice.length} bài về ${names(off.weak)} lên ngay sau bài này: ${titles(ch.practice)}`],
    ['harder', 'Nâng độ khó', ch.harder, `Đưa ${ch.harder.length} bài thử thách đã đủ tiên quyết lên trước: ${titles(ch.harder)}`],
  ].filter((o) => o[2].length);
  const apply = (kind) => {
    const rr = rec(c.id);
    const ids = applyOffer(c, rr, kind);
    save();
    if (!ids) return;
    const msg = { skip: `Đã đánh dấu ${ids.length} bài có thể bỏ qua.`, practice: `Đã đưa ${ids.length} bài luyện thêm lên sau bài vừa học.`, harder: `Đã đưa ${ids.length} bài thử thách lên trước.` }[kind];
    const at = rr.adjustment.at;
    Codi.ui.toast(msg, { type: 'success', action: { label: 'Hoàn tác', onClick: () => undoOffer(c.id, at) } });
  };
  const keep = () => { rec(c.id).offer = null; save(); };
  return (
    <section className="card ln-offer" aria-live="polite"><div className="card-body stack-3">
      <div className="row"><Icon name="sparkles" className="icon-sm" /><strong>Codi gợi ý điều chỉnh lộ trình</strong></div>
      <p className="small">{lines.join(' ')}</p>
      <ul className="list ln-offer-list">{options.map(([kind, label, , hint]) => (
        <li key={kind} className="panel row-between">
          <div className="stack-1 od-fill"><strong className="small">{label}</strong><span className="xsmall muted">{hint}</span></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply(kind)}>Áp dụng</button></li>
      ))}</ul>
      <div className="row-between"><span className="xsmall muted">Áp dụng xong, bạn có thể hoàn tác ngay từ thông báo.</span><div className="row" style={{ gap: 4 }}>{onViewPath && <button type="button" className="btn btn-ghost btn-sm" onClick={onViewPath}>Xem lộ trình</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={keep}>Giữ nguyên lộ trình</button></div></div>
    </div></section>
  );
}

// ───────────────────────── review (S14) ─────────────────────────
function ReviewDialog({ courseId, initialStars, handle }) {
  const c = Codi.course(courseId);
  const mine = Codi.db().reviews.find((x) => x.courseId === courseId && x.userId === uid());
  const [val, setVal] = useState(initialStars || (mine ? mine.stars : 0));
  const [text, setText] = useState(mine ? mine.text || '' : '');
  const submit = () => {
    if (!val) return;
    const t = text.trim();
    Codi.set((st) => {
      if (mine) { mine.stars = val; mine.text = t; }
      else st.db.reviews.push({ id: Codi.uid('rv'), courseId, userId: uid(), stars: val, text: t, createdAt: new Date().toISOString(), reply: null });
      const rs = st.db.reviews.filter((x) => x.courseId === courseId);
      c.ratingCount = Math.max(c.ratingCount || 0, rs.length);
    });
    handle.close();
    Codi.ui.toast(mine ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn! Đánh giá đã hiển thị trên trang khoá học.', { type: 'success' });
  };
  return (
    <>
      <div className="dialog-body">
        <form className="stack-4" id="review-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="stack-2"><span className="field-label">Đánh giá của bạn <span className="req">*</span></span>
            <div className="star-input" role="radiogroup" aria-label="Số sao">{[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={val === n} className={n <= val ? 'on' : ''} onClick={() => setVal(n)} aria-label={`${n} sao`}><Icon name={n <= val ? 'star-filled' : 'star'} /></button>
            ))}</div>
            {!val && <span className="field-help">Chọn số sao để gửi đánh giá.</span>}</div>
          <div className="field"><label htmlFor="rv-text">Nhận xét <span className="muted">(không bắt buộc)</span></label><textarea id="rv-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} /></div>
        </form>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-ghost" data-close>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!val} onClick={submit}>{mine ? 'Lưu thay đổi' : 'Gửi đánh giá'}</button>
      </div>
    </>
  );
}

export function openReview(courseId, stars) {
  const c = Codi.course(courseId);
  if (!c) return;
  const mine = Codi.db().reviews.find((x) => x.courseId === courseId && x.userId === uid());
  Codi.ui.modal({
    title: mine ? 'Sửa đánh giá' : `Đánh giá "${c.title}"`,
    raw: true,
    body: (h) => <ReviewDialog courseId={courseId} initialStars={stars} handle={h} />,
  });
}
