/**
 * After a lesson ('/learn/:courseId/path-update?after=<lessonId>'): shows how Codi changed the path. On a direct visit
 * while the path job still runs it plays an "analysing" sequence; then the lesson list animates from the previous order to the new one,
 * each changed lesson badged with why, and the learner chooses: use the new path (dismiss-update) or keep the previous
 * one (undo-adjust restores the version the update replaced). The lesson player opens it only when the path changed
 * (the AI re-plan, or an adjustment the learner applied); an unchanged path stays a notice in the player.
 * Data: CoursePathView via useCoursePath (polls while updating); view.previous is the replaced order.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { TYPE_LABEL, errorText, pathRows, postPath } from './learning-store';
import { CompletionCard, LoadState } from './learning-shared';
import { useCoursePath } from './path-page';
import './path-update.css';

const ANALYSE_STEPS = ['Ghi nhận kết quả bài vừa học', 'Cập nhật mức thành thạo từng kỹ năng', 'Xếp lại các bài chưa học theo tiên quyết'];
const STEP_MS = 900;
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ordered list that animates each item from its old position to its new one (FLIP) whenever `ids` changes order. */
function FlipList({ ids, render, className }) {
  const nodes = useRef(new Map());
  const tops = useRef(new Map());
  const key = ids.join('|');
  useLayoutEffect(() => {
    const still = reduceMotion();
    nodes.current.forEach((el, id) => {
      const top = el.offsetTop;
      const before = tops.current.get(id);
      tops.current.set(id, top);
      if (before == null || before === top || still) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${before - top}px)`;
      el.classList.add('is-moving');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'transform 900ms cubic-bezier(.2,.75,.2,1)';
        el.style.transform = '';
        setTimeout(() => el.classList.remove('is-moving'), 950);
      }));
    });
  }, [key]);
  return (
    <ol className={className}>
      {ids.map((id, i) => (
        <li key={id} ref={(el) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); }}>{render(id, i)}</li>
      ))}
    </ol>
  );
}

function Analysing({ title }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((n) => Math.min(n + 1, ANALYSE_STEPS.length - 1)), STEP_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="card pu-analyse" role="status" aria-live="polite"><div className="card-body stack-4">
      <div className="pu-orb" aria-hidden="true"><Icon name="sparkles" /></div>
      <div className="stack-1 pu-center"><h2 className="pu-h2">Codi đang xem lại lộ trình của bạn</h2>
        <p className="small muted">Sau bài “{title}”, Codi cập nhật mức thành thạo rồi sắp xếp lại các bài chưa học.</p></div>
      <ol className="pu-steps">
        {ANALYSE_STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-active' : ''}>
            <span className="pu-step-dot">{i < step ? <Icon name="check" className="icon-sm" /> : null}</span>{s}
          </li>
        ))}
      </ol>
      <div className="pu-ghosts" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} style={{ animationDelay: `${i * 140}ms` }} />)}</div>
    </div></section>
  );
}

export default function PathUpdatePage({ params, query }) {
  const courseId = params.courseId;
  const after = query.after || null;
  const [view, error, loading, setView, reload] = useCoursePath(courseId);
  const [side, setSide] = useState('before');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);


  const rows = useMemo(() => pathRows(view), [view]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const update = view && view.update && (!after || view.update.afterLessonId === after) ? view.update : null;
  const newIds = rows.map((r) => r.id);
  const oldIds = view && update && view.previous ? view.previous.map((p) => p.lessonId).filter((id) => byId.has(id)) : newIds;
  const oldSkip = new Set(view && view.previous ? view.previous.filter((p) => p.isSkippable).map((p) => p.lessonId) : []);
  const changed = update ? new Map(update.changes.map((c) => [c.lessonId, c])) : new Map();
  // Opened by the lesson player once the re-plan changed the path; the analysing view covers a direct visit mid-update.
  const ready = !!view && !view.updating && view.status === 'ready';
  const pathId = view && view.pathId;

  // Each new result first shows the previous order, then animates into the new one.
  useEffect(() => {
    if (!ready) return undefined;
    setSide('before');
    const t = setTimeout(() => setSide('after'), reduceMotion() ? 0 : 900);
    return () => clearTimeout(t);
  }, [ready, pathId]);

  if (!view) return <LoadState loading={loading} error={error} courseId={courseId} onRetry={reload} />;
  const done = after ? byId.get(after) : null;
  const doneTitle = done ? done.title : 'bài học';
  const next = view.currentLessonId ? byId.get(view.currentLessonId) : null;
  const goNext = () => Codi.go(next ? `/learn/${courseId}/${next.id}` : `/learn/${courseId}`);

  const accept = async () => {
    if (busy) return;
    setBusy('accept'); setActionError(null);
    try {
      if (view.pathId && update) await postPath(courseId, { type: 'dismiss-update', pathId: view.pathId });
      Codi.ui.toast('Đã áp dụng lộ trình mới.', { type: 'success' });
      goNext();
    } catch (e) { setActionError(errorText(e, 'Chưa thể lưu lựa chọn.')); setBusy(null); }
  };
  const keep = async () => {
    if (busy) return;
    setBusy('keep'); setActionError(null);
    try {
      setView(await postPath(courseId, { type: 'undo-adjust', pathId: view.pathId }));
      Codi.ui.toast('Đã giữ lộ trình trước đó.', { type: 'success' });
    } catch (e) { setActionError(errorText(e, 'Chưa thể giữ lộ trình cũ.')); }
    setBusy(null);
  };

  const ids = side === 'before' ? oldIds : newIds;
  const moves = new Map(newIds.map((id, i) => [id, oldIds.indexOf(id) - i]));
  const renderRow = (id, i) => {
    const r = byId.get(id);
    const showNew = side === 'after';
    const by = moves.get(id) || 0;
    const nowSkippable = showNew && r.skippable && !oldSkip.has(id);
    const change = showNew ? changed.get(id) : null;
    const isChanged = showNew && r.status !== 'done' && (by !== 0 || nowSkippable || !!change);
    const isNext = showNew && next && next.id === id;
    return (
      <div className={`pu-row ${r.status === 'done' ? 'is-done' : ''} ${isChanged ? 'is-changed' : ''} ${isNext ? 'is-next' : ''} ${after === id ? 'is-just' : ''}`.trim()}>
        <span className="pu-num" aria-hidden="true">{r.status === 'done' ? <Icon name="check" className="icon-sm" /> : i + 1}</span>
        <div className="pu-row-main">
          <span className="pu-row-title">{r.title}</span>
          <span className="xsmall muted">{r.chapterTitle}{r.chapterTitle ? ' · ' : ''}{TYPE_LABEL[r.kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(r.durationMin)}</span>
          {isChanged && r.reason && <span className="xsmall pu-reason"><Icon name="sparkles" className="icon-sm" />{r.reason}</span>}
        </div>
        <span className="pu-badges">
          {after === id && <span className="badge badge-success">Vừa hoàn thành</span>}
          {isNext && <span className="badge badge-accent">Học tiếp</span>}
          {showNew && r.status !== 'done' && by > 0 && <span className="badge pu-up"><Icon name="arrow-up" className="icon-sm" />Lên {by}</span>}
          {showNew && r.status !== 'done' && by < 0 && <span className="badge pu-down"><Icon name="arrow-down" className="icon-sm" />Lùi {-by}</span>}
          {nowSkippable && <span className="badge pu-skip"><Icon name="skip-forward" className="icon-sm" />Có thể bỏ qua</span>}
          {change && change.type === 'unlocked' && <span className="badge pu-unlock"><Icon name="unlock" className="icon-sm" />Đã mở khoá</span>}
        </span>
      </div>
    );
  };
  // Completed lessons never move: one summary line, then the just-finished lesson and everything still ahead.
  const shownIds = ids.filter((id) => id === after || byId.get(id).status !== 'done');
  const doneCount = newIds.length - newIds.filter((id) => id === after || byId.get(id).status !== 'done').length;
  const changeCount = newIds.filter((id) => byId.get(id).status !== 'done' && ((moves.get(id) || 0) !== 0 || (byId.get(id).skippable && !oldSkip.has(id)) || changed.has(id))).length;

  return (
    <div className="page page-narrow stack-4 pu-page">
      <nav className="small muted" aria-label="Đường dẫn"><Link to="/dashboard">Trang chủ</Link> / <Link to={`/learn/${courseId}`}>{view.course.title}</Link> / <span aria-current="page">Cập nhật lộ trình</span></nav>
      <header className="pu-hero">
        <span className="pu-check" aria-hidden="true"><Icon name="check" /></span>
        <div className="stack-1"><span className="xsmall muted">Đã hoàn thành</span><h1 className="pu-h1">{doneTitle}</h1>
          <span className="small muted">{view.done}/{view.total} bài · {view.percent}% khoá học</span></div>
      </header>

      {error && <Alert type="danger" body={errorText(error, 'Không thể tải lộ trình.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Thử lại</button>} />}
      {view.status === 'failed' && <Alert type="warn" title="Codi chưa cập nhật được lộ trình" body="Bạn vẫn học tiếp theo lộ trình hiện tại." />}

      {!ready && view.status !== 'failed' ? <Analysing title={doneTitle} /> : (
        <>
          {view.complete ? <CompletionCard view={view} onView={setView} /> : null}
          <section className={`card pu-result ${view.revertible ? 'has-change' : ''}`.trim()} aria-live="polite"><div className="card-body stack-4">
            <div className="row-between pu-result-head">
              <div className="stack-1">
                <strong className="pu-h2 row"><Icon name={view.revertible ? 'route' : 'check-circle'} />{view.revertible ? `Codi đề xuất lộ trình mới · ${changeCount} bài thay đổi` : 'Lộ trình của bạn vẫn phù hợp'}</strong>
                {update && update.message && <p className="small muted">{update.message}</p>}
              </div>
              {changeCount > 0 && (
                <div className="pu-toggle" role="group" aria-label="So sánh lộ trình">
                  <button type="button" className={side === 'before' ? 'is-on' : ''} aria-pressed={side === 'before'} onClick={() => setSide('before')}>Trước</button>
                  <button type="button" className={side === 'after' ? 'is-on' : ''} aria-pressed={side === 'after'} onClick={() => setSide('after')}>Sau</button>
                </div>
              )}
            </div>
            {doneCount > 0 && (
              <Link className="pu-done-summary" to={`/learn/${courseId}`}>
                <span className="pu-num"><Icon name="check" className="icon-sm" /></span>
                <span className="small"><strong>{doneCount} bài đã hoàn thành</strong> <span className="muted">· thứ tự các bài đã học không đổi</span></span>
              </Link>
            )}
            <FlipList className={`pu-list ${side === 'after' ? 'is-after' : ''}`} ids={shownIds} render={renderRow} />
            {actionError && <Alert type="danger" body={actionError} />}
            <div className="pu-actions">
              {view.revertible ? (
                <>
                  <button type="button" className="btn btn-primary btn-lg" onClick={accept} disabled={!!busy} aria-busy={busy === 'accept' || undefined}><Icon name="check" className="icon-sm" /> Dùng lộ trình mới</button>
                  <button type="button" className="btn btn-secondary btn-lg" onClick={keep} disabled={!!busy} aria-busy={busy === 'keep' || undefined}><Icon name="rotate-ccw" className="icon-sm" /> Giữ lộ trình cũ</button>
                </>
              ) : !view.complete ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={accept} disabled={!!busy}>Học tiếp{next ? `: ${next.title}` : ''} <Icon name="arrow-right" className="icon-sm" /></button>
              ) : null}
              <Link className="btn btn-ghost" to={`/learn/${courseId}`}>Xem bản đồ lộ trình</Link>
            </div>
            {view.revertible && <p className="xsmall muted">Giữ lộ trình cũ chỉ áp dụng cho lần đề xuất này; Codi sẽ đề xuất lại sau bài học tiếp theo.</p>}
          </div></section>
        </>
      )}
    </div>
  );
}
