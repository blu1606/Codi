/**
 * Lecturer workspace runtime (port of the shared parts of docs/mockup/js/lecturer.js).
 * Installs Codi.teach = { shell, isMine, notMine, findLesson, contentChanged, persist } — used by the lecturer-ai
 * feature (code editor, AI import/create) and by the insights page. shell/notMine return React elements.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Workspace, Empty, Icon, Alert } from '../../components/ui/primitives';
import './lecturer.css';

export const me = () => Codi.currentUser();
export const myCourses = () => { const u = me(); return u ? Codi.db().courses.filter((c) => c.lecturerId === u.id) : []; };
export const isMine = (c) => !!c && !!me() && c.lecturerId === me().id;
export const byCourse = (list) => { const ids = new Set(myCourses().map((c) => c.id)); return (list || []).filter((x) => ids.has(x.courseId)); };
/** Commits in-place mutations of Codi.db() (sync + re-render). */
export const persist = (render) => Codi.set(() => {}, { render: render !== false });

export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code' };
export const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
export const MATERIAL_TYPES = ['video', 'pdf', 'reading']; // coding lessons are edited in the code editor route
export const ENTRY_MIN = 5; // entry test needs at least this many questions to personalise (A5)
export const LEVELS = [['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']];
export const levelLabel = (k) => (LEVELS.find(([v]) => v === k) || [k, k])[1];
/** Fixed course category list of the real app (lib/course-constants.ts); stored as db.categories ids. */
export const REAL_CATEGORIES = ['Frontend', 'Backend', 'Fullstack', 'Data & AI', 'Mobile', 'Computer Science'];
/** Category options in the real order. A course still on a legacy category keeps it as an extra option. */
export function categoryOptions(currentId) {
  const all = Codi.db().categories || [];
  const list = REAL_CATEGORIES.map((n) => all.find((c) => c.name === n)).filter(Boolean);
  const cur = currentId && !list.some((c) => c.id === currentId) ? all.find((c) => c.id === currentId) : null;
  return cur ? list.concat(cur) : list;
}
export const categoryName = (id) => ((Codi.db().categories || []).find((c) => c.id === id) || {}).name || '';
/** Reviews the real app lists for lecturers: visible ones only. */
export const isVisibleReview = (r) => r.isVisible !== false && !r.hidden;
/** Max signed 32-bit integer, the real price column limit. */
export const PRICE_MAX = 2147483647;
export const decimal = (n) => String(n).replace('.', ',');

export const ls = (c) => Codi.lessons(c);
export const locked = (c) => c.status === 'pending';
export function findLesson(c, id) {
  if (!c) return null;
  for (const ch of c.chapters) { const i = ch.lessons.findIndex((l) => l.id === id); if (i >= 0) return { ch, i, l: ch.lessons[i] }; }
  return null;
}
function recompute(c) {
  const lessons = ls(c);
  c.durationMin = lessons.reduce((s, l) => s + (Number(l.durationMin) || 0), 0);
  c.defaultOrder = lessons.map((l) => l.id);
}
/** Content changed after the map was confirmed → mark it stale (needs re-analysis). Caller persists. */
export function contentChanged(c) {
  recompute(c);
  const m = Codi.db().knowledgeMaps[c.id];
  if (m && m.status === 'confirmed') { m.status = 'stale'; Codi.ui.toast('Nội dung đã đổi: bản đồ kiến thức cần phân tích lại.', { type: 'warn' }); }
  if (m && m.status === 'empty' && ls(c).length) m.status = 'ready';
}

// ───────────────────────── cross-feature helpers (optional namespaces) ─────────────────────────
/** Codi.lecturerAI, or null after telling the user the AI helpers are unavailable. */
export function lecturerAI() {
  if (Codi.lecturerAI && Codi.lecturerAI.task) return Codi.lecturerAI;
  Codi.ui.toast('Trợ lý AI cho giảng viên chưa sẵn sàng.', { type: 'danger' });
  return null;
}
export const reviewRound = (c) => (Codi.review && Codi.review.lecturerRound ? Codi.review.lecturerRound(c) : null);
export const reviewFlagsFor = (r, lessonId) => (r && Codi.review && Codi.review.flagsFor ? Codi.review.flagsFor(r, lessonId) : []);

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
export function counts() {
  return {
    grading: byCourse(Codi.db().submissions).filter((s) => s.status === 'pending').length,
    questions: byCourse(Codi.db().questions).filter((q) => q.status === 'unanswered').length,
    reviews: byCourse(Codi.db().reviews).filter((r) => isVisibleReview(r) && !r.reply).length,
  };
}

function TeachShell({ active, children }) {
  useCodi();
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

Object.assign(Codi, { teach: { shell, isMine, notMine, findLesson, contentChanged, persist } });
