/** S12 Learner dashboard ('/dashboard'). Focus row with the one "Học tiếp", the departure board, what changed, the week's goal and courses. */
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Progress, Thumb } from '../../components/ui/primitives';
import { currentLessonId, enrolledCoursesOf, isCourseComplete, goalLabel, rec } from './learning-store';
import { DiagCard, showDiagCard } from './learning-shared';
import { roundMinutes, secondsByDate, streakDays, today, weekDates } from './study-time';
import { useSyncError } from './use-sync-error';
import { buildDepartures, courseRows, DashBoard, DashFocus } from './dashboard-board';
import { DashChanges, DashGoal } from './dashboard-side';
import './dashboard-page.css';

export default function DashboardPage() {
  useCodi();
  const [syncError, retrySync, retrying] = useSyncError();
  const u = Codi.currentUser();
  const enrolled = enrolledCoursesOf(u.id);
  const subs = Codi.db().submissions.filter((s) => s.userId === u.id);
  const pendingSubs = subs.filter((s) => s.status === 'pending');
  const graded = subs.filter((s) => s.status === 'graded').sort((a, b) => (a.gradedAt < b.gradedAt ? 1 : -1));
  const answered = Codi.db().questions.filter((q) => q.userId === u.id && q.status === 'answered');
  const items = enrolled.map((c) => ({ c, p: Codi.courseProgress(c.id), r: rec(c.id) }));
  // "Active" follows the path page: a course is done when its required lessons are, skippable ones aside.
  const active = items.filter((x) => !isCourseComplete(x.c, x.r));
  const cont = active.slice().sort((a, b) => String(b.r.lastActive || '').localeCompare(String(a.r.lastActive || '')))[0];
  const leadId = cont ? cont.c.id : null;
  const departures = buildDepartures(cont ? [cont, ...active.filter((x) => x !== cont)] : [], leadId);
  const errorAlert = syncError && (
    <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body="Không thể tải dữ liệu học tập. Vui lòng thử lại."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retrySync} disabled={retrying} aria-busy={retrying || undefined}>Thử lại</button>} />
  );

  const head = (
    <div className="page-header"><div><h1>Bàn làm việc</h1><p className="muted">Chào mừng trở lại, {u.name}!</p></div>
      <div className="row"><Link className="btn btn-secondary" to="/progress"><Icon name="graduation-cap" className="icon-sm" /> Tiến độ & kết quả</Link><Link className="btn btn-ghost" to="/ai"><Icon name="sparkles" className="icon-sm" /> Hỏi AI Codi</Link></div></div>
  );
  if (!enrolled.length) {
    return (
      <div className="page stack-6">{head}{errorAlert}<div className="card">
        <Empty icon="book-open" title="Bàn làm việc của bạn đang trống" body="Chọn một khoá học để bắt đầu. Codi sẽ xếp lộ trình riêng cho bạn sau bài kiểm tra đầu vào."
          actions={<><Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link><Link className="btn btn-secondary" to="/ai"><Icon name="sparkles" /> Khám phá lộ trình cùng AI</Link></>} />
      </div></div>
    );
  }

  // Focus: the same current lesson the path page's "Học tiếp" opens (currentLessonId, path order, skippable-aware).
  let focus = { complete: true };
  if (cont) {
    const { c, p, r } = cont;
    const rows = courseRows(c, r);
    const row = rows.find((x) => x.id === currentLessonId(c, r)) || null;
    focus = { c, r, status: r.pathStatus, row, number: row ? rows.indexOf(row) + 1 : 0, done: p.done, total: p.total, pct: p.pct };
  }

  // What changed: lessons that moved on the path (r.lastUpdate), graded work and answered questions.
  const pathChanges = items.flatMap(({ c, r }) => (r.lastUpdate ? r.lastUpdate.changes.map((ch) => ({ courseId: c.id, course: c.title, text: ch.text })) : []));
  const latest = graded[0];
  const latestLesson = latest ? Codi.lesson(Codi.course(latest.courseId), latest.lessonId) : null;

  const goalInfo = weeklyGoalInfo(u.id);
  const minutesWeek = minutesThisWeek(u.id);
  const goalPct = (minutesWeek / (goalInfo.hours * 60)) * 100;
  const streak = streakDays(u.id);
  const badges = skillBadges(u.id);

  const recs = Codi.db().courses.filter((c) => c.status === 'published' && Codi.ownership(c.id) !== 'owned').slice(0, 3);

  return (
    <div className="page db-page stack-8">
      {head}
      {errorAlert}
      <DashFocus focus={focus} />
      <div className="db-grid">
        <DashBoard departures={departures} leadId={leadId} />
        <DashChanges pending={pendingSubs.length} answered={answered.length} pathChanges={pathChanges} latest={latest} latestLesson={latestLesson} />
      </div>
      <DashGoal minutesWeek={minutesWeek} goalInfo={goalInfo} goalPct={goalPct} streak={streak} badges={badges} />
      {cont && showDiagCard(cont.r) && <DiagCard c={cont.c} />}
      <section className="db-courses-section" aria-labelledby="dash-mine">
        <div className="section-title"><h2 id="dash-mine" className="db-h2">Khoá học của tôi</h2><Link className="db-link" to="/courses">Tìm thêm khoá học</Link></div>
        <ul className="db-courses">{items.map(({ c, p, r }) => (
          <li key={c.id} className="db-course">
            <Thumb course={c} small />
            <div className="db-course-body">
              <Link className="db-course-title" to={`/learn/${c.id}`}>{c.title}</Link>
              {r.pathStatus === 'none' ? <span className="db-course-meta">Chưa thiết lập lộ trình</span>
                : <><Progress pct={p.pct} label={`Tiến độ khoá ${c.title}`} /><span className="db-course-meta"><span className="db-mono">{p.done}/{p.total}</span> bài · {p.completed ? 'Đã hoàn thành' : goalLabel(r.goal)}</span></>}
              {c.status === 'hidden' && <span className="db-course-meta">Khoá học tạm ẩn — bạn vẫn có thể tiếp tục học.</span>}
            </div>
            <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}${r.pathStatus === 'none' ? '/onboarding' : ''}`}>{r.pathStatus === 'none' ? 'Bắt đầu' : p.completed ? 'Xem lại' : 'Mở lộ trình'}</Link>
          </li>
        ))}</ul>
      </section>
      {recs.length > 0 && (
        <section className="db-recs-section" aria-labelledby="dash-recs">
          <div className="section-title"><h2 id="dash-recs" className="db-h2">Gợi ý cho bạn</h2><Link className="db-link" to="/ai">Hỏi AI Codi</Link></div>
          <div className="db-recs">{recs.map((c) => (
            <Link key={c.id} className="db-rec" to={`/courses/${c.slug}`}>
              <Thumb course={c} />
              <span className="db-rec-title">{c.title}</span>
              <span className="db-rec-meta">{Codi.levelLabel(c.level)} · {Codi.lessons(c).length} bài</span>
              <span className="price">{c.price ? Codi.fmt.vnd(c.price) : 'Miễn phí'}</span>
            </Link>
          ))}</div>
        </section>
      )}
    </div>
  );
}

// Weekly goal (real learner-overview): the first enrolled course with a goal; otherwise 5 h/week, labelled "Mặc định".
function weeklyGoalInfo(userId) {
  for (const c of enrolledCoursesOf(userId)) {
    const r = rec(c.id);
    if (r && r.goal && r.goal.hours) return { hours: r.goal.hours, hasGoal: true, courseId: c.id };
  }
  return { hours: 5, hasGoal: false, courseId: null };
}
// Concepts at mastery level 3 or above, across enrolled courses.
function skillBadges(userId) {
  const skills = [];
  enrolledCoursesOf(userId).forEach((c) => {
    const r = rec(c.id);
    (c.concepts || []).forEach((k) => { const lv = (r && r.mastery[k.id]) || 0; if (lv >= 3) skills.push({ ...k, level: lv, course: c.title }); });
  });
  return skills;
}
// Minutes studied in this Vietnam calendar week (Monday to Sunday, GMT+7).
function minutesThisWeek(userId) {
  const byDate = secondsByDate(userId);
  return roundMinutes(weekDates(today()).reduce((s, d) => s + (byDate.get(d) || 0), 0));
}
