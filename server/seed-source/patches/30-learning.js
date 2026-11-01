// Learning feature seed additions (additive only). Applied after data.js by server/seed-data.js.
patchSeed((db) => {
  const lessonById = {};
  (db.courses || []).forEach((c) => c.chapters.forEach((ch) => ch.lessons.forEach((l) => { lessonById[l.id] = l; })));

  // Real lesson materials: YouTube videos for two intro lessons; other lessons keep the simulated player/slides.
  const youtube = {
    'lesson-react-001': 'https://www.youtube.com/watch?v=Tn6-PIqc4UM',
    'lesson-js-001': 'https://www.youtube.com/watch?v=DHjqpvDnNGE',
  };
  Object.entries(youtube).forEach(([id, url]) => {
    const l = lessonById[id];
    if (l && !l.materials) l.materials = [{ id: id + '-yt', type: 'video', title: l.title, url, durationSeconds: 120 }];
  });
  // PDF lessons: page count of the simulated document.
  Object.values(lessonById).forEach((l) => {
    if (l.type === 'pdf' && !l.materials) l.materials = [{ id: l.id, type: 'pdf', title: l.title, url: null, pages: 8 }];
  });

  // Per-assignment upload limit (real maxFileSizeMb, capped at 20 MB by the app).
  const limits = { 'lesson-react-009': 10, 'lesson-js-004': 5 };
  Object.values(lessonById).forEach((l) => {
    if (l.assignment && l.assignment.maxFileSizeMb == null) l.assignment.maxFileSizeMb = limits[l.id] || 20;
  });

  // Demo learner: BKT state consistent with the seeded mastery levels, levels right after the entry test,
  // and lesson completion times (stats "Bài hoàn thành").
  const s = db.learnerSeed && db.learnerSeed.courses && db.learnerSeed.courses['course-js-001'];
  if (s) {
    if (!s.bkt) {
      s.bkt = {
        'j-var': { p: 0.91, n: 6, correct: 6 },
        'j-func': { p: 0.78, n: 5, correct: 4 },
        'j-array': { p: 0.72, n: 4, correct: 3 },
        'j-object': { p: 0.52, n: 3, correct: 2 },
        'j-dom': { p: 0.27, n: 2, correct: 0 },
      };
    }
    // One BKT observation each: 3 right (0.467 → level 2), 1 wrong (0.211 → level 1), 2 "Tôi chưa biết" (no evidence).
    if (!s.diagnosticMastery) s.diagnosticMastery = { 'j-var': 2, 'j-func': 2, 'j-array': 2, 'j-object': 1, 'j-dom': 0, 'j-async': 0 };
    if (!s.completedAt) {
      s.completedAt = {
        'lesson-js-001': '2026-08-18T13:00:00Z',
        'lesson-js-002': '2026-08-25T13:30:00Z',
        'lesson-js-003': '2026-09-20T12:00:00Z',
        'lesson-js-004': '2026-10-09T14:00:00Z',
      };
    }
  }
});
