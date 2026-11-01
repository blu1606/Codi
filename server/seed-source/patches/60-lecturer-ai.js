// Lecturer AI seed additions (additive only; never removes or renames existing fields).
// - aiContentDrafts: log of AI quiz generations (real ai_content_drafts rows: kind quiz_questions, status pending,
//   payload { courseId, lessonId, difficulty, questions }). Starts empty; the AI quiz dialog appends to it.
// - code challenge lessons: solutionVerifiedAt (real codingExercises.solutionVerifiedAt), copied from an existing
//   passing solutionCheck so seeded exercises read as verified, like a successful "Lưu bài code".
patchSeed((db) => {
  if (!Array.isArray(db.aiContentDrafts)) db.aiContentDrafts = [];

  (db.courses || []).forEach((c) => {
    (c.chapters || []).forEach((ch) => {
      (ch.lessons || []).forEach((l) => {
        const code = l.code;
        if (!code || code.kind !== 'challenge' || code.solutionVerifiedAt !== undefined) return;
        const chk = code.solutionCheck;
        code.solutionVerifiedAt = chk && chk.ok && chk.total > 0 && chk.passed === chk.total && chk.at ? chk.at : null;
      });
    });
  });
});
