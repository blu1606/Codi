// S29 learner progress: course picker and per-course drill-down. Port of the real progress-views.tsx,
// course-progress-client.tsx and lib/lecturer-progress-service.ts: completion % = round(completed / lessons),
// quiz average = mean of the latest graded lesson-quiz percent (entry test excluded, unknown shown as "—"),
// question accuracy from the current quiz questions (< 60% = "Cần xem lại"), hint usage and mastery charts
// shown as unavailable like the real app. Numbers come only from seed data. The "Bài code" tab is port-only.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, CourseStatus, Empty, Icon, Progress, Ring } from '../../components/ui/primitives';
import { shell, isMine, myCourses, ls } from './teach-api';

const { fmt } = Codi;
export const HINT_USAGE_UNAVAILABLE = 'Chưa có dữ liệu gợi ý AI được ghi nhận đáng tin cậy; chưa thể thống kê mức sử dụng. Gợi ý không trừ điểm.';
export const PROGRESS_CHARTS_UNAVAILABLE = 'Biểu đồ mức thành thạo và xu hướng điểm chưa khả dụng trong bản prototype. Tiến độ hoàn thành không phải mức thành thạo.';
const maxIso = (list) => list.filter(Boolean).sort().pop() || null;

function progressRows(c) {
  const lessons = ls(c); const total = lessons.length;
  const ids = new Set(lessons.map((l) => l.id));
  const quizLessons = new Set(lessons.filter((l) => l.quiz).map((l) => l.id));
  const db = Codi.db();
  const enrolled = [...new Set(db.enrolments.filter((e) => e.courseId === c.id).map((e) => e.userId))];
  return enrolled.map((uid) => {
    const p = db.learnerProgress.find((x) => x.userId === uid && x.courseId === c.id) || {};
    const completed = (p.completed || []).filter((id) => ids.has(id));
    const quizScores = Object.fromEntries(Object.entries(p.quizScores || {}).filter(([lid, v]) => quizLessons.has(lid) && Number.isFinite(Number(v))));
    const scores = Object.values(quizScores).map(Number);
    const subs = db.submissions.filter((s) => s.userId === uid && s.courseId === c.id);
    return {
      u: Codi.user(uid) || { id: uid, name: 'Học viên' }, completed, quizScores, answers: p.answers || {}, subs,
      pct: total ? Math.min(100, Math.max(0, Math.round((completed.length / total) * 100))) : 0,
      avg: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      lastActive: maxIso([p.lastActive, ...subs.map((s) => s.submittedAt)]),
    };
  });
}
const courseAvg = (rows) => (rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0);

export function ProgressIndexPage() {
  useCodi();
  const courses = myCourses().filter((c) => ['published', 'hidden'].includes(c.status));
  return shell('/teach/progress', <>
    <div className="page-header"><div><h1>Tiến độ học viên</h1><p className="muted">Chọn khoá học để xem tiến độ và kết quả quiz của học viên.</p></div></div>
    {courses.length ? <div className="grid-2">{courses.map((c) => { const rows = progressRows(c); return (
      <Link key={c.id} className="card card-link" to={`/teach/progress/${c.id}`}><div className="card-body stack-3">
        <div className="row-between" style={{ alignItems: 'flex-start' }}><strong className="od-clamp-2">{c.title}</strong><CourseStatus status={c.status} /></div>
        <span className="row small muted" style={{ gap: 6 }}><Icon name="users" className="icon-sm" /> {rows.length} học viên · Hoàn thành TB {courseAvg(rows)}%</span>
        <span className="row small strong text-accent" style={{ gap: 4 }}>Xem chi tiết tiến độ <Icon name="arrow-right" className="icon-sm" /></span></div></Link>
    ); })}</div>
      : <div className="card"><Empty icon="bar-chart" title="Chưa có khoá học đang bán" body="Tiến độ học viên xuất hiện khi khoá học được xuất bản và có người học." /></div>}
  </>);
}

function openLearner(c, r) {
  const lessons = ls(c);
  Codi.ui.sheet({
    title: r.u.name || 'Chi tiết học viên',
    body: (
      <div className="stack-4">
        <p className="small muted">Chi tiết tiến độ học tập và bài làm của học viên</p>
        <div className="panel row"><Ring pct={r.pct} size={76} /><div className="stack-1"><strong className="small">{r.completed.length}/{lessons.length} bài hoàn thành</strong><span className="xsmall muted">Quiz trung bình: {r.avg === null ? 'chưa có' : r.avg + '%'}</span></div></div>
        <div className="stack-1 xsmall muted" role="status"><p>{HINT_USAGE_UNAVAILABLE}</p><p>{PROGRESS_CHARTS_UNAVAILABLE}</p></div>
        <div className="stack-2"><strong className="xsmall muted">Tiến độ theo bài học ({lessons.length})</strong>
          <ul className="list">{lessons.map((l) => {
            const done = r.completed.includes(l.id); const sc = r.quizScores[l.id];
            const sub = r.subs.filter((s) => s.lessonId === l.id).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
            return <li key={l.id} className="list-row" style={{ paddingInline: 0 }}><Icon name={done ? 'check-circle' : 'circle'} className={done ? 'text-success' : 'muted'} /><span className="list-main"><span className="small">{l.title}</span><span className="xsmall muted">{done ? 'Hoàn thành' : 'Chưa hoàn thành'}{sc !== undefined ? ` · Quiz ${sc}%` : ''}{sub ? ` · Bài tập: ${sub.status === 'graded' ? `${String(sub.score).replace('.', ',')}/${sub.maxScore}` : 'Chờ chấm'}` : ''}</span></span></li>;
          })}</ul></div>
      </div>
    ),
  });
}

function MissingCourse() {
  return shell('/teach/progress', <div className="stack-4">
    <Link className="small" to="/teach/progress"><Icon name="arrow-left" className="icon-sm" /> Tất cả khoá học</Link>
    <div className="card"><Empty icon="book-open" title="Khoá học không tồn tại" body="Không tìm thấy thông tin khoá học hoặc bạn không có quyền xem tiến độ của khoá này." actions={<Link className="btn btn-secondary" to="/teach/progress">Quay lại danh sách</Link>} /></div>
  </div>);
}

export function CourseProgressPage({ params, query }) {
  useCodi();
  const [search, setSearch] = useState('');
  const c = Codi.course(params.courseId);
  if (!isMine(c)) return <MissingCourse />;
  const hasCode = ls(c).some((l) => l.code);
  const tab = query.tab === 'quiz' ? 'quiz' : query.tab === 'code' && hasCode ? 'code' : 'learners';
  const rows = progressRows(c);
  const quizAvgs = rows.filter((r) => r.avg !== null);
  const avgQuiz = quizAvgs.length ? Math.round(quizAvgs.reduce((s, r) => s + r.avg, 0) / quizAvgs.length) : null;
  const questions = ls(c).filter((l) => l.quiz).flatMap((l) => l.quiz.questions.map((qq) => ({ l, qq })));
  const qStats = questions.map(({ l, qq }) => { const ans = rows.map((r) => r.answers[qq.id]).filter((x) => x !== undefined); const pct = ans.length ? Math.round((ans.filter(Boolean).length / ans.length) * 100) : null; return { l, qq, n: ans.length, pct }; });
  const needle = search.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => (r.u.name || '').toLowerCase().includes(needle)) : rows;
  let body;
  if (tab === 'code') body = Codi.teachCode && Codi.teachCode.analytics ? Codi.teachCode.analytics(c) : <Alert type="info" title="Thống kê bài code chưa sẵn sàng." />;
  else if (tab === 'learners') {
    body = !rows.length ? <div className="card"><Empty icon="users" title="Chưa có học viên" body="Khi có người mua khoá học, tiến độ của họ sẽ hiển thị ở đây." /></div> : <div className="stack-3">
      <div className="field" style={{ maxWidth: 320 }}><label className="sr-only" htmlFor="pg-search">Tìm theo tên học viên</label><input id="pg-search" type="search" placeholder="Tìm theo tên học viên..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {shown.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Học viên</th><th scope="col">Tiến độ</th><th scope="col" className="num">Bài hoàn thành</th><th scope="col" className="num">Quiz TB</th><th scope="col" className="num">Gợi ý dùng</th><th scope="col">Hoạt động gần nhất</th><th scope="col" className="num">Thao tác</th></tr></thead><tbody>
        {shown.map((r) => (
          <tr key={r.u.id}><td><div className="row"><Avatar user={r.u} size="sm" /><span>{r.u.name}</span></div></td><td style={{ minWidth: 140 }}><div className="row tc-prog"><Progress pct={r.pct} /><span className="small num">{r.pct}%</span></div></td><td className="num">{r.completed.length}/{ls(c).length}</td><td className="num">{r.avg === null ? '—' : r.avg + '%'}</td><td className="num muted"><span title={HINT_USAGE_UNAVAILABLE}>Chưa ghi nhận</span></td><td className="od-nowrap">{r.lastActive ? fmt.date(r.lastActive) : '—'}</td><td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => openLearner(c, r)}>Xem chi tiết</button></td></tr>
        ))}
      </tbody></table></div> : <p className="small muted">Không tìm thấy học viên phù hợp.</p>}
    </div>;
  } else {
    body = <div className="stack-3">
      <p className="small muted">Câu có tỉ lệ đúng dưới 60% được đánh dấu để bạn xem lại cách giảng hoặc đề bài. Chỉ tính câu hỏi phiên bản hiện tại từ lần nộp đã chấm được chọn; chưa có bằng chứng thì hiển thị “—”.</p>
      {!qStats.length ? <div className="card"><Empty icon="help-circle" title="Chưa có câu hỏi quiz nào" body="Khoá học chưa có bài trắc nghiệm hoặc chưa có câu hỏi nào được tạo." /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Bài học</th><th scope="col">Câu hỏi</th><th scope="col" className="num">Lượt trả lời</th><th scope="col" className="num">Tỉ lệ đúng</th><th scope="col" className="num">Trạng thái</th></tr></thead><tbody>
          {qStats.map((s) => (
            <tr key={s.l.id + s.qq.id}><td className="small">{s.l.title}</td><td className="small">{s.qq.text}</td><td className="num">{s.n}</td><td className="num">{s.pct === null ? '—' : s.pct + '%'}</td>
              <td className="num">{s.pct === null ? <span className="xsmall muted">Chưa có dữ liệu</span> : s.pct < 60 ? <span className="badge badge-warn"><Icon name="alert-triangle" />Cần xem lại</span> : <span className="xsmall muted">Bình thường</span>}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div>;
  }
  return shell('/teach/progress', <>
    <div className="stack-2" style={{ marginBottom: 16 }}><Link className="small" to="/teach/progress"><Icon name="arrow-left" className="icon-sm" /> Tất cả khoá học</Link><h1>{c.title}</h1></div>
    <div className="panel stack-1 small muted" role="status" style={{ marginBottom: 16 }}><p>{PROGRESS_CHARTS_UNAVAILABLE}</p><p>{HINT_USAGE_UNAVAILABLE}</p>
      <p>Quiz TB chỉ tính phần trăm đã lưu của lần nộp đã chấm gần nhất theo từng bài; không gồm bài kiểm tra đầu vào. Thiếu phần trăm lịch sử được hiển thị “—”, không quy đổi từ điểm cũ.</p></div>
    <div className="grid-3" style={{ marginBottom: 24 }}>
      <div className="stat-tile"><span className="stat-value">{rows.length}</span><span className="stat-label">Học viên</span></div>
      <div className="stat-tile"><span className="stat-value">{courseAvg(rows)}%</span><span className="stat-label">Tỉ lệ hoàn thành trung bình</span></div>
      <div className="stat-tile"><span className="stat-value">{avgQuiz === null ? '—' : avgQuiz + '%'}</span><span className="stat-label">Điểm quiz trung bình</span></div>
    </div>
    <div className="tabs" role="tablist"><Link className="tab" role="tab" aria-selected={tab === 'learners'} to={`/teach/progress/${c.id}`}>Học viên</Link><Link className="tab" role="tab" aria-selected={tab === 'quiz'} to={`/teach/progress/${c.id}?tab=quiz`}>Kết quả quiz</Link>{hasCode && <Link className="tab" role="tab" aria-selected={tab === 'code'} to={`/teach/progress/${c.id}?tab=code`}>Bài code</Link>}</div>
    {body}
  </>);
}
