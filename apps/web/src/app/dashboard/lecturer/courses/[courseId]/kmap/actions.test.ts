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
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

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

const mockNotify = vi.fn().mockResolvedValue({ id: 1 });
vi.mock("@/lib/notification-service", () => ({
  createNotificationService: () => ({
    notify: (...args: any[]) => mockNotify(...args),
  }),
}));

import {
  acceptAllKnowledgeMap,
  addKnowledgeMapEdge,
  confirmKnowledgeMap,
  getKnowledgeMapData,
  renameKnowledgeMapConcept,
  reviewKnowledgeMapItem,
  runKnowledgeMapAnalysis,
} from "./actions";

function mockQuery(val: any = []) {
  const p = Promise.resolve(val);
  return Object.assign(p, {
    orderBy: vi.fn().mockResolvedValue(val),
  });
}

describe("Knowledge Map Server Actions (#116, S24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1" },
    });
    mockRequireRole.mockResolvedValue(undefined);
    mockTransaction.mockImplementation((callback) => callback({
      select: mockSelect, update: mockUpdate, insert: mockInsert,
    }));
  });

  describe("getKnowledgeMapData", () => {
    it("ném lỗi khi khoá học không thuộc quyền quản lý của giảng viên", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(mockQuery([])),
        }),
      });

      await expect(getKnowledgeMapData("c-999")).rejects.toThrow(
        "Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn."
      );
    });

    it("trả về cờ isLocked = true khi khoá học đang chờ duyệt", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return mockQuery([
                { id: "c-1", instructorId: "lecturer-1", status: "pending", title: "Codi JS", knowledgeMapStatus: "ready" },
              ]);
            }
            return mockQuery([]);
          }),
        }),
      });

      const res = await getKnowledgeMapData("c-1");
      expect(res.isLocked).toBe(true);
      expect(res.course.status).toBe("pending");
    });

    it("chuyển trạng thái sang empty khi khoá học không có bài học nào", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return mockQuery([
                { id: "c-1", instructorId: "lecturer-1", status: "draft", title: "Codi JS", knowledgeMapStatus: "ready" },
              ]);
            }
            return mockQuery([]);
          }),
        }),
      });

      const res = await getKnowledgeMapData("c-1");
      expect(res.course.knowledgeMapStatus).toBe("empty");
    });
  });

  describe("runKnowledgeMapAnalysis", () => {
    it("ném lỗi khi khoá học chưa có bài học nào", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([
                { id: "c-1", instructorId: "lecturer-1", status: "draft", title: "Codi JS", knowledgeMapStatus: "empty" },
              ]);
            }
            if (callCount === 2) {
              // chapters
              return {
                orderBy: vi.fn().mockResolvedValue([]),
              };
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await expect(runKnowledgeMapAnalysis("c-1")).rejects.toThrow(
        "Khoá học chưa có bài học nào để phân tích."
      );
    });

    it("tạo khái niệm và quan hệ tuần tự khi phân tích lần đầu", async () => {
      let selectCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) {
              return Promise.resolve([
                { id: "c-1", instructorId: "lecturer-1", status: "draft", title: "Codi JS", knowledgeMapStatus: "empty" },
              ]);
            }
            if (selectCount === 2) {
              // chapters
              return {
                orderBy: vi.fn().mockResolvedValue([{ id: "ch-1", position: 1 }]),
              };
            }
            if (selectCount === 3) {
              // lessons
              return {
                orderBy: vi.fn().mockResolvedValue([
                  { id: "ls-1", title: "Bài 1: Biến và Hằng", chapterId: "ch-1" },
                  { id: "ls-2", title: "Bài 2: Hàm và Scope", chapterId: "ch-1" },
                ]),
              };
            }
            if (selectCount === 4) {
              // existing skills (empty)
              return {
                orderBy: vi.fn().mockResolvedValue([]),
              };
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 101, name: "Biến và Hằng" },
            { id: 102, name: "Hàm và Scope" },
          ]),
        }),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "c-1" }]),
        }),
      });

      const res = await runKnowledgeMapAnalysis("c-1");
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(mockNotify).toHaveBeenCalledWith(
        "lecturer-1",
        "Bản đồ kiến thức đã sẵn sàng",
        expect.stringContaining("2 khái niệm cần bạn xem lại"),
        expect.any(String)
      );
    });
  });

  describe("reviewKnowledgeMapItem", () => {
    it("chuyển trạng thái sang ready nếu trước đó khoá học đã confirmed", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "published", knowledgeMapStatus: "confirmed" },
          ]),
        }),
      });

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      mockUpdate.mockReturnValue({ set: updateSet });

      await reviewKnowledgeMapItem("c-1", "concept", {
        skillId: 101,
        review: "accepted",
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(updateSet).toHaveBeenCalledWith({ knowledgeMapStatus: "ready" });
    });
  });

  describe("renameKnowledgeMapConcept", () => {
    it("ném lỗi khi tên mới rỗng", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

      await expect(renameKnowledgeMapConcept("c-1", 101, "   ")).rejects.toThrow(
        "Tên khái niệm không được để trống."
      );
    });

    it("cập nhật tên và đặt review là edited", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      mockUpdate.mockReturnValue({ set: updateSet });

      const res = await renameKnowledgeMapConcept("c-1", 101, "Biến số JavaScript");
      expect(res.success).toBe(true);
      expect(updateSet).toHaveBeenCalledWith({ name: "Biến số JavaScript", review: "edited" });
    });
  });

  describe("addKnowledgeMapEdge", () => {
    it("ném lỗi khi khái niệm học trước trùng với khái niệm học sau", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

      await expect(addKnowledgeMapEdge("c-1", 101, 101)).rejects.toThrow(
        "Một khái niệm không thể cần học trước chính nó."
      );
    });

    it("ném lỗi khi quan hệ đã tồn tại", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]);
            }
            if (callCount === 2) {
              const rows = [{ id: 101 }, { id: 102 }];
              return Object.assign(Promise.resolve(rows), { for: vi.fn().mockResolvedValue(rows) });
            }
            return Promise.resolve([{ prerequisiteSkillId: 101, skillId: 102, review: "accepted" }]);
          }),
        }),
      });

      await expect(addKnowledgeMapEdge("c-1", 101, 102)).rejects.toThrow("Quan hệ này đã có.");
    });
  });

  describe("acceptAllKnowledgeMap", () => {
    it("chấp nhận các khái niệm và quan hệ an toàn, bỏ qua quan hệ tạo vòng lặp", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // getEditableCourse
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]);
            }
            if (callCount === 2) {
              // all skills
              return Promise.resolve([
                { id: 1, review: "suggested" },
                { id: 2, review: "suggested" },
                { id: 3, review: "suggested" },
              ]);
            }
            if (callCount === 3) {
              // all edges: 1->2 (accepted), 2->3 (accepted), 3->1 (suggested -> would close loop)
              return Promise.resolve([
                { prerequisiteSkillId: 1, skillId: 2, review: "accepted" },
                { prerequisiteSkillId: 2, skillId: 3, review: "accepted" },
                { prerequisiteSkillId: 3, skillId: 1, review: "suggested" },
              ]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const res = await acceptAllKnowledgeMap("c-1");
      expect(res.success).toBe(true);
      expect(res.acceptedConceptsCount).toBe(3);
      expect(res.acceptedEdgesCount).toBe(0); // 3->1 was skipped because it creates loop
      expect(res.skippedEdgesCount).toBe(1);
    });
  });

  describe("confirmKnowledgeMap", () => {
    it("ném lỗi khi còn đề xuất chưa xem lại", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ id: 1, review: "suggested" }]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await expect(confirmKnowledgeMap("c-1")).rejects.toThrow("Còn 1 đề xuất chưa xem lại");
    });

    it("ném lỗi khi trạng thái khoá học là stale", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft", knowledgeMapStatus: "stale" }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ id: 1, review: "accepted" }]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await expect(confirmKnowledgeMap("c-1")).rejects.toThrow("Hãy phân tích lại trước khi xác nhận.");
    });

    it("ném lỗi khi còn vòng lặp trong đồ thị", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft", knowledgeMapStatus: "ready" }]);
            }
            if (callCount === 2) {
              return Promise.resolve([
                { id: 1, review: "accepted" },
                { id: 2, review: "accepted" },
              ]);
            }
            if (callCount === 3) {
              return Promise.resolve([
                { prerequisiteSkillId: 1, skillId: 2, review: "accepted" },
                { prerequisiteSkillId: 2, skillId: 1, review: "accepted" },
              ]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await expect(confirmKnowledgeMap("c-1")).rejects.toThrow("Bản đồ còn chứa vòng lặp.");
    });

    it("xác nhận thành công khi đồ thị hợp lệ", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: "c-1", instructorId: "lecturer-1", status: "draft", knowledgeMapStatus: "ready" }]);
            }
            if (callCount === 2) {
              return Promise.resolve([
                { id: 1, review: "accepted" },
                { id: 2, review: "accepted" },
              ]);
            }
            if (callCount === 3) {
              return Promise.resolve([
                { prerequisiteSkillId: 1, skillId: 2, review: "accepted" },
              ]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      mockUpdate.mockReturnValue({ set: updateSet });

      const res = await confirmKnowledgeMap("c-1");
      expect(res.success).toBe(true);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeMapStatus: "confirmed",
        })
      );
    });
  });
});
