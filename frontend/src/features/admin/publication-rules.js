/**
 * Pure review rules the admin review screen runs on the getAdminCourseReview payload, as Codi's
 * publication-review-client does: criterion labels, materialOk and flag anchors. Same copy as
 * backend/src/lib/publication-service.ts (CRITERIA, materialOk), which cannot be imported here. The rule pre-check
 * runs only on the server (getRulePrecheck / runAiPrecheck in dashboard/admin/publication).
 */
export const ENTRY_MIN = 5;

export const CRITERIA = [
  { id: 'info', label: 'Mô tả, đối tượng học viên và giá đề xuất', help: 'Mô tả đủ rõ để học viên quyết định mua; giá đề xuất hợp lý.' },
  { id: 'materials', label: 'Video, slide và tài liệu đầy đủ, xem được', help: 'Mọi bài video/slide đều có tệp; bài đọc có nội dung.' },
  { id: 'quiz', label: 'Quiz đúng đáp án, giải thích rõ', help: 'Đáp án đúng được đánh dấu chính xác, lựa chọn sai hợp lý.' },
  { id: 'entry', label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`, help: 'Đủ câu để Codi xếp lộ trình cá nhân.' },
  { id: 'code', label: 'Bài code có test và lời giải chạy đạt', help: 'Có test biên, test ẩn và lời giải qua tất cả test.' },
  { id: 'assignment', label: 'Bài tập có yêu cầu rõ và thang chấm', help: 'Có tiêu chí chấm điểm và cách nộp bài.' },
  { id: 'rights', label: 'Bản quyền tài liệu, không có nội dung vi phạm', help: 'Tài liệu do giảng viên sở hữu hoặc được phép dùng.' },
];

export const SEVERITY = { must: 'Bắt buộc sửa', should: 'Nên sửa' };
export const FLAG_STATUS = { open: 'Đang mở', fixed: 'Giảng viên đã sửa', closed: 'Đã đóng' };
export const ROUND_STATUS = { in_review: 'Đang duyệt', changes_requested: 'Yêu cầu sửa', rejected: 'Từ chối', approved: 'Đã duyệt' };

export const lessonsOf = (course) => (course ? course.chapters.flatMap((ch) => ch.lessons || []) : []);

export function materialOk(l) {
  if (['video', 'pdf', 'slide'].includes(l.type)) {
    return !!((l.materials || []).some((m) => !!m.fileName || !!m.url || !!m.title) || l.fileName);
  }
  if (l.type === 'reading') return !!(l.body && l.body.trim().length > 0);
  return true;
}

// ───────────────────────── where a flag points (shared with the lecturer editor) ─────────────────────────
export const ENTRY_LABEL = 'Bài kiểm tra đầu vào';
/** Course-info fields a flag can point at (target.itemId of a "course" flag). */
export const INFO_FIELDS = {
  title: 'Tên khoá học', summary: 'Mô tả khoá học', category: 'Danh mục và trình độ', price: 'Giá đề xuất',
  outcomes: 'Học viên sẽ học được gì', requirements: 'Yêu cầu trước khi học',
};
/** Lesson-change keys from getAdminCourseReview.changes → readable text. */
export const CHANGE_LABEL = {
  title: 'tên bài', description: 'mô tả, thời lượng', reading: 'bài đọc', material: 'tài liệu', quiz: 'quiz', code: 'bài code', assignment: 'bài tập',
};
const LESSON_TYPES = new Set(['lesson', 'reading', 'material', 'quiz', 'question', 'code', 'test', 'assignment']);
const PARENT = { material: 'lesson', test: 'code', question: 'quiz', chapter: 'course' };

/** { type, lessonId, itemId } of a flag. Flags saved before anchors existed are read by their label. */
export function anchorOf(f) {
  const t = f.target || {};
  const type = t.type || f.targetType;
  const label = t.label || f.targetLabel || '';
  const lessonId = t.lessonId || f.lessonId || null;
  const itemId = t.itemId == null ? null : String(t.itemId);
  if (type === 'course' && label === ENTRY_LABEL) return { type: 'entry', lessonId: null, itemId: null };
  if (type === 'course' && !itemId && label === 'Mô tả khoá học') return { type: 'course', lessonId: null, itemId: 'summary' };
  if (type === 'question' && !lessonId) return { type: 'question', lessonId: null, itemId, entry: true };
  return { type, lessonId, itemId };
}

/**
 * Anchor of a flag in the content on screen. An item that no longer exists (a quiz saved as a new revision, a
 * deleted material) falls back to the question at the same "Câu N" position, then to its parent block.
 * known: Set of item ids on screen (omit to keep anchors as saved); questionIds(lessonId|null) → ids in order.
 */
export function placeAnchor(f, known, questionIds) {
  const a = anchorOf(f);
  if (LESSON_TYPES.has(a.type) && !a.lessonId && !a.entry) return { type: 'course', lessonId: null, itemId: null, moved: true };
  if (!a.itemId || a.type === 'course' || !known || known.has(a.itemId)) return a;
  if (a.type === 'question' && questionIds) {
    const m = /^Câu (\d+)/.exec((f.target && f.target.label) || f.targetLabel || '');
    const id = m ? (questionIds(a.lessonId) || [])[Number(m[1]) - 1] : null;
    if (id != null) return { ...a, itemId: String(id), moved: true };
  }
  const parent = a.type === 'question' && a.entry ? 'entry' : PARENT[a.type] || a.type;
  return { type: parent, lessonId: parent === 'course' || parent === 'entry' ? null : a.lessonId, itemId: null, moved: true };
}

/** True when anchor a is exactly (type, lessonId, itemId). */
export const isAt = (a, type, lessonId = null, itemId = null) => a.type === type && (a.lessonId || null) === (lessonId || null)
  && (a.itemId || null) === (itemId == null ? null : String(itemId));
