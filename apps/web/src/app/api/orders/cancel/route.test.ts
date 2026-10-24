import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/services", () => ({
  db: {
    transaction: mocks.transaction,
  },
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { POST } from "./route";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/orders/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const res = await POST(createRequest({ orderId: 1 }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Vui lòng đăng nhập");
  });

  it("returns 400 if neither orderId nor orderCode is provided", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-123" } });

    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Vui lòng cung cấp mã đơn hàng cần hủy");
  });

  it("successfully cancels pending order by orderId", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-123" } });

    mocks.transaction.mockImplementation(async (cb) => {
      let selectCall = 0;
      const mockTx = {
        execute: vi.fn().mockResolvedValue(undefined),
        update: vi.fn()
          // 1. orders
          .mockReturnValueOnce({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 10, code: "CODI10101" }]),
              }),
            }),
          })
          // 2. studentTransactions
          .mockReturnValueOnce({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              selectCall++;
              return {
                // 1st & 2nd select: orderToCancel and lockedOrder
                limit: vi.fn().mockResolvedValue([{ id: 10, code: "CODI10101", status: "pending" }]),
                // 3rd select: orderItems (no limit)
                then: (resolve: any) => Promise.resolve([{ courseId: "c1" }]).then(resolve),
              };
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn(),
          }),
        }),
      };
      return cb(mockTx);
    });

    const res = await POST(createRequest({ orderId: 10 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Đã hủy đơn hàng thành công");
  });

  it("successfully cancels pending order by orderCode", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-123" } });

    mocks.transaction.mockImplementation(async (cb) => {
      let selectCall = 0;
      const mockTx = {
        execute: vi.fn().mockResolvedValue(undefined),
        update: vi.fn()
          // 1. orders
          .mockReturnValueOnce({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 20, code: "CODI20202" }]),
              }),
            }),
          })
          // 2. studentTransactions
          .mockReturnValueOnce({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "CODI20202" }]),
              }),
            }),
          }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              selectCall++;
              return {
                limit: vi.fn().mockResolvedValue([{ id: 20, code: "CODI20202", status: "pending" }]),
                then: (resolve: any) => Promise.resolve([{ courseId: "c2" }]).then(resolve),
              };
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn(),
          }),
        }),
      };
      return cb(mockTx);
    });

    const res = await POST(createRequest({ orderCode: "CODI20202" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 if order does not exist or is not pending", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-123" } });

    mocks.transaction.mockImplementation(async (cb) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      return cb(mockTx);
    });

    const res = await POST(createRequest({ orderId: 999 }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Đơn hàng không tồn tại");
  });
});
