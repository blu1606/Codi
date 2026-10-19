import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = {
  id: "lecturer-user-1",
  name: "Nguyễn Văn Giảng",
  email: "lecturer@codi.edu.vn",
};

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRequireRole = vi.fn();
const mockGetActiveRoles = vi.fn();

vi.mock("@/services", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: vi.fn().mockImplementation(async () => mockUser),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LECTURER: "lecturer", ADMIN: "admin", LEARNER: "learner" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
  getActiveRoles: (...args: any[]) => mockGetActiveRoles(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/notification-service", () => ({
  createNotificationService: vi.fn().mockReturnValue({
    notify: (...args: any[]) => mockNotify(...args),
  }),
}));

import {
  getLecturerQuestionsData,
  reopenConversation,
  replyToPrivateConversation,
  replyToPublicQuestion,
  resolveConversation,
} from "./actions";

describe("Lecturer Questions & Conversations Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveRoles.mockResolvedValue(["lecturer"]);
  });

  describe("getLecturerQuestionsData", () => {
    it("returns empty structure when lecturer has no courses", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const res = await getLecturerQuestionsData();
      expect(res.questions).toHaveLength(0);
      expect(res.conversations).toHaveLength(0);
      expect(res.counts.unanswered).toBe(0);
      expect(res.counts.answered).toBe(0);
      expect(res.counts.aiConversations).toBe(0);
    });
  });

  describe("replyToPublicQuestion (STATE-MACHINES.md §14.1)", () => {
    it("fails when reply text is shorter than 5 characters", async () => {
      const res = await replyToPublicQuestion({
        questionId: 10,
        text: "Hi",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("ít nhất 5 ký tự");
    });

    it("fails when question does not belong to lecturer's course", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 10,
                courseId: "c1",
                lessonId: "l1",
                authorId: "student-1",
                instructorId: "other-lecturer",
              },
            ]),
          }),
        }),
      });

      const res = await replyToPublicQuestion({
        questionId: 10,
        text: "Đây là câu trả lời hợp lệ.",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không có quyền");
    });

    it("successfully posts reply, sets question to answered and notifies learner", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 10,
                courseId: "c1",
                lessonId: "l1",
                authorId: "student-1",
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await replyToPublicQuestion({
        questionId: 10,
        text: "Chào em, em cần kiểm tra hàm useEffect nhé.",
      });

      expect(res.success).toBe(true);
      expect(mockNotify).toHaveBeenCalledWith(
        "student-1",
        "Câu hỏi đã có trả lời",
        expect.stringContaining("Nguyễn Văn Giảng đã trả lời"),
        "/learn/c1/l1"
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/questions"
      );
    });
  });

  describe("replyToPrivateConversation (STATE-MACHINES.md §14.2)", () => {
    it("fails when reply text is shorter than 5 characters", async () => {
      const res = await replyToPrivateConversation({
        conversationId: 5,
        text: "K",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("ít nhất 5 ký tự");
    });

    it("successfully replies to private conversation and notifies learner", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                courseId: "c1",
                lessonId: "l1",
                learnerId: "student-1",
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await replyToPrivateConversation({
        conversationId: 5,
        text: "Thầy đã xem qua code của em, lỗi do vòng lặp vô hạn.",
      });

      expect(res.success).toBe(true);
      expect(mockNotify).toHaveBeenCalledWith(
        "student-1",
        "Có trả lời từ giảng viên",
        expect.stringContaining("Nguyễn Văn Giảng đã trả lời"),
        "/learn/c1/l1"
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/questions"
      );
    });
  });

  describe("resolveConversation (Decision D8 / D9 & §14.2)", () => {
    it("refuses to resolve conversation if no lecturer reply has been sent", async () => {
      // 1st query: conversation
      // 2nd query: messages
      let queryCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    id: 5,
                    status: "open",
                    instructorId: "lecturer-user-1",
                  },
                ]),
              }),
            };
          }
          return {
            where: vi.fn().mockResolvedValue([
              { isLecturer: false }, // Only student message
            ]),
          };
        }),
      }));

      const res = await resolveConversation({ conversationId: 5 });
      expect(res.success).toBe(false);
      expect(res.error).toBe(
        "Hãy trả lời học viên trước khi đánh dấu đã giải quyết."
      );
    });

    it("successfully marks resolved when at least one lecturer reply exists", async () => {
      let queryCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    id: 5,
                    status: "open",
                    instructorId: "lecturer-user-1",
                  },
                ]),
              }),
            };
          }
          return {
            where: vi.fn().mockResolvedValue([
              { isLecturer: false },
              { isLecturer: true }, // Lecturer has replied
            ]),
          };
        }),
      }));

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await resolveConversation({ conversationId: 5 });
      expect(res.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/questions"
      );
    });
  });

  describe("reopenConversation (§14.2)", () => {
    it("reopens a resolved conversation to open status", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "resolved",
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await reopenConversation({ conversationId: 5 });
      expect(res.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/questions"
      );
    });
  });
});
