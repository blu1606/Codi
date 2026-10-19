import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRequireRole = vi.fn();
const mockHeaders = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn().mockResolvedValue({ id: 1 });

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/notification-service", () => ({
  createNotificationService: () => ({
    notify: (...args: any[]) => mockNotify(...args),
  }),
}));

import {
  getAiGradingDraft,
  getGradingQueueData,
  gradeSubmission,
} from "./actions";

describe("Lecturer Grading Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1", name: "Thầy A" },
    });
    mockRequireRole.mockResolvedValue(undefined);
  });

  describe("getGradingQueueData", () => {
    it("returns empty queue when lecturer has no courses", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]), // no courses
          }),
        }),
      });

      const res = await getGradingQueueData();
      expect(res.courses).toEqual([]);
      expect(res.counts).toEqual({ pending: 0, graded: 0 });
      expect(res.submissions).toEqual([]);
      expect(res.selectedSubmission).toBeNull();
    });

    it("fetches counts, submissions list and detail for selected submission", async () => {
      const myCourses = [{ id: "c1", title: "React & Next.js" }];
      const submissionsList = [
        {
          id: 10,
          studentName: "Nguyễn Văn B",
          studentEmail: "b@codi.vn",
          studentAvatar: null,
          courseId: "c1",
          courseTitle: "React & Next.js",
          lessonId: "l1",
          lessonTitle: "Bài 1: JSX",
          status: "pending",
          score: null,
          maxScore: 10,
          submittedAt: new Date("2026-10-18T10:00:00Z"),
          gradedAt: null,
        },
      ];

      const detailRow = {
        id: 10,
        studentUserId: "user-student-1",
        studentName: "Nguyễn Văn B",
        studentEmail: "b@codi.vn",
        studentAvatar: null,
        courseId: "c1",
        courseTitle: "React & Next.js",
        lessonId: "l1",
        lessonTitle: "Bài 1: JSX",
        instructions: "Tạo component Header",
        maxScore: 10,
        passingScore: 60,
        rubric: JSON.stringify([{ id: "r1", name: "Cú pháp", points: 10 }]),
        answerText: "Đây là bài làm của em",
        fileUrl: "https://codi.vn/files/b.zip",
        fileName: "b.zip",
        linkUrl: "https://github.com/b/repo",
        submittedAt: new Date("2026-10-18T10:00:00Z"),
        status: "pending",
        score: null,
        feedback: null,
      };

      let queryCall = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          queryCall++;
          if (queryCall === 1) {
            // myCourses
            return {
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(myCourses),
              }),
            };
          }
          if (queryCall === 2) {
            // pending count
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 1 }]),
              }),
            };
          }
          if (queryCall === 3) {
            // graded count
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            };
          }
          if (queryCall === 4) {
            // submissions list
            return {
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                      leftJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                          orderBy: vi.fn().mockResolvedValue(submissionsList),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (queryCall === 5) {
            // selected submission detail
            return {
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                      leftJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue([detailRow]),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (queryCall === 6) {
            // nextPendingId
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            };
          }
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }));

      const res = await getGradingQueueData();
      expect(res.counts.pending).toBe(1);
      expect(res.counts.graded).toBe(0);
      expect(res.submissions).toHaveLength(1);
      expect(res.selectedSubmission).not.toBeNull();
      expect(res.selectedSubmission?.studentName).toBe("Nguyễn Văn B");
      expect(res.selectedSubmission?.rubric).toHaveLength(1);
    });
  });

  describe("gradeSubmission", () => {
    it("fails when submission does not exist or does not belong to lecturer's course", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([]), // not found
                }),
              }),
            }),
          }),
        }),
      });

      const res = await gradeSubmission({ submissionId: 999, score: 8 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không tồn tại");
    });

    it("grades pending submission successfully and notifies learner (pending -> graded)", async () => {
      const mockSub = {
        id: 10,
        status: "pending",
        score: null,
        feedback: null,
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
      };

      let queryCall = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          queryCall++;
          if (queryCall === 1) {
            return {
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    leftJoin: vi.fn().mockReturnValue({
                      where: vi.fn().mockResolvedValue([mockSub]),
                    }),
                  }),
                }),
              }),
            };
          }
          if (queryCall === 2) {
            // nextPendingId
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([{ id: 11 }]),
                  }),
                }),
              }),
            };
          }
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }));

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await gradeSubmission({
        submissionId: 10,
        score: 8.5,
        feedback: "Làm tốt lắm em!",
      });

      expect(res.success).toBe(true);
      expect(res.submissionId).toBe(10);
      expect(res.nextPendingId).toBe(11);
      expect(mockNotify).toHaveBeenCalledWith(
        "user-student-1",
        "Bài tập đã được chấm",
        expect.stringContaining("8,5/10"),
        "/dashboard/learner"
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/grading");
    });

    it("requires reason when modifying score of already graded submission (graded -> graded)", async () => {
      const mockSub = {
        id: 10,
        status: "graded",
        score: 7,
        feedback: "Bài cũ",
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
      };

      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          innerJoin: vi.fn().mockImplementation(() => ({
            // If called with further innerJoin (sub query)
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([mockSub]),
                }),
              }),
            }),
            // If called with where (nextPendingId query)
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          })),
        })),
      }));

      // Thay đổi điểm từ 7 lên 9 mà không có lý do -> thất bại
      const failRes = await gradeSubmission({
        submissionId: 10,
        score: 9,
        feedback: "Cập nhật",
        reason: "",
      });
      expect(failRes.success).toBe(false);
      expect(failRes.error).toContain("lý do điều chỉnh");

      // Thay đổi điểm từ 7 lên 9 kèm lý do hợp lệ -> thành công và lưu lịch sử
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const okRes = await gradeSubmission({
        submissionId: 10,
        score: 9,
        feedback: "Cập nhật",
        reason: "Phúc khảo phần bổ sung câu 2",
      });
      expect(okRes.success).toBe(true);
      expect(mockNotify).toHaveBeenCalledWith(
        "user-student-1",
        "Điểm bài tập đã được cập nhật",
        expect.stringContaining("9/10"),
        "/dashboard/learner"
      );
    });
  });

  describe("getAiGradingDraft", () => {
    it("generates suggested score and constructive feedback for submission", async () => {
      const mockSub = {
        id: 10,
        answerText: "Em đã hoàn thành bài tập với React hooks.",
        fileName: "code.zip",
        linkUrl: "https://github.com/student/app",
        maxScore: 10,
        instructions: "Viết component",
      };

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([mockSub]),
            }),
          }),
        }),
      });

      const res = await getAiGradingDraft(10);
      expect(res.success).toBe(true);
      expect(res.suggestedScore).toBeGreaterThanOrEqual(5);
      expect(res.feedback).toContain("Bài làm đáp ứng tốt");
      expect(res.feedback).toContain("github.com/student/app");
    });
  });
});
