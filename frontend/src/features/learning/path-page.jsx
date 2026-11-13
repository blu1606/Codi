/**
 * S10 Personal path / course home ('/learn/:courseId'), port of real app/learn/[courseId]/course-home.tsx,
 * drawn as a transit network: title row with the one "Học tiếp", the navy diagram frame, the next departures and
 * line alerts beside it, and the full lesson table grouped by line below.
 * Data: POST /api/learn/:courseId/path {type:'sync'} on open (CoursePathView), polled while the path is generating.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Empty, Icon, Progress } from '../../components/ui/primitives';
import { Sheet } from '../../components/ui/overlay-host';
import { errorText, goalLabel, pathCourse, pathRows, postOnboarding, postPath } from './learning-store';
import { CompletionCard, DiagCard, LoadState, UpdateNotice, openReview } from './learning-shared';
import { Departures, LessonTable, LineAlerts, StepDetail, buildLines, kindLabel } from './path-views';
import { TransitFrame } from './path-transit';
import './path-transit.css';

// Map or lesson list, remembered per browser (a convenience; it falls back to the map).
const PATH_LAYOUT_KEY = 'codi-path-layout';
function readPathLayout() {
  try { return localStorage.getItem(PATH_LAYOUT_KEY) === 'list' ? 'list' : 'map'; } catch { return 'map'; }
}
function writePathLayout(v) {
  try { localStorage.setItem(PATH_LAYOUT_KEY, v); } catch { /* storage blocked: lasts for this visit */ }
}

/** Confirms, opens the goal editor on the backend (goal-edit) and goes to the onboarding. */
export async function editGoal(courseId) {
  const res = await Codi.ui.confirm({ title: 'Chỉnh mục tiêu học tập?', consequence: 'Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại mục tiêu bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu', cancelLabel: 'Để sau' });
  if (!res.ok) return;
  try {
    await postOnboarding(courseId, { type: 'goal-edit' });
  } catch (e) {
    // 409: the goal editor is already open (or no goal yet); the onboarding page shows the current step.
    if (!(e instanceof ApiError && e.status === 409)) { Codi.ui.toast(errorText(e, 'Không thể mở thiết lập.'), { type: 'danger' }); return; }
  }
  Codi.go('/learn/' + courseId + '/onboarding');
}

// Order of the path the learner last saw here (per browser), to report lessons that moved up since then.
const seenKey = (courseId) => `codi-path-seen:${Codi.state.currentUserId}:${courseId}`;
function readSeen(courseId) {
  try { const v = JSON.parse(localStorage.getItem(seenKey(courseId)) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; }
}
function writeSeen(courseId, order) {
  try { localStorage.setItem(seenKey(courseId), JSON.stringify(order)); } catch { /* storage blocked: alerts last for this visit */ }
}
function movedUp(prevOrder, order, doneIds) {
  return order.map((id, i) => ({ id, by: prevOrder.indexOf(id) - i }))
    .filter((m) => m.by > 0 && prevOrder.includes(m.id) && !doneIds.includes(m.id));
}

/** Loads the course path (sync on open), polls while generating/updating; returns [view, error, loading, setView, reload]. */
export function useCoursePath(courseId) {
  const [state, setState] = useState({ view: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    postPath(courseId, { type: 'sync' })
      .then((view) => { if (live) setState({ view, error: null, loading: false }); })
      .catch((error) => { if (live) setState((s) => ({ ...s, error, loading: false })); });
    return () => { live = false; };
  }, [courseId, tick]);
  const v = state.view;
  useEffect(() => {
    if (state.error || !v || (v.status !== 'generating' && !v.updating)) return undefined;
    const t = setTimeout(() => setTick((n) => n + 1), 2500);
    return () => clearTimeout(t);
  }, [v, state.error]);
  const setView = useCallback((view) => setState({ view, error: null, loading: false }), []);
  const reload = useCallback(() => { setState((s) => ({ ...s, loading: !s.view })); setTick((n) => n + 1); }, []);
  return [v, state.error, state.loading, setView, reload];
}

export default function PathPage({ params }) {
  const courseId = params.courseId;
  const [view, error, loading, setView, reload] = useCoursePath(courseId);
  const [shown, setShown] = useState([]);
  const [moves, setMoves] = useState([]);
  const [picked, setPicked] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [layout, setLayoutState] = useState(readPathLayout);
  const setLayout = (v) => { setLayoutState(v); writePathLayout(v); };
  const acked = useRef(null);

  // Highlights show once (real ack-highlights): kept for this visit, acknowledged on the server.
  useEffect(() => {
    if (!view || !view.pathId || !view.highlights.length || acked.current === view.pathId) return;
    acked.current = view.pathId;
    setShown(view.highlights.slice());
    postPath(courseId, { type: 'ack-highlights', pathId: view.pathId }).catch(() => { acked.current = null; });
  }, [view, courseId]);
  // Line alerts for reordered lessons: compare with the order last seen, keep them for this visit, mark seen.
  const orderKey = view && (view.status === 'ready' || view.status === 'failed') ? view.rows.map((r) => r.lessonId).join('|') : '';
  useEffect(() => {
    if (!orderKey) return;
    const order = orderKey.split('|');
    const seen = readSeen(courseId);
    if (seen && seen.join('|') === orderKey) return;
    if (seen) {
      const done = view.rows.filter((r) => r.status === 'done').map((r) => r.lessonId);
      const found = movedUp(seen, order, done);
      if (found.length) setMoves((prev) => prev.filter((m) => !found.some((f) => f.id === m.id)).concat(found));
    }
    writeSeen(courseId, order);
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return <LoadState loading={loading} error={error} courseId={courseId} onRetry={reload} />;
  const title = view.course.title;

  if (view.status === 'none') {
    // Lessons stay locked until a path is set, but the outline and progress are still shown so the page is never empty.
    const outline = pathRows(view);
    const studied = outline.filter((r) => r.status === 'done').length;
    return (
      <div className="page page-narrow stack-4">
        <h1>{title}</h1>
        <div className="card"><div className="card-body stack-3">
          <h2 className="pt-h2">Hãy thiết lập lộ trình học của bạn</h2>
          <p className="muted">Đặt mục tiêu và làm bài kiểm tra đầu vào để Codi xếp thứ tự học riêng cho bạn. {studied > 0 ? `Bạn đã học ${studied}/${outline.length} bài, tiến độ này vẫn được giữ.` : ''}</p>
          <div><Link className="btn btn-primary" to={`/learn/${courseId}/onboarding`}>{studied > 0 ? 'Thiết lập lộ trình' : 'Bắt đầu thiết lập'}</Link></div>
        </div></div>
        {outline.length > 0 && (
          <section className="stack-2" aria-labelledby="pt-outline-h">
            <h2 id="pt-outline-h" className="pt-h2">Các bài trong khoá</h2>
            <ol className="pt-outline">
              {outline.map((r) => (
                <li key={r.id}>
                  <span className="stack-1"><span className="small muted">{r.chapterTitle}</span><span className="strong">{r.title}</span></span>
                  {r.status === 'done' ? <span className="small strong">Đã học</span> : <span className="small muted">{Math.round(r.durationMin || 0)} phút</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    );
  }
  if (view.status === 'generating') {
    return (
      <div className="page page-narrow stack-4"><h1>{title}</h1>
        <div className="card"><div className="card-body stack-4" role="status" aria-live="polite">
          <p className="row strong"><Icon name="loader" className="pt-spin" /> Codi đang xếp lộ trình cho bạn…</p>
          <ol className="pt-gen-steps"><li>Phân tích kết quả bài kiểm tra đầu vào</li><li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li><li>Ước lượng thời gian theo mục tiêu của bạn</li></ol>
          <p className="small muted">Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.</p>
        </div></div></div>
    );
  }
  const highlight = view.highlights.length ? view.highlights : shown;
  const rows = pathRows(view);
  const c = pathCourse(view, rows);
  const lines = rows.length ? buildLines(c, rows) : [];
  const cur = view.currentLessonId;
  const complete = view.complete;
  // Lessons marked "có thể bỏ qua" are not required for the certificate.
  const requiredLeft = rows.filter((x) => !x.skippable && x.status !== 'done').length;
  const curRow = cur ? rows.find((x) => x.id === cur) : null;
  const r = { pathSource: view.source };
  const retry = async () => {
    setRetrying(true);
    try { setView(await postPath(courseId, { type: 'retry' })); }
    catch (e) { Codi.ui.toast(errorText(e, 'Không thể lưu thay đổi.'), { type: 'danger' }); }
    finally { setRetrying(false); }
  };
  // Moves reported by the last path update when the earlier order was not seen here (e.g. first visit).
  const updateMoves = view.update ? view.update.changes.filter((ch) => ch.type === 'moved-up' && ch.lessonId && highlight.includes(ch.lessonId)) : [];
  const allMoves = moves.concat(updateMoves.filter((ch) => !moves.some((m) => m.id === ch.lessonId)).map((ch) => ({ id: ch.lessonId, by: null })));
  const pickedRow = picked ? rows.find((x) => x.id === picked) : null;
  const review = () => openReview({ courseId, title, review: view.review, onSaved: setView });

  return (
    <div className="page pt-page">
      <div className="row-between pt-crumbs">
        <nav className="small muted" aria-label="Đường dẫn"><Link to="/dashboard">Trang chủ</Link> / <span aria-current="page">{title}</span></nav>
        <button type="button" className="btn btn-secondary btn-sm" onClick={review}><Icon name="star" className="icon-sm" /> {view.review ? 'Sửa đánh giá' : 'Đánh giá khoá học'}</button>
      </div>

      <header className="pt-title">
        <div className="pt-title-main">
          <h1 className="pt-h1">{title}</h1>
          <p className="pt-goal">Mục tiêu: <strong>{goalLabel(view.goal)}</strong>{view.hours ? <> · <span className="pt-mono">{view.hours}</span> giờ/tuần</> : ''}
            <button type="button" className="btn-link pt-goal-edit" onClick={() => editGoal(courseId)}>Chỉnh mục tiêu</button></p>
          <div className="pt-progress">
            <p className="pt-progress-text"><span className="pt-progress-num pt-mono">{view.done}/{view.total}</span> bài đã học <span className="muted">· <span className="pt-mono">{view.percent}%</span></span></p>
            <Progress pct={view.percent} label="Tiến độ khoá học" />
            {!complete && requiredLeft > 0 && (
              <p className="small muted row pt-cert-hint"><Icon name="graduation-cap" className="icon-sm" /> Hoàn thành thêm <span className="pt-mono">{requiredLeft}</span> bài bắt buộc để nhận chứng chỉ.</p>
            )}
          </div>
        </div>
        {curRow && !complete && (
          <div className="pt-go">
            <Link className="btn btn-primary btn-lg pt-go-btn" to={`/learn/${courseId}/${curRow.id}`}>Học tiếp<Icon name="arrow-right" /><span className="sr-only">: {curRow.title}</span></Link>
            <p className="pt-go-next"><span className="muted">Bài <span className="pt-mono">{rows.indexOf(curRow) + 1}</span> · {kindLabel(curRow)}</span><span className="pt-go-title">{curRow.title}</span></p>
          </div>
        )}
      </header>

      <div className="pt-notices">
        {error && <Alert type="danger" title="Không thể cập nhật lộ trình" body={errorText(error, 'Không thể tải lộ trình.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Thử lại</button>} />}
        {view.status === 'failed' && (
          <Alert type="warn" title="Lộ trình cá nhân hoá chưa sẵn sàng" body="AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc định của khoá học."
            actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying || undefined}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
        )}
        {view.updating && <Alert type="info" body="Codi đang cập nhật lộ trình. Bạn có thể tiếp tục học hoặc quay lại kiểm tra sau." />}
        {view.showDiagnosticCard && <DiagCard courseId={courseId} title={title} onChange={reload} />}
        <UpdateNotice courseId={courseId} view={view} rows={rows} inPlayer={false} onView={setView} />
        {complete && <CompletionCard view={view} onView={setView} />}
      </div>

      {rows.length ? (
        <>
          {/* One view of the path at a time: the map or the lesson list; the side panels stay beside either. */}
          <div className="pt-view-switch">
            <div className="segmented" role="group" aria-label="Cách xem lộ trình">
              <button type="button" aria-pressed={layout === 'map'} onClick={() => setLayout('map')}><Icon name="map" className="icon-sm" /> Sơ đồ</button>
              <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><Icon name="list" className="icon-sm" /> Danh sách bài</button>
            </div>
          </div>
          <div className="pt-grid">
            {layout === 'map'
              ? <TransitFrame lines={lines} rows={rows} currentId={cur} onOpen={setPicked} />
              : <LessonTable c={c} r={r} lines={lines} rows={rows} currentId={cur} highlight={highlight} onOpen={setPicked} />}
            <div className="pt-side">
              <Departures c={c} r={r} rows={rows} lines={lines} currentId={cur} onOpen={setPicked} />
              <LineAlerts c={c} rows={rows} lines={lines} moves={allMoves} onSeen={() => setMoves([])} onOpen={setPicked} />
            </div>
          </div>
        </>
      ) : <div className="card"><Empty icon="book-open" title="Khoá học chưa có bài học được xuất bản." /></div>}

      <Sheet open={!!pickedRow} onClose={() => setPicked(null)} title="Chi tiết bài học">
        {pickedRow && <StepDetail c={c} row={pickedRow} number={rows.indexOf(pickedRow) + 1} isCurrent={pickedRow.id === cur && pickedRow.status !== 'done'} />}
      </Sheet>
    </div>
  );
}
