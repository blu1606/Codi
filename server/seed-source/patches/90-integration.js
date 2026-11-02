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

// Course cover images (generated series in public/images/courses, 1280x720 + -sm 640x360 WebP).
patchSeed((db) => {
  db.courses.forEach((c) => { if (!c.coverImageUrl) c.coverImageUrl = `/images/courses/${c.slug}.webp`; });
});

// Stock portrait avatars (Pexels, credited in public/images/CREDITS.json) for the named seed users.
patchSeed((db) => {
  const ids = ['usr-learner-001', 'usr-learner-002', 'usr-learner-003', 'usr-learner-004', 'usr-learner-005', 'usr-learner-006', 'usr-learner-007', 'usr-learner-008', 'usr-learner-009', 'usr-learner-010', 'usr-lecturer-001', 'usr-lecturer-002', 'usr-admin-001'];
  db.users.forEach((u) => { if (ids.includes(u.id) && !u.image) u.image = `/images/avatars/${u.id}.webp`; });
});
