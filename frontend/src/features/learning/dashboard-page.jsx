/**
 * Learner home ('/dashboard', "Trang chủ"). One question per block, in reading order:
 *   main  — "Học tiếp" (the lesson the course path page opens next), the latest lecturer feedback, the default-path
 *           diagnostic card, and "Khoá học của tôi" as tappable rows.
 *   aside — this week's study minutes against the goal with the seven days and the streak, work waiting for grading,
 *           mastered skills, and course suggestions.
 * Hidden (unpublished) courses never lead and stay out of the default course list; "Xem tất cả" shows them.
 * Data: GET /api/learner/overview, plus GET /api/learn/:courseId/path for the leading course only.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Mastery, Progress, SpinnerBlock, Thumb } from '../../components/ui/primitives';
import { errorText, goalLabel, learnBase, levelLabel, pathRows, scoreText } from './learning-store';
import { DiagCard } from './learning-shared';
import { kindIcon, kindLabel } from './path-views';
import { editGoal } from './path-page';
import './dashboard-page.css';

const COURSES_SHOWN = 5;
const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const hasPath = (course) => course.pathStatus === 'ready' || course.pathStatus === 'failed';
const thumbOf = (course) => ({ id: course.id, title: course.title, coverImageUrl: course.cover });
const firstName = (name) => String(name || '').trim().split(/\s+/).pop() || '';
const today = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

/** Path view of one course ({ view, failed }); null while loading. */
function useLeadPath(courseId) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!courseId) { setState({ view: null, failed: false }); return undefined; }
    let live = true;
    setState(null);
    api.get(`${learnBase(courseId)}/path`)
      .then((view) => { if (live) setState({ view, failed: false }); })
      .catch(() => { if (live) setState({ view: null, failed: true }); });
    return () => { live = false; };
  }, [courseId]);
  return state;
}

function courseState(c) {
  if (c.hidden) return ['Tạm ẩn', 'badge-neutral'];
  if (c.complete) return ['Đã xong', 'badge-success'];
  // Lessons are locked until a path is set, but learners who already studied keep their progress: say so, not "not started".
  if (c.pathStatus === 'none') return c.done > 0 ? ['Chưa cá nhân hoá', 'badge-neutral'] : ['Chưa thiết lập', 'badge-warn'];
  return ['Đang học', 'badge-accent'];
}

/** The one lesson to study now, or the step that unblocks it. */
function NextCard({ course, path }) {
  const title = <h2 id="hm-next-h" className="hm-h2">Học tiếp</h2>;
  if (!course) {
    return (
      <section className="hm-section" aria-labelledby="hm-next-h">{title}
        <div className="hm-next hm-next-plain">
          <div className="hm-next-body">
            <h3 className="hm-next-title">Bạn đã hoàn thành các khoá học đã mua</h3>
            <p className="hm-next-meta">Xem lại điểm và nhận xét, hoặc chọn một khoá học mới.</p>
            <div className="hm-next-actions"><Link className="btn btn-secondary" to="/progress">Xem kết quả học tập</Link><Link className="btn btn-ghost" to="/courses">Tìm khoá học mới</Link></div>
          </div>
        </div>
      </section>
    );
  }
  const rows = path && path.view ? pathRows(path.view) : [];
  const cur = path && path.view ? path.view.currentLessonId : null;
  const row = rows.find((x) => x.id === cur) || null;
  const update = path && path.view && path.view.update && path.view.update.changes.length ? path.view.update.changes[0] : null;

  let heading = course.title;
  let meta = null;
  let action;
  if (course.pathStatus === 'none') {
    const started = course.done > 0;
    meta = <p className="hm-next-meta">{started
      ? 'Bài học tiếp theo được mở sau khi bạn chọn lộ trình. Tiến độ đã học vẫn được giữ nguyên.'
      : 'Đặt mục tiêu và làm bài kiểm tra đầu vào để Codi xếp lộ trình riêng cho bạn.'}</p>;
    action = <Link className="btn btn-primary btn-lg" to={`/learn/${course.id}/onboarding`}>{started ? 'Thiết lập lộ trình' : 'Bắt đầu thiết lập'}</Link>;
  } else if (row) {
    heading = row.title;
    meta = (
      <p className="hm-next-meta hm-dots">
        <span className="hm-strong">{course.title}</span>
        {row.chapterTitle && <span>{row.chapterTitle}</span>}
        <span>Bài {rows.indexOf(row) + 1}</span>
        <span className="hm-inline"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span>
        <span>{Math.round(row.durationMin || 0)} phút</span>
      </p>
    );
    action = <Link className="btn btn-primary btn-lg" to={`/learn/${course.id}/${row.id}`}>Học tiếp<Icon name="arrow-right" /></Link>;
  } else {
    meta = <p className="hm-next-meta">{course.pathStatus === 'generating' ? 'Codi đang chuẩn bị lộ trình của bạn.' : path && path.failed ? 'Chưa tải được lộ trình. Mở lộ trình để thử lại.' : 'Lộ trình cần được kiểm tra lại.'}</p>;
    action = <Link className="btn btn-primary btn-lg" to={`/learn/${course.id}`}>Mở lộ trình</Link>;
  }

  return (
    <section className="hm-section" aria-labelledby="hm-next-h">{title}
      <div className="hm-next">
        <div className="hm-next-body">
          <h3 className="hm-next-title">{heading}</h3>
          {meta}
          {(course.pathStatus !== 'none' || course.done > 0) && (
            <div className="hm-next-progress">
              <Progress pct={course.percent} label={`Tiến độ khoá ${course.title}`} />
              <span><strong>{course.done}/{course.total}</strong> bài đã học{course.pathStatus !== 'none' ? ` · ${goalLabel(course.goal)}` : ''}</span>
            </div>
          )}
          <div className="hm-next-actions">
            {action}
            {(course.pathStatus !== 'none' ? row : course.done > 0) && <Link className="btn btn-ghost" to={`/learn/${course.id}`}>Xem lộ trình</Link>}
          </div>
          {update && <p className="hm-next-note"><Icon name="sparkles" className="icon-sm" /><span>Lộ trình vừa được cập nhật: {update.text}</span></p>}
        </div>
        <div className="hm-next-media"><Thumb course={thumbOf(course)} /></div>
      </div>
    </section>
  );
}

function FeedbackCard({ latest }) {
  return (
    <section className="hm-section" aria-labelledby="hm-fb-h">
      <h2 id="hm-fb-h" className="hm-h2">Nhận xét mới của giảng viên</h2>
      <div className="hm-card hm-feedback">
        <div className="hm-feedback-head">
          <div className="hm-feedback-where"><strong>{latest.lessonTitle}</strong><span>{latest.courseTitle}</span></div>
          <span className="hm-score"><strong>{scoreText(latest.score)}</strong>/{latest.maxScore}</span>
        </div>
        <p className="hm-feedback-text">{latest.text}</p>
        <Link className="hm-link" to={`/progress?course=${encodeURIComponent(latest.courseId)}`}>Xem trong sổ điểm</Link>
      </div>
    </section>
  );
}

function CourseRows({ courses }) {
  const [all, setAll] = useState(false);
  const short = courses.filter((c) => !c.hidden).slice(0, COURSES_SHOWN);
  const list = all ? courses : short;
  const hiddenCount = courses.filter((c) => c.hidden).length;
  return (
    <section className="hm-section" aria-labelledby="hm-mine-h">
      <div className="hm-section-head"><h2 id="hm-mine-h" className="hm-h2">Khoá học của tôi</h2><Link className="hm-link" to="/courses">Tìm thêm khoá học</Link></div>
      <ul className="hm-courses">{list.map((c) => {
        const [label, tone] = courseState(c);
        const none = c.pathStatus === 'none';
        const started = c.total > 0 && (c.done > 0 || !none);
        return (
          <li key={c.id}>
            <Link className="hm-course" to={`/learn/${c.id}${none && !c.complete ? '/onboarding' : ''}`}>
              <Thumb course={thumbOf(c)} small />
              <span className="hm-course-body">
                <span className="hm-course-title">{c.title}</span>
                <span className="hm-course-meta"><span className={`badge ${tone}`}>{label}</span>{started && <span><strong>{c.done}/{c.total}</strong> bài</span>}</span>
                {started && <Progress pct={c.percent} label={`Tiến độ khoá ${c.title}`} />}
              </span>
              <Icon name="chevron-right" className="hm-chev" />
            </Link>
          </li>
        );
      })}</ul>
      {courses.length > short.length && (
        <button type="button" className="btn btn-ghost hm-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Thu gọn' : `Xem tất cả ${courses.length} khoá học${hiddenCount ? ` (gồm ${hiddenCount} khoá tạm ẩn)` : ''}`}
          <Icon name={all ? 'chevron-up' : 'chevron-down'} className="icon-sm" />
        </button>
      )}
    </section>
  );
}

function WeekCard({ weekly, onEdited }) {
  const pct = weekly.goalMinutes ? Math.min(100, (weekly.minutes / weekly.goalMinutes) * 100) : 0;
  const goalCourse = weekly.assumed ? null : weekly.courseId;
  return (
    <section className="hm-card hm-week" aria-labelledby="hm-week-h">
      <div className="hm-section-head"><h2 id="hm-week-h" className="hm-h3">Tuần này</h2>{weekly.assumed && <span className="badge badge-neutral">Mục tiêu mặc định</span>}</div>
      <p className="hm-week-figure"><strong>{weekly.minutes}</strong><span> / {weekly.goalMinutes} phút</span></p>
      <Progress pct={pct} label="Mục tiêu học tuần này" />
      <ol className="hm-days" aria-label="Ngày có học trong tuần">
        {weekly.days.map((d, i) => (
          <li key={d.date} className={`${d.studied ? 'is-on' : ''}${d.today ? ' is-today' : ''}`}>
            <span className="hm-day-dot" aria-hidden="true">{d.studied && <Icon name="check" />}</span>
            <span className="hm-day-label">{DAY_LABELS[i]}</span>
            <span className="sr-only">{d.studied ? 'có học' : 'chưa học'}{d.today ? ', hôm nay' : ''}</span>
          </li>
        ))}
      </ol>
      <p className="hm-week-note">{weekly.streak > 0 ? <>Chuỗi <strong>{weekly.streak}</strong> ngày học liên tiếp</> : 'Học một bài hôm nay để bắt đầu chuỗi ngày học.'}</p>
      {goalCourse && <button type="button" className="btn btn-ghost btn-sm hm-week-edit" onClick={() => editGoal(goalCourse).then(onEdited)}>Chỉnh mục tiêu</button>}
    </section>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi('/api/learner/overview');
  const courses = data ? data.courses : [];
  const active = courses.filter((x) => !x.complete);
  const lead = active.find((x) => x.id === data?.continueCourseId && !x.hidden) || active.find((x) => !x.hidden) || null;
  const path = useLeadPath(lead && hasPath(lead) ? lead.id : null);

  const name = firstName((data && data.name) || (Codi.currentUser() || {}).name);
  const head = <header className="hm-head"><p className="hm-date">{today()}</p><h1>{name ? `Chào ${name}` : 'Trang chủ'}</h1></header>;
  const retry = <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>;

  if (error && !data) {
    return <div className="page hm-page">{head}<Alert type="danger" title="Chưa tải được trang chủ" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')} actions={retry} /></div>;
  }
  if (!data || path === null) return <div className="page hm-page">{head}<SpinnerBlock text="Đang tải trang chủ…" /></div>;
  if (!courses.length) {
    return (
      <div className="page hm-page">{head}<div className="card">
        <Empty icon="book-open" title="Bạn chưa có khoá học nào" body="Chọn một khoá học để bắt đầu. Codi sẽ xếp lộ trình riêng cho bạn sau bài kiểm tra đầu vào."
          actions={<><Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link><Link className="btn btn-secondary" to="/ai"><Icon name="sparkles" /> Hỏi AI Codi nên học gì</Link></>} />
      </div></div>
    );
  }

  // Courses in reading order: the leading course, other active published ones, completed ones, then hidden ones.
  const rank = (c) => (c === lead ? 0 : c.hidden ? 3 : c.complete ? 2 : 1);
  const ordered = courses.slice().sort((a, b) => rank(a) - rank(b));
  const skills = courses.filter((c) => !c.hidden).flatMap((c) => c.skills.filter((k) => k.level >= 3).map((k) => ({ ...k, course: c.title, courseId: c.id })));
  const diagCourse = lead && lead.showDiagnostic ? lead : null;
  const pending = data.stats.pending;
  const recs = data.recommendations.slice(0, 3);

  return (
    <div className="page hm-page">
      {head}
      {error && <Alert type="danger" title="Chưa cập nhật được dữ liệu học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')} actions={retry} />}
      <div className="hm-grid">
        <div className="hm-main">
          <NextCard course={lead} path={path} />
          {diagCourse && <DiagCard courseId={diagCourse.id} title={diagCourse.title} onChange={reload} />}
          {data.latestFeedback && <FeedbackCard latest={data.latestFeedback} />}
          <CourseRows courses={ordered} />
        </div>
        <aside className="hm-side" aria-label="Tuần này và gợi ý">
          <WeekCard weekly={data.weekly} onEdited={reload} />
          {pending > 0 && (
            <Link className="hm-card hm-wait" to="/progress">
              <Icon name="clock" />
              <span><strong>{pending} bài tập</strong> đang chờ giảng viên chấm</span>
              <Icon name="chevron-right" className="hm-chev" />
            </Link>
          )}
          {skills.length > 0 && (
            <section className="hm-card" aria-labelledby="hm-skills-h">
              <div className="hm-section-head"><h2 id="hm-skills-h" className="hm-h3">Kỹ năng đã vững</h2><Link className="hm-link" to="/progress?tab=map">Bản đồ kiến thức</Link></div>
              <ul className="hm-skills">{skills.slice(0, 4).map((k) => <li key={k.courseId + k.id} title={k.course}><span>{k.name}</span><Mastery level={k.level} /></li>)}</ul>
              {skills.length > 4 && <p className="hm-muted">và {skills.length - 4} kỹ năng khác</p>}
            </section>
          )}
          {recs.length > 0 && (
            <section className="hm-card" aria-labelledby="hm-recs-h">
              <div className="hm-section-head"><h2 id="hm-recs-h" className="hm-h3">Gợi ý cho bạn</h2><Link className="hm-link" to="/courses">Xem tất cả</Link></div>
              <ul className="hm-recs">{recs.map((rc) => (
                <li key={rc.id}><Link className="hm-rec" to={`/courses/${rc.slug}`}>
                  <Thumb course={thumbOf(rc)} small />
                  <span className="hm-rec-body"><span className="hm-rec-title">{rc.title}</span><span className="hm-muted">{levelLabel(rc.level)} · {rc.price ? Codi.fmt.vnd(rc.price) : 'Miễn phí'}</span></span>
                </Link></li>
              ))}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
