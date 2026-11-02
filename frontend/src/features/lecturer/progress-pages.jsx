// S29 learner progress: course picker and per-course drill-down on Codi's progress/actions.ts
// (getLecturerCoursesProgress, getCourseLearnerProgress): completion % = round(completed / lessons), quiz average =
// mean of the latest graded lesson-quiz percent (entry test excluded, unknown shown as "—"), question accuracy from
// the current quiz questions (< 60% = "Cần xem lại"), hint usage and mastery charts shown as unavailable like the
// real app. The "Bài code" tab (Codi.teachCode.analytics) reads /api/lecturer/courses/:id/code-stats.
// Support signal (port-only): a learner needs support when they have not started, have been inactive for
// INACTIVE_DAYS, average a quiz below LOW_QUIZ, or have an unanswered question in this course.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Avatar, CourseStatus, Empty, Icon, Progress, Ring } from '../../components/ui/primitives';
import { shell, FieldError, Loading, LoadError } from './teach-api';
import { act } from './teach-data';

const { fmt } = Codi;
export const HINT_USAGE_UNAVAILABLE = 'Chưa có dữ liệu gợi ý AI được ghi nhận đáng tin cậy; chưa thể thống kê mức sử dụng. Gợi ý không trừ điểm.';
export const PROGRESS_CHARTS_UNAVAILABLE = 'Biểu đồ mức thành thạo và xu hướng điểm chưa khả dụng trong bản prototype. Tiến độ hoàn thành không phải mức thành thạo.';
const INACTIVE_DAYS = 14;
const LOW_QUIZ = 60;

/** Loads a backend result once per key. */
function useLoad(run, key) {
  const [st, setSt] = useState({ data: null, error: null });
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, error: null }));
    try { setSt({ data: await run(), error: null }); } catch (error) { setSt((x) => ({ ...x, error })); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load };
}

/** Why a learner may be stuck. Reasons are plain Vietnamese so the lecturer can act without a legend. */
function supportRow(l, openQs) {
  const days = l.lastActive ? Math.max(0, Math.floor((Date.now() - new Date(l.lastActive)) / 86400000)) : null;
  const pct = l.progressPercent || 0;
  const avg = l.averageQuizScore == null ? null : Math.round(l.averageQuizScore);
  const mine = openQs.filter((q) => q.authorId === l.userId);
  const reasons = [];
  if (pct === 0) reasons.push('Chưa bắt đầu học');
  else if (pct < 100 && (days === null || days >= INACTIVE_DAYS)) reasons.push(days === null ? 'Chưa có hoạt động' : `Không hoạt động ${days} ngày`);
  if (avg !== null && avg < LOW_QUIZ) reasons.push(`Quiz TB ${avg}%`);
  if (mine.length) reasons.push('Đang chờ trả lời');
  return {
    u: { id: l.userId, name: l.name || 'Học viên', image: l.avatar || null }, pct, avg, days, openQs: mine, reasons,
    completed: l.completedLessonsCount || 0, total: l.totalLessonsCount || 0, lastActive: l.lastActive, lessons: l.lessons || [],
  };
}

export function ProgressIndexPage() {
  useCodi();
  const q = useLoad(() => act('progress', 'getLecturerCoursesProgress'), 'all');
  const head = <div className="page-header"><div><h1>Tiến độ học viên</h1><p className="muted">Chọn khoá học để xem tiến độ và kết quả quiz của học viên.</p></div></div>;
  if (!q.data) return shell('/teach/progress', <>{head}{q.error ? <LoadError error={q.error} onRetry={q.reload} /> : <Loading rows={3} />}</>);
  const courses = q.data;
  return shell('/teach/progress', <>
    {head}
    {courses.length ? <div className="grid-2">{courses.map((c) => (
      <Link key={c.courseId} className="card card-link" to={`/teach/progress/${c.courseId}`}><div className="card-body stack-3">
        <div className="row-between" style={{ alignItems: 'flex-start' }}><strong className="od-clamp-2">{c.title}</strong><CourseStatus status={c.status} /></div>
        <span className="row small muted" style={{ gap: 6 }}><Icon name="users" className="icon-sm" /> {c.learnersCount} học viên · Hoàn thành TB {Math.round(c.averageCompletionRate || 0)}%</span>
        <span className="row small strong text-accent" style={{ gap: 4 }}>Xem chi tiết tiến độ <Icon name="arrow-right" className="icon-sm" /></span></div></Link>
    ))}</div>
      : <div className="card"><Empty icon="bar-chart" title="Chưa có khoá học đang bán" body="Tiến độ học viên xuất hiện khi khoá học được xuất bản và có người học." /></div>}
  </>);
}

function openLearner(r) {
  Codi.ui.sheet({
    title: r.u.name || 'Chi tiết học viên',
    body: (
      <div className="stack-4">
        <p className="small muted">Chi tiết tiến độ học tập và bài làm của học viên</p>
        {r.reasons.length > 0 && <Alert type="warn" title="Vì sao cần hỗ trợ" body={r.reasons.join(' · ')} />}
        <div className="panel row"><Ring pct={r.pct} size={76} /><div className="stack-1"><strong className="small">{r.completed}/{r.total} bài hoàn thành</strong><span className="xsmall muted">Quiz trung bình: {r.avg === null ? 'chưa có' : r.avg + '%'}</span></div></div>
        <div className="stack-1 xsmall muted" role="status"><p>{HINT_USAGE_UNAVAILABLE}</p><p>{PROGRESS_CHARTS_UNAVAILABLE}</p></div>
        <div className="stack-2"><strong className="xsmall muted">Tiến độ theo bài học ({r.lessons.length})</strong>
          <ul className="list">{r.lessons.map((l) => {
            const sub = l.assignmentSubmission;
            return <li key={l.id} className="list-row" style={{ paddingInline: 0 }}><Icon name={l.isCompleted ? 'check-circle' : 'circle'} className={l.isCompleted ? 'text-success' : 'muted'} /><span className="list-main"><span className="small">{l.title}</span><span className="xsmall muted">{l.isCompleted ? 'Hoàn thành' : 'Chưa hoàn thành'}{l.quizScore != null ? ` · Quiz ${Math.round(l.quizScore)}%` : ''}{sub ? ` · Bài tập: ${sub.status === 'graded' && sub.score != null ? `${String(sub.score).replace('.', ',')}${sub.maxScore ? '/' + sub.maxScore : ''}` : 'Chờ chấm'}` : ''}</span></span></li>;
          })}</ul></div>
      </div>
    ),
  });
}

/** In-app notice to one learner (POST /api/lecturer/courses/:id/learners/:userId/message), so the form says so. */
function MessageForm({ c, r, onSent }) {
  const first = (r.u.name || '').split(' ').pop() || 'bạn';
  const [text, setText] = useState(`Chào ${first}, mình thấy bạn đang gặp khó khăn với khoá học “${c.title}”. Bạn đang vướng ở phần nào để mình hỗ trợ?`);
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (text.trim().length < 10) { setErr('Tin nhắn cần ít nhất 10 ký tự.'); return; }
    setSending(true);
    try {
      await api.post(`/api/lecturer/courses/${encodeURIComponent(c.id)}/learners/${encodeURIComponent(r.u.id)}/message`, { text: text.trim() });
    } catch (ex) {
      setSending(false); setErr(ex.message || 'Không gửi được tin nhắn.'); return;
    }
    setSending(false);
    Codi.ui.toast(`Đã gửi tin nhắn cho ${r.u.name}.`, { type: 'success' });
    onSent();
  };
  return (
    <form className="stack-3" onSubmit={send} noValidate aria-busy={sending}>
      <p className="small muted">Học viên nhận thông báo trong ứng dụng, kèm đường dẫn tới khoá học. Học viên có thể trả lời trong phần Hỏi đáp.</p>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="pg-msg">Nội dung</label>
        <textarea id="pg-msg" rows={5} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} aria-invalid={!!err} />
        <FieldError>{err}</FieldError></div>
      <div className="row"><button className="btn btn-primary" type="submit" disabled={sending}>{sending ? 'Đang gửi...' : 'Gửi tin nhắn'}</button></div>
    </form>
  );
}
function openMessage(c, r) {
  const handle = Codi.ui.sheet({ title: `Nhắn ${r.u.name}`, body: <MessageForm c={c} r={r} onSent={() => handle.close()} /> });
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
  const [stuckOnly, setStuckOnly] = useState(false);
  const q = useLoad(async () => {
    const [prog, qs, codes] = await Promise.all([
      act('progress', 'getCourseLearnerProgress', params.courseId),
      act('questions', 'getLecturerQuestionsData', { view: 'questions', status: 'unanswered' }).catch(() => null),
      api.get(`/api/lecturer/courses/${encodeURIComponent(params.courseId)}/code-stats`).catch(() => ({ rows: [] })),
    ]);
    return { prog, openQs: ((qs && qs.questions) || []).filter((x) => x.courseId === params.courseId), codes: codes.rows || [] };
  }, params.courseId);
  if (!q.data) {
    if (q.error && (q.error.status === 403 || q.error.status === 404 || /Không tìm thấy/.test(q.error.message || ''))) return <MissingCourse />;
    return shell('/teach/progress', q.error ? <LoadError error={q.error} onRetry={q.reload} /> : <Loading rows={5} />);
  }
  const p = q.data.prog;
  if (!p) return <MissingCourse />;
  const c = { id: p.courseId, title: p.courseTitle, codeStats: q.data.codes };
  const hasCode = c.codeStats.length > 0;
  const tab = query.tab === 'quiz' ? 'quiz' : query.tab === 'code' && hasCode ? 'code' : 'learners';
  const rows = (p.learners || []).map((l) => supportRow(l, q.data.openQs));
  const stuckCount = rows.filter((r) => r.reasons.length).length;
  const qStats = p.quizQuestions || [];
  const needle = search.trim().toLowerCase();
  const scoped = stuckOnly ? rows.filter((r) => r.reasons.length) : rows;
  const shown = needle ? scoped.filter((r) => (r.u.name || '').toLowerCase().includes(needle)) : scoped;
  const avgQuiz = p.averageQuizScore == null ? null : Math.round(p.averageQuizScore);
  let body;
  if (tab === 'code') body = Codi.teachCode && Codi.teachCode.analytics ? Codi.teachCode.analytics(c) : <Alert type="info" title="Thống kê bài code chưa sẵn sàng." />;
  else if (tab === 'learners') {
    body = !rows.length ? <div className="card"><Empty icon="users" title="Chưa có học viên" body="Khi có người mua khoá học, tiến độ của họ sẽ hiển thị ở đây." /></div> : <div className="stack-3">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="field" style={{ maxWidth: 320 }}><label className="sr-only" htmlFor="pg-search">Tìm theo tên học viên</label><input id="pg-search" type="search" placeholder="Tìm theo tên học viên..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button type="button" className={`btn btn-sm ${stuckOnly ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={stuckOnly} onClick={() => setStuckOnly((v) => !v)}>
          <Icon name="alert-triangle" className="icon-sm" /> Cần hỗ trợ ({stuckCount})
        </button>
      </div>
      {shown.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Học viên</th><th scope="col">Tiến độ</th><th scope="col" className="num">Bài hoàn thành</th><th scope="col" className="num">Quiz TB</th><th scope="col">Hoạt động gần nhất</th><th scope="col">Tình trạng</th><th scope="col" className="num">Thao tác</th></tr></thead><tbody>
        {shown.map((r) => (
          <tr key={r.u.id}><td><div className="row"><Avatar user={r.u} size="sm" /><span>{r.u.name}</span></div></td><td style={{ minWidth: 140 }}><div className="row tc-prog"><Progress pct={r.pct} /><span className="small num">{r.pct}%</span></div></td><td className="num">{r.completed}/{r.total}</td><td className="num">{r.avg === null ? '—' : r.avg + '%'}</td><td className="od-nowrap">{r.lastActive ? fmt.date(r.lastActive) : '—'}</td>
            <td>{r.reasons.length
              ? <span className="stack-1" style={{ gap: 4 }}>{r.reasons.map((x) => <span key={x} className="badge badge-warn">{x}</span>)}</span>
              : <span className="xsmall muted">Ổn định</span>}</td>
            <td className="num" style={{ minWidth: 230 }}><span className="row od-nowrap" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              {r.openQs.length ? <Link className="btn btn-secondary btn-sm" to={`/teach/questions?status=unanswered&id=${r.openQs[0].id}`}>Trả lời</Link> : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMessage(c, r)}>Nhắn</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLearner(r)}>Xem chi tiết</button>
            </span></td></tr>
        ))}
      </tbody></table></div> : <p className="small muted">{stuckOnly && !needle ? 'Không có học viên nào cần hỗ trợ lúc này.' : 'Không tìm thấy học viên phù hợp.'}</p>}
    </div>;
  } else {
    body = <div className="stack-3">
      <p className="small muted">Câu có tỉ lệ đúng dưới 60% được đánh dấu để bạn xem lại cách giảng hoặc đề bài. Chỉ tính câu hỏi phiên bản hiện tại từ lần nộp đã chấm được chọn; chưa có bằng chứng thì hiển thị “—”.</p>
      {!qStats.length ? <div className="card"><Empty icon="help-circle" title="Chưa có câu hỏi quiz nào" body="Khoá học chưa có bài trắc nghiệm hoặc chưa có câu hỏi nào được tạo." /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Bài học</th><th scope="col">Câu hỏi</th><th scope="col" className="num">Lượt trả lời</th><th scope="col" className="num">Tỉ lệ đúng</th><th scope="col" className="num">Trạng thái</th></tr></thead><tbody>
          {qStats.map((s) => (
            <tr key={s.lessonId + ':' + s.questionId}><td className="small">{s.lessonTitle}</td><td className="small">{s.questionText}</td><td className="num">{s.totalAnswers}</td><td className="num">{s.correctPercent == null || !s.totalAnswers ? '—' : s.correctPercent + '%'}</td>
              <td className="num">{s.correctPercent == null || !s.totalAnswers ? <span className="xsmall muted">Chưa có dữ liệu</span> : s.needsReview ? <span className="badge badge-warn"><Icon name="alert-triangle" />Cần xem lại</span> : <span className="xsmall muted">Bình thường</span>}</td></tr>
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
      <div className="stat-tile"><span className="stat-value">{p.learnersCount}</span><span className="stat-label">Học viên</span></div>
      <div className="stat-tile"><span className="stat-value">{Math.round(p.averageCompletionRate || 0)}%</span><span className="stat-label">Tỉ lệ hoàn thành trung bình</span></div>
      <div className="stat-tile"><span className="stat-value">{avgQuiz === null ? '—' : avgQuiz + '%'}</span><span className="stat-label">Điểm quiz trung bình</span></div>
    </div>
    <div className="tabs" role="tablist"><Link className="tab" role="tab" aria-selected={tab === 'learners'} to={`/teach/progress/${c.id}`}>Học viên{stuckCount ? <> <span className="count count-accent" aria-label={`${stuckCount} học viên cần hỗ trợ`}>{stuckCount}</span></> : null}</Link><Link className="tab" role="tab" aria-selected={tab === 'quiz'} to={`/teach/progress/${c.id}?tab=quiz`}>Kết quả quiz</Link>{hasCode && <Link className="tab" role="tab" aria-selected={tab === 'code'} to={`/teach/progress/${c.id}?tab=code`}>Bài code</Link>}</div>
    {body}
  </>);
}
