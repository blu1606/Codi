/**
 * Dashboard departure board and focus row. Rows come from the same helpers as the course path page
 * (pathRows, nextDepartures, currentLessonId), so "Học tiếp" and the next departures match what the path shows.
 */
import { Link } from 'react-router-dom';
import { Icon, Progress, Thumb } from '../../components/ui/primitives';
import { currentLessonId, goalLabel } from './learning-store';
import { buildLines, kindIcon, kindLabel, nextDepartures, pathRows } from './path-views';

/** Path rows for a course, or none while the path is being generated or not set up. */
export function courseRows(c, r) {
  return r.pathStatus === 'ready' || r.pathStatus === 'failed' ? pathRows(c, r) : [];
}

/**
 * Departures across the learner's active courses. The course in progress (leadId) contributes its next three
 * departures, as on the path page; other courses contribute their next one. Capped at six rows.
 */
export function buildDepartures(active, leadId) {
  const out = [];
  active.forEach(({ c, r }) => {
    const rows = courseRows(c, r);
    if (!rows.length) return;
    const lines = buildLines(c, rows);
    const lineOf = new Map(lines.flatMap((line) => line.stations.map((s) => [s.row.id, line])));
    const cur = currentLessonId(c, r);
    const count = c.id === leadId ? 3 : 1;
    nextDepartures(rows, count).forEach((row) => {
      out.push({ c, row, line: lineOf.get(row.id) || null, number: rows.indexOf(row) + 1, isCur: row.id === cur });
    });
  });
  return out.slice(0, 6);
}

export function DashFocus({ focus }) {
  const { c, r, status, row, number, complete, done, total, pct } = focus;
  if (complete) {
    return (
      <section className="db-focus db-focus-done" aria-labelledby="db-focus-h">
        <div className="db-focus-body">
          <h2 id="db-focus-h" className="db-focus-lesson">Bạn đã hoàn thành các khoá học đã mua</h2>
          <p className="small muted">Xem lại kết quả và tiến độ của mình.</p>
        </div>
        <div className="db-focus-actions"><Link className="btn btn-secondary" to="/progress">Tiến độ & kết quả</Link></div>
      </section>
    );
  }
  let note = null;
  let action;
  if (status === 'none') {
    note = 'Bước tiếp theo: đặt mục tiêu và làm bài kiểm tra đầu vào.';
    action = <Link className="btn btn-primary btn-lg" to={`/learn/${c.id}/onboarding`}>Bắt đầu thiết lập</Link>;
  } else if (!row) {
    note = status === 'generating' ? 'Codi đang chuẩn bị lộ trình của bạn.' : 'Lộ trình cần được kiểm tra lại.';
    action = <Link className="btn btn-primary btn-lg" to={`/learn/${c.id}`}>Mở lộ trình</Link>;
  } else {
    action = <Link className="btn btn-primary btn-lg db-focus-cta" to={`/learn/${c.id}/${row.id}`}>Học tiếp<Icon name="arrow-right" /></Link>;
  }
  return (
    <section className="db-focus" aria-labelledby="db-focus-h">
      <Thumb course={c} small />
      <div className="db-focus-body">
        {row ? (
          <>
            <h2 id="db-focus-h" className="db-focus-lesson">{row.title}</h2>
            <p className="db-focus-meta small muted">
              <span>{c.title}</span><span aria-hidden="true">·</span>
              <span>Bài <span className="db-mono">{number}</span></span><span aria-hidden="true">·</span>
              <span className="db-meta-row"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span><span aria-hidden="true">·</span>
              <span><span className="db-mono">{Math.round(row.durationMin || 0)}</span> phút</span>
            </p>
          </>
        ) : <><h2 id="db-focus-h" className="db-focus-lesson">{c.title}</h2><p className="db-focus-lesson-plain">{note}</p></>}
        {status !== 'none' && (
          <div className="db-focus-progress">
            <Progress pct={pct} label={`Tiến độ khoá ${c.title}`} />
            <span className="small muted"><span className="db-mono">{done}/{total}</span> bài đã học · {goalLabel(r.goal)}</span>
          </div>
        )}
      </div>
      <div className="db-focus-actions">
        {action}
        {status !== 'none' && <Link className="btn btn-ghost" to={`/learn/${c.id}`}>Xem lộ trình</Link>}
      </div>
    </section>
  );
}

export function DashBoard({ departures, leadId }) {
  return (
    <section className="db-board" aria-labelledby="db-board-h">
      <header className="db-board-head">
        <h2 id="db-board-h" className="db-h2">Chuyến tiếp theo</h2>
        <span className="db-board-note small">Các bài sắp học của bạn</span>
      </header>
      {departures.length ? (
        <ol className="db-dep">{departures.map(({ c, row, line, number, isCur }) => (
          <li key={c.id + row.id} className={`db-dep-item${isCur ? ' is-current' : ''}${c.id === leadId ? ' is-lead' : ''}`}>
            {line
              ? <span className={`db-line db-line-${line.slot}`}><span className="sr-only">Chương {line.no}</span><span aria-hidden="true">{line.no}</span></span>
              : <span aria-hidden="true" className="db-line" />}
            <div className="db-dep-body">
              <p className="db-dep-title"><Link to={`/learn/${c.id}/${row.id}`}><span className="sr-only">Bài {number}: </span>{row.title}</Link></p>
              <p className="db-dep-course small">{c.title}{line && <> · Chương {line.no}: {row.chapterTitle}</>}</p>
              <p className="db-dep-meta small">
                <span>Bài <span className="db-mono">{number}</span></span>
                <span className="db-meta-row"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span>
                {isCur && <span className="db-here">Bạn đang ở đây</span>}
                {row.status === 'skippable' && <span>Có thể bỏ qua</span>}
              </p>
            </div>
            <span className="db-dep-min"><span className="db-mono">{Math.round(row.durationMin || 0)}</span><span className="db-unit"> phút</span></span>
          </li>
        ))}</ol>
      ) : <p className="db-empty small">Chưa có chuyến nào. Thiết lập lộ trình để xem các bài sắp học.</p>}
      <p className="db-note xsmall"><Icon name="sparkles" className="icon-sm" /><span>Thứ tự theo lộ trình của từng khoá, luôn tôn trọng bài học tiên quyết.</span></p>
    </section>
  );
}
