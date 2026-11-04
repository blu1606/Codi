/**
 * Backend data for the lecturer workspace: server-action calls, the "my courses" list + dashboard counts, and a
 * per-course cache that maps Codi's editor DTOs to the course shape the editor screens render.
 *
 *   act('course', 'renameLesson', courseId, lessonId, title)   POST /api/actions/<module>/<name>
 *   useMine() → { list, stats, loading, error }                 getLecturerCourses + getLecturerDashboardStats
 *   useCourse(id) → { c, loading, error }                       getCourseEditorData + outline + getPublicationData
 *   reloadCourse(id), reloadMine()                              refetch after a write (subscribers re-render)
 *
 * Course shape: { id, slug, title, summary, category, level, status, price, proposedPrice, rejectReason,
 * hideReason, reviewOutcome, outcomes[], requirements[], durationMin, isLocked, enrolledCount, knowledgeMapStatus,
 * coverImageUrl, chapters[{ id, title, lessons[{ id, title, description, durationMin, isFreePreview, type,
 * materials[{type,title}], quiz:{count}|null, code:{kind,tests,hiddenTests,verified}|null,
 * assignment:{rubricCount}|null }] }], entryTest:{count}|null, readiness[{key,ok,label,hint,href,action}],
 * round (publication round with flags[]) | null }.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';

const MODULES = {
  lecturer: 'dashboard/lecturer',
  course: 'dashboard/lecturer/courses/courseId',
  code: 'dashboard/lecturer/courses/courseId/code',
  kmap: 'dashboard/lecturer/courses/courseId/kmap',
  publish: 'dashboard/lecturer/courses/courseId/publish',
  grading: 'dashboard/lecturer/grading',
  insights: 'dashboard/lecturer/insights',
  progress: 'dashboard/lecturer/progress',
  questions: 'dashboard/lecturer/questions',
  reviews: 'dashboard/lecturer/reviews',
  snippets: 'dashboard/lecturer/snippets',
};
/** Calls a lecturer server action by short module name. */
export const act = (mod, name, ...args) => api.action(MODULES[mod], name, ...args);

/** Codi links point at /dashboard/lecturer/…; the rebuild serves the same screens under /teach/…. */
export const teachHref = (href) => (href ? String(href).replace(/^\/dashboard\/lecturer/, '/teach') : '');

// ───────────────────────── tiny store ─────────────────────────
let version = 0;
const subs = new Set();
const bump = () => { version += 1; subs.forEach((f) => f()); };
const useStore = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);

// ───────────────────────── my courses + counts ─────────────────────────
let mine = { list: null, stats: null, loading: false, error: null, promise: null };
export function reloadMine() {
  mine = { ...mine, loading: true, error: null };
  bump();
  const p = Promise.all([act('lecturer', 'getLecturerCourses', 'all'), act('lecturer', 'getLecturerDashboardStats')])
    .then(([list, stats]) => { mine = { list, stats, loading: false, error: null, promise: null }; })
    .catch((error) => { mine = { ...mine, loading: false, error, promise: null }; })
    .finally(bump);
  mine.promise = p;
  return p;
}
/** Current list state without subscribing. */
export const mineNow = () => mine;
/** Lecturer's courses (LecturerCourseItem[]) and dashboard counts; loaded once, refreshed by reloadMine(). */
export function useMine() {
  useStore();
  useEffect(() => { if (!mine.list && !mine.loading && !mine.error) reloadMine(); }, []);
  return mine;
}

// ───────────────────────── one course ─────────────────────────
const cache = new Map(); // id → { c, loading, error }

const ACTIONS = { desc: 'Viết mô tả', lessons: 'Thêm bài học', price: 'Nhập giá', entry: 'Tạo bài kiểm tra', kmap: 'Xem và xác nhận', code: 'Mở bài code', ai: 'Duyệt câu hỏi', assignment: 'Thêm thang chấm' };

function lessonType(o) {
  if (o && o.code) return o.code.kind === 'tutorial' ? 'tutorial' : 'code';
  const t = o && o.materials && o.materials[0] && o.materials[0].type;
  return t === 'video' ? 'video' : t === 'pdf' || t === 'slide' ? 'pdf' : 'reading';
}

export function toCourse(editor, outline, pub) {
  const co = editor.course; const det = editor.details || {};
  const info = (outline && outline.lessons) || {};
  const chapters = (editor.chapters || []).map((ch) => ({
    id: ch.id, title: ch.title,
    lessons: (ch.lessons || []).map((l) => {
      const o = info[l.id] || {};
      return {
        id: l.id, chapterId: ch.id, title: l.title, description: l.description || '', durationMin: Math.round((l.durationSeconds || 0) / 60),
        isFreePreview: !!l.isFreePreview, type: lessonType(o), materials: o.materials || [], quiz: o.quiz || null, code: o.code || null,
        assignment: o.assignment || null,
      };
    }),
  }));
  const lessons = chapters.flatMap((ch) => ch.lessons);
  const p = (pub && pub.course) || {};
  return {
    id: co.id, slug: co.slug, title: co.title, summary: co.description || '', category: co.category, level: co.level,
    status: co.status, price: co.price, proposedPrice: co.proposedPrice, rejectReason: p.rejectReason || null,
    hideReason: co.hiddenReason || null, reviewOutcome: p.reviewOutcome || null, publishedAt: co.publishedAt,
    outcomes: det.learningOutcomes || [], requirements: det.requirements || [], coverImageUrl: det.coverImageUrl || null,
    durationMin: lessons.reduce((s, l) => s + l.durationMin, 0), isLocked: !!editor.isLocked,
    enrolledCount: (outline && outline.enrolledCount) || 0, knowledgeMapStatus: p.knowledgeMapStatus || co.knowledgeMapStatus,
    chapters, entryTest: editor.entryTest ? { id: editor.entryTest.id, count: editor.entryTest.count || 0 } : null,
    readiness: ((pub && pub.readiness && pub.readiness.items) || []).map((x) => ({ ...x, href: teachHref(x.href), action: ACTIONS[x.key] || 'Mở để sửa', hint: x.ok ? '' : x.hint })),
    round: (pub && pub.round) || null,
  };
}

export async function reloadCourse(id) {
  const prev = cache.get(id);
  cache.set(id, { c: prev ? prev.c : null, loading: true, error: null });
  bump();
  try {
    const [editor, outline, pub] = await Promise.all([
      act('course', 'getCourseEditorData', id),
      api.get(`/api/lecturer/courses/${encodeURIComponent(id)}`),
      act('publish', 'getPublicationData', id),
    ]);
    cache.set(id, { c: toCourse(editor, outline, pub), loading: false, error: null });
  } catch (error) {
    cache.set(id, { c: null, loading: false, error });
  }
  bump();
  return cache.get(id).c;
}
/** Cached course for the editor screens; fetches on first use. */
export function useCourse(id) {
  useStore();
  useEffect(() => { if (id && !cache.has(id)) reloadCourse(id); }, [id]);
  const s = (id && cache.get(id)) || { c: null, loading: !!id, error: null };
  return s;
}
/** Last loaded course (no fetch), for helpers that run outside React. */
export const cachedCourse = (id) => (cache.get(id) || {}).c || null;
/** Drops a course from the cache (after delete). */
export function forgetCourse(id) { cache.delete(id); bump(); }

/** Runs a content write, toasts its error, then refreshes the course (and the list counts). Returns the result or null. */
export async function write(courseId, run, { toast, okMessage } = {}) {
  try {
    const r = await run();
    if (r && r.success === false) {
      const msg = (r.errors && Object.values(r.errors)[0]) || r.error || 'Không thể lưu thay đổi.';
      if (toast) toast(msg, { type: 'danger' });
      return r;
    }
    if (okMessage && toast) toast(okMessage, { type: 'success' });
    await reloadCourse(courseId);
    reloadMine();
    return r || { success: true };
  } catch (e) {
    if (toast) toast((e && e.message) || 'Không thể lưu thay đổi.', { type: 'danger' });
    await reloadCourse(courseId);
    return null;
  }
}
