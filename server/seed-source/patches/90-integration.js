// Integration seed fixes owned by the controller, applied after every feature patch.
patchSeed((db) => {
  // Enrol the demo learner in the Python course so the "Sandbox chưa sẵn sàng" state of the
  // Python code challenge is reachable from the seeded account.
  const uid = 'usr-learner-001';
  const courseId = 'course-python-001';
  if (db.courses.some((c) => c.id === courseId) && !db.enrolments.some((e) => e.userId === uid && e.courseId === courseId)) {
    db.enrolments.push({ userId: uid, courseId, enrolledAt: '2026-09-02T08:30:00Z', startMode: 'lesson1', pathStatus: 'ready' });
  }
});
