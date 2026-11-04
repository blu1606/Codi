/**
 * Shared pieces of the learning loop: load guards, diagnostic card, path-update notice, adaptive offer, completion +
 * course review (S14). All writes go to the backend (path / onboarding / overview commands).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Codi } from '../../lib/codi';
import { Alert, Empty, Icon, SpinnerBlock, Stars } from '../../components/ui/primitives';
import { STATUS, TYPE_LABEL, errorText, postOnboarding, postPath } from './learning-store';

export function StatusBadge({ st }) {
  return <span className={`badge ${STATUS[st][1]}`}><Icon name={STATUS[st][2]} />{STATUS[st][0]}</span>;
}

export function NotEnrolled({ courseId, message }) {
  // The learn routes use the course id; the public detail page uses the slug.
  const { data } = useApi('/api/courses');
  const course = data && Array.isArray(data.courses) ? data.courses.find((c) => c.id === courseId) : null;
  return (
    <div className="page page-narrow">
      <Empty icon="lock" title="Bạn chưa sở hữu khoá học này" body={message || 'Mua hoặc đăng ký khoá học để bắt đầu học.'}
        actions={<Link className="btn btn-primary" to={course ? `/courses/${course.slug}` : '/courses'}>Xem khoá học</Link>} />
    </div>
  );
}

export function NotFound({ title = 'Không tìm thấy khoá học' }) {
  return (
    <div className="page page-narrow">
      <Empty icon="map" title={title} actions={<Link className="btn btn-primary" to="/dashboard">Về trang chủ</Link>} />
    </div>
  );
}

/** Page state while a learn endpoint loads or after it failed (403 not enrolled, 404 missing, other errors). */
export function LoadState({ loading, error, courseId, onRetry, text = 'Đang tải lộ trình…', notFoundTitle }) {
  if (loading) return <div className="page page-narrow"><SpinnerBlock text={text} /></div>;
  if (!error) return null;
  if (error.status === 403) return <NotEnrolled courseId={courseId} message={error.message} />;
  if (error.status === 404 || error.status === 400) return <NotFound title={notFoundTitle} />;
  return (
    <div className="page page-narrow">
      <Alert type="danger" title="Chưa thể tải dữ liệu học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')}
        actions={onRetry ? <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Thử lại</button> : null} />
    </div>
  );
}

/** Opens the onboarding at the entry test (POST diagnostic-retake), then navigates there. */
export async function takeDiagnostic(courseId) {
  try {
    await postOnboarding(courseId, { type: 'diagnostic-retake' });
    Codi.go(`/learn/${courseId}/onboarding`);
  } catch (e) {
    Codi.ui.toast(errorText(e, 'Không thể mở bài kiểm tra đầu vào.'), { type: 'danger' });
  }
}

/** Diagnostic suggestion shown when the learner skipped the entry test (dashboard + path). */
export function DiagCard({ courseId, title, onChange }) {
  const [busy, setBusy] = useState(false);
  // Real dashboard: dismissing shows an undo toast.
  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post('/api/learner/overview', { type: 'dismiss-diagnostic', courseId });
      if (onChange) onChange();
      const restore = async () => {
        try {
          await api.post('/api/learner/overview', { type: 'restore-diagnostic', courseId, dismissedAt: res.dismissedAt });
          if (onChange) onChange();
        } catch (e) { Codi.ui.toast(errorText(e, 'Chưa thể hoàn tác.'), { type: 'danger' }); }
      };
      Codi.ui.toast('Đã ẩn thông báo cá nhân hoá lộ trình.', res && res.dismissedAt ? { action: { label: 'Hoàn tác', onClick: restore } } : undefined);
    } catch (e) {
      Codi.ui.toast(errorText(e, 'Chưa thể ẩn thông báo.'), { type: 'danger' });
    } finally { setBusy(false); }
  };
  return (
    <section className="card"><div className="card-body stack-3" role="status">
      <div className="row-between"><strong>Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)</strong>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} disabled={busy} aria-label={`Ẩn thông báo cá nhân hoá ${title}`}><Icon name="x" className="icon-sm" /></button></div>
      <p className="small muted">Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => takeDiagnostic(courseId)}>Làm bài kiểm tra đầu vào</button>
    </div></section>
  );
}

const UPDATE_ICONS = { 'moved-up': 'arrow-up', 'now-skippable': 'skip-forward', unlocked: 'unlock' };
/** Path update after a completion (CoursePathView.update). rows: path rows; onView: replaces the path view. */
export function UpdateNotice({ courseId, view, rows, inPlayer, onView }) {
  const u = view && view.update;
  if (!u) return null;
  const done = rows.find((x) => x.id === u.afterLessonId);
  const next = view.currentLessonId ? rows.find((x) => x.id === view.currentLessonId) : null;
  const dismiss = async () => {
    try { onView(await postPath(courseId, { type: 'dismiss-update', pathId: view.pathId })); }
    catch (e) { Codi.ui.toast(errorText(e, 'Chưa thể ẩn thông báo.'), { type: 'danger' }); }
  };
  return (
    <section className="card ln-update" aria-live="polite"><div className="card-body stack-3">
      <div className="row-between"><span className="row strong"><Icon name="check-circle" className="text-success" /> Đã hoàn thành: {done ? done.title : ''}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Ẩn thông báo</button></div>
      <div className="stack-2"><strong>{u.changes.length ? 'Lộ trình đã được cập nhật' : 'Lộ trình vẫn phù hợp'}</strong>
        {u.message && <p className="small muted">{u.message}</p>}
        {u.changes.length > 0 && <ul className="list ln-changes">{u.changes.map((ch, i) => <li key={i}><Icon name={UPDATE_ICONS[ch.type] || 'info'} className="icon-sm" /><span>{ch.text}</span></li>)}</ul>}
        {inPlayer && <Link className="small" to={`/learn/${courseId}`}>Xem lộ trình đầy đủ</Link>}
      </div>
      {next ? (
        <div className="panel row-between"><div className="stack-1"><span className="xsmall muted">Bài tiếp theo</span><strong>{next.title}</strong><span className="xsmall muted">{TYPE_LABEL[next.kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(next.durationMin)}</span></div><Link className="btn btn-primary" to={`/learn/${courseId}/${next.id}`}>Học tiếp</Link></div>
      ) : view.complete ? (
        <div className="panel row-between"><strong>Bạn đã hoàn thành khoá học</strong><Link className="btn btn-primary" to={`/learn/${courseId}`}>Xem tổng kết</Link></div>
      ) : null}
    </div></section>
  );
}

function ReviewBlock({ courseId, title, review, onSaved }) {
  if (review) {
    return <div className="row"><Stars n={review.rating} /><span className="small muted">Bạn đã đánh giá {review.rating}/5</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview({ courseId, title, review, onSaved })}>Sửa đánh giá</button></div>;
  }
  return (
    <div className="stack-2"><span className="small">Bạn thấy khoá học thế nào?</span>
      <div className="star-input" role="group" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => openReview({ courseId, title, review, stars: n, onSaved })} aria-label={`${n} sao`}><Icon name="star" /></button>)}</div></div>
  );
}

/** view: CoursePathView (review + recommendation come from the backend). */
export function CompletionCard({ view, onView }) {
  const c = view.course;
  const next = view.recommendation;
  return (
    <section className="card ln-complete"><div className="card-body stack-4">
      <div className="row"><Icon name="graduation-cap" className="icon-lg text-success" /><div className="stack-1"><h2>Chúc mừng! Bạn đã hoàn thành khoá học</h2><p className="small muted">{c.title}</p></div></div>
      <ReviewBlock courseId={c.id} title={c.title} review={view.review} onSaved={onView} />
      {next && <div className="panel row-between"><div className="stack-1"><span className="xsmall muted">Khoá học gợi ý tiếp theo</span><strong>{next.title}</strong></div><Link className="btn btn-secondary" to={`/courses/${next.slug}`}>Xem khoá học</Link></div>}
    </div></section>
  );
}

/**
 * Non-blocking offer right after a completion (AdjustmentOffer from POST complete): an insight plus the options that
 * apply now. Applying writes the adjusted path; the toast offers "Hoàn tác" (undo-adjust).
 */
export function OfferCard({ courseId, offer, onView, onDone, onViewPath, onApplied }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  if (!offer) return null;
  const options = offer.options.filter((o) => o.type !== 'keep');
  const apply = async (option) => {
    if (busy) return;
    setBusy(option); setError(null);
    try {
      const path = await postPath(courseId, { type: 'adjust', afterLessonId: offer.afterLessonId, option });
      onView(path);
      onDone();
      // The caller shows the changed path itself (with its own keep/undo choice).
      if (onApplied) { onApplied(path); return; }
      const undo = async () => {
        try { onView(await postPath(courseId, { type: 'undo-adjust', pathId: path.pathId })); Codi.ui.toast('Đã hoàn tác. Lộ trình trở về như trước.'); }
        catch (e) { Codi.ui.toast(errorText(e, 'Chưa thể hoàn tác.'), { type: 'danger' }); }
      };
      Codi.ui.toast('Đã cập nhật lộ trình.', { type: 'success', action: { label: 'Hoàn tác', onClick: undo } });
    } catch (e) {
      setError(errorText(e, 'Chưa thể cập nhật lộ trình.'));
    } finally { setBusy(null); }
  };
  return (
    <section className="card ln-offer" aria-live="polite"><div className="card-body stack-3">
      <div className="row"><Icon name="sparkles" className="icon-sm" /><strong>Codi gợi ý điều chỉnh lộ trình</strong></div>
      <p className="small">{offer.insight}</p>
      {error && <Alert type="danger" body={error} />}
      {options.length > 0 && <ul className="list ln-offer-list">{options.map((o) => (
        <li key={o.type} className="panel row-between">
          <div className="stack-1 od-fill"><strong className="small">{o.label}</strong><span className="xsmall muted">{o.description}</span></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply(o.type)} disabled={!!busy} aria-busy={busy === o.type || undefined}>Áp dụng</button></li>
      ))}</ul>}
      <div className="row-between"><span className="xsmall muted">{onApplied ? 'Áp dụng để xem lộ trình mới, rồi chọn dùng hay giữ lộ trình cũ.' : 'Áp dụng xong, bạn có thể hoàn tác ngay từ thông báo.'}</span><div className="row" style={{ gap: 4 }}>{onViewPath && <button type="button" className="btn btn-ghost btn-sm" onClick={onViewPath}>Xem lộ trình</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Giữ nguyên lộ trình</button></div></div>
    </div></section>
  );
}

// ───────────────────────── review (S14) ─────────────────────────
function ReviewDialog({ courseId, review, initialStars, onSaved, handle }) {
  const [val, setVal] = useState(initialStars || (review ? review.rating : 0));
  const [text, setText] = useState(review ? review.text || '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    if (!val || busy) return;
    setBusy(true); setError(null);
    try {
      const path = await postPath(courseId, { type: 'review', rating: val, text: text.trim() });
      if (onSaved) onSaved(path);
      handle.close();
      Codi.ui.toast(review ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn! Đánh giá đã hiển thị trên trang khoá học.', { type: 'success' });
    } catch (e) {
      setError(errorText(e, 'Chưa thể lưu đánh giá. Vui lòng thử lại.'));
      setBusy(false);
    }
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
          <div className="field"><label htmlFor="rv-text">Nhận xét <span className="muted">(không bắt buộc)</span></label><textarea id="rv-text" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></div>
          {error && <Alert type="danger" body={error} />}
        </form>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-ghost" data-close>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!val || busy} aria-busy={busy || undefined} onClick={submit}>{review ? 'Lưu thay đổi' : 'Gửi đánh giá'}</button>
      </div>
    </>
  );
}

/** { courseId, title, review: {rating,text}|null, stars?, onSaved(pathView) } */
export function openReview({ courseId, title, review, stars, onSaved }) {
  Codi.ui.modal({
    title: review ? 'Sửa đánh giá' : `Đánh giá "${title}"`,
    raw: true,
    body: (h) => <ReviewDialog courseId={courseId} review={review} initialStars={stars} onSaved={onSaved} handle={h} />,
  });
}
