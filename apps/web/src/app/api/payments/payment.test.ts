import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), values: vi.fn(), getSession: vi.fn(), transaction: vi.fn() }));
vi.mock("@/services", () => ({
 db: {
   select: () => {
     const queryObj: any = {
       where: () => ({ limit: mocks.limit }),
       limit: mocks.limit,
     };
     queryObj.innerJoin = () => queryObj;
     queryObj.from = () => queryObj;
     return queryObj;
   },
   insert: () => ({ values: mocks.values }),
   transaction: mocks.transaction
 },
 auth: { api: { getSession: mocks.getSession } }
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { POST as create } from "./create-transaction/route";
import { POST as callback } from "./sepay/callback/route";
const request = (body: unknown, authorized = true) => new Request("http://localhost/api/payments", { method: "POST", headers: authorized ? { authorization: "Apikey test-secret" } : {}, body: JSON.stringify(body) });
beforeEach(() => {
 vi.resetAllMocks();
 vi.stubEnv("SEPAY_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "12345678"); vi.stubEnv("SEPAY_BANK_CODE", "VCB");
 mocks.getSession.mockResolvedValue({ user: { id: "session-user" } });
 mocks.limit.mockResolvedValue([{ id: "db-id", slug: "database-only", title: "Database course", category: "Backend", price: 125000 }]);
});
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "", "   "])("fails closed without a webhook secret (%s)", async (secret) => {
 vi.stubEnv("SEPAY_WEBHOOK_SECRET", secret);
 const response = await callback(request({ transferType: "in", accountNumber: "12345678", content: "CODI12345", transferAmount: 125000 }, false));
 expect(response.status).toBe(503); expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects invalid webhook authentication", async () => { expect((await callback(request({}, false))).status).toBe(401); });
it("returns authoritative price and configured receiver for a database-only slug", async () => {
 mocks.limit
   .mockResolvedValueOnce([{ id: "db-id", slug: "database-only", title: "Database course", category: "Backend", price: 125000 }])
   .mockResolvedValueOnce([])
   .mockResolvedValueOnce([]);
 const response = await create(request({ courseSlug: "database-only", amount: 1, userId: "attacker" }));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ amount: 125000, receiver: { bankCode: "VCB", accountNumber: "12345678" }, course: { id: "db-id", title: "Database course" } });
 expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 125000, courseId: "db-id", userId: "session-user" }));
});
it("does not request payment for a free course", async () => {
 mocks.limit.mockResolvedValue([{ id: "free", price: 0 }]);
 expect((await create(request({ courseId: "free" }))).status).toBe(422); expect(mocks.values).not.toHaveBeenCalled();
});
it("rejects missing receiver configuration before inserting an order", async () => {
 vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "");
 expect((await create(request({ courseId: "db-id" }))).status).toBe(503); expect(mocks.values).not.toHaveBeenCalled();
});
it("preserves session and missing-course errors", async () => {
 mocks.getSession.mockResolvedValueOnce(null); expect((await create(request({ courseId: "db-id" }))).status).toBe(401);
 mocks.limit.mockResolvedValueOnce([]); expect((await create(request({ courseId: "missing" }))).status).toBe(404);
});
it.each(["out", "wrong-account"])("ignores unrelated transfer %s before database access", async (kind) => {
 const response = await callback(request({ transferType: kind === "out" ? "out" : "in", accountNumber: kind === "wrong-account" ? "999" : "12345678", content: "CODI12345", transferAmount: 125000 }));
 expect(response.status).toBe(200); expect(mocks.limit).not.toHaveBeenCalled();
});
it("enrolls only a sufficiently funded authenticated incoming transfer and settles matched order", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI12345",
      amount: 125000,
      status: "pending",
      userId: "session-user",
      courseId: "db-id",
    },
  ]);
  const update = vi.fn();
  const enroll = vi.fn();
  const insertEvent = vi.fn();

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([{ id: "order-123", status: "pending" }]),
          }),
        }),
      }),
      update: () => ({
        set: (value: unknown) => {
          update(value);
          return {
            where: () => ({
              returning: vi.fn().mockImplementation(() => [{ id: "order-123", totalAmount: 125000 }]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (value: unknown) => {
          if (value && typeof value === "object" && "orderId" in value) {
            insertEvent(value);
            return { returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
          }
          if (value && typeof value === "object" && "title" in value) {
            return { returning: vi.fn().mockResolvedValue([{ id: 1, ...value }]) };
          }
          enroll(value);
          return { onConflictDoNothing: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
        },
      }),
    }),
  );

  await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 1,
    }),
  );
  expect(mocks.transaction).not.toHaveBeenCalled();

  await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 125000,
    }),
  );
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "paid" }),
  );
  expect(enroll).toHaveBeenCalledWith({
    userId: "session-user",
    courseId: "db-id",
  });
  expect(insertEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      orderId: "order-123",
      actorId: "session-user",
    }),
  );
});

it("does not enroll learner if the order is already cancelled or expired", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI12345",
      amount: 125000,
      status: "pending",
      userId: "session-user",
      courseId: "db-id",
    },
  ]);
  const update = vi.fn();
  const enroll = vi.fn();

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([{ id: "order-123", status: "cancelled" }]),
          }),
        }),
      }),
      update: () => ({
        set: (value: unknown) => {
          update(value);
          return {
            where: vi.fn(),
          };
        },
      }),
      insert: () => ({
        values: (value: unknown) => {
          enroll(value);
          return { onConflictDoNothing: vi.fn() };
        },
      }),
    }),
  );

  const res = await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 125000,
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    success: true,
    message: "Order not pending, marked for reconciliation",
  });
  expect(update).toHaveBeenCalledWith({ status: "failed" });
  expect(enroll).not.toHaveBeenCalled();
});

it("reuses and validates orderCode in create-transaction", async () => {
  mocks.limit
    .mockResolvedValueOnce([{ id: "db-id", slug: "database-only", title: "Database course", category: "Backend", price: 125000 }])
    .mockResolvedValueOnce([{ id: 10, code: "CODI12345", totalAmount: 120000 }])
    .mockResolvedValueOnce([]); // existingTx check

  const response = await create(
    request({ courseId: "db-id", orderCode: "CODI12345" })
  );

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.transactionId).toBe("CODI12345");
  expect(data.amount).toBe(120000);
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "CODI12345",
      userId: "session-user",
      courseId: "db-id",
      amount: 120000,
      status: "pending",
    })
  );
});

it("ignores callback if transaction is already processed concurrently", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI12345",
      amount: 125000,
      status: "pending",
      userId: "session-user",
      courseId: "db-id",
    },
  ]);
  const enroll = vi.fn();

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockReturnValue([]),
          }),
        }),
      }),
      insert: () => ({
        values: (value: unknown) => {
          enroll(value);
          return { onConflictDoNothing: vi.fn() };
        },
      }),
    }),
  );

  const res = await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 125000,
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    success: true,
    message: "Already processed",
  });
  expect(enroll).not.toHaveBeenCalled();
});

it("enrolls all order_items and increments voucher usedCount atomically upon successful payment", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI55555",
      amount: 800000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const enrolledCourses: string[] = [];
  const updatedVouchers: any[] = [];

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => ({
            // If selecting order
            limit: vi.fn().mockResolvedValue([{ id: 555, status: "pending", voucherId: 77 }]),
            // If selecting orderItems (no limit)
            then: (resolve: any) =>
              resolve([
                { courseId: "course-1" },
                { courseId: "course-2" },
                { courseId: "course-3" },
              ]),
          })),
        }),
      }),
      update: () => ({
        set: (value: any) => ({
          where: vi.fn().mockImplementation(() => {
            if ("usedCount" in value) {
              updatedVouchers.push(value);
              return {
                returning: vi.fn().mockResolvedValue([{ id: 77 }]),
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: 555, totalAmount: 800000, voucherId: 77 }]),
            };
          }),
        }),
      }),
      insert: () => ({
        values: (value: any) => {
          if (value && typeof value === "object" && "courseId" in value && !("orderId" in value)) {
            enrolledCourses.push(value.courseId);
          }
          return { onConflictDoNothing: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
        },
      }),
    }),
  );

  const res = await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI55555",
      transferAmount: 800000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  // All 3 courses enrolled
  expect(enrolledCourses).toEqual(["course-1", "course-2", "course-3"]);
  // Voucher usedCount incremented
  expect(updatedVouchers.length).toBe(1);
});

