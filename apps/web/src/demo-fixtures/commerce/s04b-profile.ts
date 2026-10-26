/**
 * GET /api/student/profile for the seed learner. Shape mirrors the route's JSON
 * (TODO(contract): the component keeps its ProfileData type private).
 */
function activitiesFor(year: number) {
  const types = ["lesson_complete", "quiz_complete", "course_view", "login"];
  // A deterministic spread of study days across the year for the heatmap.
  return Array.from({ length: 60 }, (_, i) => ({
    type: types[i % types.length],
    occurredAt: new Date(Date.UTC(year, (i * 7) % 10, 1 + ((i * 11) % 27), 2 + (i % 10))).toISOString(),
  }));
}

export function studentProfile(year: number) {
  return {
    activities: activitiesFor(year),
    enrollments: [
      { enrollment: { progress: 36 }, course: { id: "course-js-001", title: "JavaScript nền tảng" } },
      { enrollment: { progress: 100 }, course: { id: "course-git-001", title: "Git & GitHub cho người mới" } },
    ],
    wishlist: [],
    cart: [],
    transactions: [
      { id: "txn-001", createdAt: "2026-09-12T03:20:00.000Z", courseId: "course-js-001", amount: 590000, currency: "VND", status: "completed" },
      { id: "txn-002", createdAt: "2026-08-02T08:05:00.000Z", courseId: "course-git-001", amount: 0, currency: "VND", status: "completed" },
    ],
  };
}

export function studentProfileActivities(year: number) {
  return { activities: activitiesFor(year) };
}
