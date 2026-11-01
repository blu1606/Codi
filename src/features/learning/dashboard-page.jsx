/** S12 Learner dashboard ('/dashboard'). */
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Mastery, Progress, Thumb } from '../../components/ui/primitives';
import { enrolledCoursesOf, goalLabel, rec, scoreText } from './learning-store';
import { DiagCard, showDiagCard } from './learning-shared';
import { editGoal } from './path-page';
import { roundMinutes, secondsByDate, streakDays, today, weekDates } from './study-time';
import { useSyncError } from './use-sync-error';

// Weekly goal (real learner-overview): the first enrolled course with a goal; otherwise 5 h/week, labelled "Giả định".
const weeklyGoalInfo = (userId) => {
  for (const c of enrolledCoursesOf(userId)) {
    const r = rec(c.id);
    if (r && r.goal && r.goal.hours) return { hours: r.goal.hours, hasGoal: true, courseId: c.id };
  }
  return { hours: 5, hasGoal: false, courseId: null };
};
// Minutes studied in this Vietnam calendar week (Monday to Sunday, GMT+7).
const minutesThisWeek = (userId) => {
  const byDate = secondsByDate(userId);
  return roundMinutes(weekDates(today()).reduce((s, d) => s + (byDate.get(d) || 0), 0));
};
const skillBadges = (userId) => {
  const skills = [];
  enrolledCoursesOf(userId).forEach((c) => {
    const r = rec(c.id);
    (c.concepts || []).forEach((k) => { const lv = (r && r.mastery[k.id]) || 0; if (lv >= 3) skills.push({ ...k, level: lv, course: c.title }); });
  });
  return skills;
};

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
  const active = items.filter((x) => !x.p.completed);
  const cont = active.slice().sort((a, b) => String(b.r.lastActive || '').localeCompare(String(a.r.lastActive || '')))[0];
  const doneLessons = items.reduce((s, x) => s + x.p.done, 0);
  const goalInfo = weeklyGoalInfo(u.id);
  const streak = streakDays(u.id);
  const errorAlert = syncError && (
    <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body="Không thể tải dữ liệu học tập. Vui lòng thử lại."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retrySync} disabled={retrying} aria-busy={retrying || undefined}>Thử lại</button>} />
  );
  const minutesWeek = minutesThisWeek(u.id);
  const badges = skillBadges(u.id);

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

  // Hero: the single "continue learning" focus (large course media + progress + one primary CTA).
  let contCard = null;
  if (cont) {
    const c = cont.c; const needsSetup = cont.r.pathStatus === 'none'; const ps = cont.r.pathStatus;
    const lesson = cont.p.currentLessonId ? Codi.lesson(c, cont.p.currentLessonId) : null;
    contCard = (
      <section className="stack-3" aria-labelledby="dash-cont"><h2 id="dash-cont" className="dash-h">Tiếp tục học</h2><div className="dash-hero">
        <div className="dash-hero-media"><Thumb course={c} /></div>
        <div className="dash-hero-body">
          <h3 className="dash-hero-title">{c.title}</h3>
          <p className="dash-hero-next">{needsSetup ? 'Bước tiếp theo: đặt mục tiêu và làm bài kiểm tra đầu vào' : ps === 'generating' ? 'Codi đang chuẩn bị lộ trình của bạn.' : ps === 'failed' ? 'Lộ trình cần được kiểm tra lại. Bạn có thể mở lộ trình để thử lại.' : lesson ? <>Bài hiện tại: <strong>{lesson.title}</strong></> : 'Bạn đã học hết các bài khả dụng'}</p>
          {!needsSetup && <div className="dash-hero-progress"><Progress pct={cont.p.pct} /><span className="od-nowrap">{cont.p.done}/{cont.p.total} bài · {cont.p.pct}%</span></div>}
          <div className="row"><Link className="btn btn-primary btn-lg" to={`/learn/${c.id}${needsSetup ? '/onboarding' : lesson && ps !== 'generating' ? '/' + lesson.id : ''}`}>{needsSetup ? 'Bắt đầu thiết lập' : lesson && ps !== 'generating' ? 'Học tiếp' : 'Mở lộ trình'}</Link>
            {!needsSetup && <Link className="btn btn-ghost" to={`/learn/${c.id}`}>Xem lộ trình</Link>}</div>
        </div>
      </div></section>
    );
  }
  // Side column: what needs attention (grading, latest lecturer feedback, answered questions).
  const latest = graded[0];
  const latestLesson = latest ? Codi.lesson(Codi.course(latest.courseId), latest.lessonId) : null;
  const aside = (
    <aside className="dash-aside" aria-label="Cập nhật từ giảng viên">
      <h2 className="dash-h">Cập nhật cho bạn</h2>
      <ul className="dash-updates">
        <li><Link to="/progress"><span className="dash-update-value">{pendingSubs.length}</span><span className="dash-update-label">Bài tập đang chờ chấm</span></Link></li>
        <li><Link to="/progress"><span className="dash-update-value">{answered.length}</span><span className="dash-update-label">Câu hỏi đã được trả lời</span></Link></li>
        <li><Link to="/progress"><span className="dash-update-value">{doneLessons}</span><span className="dash-update-label">Bài học đã hoàn thành</span></Link></li>
      </ul>
      {!latest && <p className="small muted">Nhận xét của giảng viên sẽ xuất hiện ở đây sau khi bài tập được chấm.</p>}
      {latest && (
        <div className="dash-feedback">
          <h3 className="small strong text-accent">Nhận xét mới nhất</h3>
          <p className="dash-feedback-lesson">{(latestLesson || {}).title} · <span className="od-nowrap">{scoreText(latest.score)}/{latest.maxScore}</span></p>
          <p className="dash-feedback-text od-clamp-3">{latest.feedback}</p>
          <Link className="dash-link" to="/progress">Xem tất cả nhận xét</Link>
        </div>
      )}
    </aside>
  );
  // Recommendations: published courses the learner does not own yet.
  const recs = Codi.db().courses.filter((c) => c.status === 'published' && Codi.ownership(c.id) !== 'owned').slice(0, 3);
  const goalPct = (minutesWeek / (goalInfo.hours * 60)) * 100;
  return (
    <div className="page stack-8">
      {head}
      {errorAlert}
      <div className="dash-grid">
        <div className="dash-main stack-8">
          {contCard}
          <section className="card" aria-labelledby="dash-goal"><div className="card-body stack-4">
            <h2 id="dash-goal" className="dash-h">Mục tiêu & tiến độ</h2>
            <div className="stack-2"><div className="row-between"><strong className="small">Mục tiêu hàng tuần</strong>
              <div className="row" style={{ gap: 8 }}>{!goalInfo.hasGoal && <span className="badge badge-neutral">Giả định</span>}{goalInfo.courseId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => editGoal(goalInfo.courseId)}>Chỉnh mục tiêu</button>}</div></div>
              <Progress pct={Math.min(100, goalPct)} label="Mục tiêu học tuần này" />
              <span className="small muted">{minutesWeek} phút / {goalInfo.hours * 60} phút · {Math.round(goalPct)}% tuần này</span></div>
            {streak > 0 && <div className="streak"><span className="streak-number">{streak}</span><span className="streak-label">ngày liên tiếp</span></div>}
            {badges.length > 0 && (
              <div className="stack-2"><strong className="small">Kỹ năng thành thạo</strong>
                <ul className="badge-list ln-skill-list">{badges.slice(0, 5).map((b) => <li key={b.course + b.id}><Link className="ln-skill" to="/progress" title={`${b.name} · ${b.course}`}><span>{b.name}</span><Mastery level={b.level} /></Link></li>)}</ul>
                {badges.length > 5 && <span className="small muted">+{badges.length - 5} kỹ năng khác</span>}</div>
            )}
          </div></section>
          {cont && showDiagCard(cont.r) && <DiagCard c={cont.c} />}
          {Codi.github && typeof Codi.github.learnerCard === 'function' ? Codi.github.learnerCard() : null}
          <section aria-labelledby="dash-mine">
            <div className="section-title"><h2 id="dash-mine" className="dash-h">Khoá học của tôi</h2><Link className="dash-link" to="/courses">Tìm thêm khoá học</Link></div>
            <ul className="dash-courses">{items.map(({ c, p, r }) => (
              <li key={c.id} className="dash-course">
                <Thumb course={c} small />
                <div className="dash-course-body">
                  <Link className="dash-course-title" to={`/learn/${c.id}`}>{c.title}</Link>
                  {r.pathStatus === 'none' ? <span className="dash-course-meta">Chưa thiết lập lộ trình</span>
                    : <><Progress pct={p.pct} label={`Tiến độ khoá ${c.title}`} /><span className="dash-course-meta">{p.done}/{p.total} bài · {p.completed ? 'Đã hoàn thành' : goalLabel(r.goal)}</span></>}
                  {c.status === 'hidden' && <span className="dash-course-meta">Khoá học tạm ẩn — bạn vẫn có thể tiếp tục học.</span>}
                </div>
                <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}${r.pathStatus === 'none' ? '/onboarding' : ''}`}>{r.pathStatus === 'none' ? 'Bắt đầu' : p.completed ? 'Xem lại' : 'Mở lộ trình'}</Link>
              </li>
            ))}</ul>
          </section>
        </div>
        {aside}
      </div>
      {recs.length > 0 && (
        <section aria-labelledby="dash-recs">
          <div className="section-title"><h2 id="dash-recs" className="dash-h">Gợi ý cho bạn</h2><Link className="dash-link" to="/ai">Hỏi AI Codi</Link></div>
          <div className="dash-recs">{recs.map((c) => (
            <Link key={c.id} className="dash-rec" to={`/courses/${c.slug}`}>
              <Thumb course={c} />
              <span className="dash-rec-title">{c.title}</span>
              <span className="dash-rec-meta">{Codi.levelLabel(c.level)} · {Codi.lessons(c).length} bài</span>
              <span className="price">{c.price ? Codi.fmt.vnd(c.price) : 'Miễn phí'}</span>
            </Link>
          ))}</div>
        </section>
      )}
    </div>
  );
}
