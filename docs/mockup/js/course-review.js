/**
 * course-review.js — shared model for publication review (admin S32 ↔ lecturer S25).
 *
 * A course has review rounds in db.courseReviews (newest last). Each round holds:
 *   criteria[id] = {status: 'pass' | 'fix' | 'na', note}
 *   flags[]      = {id, target:{type, lessonId?, itemId?, label}, severity:'must'|'should', comment,
 *                   status:'open'|'fixed'|'closed', reply, source:'admin'|'ai', at}
 * Admin: approve only when every criterion is marked, none is "Cần sửa", and no "Bắt buộc sửa" flag is open.
 * Lecturer: sees the last decided round, marks flags "Đã sửa" with a reply, resubmits → a new round that
 * carries the flags over so the reviewer can close them.
 *
 * API: Codi.review = { CRITERIA, SEVERITY, FLAG_STATUS, rounds, latest, ensureRound, lecturerRound,
 *   autoCriteria, aiPrecheck, flagsFor, openMust, canApprove, startNextRound, targetHref, materialOk }
 */
(function () {
  'use strict';
  const db = () => Codi.db();
  const ENTRY_MIN = 5;
  const lessons = (c) => Codi.lessons(c);

  const CRITERIA = [
    { id: 'info', label: 'Mô tả, đối tượng học viên và giá đề xuất', help: 'Mô tả đủ rõ để học viên quyết định mua; giá đề xuất hợp lý.' },
    { id: 'materials', label: 'Video, slide và tài liệu đầy đủ, xem được', help: 'Mọi bài video/slide đều có tệp; bài đọc có nội dung.' },
    { id: 'quiz', label: 'Quiz đúng đáp án, giải thích rõ', help: 'Đáp án đúng được đánh dấu chính xác, lựa chọn sai hợp lý.' },
    { id: 'entry', label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`, help: 'Đủ câu để Codi xếp lộ trình cá nhân.' },
    { id: 'code', label: 'Bài code có test và lời giải chạy đạt', help: 'Có test biên, test ẩn và lời giải qua tất cả test.' },
    { id: 'assignment', label: 'Bài tập có yêu cầu rõ và thang chấm', help: 'Có tiêu chí chấm điểm và cách nộp bài.' },
    { id: 'rights', label: 'Bản quyền tài liệu, không có nội dung vi phạm', help: 'Tài liệu do giảng viên sở hữu hoặc được phép dùng.' },
  ];
  const SEVERITY = { must: 'Bắt buộc sửa', should: 'Nên sửa' };
  const FLAG_STATUS = { open: 'Đang mở', fixed: 'Giảng viên đã sửa', closed: 'Đã đóng' };

  const store = () => { const d = db(); if (!d.courseReviews) d.courseReviews = []; return d.courseReviews; };
  const rounds = (c) => store().filter((r) => r.courseId === c.id).sort((a, b) => a.round - b.round);
  const latest = (c) => { const rs = rounds(c); return rs[rs.length - 1] || null; };
  // A pending course always has an open round for the admin to work in.
  function ensureRound(c) {
    let r = latest(c);
    if (c.status === 'pending' && (!r || r.status !== 'in_review')) r = startNextRound(c, r);
    return r;
  }
  // What the lecturer should look at: the newest decided round (or the current one while pending).
  const lecturerRound = (c) => { const rs = rounds(c); return rs.slice().reverse().find((r) => r.status !== 'in_review') || null; };

  function startNextRound(c, prev) {
    const r = {
      id: Codi.uid('rv'), courseId: c.id, round: prev ? prev.round + 1 : 1, status: 'in_review', submittedAt: c.submittedAt || new Date().toISOString(),
      decidedAt: null, reviewerId: null, note: '',
      criteria: prev ? JSON.parse(JSON.stringify(prev.criteria)) : {},
      // carried flags stay visible so the reviewer can verify the fixes and close them
      flags: prev ? prev.flags.filter((f) => f.status !== 'closed').map((f) => Object.assign({}, f, { carried: true })) : [],
    };
    store().push(r);
    return r;
  }

  const materialOk = (l) => !['video', 'pdf'].includes(l.type) || !!(l.material && l.material.fileName) || !!l.fileName;

  // Suggested status per criterion, computed from the content (the admin still decides).
  function autoCriteria(c) {
    const ls = lessons(c);
    const quizzes = ls.filter((l) => l.quiz && l.quiz.questions.length);
    const challenges = ls.filter((l) => l.code && l.code.kind === 'challenge');
    const assigns = ls.filter((l) => l.assignment);
    const missing = ls.filter((l) => !materialOk(l));
    return {
      info: (c.summary || '').trim().length >= 40 && c.proposedPrice != null ? { status: 'pass', why: 'Mô tả và giá đề xuất đã có.' } : { status: 'fix', why: 'Mô tả ngắn hoặc chưa có giá đề xuất.' },
      materials: missing.length ? { status: 'fix', why: `${missing.length} bài chưa có tệp.` } : { status: 'pass', why: 'Mọi bài đều có tài liệu.' },
      quiz: !quizzes.length ? { status: 'na', why: 'Khoá chưa có quiz bài học.' } : { status: 'pass', why: `${quizzes.length} quiz — cần xem từng câu.` },
      entry: c.entryTest && c.entryTest.questions.length >= ENTRY_MIN ? { status: 'pass', why: `${c.entryTest.questions.length} câu.` } : { status: 'fix', why: c.entryTest ? `Chỉ có ${c.entryTest.questions.length} câu.` : 'Chưa có.' },
      code: !challenges.length ? { status: 'na', why: 'Không có bài code.' } : challenges.every((l) => l.code.tests.length && l.code.solutionCheck && l.code.solutionCheck.ok) ? { status: 'pass', why: 'Lời giải qua tất cả test.' } : { status: 'fix', why: 'Có bài code thiếu test hoặc lời giải chưa đạt.' },
      assignment: !assigns.length ? { status: 'na', why: 'Không có bài tập.' } : assigns.every((l) => (l.assignment.rubric || []).length) ? { status: 'pass', why: 'Mọi bài tập có thang chấm.' } : { status: 'fix', why: `${assigns.filter((l) => !(l.assignment.rubric || []).length).length} bài tập chưa có thang chấm.` },
      rights: { status: null, why: 'Cần người duyệt xác nhận.' },
    };
  }

  // Deterministic "AI" pre-check: rules that a reviewer would otherwise catch by reading everything.
  const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s"]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4);
  function aiPrecheck(c) {
    const out = []; const add = (target, severity, comment) => out.push({ target, severity, comment });
    if ((c.summary || '').trim().length < 60) add({ type: 'course', label: 'Mô tả khoá học' }, 'should', 'Mô tả còn ngắn — nên nêu rõ đối tượng học viên và kết quả đạt được.');
    if (!c.entryTest || c.entryTest.questions.length < ENTRY_MIN) add({ type: 'course', label: 'Bài kiểm tra đầu vào' }, 'must', `Bài kiểm tra đầu vào mới có ${c.entryTest ? c.entryTest.questions.length : 0} câu, cần ít nhất ${ENTRY_MIN} câu để xếp lộ trình.`);
    lessons(c).forEach((l) => {
      const lt = { type: 'lesson', lessonId: l.id, label: 'Bài: ' + l.title };
      if (!materialOk(l)) add(lt, 'must', `Chưa có tệp ${l.type === 'video' ? 'video' : 'slide/PDF'} — học viên sẽ thấy bài trống.`);
      if (l.quiz) {
        if (l.quiz.questions.length < 3) add(lt, 'should', `Quiz chỉ có ${l.quiz.questions.length} câu, nên có ít nhất 3 câu.`);
        l.quiz.questions.forEach((q, i) => {
          const qt = { type: 'question', lessonId: l.id, itemId: q.id, label: `Câu ${i + 1}: ${q.text}` };
          if (q.options.length <= 2) add(qt, 'should', 'Câu chỉ có 2 lựa chọn nên dễ đoán — nên thêm lựa chọn sai hợp lý.');
          // the explanation points at a different option than the one marked correct
          const ex = new Set(words(q.explanation));
          const score = q.options.map((o) => words(o).filter((w) => ex.has(w)).length);
          const best = score.indexOf(Math.max(...score));
          if (ex.size && best !== q.correctIndex && score[best] >= 2 && score[best] > score[q.correctIndex]) add(qt, 'must', `Đáp án được đánh dấu có thể sai: phần giải thích đang nói về lựa chọn “${q.options[best]}”.`);
        });
      }
      if (l.code && l.code.kind === 'challenge') {
        if (!(l.code.solutionCheck && l.code.solutionCheck.ok)) add(lt, 'must', 'Lời giải mẫu chưa chạy đạt tất cả test.');
        if (l.code.tests.length < 3 || !l.code.tests.some((t) => t.hidden)) add(lt, 'should', 'Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.');
      }
      if (l.assignment && !(l.assignment.rubric || []).length) add({ type: 'assignment', lessonId: l.id, label: 'Bài tập: ' + l.title }, 'should', 'Bài tập chưa có thang chấm — học viên không biết được chấm theo tiêu chí nào.');
    });
    return out;
  }

  const flagsFor = (r, lessonId) => (r ? r.flags.filter((f) => f.target.lessonId === lessonId) : []);
  const openMust = (r) => (r ? r.flags.filter((f) => f.severity === 'must' && f.status !== 'closed') : []);
  // Why approval is blocked (empty = can approve).
  function canApprove(r) {
    const why = [];
    const unmarked = CRITERIA.filter((k) => !r.criteria[k.id] || !r.criteria[k.id].status);
    if (unmarked.length) why.push(`Còn ${unmarked.length} tiêu chí chưa chấm.`);
    const fix = CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status === 'fix');
    if (fix.length) why.push(`${fix.length} tiêu chí đang ở "Cần sửa".`);
    const must = openMust(r);
    if (must.length) why.push(`${must.length} cờ "Bắt buộc sửa" chưa đóng.`);
    return why;
  }
  // Where the lecturer fixes a flagged item.
  function targetHref(c, t) {
    if (t.type === 'question') return `/teach/courses/${c.id}/quiz/${t.lessonId}`;
    if (t.type === 'test') return `/teach/courses/${c.id}/code/${t.lessonId}`;
    if (t.label === 'Bài kiểm tra đầu vào') return `/teach/courses/${c.id}/quiz/entry`;
    if (t.type === 'course') return `/teach/courses/${c.id}/info`;
    if (t.lessonId) { const l = Codi.lesson(c, t.lessonId); if (l && l.code) return `/teach/courses/${c.id}/code/${t.lessonId}`; }
    return `/teach/courses/${c.id}/content?lesson=${t.lessonId || ''}`;
  }

  Codi.review = { CRITERIA, SEVERITY, FLAG_STATUS, ENTRY_MIN, rounds, latest, ensureRound, lecturerRound, autoCriteria, aiPrecheck, flagsFor, openMust, canApprove, startNextRound, targetHref, materialOk };
})();
