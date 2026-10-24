"use server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockHeaders = vi.fn();
const mockRequireRole = vi.fn();
const mockRevalidatePath = vi.fn();

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { ADMIN: "ADMIN", LECTURER: "LECTURER" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

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
    delete: (...args: any[]) => mockDelete(...args),
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import {
  addReviewFlag,
  applyAutoCriteria,
  approvePublication,
  deleteReviewFlag,
  getAdminPublicationQueue,
  rejectPublication,
  requestChanges,
  saveCriterionVerdict,
  updateFlagStatus,
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

describe("Admin Publication Actions (S32 - Task #117)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@codi.dev" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    // Default mock select returns active in_review request and pending course
    mockSelect.mockImplementation(() =>
      createMockQuery([
        {
          id: 10,
          courseId: "c-1",
          status: "in_review",
          flag: { id: 88, status: "open" },
          request: { id: 10, courseId: "c-1", status: "in_review" },
          course: { id: "c-1", status: "pending", instructorId: "lec-1", title: "React" },
        },
      ])
    );
  });

  describe("getAdminPublicationQueue", () => {
    it("trả về số lượng từng tab và danh sách khoá học chờ duyệt", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ count: 2 }]);
        if (callCount === 2) return createMockQuery([{ count: 1 }]);
        if (callCount === 3) return createMockQuery([{ count: 5 }]);
        if (callCount === 4) {
          return createMockQuery([
            {
              id: "c-1",
              title: "React Chuyên Sâu",
              instructorId: "lec-1",
              instructorName: "Giảng viên A",
              category: "Web",
              level: "Advanced",
              price: 590000,
              status: "pending",
              round: 1,
              updatedAt: new Date(),
              submittedAt: new Date().toISOString(),
            },
          ]);
        }
        if (callCount === 5) {
          return createMockQuery([{ requestId: 1, count: 0 }]);
        }
        return createMockQuery([]);
      });

      const queue = await getAdminPublicationQueue("pending");
      expect(queue.counts.pending).toBe(2);
      expect(queue.counts.changes).toBe(1);
      expect(queue.counts.approved).toBe(5);
      expect(queue.items).toHaveLength(1);
      expect(queue.items[0].id).toBe("c-1");
    });
  });

  describe("saveCriterionVerdict and applyAutoCriteria", () => {
    it("saveCriterionVerdict lưu kết quả tiêu chí", async () => {
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      });
      mockInsert.mockReturnValue({ values: mockValues });

      const res = await saveCriterionVerdict(10, "info", "pass", "Đầy đủ");
      expect(res.success).toBe(true);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 10,
          criterionId: "info",
          status: "pass",
          note: "Đầy đủ",
        })
      );
    });

    it("saveCriterionVerdict từ chối khi vòng duyệt đã kết luận", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([{ id: 10, status: "approved" }])
      );

      await expect(
        saveCriterionVerdict(10, "info", "pass", "Đầy đủ")
      ).rejects.toThrow("Không thể thay đổi tiêu chí của vòng duyệt đã kết luận.");
    });

    it("saveCriterionVerdict xoá tiêu chí khi status = null để đưa về chưa chấm", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockDelete.mockReturnValue({ where: mockWhere });

      const res = await saveCriterionVerdict(10, "info", null);
      expect(res.success).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("applyAutoCriteria điền các tiêu chí chưa chấm theo gợi ý tự động", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]);
        }
        if (callCount === 2) {
          return createMockQuery([
            {
              id: "c-1",
              title: "Khóa học React",
              description: "Mô tả khóa học chi tiết hơn 40 ký tự đạt tiêu chuẩn",
              category: "Web",
              level: "Beginner",
              price: 990000,
              instructorId: "lec-1",
            },
          ]);
        }
        return createMockQuery([]);
      });

      const mockValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      });
      mockInsert.mockReturnValue({ values: mockValues });

      const res = await applyAutoCriteria(10, "c-1");
      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("Review Flags Management (addReviewFlag, updateFlagStatus, deleteReviewFlag)", () => {
    it("addReviewFlag yêu cầu nhận xét ít nhất 10 ký tự", async () => {
      await expect(
        addReviewFlag("c-1", 10, {
          targetType: "lesson",
          targetLabel: "Bài 1",
          severity: "must",
          comment: "quá ngắn",
        })
      ).rejects.toThrow("Nhận xét cần ít nhất 10 ký tự");
    });

    it("addReviewFlag thêm cờ mới thành công", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 88 }]),
        }),
      });

      const res = await addReviewFlag("c-1", 10, {
        targetType: "lesson",
        targetLabel: "Bài 1",
        severity: "must",
        comment: "Video bài học không mở được, vui lòng tải lại tệp.",
      });

      expect(res.success).toBe(true);
      expect(res.flagId).toBe(88);
      expect(mockRevalidatePath).toHaveBeenCalled();
    });

    it("addReviewFlag từ chối khi vòng duyệt đã kết luận", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([{ id: 10, courseId: "c-1", status: "rejected" }])
      );

      await expect(
        addReviewFlag("c-1", 10, {
          targetType: "lesson",
          targetLabel: "Bài 1",
          severity: "must",
          comment: "Video bài học không mở được, vui lòng tải lại tệp.",
        })
      ).rejects.toThrow("Không thể thêm cờ góp ý vào vòng duyệt đã kết luận.");
    });

    it("updateFlagStatus cập nhật trạng thái đóng/mở cờ", async () => {
      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockUpdate.mockReturnValue({ set: mockSet });

      const res = await updateFlagStatus(88, "closed");
      expect(res.success).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "closed" }));
    });

    it("updateFlagStatus từ chối khi round của cờ đã kết luận", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([
          {
            flag: { id: 88, status: "open" },
            request: { id: 10, status: "approved" },
          },
        ])
      );

      await expect(updateFlagStatus(88, "closed")).rejects.toThrow(
        "Không thể thay đổi trạng thái cờ của vòng duyệt đã kết luận."
      );
    });

    it("deleteReviewFlag xoá cờ", async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      mockDelete.mockReturnValue({ where: mockWhere });

      const res = await deleteReviewFlag(88);
      expect(res.success).toBe(true);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("Publication Decisions (approvePublication, requestChanges, rejectPublication)", () => {
    it("approvePublication chặn duyệt khi giá âm hoặc không phải số nguyên", async () => {
      await expect(approvePublication("c-1", 10, -5000)).rejects.toThrow(
        "Giá bán phải là số nguyên không âm"
      );
    });

    it("approvePublication từ chối khi requestId không khớp courseId (mismatch)", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([{ id: 10, courseId: "c-other", status: "in_review" }])
      );
      mockTransaction.mockImplementation(async (cb) => cb({}));

      await expect(approvePublication("c-1", 10, 500000)).rejects.toThrow(
        "Yêu cầu duyệt không khớp với khoá học."
      );
    });

    it("approvePublication từ chối khi request không ở trạng thái in_review (stale round)", async () => {
      mockSelect.mockImplementation(() =>
        createMockQuery([{ id: 10, courseId: "c-1", status: "approved" }])
      );
      mockTransaction.mockImplementation(async (cb) => cb({}));

      await expect(approvePublication("c-1", 10, 500000)).rejects.toThrow(
        "Yêu cầu duyệt đã được kết luận trước đó."
      );
    });

    it("approvePublication từ chối khi khoá học không ở trạng thái pending", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]);
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "published" }]);
        return createMockQuery([]);
      });
      mockTransaction.mockImplementation(async (cb) => cb({}));

      await expect(approvePublication("c-1", 10, 500000)).rejects.toThrow(
        "Khoá học không ở trạng thái chờ duyệt (pending)."
      );
    });

    it("approvePublication chặn duyệt khi canApprove còn điều kiện chưa thoả mãn", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]); // request
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "pending" }]); // course
        if (callCount === 3) return createMockQuery([{ criterionId: "info", status: "pass" }]); // criteria (unmarked remain)
        if (callCount === 4) return createMockQuery([]); // flags
        return createMockQuery([]);
      });
      mockTransaction.mockImplementation(async (cb) => cb({}));

      await expect(approvePublication("c-1", 10, 500000)).rejects.toThrow(
        "Chưa đủ điều kiện duyệt"
      );
    });

    it("approvePublication xuất bản khoá học và gửi thông báo khi đủ điều kiện", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]); // request
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "pending", title: "React", instructorId: "lec-1" }]); // course
        if (callCount === 3) {
          // All 7 criteria marked pass
          return createMockQuery([
            { criterionId: "info", status: "pass" },
            { criterionId: "materials", status: "pass" },
            { criterionId: "quiz", status: "pass" },
            { criterionId: "entry", status: "pass" },
            { criterionId: "code", status: "pass" },
            { criterionId: "assignment", status: "pass" },
            { criterionId: "rights", status: "pass" },
          ]);
        }
        if (callCount === 4) return createMockQuery([]); // flags (none open)
        return createMockQuery([]);
      });

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockTransaction.mockImplementation(async (cb) => cb(mockTx));

      const res = await approvePublication("c-1", 10, 599000);
      expect(res.success).toBe(true);
      expect(mockTx.update).toHaveBeenCalledTimes(2); // request + course
      expect(mockTx.insert).toHaveBeenCalledTimes(1); // notification
    });

    it("requestChanges yêu cầu lý do tối thiểu 5 ký tự", async () => {
      await expect(requestChanges("c-1", 10, "sửa")).rejects.toThrow(
        "Vui lòng nhập lời nhắn chung cho giảng viên"
      );
    });

    it("requestChanges chặn gửi nếu không có tiêu chí 'Cần sửa' hoặc cờ nào đang mở", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]);
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "pending" }]);
        if (callCount === 3) return createMockQuery([{ criterionId: "info", status: "pass" }]); // criteria: 0 fix
        if (callCount === 4) return createMockQuery([]); // flags: 0 open
        return createMockQuery([]);
      });
      mockTransaction.mockImplementation(async (cb) => cb({}));

      await expect(requestChanges("c-1", 10, "Vui lòng xem lại nội dung tổng thể")).rejects.toThrow(
        "Chưa có tiêu chí 'Cần sửa' hay cờ nào để gửi"
      );
    });

    it("requestChanges chuyển khoá học sang rejected và lưu lý do", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]);
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "pending", title: "React", instructorId: "lec-1" }]);
        if (callCount === 3) return createMockQuery([{ criterionId: "materials", status: "fix" }]);
        if (callCount === 4) return createMockQuery([]);
        return createMockQuery([]);
      });

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockTransaction.mockImplementation(async (cb) => cb(mockTx));

      const res = await requestChanges("c-1", 10, "Bổ sung tệp tài liệu cho bài 3.");
      expect(res.success).toBe(true);
      expect(mockTx.update).toHaveBeenCalledTimes(2);
    });

    it("rejectPublication chuyển khoá học sang rejected kèm lý do", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQuery([{ id: 10, courseId: "c-1", status: "in_review" }]);
        if (callCount === 2) return createMockQuery([{ id: "c-1", status: "pending", title: "React", instructorId: "lec-1" }]);
        return createMockQuery([]);
      });

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockTransaction.mockImplementation(async (cb) => cb(mockTx));

      const res = await rejectPublication("c-1", 10, "Khoá học không phù hợp tiêu chuẩn chất lượng nền tảng.");
      expect(res.success).toBe(true);
      expect(mockTx.update).toHaveBeenCalledTimes(2);
    });
  });
});
