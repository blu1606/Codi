import { describe, expect, it, vi } from "vitest";
import {
  isOrderOverdue,
  getAdminOrders,
  adminCancelOrder,
} from "./admin-orders-service";

describe("admin-orders-service unit tests", () => {
  describe("isOrderOverdue", () => {
    it("returns false for non-pending orders regardless of age", () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      expect(isOrderOverdue({ status: "paid", createdAt: twoDaysAgo })).toBe(false);
      expect(isOrderOverdue({ status: "cancelled", createdAt: twoDaysAgo })).toBe(false);
      expect(isOrderOverdue({ status: "failed", createdAt: twoDaysAgo })).toBe(false);
    });

    it("returns false for pending orders created within 24 hours", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(isOrderOverdue({ status: "pending", createdAt: twoHoursAgo })).toBe(false);
    });

    it("returns true for pending orders older than 24 hours", () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      expect(isOrderOverdue({ status: "pending", createdAt: twentyFiveHoursAgo })).toBe(true);
    });
  });

  describe("adminCancelOrder", () => {
    it("requires a non-empty reason to cancel order", async () => {
      const mockDb = {};
      await expect(
        adminCancelOrder(mockDb as any, 101, "admin-1", "")
      ).rejects.toThrow("Lý do huỷ đơn hàng là bắt buộc.");

      await expect(
        adminCancelOrder(mockDb as any, 101, "admin-1", "   ")
      ).rejects.toThrow("Lý do huỷ đơn hàng là bắt buộc.");
    });

    it("cancels pending order, synchronizes studentTransactions, and records orderEvent", async () => {
      const mockCancelledOrder = {
        id: 101,
        code: "ORD-101",
        userId: "user-1",
      };

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockCancelledOrder]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      const res = await adminCancelOrder(mockDb as any, 101, "admin-1", "Quá hạn thanh toán");
      expect(res.success).toBe(true);
      expect(res.orderCode).toBe("ORD-101");
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it("throws error if order was already completed or concurrently paid (interleaving race prevention)", async () => {
      const mockPaidOrder = {
        id: 102,
        code: "ORD-102",
        status: "paid",
        userId: "user-1",
      };

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockPaidOrder]),
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };

      await expect(
        adminCancelOrder(mockDb as any, 102, "admin-1", "Hết hạn")
      ).rejects.toThrow("Chỉ có thể huỷ đơn đang chờ thanh toán (trạng thái hiện tại: paid).");
    });
  });
});
