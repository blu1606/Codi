/**
 * S10 Personal path / course home ('/learn/:courseId'), port of real app/learn/[courseId]/course-home.tsx,
 * drawn as a transit network: title row with the one "Học tiếp", the navy diagram frame, the next departures and
 * line alerts beside it, and the full lesson table grouped by line below.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Progress } from '../../components/ui/primitives';
import { Sheet } from '../../components/ui/overlay-host';
import { currentLessonId, genPending, generatePath, goalLabel, isCourseComplete, orderOf, rec, save, uid } from './learning-store';
import { CompletionCard, DiagCard, OfferCard, UpdateNotice, courseGuard, openReview, showDiagCard } from './learning-shared';
import { Departures, LessonTable, LineAlerts, StepDetail, buildLines, kindLabel, pathRows } from './path-views';
import { TransitFrame } from './path-transit';
import './path-transit.css';

export async function editGoal(courseId) {
  const res = await Codi.ui.confirm({ title: 'Chỉnh mục tiêu học tập?', consequence: 'Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại mục tiêu bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu', cancelLabel: 'Để sau' });
  if (!res.ok) return;
  const r = rec(courseId);
  if (!r.goalEditing) { r.goalEditing = true; r.goalStep = 0; r.goalDraft = { ...r.goal }; }
  save(false); Codi.go('/learn/' + courseId + '/onboarding');
}

/**
 * Lessons that moved up since this learner last saw the path. The order last seen is kept in the learning slice
 * (record.pathSeen = { order, at }); a change is reported once, on the visit that first sees it.
 */
function movedUp(prevOrder, order, completed) {
  return order.map((id, i) => ({ id, by: prevOrder.indexOf(id) - i }))
    .filter((m) => m.by > 0 && prevOrder.includes(m.id) && !completed.includes(m.id));
}

export default function PathPage({ params }) {
  useCodi();
  const c = Codi.course(params.courseId);
  const enrolled = !!c && Codi.isEnrolled(c.id);
  const r = enrolled ? rec(c.id) : null;
  const status = r ? r.pathStatus : null;
  const pathShown = status === 'ready' || status === 'failed';
  const orderKey = r && pathShown ? orderOf(c, r).join('|') : '';
  const [shown, setShown] = useState([]);
  const [moves, setMoves] = useState([]);
  const [picked, setPicked] = useState(null);

  // Resume a generation interrupted by a reload (the timer lives in this tab only).
  useEffect(() => {
    if (c && status === 'generating' && !genPending.has(c.id)) generatePath(c.id);
  }, [c, status]);
  // Highlights show once (real ack-highlights): kept for this visit, cleared from the record.
  useEffect(() => {
    if (r && r.highlight.length) { setShown(r.highlight.slice()); r.highlight = []; save(false); }
  });
  // Line alerts for reordered lessons: compare with the order last seen, keep them for this visit, mark seen.
  useEffect(() => {
    if (!r || !orderKey) return;
    const order = orderKey.split('|');
    const seen = r.pathSeen && Array.isArray(r.pathSeen.order) ? r.pathSeen.order : null;
    if (seen && seen.join('|') === orderKey) return;
    if (seen) {
      const found = movedUp(seen, order, r.completed);
      if (found.length) setMoves((prev) => prev.filter((m) => !found.some((f) => f.id === m.id)).concat(found));
    }
    r.pathSeen = { order, at: new Date().toISOString() };
    save(false);
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlight = r && r.highlight.length ? r.highlight.slice() : shown;


  const guard = courseGuard(c);
  if (guard) return guard;

  if (r.pathStatus === 'none') {
    return (
      <div className="page page-narrow stack-4"><h1>{c.title}</h1><div className="card">
        <Empty icon="route" title="Hãy thiết lập lộ trình học của bạn" body="Đặt mục tiêu và chọn học từ bài 1 hoặc tìm điểm bắt đầu phù hợp với bạn." actions={<Link className="btn btn-primary" to={`/learn/${c.id}/onboarding`}>Bắt đầu thiết lập</Link>} />
      </div></div>
    );
  }
  if (r.pathStatus === 'generating') {
    return (
      <div className="page page-narrow stack-4"><h1>{c.title}</h1>
        <div className="card"><div className="card-body stack-4" role="status" aria-live="polite">
          <p className="row strong"><Icon name="loader" className="pt-spin" /> Codi đang xếp lộ trình cho bạn…</p>
          <ol className="pt-gen-steps"><li>Phân tích kết quả bài kiểm tra đầu vào</li><li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li><li>Ước lượng thời gian theo mục tiêu của bạn</li></ol>
          <p className="small muted">Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.</p>
        </div></div></div>
    );
  }
  // The record is mutated in place by the store, so rows are derived on every render (never memoised on r).
  const rows = pathRows(c, { ...r, highlight });
  const lines = rows.length ? buildLines(c, rows) : [];
  const cur = currentLessonId(c, r);
  const prog = Codi.courseProgress(c.id);
  const complete = isCourseComplete(c, r);
  const curRow = cur ? rows.find((x) => x.id === cur) : null;
  const reviewed = Codi.db().reviews.some((x) => x.courseId === c.id && x.userId === uid());
  const retry = () => { generatePath(c.id); save(); };
  // Moves reported by the last path update when the earlier order was not seen here (e.g. first visit).
  const updateMoves = r.lastUpdate ? r.lastUpdate.changes.filter((ch) => ch.type === 'moved-up' && ch.lessonId && highlight.includes(ch.lessonId)) : [];
  const allMoves = moves.concat(updateMoves.filter((ch) => !moves.some((m) => m.id === ch.lessonId)).map((ch) => ({ id: ch.lessonId, by: null })));
  const pickedRow = picked ? rows.find((x) => x.id === picked) : null;

  return (
    <div className="page pt-page">
      <div className="row-between pt-crumbs">
        <nav className="small muted" aria-label="Đường dẫn"><Link to="/dashboard">Bàn làm việc</Link> / <span aria-current="page">{c.title}</span></nav>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview(c.id, 0)}><Icon name="star" className="icon-sm" /> {reviewed ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button>
      </div>

      <header className="pt-title">
        <div className="pt-title-main">
          <h1 className="pt-h1">{c.title}</h1>
          <p className="pt-goal">Mục tiêu: <strong>{goalLabel(r.goal)}</strong>{r.goal && r.goal.hours ? <> · <span className="pt-mono">{r.goal.hours}</span> giờ/tuần</> : ''}
            <button type="button" className="btn-link pt-goal-edit" onClick={() => editGoal(c.id)}>Chỉnh mục tiêu</button></p>
          <div className="pt-progress">
            <p className="pt-progress-text"><span className="pt-progress-num pt-mono">{prog.done}/{prog.total}</span> bài đã học <span className="muted">· <span className="pt-mono">{prog.pct}%</span></span></p>
            <Progress pct={prog.pct} label="Tiến độ khoá học" />
          </div>
        </div>
        {curRow && !complete && (
          <div className="pt-go">
            <Link className="btn btn-primary btn-lg pt-go-btn" to={`/learn/${c.id}/${curRow.id}`}>Học tiếp<Icon name="arrow-right" /><span className="sr-only">: {curRow.title}</span></Link>
            <p className="pt-go-next"><span className="muted">Bài <span className="pt-mono">{rows.indexOf(curRow) + 1}</span> · {kindLabel(curRow)}</span><span className="pt-go-title">{curRow.title}</span></p>
          </div>
        )}
      </header>

      <div className="pt-notices">
        {r.pathStatus === 'failed' && (
          <Alert type="warn" title="Lộ trình cá nhân hoá chưa sẵn sàng" body="AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc định của khoá học."
            actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
        )}
        {showDiagCard(r) && <DiagCard c={c} />}
        <UpdateNotice c={c} r={r} inPlayer={false} />
        <OfferCard c={c} r={r} />
        {complete && <CompletionCard c={c} />}
      </div>

      {rows.length ? (
        <>
          <div className="pt-grid">
            <TransitFrame lines={lines} rows={rows} currentId={cur} onOpen={setPicked} />
            <div className="pt-side">
              <Departures c={c} r={r} rows={rows} lines={lines} currentId={cur} onOpen={setPicked} />
              <LineAlerts c={c} rows={rows} lines={lines} moves={allMoves} onSeen={() => setMoves([])} onOpen={setPicked} />
            </div>
          </div>
          <LessonTable c={c} r={r} lines={lines} rows={rows} currentId={cur} highlight={highlight} onOpen={setPicked} />
        </>
      ) : <div className="card"><Empty icon="book-open" title="Khoá học chưa có bài học được xuất bản." /></div>}

      <Sheet open={!!pickedRow} onClose={() => setPicked(null)} title="Chi tiết bài học">
        {pickedRow && <StepDetail c={c} row={pickedRow} number={rows.indexOf(pickedRow) + 1} isCurrent={pickedRow.id === cur && pickedRow.status !== 'done'} />}
      </Sheet>
    </div>
  );
}
