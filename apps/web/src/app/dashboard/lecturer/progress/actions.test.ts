import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock services & lecturer-auth
const mockVerifyLecturerSession = vi.fn();
vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: () => mockVerifyLecturerSession(),
}));

const mockDbSelect = vi.fn();
vi.mock("@/services", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

import {
  getCourseLearnerProgress,
  getLecturerCoursesProgress,
} from "./actions";

function createMockQuery(data: any = []) {
  const query: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(data)),
    then: (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject),
  };
  return query;
}

describe("Lecturer Progress Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyLecturerSession.mockResolvedValue({
      id: "lecturer-123",
      name: "Thầy Hưng",
    });
  });

  describe("getLecturerCoursesProgress", () => {
    it("returns empty array if lecturer has no published or hidden courses", async () => {
      // 1. myCourses query returns []
      mockDbSelect.mockReturnValueOnce(createMockQuery([]));

      const res = await getLecturerCoursesProgress();
      expect(res).toEqual([]);
    });

    it("aggregates enrollments and completion rates across owned courses", async () => {
      // 1. myCourses query
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([{ id: "c1", title: "Khóa TypeScript", status: "published" }])
      );

      // 2. lessons query (joined with courseChapters)
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: "l1", courseId: "c1" },
          { id: "l2", courseId: "c1" },
        ])
      );

      // 3. enrollments query
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: 101, courseId: "c1", progress: 50 },
          { id: 102, courseId: "c1", progress: 100 },
        ])
      );

      // 4. completedProgress query
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { enrollmentId: 101, completedCount: 1 },
          { enrollmentId: 102, completedCount: 2 },
        ])
      );

      const res = await getLecturerCoursesProgress();
      expect(res).toHaveLength(1);
      expect(res[0].courseId).toBe("c1");
      expect(res[0].learnersCount).toBe(2);
      // e101: 1/2 = 50%, e102: 2/2 = 100% -> avg = 75%
      expect(res[0].averageCompletionRate).toBe(75);
    });
  });

  describe("getCourseLearnerProgress", () => {
    it("returns null if course does not exist or is not owned by lecturer", async () => {
      // 1. Course lookup returns empty
      mockDbSelect.mockReturnValueOnce(createMockQuery([]));

      const res = await getCourseLearnerProgress("unowned-course");
      expect(res).toBeNull();
    });

    it("returns detailed progress, hint usage, and quiz questions with needsReview flag", async () => {
      // 1. Course lookup
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: "c1", title: "Khóa TypeScript", instructorId: "lecturer-123" },
        ])
      );

      // 2. Lessons (joined with courseChapters)
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: "l1", title: "Bài 1: Giới thiệu", position: 1 },
          { id: "l2", title: "Bài 2: Generics", position: 2 },
        ])
      );

      // 3. Assessments
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: 1, lessonId: "l1", type: "quiz", maxScore: 100 },
        ])
      );

      // 4. Enrollments with user info
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          {
            enrollmentId: 101,
            userId: "u1",
            userName: "Nguyễn Văn A",
            userImage: null,
            enrolledAt: new Date("2026-10-01"),
          },
        ])
      );

      // 5. Lesson progress rows
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          {
            enrollmentId: 101,
            lessonId: "l1",
            status: "completed",
            lastAccessedAt: new Date("2026-10-02"),
            completedAt: new Date("2026-10-02"),
          },
        ])
      );

      // 6. Submissions
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          {
            id: 501,
            assessmentId: 1,
            enrollmentId: 101,
            status: "graded",
            score: 80,
            submittedAt: new Date("2026-10-02"),
          },
        ])
      );

      // 7. Hint logs (AI hint usage)
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { userId: "u1", hintLevel: 2 },
          { userId: "u1", hintLevel: 1 },
        ])
      );

      // 8. Quiz questions
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { id: 10, assessmentId: 1, lessonId: "l1", text: "TypeScript là gì?" },
        ])
      );

      // 9. Answers for question
      mockDbSelect.mockReturnValueOnce(
        createMockQuery([
          { questionId: 10, isCorrect: false },
          { questionId: 10, isCorrect: true },
          { questionId: 10, isCorrect: false },
        ])
      );

      const res = await getCourseLearnerProgress("c1");
      expect(res).not.toBeNull();
      expect(res!.courseTitle).toBe("Khóa TypeScript");
      expect(res!.learnersCount).toBe(1);
      expect(res!.totalLessons).toBe(2);
      expect(res!.averageCompletionRate).toBe(50); // 1/2 = 50%
      expect(res!.averageQuizScore).toBe(80);

      // Verify learner drill-down data
      const learner = res!.learners[0];
      expect(learner.name).toBe("Nguyễn Văn A");
      expect(learner.completedLessonsCount).toBe(1);
      expect(learner.hintUsageCount).toBe(2);
      expect(learner.maxHintLevel).toBe(2);
      expect(learner.lessons[0].isCompleted).toBe(true);
      expect(learner.lessons[0].quizScore).toBe(80);
      expect(learner.lessons[1].isCompleted).toBe(false);

      // Verify quiz questions stats (1 correct out of 3 = 33% -> needsReview=true)
      expect(res!.quizQuestions).toHaveLength(1);
      expect(res!.quizQuestions[0].totalAnswers).toBe(3);
      expect(res!.quizQuestions[0].correctAnswers).toBe(1);
      expect(res!.quizQuestions[0].correctPercent).toBe(33);
      expect(res!.quizQuestions[0].needsReview).toBe(true);
    });
  });
});
