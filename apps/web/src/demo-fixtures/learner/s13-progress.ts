import type { LearnerCourse, LearnerOverview, LearnerResult } from "@/lib/learner-overview-contract";
import { jsCourse } from "./s12-dashboard";
import { learnerOverviewDefault } from "./s12-dashboard";

const quizResult = (id: number, title: string, percent: number): LearnerResult => ({
  id, title, type: "quiz", maxScore: 100, passingScore: 70, status: "graded",
  score: percent, percent, passed: percent >= 70, feedback: null, gradedAt: "2026-10-25T13:10:00.000Z",
});

const assignmentResult = (id: number, title: string, score: number | null, status: LearnerResult["status"]): LearnerResult => ({
  id, title, type: "assignment", maxScore: 10, passingScore: 5, status,
  score: status === "graded" ? score : null,
  percent: status === "graded" && score !== null ? score * 10 : null,
  passed: status === "graded" ? (score ?? 0) >= 5 : null,
  feedback: status === "graded" ? "Làm tốt! Lưu ý xử lý số âm và giá trị rỗng khi tính tổng." : null,
  gradedAt: status === "graded" ? "2026-10-25T09:00:00.000Z" : null,
});

/** The active course with its lesson rows and results, as the progress table reads them. */
export const progressJsCourse: LearnerCourse = {
  ...jsCourse,
  lessons: [
    { id: "lesson-js-001", title: "Biến, hằng và kiểu dữ liệu", status: "done", lock: null, results: [quizResult(1, "Quiz: Biến & kiểu dữ liệu", 100)] },
    { id: "lesson-js-002", title: "Hàm và phạm vi", status: "done", lock: null, results: [quizResult(2, "Quiz: Hàm", 50), assignmentResult(3, "Bài tập: formatPrice", 8.5, "graded")] },
    { id: "lesson-js-003", title: "Làm việc với mảng", status: "done", lock: null, results: [quizResult(4, "Quiz: Mảng", 100)] },
    { id: "lesson-js-004", title: "Đối tượng và destructuring", status: "done", lock: null, results: [assignmentResult(5, "Bài tập: tổng tiền khách hàng", null, "pending")] },
    { id: "lesson-js-005", title: "Chọn và thay đổi phần tử DOM", status: "active", lock: null, results: [] },
    { id: "lesson-js-006", title: "Sự kiện click và form", status: "todo", lock: null, results: [] },
    { id: "lesson-js-007", title: "Gọi API với fetch", status: "locked", lock: "Cần học xong: Sự kiện click và form", results: [] },
  ],
};

const gitDoneCourse: LearnerCourse = {
  id: "course-git-001", title: "Git & GitHub cho người mới", slug: "git-github-cho-nguoi-moi", cover: null, hidden: false,
  goal: "finish", goalSetAt: "2026-07-03T02:00:00.000Z", weeklyGoalMinutes: 120,
  lastActiveAt: "2026-09-10T10:00:00.000Z", pathStatus: "ready", showDiagnostic: false, complete: true,
  done: 3, total: 3, percent: 100, nextLessonId: null,
  lessons: [
    { id: "lesson-git-001", title: "Commit đầu tiên", status: "done", lock: null, results: [quizResult(6, "Quiz: Commit", 100)] },
    { id: "lesson-git-002", title: "Nhánh và merge", status: "done", lock: null, results: [] },
    { id: "lesson-git-003", title: "Làm việc với Pull Request", status: "done", lock: null, results: [assignmentResult(7, "Bài tập: mở PR", 9, "graded")] },
  ],
  skills: [],
};

/** Active tab: the JS course in progress. */
export const progressOverviewActive: LearnerOverview = {
  ...learnerOverviewDefault,
  courses: [progressJsCourse],
  stats: { active: 1, completed: 0, lessons: 4, pending: 1, answered: 0, feedback: 1 },
};

/** Done tab: one completed course. */
export const progressOverviewDone: LearnerOverview = {
  ...learnerOverviewDefault,
  courses: [gitDoneCourse],
  stats: { active: 0, completed: 1, lessons: 3, pending: 0, answered: 0, feedback: 0 },
};

/** Done tab when nothing is complete yet. */
export const progressOverviewNoneDone: LearnerOverview = {
  ...progressOverviewActive,
  stats: { ...progressOverviewActive.stats, completed: 0 },
};
