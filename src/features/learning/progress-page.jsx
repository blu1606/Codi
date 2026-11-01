/** S13 Progress & results ('/progress'), port of real components/learner-workspace.tsx ProgressResults. */
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Mastery, Progress } from '../../components/ui/primitives';
import { codeScore, codeStatus, currentLessonId, enrolledCoursesOf, goalLabel, lessonStatus, lockInfo, mySubmission, orderOf, rec, scoreText } from './learning-store';
import { useSyncError } from './use-sync-error';

function QuizCell({ l, q }) {
  if (!l.quiz) return <span className="muted">—</span>;
  const pass = l.quiz.passingScore != null ? l.quiz.passingScore : 70;
  if (q && q.submitted) {
    const ok = q.score >= pass;
    return <span className={`strong ${ok ? 'text-success' : 'text-warn'}`}>{Math.round(q.score)}% · {ok ? 'Đạt' : 'Chưa đạt'}</span>;
  }
  return <span className="muted">{q && q.status === 'draft' ? 'Đang làm · chưa nộp' : 'Chưa làm'}</span>;
}

// The "Bài tập" column also carries the coding result (real resultsOf: assignment or coding).
function WorkCell({ l }) {
  const parts = [];
  if (l.code && l.code.kind !== 'tutorial') {
    const s = codeStatus(l);
    parts.push(
      <div key="code" className="stack-1"><span className="xsmall muted">Bài code</span>
        {s.done ? <span className="strong text-success">{Math.round(codeScore(l))}% · Đạt</span> : s.submits ? <span className="strong text-warn">Chưa đạt</span> : <span className="muted">Chưa làm</span>}</div>,
    );
  }
  if (l.assignment) {
    const s = mySubmission(l.id);
    parts.push(
      <div key="as" className="stack-1"><span className="xsmall muted">{l.assignment.title || 'Bài tập'}</span>
        {!s ? <span className="muted">Chưa nộp</span> : s.status === 'pending' ? <span className="text-warn">Chờ chấm</span>
          : <><strong>{scoreText(s.score)}/{s.maxScore}</strong>{s.feedback && <span className="small muted ln-pre">{s.feedback}</span>}</>}</div>,
    );
  }
  return parts.length ? <div className="stack-2">{parts}</div> : <span className="muted">—</span>;
}

export default function ProgressPage({ query }) {
  useCodi();
  const [syncError, retrySync, retrying] = useSyncError();
  const u = Codi.currentUser();
  const tab = query && query.tab === 'done' ? 'done' : 'active';
  const items = enrolledCoursesOf(u.id).map((c) => ({ c, p: Codi.courseProgress(c.id), r: rec(c.id) }));
  const list = items.filter((x) => (tab === 'done' ? x.p.completed : !x.p.completed));
  return (
    <div className="page stack-4">
      <div className="page-header"><div><h1>Tiến độ & kết quả</h1><p className="muted">Điểm quiz, bài tập, nhận xét của giảng viên và mức thành thạo — tất cả ở một nơi.</p></div>
        <div className="row"><Link className="btn btn-secondary btn-sm" to="/insights/stats"><Icon name="bar-chart" className="icon-sm" /> Xem thống kê</Link><Link className="btn btn-ghost btn-sm" to="/ai"><Icon name="sparkles" className="icon-sm" /> Hỏi AI Codi</Link></div></div>
      {syncError && <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body="Không thể tải dữ liệu học tập. Vui lòng thử lại."
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retrySync} disabled={retrying} aria-busy={retrying || undefined}>Thử lại</button>} />}
      <div className="tabs" role="tablist" aria-label="Trạng thái khoá học">
        <Link className="tab" role="tab" to="/progress" aria-selected={tab === 'active'}>Đang học <span className="count">{items.filter((x) => !x.p.completed).length}</span></Link>
        <Link className="tab" role="tab" to="/progress?tab=done" aria-selected={tab === 'done'}>Đã hoàn thành <span className="count">{items.filter((x) => x.p.completed).length}</span></Link>
      </div>
      {!list.length ? (
        <div className="card">
          <Empty icon="graduation-cap" title={tab === 'done' ? 'Chưa có khoá học hoàn thành' : 'Chưa có khoá học đang học'} body={tab === 'done' ? 'Khoá học bạn hoàn thành sẽ xuất hiện ở đây.' : 'Đăng ký một khoá học để bắt đầu.'}
            actions={<Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link>} />
        </div>
      ) : (
        <div className="stack-3">{list.map(({ c, p: pr, r }, i) => {
          const cur = currentLessonId(c, r);
          const ids = orderOf(c, r).filter((id) => Codi.lesson(c, id));
          return (
            <details key={c.id + tab} className="card ln-acc" open={i === 0}>
              <summary className="card-body compact row"><span className="od-fill stack-1"><strong>{c.title}</strong><span className="xsmall muted">{pr.done}/{pr.total} bài · {goalLabel(r.goal)} · {pr.pct}%</span></span><span style={{ width: 160 }}><Progress pct={pr.pct} label={`Tiến độ ${c.title}`} /></span><Icon name="chevron-down" className="icon-sm" /></summary>
              <div className="card-body stack-4" style={{ borderTop: '1px solid var(--border)' }}>
                {(c.concepts || []).length > 0 && (
                  <section className="stack-2" aria-label={`Mức thành thạo ${c.title}`}><h2 className="ln-h">Mức thành thạo theo khái niệm</h2>
                    <ul className="ln-mastery-grid">{c.concepts.map((k) => <li key={k.id} className="row-between small"><span>{k.name}</span><Mastery level={r.mastery[k.id] || 0} /></li>)}</ul>
                    <Link className="small strong" to={`/insights/knowledge-map?course=${encodeURIComponent(c.id)}`}>Xem bản đồ kiến thức</Link></section>
                )}
                <div className="table-wrap" role="region" aria-label={`Kết quả bài học ${c.title}`} tabIndex={0}><table className="table">
                  <caption className="sr-only">Điểm và nhận xét từng bài của {c.title}. Quiz và code tính lần nộp gần nhất.</caption>
                  <thead><tr><th scope="col">Bài học</th><th scope="col">Trạng thái</th><th scope="col">Quiz</th><th scope="col">Bài tập</th></tr></thead><tbody>
                  {ids.map((id) => {
                    const l = Codi.lesson(c, id);
                    const st = lessonStatus(c, r, l, cur);
                    const lock = st === 'locked' ? lockInfo(c, r, l) : null;
                    return (
                      <tr key={id}>
                        <th scope="row" className="ln-cell-lesson"><Link to={`/learn/${c.id}/${id}`}>{l.title}</Link>{lock && <span className="xsmall muted ln-block">Nên học trước: {lock.concept}</span>}</th>
                        <td>{st === 'done' ? <span className="row text-success small"><Icon name="check" className="icon-sm" />Hoàn thành</span> : <span className="small muted">{st === 'locked' ? 'Chưa đủ tiên quyết' : 'Chưa hoàn thành'}</span>}</td>
                        <td className="od-nowrap"><QuizCell l={l} q={r.quiz[id]} /></td>
                        <td><WorkCell l={l} /></td>
                      </tr>
                    );
                  })}
                </tbody></table></div>
                {!ids.length && <p className="small muted">Chưa có bài học được xuất bản trong khoá học này.</p>}
                <div className="row"><Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}`}>Mở lộ trình</Link></div>
              </div>
            </details>
          );
        })}</div>
      )}
    </div>
  );
}
