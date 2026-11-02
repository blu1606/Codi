/**
 * Codi.teachCode — lecturer side of coding practice. Port of docs/mockup/js/lecturer-coding.js (namespace part).
 *
 * Public API (Codi.teachCode):
 *   analytics(course) → ReactElement   "Bài code" tab in Tiến độ học viên. course = { id, codeStats[] } where
 *                                      codeStats comes from GET /api/lecturer/courses/:id/code-stats (per coding
 *                                      lesson: learners who tried, pass/completion rate, average submits, most-failed
 *                                      test, solution views, average tutorial step).
 *
 * The editor routes '/teach/courses/:courseId/code/:lessonId' and '…/preview' live in ./code-editor-page.jsx.
 */
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';

const dec = (n) => (n == null ? null : String(n).replace('.', ','));

function analytics(c) {
  const rows = c.codeStats || [];
  return (
    <div className="stack-3">
      <p className="small muted">Số liệu từ mọi lượt làm bài code của học viên. Tỉ lệ đạt dưới 60% hoặc một test bị sai nhiều lần là dấu hiệu nên xem lại đề bài hoặc thêm gợi ý.</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Bài</th><th className="num">Học viên làm</th><th className="num">Tỉ lệ đạt / hoàn thành</th><th className="num">Số lần nộp TB</th><th>Test sai nhiều nhất</th><th className="num">Xem lời giải</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.lessonId}>
            <td><div className="stack-1"><span className="small strong">{r.title}</span><span className="xsmall muted">{r.kind === 'tutorial' ? `Hướng dẫn · bước TB đạt tới: ${dec(r.avgStep) || '—'}` : `Bài code · ${r.tests} test`}</span></div></td>
            <td className="num">{r.n}</td>
            <td className="num"><span className="od-nowrap">{r.rate === null ? '—' : r.rate + '%'}</span>{r.rate !== null && r.rate < 60 ? <> <span className="badge badge-warn"><Icon name="alert-triangle" />Cần xem lại</span></> : null}</td>
            <td className="num">{dec(r.avgSubmits) || '—'}</td>
            <td className="small">{r.worst ? <span className="stack-1"><span>{r.worst.name}{r.worst.hidden ? ' (ẩn)' : ''}</span><span className="xsmall muted">Sai {r.worst.count} lần</span></span> : '—'}</td>
            <td className="num">{r.viewed}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="row"><Link className="btn btn-secondary btn-sm" to={`/teach/courses/${c.id}/content`}><Icon name="code" className="icon-sm" /> Sửa bài code trong nội dung khoá học</Link></div>
    </div>
  );
}

Object.assign(Codi, { teachCode: { ...(Codi.teachCode || {}), analytics } });
