import { describe, expect, it, vi } from "vitest";
import {
  adminHideCourse,
  adminUnhideCourse,
  adminUpdateCoursePrice,
} from "./admin-courses-service";

describe("admin-courses-service unit tests", () => {
  describe("adminHideCourse", () => {
    it("requires a non-empty reason to hide course", async () => {
      const mockDb = {};
      await expect(
        adminHideCourse(mockDb as any, "course-1", "", "admin-1")
      ).rejects.toThrow("Lý do ẩn khoá học là bắt buộc.");

      await expect(
        adminHideCourse(mockDb as any, "course-1", "   ", "admin-1")
      ).rejects.toThrow("Lý do ẩn khoá học là bắt buộc.");
    });

    it("hides published course and notifies instructor", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Lập trình React cơ bản",
        status: "published",
        instructorId: "inst-1",
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockCourse]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      const res = await adminHideCourse(
        mockDb as any,
        "course-1",
        "Nội dung cần cập nhật",
        "admin-1"
      );
      expect(res.success).toBe(true);
      expect(res.title).toBe("Lập trình React cơ bản");
      expect(mockTx.update).toHaveBeenCalled();
    });

    it("throws error when trying to hide an already hidden course", async () => {
      const mockCourse = {
        id: "course-2",
        title: "Node.js",
        status: "hidden",
        instructorId: "inst-1",
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockCourse]),
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      await expect(
        adminHideCourse(mockDb as any, "course-2", "Lý do", "admin-1")
      ).rejects.toThrow("Chỉ có thể ẩn khoá học đang được xuất bản.");
    });
  });

  describe("adminUnhideCourse", () => {
    it("unhides hidden course successfully", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Lập trình React cơ bản",
        status: "hidden",
        instructorId: "inst-1",
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockCourse]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      const res = await adminUnhideCourse(mockDb as any, "course-1", "admin-1");
      expect(res.success).toBe(true);
      expect(res.title).toBe("Lập trình React cơ bản");
      expect(mockTx.update).toHaveBeenCalled();
    });
  });

  describe("adminUpdateCoursePrice", () => {
    it("validates price is non-negative integer", async () => {
      const mockDb = {};
      await expect(
        adminUpdateCoursePrice(mockDb as any, "course-1", -50000, "admin-1")
      ).rejects.toThrow("Giá phải là số nguyên không âm.");

      await expect(
        adminUpdateCoursePrice(mockDb as any, "course-1", 99.5, "admin-1")
      ).rejects.toThrow("Giá phải là số nguyên không âm.");
    });

    it("throws error if new price matches existing price", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Lập trình React cơ bản",
        price: 500000,
        instructorId: "inst-1",
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockCourse]),
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      await expect(
        adminUpdateCoursePrice(mockDb as any, "course-1", 500000, "admin-1")
      ).rejects.toThrow("Giá mới đang trùng giá hiện tại.");
    });

    it("updates price and returns previous and new prices", async () => {
      const mockCourse = {
        id: "course-1",
        title: "Lập trình React cơ bản",
        price: 500000,
        instructorId: "inst-1",
      };

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockCourse]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      const res = await adminUpdateCoursePrice(mockDb as any, "course-1", 690000, "admin-1");
      expect(res.success).toBe(true);
      expect(res.oldPrice).toBe(500000);
      expect(res.newPrice).toBe(690000);
      expect(mockTx.update).toHaveBeenCalled();
    });
  });
});
