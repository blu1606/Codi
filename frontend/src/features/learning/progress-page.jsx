/**
 * "Kết quả học tập" ('/progress'): one page with three tabs, kept in the URL.
 *   Sổ điểm (default)        summary strip, "Cần làm tiếp", then one course at a time: progress, the lesson gradebook
 *                            (quiz, assignment and code results, lecturer feedback) and concept mastery.
 *   Thống kê (?tab=stats)    study time, streak, scores (insights-pages StatsPanel).
 *   Bản đồ kiến thức (?tab=map) the course's concept graph (insights-pages KnowledgeMap).
 * `?course=<id>` picks the course for Sổ điểm and the map; the legacy `?tab=done` opens the first completed course.
 * Data: GET /api/learner/overview (courses → lessons in path order with their latest results, concept mastery).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Mastery, Progress, SpinnerBlock, Thumb } from '../../components/ui/primitives';
import { errorText, goalLabel, scoreText } from './learning-store';
import { KnowledgeMap, StatsPanel } from './insights-pages';
import './results-page.css';
import MyCertificates from '../certificates/my-certificates';

const TABS = [['scores', 'Sổ điểm'], ['stats', 'Thống kê'], ['map', 'Bản đồ kiến thức']];

const thumbOf = (course) => ({ id: course.id, title: course.title, coverImageUrl: course.cover });

function resultsHref(patch, query) {
  const q = new URLSearchParams();
  const next = { tab: query.tab === 'done' ? undefined : query.tab, course: query.course, ...patch };
  if (next.tab && next.tab !== 'scores') q.set('tab', next.tab);
  if (next.course) q.set('course', next.course);
  const s = q.toString();
  return '/progress' + (s ? '?' + s : '');
}

function QuizCell({ results }) {
  const q = results.find((x) => x.type === 'quiz');
  if (!q) return <span className="muted">—</span>;
  if (q.status === 'graded' && q.percent != null) {
    const ok = !!q.passed;
    return <span className={`rs-result ${ok ? 'text-success' : 'text-warn'}`}><Icon name={ok ? 'check-circle' : 'alert-circle'} className="icon-sm" /><strong>{Math.round(q.percent)}%</strong> {ok ? 'Đạt' : 'Chưa đạt'}</span>;
  }
  return <span className="muted">{q.status === 'draft' ? 'Đang làm · chưa nộp' : 'Chưa làm'}</span>;
}

// The "Bài tập & code" column carries the coding and assignment results (real resultsOf: assignment or coding).
function WorkCell({ results }) {
  const parts = [];
  results.filter((x) => x.type === 'coding').forEach((s) => {
    parts.push(
      <div key={'c' + s.id} className="rs-work"><span className="rs-work-name">Bài code</span>
        {s.status === 'graded' && s.passed ? <span className="rs-result text-success"><Icon name="check-circle" className="icon-sm" /><strong>{Math.round(s.percent || 0)}%</strong> Đạt</span>
          : s.status === 'graded' ? <span className="rs-result text-warn"><Icon name="alert-circle" className="icon-sm" />Chưa đạt</span> : <span className="muted">Chưa làm</span>}</div>,
    );
  });
  results.filter((x) => x.type === 'assignment').forEach((s) => {
    parts.push(
      <div key={'a' + s.id} className="rs-work"><span className="rs-work-name">{s.title || 'Bài tập'}</span>
        {!s.status || s.status === 'draft' ? <span className="muted">Chưa nộp</span>
          : s.status === 'pending' ? <span className="rs-result text-warn"><Icon name="clock" className="icon-sm" />Chờ chấm</span>
            : <><strong className="rs-score">{scoreText(s.score)}/{s.maxScore}</strong>{s.feedback && <span className="rs-feedback">{s.feedback}</span>}</>}</div>,
    );
  });
  return parts.length ? <div className="rs-works">{parts}</div> : <span className="muted">—</span>;
}

function LessonStatus({ lesson: l }) {
  if (l.status === 'done') return <span className="rs-result text-success"><Icon name="check-circle" className="icon-sm" />Hoàn thành</span>;
  if (l.status === 'locked') return <span className="rs-result muted"><Icon name="lock" className="icon-sm" />Chưa đủ tiên quyết</span>;
  return <span className="rs-result muted"><Icon name="circle" className="icon-sm" />Chưa hoàn thành</span>;
}

/** Work the learner can act on now: unfinished drafts and results below the pass mark, newest courses first. */
function todoItems(courses) {
  const out = [];
  courses.forEach((c) => c.lessons.forEach((l) => {
    if (l.status === 'locked') return;
    l.results.forEach((r) => {
      const href = `/learn/${c.id}/${l.id}`;
      if (r.status === 'draft') out.push({ key: c.id + r.id, href, lesson: l.title, course: c.title, text: r.type === 'quiz' ? 'Quiz đang làm, chưa nộp' : 'Bài làm chưa nộp', icon: 'clock' });
      else if (r.status === 'graded' && r.passed === false && r.type !== 'assignment') out.push({ key: c.id + r.id, href, lesson: l.title, course: c.title, text: r.type === 'quiz' ? `Quiz chưa đạt (${Math.round(r.percent || 0)}%) · làm lại` : 'Bài code chưa đạt · làm lại', icon: 'alert-circle' });
    });
  }));
  return out;
}

function Gradebook({ data, query }) {
  const navigate = useNavigate();
  const all = data.courses;
  if (!all.length) {
    return (
      <div className="card"><Empty icon="graduation-cap" title="Chưa có kết quả học tập" body="Đăng ký một khoá học, điểm quiz, bài tập và nhận xét của giảng viên sẽ hiện ở đây."
        actions={<Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link>} /></div>
    );
  }
  const shown = all.filter((c) => !c.hidden);
  const active = shown.filter((c) => !c.complete);
  const done = shown.filter((c) => c.complete);
  const hidden = all.filter((c) => c.hidden);
  const fallback = (query.tab === 'done' && done[0]) || all.find((c) => c.id === data.continueCourseId && !c.hidden) || active[0] || done[0] || all[0];
  const course = all.find((c) => c.id === query.course) || fallback;

  const skills = shown.flatMap((c) => c.skills);
  const mastered = skills.filter((k) => k.level >= 3).length;
  const lessonsDone = shown.reduce((n, c) => n + c.done, 0);
  const todo = todoItems(shown).slice(0, 4);

  const pick = (id) => navigate(resultsHref({ course: id, tab: 'scores' }, query), { replace: true });
  const option = (c) => <option key={c.id} value={c.id}>{c.title} · {c.percent}%</option>;

  return (
    <div className="rs-book">
      <dl className="rs-summary" aria-label="Tóm tắt">
        <div><dt>Khoá đang học</dt><dd>{active.length}</dd></div>
        <div><dt>Khoá đã hoàn thành</dt><dd>{done.length}</dd></div>
        <div><dt>Bài đã học xong</dt><dd>{lessonsDone}</dd></div>
        <div><dt>Bài tập chờ chấm</dt><dd>{data.stats.pending}</dd></div>
        <div><dt>Kỹ năng thành thạo</dt><dd>{mastered}<span className="rs-of">/{skills.length}</span></dd></div>
      </dl>

      {todo.length > 0 && (
        <section className="rs-todo" aria-labelledby="rs-todo-h">
          <h2 id="rs-todo-h" className="rs-h2">Cần làm tiếp</h2>
          <ul>{todo.map((t) => (
            <li key={t.key}><Link to={t.href} className="rs-todo-row">
              <Icon name={t.icon} className="icon-sm" />
              <span className="rs-todo-text"><strong>{t.lesson}</strong><span>{t.text} · {t.course}</span></span>
              <Icon name="chevron-right" className="icon-sm rs-chev" />
            </Link></li>
          ))}</ul>
        </section>
      )}

      <section className="rs-course" aria-labelledby="rs-course-h">
        <div className="rs-course-pick">
          <label htmlFor="rs-course-select">Khoá học</label>
          <select id="rs-course-select" className="input" value={course.id} onChange={(e) => pick(e.target.value)}>
            {active.length > 0 && <optgroup label={`Đang học (${active.length})`}>{active.map(option)}</optgroup>}
            {done.length > 0 && <optgroup label={`Đã hoàn thành (${done.length})`}>{done.map(option)}</optgroup>}
            {hidden.length > 0 && <optgroup label={`Khoá học tạm ẩn (${hidden.length})`}>{hidden.map(option)}</optgroup>}
          </select>
        </div>

        <header className="rs-course-head">
          <Thumb course={thumbOf(course)} small />
          <div className="rs-course-title">
            <h2 id="rs-course-h" className="rs-h2">{course.title}</h2>
            <p className="rs-course-meta">
              {course.complete ? <span className="badge badge-success"><Icon name="check" />Đã hoàn thành</span> : <span className="badge badge-accent">Đang học</span>}
              <span><strong>{course.done}/{course.total}</strong> bài · {goalLabel(course.goal)}</span>
            </p>
            {course.hidden && <p className="rs-course-meta">Khoá học tạm ẩn — bạn vẫn xem được kết quả và tiếp tục học.</p>}
            <div className="rs-course-progress"><Progress pct={course.percent} label={`Tiến độ ${course.title}`} /><span>{course.percent}%</span></div>
          </div>
          <Link className="btn btn-secondary" to={`/learn/${course.id}`}>Mở lộ trình</Link>
        </header>

        {course.lessons.length ? (
          <div className="table-wrap rs-table-wrap" role="region" aria-label={`Sổ điểm ${course.title}`} tabIndex={0}>
            <table className="table rs-table">
              <caption className="sr-only">Điểm và nhận xét từng bài của {course.title}. Quiz và code tính lần nộp gần nhất.</caption>
              <thead><tr><th scope="col">Bài học</th><th scope="col">Trạng thái</th><th scope="col">Quiz</th><th scope="col">Bài tập &amp; code</th></tr></thead>
              <tbody>{course.lessons.map((l, i) => (
                <tr key={l.id}>
                  <th scope="row"><span className="rs-lesson">
                    <span className="rs-num">{i + 1}</span>
                    <span className="rs-lesson-text"><Link to={`/learn/${course.id}/${l.id}`}>{l.title}</Link>{l.status === 'locked' && l.lock && <span className="rs-lock">Nên học trước: {l.lock}</span>}</span>
                  </span></th>
                  <td data-label="Trạng thái"><LessonStatus lesson={l} /></td>
                  <td data-label="Quiz" className={l.results.some((x) => x.type === 'quiz') ? undefined : 'rs-none'}><QuizCell results={l.results} /></td>
                  <td data-label="Bài tập & code" className={l.results.some((x) => x.type !== 'quiz') ? undefined : 'rs-none'}><WorkCell results={l.results} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">Chưa có bài học được xuất bản trong khoá học này.</p>}

        {course.skills.length > 0 && (
          <section className="rs-mastery" aria-labelledby="rs-mastery-h">
            <div className="rs-section-head">
              <h3 id="rs-mastery-h" className="rs-h3">Mức thành thạo theo khái niệm</h3>
              <Link className="rs-link" to={resultsHref({ tab: 'map', course: course.id }, query)}>Xem bản đồ kiến thức</Link>
            </div>
            <ul className="rs-mastery-grid">{course.skills.map((k) => <li key={k.id}><span>{k.name}</span><Mastery level={k.level} /></li>)}</ul>
          </section>
        )}
      </section>
    </div>
  );
}

export default function ProgressPage({ query }) {
  const navigate = useNavigate();
  const q = query || {};
  const tab = TABS.some(([k]) => k === q.tab) ? q.tab : 'scores';
  const { data, loading, error, reload } = useApi(tab === 'scores' ? '/api/learner/overview' : null);

  let body;
  if (tab === 'stats') body = <StatsPanel />;
  else if (tab === 'map') body = <KnowledgeMap initialCourseId={q.course || null} onCourseChange={(id) => navigate(resultsHref({ tab: 'map', course: id }, q), { replace: true })} />;
  else if (!data) {
    body = error
      ? <Alert type="danger" title="Chưa tải được kết quả học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />
      : <SpinnerBlock text="Đang tải kết quả học tập…" />;
  } else body = <Gradebook data={data} query={q} />;

  return (
    <div className="page rs-page">
      <div className="page-header"><div><h1>Kết quả học tập</h1><p className="muted">Điểm từng bài, nhịp học và mức thành thạo của bạn.</p></div></div>
      <MyCertificates />
      <nav className="tabs rs-tabs" aria-label="Kết quả học tập">
        {TABS.map(([k, l]) => <Link key={k} className="tab" to={resultsHref({ tab: k }, q)} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {body}
    </div>
  );
}
