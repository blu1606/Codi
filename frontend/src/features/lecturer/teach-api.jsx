/**
 * Lecturer workspace runtime (port of the shared parts of docs/mockup/js/lecturer.js).
 * Installs Codi.teach = { shell, isMine, notMine, findLesson, contentChanged, persist } — used by the lecturer-ai
 * feature (code editor, AI import/create) and by the insights page. shell/notMine return React elements.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { act, cachedCourse, mineNow, reloadCourse, reloadMine, useMine } from './teach-data';
import { Workspace, Empty, Icon, Alert } from '../../components/ui/primitives';
import './lecturer.css';

/** Signed-in lecturer from the backend session ({ id, name, email, image }). */
export const me = () => (Codi.session && Codi.session.user) || null;
/** Lecturer's courses from the backend list (LecturerCourseItem[]); empty until loaded. */
export const myCourses = () => mineNow().list || [];

export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code' };
export const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
export const ENTRY_MIN = 5; // entry test needs at least this many questions to personalise (A5)
export const LEVELS = [['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']];
export const levelLabel = (k) => (LEVELS.find(([v]) => v === k) || [k, k])[1];
/** Fixed course category list of the real app (lib/course-constants.ts). */
export const REAL_CATEGORIES = ['Frontend', 'Backend', 'Fullstack', 'Data & AI', 'Mobile', 'Computer Science'];
/** Category names in the real order. A course still on a legacy category keeps it as an extra option. */
export function categoryOptions(current) {
  return current && !REAL_CATEGORIES.includes(current) ? REAL_CATEGORIES.concat(current) : REAL_CATEGORIES;
}
/** Max signed 32-bit integer, the real price column limit. */
export const PRICE_MAX = 2147483647;
export const decimal = (n) => String(n).replace('.', ',');

export const ls = (c) => (c ? c.chapters.flatMap((ch) => ch.lessons) : []);
export const locked = (c) => !!c && (c.isLocked || c.status === 'pending');
export function findLesson(c, id) {
  if (!c) return null;
  for (const ch of c.chapters) { const i = ch.lessons.findIndex((l) => l.id === id); if (i >= 0) return { ch, i, l: ch.lessons[i] }; }
  return null;
}
/** Course content changed on the server: refetch the editor data (the backend marks a confirmed map stale). */
export const contentChanged = (c) => (c && c.id ? reloadCourse(c.id) : Promise.resolve(null));
/** Refreshes the lecturer lists and counts after a backend write. */
export const persist = () => reloadMine();
/** Lecturer's own course; backend data is already scoped to the signed-in lecturer. */
export const isMine = (c) => !!c && !!c.id;

// ───────────────────────── cross-feature helpers (optional namespaces) ─────────────────────────
/** Codi.lecturerAI, or null after telling the user the AI helpers are unavailable. */
export function lecturerAI() {
  if (Codi.lecturerAI && Codi.lecturerAI.task) return Codi.lecturerAI;
  Codi.ui.toast('Trợ lý AI cho giảng viên chưa sẵn sàng.', { type: 'danger' });
  return null;
}
/** Newest decided publication round (Codi getPublicationData.round), or null while it is still in review. */
export const reviewRound = (c) => (c && c.round && c.round.status !== 'in_review' ? c.round : null);
export const reviewFlagsFor = (r, lessonId) => (r ? (r.flags || []).filter((f) => f.lessonId === lessonId || (f.target && f.target.lessonId === lessonId)) : []);

// ───────────────────────── unsaved-changes guard (Thông tin tab, quiz builder) ─────────────────────────
// guard.dirty = { label, scope, reset } while a form has unsaved edits. Clicking a link (or [data-go]) outside
// [data-dirty-scope] asks before leaving; leaving discards the draft via reset().
export const guard = { dirty: null };
export function discardDirty() {
  const d = guard.dirty;
  guard.dirty = null;
  if (d && d.reset) d.reset();
}
if (typeof document !== 'undefined' && !window.__codiTeachGuard) {
  window.__codiTeachGuard = true;
  document.addEventListener('click', (e) => {
    if (!guard.dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href^="/"], [data-go]');
    if (!a || a.closest('[data-dirty-scope]') || a.getAttribute('target') === '_blank') return;
    const target = a.getAttribute('data-go') || a.getAttribute('href');
    if (target === window.location.pathname + window.location.search) return;
    e.preventDefault(); e.stopImmediatePropagation();
    Codi.ui.confirm({ title: 'Có thay đổi chưa lưu', body: `${guard.dirty.label} có thay đổi chưa được lưu.`, consequence: 'Rời trang sẽ bỏ các thay đổi này.', reversible: 'Các thay đổi chưa lưu không thể khôi phục.', confirmLabel: 'Rời trang, bỏ thay đổi', cancelLabel: 'Ở lại', danger: true })
      .then((r) => { if (r.ok) { discardDirty(); Codi.go(target); } });
  }, true);
  // closing the tab or reloading with unsaved edits asks the browser to confirm (real course editor)
  window.addEventListener('beforeunload', (e) => {
    if (!guard.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

// ───────────────────────── workspace shell ─────────────────────────
/** To-do counts of the lecturer dashboard (grading / questions / reviews); zeros until loaded. */
export function counts() {
  const st = mineNow().stats;
  const n = (st && st.counts) || {};
  return { grading: n.grading || 0, questions: n.questions || 0, reviews: n.reviews || 0 };
}

function TeachShell({ active, children }) {
  useCodi();
  useMine();
  const path = Codi.path();
  useEffect(() => {
    // navigation by other means (back button, programmatic) leaves the dirty scope → drop the draft
    if (guard.dirty && !path.startsWith(guard.dirty.scope)) discardDirty();
  }, [path]);
  const n = counts();
  return (
    <Workspace
      label="Khu vực giảng dạy"
      active={active}
      items={[
        { section: 'Giảng dạy', href: '/teach', label: 'Tổng quan', icon: 'layout-dashboard' },
        { section: 'Giảng dạy', href: '/teach/courses', label: 'Khoá học của tôi', icon: 'book-open', match: /^\/teach\/(courses|new)/ },
        { section: 'Hỗ trợ học viên', href: '/teach/grading', label: 'Chấm bài', icon: 'clipboard-check', count: n.grading, match: /^\/teach\/grading/ },
        { section: 'Hỗ trợ học viên', href: '/teach/questions', label: 'Hỏi đáp', icon: 'message-circle', count: n.questions },
        { section: 'Hỗ trợ học viên', href: '/teach/reviews', label: 'Đánh giá', icon: 'star', count: n.reviews },
        { section: 'Hỗ trợ học viên', href: '/teach/progress', label: 'Tiến độ học viên', icon: 'bar-chart', match: /^\/teach\/progress/ },
        { section: 'Kinh doanh', href: '/teach/insights', label: 'Doanh thu', icon: 'trending-up', match: /^\/teach\/insights/ },
      ]}
    >
      {children}
    </Workspace>
  );
}

/** shell(active, body) → workspace element with the lecturer left nav. */
export const shell = (active, body) => <TeachShell active={active}>{body}</TeachShell>;
export const notMine = () => shell('', (
  <Empty icon="lock" title="Không tìm thấy khoá học của bạn" body="Khoá học không tồn tại hoặc thuộc giảng viên khác."
    actions={<Link className="btn btn-primary" to="/teach/courses">Về danh sách khoá học</Link>} />
));

/** Skeleton rows while backend data loads. */
export function Loading({ rows = 3, label = 'Đang tải dữ liệu…' }) {
  return (
    <div className="card" role="status" aria-busy="true"><div className="card-body stack-2"><span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton skeleton-line" style={{ height: 40, width: i === rows - 1 ? '66%' : '100%' }} />)}</div></div>
  );
}
/** Load failure with a retry button. */
export function LoadError({ error, onRetry, title = 'Không tải được dữ liệu' }) {
  return <Alert type="danger" title={title} body={(error && error.message) || 'Vui lòng thử lại.'}
    actions={onRetry ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRetry()}><Icon name="refresh" className="icon-sm" /> Thử lại</button> : null} />;
}

/** Inline field error (mockup err(k)). */
export function FieldError({ children }) {
  if (!children) return null;
  return <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{children}</span></p>;
}

/** "AI is working" row with a stop button (shared by quiz AI, rubric AI, grading AI). */
export function AIThinking({ text, onStop }) {
  return (
    <div className="ai-thinking-row" aria-busy="true">
      <span className="typing" aria-hidden="true"><i /><i /><i /></span><span>{text}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onStop}>Dừng</button>
    </div>
  );
}

// ───────────────────────── confirm with a minimum-length reason ─────────────────────────
function ReasonBody({ o, handle, resolve }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const ok = () => {
    if (text.trim().length < (o.min || 1)) { setErr(o.error || 'Vui lòng nhập lý do.'); return; }
    resolve({ ok: true, reason: text.trim() });
    handle.close();
  };
  return (
    <>
      <div className="dialog-body stack-3">
        {o.body && <div>{o.body}</div>}
        {o.consequence && <Alert type={o.danger ? 'danger' : 'warn'} title="Điều gì sẽ xảy ra" body={o.consequence} />}
        {o.reversible && <p className="small muted"><Icon name="rotate-ccw" className="icon-sm" /> {o.reversible}</p>}
        <div className={`field ${err ? 'is-invalid' : ''}`}>
          <label htmlFor="tc-reason">{o.label} <span className="req">*</span></label>
          <textarea id="tc-reason" rows={3} placeholder={o.placeholder || ''} value={text} autoFocus aria-invalid={!!err}
            onChange={(e) => { setText(e.target.value); setErr(null); }} />
          {err ? <FieldError>{err}</FieldError> : o.help ? <span className="field-help">{o.help}</span> : null}
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={() => handle.close()}>{o.cancelLabel || 'Huỷ'}</button>
        <button type="button" className={`btn ${o.danger ? 'btn-danger' : 'btn-primary'}`} onClick={ok}>{o.confirmLabel || 'Xác nhận'}</button>
      </div>
    </>
  );
}
/**
 * Confirm dialog that requires a reason of at least `min` characters (real score-edit and review-flag rules).
 * Resolves { ok, reason }.
 */
export function promptReason(o) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    Codi.ui.modal({ title: o.title, raw: true, body: (h) => <ReasonBody o={o} handle={h} resolve={finish} />, onClose: () => finish({ ok: false }) });
  });
}

/** Backend writes used by the lecturer-ai feature (they refresh the cached course afterwards). */
/** Changes some fields of a saved lesson and keeps the rest: { title?, body?, durationMinutes?, addMaterial? }. */
async function patchLesson(courseId, lessonId, patch) {
  const det = await act('course', 'getLessonDetails', courseId, lessonId);
  const l = det.lesson;
  const materials = (det.materials || []).map((m) => ({ id: m.id, type: m.type, title: m.title, url: m.url, fileSizeKb: m.fileSizeKb || undefined, durationSeconds: m.durationSeconds || undefined }));
  if (patch.addMaterial && !materials.some((m) => m.url === patch.addMaterial.url)) materials.push(patch.addMaterial);
  await act('course', 'updateLesson', courseId, lessonId, {
    title: patch.title || l.title, description: l.description || '',
    durationMinutes: patch.durationMinutes || Math.round((l.durationSeconds || 0) / 60),
    body: patch.body != null ? patch.body : l.body || '', isFreePreview: !!l.isFreePreview, materials,
  });
}
const saveLessonBody = (courseId, lessonId, body) => patchLesson(courseId, lessonId, { body });
async function appendQuizQuestions(courseId, lessonId, questions) {
  const q = await act('course', 'getQuizBuilderData', courseId, lessonId);
  const keep = (q.questions || []).map((x) => ({ text: x.text, explanation: x.explanation || '', correctIndex: x.correctIndex, options: x.options }));
  await act('course', 'saveQuizData', courseId, lessonId, {
    passingScore: q.passingScore || 70, isEntry: false,
    questions: keep.concat(questions.map((x) => ({ text: x.text, explanation: x.explanation || '', correctIndex: x.correctIndex, options: x.options, aiGenerated: true, aiReviewed: true }))),
  });
}

Object.assign(Codi, { teach: { shell, isMine, notMine, findLesson, contentChanged, persist, course: cachedCourse, reloadCourse, act, saveLessonBody, patchLesson, appendQuizQuestions } });
