/**
 * S11 Lesson player ('/learn/:courseId/:lessonId') + S11b Hỏi đáp (port of real
 * app/learn/[courseId]/[lessonId]/lesson-player.tsx), laid out as a split pane (approved direction "Chia đôi màn hình").
 *
 * - Lesson bar (sticky under the header): "Danh sách bài" (lesson list sheet), breadcrumb + title, one chip per
 *   checklist task (icon + text, done / active / todo), "Hoàn thành bài học" once every task is done, Bài trước / Bài sau.
 * - Left pane: the material (video in a navy frame, PDF, reading) or the coding brief, the prerequisite note,
 *   notices, sources and the completion checklist. Scrolls on its own.
 * - Right pane: tabs Quiz · Bài tập · Code (only those the lesson has) · AI trợ lý · Hỏi đáp (n). The default tab is
 *   the lesson's main task. The AI tutor is Codi.tutor.embed (never a floating overlay) and Codi.code.view renders the
 *   editor + console here with its brief on the left. Every panel stays mounted, so drafts, quiz position and the
 *   tutor thread survive tab switches.
 * - A draggable divider (pointer + arrow keys, 35–70 %, saved per layout tier) separates the panes.
 * - Below 1024 px the two panes become top-level tabs ("Bài học" · task tabs) under a compact lesson bar.
 * Focused time on this page is credited to the learner's study days (study-time.js).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { LecturerConversation, learnerConversation } from './lecturer-conversation';
import { PathMap, PrerequisiteAdvice, pathRows } from './path-views';
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

function LessonSheetBody({ courseId, lessonId }) {
  useCodi();
  const c = Codi.course(courseId);
  if (!c) return null;
  const prog = Codi.courseProgress(c.id);
  return (
    <div className="stack-4">
      <div className="ln-sheet-head">
        <strong className="ln-side-course">{c.title}</strong>
        <Progress pct={prog.pct} label="Tiến độ khoá học" />
        <span className="xsmall muted">{prog.done}/{prog.total} bài · {prog.pct}%</span>
        <div className="row ln-gap-2">
          <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}`} data-close=""><Icon name="arrow-left" className="icon-sm" /> Về lộ trình</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPathMap(c.id)}><Icon name="map" className="icon-sm" /> Xem lộ trình</button>
        </div>
      </div>
      <SidebarList courseId={c.id} activeId={lessonId} inSheet />
    </div>
  );
}

function openLessonSheet(courseId, lessonId) {
  // opens on the left, beside the lesson material it replaces
  Codi.ui.sheet({ title: 'Danh sách bài học', side: 'left', body: () => <LessonSheetBody courseId={courseId} lessonId={lessonId} /> });
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

// ───────────────────────── S11b Hỏi đáp ─────────────────────────
const lessonQuestions = (lessonId) => Codi.db().questions.filter((q) => q.lessonId === lessonId);

function QaPanel({ courseId, lessonId }) {
  useCodi();
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const l = Codi.lesson(Codi.course(courseId), lessonId);
  if (!l) return null;
  const qs = lessonQuestions(l.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
    <section className="ln-task" aria-label="Hỏi đáp">
      <LecturerConversation courseId={courseId} lessonId={lessonId} />
      {qs.length ? (
        <ul className="list stack-3">{qs.map((q) => {
          const u = Codi.user(q.userId) || { name: 'Học viên' };
          return (
            <li key={q.id} className="ln-qa-item stack-2">
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
      <form className={`ln-dock ln-dock-form stack-2 field ${err ? 'is-invalid' : ''}`} noValidate onSubmit={post}><label htmlFor="qa-text">Câu hỏi của bạn về bài &ldquo;{l.title}&rdquo;</label>
        <textarea id="qa-text" name="text" rows={3} placeholder="Mô tả chỗ bạn chưa hiểu, kèm đoạn mã nếu có..." value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        {err ? <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{err}</span></p> : <span className="field-help">Giảng viên và học viên cùng khoá đều xem được câu hỏi.</span>}
        <div><button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy || undefined}>Gửi câu hỏi</button></div></form>
    </section>
  );
}

// ───────────────────────── lesson bar ─────────────────────────
const CHIP_ICON = { done: 'check-circle', active: 'circle-dot', todo: 'circle' };
function TaskChips({ items, onPick }) {
  const activeKey = (items.find((x) => !x.done) || {}).key;
  return (
    <ul className="ln-chips" aria-label="Việc cần làm để hoàn thành bài">
      {items.map((it) => {
        const state = it.done ? 'done' : it.key === activeKey ? 'active' : 'todo';
        return (
          <li key={it.key}>
            <button type="button" className={`ln-chip is-${state}`} title={it.note} onClick={() => onPick(it.key)}>
              <Icon name={CHIP_ICON[state]} className="icon-sm" /><span>{it.label}</span>
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
function LessonMaterial({ c, r, l, kind, chapter }) {
  const mats = materialsOf(l);
  const [materialId, setMaterialId] = useState(mats[0] ? mats[0].id : null);
  const m = mats.find((x) => x.id === materialId) || mats[0] || null;
  const body = l.body || l.reading || '';
  const studied = r.studied.includes(l.id);
  return (
    <section id="lesson-task-study" className="ln-material" aria-label="Nội dung bài học">
      <div className="ln-meta-row">
        {mats.length > 1 ? (
          <div className="ln-material-pick"><label htmlFor="lesson-material">Tài liệu bài học</label>
            <select id="lesson-material" className="input" value={m ? m.id : ''} onChange={(e) => setMaterialId(e.target.value)}>
              {mats.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select></div>
        ) : <span className="ln-meta-main">{m ? m.title : chapter ? chapter.title : ''}</span>}
        <span className="ln-meta-kind">{TYPE_LABEL[kind] || TYPE_LABEL.reading} · {Codi.fmt.duration(l.durationMin)}</span>
      </div>
      {m && <MaterialView key={m.id} c={c} l={l} m={m} />}
      {l.description && <p className="ln-lead">{l.description}</p>}
      {body ? (
        <article className="ln-reading" aria-labelledby="lesson-reading-h">
          <h2 className="ln-reading-h" id="lesson-reading-h">{m ? 'Tóm tắt bài học (bài đọc)' : 'Nội dung bài học'}</h2>
          <LessonMarkdown text={body} />
        </article>
      ) : !m && <Alert type="info" title="Chưa có nội dung bài học" body="Bài học chưa có tài liệu hoặc bài đọc." />}
      <div className="ln-studied">{studied
        ? <p className="row small strong text-success"><Icon name="check-circle" /> Đã học xong nội dung</p>
        : <button type="button" className="btn btn-secondary" disabled={!body && !m} onClick={() => markStudied(c.id, l.id)}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã học xong</button>}</div>
    </section>
  );
}

function FinishBlock({ c, items, missing, done, next, completing, onComplete, reviewed }) {
  return (
    <section className="ln-finish" id="checklist" aria-labelledby="ln-finish-h">
      <h2 className="ln-h" id="ln-finish-h">Để hoàn thành bài học</h2>
      <ol className="ln-check-items">{items.map((it) => (
        <li key={it.key} className={it.done ? 'is-done' : ''}><Icon name={it.done ? 'check-circle' : 'circle'} className={it.done ? 'text-success' : 'muted'} />
          <div className="stack-1"><span className="strong">{it.label}<span className="sr-only">{it.done ? ': đã xong' : ': chưa xong'}</span></span>{it.note && <span className="small muted">{it.note}</span>}</div></li>
      ))}</ol>
      {done ? (
        <div className="row"><p className="row strong text-success"><Icon name="check-circle" /> Đã hoàn thành bài học</p>{next && <Link className="btn btn-primary" to={`/learn/${c.id}/${next}`}>Bài tiếp theo <Icon name="arrow-right" className="icon-sm" /></Link>}</div>
      ) : (
        <div className="ln-complete-bar"><button type="button" className="btn btn-primary btn-lg" onClick={onComplete} disabled={completing || missing.length > 0} aria-busy={completing || undefined}>Hoàn thành bài học</button>
          {missing.length ? <span className="small muted">Còn thiếu: {missing.join(', ')}</span> : <span className="small text-success">Bạn đã đủ điều kiện hoàn thành bài học.</span>}</div>
      )}
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => openReview(c.id, 0)}><Icon name="star" className="icon-sm" /> {reviewed ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button></div>
    </section>
  );
}

// ───────────────────────── workspace (one lesson) ─────────────────────────
const TAB_LABEL = { lesson: 'Bài học', quiz: 'Quiz', assignment: 'Bài tập', code: 'Code', ai: 'AI trợ lý', qa: 'Hỏi đáp' };

function LessonWorkspace({ c, r, l }) {
  const compact = useMedia(COMPACT_QUERY);
  const narrow = useMedia(NARROW_QUERY);
  const [completing, setCompleting] = useState(false);
  const isCode = !!l.code;
  const items = checklist(r, l);
  const taskKeys = [isCode && 'code', l.quiz && 'quiz', l.assignment && 'assignment'].filter(Boolean);
  const [tab, setTab] = useState(() => {
    const open = taskKeys.find((k) => { const it = items.find((x) => x.key === k); return it && !it.done; });
    return open || taskKeys[0] || 'ai';
  });
  const [view, setView] = useState('lesson'); // compact layout only: 'lesson' | 'task'
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
    setTab(k); setView('task');
    if (window.matchMedia(COMPACT_QUERY).matches) window.scrollTo({ top: 0 });
  }, []);
  const showLesson = () => {
    setView('lesson');
    if (window.matchMedia(COMPACT_QUERY).matches) { window.scrollTo({ top: 0 }); return; }
    const el = leftRef.current;
    if (el) el.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // 'Tiếp tục' after a quiz or a passed code run: show the checklist (in the lesson pane, a tab on phones).
  const goChecklist = () => {
    setView('lesson');
    requestAnimationFrame(() => { const el = document.getElementById('checklist'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };
  const pickChip = (key) => { if (key === 'study') showLesson(); else if (taskKeys.includes(key)) selectTab(key); };
  // The tutor asks to be shown when explain-error / selection / "Hỏi AI" target this lesson.
  const activateAi = useCallback(() => selectTab('ai'), [selectTab]);

  const lock = lockInfo(c, r, l);
  const order = orderOf(c, r); const idx = order.indexOf(l.id);
  const prev = idx > 0 ? order[idx - 1] : null; const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const missing = items.filter((x) => !x.done).map((x) => x.label);
  const done = r.completed.includes(l.id);
  const ready = !done && missing.length === 0;
  const chapter = Codi.chapterOf(c, l.id);
  const kind = l.code ? (l.code.kind === 'tutorial' ? 'tutorial' : 'code') : l.type;
  const reviewed = Codi.db().reviews.some((x) => x.courseId === c.id && x.userId === uid());
  const justCompleted = done && r.lastUpdate && r.lastUpdate.afterLessonId === l.id;
  const qaCount = lessonQuestions(l.id).length + (learnerConversation(c.id, l.id) ? 1 : 0);

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

  const rightTabs = [...taskKeys, 'ai', 'qa'].map((k) => ({ key: k, label: TAB_LABEL[k], count: k === 'qa' ? qaCount : 0 }));
  const mobileTabs = [{ key: 'lesson', label: TAB_LABEL.lesson }, ...rightTabs];
  const panelHidden = (k) => k !== tab || (compact && view === 'lesson');

  const panels = {
    quiz: () => <QuizSection key={l.id} c={c} r={r} l={l} bare onContinue={goChecklist} />,
    assignment: () => <AssignmentSection key={l.id} c={c} r={r} l={l} bare />,
    code: () => <div className="ln-code-work">{Codi.code && Codi.code.view ? Codi.code.view(c, l, { part: 'work', onContinue: goChecklist }) : null}</div>,
    ai: () => (Codi.tutor && typeof Codi.tutor.embed === 'function'
      ? Codi.tutor.embed(c.id, l.id, { onActivate: activateAi })
      : <div className="ln-task"><Alert type="info" title="AI trợ lý chưa sẵn sàng" body="Bạn vẫn học tiếp bình thường." /></div>),
    qa: () => <QaPanel courseId={c.id} lessonId={l.id} />,
  };

  const bar = (
    <div className={`ln-bar ${compact ? 'is-compact' : ''}`.trim()} ref={barRef}>
      <div className="ln-bar-row">
        <button type="button" className="btn btn-secondary btn-sm ln-bar-btn" onClick={() => openLessonSheet(c.id, l.id)}>
          <Icon name="list" className="icon-sm" /><span className="ln-bar-label">Danh sách bài</span></button>
        <div className="ln-bar-title">
          <nav className="ln-crumb" aria-label="Vị trí bài học">
            <Link to={`/learn/${c.id}`}>{c.title}</Link>
            {chapter ? <><Icon name="chevron-right" className="icon-sm" /><span>{chapter.title}</span></> : null}
          </nav>
          <h1 className="ln-bar-h" id="lesson-title" tabIndex={-1}>{l.title}</h1>
        </div>
        {!compact && <TaskChips items={items} onPick={pickChip} />}
        {ready && !compact && <button type="button" className="btn btn-primary btn-sm" onClick={complete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học</button>}
        <nav className="ln-bar-nav" aria-label="Điều hướng bài học">
          {prev ? <Link className="btn btn-secondary btn-sm ln-bar-btn" to={`/learn/${c.id}/${prev}`}><Icon name="chevron-left" className="icon-sm" /><span className="ln-bar-label">Bài trước</span></Link> : null}
          {next ? <Link className={`btn ${done ? 'btn-primary' : 'btn-secondary'} btn-sm ln-bar-btn`} to={`/learn/${c.id}/${next}`}><span className="ln-bar-label">Bài sau</span><Icon name="chevron-right" className="icon-sm" /></Link> : null}
        </nav>
      </div>
      {compact && (
        <div className="ln-bar-row ln-bar-tasks">
          <TaskChips items={items} onPick={pickChip} />
          {ready && <button type="button" className="btn btn-primary btn-sm" onClick={complete} disabled={completing} aria-busy={completing || undefined}>Hoàn thành bài học</button>}
        </div>
      )}
      {compact && <TabList tabs={mobileTabs} active={view === 'lesson' ? 'lesson' : tab} label="Khung bài học" className="ln-tabs-top"
        onSelect={(k) => (k === 'lesson' ? showLesson() : selectTab(k))} />}
    </div>
  );

  const left = (
    <section ref={leftRef} className="ln-pane ln-pane-lesson" id={compact ? 'ln-panel-lesson' : 'ln-pane-lesson'}
      role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? 'ln-tab-lesson' : undefined} aria-label={compact ? undefined : 'Bài học'}
      hidden={compact && view !== 'lesson'}>
      <div className="ln-lesson-col">
        {justCompleted && <UpdateNotice c={c} r={r} inPlayer />}
        {done && isCourseComplete(c, r) && justCompleted && <CompletionCard c={c} />}
        {isCode ? (
          <>
            <div className="ln-meta-row"><span className="ln-meta-main">{chapter ? chapter.title : ''}</span><span className="ln-meta-kind">{TYPE_LABEL[kind]} · {Codi.fmt.duration(l.durationMin)}</span></div>
            {l.description && <p className="ln-lead">{l.description}</p>}
            {lock && !done && <PrerequisiteAdvice c={c} advice={{ concept: lock.concept, lessonId: lock.lesson.id, lessonTitle: lock.lesson.title }} />}
            <OfferCard c={c} r={r} onViewPath={() => openPathMap(c.id, l.id)} />
            <div id="lesson-task-code">{Codi.code && Codi.code.view ? Codi.code.view(c, l, { part: 'brief' }) : null}</div>
          </>
        ) : (
          <>
            {lock && !done && <PrerequisiteAdvice c={c} advice={{ concept: lock.concept, lessonId: lock.lesson.id, lessonTitle: lock.lesson.title }} />}
            <OfferCard c={c} r={r} onViewPath={() => openPathMap(c.id, l.id)} />
            <LessonMaterial c={c} r={r} l={l} kind={kind} chapter={chapter} />
          </>
        )}
        <FinishBlock c={c} items={items} missing={missing} done={done} next={next} completing={completing} onComplete={complete} reviewed={reviewed} />
      </div>
    </section>
  );

  const right = (
    <section className="ln-pane ln-pane-task" aria-label={compact ? undefined : 'Làm bài'} hidden={compact && view === 'lesson'}>
      {!compact && <TabList tabs={rightTabs} active={tab} label="Khung làm bài" onSelect={selectTab} />}
      {rightTabs.map((t) => (
        <div key={t.key} className="ln-tabpanel" role="tabpanel" id={`ln-panel-${t.key}`} aria-labelledby={`ln-tab-${t.key}`}
          hidden={panelHidden(t.key)} data-tutor-scroll={t.key === 'ai' ? '' : undefined}>
          {panels[t.key]()}
        </div>
      ))}
    </section>
  );

  return (
    <div className={`ln-shell ${compact ? 'is-compact' : ''}`.trim()} ref={shellRef}>
      {bar}
      <div className="ln-split" ref={gridRef} style={compact ? undefined : { '--ln-left': `${split}%` }}>
        {left}
        {!compact && <SplitDivider value={split} gridRef={gridRef} onCommit={commitSplit} onReset={resetSplit} />}
        {right}
      </div>
    </div>
  );
}

// ───────────────────────── page ─────────────────────────
export default function LessonPlayerPage({ params }) {
  useCodi();
  const c = Codi.course(params.courseId);
  const lessonId = params.lessonId;
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
  return <LessonWorkspace key={`${c.id}:${l.id}`} c={c} r={r} l={l} />;
}
