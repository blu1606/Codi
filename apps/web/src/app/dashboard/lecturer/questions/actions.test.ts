import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, ROLE } from "@codi-1/auth";
import { conversationMessages, courseConversations } from "@codi-1/db";

const mockLecturer = {
  id: "lecturer-user-1",
  name: "Nguyễn Văn Giảng",
  email: "lecturer@codi.edu.vn",
};

const mockAdmin = {
  id: "admin-user-1",
  name: "Quản trị viên Codi",
  email: "admin@codi.edu.vn",
};

const mockLearner = {
  id: "learner-user-1",
  name: "Trần Học Viên",
  email: "learner@codi.edu.vn",
};

let currentSessionUser: any = mockLecturer;

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGetActiveRoles = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockImplementation(async () => {
        if (!currentSessionUser) return null;
        return { user: currentSessionUser };
      }),
    },
  },
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock("@codi-1/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codi-1/auth")>();
  return {
    ...actual,
    getActiveRoles: vi.fn().mockImplementation((_db: any, userId: string) =>
      mockGetActiveRoles(_db, userId)
    ),
    requireRole: vi
      .fn()
      .mockImplementation(
        async (_db: any, userId: string, ...allowedRoles: string[]) => {
          const active = await mockGetActiveRoles(_db, userId);
          if (!allowedRoles.some((r) => active.includes(r))) {
            throw new actual.ForbiddenError(
              `User ${userId} lacks required role(s): ${allowedRoles.join(", ")}`
            );
          }
        }
      ),
  };
});

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
    currentSessionUser = mockLecturer;
    mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER]);
  });

  describe("getLecturerQuestionsData", () => {
    it("does not expose a foreign author's legacy lecturer flag as lecturer provenance", async () => {
      const now = new Date("2026-10-20T00:00:00Z");
      const listQuery = (rows: unknown[]) => {
        const query = {
          innerJoin: vi.fn(() => query),
          leftJoin: vi.fn(() => query),
          where: vi.fn(() => query),
          orderBy: vi.fn().mockResolvedValue(rows),
        };
        return { from: () => query };
      };
      mockSelect
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "c1", title: "Course" }] }) })
        .mockReturnValueOnce(listQuery([]))
        .mockReturnValueOnce(listQuery([{
          id: 5, courseId: "c1", courseTitle: "Course", lessonId: "l1", lessonTitle: "Lesson",
          learnerId: mockLearner.id, learnerName: mockLearner.name, learnerAvatar: null,
          status: "open", fromAi: true, aiContext: null, createdAt: now,
        }]))
        .mockReturnValueOnce(listQuery([
          { id: 1, authorId: mockAdmin.id, authorName: mockAdmin.name, authorAvatar: null, isLecturer: true, body: "Admin reply", createdAt: now },
          { id: 2, authorId: mockLecturer.id, authorName: mockLecturer.name, authorAvatar: null, isLecturer: true, body: "Lecturer reply", createdAt: now },
        ]));

      const result = await getLecturerQuestionsData({ view: "conversations", id: "5" });
      expect(result.selectedConversation?.messages).toEqual([
        expect.objectContaining({ authorId: mockAdmin.id, isLecturer: false }),
        expect.objectContaining({ authorId: mockLecturer.id, isLecturer: true }),
      ]);
    });

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

    it("rejects new messages while conversation is resolved (P2 Defect Fix)", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "resolved",
                courseId: "c1",
                lessonId: "l1",
                learnerId: "student-1",
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      const res = await replyToPrivateConversation({
        conversationId: 5,
        text: "Thầy gửi thêm lời giải sau khi giải quyết.",
      });

      // Typed failure returned
      expect(res.success).toBe(false);
      expect(res.error).toContain("đã được giải quyết");
      // Must not insert message or notify
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("successfully replies when conversation is open and notifies learner", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "open",
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
      expect(mockInsert).toHaveBeenCalled();
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

  describe("private reply provenance and resolution", () => {
    it("rejects a learner-only private reply", async () => {
      currentSessionUser = mockLearner;
      mockGetActiveRoles.mockResolvedValue([ROLE.LEARNER]);
      await expect(replyToPrivateConversation({ conversationId: 5, text: "Một câu trả lời hợp lệ." })).rejects.toThrow(ForbiddenError);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("rejects an unrelated lecturer's private reply", async () => {
      mockSelect.mockReturnValue({
        from: () => ({ innerJoin: () => ({ where: async () => [{ id: 5, status: "open", instructorId: "another-lecturer" }] }) }),
      });
      const result = await replyToPrivateConversation({ conversationId: 5, text: "Một câu trả lời hợp lệ." });
      expect(result.success).toBe(false);
      expect(result.error).toContain("không có quyền");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it.each([
      { label: "admin-only non-owner", actor: mockAdmin, roles: [ROLE.ADMIN], instructorId: mockLecturer.id, isLecturer: false },
      { label: "admin-only owner", actor: mockAdmin, roles: [ROLE.ADMIN], instructorId: mockAdmin.id, isLecturer: false },
      { label: "admin with lecturer role on another course", actor: mockAdmin, roles: [ROLE.ADMIN, ROLE.LECTURER], instructorId: mockLecturer.id, isLecturer: false },
      { label: "course lecturer", actor: mockLecturer, roles: [ROLE.LECTURER], instructorId: mockLecturer.id, isLecturer: true },
      { label: "course lecturer with admin role", actor: mockLecturer, roles: [ROLE.ADMIN, ROLE.LECTURER], instructorId: mockLecturer.id, isLecturer: true },
    ])("preserves $label provenance before an admin attempts resolution", async ({ actor, roles, instructorId, isLecturer }) => {
      currentSessionUser = actor;
      mockGetActiveRoles.mockResolvedValue(roles);
      const conv = { id: 5, status: "open", courseId: "c1", lessonId: "l1", learnerId: mockLearner.id, instructorId };
      const messages = [{ authorId: mockLearner.id, isLecturer: false }];
      mockSelect.mockImplementation(() => ({
        from: (table: unknown) => {
          if (table === courseConversations) {
            return { innerJoin: () => ({ where: async () => [conv] }) };
          }
          expect(table).toBe(conversationMessages);
          return { where: async () => messages };
        },
      }));
      mockInsert.mockReturnValue({
        values: vi.fn().mockImplementation(async (message: { authorId: string; isLecturer: boolean }) => {
          messages.push(message);
        }),
      });
      const setValues = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockUpdate.mockReturnValue({ set: setValues });

      expect((await replyToPrivateConversation({ conversationId: 5, text: "Một câu trả lời hợp lệ." })).success).toBe(true);
      currentSessionUser = mockAdmin;
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);
      const result = await resolveConversation({ conversationId: 5 });

      expect(result.success).toBe(isLecturer);
      expect(messages[1]).toMatchObject({ authorId: actor.id, isLecturer });
      expect(mockNotify).toHaveBeenCalledWith(
        mockLearner.id,
        isLecturer ? "Có trả lời từ giảng viên" : "Có trả lời từ quản trị viên",
        expect.any(String),
        "/learn/c1/l1"
      );
      if (isLecturer) {
        expect(setValues).toHaveBeenCalledWith(expect.objectContaining({ status: "resolved", resolvedBy: mockAdmin.id }));
      } else {
        expect(result.error).toContain("trước khi đánh dấu đã giải quyết");
        expect(setValues).not.toHaveBeenCalledWith(expect.objectContaining({ status: "resolved" }));
      }
    });

    it("does not trust a lecturer flag on a reply authored by another user", async () => {
      currentSessionUser = mockAdmin;
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);
      mockSelect.mockReturnValueOnce({
        from: () => ({ innerJoin: () => ({ where: async () => [{ id: 5, status: "open", instructorId: mockLecturer.id }] }) }),
      }).mockReturnValueOnce({
        from: () => ({ where: async () => [{ authorId: mockAdmin.id, isLecturer: true }] }),
      });

      const result = await resolveConversation({ conversationId: 5 });
      expect(result.success).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe("resolveConversation (Decision D8 / D9 & §14.2)", () => {
    it("refuses to resolve conversation if no lecturer reply has been sent", async () => {
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

    it("refuses to resolve if conversation is not open", async () => {
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

      const res = await resolveConversation({ conversationId: 5 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không ở trạng thái mở");
    });

    it("successfully marks resolved when course lecturer resolves with >=1 reply", async () => {
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
              { authorId: mockLecturer.id, isLecturer: true }, // Lecturer has replied
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

    it("allows admin-only identity to resolve conversation without course ownership (P2 Defect Fix)", async () => {
      // Admin session: active role ADMIN only, not LECTURER
      currentSessionUser = mockAdmin;
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);

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
                    instructorId: "some-other-lecturer", // Admin does not own the course
                  },
                ]),
              }),
            };
          }
          return {
            where: vi.fn().mockResolvedValue([
              { authorId: "some-other-lecturer", isLecturer: true }, // Prerequisite met
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
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("rejects learner-only caller with ForbiddenError via real auth guard", async () => {
      currentSessionUser = mockLearner;
      mockGetActiveRoles.mockResolvedValue([ROLE.LEARNER]);

      await expect(resolveConversation({ conversationId: 5 })).rejects.toThrow(
        ForbiddenError
      );
    });

    it("rejects unrelated lecturer without admin role from resolving another's course", async () => {
      currentSessionUser = { id: "unrelated-lecturer", name: "Thầy Khác" };
      mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER]);

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "open",
                instructorId: "course-owner-lecturer",
              },
            ]),
          }),
        }),
      });

      const res = await resolveConversation({ conversationId: 5 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không có quyền");
    });
  });

  describe("reopenConversation (§14.2)", () => {
    it("reopens a resolved conversation to open status by course lecturer", async () => {
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

    it("allows admin-only identity to reopen a resolved conversation (P2 Defect Fix)", async () => {
      currentSessionUser = mockAdmin;
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "resolved",
                instructorId: "other-lecturer",
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
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("rejects learner-only caller with ForbiddenError on reopen", async () => {
      currentSessionUser = mockLearner;
      mockGetActiveRoles.mockResolvedValue([ROLE.LEARNER]);

      await expect(reopenConversation({ conversationId: 5 })).rejects.toThrow(
        ForbiddenError
      );
    });

    it("rejects unrelated lecturer without admin role from reopening another's course", async () => {
      currentSessionUser = { id: "unrelated-lecturer", name: "Thầy Khác" };
      mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER]);

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "resolved",
                instructorId: "course-owner-lecturer",
              },
            ]),
          }),
        }),
      });

      const res = await reopenConversation({ conversationId: 5 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không có quyền");
    });

    it("refuses to reopen an already open conversation", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 5,
                status: "open",
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      const res = await reopenConversation({ conversationId: 5 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Chỉ có thể mở lại cuộc hội thoại đã giải quyết");
    });
  });
});
