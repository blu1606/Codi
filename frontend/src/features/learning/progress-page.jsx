/**
 * S13 Progress & results ('/progress'), port of real components/learner-workspace.tsx ProgressResults.
 * Data: GET /api/learner/overview (courses → lessons in path order with their latest results, concept mastery).
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Mastery, Progress, SpinnerBlock } from '../../components/ui/primitives';
import { errorText, goalLabel, publishOverview, scoreText } from './learning-store';

function QuizCell({ results }) {
  const q = results.find((x) => x.type === 'quiz');
  if (!q) return <span className="muted">—</span>;
  if (q.status === 'graded' && q.percent != null) {
    const ok = !!q.passed;
    return <span className={`strong ${ok ? 'text-success' : 'text-warn'}`}>{Math.round(q.percent)}% · {ok ? 'Đạt' : 'Chưa đạt'}</span>;
  }
  return <span className="muted">{q.status === 'draft' ? 'Đang làm · chưa nộp' : 'Chưa làm'}</span>;
}

// The "Bài tập" column also carries the coding result (real resultsOf: assignment or coding).
function WorkCell({ results }) {
  const parts = [];
  results.filter((x) => x.type === 'coding').forEach((s) => {
    parts.push(
      <div key={'c' + s.id} className="stack-1"><span className="xsmall muted">Bài code</span>
        {s.status === 'graded' && s.passed ? <span className="strong text-success">{Math.round(s.percent || 0)}% · Đạt</span> : s.status === 'graded' ? <span className="strong text-warn">Chưa đạt</span> : <span className="muted">Chưa làm</span>}</div>,
    );
  });
  results.filter((x) => x.type === 'assignment').forEach((s) => {
    parts.push(
      <div key={'a' + s.id} className="stack-1"><span className="xsmall muted">{s.title || 'Bài tập'}</span>
        {!s.status || s.status === 'draft' ? <span className="muted">Chưa nộp</span> : s.status === 'pending' ? <span className="text-warn">Chờ chấm</span>
          : <><strong>{scoreText(s.score)}/{s.maxScore}</strong>{s.feedback && <span className="small muted ln-pre">{s.feedback}</span>}</>}</div>,
    );
  });
  return parts.length ? <div className="stack-2">{parts}</div> : <span className="muted">—</span>;
}

export default function ProgressPage({ query }) {
  const { data, loading, error, reload } = useApi('/api/learner/overview');
  useEffect(() => { if (data) publishOverview(data); }, [data]);
  const tab = query && query.tab === 'done' ? 'done' : 'active';
  const head = (
    <div className="page-header"><div><h1>Tiến độ & kết quả</h1><p className="muted">Điểm quiz, bài tập, nhận xét của giảng viên và mức thành thạo — tất cả ở một nơi.</p></div>
      <div className="row"><Link className="btn btn-secondary btn-sm" to="/insights/stats"><Icon name="bar-chart" className="icon-sm" /> Xem thống kê</Link><Link className="btn btn-ghost btn-sm" to="/ai"><Icon name="sparkles" className="icon-sm" /> Hỏi AI Codi</Link></div></div>
  );
  if (!data) {
    return (
      <div className="page stack-4">{head}
        {error ? <Alert type="danger" title="Chưa thể tải hoặc cập nhật dữ liệu học tập" body={errorText(error, 'Không thể tải dữ liệu học tập. Vui lòng thử lại.')}
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />
          : <SpinnerBlock text="Đang tải tiến độ…" />}
      </div>
    );
  }
  const items = data.courses;
  const list = items.filter((x) => (tab === 'done' ? x.complete : !x.complete));
  return (
    <div className="page stack-4">
      {head}
      <div className="tabs" role="tablist" aria-label="Trạng thái khoá học">
        <Link className="tab" role="tab" to="/progress" aria-selected={tab === 'active'}>Đang học <span className="count">{items.filter((x) => !x.complete).length}</span></Link>
        <Link className="tab" role="tab" to="/progress?tab=done" aria-selected={tab === 'done'}>Đã hoàn thành <span className="count">{items.filter((x) => x.complete).length}</span></Link>
      </div>
      {!list.length ? (
        <div className="card">
          <Empty icon="graduation-cap" title={tab === 'done' ? 'Chưa có khoá học hoàn thành' : 'Chưa có khoá học đang học'} body={tab === 'done' ? 'Khoá học bạn hoàn thành sẽ xuất hiện ở đây.' : 'Đăng ký một khoá học để bắt đầu.'}
            actions={<Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link>} />
        </div>
      ) : (
        <div className="stack-3">{list.map((c, i) => (
          <details key={c.id + tab} className="card ln-acc" open={i === 0}>
            <summary className="card-body compact row"><span className="od-fill stack-1"><strong>{c.title}</strong><span className="xsmall muted">{c.done}/{c.total} bài · {goalLabel(c.goal)} · {c.percent}%</span></span><span style={{ width: 160 }}><Progress pct={c.percent} label={`Tiến độ ${c.title}`} /></span><Icon name="chevron-down" className="icon-sm" /></summary>
            <div className="card-body stack-4" style={{ borderTop: '1px solid var(--border)' }}>
              {c.skills.length > 0 && (
                <section className="stack-2" aria-label={`Mức thành thạo ${c.title}`}><h2 className="ln-h">Mức thành thạo theo khái niệm</h2>
                  <ul className="ln-mastery-grid">{c.skills.map((k) => <li key={k.id} className="row-between small"><span>{k.name}</span><Mastery level={k.level} /></li>)}</ul>
                  <Link className="small strong" to={`/insights/knowledge-map?course=${encodeURIComponent(c.id)}`}>Xem bản đồ kiến thức</Link></section>
              )}
              <div className="table-wrap" role="region" aria-label={`Kết quả bài học ${c.title}`} tabIndex={0}><table className="table">
                <caption className="sr-only">Điểm và nhận xét từng bài của {c.title}. Quiz và code tính lần nộp gần nhất.</caption>
                <thead><tr><th scope="col">Bài học</th><th scope="col">Trạng thái</th><th scope="col">Quiz</th><th scope="col">Bài tập</th></tr></thead><tbody>
                {c.lessons.map((l) => (
                  <tr key={l.id}>
                    <th scope="row" className="ln-cell-lesson"><Link to={`/learn/${c.id}/${l.id}`}>{l.title}</Link>{l.status === 'locked' && l.lock && <span className="xsmall muted ln-block">Nên học trước: {l.lock}</span>}</th>
                    <td className="od-nowrap">{l.status === 'done' ? <span className="row ln-gap-1 ln-nowrap text-success small"><Icon name="check" className="icon-sm" />Hoàn thành</span> : <span className="small muted">{l.status === 'locked' ? 'Chưa đủ tiên quyết' : 'Chưa hoàn thành'}</span>}</td>
                    <td className="od-nowrap"><QuizCell results={l.results} /></td>
                    <td><WorkCell results={l.results} /></td>
                  </tr>
                ))}
              </tbody></table></div>
              {!c.lessons.length && <p className="small muted">Chưa có bài học được xuất bản trong khoá học này.</p>}
              <div className="row"><Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}`}>Mở lộ trình</Link></div>
            </div>
          </details>
        ))}</div>
      )}
    </div>
  );
}
