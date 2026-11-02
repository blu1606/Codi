/**
 * Pure review rules the admin review screen runs on the getAdminCourseReview payload, as Codi's
 * publication-review-client does: criterion labels, materialOk and the deterministic AI pre-check. Same logic and
 * copy as backend/src/lib/publication-service.ts (CRITERIA, materialOk, aiPrecheck), which cannot be imported here.
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

/** Deterministic pre-check: suggested flags { target, severity, comment }. */
export function aiPrecheck(c) {
  const out = [];
  const add = (target, severity, comment) => out.push({ target, severity, comment });
  const desc = (c.description || c.summary || '').trim();
  if (desc.length < 60) add({ type: 'course', itemId: 'summary', label: 'Mô tả khoá học' }, 'should', 'Mô tả còn ngắn — nên nêu rõ đối tượng học viên và kết quả đạt được.');
  const entryQuestions = (c.entryTest && c.entryTest.questions ? c.entryTest.questions.length : 0);
  if (entryQuestions < ENTRY_MIN) add({ type: 'entry', label: ENTRY_LABEL }, 'must', `Bài kiểm tra đầu vào mới có ${entryQuestions} câu, cần ít nhất ${ENTRY_MIN} câu để xếp lộ trình.`);
  for (const l of lessonsOf(c)) {
    const lt = { type: 'lesson', lessonId: l.id, label: `Bài: ${l.title}` };
    if (!materialOk(l)) add(lt, 'must', `Chưa có tệp ${l.type === 'video' ? 'video' : 'slide/PDF'} — học viên sẽ thấy bài trống.`);
    if (l.quiz && l.quiz.questions) {
      if (l.quiz.questions.length < 3) add({ type: 'quiz', lessonId: l.id, label: 'Quiz · ' + l.title }, 'should', `Quiz chỉ có ${l.quiz.questions.length} câu, nên có ít nhất 3 câu.`);
      l.quiz.questions.forEach((q, i) => {
        const qt = { type: 'question', lessonId: l.id, itemId: q.id, label: `Câu ${i + 1}: ${q.text.slice(0, 40)}` };
        if (q.options.length <= 2) add(qt, 'should', 'Câu chỉ có 2 lựa chọn nên dễ đoán — nên thêm lựa chọn sai hợp lý.');
        if (!q.explanation || q.explanation.trim().length === 0) add(qt, 'should', 'Câu hỏi chưa có phần giải thích đáp án.');
      });
    }
    if (l.code && l.code.kind === 'challenge') {
      const ct = { type: 'code', lessonId: l.id, label: 'Bài code · ' + l.title };
      if (!l.code.solutionCheck || !l.code.solutionCheck.ok) add(ct, 'must', 'Lời giải mẫu chưa chạy đạt tất cả test.');
      if (!l.code.tests || l.code.tests.length < 3 || !l.code.tests.some((t) => t.hidden)) add(ct, 'should', 'Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.');
    }
    if (l.assignment && (!l.assignment.rubric || l.assignment.rubric.length === 0)) {
      add({ type: 'assignment', lessonId: l.id, label: `Bài tập: ${l.title}` }, 'should', 'Bài tập chưa có thang chấm — học viên không biết được chấm theo tiêu chí nào.');
    }
  }
  return out;
}
