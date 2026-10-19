import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  values: vi.fn(),
  getSession: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/services", () => ({
  db: {
    select: () => {
      const queryObj: any = {
        where: () => ({ limit: mocks.limit, then: (res: any) => Promise.resolve(mocks.limit()).then(res) }),
        limit: mocks.limit,
      };
      queryObj.leftJoin = () => queryObj;
      queryObj.innerJoin = () => queryObj;
      queryObj.from = () => queryObj;
      return queryObj;
    },
    update: () => ({
      set: (val: any) => {
        mocks.updateSet(val);
        return {
          where: (...args: any[]) => {
            mocks.updateWhere(...args);
            return Promise.resolve();
          },
        };
      },
    }),
    insert: () => ({ values: mocks.values }),
    transaction: (fn: any) => mocks.transaction(fn),
  },
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { GET as getOrder } from "./[id]/route";
import { POST as manualCheck } from "./[id]/manual-check/route";
import { POST as newCode } from "./[id]/new-code/route";
import { POST as cancelOrder } from "./cancel/route";

describe("Order API Routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-123" } });
  });

  describe("GET /api/orders/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      mocks.getSession.mockResolvedValueOnce(null);
      const req = new Request("http://localhost/api/orders/CODI12345");
      const res = await getOrder(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when order not found", async () => {
      mocks.limit.mockResolvedValueOnce([]);
      const req = new Request("http://localhost/api/orders/CODI99999");
      const res = await getOrder(req, { params: Promise.resolve({ id: "CODI99999" }) });
      expect(res.status).toBe(404);
    });

    it("returns order details with bank info when found", async () => {
      const orderDate = new Date();
      const deadline = new Date(orderDate.getTime() + 30 * 60000);
      mocks.limit
        .mockResolvedValueOnce([
          {
            id: 10,
            code: "CODI12345",
            userId: "user-123",
            voucherId: null,
            subtotal: 500000,
            discountAmount: 0,
            totalAmount: 500000,
            receivedAmount: 0,
            status: "pending",
            failReason: null,
            isBuyNow: false,
            paymentDeadline: deadline,
            createdAt: orderDate,
            paidAt: null,
            cancelledAt: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            courseId: "c1",
            courseTitle: "TypeScript Basic",
            unitPrice: 500000,
            courseSlug: "typescript-basic",
          },
        ]);

      const req = new Request("http://localhost/api/orders/CODI12345");
      const res = await getOrder(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.order.code).toBe("CODI12345");
      expect(data.order.items.length).toBe(1);
      expect(data.bank.bank).toBeDefined();
      expect(data.bank.accountNumber).toBeDefined();
    });
  });

  describe("POST /api/orders/[id]/manual-check", () => {
    it("returns 401 when unauthenticated", async () => {
      mocks.getSession.mockResolvedValueOnce(null);
      const req = new Request("http://localhost/api/orders/CODI12345/manual-check", { method: "POST" });
      const res = await manualCheck(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(401);
    });

    it("returns order status and timestamp", async () => {
      const deadline = new Date(Date.now() + 10 * 60000);
      mocks.limit.mockResolvedValueOnce([
        {
          id: 10,
          code: "CODI12345",
          status: "pending",
          failReason: null,
          receivedAmount: 0,
          totalAmount: 500000,
          paymentDeadline: deadline,
        },
      ]);

      const req = new Request("http://localhost/api/orders/CODI12345/manual-check", { method: "POST" });
      const res = await manualCheck(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("pending");
      expect(data.checkedAt).toBeDefined();
    });
  });

  describe("POST /api/orders/[id]/new-code", () => {
    it("rejects new code generation if order is not failed", async () => {
      mocks.transaction.mockImplementation(async (fn) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 10,
                    code: "CODI12345",
                    status: "pending", // Still pending!
                  },
                ]),
              }),
            }),
          }),
        }),
      );

      const req = new Request("http://localhost/api/orders/CODI12345/new-code", { method: "POST" });
      const res = await newCode(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(400);
    });

    it("generates replacement order row when old order is failed", async () => {
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 11, code: "CODI77777" }]),
        }),
      });

      mocks.transaction.mockImplementation(async (fn) =>
        fn({
          select: () => ({
            from: () => ({
              where: vi.fn().mockImplementation(() => {
                const limitFn = vi.fn()
                  .mockResolvedValueOnce([
                    {
                      id: 10,
                      code: "CODI12345",
                      userId: "user-123",
                      voucherId: null,
                      subtotal: 500000,
                      discountAmount: 0,
                      totalAmount: 500000,
                      status: "failed",
                      failReason: "expired",
                      isBuyNow: false,
                    },
                  ])
                  .mockResolvedValueOnce([]); // uniqueness check

                return {
                  limit: limitFn,
                  then: (resolve: any) =>
                    Promise.resolve([
                      {
                        courseId: "c1",
                        courseTitle: "TypeScript Basic",
                        unitPrice: 500000,
                      },
                    ]).then(resolve),
                };
              }),
            }),
          }),
          insert: insertMock,
        }),
      );

      const req = new Request("http://localhost/api/orders/CODI12345/new-code", { method: "POST" });
      const res = await newCode(req, { params: Promise.resolve({ id: "CODI12345" }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.orderCode).toBe("CODI77777");
    });
  });

  describe("POST /api/orders/cancel", () => {
    it("cancels pending order and re-adds items to studentCart", async () => {
      const cartInserts: string[] = [];

      mocks.transaction.mockImplementation(async (fn) =>
        fn({
          update: () => ({
            set: () => ({
              where: () => ({
                returning: vi.fn().mockResolvedValue([{ id: 10, code: "CODI12345" }]),
              }),
            }),
          }),
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([{ courseId: "c1" }, { courseId: "c2" }]),
            }),
          }),
          insert: () => ({
            values: (val: any) => {
              if (val.courseId) cartInserts.push(val.courseId);
              return { onConflictDoNothing: vi.fn() };
            },
          }),
        }),
      );

      const req = new Request("http://localhost/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: 10 }),
      });
      const res = await cancelOrder(req);
      expect(res.status).toBe(200);
      expect(cartInserts).toEqual(["c1", "c2"]);
    });
  });
});
