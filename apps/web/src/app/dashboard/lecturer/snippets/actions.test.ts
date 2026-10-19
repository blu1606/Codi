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
  },
}));

import {
  createFeedbackSnippet,
  deleteFeedbackSnippet,
  getFeedbackSnippets,
  updateFeedbackSnippet,
} from "./actions";

describe("Feedback Snippets Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1", name: "Thầy A" },
    });
    mockRequireRole.mockResolvedValue(undefined);
  });

  describe("getFeedbackSnippets", () => {
    it("returns list of snippets for logged-in lecturer", async () => {
      const mockList = [
        {
          id: 1,
          title: "Khen ngợi",
          body: "Bài làm rất tốt {{ten_hoc_vien}}, đạt {{diem}} điểm.",
          createdAt: new Date("2026-10-18T10:00:00Z"),
        },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockList),
          }),
        }),
      });

      const res = await getFeedbackSnippets();
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(1);
      expect(res[0].title).toBe("Khen ngợi");
    });
  });

  describe("createFeedbackSnippet", () => {
    it("validates required title and body", async () => {
      const res = await createFeedbackSnippet({ title: "", body: "" });
      expect(res.success).toBe(false);
      expect(res.errors?.title).toBeDefined();
      expect(res.errors?.body).toBeDefined();
    });

    it("creates snippet successfully and revalidates paths", async () => {
      const inserted = {
        id: 2,
        title: "Cần cải thiện",
        body: "Em xem lại cú pháp vòng lặp nhé.",
        createdAt: new Date("2026-10-18T11:00:00Z"),
      };

      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([inserted]),
        }),
      });

      const res = await createFeedbackSnippet({
        title: "Cần cải thiện",
        body: "Em xem lại cú pháp vòng lặp nhé.",
      });

      expect(res.success).toBe(true);
      expect(res.snippet?.id).toBe(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/snippets");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/grading");
    });
  });

  describe("updateFeedbackSnippet", () => {
    it("updates existing snippet owned by lecturer", async () => {
      const updated = {
        id: 2,
        title: "Cần cải thiện (Sửa)",
        body: "Nội dung cập nhật",
        createdAt: new Date("2026-10-18T11:00:00Z"),
      };

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const res = await updateFeedbackSnippet(2, {
        title: "Cần cải thiện (Sửa)",
        body: "Nội dung cập nhật",
      });

      expect(res.success).toBe(true);
      expect(res.snippet?.title).toBe("Cần cải thiện (Sửa)");
    });

    it("throws error when snippet does not exist or belongs to another lecturer", async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // 0 rows updated
          }),
        }),
      });

      await expect(
        updateFeedbackSnippet(999, { title: "Title", body: "Body" })
      ).rejects.toThrow("Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.");
    });
  });

  describe("deleteFeedbackSnippet", () => {
    it("deletes snippet owned by lecturer", async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 2 }]),
        }),
      });

      const res = await deleteFeedbackSnippet(2);
      expect(res.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/snippets");
    });

    it("throws error when deleting non-existent or other lecturer's snippet", async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(deleteFeedbackSnippet(999)).rejects.toThrow(
        "Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn."
      );
    });
  });
});
