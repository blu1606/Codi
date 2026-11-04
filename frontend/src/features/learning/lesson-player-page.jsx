/**
 * S11 Lesson player ('/learn/:courseId/:lessonId') + S11b questions to the lecturer (port of real
 * app/learn/[courseId]/[lessonId]/lesson-player.tsx), laid out as a split pane (approved direction "Chia đôi màn hình").
 * Data: GET /api/learn/:courseId/lessons/:lessonId (LessonPlayerView with its CoursePathView), then POST
 * {type:'open'}; study / video / pdf-page / complete are lesson commands. Quiz, assignment, code and tutor panels load
 * their own endpoints and ask the page to reload the checklist after a change.
 *
 * - Lesson bar (sticky under the header): "Danh sách bài" (lesson list sheet), breadcrumb + title, one chip per
 *   checklist task (icon + text, done / active / todo), "Hoàn thành bài học" once every task is done, the "Tutor AI"
 *   toggle, Bài trước / Bài sau.
 * - Left pane: the material (video in a navy frame, PDF, reading) or the coding brief, the prerequisite note,
 *   notices, sources, the completion checklist and, last, "Hỏi giảng viên & thảo luận" (people answer there).
 * - Right pane (only when the lesson has a task): content tabs Quiz · Bài tập · Code. The default tab is the lesson's
 *   main task; Codi.code.learner renders the editor + console here with its brief on the left. Every panel stays
 *   mounted, so drafts and quiz position survive tab switches.
 * - Tutor AI (Codi.tutor.embed) is not a tab: the bar's toggle docks it as a right-hand column that pushes the panes
 *   (never a floating overlay); below 1024 px it opens as a full-screen sheet. It stays mounted while closed, so the
 *   thread survives and "AI giải thích" / "Vì sao test … chưa đạt?" can open it with their question.
 * - A draggable divider (pointer + arrow keys, 35–70 %, saved per layout tier) separates the panes.
 * - Below 1024 px the panes become top-level tabs ("Bài học" · task tabs) under a compact lesson bar.
 * Focused time on this page is credited to the learner's study days on the server (study-time.js).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon, Progress } from '../../components/ui/primitives';
import { TYPE_LABEL, errorText, lessonBase, pathCourse, pathRows, postLesson, postPath } from './learning-store';
import { CompletionCard, LoadState, OfferCard, UpdateNotice, openReview } from './learning-shared';
import { MaterialView, materialProgress } from './lesson-materials';
import { AssignmentSection, QuizSection } from './lesson-assessments';
import LessonMarkdown from './lesson-markdown';
import { LecturerConversation } from './lecturer-conversation';
import { PathMap, PrerequisiteAdvice } from './path-views';
import { useStudyHeartbeat } from './study-time';

const COMPACT_QUERY = '(max-width: 1023px)';
const NARROW_QUERY = '(max-width: 1279px)';
function useMedia(query) {
  return useSyncExternalStore(
    (onChange) => { const m = window.matchMedia(query); m.addEventListener('change', onChange); return () => m.removeEventListener('change', onChange); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// ───────────────────────── split width (35–70 %, saved per layout tier) ─────────────────────────
const SPLIT_MIN = 35;
const SPLIT_MAX = 70;
const clampSplit = (v) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(v)));
const splitKey = (isCode, narrow) => `codi-lesson-split${isCode ? '-code' : ''}${narrow ? '-md' : ''}`;
// Code lessons give the editor more room; 1024–1279 px keeps the left pane narrower.
const splitDefault = (isCode, narrow) => (isCode ? (narrow ? 42 : 46) : narrow ? 52 : 58);
function readSplit(key) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : null;
  } catch { return null; } // storage blocked: fall back to the default width
}
function writeSplit(key, v) {
  try { localStorage.setItem(key, String(v)); } catch { /* storage blocked: the width lasts for this visit only */ }
}
function clearSplit(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}
// Whether the docked Tutor was left open (desktop only; the phone sheet always starts closed).
const TUTOR_OPEN_KEY = 'codi-lesson-tutor-open';
function readTutorOpen() {
  try { return localStorage.getItem(TUTOR_OPEN_KEY) === '1'; } catch { return false; }
}
function writeTutorOpen(open) {
  try { localStorage.setItem(TUTOR_OPEN_KEY, open ? '1' : '0'); } catch { /* storage blocked: lasts for this visit */ }
}

function SplitDivider({ value, gridRef, onCommit, onReset }) {
  const handleRef = useRef(null);
  const fromX = (x) => {
    const g = gridRef.current;
    if (!g) return value;
    const box = g.getBoundingClientRect();
    return box.width > 0 ? clampSplit(((x - box.left) / box.width) * 100) : value;
  };
  // While dragging, only the CSS variable and aria-valuenow change; React state is committed on release.
  const preview = (v) => {
    if (gridRef.current) gridRef.current.style.setProperty('--ln-left', `${v}%`);
    if (handleRef.current) handleRef.current.setAttribute('aria-valuenow', String(v));
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    document.body.classList.add('is-split-resizing');
    let last = value;
    const move = (ev) => { last = fromX(ev.clientX); preview(last); };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-split-resizing');
      onCommit(last);
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    let v;
    if (e.key === 'ArrowLeft') v = value - step;
    else if (e.key === 'ArrowRight') v = value + step;
    else if (e.key === 'Home') v = SPLIT_MIN;
    else if (e.key === 'End') v = SPLIT_MAX;
    else return;
    e.preventDefault();
    onCommit(clampSplit(v));
  };
  return (
    <div ref={handleRef} className="ln-divider" role="separator" tabIndex={0} aria-orientation="vertical" aria-controls="ln-pane-lesson"
      aria-label="Độ rộng khung bài học" aria-valuenow={value} aria-valuemin={SPLIT_MIN} aria-valuemax={SPLIT_MAX}
      aria-valuetext={`Bài học ${value}%, khung làm bài ${100 - value}%`} title="Kéo hoặc dùng phím mũi tên để đổi độ rộng · Nhấp đúp để về mặc định"
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={onReset}>
      <span className="ln-grip" aria-hidden="true"><Icon name="grip-vertical" className="icon-sm" /></span>
    </div>
  );
}

// ───────────────────────── lesson list (sheet) ─────────────────────────
// inSheet: picking a lesson closes the sheet (data-close) so it never stays open over the next lesson.
function SidebarList({ courseId, rows, activeId, inSheet }) {
  useEffect(() => {
    if (!inSheet) return;
    const a = document.querySelector('.sheet .ln-side-item.is-active');
    if (a) { a.scrollIntoView({ block: 'center' }); a.focus(); }
  }, [inSheet]);
  return (
    <ol className="list ln-side-list">{rows.map((row, i) => {
      const st = row.status;
      const lock = st !== 'done' ? row.lock : null;
      return (
        <li key={row.id}><Link to={`/learn/${courseId}/${row.id}`} className={`ln-side-item ${row.id === activeId ? 'is-active' : ''}`} aria-current={row.id === activeId ? 'page' : undefined} data-close={inSheet ? '' : undefined}>
          <span className="ln-side-check">{st === 'done' ? <Icon name="check-circle" className="icon-sm text-success" /> : st === 'locked' ? <Icon name="info" className="icon-sm text-warn" /> : <span className="xsmall">{i + 1}.</span>}</span>
          <span className="od-fill stack-1"><span className="small">{row.title}</span><span className="xsmall muted">{TYPE_LABEL[row.kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(row.durationMin)}{st === 'skippable' ? ' · có thể bỏ qua' : ''}</span>
            {lock && <span className="xsmall muted">Nên học trước: {lock.concept}</span>}
            <span className="sr-only">{st === 'done' ? 'Đã học' : st === 'locked' ? 'Chưa đủ tiên quyết' : ''}</span></span></Link></li>
      );
    })}</ol>
  );
}

function LessonSheetBody({ path, rows, lessonId }) {
  const courseId = path.course.id;
  return (
    <div className="stack-4">
      <div className="ln-sheet-head">
        <strong className="ln-side-course">{path.course.title}</strong>
        <Progress pct={path.percent} label="Tiến độ khoá học" />
        <span className="xsmall muted">{path.done}/{path.total} bài · {path.percent}%</span>
        <div className="row ln-gap-2">
          <Link className="btn btn-secondary btn-sm" to={`/learn/${courseId}`} data-close=""><Icon name="arrow-left" className="icon-sm" /> Về lộ trình</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPathMap(path, rows)}><Icon name="map" className="icon-sm" /> Xem lộ trình</button>
        </div>
      </div>
      <SidebarList courseId={courseId} rows={rows} activeId={lessonId} inSheet />
    </div>
  );
}

function openLessonSheet(path, rows, lessonId) {
  // opens on the left, beside the lesson material it replaces
  Codi.ui.sheet({ title: 'Danh sách bài học', side: 'left', body: () => <LessonSheetBody path={path} rows={rows} lessonId={lessonId} /> });
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

// ───────────────────────── S11b Hỏi giảng viên & thảo luận ─────────────────────────
// Public questions (discussions) and the learner's private lecturer conversation: people answer here, the Tutor AI
// lives in its own panel.
function QaPanel({ courseId, lessonId, lessonTitle }) {
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

// ───────────────────────── lesson bar ─────────────────────────
const CHIP_ICON = { done: 'check-circle', active: 'circle-dot', todo: 'circle' };
function TaskChips({ items, onPick, readout }) {
  const activeKey = (items.find((x) => !x.done) || {}).key;
  return (
    <ul className="ln-chips" aria-label="Việc cần làm để hoàn thành bài">
      {items.map((it) => {
        const state = it.done ? 'done' : it.key === activeKey ? 'active' : 'todo';
        return (
          <li key={it.key}>
            <button type="button" className={`ln-chip is-${state}`} title={it.note} onClick={() => onPick(it.key)}>
              <Icon name={CHIP_ICON[state]} className="icon-sm" /><span>{it.label}</span>
              {state === 'active' && readout && readout[it.key] ? <span className="ln-chip-readout">{readout[it.key]}</span> : null}
              <span className="sr-only">{it.done ? ': đã xong' : ': chưa xong'}{it.note ? ` (${it.note})` : ''}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TabList({ tabs, active, onSelect, label, className = '' }) {
  const refs = useRef({});
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    let j;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    else return;
    e.preventDefault();
    const k = tabs[j].key;
    onSelect(k);
    requestAnimationFrame(() => { const b = refs.current[k]; if (b) b.focus(); });
  };
  return (
    <div className={`ln-tabs ${className}`.trim()} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button key={t.key} ref={(el) => { refs.current[t.key] = el; }} type="button" role="tab" className="ln-tab"
          id={`ln-tab-${t.key}`} aria-controls={`ln-panel-${t.key}`} aria-selected={t.key === active} tabIndex={t.key === active ? 0 : -1}
          onClick={() => onSelect(t.key)}>
          {t.label}{t.count ? <span className="ln-tab-count"> ({t.count})</span> : null}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── left pane ─────────────────────────
// The material's own type and length; a material without its own length falls back to the lesson's.
function materialKind(m, lessonMin, kind) {
  const label = (m && TYPE_LABEL[m.type]) || TYPE_LABEL[kind] || TYPE_LABEL.reading;
  const min = m && m.durationSeconds > 0 ? Math.max(1, Math.round(m.durationSeconds / 60)) : lessonMin;
  return `${label} · ${Codi.fmt.duration(min)}`;
}

function LessonMaterial({ view, kind, mats, m, onPick, save, onStudied, studyControl }) {
  const l = view.lesson;
  const lessonMin = Math.round((l.durationSeconds || 0) / 60);
  const body = l.body || '';
  const [marking, setMarking] = useState(false);
  const mark = async () => { setMarking(true); try { await onStudied(); } finally { setMarking(false); } };
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
      {m && <MaterialView key={m.id} m={m} progress={view.media[m.id]} lessonMin={lessonMin} save={save} />}
      {l.description && <p className="ln-lead">{l.description}</p>}
      {body ? (
        <article className="ln-reading" aria-labelledby="lesson-reading-h">
          <h2 className="ln-reading-h" id="lesson-reading-h">{m ? 'Tóm tắt bài học (bài đọc)' : 'Nội dung bài học'}</h2>
          <LessonMarkdown text={body} />
        </article>
      ) : !m && <Alert type="info" title="Chưa có nội dung bài học" body="Bài học chưa có tài liệu hoặc bài đọc." />}
      {studyControl && <div className="ln-studied">{view.studied
        ? <p className="row small strong text-success"><Icon name="check-circle" /> Đã học xong nội dung</p>
        : <button type="button" className="btn btn-secondary" disabled={(!body && !m) || marking} aria-busy={marking || undefined} onClick={mark}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã học xong</button>}</div>}
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
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={onReview}><Icon name="star" className="icon-sm" /> {reviewed ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button></div>
    </section>
  );
}

// ───────────────────────── workspace (one lesson) ─────────────────────────
const TAB_LABEL = { lesson: 'Bài học', quiz: 'Quiz', assignment: 'Bài tập', code: 'Code' };

/**
 * The docked Tutor column (≥1024 px) or full-screen sheet (phones). Always mounted so the thread, the code bridge and
 * contextual requests keep working while it is closed; `hidden` removes it from view and from the accessibility tree.
 * The sheet closes on Escape and hands focus back to the bar's toggle.
 */
function TutorDock({ open, compact, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const el = ref.current;
    // The phone sheet covers the page, so focus moves into it; the docked column leaves focus where the learner was.
    if (compact && el) { const t = el.querySelector('textarea, button'); if (t) t.focus({ preventScroll: true }); }
    if (!compact) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { root.style.overflow = before; document.removeEventListener('keydown', onKey); };
  }, [open, compact, onClose]);
  return (
    <aside ref={ref} id="ln-tutor" className={`ln-tutor ${compact ? 'is-sheet' : ''}`.trim()} hidden={!open}
      role={compact ? 'dialog' : 'complementary'} aria-modal={compact && open ? 'true' : undefined} aria-label="Tutor AI">
      {children}
    </aside>
  );
}

function LessonWorkspace({ courseId, view, send, reload, offer, setOffer, setPath }) {
  const navigate = useNavigate();
  const live = useRef(true);
  const currentLesson = useRef(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const compact = useMedia(COMPACT_QUERY);
  const narrow = useMedia(NARROW_QUERY);
  const [completing, setCompleting] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(() => !window.matchMedia(COMPACT_QUERY).matches && readTutorOpen());
  const aiButtonRef = useRef(null);
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
  const taskKeys = [codeItem && 'code', quizItem && 'quiz', asItem && 'assignment'].filter(Boolean);
  const hasTasks = taskKeys.length > 0;
  const [tab, setTab] = useState(() => {
    const open = taskKeys.find((k) => { const it = items.find((x) => x.key === k); return it && !it.done; });
    return open || taskKeys[0] || null;
  });
  const [mode, setMode] = useState('lesson'); // compact layout only: 'lesson' | 'task'
  const mats = view.materials || [];
  const [materialId, setMaterialId] = useState(mats[0] ? mats[0].id : null);
  const material = mats.find((x) => x.id === materialId) || mats[0] || null;
  const sKey = splitKey(isCode, narrow);
  const [split, setSplit] = useState(() => readSplit(sKey) ?? splitDefault(isCode, narrow));
  useEffect(() => { setSplit(readSplit(sKey) ?? splitDefault(isCode, narrow)); }, [sKey, isCode, narrow]);
  const gridRef = useRef(null);
  const leftRef = useRef(null);
  const barRef = useRef(null);
  const shellRef = useRef(null);

  // Compact layout: the sticky bar's height sizes the task panels so their pinned actions sit at the screen bottom.
  useLayoutEffect(() => {
    const bar = barRef.current; const shell = shellRef.current;
    if (!bar || !shell || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => shell.style.setProperty('--ln-bar-h', `${Math.round(bar.getBoundingClientRect().height)}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const commitSplit = useCallback((v) => {
    const next = clampSplit(v);
    setSplit(next);
    writeSplit(sKey, next);
  }, [sKey]);
  const resetSplit = () => { clearSplit(sKey); setSplit(splitDefault(isCode, narrow)); };

  const selectTab = useCallback((k) => {
    setTab(k); setMode('task');
    if (window.matchMedia(COMPACT_QUERY).matches) window.scrollTo({ top: 0 });
  }, []);
  const showLesson = () => {
    setMode('lesson');
    if (window.matchMedia(COMPACT_QUERY).matches) { window.scrollTo({ top: 0 }); return; }
    const el = leftRef.current;
    if (el) el.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // 'Tiếp tục' after a quiz or a passed code run: show the checklist (in the lesson pane, a tab on phones).
  const goChecklist = useCallback(() => {
    setMode('lesson');
    requestAnimationFrame(() => { const el = document.getElementById('checklist'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }, []);
  const pickChip = (key) => { if (key === 'study') showLesson(); else if (taskKeys.includes(key)) selectTab(key); };
  const openTutor = useCallback((open) => {
    setTutorOpen(open);
    if (!window.matchMedia(COMPACT_QUERY).matches) writeTutorOpen(open);
  }, []);
  const closeTutor = useCallback(() => {
    openTutor(false);
    requestAnimationFrame(() => { if (aiButtonRef.current) aiButtonRef.current.focus({ preventScroll: true }); });
  }, [openTutor]);
  // The tutor asks to be shown when "AI giải thích" / selection / "Vì sao test … chưa đạt?" target this lesson.
  const activateAi = useCallback(() => openTutor(true), [openTutor]);
  // Before a line jump or a test run the Tutor shows the editor: the code tab, or the assignment's editor. On a phone
  // the sheet closes so the editor is visible.
  const editorTab = codeItem ? 'code' : asItem ? 'assignment' : null;
  const showEditor = useCallback(() => {
    if (window.matchMedia(COMPACT_QUERY).matches) setTutorOpen(false);
    if (editorTab) selectTab(editorTab);
  }, [editorTab, selectTab]);

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
      requestAnimationFrame(() => { const h = document.getElementById('lesson-title'); if (h) h.focus(); });
      if (res && res.path && !res.path.complete) watchPathUpdate();
    } catch (e) {
      Codi.ui.toast(errorText(e, 'Không thể lưu tiến độ bài học. Vui lòng thử lại.'), { type: 'danger' });
    } finally { setCompleting(false); }
  };

  const rightTabs = taskKeys.map((k) => ({ key: k, label: TAB_LABEL[k] }));
  const mobileTabs = [{ key: 'lesson', label: TAB_LABEL.lesson }, ...rightTabs];
  const panelHidden = (k) => k !== tab || (compact && mode === 'lesson');
  const codeArgs = codeItem ? { courseId, lessonId: l.id, assessmentId: codeItem.assessmentId, tutorial: !!codeItem.tutorial, onChange: reload } : null;

  const panels = {
    quiz: () => <QuizSection key={l.id} courseId={courseId} lessonId={l.id} assessmentId={quizItem.assessmentId} bare onContinue={goChecklist} onChange={reload} />,
    assignment: () => <AssignmentSection key={l.id} courseId={courseId} lessonId={l.id} assessmentId={asItem.assessmentId} bare onChange={reload} />,
    code: () => <div className="ln-code-work">{Codi.code && Codi.code.learner ? Codi.code.learner({ ...codeArgs, part: 'work', onContinue: goChecklist }) : null}</div>,
  };
  const tutor = Codi.tutor && typeof Codi.tutor.embed === 'function'
    ? Codi.tutor.embed(courseId, l.id, { onActivate: activateAi, onShowCode: editorTab ? showEditor : undefined, onClose: closeTutor, title: l.title })
    : <div className="ln-task"><Alert type="info" title="Tutor chưa sẵn sàng" body="Bạn vẫn học tiếp bình thường." /></div>;
  const aiButton = (
    <button ref={aiButtonRef} type="button" className={`btn btn-secondary btn-sm ln-ai-toggle ${tutorOpen ? 'is-on' : ''}`.trim()}
      aria-expanded={tutorOpen} aria-controls="ln-tutor" title={tutorOpen ? 'Đóng Tutor AI' : 'Mở Tutor AI: hỏi về bài này, giải thích lỗi code'}
      onClick={() => (tutorOpen ? closeTutor() : openTutor(true))}>
      <Icon name="sparkles" className="icon-sm" /><span>Tutor AI</span>
    </button>
  );

  const bar = (
    <div className={`ln-bar ${compact ? 'is-compact' : ''}`.trim()} ref={barRef}>
      <div className="ln-bar-row">
        <button type="button" className="btn btn-secondary btn-sm ln-bar-btn" onClick={() => openLessonSheet(path, rows, l.id)}>
          <Icon name="list" className="icon-sm" /><span className="ln-bar-label">Danh sách bài</span></button>
        <div className="ln-bar-title">
          <nav className="ln-crumb" aria-label="Vị trí bài học">
            <Link to={`/learn/${courseId}`}>{path.course.title}</Link>
            {l.chapterTitle ? <><Icon name="chevron-right" className="icon-sm" /><span>{l.chapterTitle}</span></> : null}
          </nav>
          <h1 className="ln-bar-h" id="lesson-title" tabIndex={-1}>{l.title}</h1>
        </div>
        {!compact && <TaskChips items={items} onPick={pickChip} readout={readout} />}
        {ready && !compact && <button type="button" className="btn btn-secondary btn-sm" onClick={complete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học</button>}
        {!compact && aiButton}
        <nav className="ln-bar-nav" aria-label="Điều hướng bài học">
          {prev ? <Link className="btn btn-secondary btn-sm ln-bar-btn" to={`/learn/${courseId}/${prev}`}><Icon name="chevron-left" className="icon-sm" /><span className="ln-bar-label">Bài trước</span></Link> : null}
          {next ? <Link className={`btn ${done ? 'btn-primary' : 'btn-secondary'} btn-sm ln-bar-btn`} to={`/learn/${courseId}/${next}`}><span className="ln-bar-label">Bài sau</span><Icon name="chevron-right" className="icon-sm" /></Link> : null}
        </nav>
      </div>
      {compact && (
        <div className="ln-bar-row ln-bar-tasks">
          <TaskChips items={items} onPick={pickChip} readout={readout} />
          {ready && <button type="button" className="btn btn-primary btn-sm" onClick={complete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học</button>}
          {aiButton}
        </div>
      )}
      {compact && hasTasks && <TabList tabs={mobileTabs} active={mode === 'lesson' ? 'lesson' : tab} label="Khung bài học" className="ln-tabs-top"
        onSelect={(k) => (k === 'lesson' ? showLesson() : selectTab(k))} />}
    </div>
  );

  const notices = (
    <>
      {lock && <PrerequisiteAdvice c={{ id: courseId }} advice={lock} />}
      <OfferCard courseId={courseId} offer={offer} onView={setPath} onDone={() => setOffer(null)} onViewPath={viewPath} onApplied={openPathUpdate} />
    </>
  );
  const left = (
    <section ref={leftRef} className="ln-pane ln-pane-lesson" id={compact && hasTasks ? 'ln-panel-lesson' : 'ln-pane-lesson'}
      role={compact && hasTasks ? 'tabpanel' : undefined} aria-labelledby={compact && hasTasks ? 'ln-tab-lesson' : undefined} aria-label={compact && hasTasks ? undefined : 'Bài học'}
      hidden={compact && mode !== 'lesson'}>
      <div className="ln-lesson-col">
        {path.updating && done && <Alert type="info" body="Codi đang cập nhật lộ trình. Bạn có thể tiếp tục học hoặc quay lại kiểm tra sau." />}
        {justCompleted && <UpdateNotice courseId={courseId} view={path} rows={rows} inPlayer onView={setPath} />}
        {done && path.complete && justCompleted && <CompletionCard view={path} onView={setPath} />}
        {isCode ? (
          <>
            <div className="ln-meta-row"><span className="ln-meta-main">{l.chapterTitle}</span><span className="ln-meta-kind">{TYPE_LABEL[kind]} · {Codi.fmt.duration(Math.round((l.durationSeconds || 0) / 60))}</span></div>
            {l.description && <p className="ln-lead">{l.description}</p>}
            {notices}
            <div id="lesson-task-code">{Codi.code && Codi.code.learner ? Codi.code.learner({ ...codeArgs, part: 'brief' }) : null}</div>
            {(mats.length > 0 || l.body) && <LessonMaterial view={{ ...view, lesson: { ...l, description: null } }} kind={kind} mats={mats} m={material} onPick={setMaterialId} save={save} onStudied={onStudied} studyControl={false} />}
          </>
        ) : (
          <>
            {notices}
            <LessonMaterial view={view} kind={kind} mats={mats} m={material} onPick={setMaterialId} save={save} onStudied={onStudied} studyControl />
          </>
        )}
        <FinishBlock courseId={courseId} items={items} missing={missing} done={done} next={next} completing={completing} onComplete={complete} reviewed={!!path.review} onReview={review} />
        <QaPanel courseId={courseId} lessonId={l.id} lessonTitle={l.title} />
      </div>
    </section>
  );

  const right = hasTasks ? (
    <section className="ln-pane ln-pane-task" aria-label={compact ? undefined : 'Làm bài'} hidden={compact && mode === 'lesson'}>
      {!compact && <TabList tabs={rightTabs} active={tab} label="Khung làm bài" onSelect={selectTab} />}
      {rightTabs.map((t) => (
        <div key={t.key} className="ln-tabpanel" role="tabpanel" id={`ln-panel-${t.key}`} aria-labelledby={`ln-tab-${t.key}`}
          hidden={panelHidden(t.key)}>
          {panels[t.key]()}
        </div>
      ))}
    </section>
  ) : null;

  return (
    <div className={`ln-shell ${compact ? 'is-compact' : ''}`.trim()} ref={shellRef}>
      {bar}
      <div className={`ln-main ${tutorOpen && !compact ? 'has-tutor' : ''}`.trim()}>
        <div className={`ln-split ${hasTasks ? '' : 'is-single'}`.trim()} ref={gridRef} style={compact || !hasTasks ? undefined : { '--ln-left': `${split}%` }}>
          {left}
          {!compact && hasTasks && <SplitDivider value={split} gridRef={gridRef} onCommit={commitSplit} onReset={resetSplit} />}
          {right}
        </div>
        <TutorDock open={tutorOpen} compact={compact} onClose={closeTutor}>{tutor}</TutorDock>
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
    if (error && error.status === 409) {
      return <div className="page page-narrow"><Empty icon="route" title="Thiết lập lộ trình trước khi học" body="Chỉ mất vài phút: đặt mục tiêu và làm bài kiểm tra đầu vào." actions={<Link className="btn btn-primary" to={`/learn/${courseId}/onboarding`}>Bắt đầu thiết lập</Link>} /></div>;
    }
    if (error && (error.status === 404 || error.status === 400)) {
      return <div className="page page-narrow"><Empty icon="map" title="Không tìm thấy bài học" actions={<Link className="btn btn-primary" to={`/learn/${courseId}`}>Về lộ trình</Link>} /></div>;
    }
    return <LoadState loading={loading} error={error} courseId={courseId} onRetry={reload} text="Đang tải bài học…" />;
  }
  return <LessonWorkspace key={`${courseId}:${lessonId}`} courseId={courseId} view={view} send={send} reload={reload} offer={offer} setOffer={setOffer} setPath={setPath} />;
}
