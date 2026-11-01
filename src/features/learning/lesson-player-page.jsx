/**
 * S11 Lesson player ('/learn/:courseId/:lessonId') + S11b Hỏi đáp panel (port of real
 * app/learn/[courseId]/[lessonId]/lesson-player.tsx). The AI trợ lý panel is Codi.tutor and the coding view is
 * Codi.code (coding feature); their call sites and arguments are unchanged.
 *
 * Layout: course sidebar, lesson nav (prev/next, "Xem lộ trình" map sheet, Hỏi đáp), task stepper, content,
 * assessments, checklist. Focused time on this page is credited to the learner's study days (study-time.js).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon, Progress } from '../../components/ui/primitives';
import {
  TYPE_LABEL, checklist, completeLesson, currentLessonId, isCourseComplete, lessonStatus, lockInfo, materialsOf, orderOf,
  persistNow, rec, save, syncCodeEvidence, uid,
} from './learning-store';
import { CompletionCard, OfferCard, UpdateNotice, courseGuard, openReview } from './learning-shared';
import { MaterialView, markStudied } from './lesson-materials';
import { AssignmentSection, QuizSection } from './lesson-assessments';
import LessonMarkdown from './lesson-markdown';
import { LecturerConversation } from './lecturer-conversation';
import { PathMap, PrerequisiteAdvice, pathRows } from './path-views';
import { useStudyHeartbeat } from './study-time';

const taskAnchor = (item) => (item.key === 'study' ? 'lesson-task-study' : `lesson-task-${item.key}`);

// ───────────────────────── sidebar (also the "Danh sách bài học" sheet) ─────────────────────────
// inSheet: picking a lesson closes the sheet (data-close) so it never stays open over the next lesson.
function SidebarList({ courseId, activeId, inSheet }) {
  useCodi();
  const c = Codi.course(courseId);
  useEffect(() => {
    if (!inSheet) return;
    const a = document.querySelector('.sheet .ln-side-item.is-active');
    if (a) { a.scrollIntoView({ block: 'center' }); a.focus(); }
  }, [inSheet]);
  if (!c) return null;
  const r = rec(c.id);
  const order = orderOf(c, r); const cur = currentLessonId(c, r);
  return (
    <ol className="list ln-side-list">{order.map((id, i) => {
      const l = Codi.lesson(c, id);
      if (!l) return null;
      const st = lessonStatus(c, r, l, cur);
      const lock = st !== 'done' ? lockInfo(c, r, l) : null;
      const kind = l.code ? (l.code.kind === 'tutorial' ? 'tutorial' : 'code') : l.type;
      return (
        <li key={id}><Link to={`/learn/${c.id}/${id}`} className={`ln-side-item ${id === activeId ? 'is-active' : ''}`} aria-current={id === activeId ? 'page' : undefined} data-close={inSheet ? '' : undefined}>
          <span className="ln-side-check">{st === 'done' ? <Icon name="check-circle" className="icon-sm text-success" /> : st === 'locked' ? <Icon name="info" className="icon-sm text-warn" /> : <span className="xsmall">{i + 1}.</span>}</span>
          <span className="od-fill stack-1"><span className="small">{l.title}</span><span className="xsmall muted">{TYPE_LABEL[kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(l.durationMin)}{st === 'skippable' ? ' · có thể bỏ qua' : ''}</span>
            {lock && <span className="xsmall muted">Nên học trước: {lock.concept}</span>}
            <span className="sr-only">{st === 'done' ? 'Đã học' : st === 'locked' ? 'Chưa đủ tiên quyết' : ''}</span></span></Link></li>
      );
    })}</ol>
  );
}

// ───────────────────────── S11b Hỏi đáp panel ─────────────────────────
function QaBody({ courseId, lessonId }) {
  useCodi();
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const l = Codi.lesson(Codi.course(courseId), lessonId);
  if (!l) return null;
  const qs = Codi.db().questions.filter((q) => q.lessonId === l.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const post = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = text.trim();
    if (t.length < 10) { setErr('Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'); return; }
    setErr(null); setBusy(true);
    const q = { id: Codi.uid('qa'), courseId, lessonId, userId: uid(), text: t, createdAt: new Date().toISOString(), status: 'unanswered', replies: [] };
    Codi.set((st) => { st.db.questions.push(q); });
    const ok = await persistNow();
    setBusy(false);
    if (!ok) {
      Codi.set((st) => { st.db.questions = st.db.questions.filter((x) => x.id !== q.id); });
      setErr('Đã có lỗi xảy ra khi gửi câu hỏi.');
      return;
    }
    setText('');
    Codi.ui.toast('Đã gửi câu hỏi. Bạn sẽ nhận thông báo khi giảng viên trả lời.', { type: 'success' });
  };
  return (
    <div className="stack-4">
      <form className={`stack-2 field ${err ? 'is-invalid' : ''}`} noValidate onSubmit={post}><label htmlFor="qa-text">Câu hỏi của bạn về bài &ldquo;{l.title}&rdquo;</label>
        <textarea id="qa-text" name="text" rows={3} placeholder="Mô tả chỗ bạn chưa hiểu, kèm đoạn mã nếu có..." value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        {err ? <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{err}</span></p> : <span className="field-help">Giảng viên và học viên cùng khoá đều xem được câu hỏi.</span>}
        <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy || undefined}>Gửi câu hỏi</button></form>
      {qs.length ? (
        <ul className="list stack-3">{qs.map((q) => {
          const u = Codi.user(q.userId) || { name: 'Học viên' };
          return (
            <li key={q.id} className="panel stack-2">
              <div className="row"><Avatar user={u} size="sm" /><strong className="small">{u.name}{q.userId === uid() ? ' (bạn)' : ''}</strong><span className="xsmall muted">{Codi.fmt.relative(q.createdAt)}</span>
                <span className={`badge ${q.status === 'answered' ? 'badge-success' : 'badge-warn'}`} style={{ marginLeft: 'auto' }}>{q.status === 'answered' ? 'Đã trả lời' : 'Đang chờ giảng viên trả lời'}</span></div>
              <p className="small ln-pre">{q.text}</p>
              {(q.replies || []).map((rp, i) => {
                const ru = Codi.user(rp.userId) || { name: '' };
                return <div key={i} className="ln-reply stack-1"><span className="row xsmall"><strong>{ru.name}</strong>{rp.isLecturer && <span className="badge badge-accent">Giảng viên</span>}<span className="muted">{Codi.fmt.relative(rp.at)}</span></span><p className="small ln-pre">{rp.text}</p></div>;
              })}
            </li>
          );
        })}</ul>
      ) : <Empty icon="message-circle" title="Hãy là người đầu tiên đặt câu hỏi" body="Câu hỏi về bài học này sẽ hiển thị ở đây." />}
    </div>
  );
}

function openPanel(kind, courseId, lessonId) {
  if (kind === 'ai') { if (Codi.tutor && Codi.tutor.open) Codi.tutor.open(courseId, lessonId); return; }
  Codi.ui.closeAll();
  // docked: on desktop the panel sits beside the lesson, which stays visible and usable
  Codi.ui.sheet({ docked: true, title: 'Hỏi đáp', body: () => <QaBody courseId={courseId} lessonId={lessonId} /> });
}

function openLessonSheet(courseId, lessonId) {
  // opens on the left (where the sidebar normally is), so an open AI / Q&A panel on the right stays visible
  Codi.ui.sheet({ title: 'Danh sách bài học', side: 'left', body: () => <SidebarList courseId={courseId} activeId={lessonId} inSheet /> });
}

function PathMapSheetBody({ courseId, animateFrom }) {
  useCodi();
  const c = Codi.course(courseId);
  if (!c) return null;
  const r = rec(c.id);
  const prog = Codi.courseProgress(c.id);
  return (
    <div className="stack-4">
      <p className="small muted">{c.title} · {prog.done}/{prog.total} bài</p>
      <PathMap c={c} rows={pathRows(c, r)} currentId={currentLessonId(c, r)} animateFrom={animateFrom} />
    </div>
  );
}
export function openPathMap(courseId, animateFrom) {
  Codi.ui.sheet({ title: 'Lộ trình của bạn', body: () => <PathMapSheetBody courseId={courseId} animateFrom={animateFrom || null} /> });
}

// Compact checklist at the top: each task jumps to its section (real TaskStepper).
function TaskStepper({ items }) {
  const jump = (e, id) => { e.preventDefault(); const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <nav className="ln-tasks" aria-label="Các việc cần làm trong bài">
      <ol>{items.map((it) => (
        <li key={it.key}><a href={`#${taskAnchor(it)}`} onClick={(e) => jump(e, taskAnchor(it))}>
          <Icon name={it.done ? 'check-circle' : 'circle'} className={it.done ? 'text-success' : 'muted'} />
          <span className="od-fill"><span className="ln-task-label">{it.label}</span><span className="xsmall muted">{it.done ? 'Đã xong' : 'Chưa xong'} · Đến phần này</span></span>
        </a></li>
      ))}</ol>
    </nav>
  );
}

function LessonContent({ c, r, l }) {
  const mats = materialsOf(l);
  const [materialId, setMaterialId] = useState(mats[0] ? mats[0].id : null);
  const m = mats.find((x) => x.id === materialId) || mats[0] || null;
  const body = l.body || l.reading || '';
  const studied = r.studied.includes(l.id);
  return (
    <section id="lesson-task-study" className="stack-4 ln-anchor" aria-label="Nội dung bài học">
      {mats.length > 1 && (
        <div className="field"><label htmlFor="lesson-material">Tài liệu bài học</label>
          <select id="lesson-material" className="input" value={m ? m.id : ''} onChange={(e) => setMaterialId(e.target.value)}>
            {mats.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></div>
      )}
      {m && <MaterialView key={m.id} c={c} l={l} m={m} />}
      {body ? (
        <div className="card"><div className="card-body stack-3">
          <h2 className="ln-h row ln-gap-2"><Icon name="book-open" />{m ? 'Tóm tắt bài học (bài đọc)' : 'Nội dung bài học'}</h2>
          <LessonMarkdown text={body} />
        </div></div>
      ) : !m && <Alert type="info" title="Chưa có nội dung bài học" body="Bài học chưa có tài liệu hoặc bài đọc." />}
      <div>{studied
        ? <p className="row small strong text-success"><Icon name="check-circle" /> Đã học xong nội dung</p>
        : <button type="button" className="btn btn-secondary" disabled={!body && !m} onClick={() => markStudied(c.id, l.id)}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã học xong</button>}</div>
    </section>
  );
}

// ───────────────────────── page ─────────────────────────
export default function LessonPlayerPage({ params }) {
  useCodi();
  const c = Codi.course(params.courseId);
  const lessonId = params.lessonId;
  const [completing, setCompleting] = useState(false);
  const enrolled = !!c && Codi.isEnrolled(c.id);
  const lesson = enrolled ? Codi.lesson(c, lessonId) : null;
  const r0 = lesson ? rec(c.id) : null;
  const canStudy = !!(lesson && r0 && r0.pathStatus !== 'none');

  useStudyHeartbeat(c && c.id, lessonId, canStudy);
  useEffect(() => {
    if (!canStudy) return;
    rec(c.id).lastActive = new Date().toISOString();
    save(false);
  }, [c, lessonId, canStudy]);
  // Coding submits become BKT evidence as soon as the coding view reports them.
  useEffect(() => {
    if (!canStudy || !lesson.code) return;
    if (syncCodeEvidence(c, rec(c.id), lesson)) save(false);
  });

  const guard = courseGuard(c);
  if (guard) return guard;
  const r = rec(c.id);
  const l = lesson;
  if (!l) return <div className="page page-narrow"><Empty icon="map" title="Không tìm thấy bài học" actions={<Link className="btn btn-primary" to={`/learn/${c.id}`}>Về lộ trình</Link>} /></div>;
  if (r.pathStatus === 'none') return <div className="page page-narrow"><Empty icon="route" title="Thiết lập lộ trình trước khi học" body="Chỉ mất vài phút: đặt mục tiêu và làm bài kiểm tra đầu vào." actions={<Link className="btn btn-primary" to={`/learn/${c.id}/onboarding`}>Bắt đầu thiết lập</Link>} /></div>;

  // Advisory only (decision 65): the lesson always opens; a missing prerequisite shows a note.
  const lock = lockInfo(c, r, l);
  const order = orderOf(c, r); const idx = order.indexOf(l.id);
  const prev = idx > 0 ? order[idx - 1] : null; const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const prog = Codi.courseProgress(c.id);
  const items = checklist(r, l);
  const missing = items.filter((x) => !x.done).map((x) => x.label);
  const done = r.completed.includes(l.id);
  const chapter = Codi.chapterOf(c, l.id);
  const kind = l.code ? (l.code.kind === 'tutorial' ? 'tutorial' : 'code') : l.type;
  const reviewed = Codi.db().reviews.some((x) => x.courseId === c.id && x.userId === uid());
  const justCompleted = done && r.lastUpdate && r.lastUpdate.afterLessonId === l.id;
  const complete = async () => {
    if (completing) return;
    setCompleting(true);
    completeLesson(c, l);
    const ok = await persistNow();
    setCompleting(false);
    if (!ok) { Codi.ui.toast('Không thể lưu tiến độ bài học. Vui lòng thử lại.', { type: 'danger' }); return; }
    Codi.ui.toast('Đã hoàn thành bài học.', { type: 'success' });
    requestAnimationFrame(() => { const h = document.getElementById('lesson-title'); if (h) h.focus(); });
  };

  return (
    <div className="ln-player">
      <aside className="ln-side" aria-label="Lộ trình bài học">
        <div className="ln-side-head"><Link className="small ln-side-back" to={`/learn/${c.id}`}><Icon name="arrow-left" className="icon-sm" /> Về lộ trình</Link><strong className="ln-side-course">{c.title}</strong><Progress pct={prog.pct} label="Tiến độ khoá học" /><span className="xsmall muted">{prog.done}/{prog.total} bài</span></div>
        <SidebarList courseId={c.id} activeId={l.id} />
      </aside>
      <div className="ln-main">
        <nav className="ln-topbar" aria-label="Điều hướng bài học">
          <button type="button" className="btn btn-secondary btn-sm ln-mobile-only" onClick={() => openLessonSheet(c.id, l.id)}><Icon name="list" className="icon-sm" /> Danh sách bài học</button>
          <div className="row" style={{ gap: 4 }}>
            {prev && <Link className="btn btn-ghost btn-sm" to={`/learn/${c.id}/${prev}`}><Icon name="arrow-left" className="icon-sm" /> Bài trước</Link>}
            {next && <Link className="btn btn-ghost btn-sm" to={`/learn/${c.id}/${next}`}>Bài sau <Icon name="arrow-right" className="icon-sm" /></Link>}
          </div>
          <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPathMap(c.id)}><Icon name="map" className="icon-sm" /> Xem lộ trình</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPanel('ai', c.id, l.id)}><Icon name="sparkles" className="icon-sm" /> AI trợ lý</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPanel('qa', c.id, l.id)}><Icon name="message-circle" className="icon-sm" /> Hỏi đáp</button>
          </div>
        </nav>
        <div className={`ln-content stack-6 ${l.code ? 'is-wide' : ''}`}>
          <div className="ln-mobile-progress"><Progress pct={prog.pct} label="Tiến độ khoá học" /><span className="xsmall muted">{prog.done}/{prog.total} bài · {prog.pct}%</span></div>
          <header className="stack-1"><span className="small muted">{chapter ? chapter.title : ''} · {TYPE_LABEL[kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(l.durationMin)}</span><h1 className="ln-title" id="lesson-title" tabIndex={-1}>{l.title}</h1>
            {l.description && <p className="muted">{l.description}</p>}</header>
          <TaskStepper items={items} />
          {lock && !done && <PrerequisiteAdvice c={c} advice={{ concept: lock.concept, lessonId: lock.lesson.id, lessonTitle: lock.lesson.title }} />}
          {justCompleted && <UpdateNotice c={c} r={r} inPlayer />}
          <OfferCard c={c} r={r} onViewPath={() => openPathMap(c.id, l.id)} />
          {done && isCourseComplete(c, r) && justCompleted && <CompletionCard c={c} />}
          {l.code ? (
            <div id="lesson-task-code" className="ln-anchor">{Codi.code && Codi.code.view ? Codi.code.view(c, l) : null}</div>
          ) : <LessonContent key={l.id} c={c} r={r} l={l} />}
          {l.quiz && <div id="lesson-task-quiz" className="ln-anchor"><QuizSection key={l.id} c={c} r={r} l={l} /></div>}
          {l.assignment && <div id="lesson-task-assignment" className="ln-anchor"><AssignmentSection key={l.id} c={c} r={r} l={l} /></div>}
          {Codi.tutor && typeof Codi.tutor.launcher === 'function' ? Codi.tutor.launcher(c.id, l.id) : null}
          <LecturerConversation courseId={c.id} lessonId={l.id} />
          <section className="card ln-checklist" id="checklist"><div className="card-body stack-4">
            <h2 className="ln-h">Để hoàn thành bài học</h2>
            <ol className="ln-check-items">{items.map((it) => (
              <li key={it.key} className={it.done ? 'is-done' : ''}><Icon name={it.done ? 'check-circle' : 'circle'} className={it.done ? 'text-success' : 'muted'} />
                <div className="stack-1"><span className="strong">{it.label}<span className="sr-only">{it.done ? ': đã xong' : ': chưa xong'}</span></span>{it.note && <span className="small muted">{it.note}</span>}</div></li>
            ))}</ol>
            {done ? (
              <><p className="row strong text-success"><Icon name="check-circle" /> Đã hoàn thành bài học</p>{next && <Link className="btn btn-primary" style={{ width: 'fit-content' }} to={`/learn/${c.id}/${next}`}>Bài tiếp theo</Link>}</>
            ) : (
              <div className="ln-complete-bar"><button type="button" className="btn btn-primary btn-lg" onClick={complete} disabled={completing || missing.length > 0} aria-busy={completing || undefined}>Hoàn thành bài học</button>
                {missing.length ? <span className="small muted">Còn thiếu: {missing.join(', ')}</span> : <span className="small text-success">Bạn đã đủ điều kiện hoàn thành bài học.</span>}</div>
            )}
          </div></section>
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview(c.id, 0)}>{reviewed ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button></div>
        </div>
      </div>
    </div>
  );
}
