/**
 * Learning data helpers. Every learner screen reads and writes through the backend (see
 * plans/261102-1834-codi-backend-port/phase-1-report.md, "Contract: routes"):
 *   /api/learner/overview, /api/learn/:courseId/{onboarding,path,lessons/:lessonId/...}.
 * This module holds the endpoint helpers, the DTO → view-row adapters shared by the path page, the dashboard and the
 * lesson player, and the copy constants.
 */
import { api } from '../../lib/api';

// ───────────────────────── endpoints ─────────────────────────
export const learnBase = (courseId) => `/api/learn/${encodeURIComponent(courseId)}`;
export const lessonBase = (courseId, lessonId) => `${learnBase(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
export const assessmentBase = (courseId, lessonId, assessmentId) => `${lessonBase(courseId, lessonId)}/assessments/${encodeURIComponent(assessmentId)}`;
export const postPath = (courseId, command) => api.post(`${learnBase(courseId)}/path`, command);
export const postOnboarding = (courseId, command) => api.post(`${learnBase(courseId)}/onboarding`, command);
export const postLesson = (courseId, lessonId, command) => api.post(lessonBase(courseId, lessonId), command);
/** The server's Vietnamese message, else the given fallback. */
export const errorText = (e, fallback) => (e && typeof e.message === 'string' && e.message) || fallback;

// ───────────────────────── copy ─────────────────────────
export const STATUS = {
  done: ['Đã học', 'badge-success', 'check-circle'],
  active: ['Đang học', 'badge-accent', 'circle-dot'],
  next: ['Tiếp theo', 'badge-accent', 'arrow-right'],
  skippable: ['Có thể bỏ qua', 'badge-neutral', 'skip-forward'],
  locked: ['Chưa đủ tiên quyết', 'badge-outline', 'alert-circle'],
  todo: ['Chưa học', 'badge-neutral', 'circle'],
};
export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code', quiz: 'help-circle' };
// Real lib/lesson-kind.ts LESSON_KIND_LABELS (backend kind "coding" is shown as "code").
export const TYPE_LABEL = { video: 'Video', pdf: 'PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code', quiz: 'Quiz', slide: 'Slide', document: 'Tài liệu', link: 'Liên kết' };
export const GOALS = [
  ['project', 'Làm được dự án', 'Ưu tiên bài thực hành và dự án cuối khoá.'],
  ['finish', 'Hoàn thành khoá học', 'Học đủ mọi bài theo thứ tự khoá học.'],
  ['interview', 'Chuẩn bị phỏng vấn', 'Ưu tiên khái niệm cốt lõi hay được hỏi.'],
];
export const LEVELS = [
  ['new', 'Mới bắt đầu', 'Chưa từng học chủ đề này.'],
  ['basic', 'Đã biết cơ bản', 'Đã đọc hoặc làm thử vài ví dụ.'],
  ['solid', 'Khá vững', 'Đã dùng trong dự án nhỏ.'],
];
export const HOURS = [2, 5, 10];
/** Goal id ('project' | 'finish' | 'interview') → label. */
export const goalLabel = (goal) => (GOALS.find((x) => x[0] === goal) || [0, 'Chưa đặt mục tiêu'])[1];
const LEVEL_LABELS = { Beginner: 'Cơ bản', Intermediate: 'Trung cấp', Advanced: 'Nâng cao' };
export const levelLabel = (level) => LEVEL_LABELS[level] || level || '';
export const scoreText = (n) => String(n).replace('.', ',');
export const minutesOf = (seconds) => Math.round((Number(seconds) || 0) / 60);

// ───────────────────────── path view adapters ─────────────────────────
export const kindOf = (kind) => (kind === 'coding' ? 'code' : kind || 'reading');
/** CoursePathView.rows → the rows the path views render (path order). */
export function pathRows(view) {
  if (!view || !Array.isArray(view.rows)) return [];
  return view.rows.map((row) => ({
    id: row.lessonId || row.id,
    title: row.title,
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle || '',
    kind: kindOf(row.kind),
    durationMin: minutesOf(row.durationSeconds),
    status: row.status,
    lock: row.lock || null,
    reason: row.reason || '',
    skippable: !!row.isSkippable,
    mastery: row.mastery || [],
  }));
}
/**
 * Course shape the path views need: chapters in course order (first appearance in the path), each listing its lesson
 * ids, plus the AI rationale and path source.
 */
export function pathCourse(view, rows = pathRows(view)) {
  const chapters = [];
  const byId = new Map();
  rows.forEach((row) => {
    let ch = byId.get(row.chapterId);
    if (!ch) { ch = { id: row.chapterId, title: row.chapterTitle, lessons: [] }; byId.set(row.chapterId, ch); chapters.push(ch); }
    ch.lessons.push({ id: row.id });
  });
  const course = (view && view.course) || {};
  return { id: course.id, slug: course.slug, title: course.title, chapters, aiRationale: view ? view.rationale : null, pathSource: view ? view.source : null };
}
export const pathShown = (view) => !!view && (view.status === 'ready' || view.status === 'failed');

