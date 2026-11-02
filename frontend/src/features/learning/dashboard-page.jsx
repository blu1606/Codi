/**
 * S12 Learner dashboard ('/dashboard'). Focus row with the one "Học tiếp", the departure board, what changed, the
 * week's goal and courses. Data: GET /api/learner/overview, plus GET /api/learn/:courseId/path for each active course
 * with a path (departures, chapter lines and path updates).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Progress, SpinnerBlock, Thumb } from '../../components/ui/primitives';
import { errorText, goalLabel, learnBase, levelLabel, pathCourse, pathRows, publishOverview } from './learning-store';
import { DiagCard } from './learning-shared';
import { buildDepartures, DashBoard, DashFocus } from './dashboard-board';
import { DashChanges, DashGoal } from './dashboard-side';
import './dashboard-page.css';

const hasPath = (course) => course.pathStatus === 'ready' || course.pathStatus === 'failed';
const thumbOf = (course) => ({ id: course.id, title: course.title, coverImageUrl: course.cover });

/** Path views of the given courses (id → view); a course whose path fails to load is left out. */
function usePaths(ids) {
  const key = ids.join('|');
  const [paths, setPaths] = useState(null);
  useEffect(() => {
    if (!key) { setPaths({}); return undefined; }
    let live = true;
    setPaths(null);
    Promise.all(key.split('|').map((id) => api.get(`${learnBase(id)}/path`).then((v) => [id, v]).catch(() => null)))
      .then((pairs) => { if (live) setPaths(Object.fromEntries(pairs.filter(Boolean))); });
    return () => { live = false; };
  }, [key]);
  return paths;
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi('/api/learner/overview');
  useEffect(() => { if (data) publishOverview(data); }, [data]);
  const courses = data ? data.courses : [];
  const active = courses.filter((x) => !x.complete);
  const paths = usePaths(active.filter(hasPath).map((x) => x.id));

  const name = (data && data.name) || (Codi.currentUser() || {}).name || '';
  const head = (
    <div className="page-header"><div><h1>Bàn làm việc</h1><p className="muted">Chào mừng trở lại, {name}!</p></div>
      <div className="row"><Link className="btn btn-secondary" to="/progress"><Icon name="graduation-cap" className="icon-sm" /> Tiến độ & kết quả</Link><Link className="btn btn-ghost" to="/ai"><Icon name="sparkles" className="icon-sm" /> Hỏi AI Codi</Link></div></div>
  );
  if (error && !data) {
    return (
      <div className="page stack-6">{head}
        <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')}
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />
      </div>
    );
  }
  if (!data || paths === null) return <div className="page stack-6">{head}<SpinnerBlock text="Đang tải bàn làm việc…" /></div>;
  if (!courses.length) {
    return (
      <div className="page stack-6">{head}<div className="card">
        <Empty icon="book-open" title="Bàn làm việc của bạn đang trống" body="Chọn một khoá học để bắt đầu. Codi sẽ xếp lộ trình riêng cho bạn sau bài kiểm tra đầu vào."
          actions={<><Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link><Link className="btn btn-secondary" to="/ai"><Icon name="sparkles" /> Khám phá lộ trình cùng AI</Link></>} />
      </div></div>
    );
  }

  // Per course: the path rows (empty until a path exists) and the course shape the transit lines need.
  const info = (course) => {
    const view = paths[course.id];
    const rows = view ? pathRows(view) : [];
    return { course, view, rows, c: { ...pathCourse(view, rows), id: course.id, title: course.title, coverImageUrl: course.cover }, cur: view ? view.currentLessonId : null };
  };
  const cont = active.find((x) => x.id === data.continueCourseId) || active[0] || null;
  const leadId = cont ? cont.id : null;
  const ordered = cont ? [cont, ...active.filter((x) => x !== cont)] : [];
  const departures = buildDepartures(ordered.map(info), leadId);

  // Focus: the same current lesson the path page's "Học tiếp" opens.
  let focus = { complete: true };
  if (cont) {
    const { c, rows, cur } = info(cont);
    const row = rows.find((x) => x.id === cur) || null;
    focus = { c, goal: cont.goal, status: cont.pathStatus, row, number: row ? rows.indexOf(row) + 1 : 0, done: cont.done, total: cont.total, pct: cont.percent };
  }

  // What changed: lessons that moved on the path (path updates), graded work and answered questions.
  const pathChanges = active.flatMap((course) => {
    const view = paths[course.id];
    return view && view.update ? view.update.changes.map((ch) => ({ courseId: course.id, course: course.title, text: ch.text })) : [];
  });

  const w = data.weekly;
  const goalInfo = { minutes: w.goalMinutes, hasGoal: !w.assumed, courseId: w.assumed ? null : w.courseId };
  const goalPct = w.goalMinutes ? (w.minutes / w.goalMinutes) * 100 : 0;
  const badges = courses.flatMap((course) => (course.skills || []).filter((k) => k.level >= 3).map((k) => ({ ...k, course: course.title })));
  const diagCourse = cont && cont.showDiagnostic ? cont : null;

  return (
    <div className="page db-page stack-8">
      {head}
      {error && <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />}
      <DashFocus focus={focus} />
      <div className="db-grid">
        <DashBoard departures={departures} leadId={leadId} />
        <DashChanges pending={data.stats.pending} answered={data.stats.answered} pathChanges={pathChanges} latest={data.latestFeedback} />
      </div>
      <DashGoal minutesWeek={w.minutes} goalInfo={goalInfo} goalPct={goalPct} streak={w.streak} badges={badges} />
      {diagCourse && <DiagCard courseId={diagCourse.id} title={diagCourse.title} onChange={reload} />}
      <section className="db-courses-section" aria-labelledby="dash-mine">
        <div className="section-title"><h2 id="dash-mine" className="db-h2">Khoá học của tôi</h2><Link className="db-link" to="/courses">Tìm thêm khoá học</Link></div>
        <ul className="db-courses">{courses.map((course) => {
          const none = course.pathStatus === 'none';
          return (
            <li key={course.id} className="db-course">
              <Thumb course={thumbOf(course)} small />
              <div className="db-course-body">
                <Link className="db-course-title" to={`/learn/${course.id}`}>{course.title}</Link>
                {none ? <span className="db-course-meta">Chưa thiết lập lộ trình</span>
                  : <><Progress pct={course.percent} label={`Tiến độ khoá ${course.title}`} /><span className="db-course-meta"><span className="db-mono">{course.done}/{course.total}</span> bài · {course.complete ? 'Đã hoàn thành' : goalLabel(course.goal)}</span></>}
                {course.hidden && <span className="db-course-meta">Khoá học tạm ẩn — bạn vẫn có thể tiếp tục học.</span>}
              </div>
              <Link className="btn btn-secondary btn-sm" to={`/learn/${course.id}${none ? '/onboarding' : ''}`}>{none ? 'Bắt đầu' : course.complete ? 'Xem lại' : 'Mở lộ trình'}</Link>
            </li>
          );
        })}</ul>
      </section>
      {data.recommendations.length > 0 && (
        <section className="db-recs-section" aria-labelledby="dash-recs">
          <div className="section-title"><h2 id="dash-recs" className="db-h2">Gợi ý cho bạn</h2><Link className="db-link" to="/ai">Hỏi AI Codi</Link></div>
          <div className="db-recs">{data.recommendations.slice(0, 3).map((rc) => (
            <Link key={rc.id} className="db-rec" to={`/courses/${rc.slug}`}>
              <Thumb course={thumbOf(rc)} />
              <span className="db-rec-title">{rc.title}</span>
              <span className="db-rec-meta">{levelLabel(rc.level)}</span>
              <span className="price">{rc.price ? Codi.fmt.vnd(rc.price) : 'Miễn phí'}</span>
            </Link>
          ))}</div>
        </section>
      )}
    </div>
  );
}
