/** Dashboard side columns: what changed (graded work, answered questions, path changes) and the week's goal. */
import { Link } from 'react-router-dom';
import { Icon, Mastery, Progress } from '../../components/ui/primitives';
import { scoreText } from './learning-store';
import { editGoal } from './path-page';

export function DashChanges({ pending, answered, pathChanges, latest, latestLesson }) {
  const none = !pending && !answered && !pathChanges.length && !latest;
  return (
    <aside className="db-changes" aria-labelledby="db-changes-h">
      <h2 id="db-changes-h" className="db-h2">Thay đổi</h2>
      <ul className="db-counts">
        <li><Link to="/progress"><span className="db-count-value db-mono">{pending}</span><span>Bài tập đang chờ chấm</span></Link></li>
        <li><Link to="/progress"><span className="db-count-value db-mono">{answered}</span><span>Câu hỏi đã được trả lời</span></Link></li>
      </ul>
      {pathChanges.length > 0 && (
        <div className="db-section">
          <h3 className="db-h3">Lộ trình đã thay đổi</h3>
          <ul className="db-path-changes">{pathChanges.map((ch) => (
            <li key={ch.courseId + ch.text}>
              <Icon name="arrow-up" className="icon-sm" />
              <span className="db-path-body">
                <span className="small muted">{ch.course}</span>
                <span className="db-path-text">{ch.text}</span>
                <Link className="small" to={`/learn/${ch.courseId}`}>Xem lộ trình</Link>
              </span>
            </li>
          ))}</ul>
        </div>
      )}
      {latest && (
        <div className="db-section">
          <h3 className="db-h3">Nhận xét mới nhất</h3>
          <p className="db-feedback-lesson">{(latestLesson || {}).title} · <span className="db-mono">{scoreText(latest.score)}/{latest.maxScore}</span></p>
          <p className="db-feedback-text">{latest.feedback}</p>
          <Link className="small" to="/progress">Xem tất cả nhận xét</Link>
        </div>
      )}
      {none && <p className="small muted">Nhận xét của giảng viên và cập nhật lộ trình sẽ hiện ở đây.</p>}
    </aside>
  );
}

export function DashGoal({ minutesWeek, goalInfo, goalPct, streak, badges }) {
  return (
    <section className="db-goal" aria-labelledby="db-goal-h">
      <div className="db-goal-week">
        <div className="db-goal-head">
          <h2 id="db-goal-h" className="db-h2">Mục tiêu tuần này</h2>
          <div className="row">
            {!goalInfo.hasGoal && <span className="badge badge-neutral">Mặc định</span>}
            {goalInfo.courseId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => editGoal(goalInfo.courseId)}>Chỉnh mục tiêu</button>}
          </div>
        </div>
        <Progress pct={Math.min(100, goalPct)} label="Mục tiêu học tuần này" />
        <p className="small"><span className="db-mono">{minutesWeek}</span> / <span className="db-mono">{goalInfo.hours * 60}</span> phút · {Math.round(goalPct)}% tuần này</p>
      </div>
      {streak > 0 && <div className="db-streak"><span className="db-streak-num db-mono">{streak}</span><span>ngày liên tiếp</span></div>}
      {badges.length > 0 && (
        <div className="db-skills">
          <h3 className="db-h3">Kỹ năng thành thạo</h3>
          <ul className="db-skill-list">{badges.slice(0, 5).map((b) => (
            <li key={b.course + b.id}>
              <Link className="db-skill" to="/progress" title={`${b.name} · ${b.course}`}><span>{b.name}</span><Mastery level={b.level} /></Link>
            </li>
          ))}</ul>
          {badges.length > 5 && <span className="small muted">+{badges.length - 5} kỹ năng khác</span>}
        </div>
      )}
    </section>
  );
}
