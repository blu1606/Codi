/**
 * S11 Lesson player ('/learn/:courseId/:lessonId') + S11b questions to the lecturer (port of real
 * app/learn/[courseId]/[lessonId]/lesson-player.tsx), laid out as a full-screen reader (route layout 'reader': no app
 * header). Data: GET /api/learn/:courseId/lessons/:lessonId (LessonPlayerView with its CoursePathView), then POST
 * {type:'open'}; study / video / pdf-page / complete are lesson commands. Quiz, assignment, code and tutor panels load
 * their own endpoints and ask the page to reload the checklist after a change.
 *
 * - Top bar (52 px): back to the path, "Bài N · title", course progress (text + bar), the "Tutor AI" toggle, account.
 * - Left: the outline ("Dàn bài", 320 px): chapters as disclosures, one row per lesson (kind icon, title, status),
 *   and under the open lesson its parts. Closed with its × and reopened with the menu button at the top left.
 * - Centre: one part at a time in a 940 px column: Nội dung (material, then the tabs Transcript · Tóm tắt · Hỏi đáp ·
 *   Đánh giá from lesson-content-tabs.jsx) · Code · Quiz · Bài tập, each
 *   part the lesson's checklist task of the same name. The footer moves between parts; on the last part it completes
 *   the lesson or opens the next one. Every part stays mounted, so drafts and quiz position survive part switches.
 * - Right: Tutor AI (Codi.tutor.embed) as a 380 px panel, closed by default; it stays mounted while closed, so the
 *   thread survives and "AI giải thích" / "Vì sao test … chưa đạt?" can open it with their question.
 * - ≤ 920 px the outline and the Tutor become panels over the content (the outline starts closed).
 * Focused time on this page is credited to the learner's study days on the server (study-time.js).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon } from '../../components/ui/primitives';
import { AccountMenu } from '../shell/header';
import { TYPE_ICON, TYPE_LABEL, errorText, lessonBase, pathCourse, pathRows, postLesson, postPath } from './learning-store';
import { CompletionCard, LoadState, OfferCard, UpdateNotice, openReview } from './learning-shared';
import { MaterialView, createVideoBridge, materialProgress } from './lesson-materials';
import { LessonContentTabs, ReviewPanel, TranscriptPanel } from './lesson-content-tabs';
import { AssignmentSection, QuizSection } from './lesson-assessments';
import LessonMarkdown from './lesson-markdown';
import { LecturerConversation } from './lecturer-conversation';
import { PathMap, PrerequisiteAdvice } from './path-views';
import { ClassroomPanel } from '../classroom/classroom-panel';
import { useStudyHeartbeat } from './study-time';

const OVERLAY_QUERY = '(max-width: 920px)';
function useMedia(query) {
  return useSyncExternalStore(
    (onChange) => { const m = window.matchMedia(query); m.addEventListener('change', onChange); return () => m.removeEventListener('change', onChange); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
const isOverlay = () => window.matchMedia(OVERLAY_QUERY).matches;

// Whether the Tutor panel was left open (desktop only; it starts closed, like the reference reader).
const TUTOR_OPEN_KEY = 'codi-lesson-tutor-open';
function readTutorOpen() {
  try { return localStorage.getItem(TUTOR_OPEN_KEY) === '1'; } catch { return false; }
}
function writeTutorOpen(open) {
  try { localStorage.setItem(TUTOR_OPEN_KEY, open ? '1' : '0'); } catch { /* storage blocked: lasts for this visit */ }
}

export function openPathMap(path, rows, animateFrom) {
  const c = pathCourse(path, rows);
  Codi.ui.sheet({
    title: 'Lộ trình của bạn',
    body: () => (
      <div className="stack-4">
        <p className="small muted">{path.course.title} · {path.done}/{path.total} bài</p>
        <PathMap c={c} rows={rows} currentId={path.currentLessonId} animateFrom={animateFrom || null} />
      </div>
    ),
  });
}

// ───────────────────────── outline ("Dàn bài") ─────────────────────────
const PART_LABEL = { study: 'Nội dung', code: 'Code', quiz: 'Quiz', assignment: 'Bài tập' };
const PART_ICON = { study: 'book-open', code: 'code', quiz: 'help-circle', assignment: 'clipboard-check' };

/** Path rows grouped by chapter, in path order (first appearance), keeping each row's position in the path. */
function chaptersOf(rows) {
  const list = [];
  const byId = new Map();
  rows.forEach((row, i) => {
    let ch = byId.get(row.chapterId);
    if (!ch) { ch = { id: row.chapterId, title: row.chapterTitle || 'Chương', rows: [] }; byId.set(row.chapterId, ch); list.push(ch); }
    ch.rows.push({ ...row, no: i + 1 });
  });
  return list;
}

function lessonStatus(row, active) {
  if (row.status === 'done') return { cls: 'is-done', text: 'Đã xong', icon: 'check-circle' };
  if (active) return { cls: 'is-current', text: 'Đang học', icon: null };
  if (row.status === 'locked') return { cls: 'is-locked', text: 'Nên học trước', icon: 'info' };
  return { cls: '', text: Codi.fmt.duration(row.durationMin), icon: null };
}

function Outline({ courseId, rows, activeId, parts, part, partDone, readout, onPart, onClose, onViewPath, onNavigate }) {
  const chapters = chaptersOf(rows);
  const listRef = useRef(null);
  useEffect(() => {
    const a = listRef.current && listRef.current.querySelector('.rd-lesson.is-active');
    if (a) a.scrollIntoView({ block: 'center' });
  }, [activeId]);
  return (
    <nav className="rd-outline" id="rd-outline" aria-label="Dàn bài">
      <div className="rd-outline-head">
        <span className="rd-overline">Dàn bài</span>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onViewPath} aria-label="Xem lộ trình" title="Xem lộ trình"><Icon name="map" className="icon-sm" /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm rd-outline-close" onClick={onClose} aria-label="Đóng dàn bài" title="Đóng dàn bài"><Icon name="x" className="icon-sm" /></button>
      </div>
      <div className="rd-outline-scroll" ref={listRef}>
        {chapters.map((ch) => {
          const done = ch.rows.filter((r) => r.status === 'done').length;
          const hasActive = ch.rows.some((r) => r.id === activeId);
          return (
            <details key={ch.id} className="rd-sec" open={hasActive || undefined}>
              <summary className="rd-sec-head">
                <Icon name="chevron-right" className="icon-sm rd-sec-chev" />
                <span className="rd-sec-title">{ch.title}</span>
                <span className="rd-sec-meta">{done}/{ch.rows.length}</span>
              </summary>
              <ol className="rd-lessons">{ch.rows.map((row) => {
                const active = row.id === activeId;
                const st = lessonStatus(row, active);
                return (
                  <li key={row.id}>
                    <Link to={`/learn/${courseId}/${row.id}`} className={`rd-lesson ${active ? 'is-active' : ''} ${st.cls}`.trim()} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
                      <span className="rd-kind" aria-hidden="true"><Icon name={TYPE_ICON[row.kind] || 'book-open'} className="icon-sm" /></span>
                      <span className="rd-lesson-main">
                        <span className="rd-lesson-title">{row.title}</span>
                        <span className="rd-lesson-meta">Bài {row.no} · {TYPE_LABEL[row.kind] || TYPE_LABEL.reading}{row.status === 'skippable' ? ' · có thể bỏ qua' : ''}</span>
                      </span>
                      <span className="rd-lesson-status">{st.icon && <Icon name={st.icon} className="icon-sm" />}{st.text}</span>
                    </Link>
                    {/* a one-part lesson is just the lesson: its row already stands for it */}
                    {active && parts.length > 1 && (
                      <ol className="rd-parts" aria-label="Các phần của bài">{parts.map((k) => (
                        <li key={k}>
                          <button type="button" className={`rd-part ${k === part ? 'is-current' : ''} ${partDone(k) ? 'is-done' : ''}`.trim()} aria-current={k === part ? 'step' : undefined} onClick={() => onPart(k)}>
                            <Icon name={partDone(k) ? 'check-circle' : PART_ICON[k]} className="icon-sm" />
                            <span className="rd-part-label">{PART_LABEL[k]}</span>
                            {readout && readout[k] ? <span className="rd-part-readout">{readout[k]}</span> : null}
                            <span className="sr-only">{partDone(k) ? ': đã xong' : ': chưa xong'}</span>
                          </button>
                        </li>
                      ))}</ol>
                    )}
                  </li>
                );
              })}</ol>
            </details>
          );
        })}
      </div>
    </nav>
  );
}

// ───────────────────────── S11b Hỏi giảng viên & thảo luận ─────────────────────────
// Public questions (discussions) and the learner's private lecturer conversation: people answer here, the Tutor AI
// lives in its own panel.
function QaPanel({ courseId, lessonId, lessonTitle, onCount }) {
  const base = lessonBase(courseId, lessonId);
  const [qs, setQs] = useState(null);
  const [conv, setConv] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tick, setTick] = useState(0);
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = Codi.state.currentUserId;
  useEffect(() => {
    let live = true;
    setLoadError(null);
    Promise.all([api.get(`${base}/discussions`), api.get(`${base}/conversations`)])
      .then(([d, c]) => { if (live) { setQs(d.questions || []); setConv(c.conversation || null); } })
      .catch((e) => { if (live) setLoadError(e); });
    return () => { live = false; };
  }, [base, tick]);
  const count = (qs || []).length + (conv ? 1 : 0);
  useEffect(() => { if (onCount) onCount(count); }, [onCount, count]);
  const post = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = text.trim();
    if (t.length < 10) { setErr('Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'); return; }
    setErr(null); setBusy(true);
    try {
      const q = await api.post(`${base}/discussions`, { text: t });
      setQs((list) => [q, ...(list || [])]);
      setText('');
      Codi.ui.toast('Đã gửi câu hỏi. Bạn sẽ nhận thông báo khi giảng viên trả lời.', { type: 'success' });
    } catch (ex) {
      setErr(errorText(ex, 'Đã có lỗi xảy ra khi gửi câu hỏi.'));
    } finally { setBusy(false); }
  };
  const sorted = (qs || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (
    <section className="ln-qa" id="lesson-qa" aria-labelledby="ln-qa-h">
      <div className="stack-1">
        <h2 className="ln-h" id="ln-qa-h"><Icon name="users" className="icon-sm" /> Hỏi giảng viên &amp; thảo luận{count ? <span className="ln-tab-count"> ({count})</span> : null}</h2>
        <p className="small muted">Giảng viên và học viên cùng khoá trả lời ở đây. Cần giải thích ngay? Hỏi Tutor AI ở thanh trên.</p>
      </div>
      <LecturerConversation courseId={courseId} lessonId={lessonId} conv={conv} onReply={(m) => setConv((c) => ({ ...c, messages: [...c.messages, m] }))} />
      {loadError ? (
        <Alert type="danger" body={errorText(loadError, 'Không thể tải câu hỏi.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setTick((n) => n + 1)}>Thử lại</button>} />
      ) : qs === null ? (
        <p className="row small muted" role="status"><Icon name="loader" className="icon-sm ln-spin" /> Đang tải câu hỏi…</p>
      ) : sorted.length ? (
        <ul className="list stack-3">{sorted.map((q) => (
          <li key={q.id} className="ln-qa-item stack-2">
            <div className="row"><Avatar user={{ name: q.name, image: q.avatar }} size="sm" /><strong className="small">{q.name}{q.userId === me ? ' (bạn)' : ''}</strong><span className="xsmall muted">{Codi.fmt.relative(q.createdAt)}</span>
              <span className={`badge ${q.status === 'answered' ? 'badge-success' : 'badge-warn'}`} style={{ marginLeft: 'auto' }}>{q.status === 'answered' ? 'Đã trả lời' : 'Đang chờ giảng viên trả lời'}</span></div>
            <p className="small ln-pre">{q.text}</p>
            {(q.replies || []).map((rp) => (
              <div key={rp.id} className="ln-reply stack-1"><span className="row xsmall"><strong>{rp.name}</strong>{rp.isLecturer && <span className="badge badge-accent">Giảng viên</span>}<span className="muted">{Codi.fmt.relative(rp.at)}</span></span><p className="small ln-pre">{rp.text}</p></div>
            ))}
          </li>
        ))}</ul>
      ) : <Empty icon="message-circle" title="Hãy là người đầu tiên đặt câu hỏi" body="Câu hỏi về bài học này sẽ hiển thị ở đây." />}
      <form className={`ln-qa-form stack-2 field ${err ? 'is-invalid' : ''}`} noValidate onSubmit={post}><label htmlFor="qa-text">Câu hỏi của bạn về bài &ldquo;{lessonTitle}&rdquo;</label>
        <textarea id="qa-text" name="text" rows={3} maxLength={5000} placeholder="Mô tả chỗ bạn chưa hiểu, kèm đoạn mã nếu có..." value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        {err ? <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{err}</span></p> : <span className="field-help">Giảng viên và học viên cùng khoá đều xem được câu hỏi.</span>}
        <div><button className="btn btn-secondary" type="submit" disabled={busy} aria-busy={busy || undefined}><Icon name="send" className="icon-sm" /> Gửi câu hỏi</button></div></form>
    </section>
  );
}

// ───────────────────────── left pane ─────────────────────────
// The material's own type and length; a material without its own length falls back to the lesson's.
function materialKind(m, lessonMin, kind) {
  const label = (m && TYPE_LABEL[m.type]) || TYPE_LABEL[kind] || TYPE_LABEL.reading;
  const min = m && m.durationSeconds > 0 ? Math.max(1, Math.round(m.durationSeconds / 60)) : lessonMin;
  return `${label} · ${Codi.fmt.duration(min)}`;
}

// Below the material: Transcript (a video with one) · Tóm tắt (reading + "Đánh dấu đã học xong") · Hỏi đáp · Đánh giá.
function LessonMaterial({ view, kind, mats, m, onPick, save, onStudied, studyControl, qa, review, bridge: sharedBridge }) {
  const l = view.lesson;
  const lessonMin = Math.round((l.durationSeconds || 0) / 60);
  const body = l.body || '';
  const [marking, setMarking] = useState(false);
  const [qaCount, setQaCount] = useState(0);
  // The workspace passes its bridge so the AI classroom can follow and pause the same video.
  const [ownBridge] = useState(createVideoBridge);
  const bridge = sharedBridge || ownBridge;
  const mark = async () => { setMarking(true); try { await onStudied(); } finally { setMarking(false); } };
  const cues = m && m.type === 'video' && Array.isArray(m.transcript) && m.transcript.length ? m.transcript : null;
  const summary = (
    <>
      {body ? (
        <article className="ln-reading" aria-label={m ? 'Tóm tắt bài học' : 'Nội dung bài học'}><LessonMarkdown text={body} /></article>
      ) : m ? <p className="small muted">Bài học này chưa có phần tóm tắt.</p>
        : <Alert type="info" title="Chưa có nội dung bài học" body="Bài học chưa có tài liệu hoặc bài đọc." />}
      {studyControl && <div className="ln-studied">{view.studied
        ? <p className="row small strong text-success"><Icon name="check-circle" /> Đã học xong nội dung</p>
        : <button type="button" className="btn btn-secondary" disabled={(!body && !m) || marking} aria-busy={marking || undefined} onClick={mark}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã học xong</button>}</div>}
    </>
  );
  const tabs = [
    cues && { id: 'transcript', label: 'Transcript', icon: 'list', panel: <TranscriptPanel key={m.id} cues={cues} bridge={bridge} /> },
    { id: 'summary', label: 'Tóm tắt', icon: 'book-open', panel: summary },
    { id: 'qa', label: 'Hỏi đáp', icon: 'message-circle', count: qaCount, panel: <QaPanel {...qa} onCount={setQaCount} /> },
    { id: 'review', label: 'Đánh giá', icon: 'star', panel: <ReviewPanel {...review} /> },
  ].filter(Boolean);
  return (
    <section id="lesson-task-study" className="ln-material" aria-label="Nội dung bài học">
      <div className="ln-meta-row">
        {mats.length > 1 ? (
          <div className="ln-material-pick"><label htmlFor="lesson-material">Tài liệu bài học</label>
            <select id="lesson-material" className="input" value={m ? m.id : ''} onChange={(e) => onPick(Number(e.target.value))}>
              {mats.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select></div>
        ) : <span className="ln-meta-main">{m ? m.title : l.chapterTitle}</span>}
        <span className="ln-meta-kind">{materialKind(m, lessonMin, kind)}</span>
      </div>
      {m && <MaterialView key={m.id} m={m} progress={view.media[m.id]} lessonMin={lessonMin} save={save} bridge={bridge} />}
      {l.description && <p className="ln-lead">{l.description}</p>}
      <LessonContentTabs tabs={tabs} defaultId={cues ? 'transcript' : 'summary'} />
    </section>
  );
}

function FinishBlock({ courseId, items, missing, done, next, completing, onComplete, reviewed, onReview }) {
  return (
    <section className="ln-finish" id="checklist" aria-labelledby="ln-finish-h">
      <h2 className="ln-h" id="ln-finish-h">Để hoàn thành bài học</h2>
      <ol className="ln-check-items">{items.map((it) => (
        <li key={it.key + (it.assessmentId || '')} className={it.done ? 'is-done' : ''}><Icon name={it.done ? 'check-circle' : 'circle'} className={it.done ? 'text-success' : 'muted'} />
          <div className="stack-1"><span className="strong">{it.label}<span className="sr-only">{it.done ? ': đã xong' : ': chưa xong'}</span></span>{it.note && <span className="small muted">{it.note}</span>}</div></li>
      ))}</ol>
      {done ? (
        <div className="row"><p className="row strong text-success"><Icon name="check-circle" /> Đã hoàn thành bài học</p>{next && <Link className="btn btn-primary" to={`/learn/${courseId}/${next}`}>Bài tiếp theo <Icon name="arrow-right" className="icon-sm" /></Link>}</div>
      ) : (
        <div className="ln-complete-bar">{missing.length
          ? <span className="small muted">Còn thiếu: {missing.join(', ')}</span>
          : <><button type="button" className="btn btn-primary btn-lg" onClick={onComplete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học</button>
            <span className="small text-success">Bạn đã đủ điều kiện hoàn thành bài học.</span></>}</div>
      )}
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={onReview}><Icon name="star" className="icon-sm" /> {reviewed ? 'Sửa đánh giá' : 'Đánh giá khoá học'}</button></div>
    </section>
  );
}

// ───────────────────────── workspace (one lesson) ─────────────────────────
/**
 * The Tutor panel: a 380 px column beside the content (> 920 px) or a panel over it (≤ 920 px). Always mounted so the
 * thread, the code bridge and contextual requests keep working while it is closed; `hidden` removes it from view and
 * from the accessibility tree. Over the content it closes on Escape and hands focus back to the bar's toggle.
 */
// Tutor panel width (desktop): dragged on its left edge, 320–720 px, remembered per browser; dropped below 260 px
// the panel closes.
const SIDE_W = { min: 320, max: 720, def: 380, close: 260 };
const SIDE_W_KEY = 'codi-lesson-tutor-w';
const clampSide = (v) => Math.min(SIDE_W.max, Math.max(SIDE_W.min, Math.round(v)));
function readSideW() {
  try { const v = Number(localStorage.getItem(SIDE_W_KEY)); return v >= SIDE_W.min && v <= SIDE_W.max ? v : SIDE_W.def; } catch { return SIDE_W.def; }
}
function writeSideW(v) {
  try { localStorage.setItem(SIDE_W_KEY, String(v)); } catch { /* storage blocked: lasts for this visit */ }
}

function SideResizer({ width, shellRef, onCommit, onCloseDrag, controls = 'ln-tutor' }) {
  const handleRef = useRef(null);
  // While dragging only the CSS variable changes; the width is committed on release.
  const fromX = (x) => {
    const shell = shellRef.current;
    return shell ? shell.getBoundingClientRect().right - x : width;
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    document.body.classList.add('is-side-resizing');
    let raw = width;
    const move = (ev) => {
      raw = fromX(ev.clientX);
      if (shellRef.current) shellRef.current.style.setProperty('--rd-side-w', `${clampSide(raw)}px`);
      h.classList.toggle('is-closing', raw < SIDE_W.close);
    };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-side-resizing');
      h.classList.remove('is-closing');
      if (raw < SIDE_W.close) onCloseDrag(); else onCommit(clampSide(raw));
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    let v;
    if (e.key === 'ArrowLeft') v = width + step;
    else if (e.key === 'ArrowRight') v = width - step;
    else if (e.key === 'Home') v = SIDE_W.max;
    else if (e.key === 'End') v = SIDE_W.min;
    else return;
    e.preventDefault();
    onCommit(clampSide(v));
  };
  return (
    <div ref={handleRef} className="rd-side-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-controls={controls}
      aria-label="Độ rộng Tutor AI" aria-valuenow={width} aria-valuemin={SIDE_W.min} aria-valuemax={SIDE_W.max}
      title="Kéo để đổi độ rộng · kéo hẳn sang phải để đóng · nhấp đúp để về mặc định"
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={() => onCommit(SIDE_W.def)} />
  );
}

function TutorDock({ open, overlay, onClose, resizer, children, id = 'ln-tutor', label = 'Tutor AI' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open || !overlay) return undefined;
    const el = ref.current;
    if (el) { const t = el.querySelector('textarea, button'); if (t) t.focus({ preventScroll: true }); }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, overlay, onClose]);
  return (
    <aside ref={ref} id={id} className="rd-side ln-tutor" hidden={!open} aria-label={label}>
      {!overlay && resizer}
      {children}
    </aside>
  );
}

function LessonWorkspace({ courseId, view, send, reload, offer, setOffer, setPath }) {
  const navigate = useNavigate();
  const live = useRef(true);
  const currentLesson = useRef(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const overlay = useMedia(OVERLAY_QUERY);
  const [completing, setCompleting] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(() => !isOverlay() && readTutorOpen());
  const [outlineOpen, setOutlineOpen] = useState(() => !isOverlay());
  const aiButtonRef = useRef(null);
  // AI classroom (characters debating at video checkpoints): shares the right column with the Tutor, one at a time.
  const [classOpen, setClassOpen] = useState(false);
  const classButtonRef = useRef(null);
  const [bridge] = useState(createVideoBridge);
  const mainRef = useRef(null);
  const shellRef = useRef(null);
  const [sideW, setSideW] = useState(readSideW);
  const commitSideW = useCallback((v) => { setSideW(v); writeSideW(v); }, []);
  const l = view.lesson;
  const path = view.path;
  const rows = pathRows(path);
  const row = rows.find((x) => x.id === l.id) || null;
  const kind = row ? row.kind : 'reading';
  const items = view.checklist;
  const codeItem = items.find((x) => x.key === 'code');
  const quizItem = items.find((x) => x.key === 'quiz');
  const asItem = items.find((x) => x.key === 'assignment');
  const isCode = !!codeItem;
  const mats = view.materials || [];
  // A code lesson opens on its exercise; its material (if any) is the part after it.
  const hasStudy = !isCode || mats.length > 0 || !!l.body;
  const parts = (isCode ? ['code', hasStudy && 'study'] : ['study']).concat([quizItem && 'quiz', asItem && 'assignment']).filter(Boolean);
  const partDone = (k) => { const it = items.find((x) => x.key === k); return it ? it.done : view.studied; };
  const [part, setPartState] = useState(() => parts.find((k) => !partDone(k)) || parts[0]);
  const [materialId, setMaterialId] = useState(mats[0] ? mats[0].id : null);
  const material = mats.find((x) => x.id === materialId) || mats[0] || null;

  const scrollTop = () => { const el = mainRef.current; if (el) el.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); };
  const setPart = useCallback((k) => {
    setPartState(k);
    if (isOverlay()) setOutlineOpen(false);
    requestAnimationFrame(() => { const el = mainRef.current; if (el) el.scrollTo({ top: 0 }); });
  }, []);
  // 'Tiếp tục' after a quiz or a passed code run: the checklist at the end of the last part.
  const lastPart = parts[parts.length - 1];
  const goChecklist = useCallback(() => {
    setPartState(lastPart);
    requestAnimationFrame(() => { const el = document.getElementById('checklist'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }, [lastPart]);
  const openTutor = useCallback((open) => {
    setTutorOpen(open);
    if (open) setClassOpen(false);
    if (!isOverlay()) writeTutorOpen(open);
  }, []);
  const closeTutor = useCallback(() => {
    openTutor(false);
    requestAnimationFrame(() => { if (aiButtonRef.current) aiButtonRef.current.focus({ preventScroll: true }); });
  }, [openTutor]);
  // The tutor asks to be shown when "AI giải thích" / selection / "Vì sao test … chưa đạt?" target this lesson.
  const activateAi = useCallback(() => openTutor(true), [openTutor]);
  const openClassroom = useCallback(() => { setClassOpen(true); setTutorOpen(false); }, []);
  const closeClassroom = useCallback(() => {
    setClassOpen(false);
    requestAnimationFrame(() => { if (classButtonRef.current) classButtonRef.current.focus({ preventScroll: true }); });
  }, []);
  // The classroom stays mounted (closed or not) so it can stop the video at a checkpoint; stopping opens it.
  const [videoApi] = useState(() => ({
    currentTime: () => bridge.currentTime(),
    pause: () => { bridge.pause(); openClassroom(); },
    play: () => bridge.play(),
    onTime: (cb) => bridge.subscribe(cb),
  }));
  // Before a line jump or a test run the Tutor shows the editor: the code part, or the assignment's editor. Over the
  // content the panel closes so the editor is visible.
  const editorPart = codeItem ? 'code' : asItem ? 'assignment' : null;
  const showEditor = useCallback(() => {
    if (isOverlay()) setTutorOpen(false);
    if (editorPart) setPart(editorPart);
  }, [editorPart, setPart]);

  const lock = row && row.status !== 'done' ? row.lock : null;
  const idx = rows.findIndex((x) => x.id === l.id);
  const prev = idx > 0 ? rows[idx - 1].id : null; const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1].id : null;
  const missing = items.filter((x) => !x.done).map((x) => x.label);
  const done = view.completed;
  const ready = !done && items.length > 0 && missing.length === 0;
  const justCompleted = done && path.update && path.update.afterLessonId === l.id;
  const progress = material ? materialProgress(view.media, material) : null;
  const readout = progress ? { study: progress } : null;
  const save = useCallback((command) => send(command), [send]);
  const onStudied = async () => {
    try { await send({ type: 'study' }); Codi.ui.toast('Đã đánh dấu học xong nội dung.', { type: 'success' }); }
    catch (e) { Codi.ui.toast(errorText(e, 'Không thể lưu tiến độ bài học. Vui lòng thử lại.'), { type: 'danger' }); }
  };
  const review = () => openReview({ courseId, title: path.course.title, review: path.review, onSaved: setPath });
  const viewPath = () => openPathMap(path, rows, l.id);

  // The path is re-planned in the background after a completion. Only a real change (order or skippable lessons)
  // opens the animated before/after page; an unchanged path is just a notice here.
  currentLesson.current = l.id;
  const openPathUpdate = () => navigate(`/learn/${courseId}/path-update?after=${encodeURIComponent(l.id)}`);
  const watchPathUpdate = async () => {
    const lessonId = l.id;
    for (let i = 0; i < 40 && live.current; i++) {
      let v;
      try { v = await postPath(courseId, { type: 'sync' }); } catch { return; }
      if (!live.current || currentLesson.current !== lessonId) return;
      setPath(v);
      if (v.updating || v.status === 'generating') { await new Promise((r) => setTimeout(r, 2000)); continue; }
      const u = v.update;
      if (u && u.afterLessonId === lessonId && v.revertible) openPathUpdate();
      else Codi.ui.toast('Codi đã xem lại lộ trình: thứ tự các bài vẫn phù hợp với bạn.', { type: 'info' });
      return;
    }
  };
  const complete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await send({ type: 'complete' });
      const adjustment = res && res.adjustment ? res.adjustment : null;
      setOffer(adjustment);
      Codi.ui.toast('Đã hoàn thành bài học.', { type: 'success' });
      scrollTop();
      requestAnimationFrame(() => { const h = document.getElementById('lesson-title'); if (h) h.focus(); });
      if (res && res.path && !res.path.complete) watchPathUpdate();
    } catch (e) {
      Codi.ui.toast(errorText(e, 'Không thể lưu tiến độ bài học. Vui lòng thử lại.'), { type: 'danger' });
    } finally { setCompleting(false); }
  };

  const codeArgs = codeItem ? { courseId, lessonId: l.id, assessmentId: codeItem.assessmentId, tutorial: !!codeItem.tutorial, onChange: reload } : null;
  const tutor = Codi.tutor && typeof Codi.tutor.embed === 'function'
    ? Codi.tutor.embed(courseId, l.id, { onActivate: activateAi, onShowCode: editorPart ? showEditor : undefined, onClose: closeTutor, title: l.title })
    : <div className="ln-task"><Alert type="info" title="Tutor chưa sẵn sàng" body="Bạn vẫn học tiếp bình thường." /></div>;

  const notices = (
    <>
      {path.updating && done && <Alert type="info" body="Codi đang cập nhật lộ trình. Bạn có thể tiếp tục học hoặc quay lại kiểm tra sau." />}
      {justCompleted && <UpdateNotice courseId={courseId} view={path} rows={rows} inPlayer onView={setPath} />}
      {done && path.complete && justCompleted && <CompletionCard view={path} onView={setPath} />}
      {lock && <PrerequisiteAdvice c={{ id: courseId }} advice={lock} />}
      <OfferCard courseId={courseId} offer={offer} onView={setPath} onDone={() => setOffer(null)} onViewPath={viewPath} onApplied={openPathUpdate} />
    </>
  );
  const lessonMin = Math.round((l.durationSeconds || 0) / 60);
  const content = {
    study: () => (
      <>
        <LessonMaterial view={isCode ? { ...view, lesson: { ...l, description: null } } : view} kind={kind} mats={mats} m={material} onPick={setMaterialId} save={save} onStudied={onStudied} studyControl={!isCode} bridge={bridge}
          qa={{ courseId, lessonId: l.id, lessonTitle: l.title }} review={{ courseId, title: path.course.title, review: path.review, onSaved: setPath }} />
      </>
    ),
    code: () => (
      <>
        <div className="ln-meta-row"><span className="ln-meta-main">{l.chapterTitle}</span><span className="ln-meta-kind">{TYPE_LABEL[kind]} · {Codi.fmt.duration(lessonMin)}</span></div>
        {l.description && <p className="ln-lead">{l.description}</p>}
        <div id="lesson-task-code">{Codi.code && Codi.code.learner ? Codi.code.learner({ ...codeArgs, part: 'brief' }) : null}</div>
        <div className="ln-code-work">{Codi.code && Codi.code.learner ? Codi.code.learner({ ...codeArgs, part: 'work', onContinue: goChecklist }) : null}</div>
        {!hasStudy && <QaPanel courseId={courseId} lessonId={l.id} lessonTitle={l.title} />}
      </>
    ),
    quiz: () => <QuizSection key={l.id} courseId={courseId} lessonId={l.id} assessmentId={quizItem.assessmentId} bare onContinue={goChecklist} onChange={reload} />,
    assignment: () => <AssignmentSection key={l.id} courseId={courseId} lessonId={l.id} assessmentId={asItem.assessmentId} bare onChange={reload} />,
  };

  // Footer: the previous part (or lesson) on the left; the next part, then completion / the next lesson, on the right.
  const pi = parts.indexOf(part);
  const prevBtn = pi > 0
    ? <button type="button" className="btn btn-secondary" onClick={() => setPart(parts[pi - 1])}><Icon name="chevron-left" className="icon-sm" /> {PART_LABEL[parts[pi - 1]]}</button>
    : prev ? <Link className="btn btn-secondary" to={`/learn/${courseId}/${prev}`}><Icon name="chevron-left" className="icon-sm" /> Bài trước</Link>
      : <button type="button" className="btn btn-secondary" disabled><Icon name="chevron-left" className="icon-sm" /> Bài trước</button>;
  let nextBtn = null;
  if (pi < parts.length - 1) nextBtn = <button type="button" className="btn btn-primary" onClick={() => setPart(parts[pi + 1])}>Tiếp theo: {PART_LABEL[parts[pi + 1]]} <Icon name="chevron-right" className="icon-sm" /></button>;
  else if (ready) nextBtn = <button type="button" className="btn btn-primary" onClick={complete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học <Icon name="check" className="icon-sm" /></button>;
  else if (next) nextBtn = <Link className={`btn ${done ? 'btn-primary' : 'btn-secondary'}`} to={`/learn/${courseId}/${next}`}>Bài sau <Icon name="chevron-right" className="icon-sm" /></Link>;

  return (
    <div className="rd-shell" ref={shellRef} style={{ '--rd-side-w': `${sideW}px` }}>
      <header className="rd-top">
        <Link className="btn btn-ghost btn-icon rd-back" to={`/learn/${courseId}`} aria-label="Về lộ trình" title="Về lộ trình"><Icon name="arrow-left" /></Link>
        <div className="rd-lessoninfo">
          <h1 className="rd-title" id="lesson-title" tabIndex={-1} title={l.title}>{idx >= 0 ? <span className="rd-title-no">Bài {idx + 1} · </span> : null}{l.title}</h1>
        </div>
        <div className="rd-top-right">
          <div className="rd-prog">
            <span className="rd-prog-text">Tiến độ {path.done}/{path.total}</span>
            <span className="rd-prog-bar" role="progressbar" aria-label="Tiến độ khoá học" aria-valuemin={0} aria-valuemax={100} aria-valuenow={path.percent}><i style={{ width: `${path.percent}%` }} /></span>
          </div>
          <button ref={aiButtonRef} type="button" className={`btn btn-secondary rd-aibtn ${tutorOpen ? 'is-on' : ''}`.trim()}
            aria-expanded={tutorOpen} aria-controls="ln-tutor" title={tutorOpen ? 'Đóng Tutor AI' : 'Mở Tutor AI: hỏi về bài này, giải thích lỗi code'}
            onClick={() => (tutorOpen ? closeTutor() : openTutor(true))}>
            <Icon name="sparkles" className="icon-sm" /><span className="rd-aibtn-label">Tutor AI</span>
          </button>
          <button ref={classButtonRef} type="button" className={`btn btn-secondary rd-aibtn ${classOpen ? 'is-on' : ''}`.trim()}
            aria-expanded={classOpen} aria-controls="ln-classroom" title={classOpen ? 'Đóng lớp học AI' : 'Mở lớp học AI: các bạn học và Cô Lam cùng thảo luận ở điểm dừng video'}
            onClick={() => (classOpen ? closeClassroom() : openClassroom())}>
            <Icon name="users" className="icon-sm" /><span className="rd-aibtn-label">Lớp học AI</span>
          </button>
          <AccountMenu />
        </div>
      </header>
      <div className={`rd-body ${outlineOpen ? 'has-outline' : ''} ${tutorOpen || classOpen ? 'has-side' : ''}`.trim()}>
        {outlineOpen ? (
          <Outline courseId={courseId} rows={rows} activeId={l.id} parts={parts} part={part} partDone={partDone} readout={readout}
            onPart={setPart} onClose={() => setOutlineOpen(false)} onViewPath={viewPath} onNavigate={() => { if (isOverlay()) setOutlineOpen(false); }} />
        ) : (
          <button type="button" className="btn btn-secondary btn-icon rd-menu-reopen" onClick={() => setOutlineOpen(true)} aria-label="Mở dàn bài" aria-controls="rd-outline" title="Mở dàn bài"><Icon name="list" className="icon-sm" /></button>
        )}
        <div className="rd-main" ref={mainRef}>
          <div className={`rd-main-inner ${part === 'code' ? 'is-wide' : ''}`.trim()}>
            {notices}
            {parts.map((k) => (
              <section key={k} className="rd-part-body" id={`lesson-part-${k}`} aria-label={PART_LABEL[k]} hidden={k !== part}>
                {content[k]()}
              </section>
            ))}
            {part === lastPart && <FinishBlock courseId={courseId} items={items} missing={missing} done={done} next={next} completing={completing} onComplete={complete} reviewed={!!path.review} onReview={review} />}
            <nav className="rd-foot" aria-label="Chuyển phần">{prevBtn}{nextBtn}</nav>
          </div>
        </div>
        <TutorDock open={tutorOpen} overlay={overlay} onClose={closeTutor}
          resizer={<SideResizer width={sideW} shellRef={shellRef} onCommit={commitSideW} onCloseDrag={closeTutor} />}>{tutor}</TutorDock>
        <TutorDock id="ln-classroom" label="Lớp học AI" open={classOpen} overlay={overlay} onClose={closeClassroom}
          resizer={<SideResizer width={sideW} shellRef={shellRef} onCommit={commitSideW} onCloseDrag={closeClassroom} controls="ln-classroom" />}>
          <ClassroomPanel courseId={courseId} lessonId={l.id} lessonTitle={l.title} videoApi={videoApi} />
        </TutorDock>
      </div>
    </div>
  );
}

// ───────────────────────── page ─────────────────────────
/** Lesson view + command queue (commands run one at a time; a reply older than a newer write is dropped). */
function useLessonView(courseId, lessonId) {
  const endpoint = lessonBase(courseId, lessonId);
  const [state, setState] = useState({ view: null, error: null, loading: true });
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const live = useRef(true);
  const send = useCallback((command) => {
    revision.current += 1;
    const job = queue.current.then(async () => {
      const body = await postLesson(courseId, lessonId, command);
      if (!live.current) return body;
      if (body && body.kind === 'media-progress') {
        setState((s) => (s.view ? { ...s, view: {
          ...s.view, media: body.media, positionSeconds: body.positionSeconds, studied: body.studied, completed: body.completed,
          checklist: s.view.checklist.map((it) => (it.key === 'study' ? { ...it, done: body.studied, note: body.studied ? 'Đã học xong nội dung' : it.note } : it)),
        } } : s));
      } else if (body && body.lesson) {
        const { adjustment, ...view } = body; // eslint-disable-line no-unused-vars
        setState({ view, error: null, loading: false });
      }
      return body;
    });
    queue.current = job.catch(() => {});
    return job;
  }, [courseId, lessonId]);
  const reload = useCallback(() => {
    const before = revision.current;
    return queue.current.then(() => api.get(endpoint)).then((view) => {
      if (live.current && before === revision.current) setState({ view, error: null, loading: false });
    }).catch((error) => { if (live.current) setState((s) => (s.view ? s : { view: null, error, loading: false })); });
  }, [endpoint]);
  const setPath = useCallback((path) => setState((s) => (s.view ? { ...s, view: { ...s.view, path } } : s)), []);
  useEffect(() => {
    live.current = true;
    setState({ view: null, error: null, loading: true });
    api.get(endpoint)
      .then((view) => {
        if (!live.current) return;
        setState({ view, error: null, loading: false });
        send({ type: 'open' }).catch(() => {});
      })
      .catch((error) => { if (live.current) setState({ view: null, error, loading: false }); });
    const onFocus = () => { reload(); };
    window.addEventListener('focus', onFocus);
    return () => { live.current = false; window.removeEventListener('focus', onFocus); };
  }, [endpoint, send, reload]);
  // While the path is being updated after a completion, re-read the lesson every 3 s.
  const updating = !!(state.view && state.view.path.updating);
  useEffect(() => {
    if (!updating) return undefined;
    const t = setInterval(() => { reload(); }, 3000);
    return () => clearInterval(t);
  }, [updating, reload]);
  return { ...state, send, reload, setPath };
}

export default function LessonPlayerPage({ params }) {
  const { courseId, lessonId } = params;
  const { view, error, loading, send, reload, setPath } = useLessonView(courseId, lessonId);
  const [offer, setOffer] = useState(null);
  useEffect(() => { setOffer(null); }, [lessonId]);
  useStudyHeartbeat(courseId, lessonId, !!view);

  if (!view) {
    // The reader layout has no app header, so loading / blocked states keep the reader's own top bar: a way back,
    // the brand and the account menu.
    let body;
    if (error && error.status === 409) {
      body = <div className="page page-narrow"><Empty icon="route" title="Thiết lập lộ trình trước khi học" body="Chỉ mất vài phút: đặt mục tiêu và làm bài kiểm tra đầu vào." actions={<Link className="btn btn-primary" to={`/learn/${courseId}/onboarding`}>Bắt đầu thiết lập</Link>} /></div>;
    } else if (error && (error.status === 404 || error.status === 400)) {
      body = <div className="page page-narrow"><Empty icon="map" title="Không tìm thấy bài học" actions={<Link className="btn btn-primary" to={`/learn/${courseId}`}>Về lộ trình</Link>} /></div>;
    } else {
      body = <LoadState loading={loading} error={error} courseId={courseId} onRetry={reload} text="Đang tải bài học…" />;
    }
    return (
      <>
        <header className="rd-top">
          <Link className="btn btn-ghost btn-icon rd-back" to={Codi.homeFor(Codi.role())} aria-label="Về trang chủ" title="Về trang chủ"><Icon name="arrow-left" /></Link>
          <div className="rd-lessoninfo"><span className="rd-title">Codi</span></div>
          <div className="rd-top-right"><AccountMenu /></div>
        </header>
        {body}
      </>
    );
  }
  return <LessonWorkspace key={`${courseId}:${lessonId}`} courseId={courseId} view={view} send={send} reload={reload} offer={offer} setOffer={setOffer} setPath={setPath} />;
}
