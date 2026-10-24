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
const mockDelete = vi.fn();

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
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

import {
  getPublicationData,
  markFlagFixed,
  reopenFlag,
  submitCourseForPublication,
} from "./actions";

function createMockQuery(data: any[]) {
  const p = Promise.resolve(data);
  return Object.assign(p, {
    from: vi.fn().mockImplementation(() => createMockQuery(data)),
    where: vi.fn().mockImplementation(() => createMockQuery(data)),
    orderBy: vi.fn().mockImplementation(() => createMockQuery(data)),
    limit: vi.fn().mockImplementation(() => createMockQuery(data)),
    innerJoin: vi.fn().mockImplementation(() => createMockQuery(data)),
    leftJoin: vi.fn().mockImplementation(() => createMockQuery(data)),
  });
}

describe("Lecturer Publication Actions (S25 - Task #117)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1" },
    });
    mockRequireRole.mockResolvedValue(undefined);
  });

  describe("getPublicationData", () => {
    it("chặn truy cập nếu khoá học không thuộc sở hữu của giảng viên", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          { id: "c-other", instructorId: "other-user", description: "Mô tả đầy đủ chi tiết hơn hai mươi ký tự" },
        ])
      );

      await expect(getPublicationData("c-other")).rejects.toThrow(
        "Không có quyền truy cập khoá học này."
      );
    });

    it("tính toán readiness và tải kết quả lần duyệt trước thành công", async () => {
      const mockCourse = {
        id: "c-1",
        title: "Khóa học React",
        description: "Mô tả khóa học đầy đủ chi tiết hơn 20 ký tự chuẩn bị xuất bản",
        category: "Lập trình Web",
        level: "Beginner",
        price: 990000,
        status: "draft",
        instructorId: "lecturer-1",
        knowledgeMapStatus: "confirmed",
        publishedAt: null,
        hiddenReason: null,
      };

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([mockCourse]);
        return createMockQuery([]);
      });

      const data = await getPublicationData("c-1");
      expect(data.course.id).toBe("c-1");
      expect(data.readiness.items.length).toBeGreaterThan(0);
      expect(data.isLocked).toBe(false);
    });
  });

  describe("submitCourseForPublication", () => {
    it("chặn gửi khi trạng thái khoá học không phải draft hoặc rejected", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            id: "c-pending",
            instructorId: "lecturer-1",
            status: "pending",
            description: "Mô tả dài hơn hai mươi ký tự đầy đủ",
          },
        ])
      );

      await expect(submitCourseForPublication("c-pending")).rejects.toThrow(
        'Không thể gửi yêu cầu xuất bản khi khoá học đang ở trạng thái "pending"'
      );
    });

    it("chặn gửi khi điều kiện xuất bản chưa đạt (ví dụ chưa có bài học)", async () => {
      const mockCourse = {
        id: "c-incomplete",
        instructorId: "lecturer-1",
        status: "draft",
        description: "Mô tả khóa học hơn hai mươi ký tự đầy đủ",
        category: "Web",
        level: "Beginner",
        price: 100000,
        knowledgeMapStatus: "confirmed",
      };

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([mockCourse]);
        return createMockQuery([]); // 0 chapters, 0 lessons
      });

      await expect(submitCourseForPublication("c-incomplete")).rejects.toThrow(
        "Chưa đủ điều kiện xuất bản"
      );
    });

    it("chuyển khoá học sang pending, tạo round mới và gửi thông báo cho Admin khi thoả mãn", async () => {
      const mockCourse = {
        id: "c-complete",
        title: "Khóa học React",
        instructorId: "lecturer-1",
        status: "draft",
        description: "Mô tả khóa học hơn hai mươi ký tự đầy đủ tiêu chuẩn",
        category: "Web",
        level: "Beginner",
        price: 100000,
        knowledgeMapStatus: "confirmed",
      };

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([mockCourse]);
        if (callCount === 2) return createMockQuery([{ courseId: "c-complete" }]); // details
        if (callCount === 3) return createMockQuery([{ id: "ch-1", courseId: "c-complete" }]); // chapters
        if (callCount === 4) return createMockQuery([{ id: "ls-1", chapterId: "ch-1", type: "reading", body: "Nội dung" }]); // lessons
        if (callCount === 5) return createMockQuery([]); // materials
        if (callCount === 6) return createMockQuery([{ id: 1, courseId: "c-complete", isDiagnostic: true }]); // assessments
        if (callCount === 7) {
          return createMockQuery([
            { id: 1, assessmentId: 1, text: "Q1" },
            { id: 2, assessmentId: 1, text: "Q2" },
            { id: 3, assessmentId: 1, text: "Q3" },
            { id: 4, assessmentId: 1, text: "Q4" },
            { id: 5, assessmentId: 1, text: "Q5" },
          ]); // 5 entry questions
        }
        return createMockQuery([]);
      });

      const mockTx = {
        select: vi.fn().mockImplementation(() => createMockQuery([{ userId: "admin-1" }])),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 10 }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockTransaction.mockImplementation(async (cb) => cb(mockTx));

      const result = await submitCourseForPublication("c-complete");
      expect(result.success).toBe(true);
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();
    });
  });

  describe("markFlagFixed and reopenFlag", () => {
    it("markFlagFixed yêu cầu câu trả lời tối thiểu 5 ký tự", async () => {
      await expect(markFlagFixed("c-1", 101, "ngắn")).rejects.toThrow(
        "Vui lòng ghi rõ bạn đã chỉnh sửa nội dung gì"
      );
    });

    it("markFlagFixed cập nhật trạng thái cờ thành fixed và lưu phản hồi", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 101, status: "open" },
            course: { id: "c-1", instructorId: "lecturer-1", status: "rejected" },
          },
        ])
      );

      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 101 }]),
      });
      mockUpdate.mockReturnValue({ set: mockSet });

      const res = await markFlagFixed("c-1", 101, "Đã sửa lại đáp án đúng và bổ sung giải thích chi tiết.");
      expect(res.success).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "fixed",
          lecturerReply: "Đã sửa lại đáp án đúng và bổ sung giải thích chi tiết.",
        })
      );
    });

    it("từ chối khi cờ thuộc khoá học khác (cross-course)", async () => {
      // Mock join returns empty because flagId 101 belongs to c-2, not c-1
      mockSelect.mockImplementation(() => createMockQuery([]));

      await expect(
        markFlagFixed("c-1", 101, "Sửa cờ khoá khác")
      ).rejects.toThrow("Không có quyền chỉnh sửa hoặc không tìm thấy góp ý này trong khoá học của bạn.");
    });

    it("từ chối khi cờ đã được admin đóng (closed)", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 101, status: "closed" },
            course: { id: "c-1", instructorId: "lecturer-1", status: "rejected" },
          },
        ])
      );

      await expect(
        markFlagFixed("c-1", 101, "Đã sửa cờ closed")
      ).rejects.toThrow("Góp ý này đã được quản trị viên đóng, không thể sửa đổi.");

      await expect(
        reopenFlag("c-1", 101)
      ).rejects.toThrow("Góp ý này đã được quản trị viên đóng, không thể mở lại.");
    });

    it("từ chối khi khoá học đang pending", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 101, status: "open" },
            course: { id: "c-1", instructorId: "lecturer-1", status: "pending" },
          },
        ])
      );

      await expect(
        markFlagFixed("c-1", 101, "Đã sửa cờ khi pending")
      ).rejects.toThrow("Khoá học đang chờ quản trị viên duyệt, không thể thay đổi cờ góp ý.");

      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 101, status: "fixed" },
            course: { id: "c-1", instructorId: "lecturer-1", status: "pending" },
          },
        ])
      );

      await expect(
        reopenFlag("c-1", 101)
      ).rejects.toThrow("Khoá học đang chờ quản trị viên duyệt, không thể mở lại cờ góp ý.");
    });

    it("reopenFlag chuyển cờ về open và xoá phản hồi", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 101, status: "fixed" },
            course: { id: "c-1", instructorId: "lecturer-1", status: "rejected" },
          },
        ])
      );

      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 101 }]),
      });
      mockUpdate.mockReturnValue({ set: mockSet });

      const res = await reopenFlag("c-1", 101);
      expect(res.success).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "open",
          lecturerReply: null,
        })
      );
    });
  });
});
