// Lecturer seed additions (additive only; never removes or renames existing fields).
// - categories: the real app's fixed course category list (lib/course-constants.ts), added by name when missing.
// - assignment + submission passingScore: pass threshold as a percent of maxScore (real grading rule), derived from
//   the existing absolute passScore so both stay consistent.
// - refunded orders: updatedAt = the "Đã hoàn tiền" timeline entry (real refunds KPI windows on updatedAt).
// - feedback snippets: body (real field, {{placeholder}} syntax) and createdAt; the legacy text field is kept.
// - entry-test questions: lessonId (real links diagnostic questions to a lesson for BKT), from the concept link.
// - first lesson of each published course: isFreePreview (real "Học thử" flag) when not set by another patch.
patchSeed((db) => {
  const REAL_CATEGORIES = [
    ['cat-frontend', 'Frontend'], ['cat-backend', 'Backend'], ['cat-fullstack', 'Fullstack'],
    ['cat-data-ai', 'Data & AI'], ['cat-mobile', 'Mobile'], ['cat-cs', 'Computer Science'],
  ];
  db.categories = db.categories || [];
  REAL_CATEGORIES.forEach(([id, name]) => {
    if (db.categories.some((c) => c.name === name)) return;
    if (db.categories.some((c) => c.id === id)) return;
    db.categories.push({ id, name });
  });

  const pct = (pass, max) => (Number(max) > 0 && pass != null ? Math.round((Number(pass) / Number(max)) * 100) : 50);
  (db.courses || []).forEach((c) => {
    const lessons = (c.chapters || []).flatMap((ch) => ch.lessons || []);
    lessons.forEach((l) => {
      if (l.assignment && l.assignment.passingScore == null) l.assignment.passingScore = pct(l.assignment.passScore, l.assignment.maxScore);
    });
    if (c.status === 'published' && lessons[0] && lessons[0].isFreePreview === undefined) lessons[0].isFreePreview = true;
    if (c.entryTest && Array.isArray(c.entryTest.questions)) {
      c.entryTest.questions.forEach((q) => {
        if (q.lessonId !== undefined) return;
        const l = q.conceptId ? lessons.find((x) => (x.conceptIds || []).includes(q.conceptId)) : null;
        q.lessonId = l ? l.id : null;
      });
    }
  });

  (db.submissions || []).forEach((s) => {
    if (s.passingScore == null) s.passingScore = pct(s.passScore, s.maxScore);
  });

  (db.orders || []).forEach((o) => {
    if (o.status !== 'refunded' || o.updatedAt) return;
    const t = (o.timeline || []).find((x) => x.label === 'Đã hoàn tiền');
    o.updatedAt = t ? t.at : o.paidAt || o.createdAt;
  });

  (db.feedbackSnippets || []).forEach((s, i) => {
    if (s.body === undefined) s.body = String(s.text || '').replace(/\{(ten_hoc_vien|diem)\}/g, '{{$1}}');
    if (!s.createdAt) s.createdAt = new Date(Date.UTC(2026, 8, 1 + i, 8)).toISOString();
  });
});
