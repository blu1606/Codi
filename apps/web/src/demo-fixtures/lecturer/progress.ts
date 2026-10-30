import type { CourseProgressDetailDto, CourseProgressSummaryDto, LearnerProgressDto } from "@/lib/lecturer-progress-service";

/** Learner progress (S29 list and per-course detail), shaped like the progress loaders. */

export const lecturerProgressCourses: CourseProgressSummaryDto[] = [
  { courseId: "course-react-001", title: "React dự án thực tế", status: "published", learnersCount: 128, averageCompletionRate: 62 },
  { courseId: "course-node-001", title: "Node.js & Express xây dựng REST API", status: "hidden", learnersCount: 34, averageCompletionRate: 41 },
];

export const lecturerProgressCoursesEmpty: CourseProgressSummaryDto[] = [];

const learners: LearnerProgressDto[] = [
  {
    userId: "usr-learner-001", name: "Nguyễn Minh An", avatar: null, progressPercent: 80,
    completedLessonsCount: 4, totalLessonsCount: 5, averageQuizScore: 86, hintUsageCount: null,
    lastActive: "2026-10-25T08:00:00.000Z",
    lessons: [
      { id: "22222222-2222-4222-8222-222222222201", title: "Bài 1: JSX và component", isCompleted: true, quizScore: 90, assignmentSubmission: null },
      { id: "22222222-2222-4222-8222-222222222202", title: "Bài 2: Props và state", isCompleted: true, quizScore: 82, assignmentSubmission: { status: "graded", score: 8.5, maxScore: 10 } },
    ],
  },
  {
    userId: "usr-learner-002", name: "Phạm Thu Hà", avatar: null, progressPercent: 40,
    completedLessonsCount: 2, totalLessonsCount: 5, averageQuizScore: 64, hintUsageCount: null,
    lastActive: "2026-10-20T11:30:00.000Z",
    lessons: [
      { id: "22222222-2222-4222-8222-222222222201", title: "Bài 1: JSX và component", isCompleted: true, quizScore: 60, assignmentSubmission: null },
    ],
  },
];

export const lecturerCourseProgressDetail: CourseProgressDetailDto = {
  courseId: "course-react-001",
  courseTitle: "React dự án thực tế",
  totalLessons: 5,
  learnersCount: learners.length,
  averageCompletionRate: 60,
  averageQuizScore: 75,
  learners,
  quizQuestions: [
    {
      lessonId: "22222222-2222-4222-8222-222222222202", lessonTitle: "Bài 2: Props và state", questionId: 1,
      questionText: "Props là gì trong React?", totalAnswers: 120, correctAnswers: 96, correctPercent: 80, needsReview: false,
    },
    {
      lessonId: "22222222-2222-4222-8222-222222222203", lessonTitle: "Bài 3: Hooks cơ bản", questionId: 2,
      questionText: "Hook nào dùng để lưu state?", totalAnswers: 98, correctAnswers: 39, correctPercent: 40, needsReview: true,
    },
  ],
};

/** Course with no learners yet. */
export const lecturerCourseProgressNoLearners: CourseProgressDetailDto = {
  ...lecturerCourseProgressDetail,
  courseId: "course-jest-001",
  courseTitle: "Kiểm thử JavaScript với Jest",
  learnersCount: 0,
  averageCompletionRate: 0,
  averageQuizScore: null,
  learners: [],
  quizQuestions: [],
};
