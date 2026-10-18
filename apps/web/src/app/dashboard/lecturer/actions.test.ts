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

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    transaction: (cb: any) => mockTransaction(cb),
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

import {
  createCourseDraft,
  decideAiCourseDraft,
  generateSlug,
  getLecturerCourses,
  getLecturerDashboardStats,
  saveAiCourseDraft,
  verifyLecturerSession,
} from "./actions";

describe("Lecturer Dashboard & Course Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  describe("verifyLecturerSession guard", () => {
    it("ném lỗi Unauthorized khi người dùng chưa đăng nhập", async () => {
      mockGetSession.mockResolvedValue(null);
      await expect(verifyLecturerSession()).rejects.toThrow("Unauthorized");
    });

    it("ném lỗi Forbidden khi tài khoản không có quyền LECTURER", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "user-student", email: "student@codi.vn" },
      });
      mockRequireRole.mockRejectedValue(new Error("Forbidden"));
      await expect(verifyLecturerSession()).rejects.toThrow("Forbidden");
    });

    it("trả về user khi có quyền LECTURER hợp lệ", async () => {
      mockGetSession.mockResolvedValue({
        user: { id: "lecturer-1", name: "Nguyễn Văn A" },
      });
      mockRequireRole.mockResolvedValue(undefined);
      const user = await verifyLecturerSession();
      expect(user.id).toBe("lecturer-1");
    });
  });

  describe("generateSlug", () => {
    it("chuyển đổi tiếng Việt có dấu thành không dấu và dạng slug chuẩn", () => {
      expect(generateSlug("Lập Trình Web Với React & Next.js")).toBe("lap-trinh-web-voi-react-next-js");
      expect(generateSlug("Khóa học Đồ Họa Đỉnh Cao")).toBe("khoa-hoc-do-hoa-dinh-cao");
      expect(generateSlug("   Python Cơ Bản   ")).toBe("python-co-ban");
    });
  });

  describe("createCourseDraft", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        user: { id: "lecturer-1" },
      });
      mockRequireRole.mockResolvedValue(undefined);
    });

    it("báo lỗi validation khi thông tin không đạt yêu cầu", async () => {
      const res = await createCourseDraft({
        title: "abc",
        summary: "ngắn",
        category: "",
        level: "",
      });

      expect(res.success).toBe(false);
      expect(res.errors?.title).toBe("Tên khoá học cần ít nhất 5 ký tự.");
      expect(res.errors?.summary).toBe("Mô tả cần ít nhất 20 ký tự.");
      expect(res.errors?.category).toBe("Chọn một danh mục.");
      expect(res.errors?.level).toBe("Chọn trình độ.");
    });

    it("tạo khoá học nháp thành công và kích hoạt revalidate", async () => {
      const mockTxInsertValues = vi.fn().mockResolvedValue(undefined);
      const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues });
      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({ insert: mockTxInsert });
      });

      const res = await createCourseDraft({
        title: "Khoá học TypeScript Nâng Cao",
        summary: "Nắm vững Type System, Generics và Design Patterns trong TypeScript.",
        category: "Web Development",
        level: "Advanced",
      });

      expect(res.success).toBe(true);
      expect(res.courseId).toMatch(/^course-/);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/courses");
    });
  });

  describe("getLecturerDashboardStats", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        user: { id: "lecturer-1" },
      });
      mockRequireRole.mockResolvedValue(undefined);
    });

    it("trả về số 0 khi giảng viên chưa có khoá học nào", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const stats = await getLecturerDashboardStats();
      expect(stats.counts.grading).toBe(0);
      expect(stats.counts.questions).toBe(0);
      expect(stats.counts.reviews).toBe(0);
      expect(stats.counts.byStatus.draft).toBe(0);
      expect(stats.rejectedCourseAlert).toBeNull();
    });

    it("tính toán chính xác các đầu việc cần làm và cảnh báo khoá bị từ chối", async () => {
      // 1. myCourses query
      const myCourses = [
        { id: "c1", title: "Khoá 1", status: "rejected", hiddenReason: null },
        { id: "c2", title: "Khoá 2", status: "published", hiddenReason: null },
        { id: "c3", title: "Khoá 3", status: "draft", hiddenReason: null },
      ];

      let callIndex = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) {
            // myCourses
            return {
              where: vi.fn().mockResolvedValue(myCourses),
            };
          }
          if (callIndex === 2) {
            // grading
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 3 }]),
              }),
            };
          }
          if (callIndex === 3) {
            // questions
            return {
              where: vi.fn().mockResolvedValue([{ count: 5 }]),
            };
          }
          if (callIndex === 4) {
            // reviews
            return {
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            };
          }
          if (callIndex === 5) {
            // latest publication request reviewNote
            return {
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    { reviewNote: "Cần bổ sung thêm bài test cho coding exercise." },
                  ]),
                }),
              }),
            };
          }
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }));

      const stats = await getLecturerDashboardStats();
      expect(stats.counts.byStatus.rejected).toBe(1);
      expect(stats.counts.byStatus.published).toBe(1);
      expect(stats.counts.byStatus.draft).toBe(1);
      expect(stats.counts.grading).toBe(3);
      expect(stats.counts.questions).toBe(5);
      expect(stats.counts.reviews).toBe(2);
      expect(stats.rejectedCourseAlert?.title).toBe("Khoá 1");
      expect(stats.rejectedCourseAlert?.rejectReason).toBe("Cần bổ sung thêm bài test cho coding exercise.");
    });
  });

  describe("getLecturerCourses", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        user: { id: "lecturer-1" },
      });
      mockRequireRole.mockResolvedValue(undefined);
    });

    it("trả về mảng rỗng khi không có khoá nào", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const list = await getLecturerCourses("all");
      expect(list).toEqual([]);
    });
  });

  describe("AI Drafts (ai_content_drafts)", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        user: { id: "lecturer-1" },
      });
      mockRequireRole.mockResolvedValue(undefined);
    });

    it("lưu bản nháp AI thành công ở trạng thái pending", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 101 }]),
        }),
      });

      const res = await saveAiCourseDraft({ outline: ["Chương 1", "Chương 2"] });
      expect(res.success).toBe(true);
      expect(res.draftId).toBe(101);
    });

    it("cập nhật quyết định duyệt hoặc huỷ bản nháp AI", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 101, lecturerId: "lecturer-1", status: "pending" },
          ]),
        }),
      });

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      const res = await decideAiCourseDraft(101, "accepted");
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("ném lỗi khi bản nháp AI không tồn tại hoặc không thuộc quyền sở hữu", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(decideAiCourseDraft(999, "accepted")).rejects.toThrow(
        "Bản nháp AI không tồn tại hoặc không thuộc quyền quản lý của bạn."
      );
    });
  });
});
