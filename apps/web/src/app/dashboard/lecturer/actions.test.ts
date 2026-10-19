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

import { verifyLecturerSession } from "@/lib/lecturer-auth";
import {
  createCourseDraft,
  decideAiCourseDraft,
  getLecturerCourses,
  getLecturerDashboardStats,
  saveAiCourseDraft,
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
      expect(res.errors?.category).toBeDefined();
      expect(res.errors?.level).toBeDefined();
    });

    it("báo lỗi validation khi category hoặc level nằm ngoài whitelist", async () => {
      const res = await createCourseDraft({
        title: "Khóa học Rust Cơ Bản",
        summary: "Khóa học lập trình hệ thống với Rust đầy đủ từ cơ bản đến nâng cao.",
        category: "InvalidCategory",
        level: "Expert",
      });

      expect(res.success).toBe(false);
      expect(res.errors?.category).toBeDefined();
      expect(res.errors?.level).toBeDefined();
    });

    it("xử lý an toàn khi payload là null hoặc sai kiểu dữ liệu", async () => {
      const res = await createCourseDraft(null);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();

      const res2 = await createCourseDraft({ title: 12345 });
      expect(res2.success).toBe(false);
      expect(res2.errors).toBeDefined();
    });

    it("tạo khoá học nháp thành công và assert đúng các business invariants", async () => {
      let insertedCourseValues: any = null;
      let insertedDetailsValues: any = null;

      const mockTxInsert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val) => {
          if (!insertedCourseValues) {
            insertedCourseValues = val;
          } else {
            insertedDetailsValues = val;
          }
          return Promise.resolve();
        }),
      }));

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({ insert: mockTxInsert });
      });

      const res = await createCourseDraft({
        title: "Khoá học TypeScript Nâng Cao",
        summary: "Nắm vững Type System, Generics và Design Patterns trong TypeScript.",
        category: "Backend",
        level: "Intermediate",
      });

      expect(res.success).toBe(true);
      expect(res.courseId).toMatch(/^course-/);

      // Assert business rules: draft status, price 0, instructorId matching session, knowledgeMap empty
      expect(insertedCourseValues).toBeDefined();
      expect(insertedCourseValues.status).toBe("draft");
      expect(insertedCourseValues.price).toBe(0);
      expect(insertedCourseValues.instructorId).toBe("lecturer-1");
      expect(insertedCourseValues.category).toBe("Backend");
      expect(insertedCourseValues.level).toBe("Intermediate");
      expect(insertedCourseValues.duration).toBe("0 giờ");
      expect(insertedCourseValues.knowledgeMapStatus).toBe("empty");

      // Assert course_details initialized in same transaction
      expect(insertedDetailsValues).toBeDefined();
      expect(insertedDetailsValues.courseId).toBe(res.courseId);
      expect(insertedDetailsValues.learningOutcomes).toEqual([]);
      expect(insertedDetailsValues.requirements).toEqual([]);

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/courses");
    });

    it("tự động retry và thành công khi gặp lỗi trùng slug (23505)", async () => {
      let attempts = 0;
      const mockTxInsert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val) => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error("duplicate key value violates unique constraint");
            err.code = "23505";
            throw err;
          }
          return Promise.resolve();
        }),
      }));

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({ insert: mockTxInsert });
      });

      const res = await createCourseDraft({
        title: "Khoá học TypeScript Nâng Cao",
        summary: "Nắm vững Type System, Generics và Design Patterns trong TypeScript.",
        category: "Backend",
        level: "Intermediate",
      });

      expect(res.success).toBe(true);
      expect(attempts).toBeGreaterThanOrEqual(2);
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
            return {
              where: vi.fn().mockResolvedValue(myCourses),
            };
          }
          if (callIndex === 2) {
            return {
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 3 }]),
              }),
            };
          }
          if (callIndex === 3) {
            return {
              where: vi.fn().mockResolvedValue([{ count: 5 }]),
            };
          }
          if (callIndex === 4) {
            return {
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            };
          }
          if (callIndex === 5) {
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

    it("lọc khoá học theo trạng thái hợp lệ trong database query", async () => {
      const mockWhere = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
      });

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await getLecturerCourses("draft");
      expect(mockWhere).toHaveBeenCalled();
    });

    it("bỏ qua filter nếu status không nằm trong whitelist", async () => {
      const mockWhere = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
      });

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await getLecturerCourses("invalid_status" as any);
      expect(mockWhere).toHaveBeenCalled();
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

    it("cập nhật quyết định duyệt hoặc huỷ bản nháp AI khi trạng thái đang là pending", async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 101 }]),
          }),
        }),
      });

      const res = await decideAiCourseDraft(101, "accepted");
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("ném lỗi khi bản nháp AI không tồn tại, không thuộc quyền sở hữu, hoặc không ở trạng thái pending", async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // 0 records updated
          }),
        }),
      });

      await expect(decideAiCourseDraft(999, "accepted")).rejects.toThrow(
        "Bản nháp AI không tồn tại, đã được xử lý hoặc không thuộc quyền quản lý của bạn."
      );
    });
  });
});
