/** S10 Personal path / course home ('/learn/:courseId'), port of real app/learn/[courseId]/course-home.tsx. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Progress } from '../../components/ui/primitives';
import { currentLessonId, genPending, generatePath, goalLabel, isCourseComplete, rec, save, uid } from './learning-store';
import { CompletionCard, DiagCard, OfferCard, UpdateNotice, courseGuard, openReview, showDiagCard } from './learning-shared';
import { LessonPath, PathSummary, pathRows } from './path-views';
import { KnowledgeMap } from './insights-pages';

export async function editGoal(courseId) {
  const res = await Codi.ui.confirm({ title: 'Chỉnh mục tiêu học tập?', consequence: 'Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại mục tiêu bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu', cancelLabel: 'Để sau' });
  if (!res.ok) return;
  const r = rec(courseId);
  if (!r.goalEditing) { r.goalEditing = true; r.goalStep = 0; r.goalDraft = { ...r.goal }; }
  save(false); Codi.go('/learn/' + courseId + '/onboarding');
}

export default function PathPage({ params, query }) {
  useCodi();
  const c = Codi.course(params.courseId);
  const enrolled = !!c && Codi.isEnrolled(c.id);
  const r = enrolled ? rec(c.id) : null;
  const status = r ? r.pathStatus : null;
  const [tab, setTab] = useState(query && query.tab === 'map' ? 'map' : 'path');
  const [shown, setShown] = useState([]);

  // Resume a generation interrupted by a reload (the timer lives in this tab only).
  useEffect(() => {
    if (c && status === 'generating' && !genPending.has(c.id)) generatePath(c.id);
  }, [c, status]);
  // Highlights show once (real ack-highlights): kept for this visit, cleared from the record.
  useEffect(() => {
    if (r && r.highlight.length) { setShown(r.highlight.slice()); r.highlight = []; save(false); }
  });
  const highlight = r && r.highlight.length ? r.highlight.slice() : shown;

  const guard = courseGuard(c);
  if (guard) return guard;

  if (r.pathStatus === 'none') {
    return (
      <div className="page page-narrow stack-4"><h1>{c.title}</h1><div className="card">
        <Empty icon="route" title="Hãy thiết lập lộ trình học của bạn" body="Đặt mục tiêu và chọn học từ bài 1 hoặc tìm điểm bắt đầu phù hợp với bạn." actions={<Link className="btn btn-primary" to={`/learn/${c.id}/onboarding`}>Bắt đầu thiết lập</Link>} />
      </div></div>
    );
  }
  if (r.pathStatus === 'generating') {
    return (
      <div className="page page-narrow stack-4"><h1>{c.title}</h1>
        <div className="card"><div className="card-body stack-4" role="status" aria-live="polite">
          <p className="row strong"><Icon name="loader" className="ln-spin" /> Codi đang xếp lộ trình cho bạn…</p>
          <ol className="ln-gen-steps"><li>Phân tích kết quả bài kiểm tra đầu vào</li><li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li><li>Ước lượng thời gian theo mục tiêu của bạn</li></ol>
          <p className="small muted">Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.</p>
        </div></div></div>
    );
  }
  const cur = currentLessonId(c, r);
  const prog = Codi.courseProgress(c.id);
  const complete = isCourseComplete(c, r);
  const curLesson = cur ? Codi.lesson(c, cur) : null;
  const reviewed = Codi.db().reviews.some((x) => x.courseId === c.id && x.userId === uid());
  const retry = () => { generatePath(c.id); save(); };
  const rows = pathRows(c, { ...r, highlight });

  return (
    <div className="page stack-6">
      <nav className="small muted" aria-label="Đường dẫn"><Link to="/dashboard">Bàn làm việc</Link> / <span aria-current="page">{c.title}</span></nav>
      <header className="card"><div className="card-body ln-path-head">
        <div className="stack-3 od-fill"><h1>{c.title}</h1>
          <p className="small muted">Mục tiêu: <strong className="ln-fg">{goalLabel(r.goal)}</strong>{r.goal && r.goal.hours ? ` · ${r.goal.hours} giờ/tuần` : ''} <button type="button" className="btn-link small" onClick={() => editGoal(c.id)}>Chỉnh mục tiêu</button></p>
          <div className="row" style={{ gap: 12 }}><span className="od-fill"><Progress pct={prog.pct} label="Tiến độ khoá học" /></span><span className="small od-nowrap">{prog.done}/{prog.total} bài · {prog.pct}%</span></div>
        </div>
        <div className="stack-2 ln-path-cta">
          {curLesson && !complete && <><Link className="btn btn-primary btn-lg" to={`/learn/${c.id}/${curLesson.id}`}>Học tiếp</Link><span className="xsmall muted od-truncate">{curLesson.title}</span></>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview(c.id, 0)}>{reviewed ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button>
        </div>
      </div></header>
      {r.pathStatus === 'failed' && (
        <Alert type="warn" title="Lộ trình cá nhân hoá chưa sẵn sàng" body="AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc định của khoá học."
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
      )}
      {showDiagCard(r) && <DiagCard c={c} />}
      <UpdateNotice c={c} r={r} inPlayer={false} />
      <OfferCard c={c} r={r} />
      {complete && <CompletionCard c={c} />}
      <div className="tabs ln-tabs" role="tablist" aria-label="Nội dung khoá học">
        <button type="button" className="tab" role="tab" id="tab-path" aria-controls="panel-path" aria-selected={tab === 'path'} onClick={() => setTab('path')}><Icon name="book-open" className="icon-sm" /> Lộ trình của bạn</button>
        <button type="button" className="tab" role="tab" id="tab-map" aria-controls="panel-map" aria-selected={tab === 'map'} onClick={() => setTab('map')}><Icon name="map" className="icon-sm" /> Bản đồ kiến thức</button>
      </div>
      {tab === 'map' ? (
        <div role="tabpanel" id="panel-map" aria-labelledby="tab-map"><KnowledgeMap initialCourseId={c.id} embedded /></div>
      ) : (
        <div role="tabpanel" id="panel-path" aria-labelledby="tab-path" className="stack-6">
          <PathSummary c={c} r={{ ...r, highlight }} rows={rows} />
          <LessonPath c={c} r={{ ...r, highlight }} rows={rows} />
        </div>
      )}
    </div>
  );
}
