/**
 * Codi.teachCode — lecturer side of coding practice. Port of docs/mockup/js/lecturer-coding.js (namespace part).
 *
 * Public API (Codi.teachCode):
 *   analytics(course) → ReactElement   "Bài code" tab in Tiến độ học viên: per coding lesson, learners who tried,
 *                                      pass/completion rate, average submits, most-failed test, solution views.
 *
 * The editor routes '/teach/courses/:courseId/code/:lessonId' and '…/preview' live in ./code-editor-page.jsx.
 */
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';

function analytics(c) {
  const lessons = Codi.lessons(c).filter((l) => l.code);
  const isLearner = (id) => { const u = Codi.user(id); return !!u && u.role === 'learner'; };
  const all = (Codi.db().codeAttempts || []).filter((a) => a.courseId === c.id && isLearner(a.userId));
  const rows = lessons.map((l) => {
    const at = all.filter((a) => a.lessonId === l.id);
    if (l.code.kind === 'tutorial') {
      const last = l.code.steps.length - 1;
      const done = at.filter((a) => (a.tutorialVisited || []).includes(last)).length;
      return { l, n: at.length, rate: at.length ? Math.round((done / at.length) * 100) : null, avgSubmits: null, viewed: at.filter((a) => a.solutionViewed).length, worst: null, avgStep: at.length ? (at.reduce((s, a) => s + (a.tutorialStep || 0) + 1, 0) / at.length).toFixed(1) : null };
    }
    const submitted = at.filter((a) => a.submits > 0);
    const fails = {};
    at.forEach((a) => Object.keys(a.failedTests || {}).forEach((k) => { fails[k] = (fails[k] || 0) + a.failedTests[k]; }));
    const worstId = Object.keys(fails).sort((a, b) => fails[b] - fails[a])[0];
    const worstTest = worstId ? l.code.tests.find((t) => t.id === worstId) : null;
    return { l, n: at.length, rate: at.length ? Math.round((at.filter((a) => a.passed).length / at.length) * 100) : null, avgSubmits: submitted.length ? (submitted.reduce((s, a) => s + a.submits, 0) / submitted.length).toFixed(1) : null, viewed: at.filter((a) => a.solutionViewed).length, worst: worstTest ? { t: worstTest, count: fails[worstId] } : null };
  });
  return (
    <div className="stack-3">
      <p className="small muted">Số liệu từ mọi lượt làm bài code của học viên. Tỉ lệ đạt dưới 60% hoặc một test bị sai nhiều lần là dấu hiệu nên xem lại đề bài hoặc thêm gợi ý.</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Bài</th><th className="num">Học viên làm</th><th className="num">Tỉ lệ đạt / hoàn thành</th><th className="num">Số lần nộp TB</th><th>Test sai nhiều nhất</th><th className="num">Xem lời giải</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.l.id}>
            <td><div className="stack-1"><span className="small strong">{r.l.title}</span><span className="xsmall muted">{r.l.code.kind === 'tutorial' ? `Hướng dẫn · bước TB đạt tới: ${r.avgStep || '—'}` : `Bài code · ${r.l.code.tests.length} test`}</span></div></td>
            <td className="num">{r.n}</td>
            <td className="num"><span className="od-nowrap">{r.rate === null ? '—' : r.rate + '%'}</span>{r.rate !== null && r.rate < 60 ? <> <span className="badge badge-warn"><Icon name="alert-triangle" />Cần xem lại</span></> : null}</td>
            <td className="num">{r.avgSubmits || '—'}</td>
            <td className="small">{r.worst ? <span className="stack-1"><span>{r.worst.t.name}{r.worst.t.hidden ? ' (ẩn)' : ''}</span><span className="xsmall muted">Sai {r.worst.count} lần · bước {(r.worst.t.step || 0) + 1}</span></span> : '—'}</td>
            <td className="num">{r.viewed}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="row"><Link className="btn btn-secondary btn-sm" to={`/teach/courses/${c.id}/content`}><Icon name="code" className="icon-sm" /> Sửa bài code trong nội dung khoá học</Link></div>
    </div>
  );
}

Object.assign(Codi, { teachCode: { ...(Codi.teachCode || {}), analytics } });
