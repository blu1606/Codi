import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), values: vi.fn(), getSession: vi.fn(), transaction: vi.fn() }));
vi.mock("@/services", () => ({
 db: {
   execute: vi.fn().mockResolvedValue(undefined),
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
   transaction: (fn: any) => mocks.transaction((tx: any) => fn({ execute: vi.fn().mockResolvedValue(undefined), ...tx }))
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
            limit: vi.fn().mockResolvedValue([
              {
                id: "order-123",
                status: "pending",
                totalAmount: 125000,
                receivedAmount: 0,
              },
            ]),
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

  // First transfer is partial (1 VND < 125,000 VND)
  await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 1,
    }),
  );
  // Transaction is called to record partial payment in payments & update receivedAmount
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
  expect(enroll).not.toHaveBeenCalled();

  // Second transfer covers the remaining balance (124,999 VND or 125,000 VND)
  await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI12345",
      transferAmount: 125000,
    }),
  );
  expect(mocks.transaction).toHaveBeenCalledTimes(2);
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

it("D2: auto-honours late payment when expired and learner does not own courses yet", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99991",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const enrollMock = vi.fn();
  const eventLabels: string[] = [];
  let selectCallCount = 0;

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return {
              // 1st: select order (failed + expired)
              limit: vi.fn().mockResolvedValue([
                {
                  id: 991,
                  status: "failed",
                  failReason: "expired",
                  totalAmount: 500000,
                  receivedAmount: 0,
                  voucherId: null,
                },
              ]),
              // 2nd: select orderItems, 3rd: select owned courses (none owned)
              then: (resolve: any) => {
                if (selectCallCount === 2) {
                  return resolve([{ id: 1, courseId: "course-1" }]);
                }
                return resolve([]); // not owned yet!
              },
            };
          }),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return {
            where: () => ({
              returning: vi.fn().mockReturnValue([{ id: 991, totalAmount: 500000 }]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "label" in val) {
            eventLabels.push(val.label);
          }
          if (val && typeof val === "object" && "courseId" in val && !("orderId" in val)) {
            enrollMock(val);
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
      content: "CODI99991",
      transferAmount: 500000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: "paid" }),
  );
  expect(enrollMock).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "session-user", courseId: "course-1" }),
  );
  expect(eventLabels).toContain("Thanh toán muộn được chấp nhận");
});

it("D2: marks order for reconciliation when expired and learner already owns all courses", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99992",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const enrollMock = vi.fn();
  let selectCallCount = 0;

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return {
              // 1st: select order
              limit: vi.fn().mockResolvedValue([
                {
                  id: 992,
                  status: "failed",
                  failReason: "expired",
                  totalAmount: 500000,
                  receivedAmount: 0,
                  voucherId: null,
                },
              ]),
              // 2nd: items, 3rd: owned enrollments
              then: (resolve: any) => {
                if (selectCallCount === 2) {
                  return resolve([{ id: 1, courseId: "course-1" }]);
                }
                return resolve([{ courseId: "course-1" }]); // Owned!
              },
            };
          }),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return { where: vi.fn().mockResolvedValue([]) };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "courseId" in val && !("orderId" in val)) {
            enrollMock(val);
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
      content: "CODI99992",
      transferAmount: 500000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, message: "Order not pending, marked for reconciliation" });
  // Kept failed + marked for reconciliation
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({ needsReconciliation: true }),
  );
  expect(enrollMock).not.toHaveBeenCalled();
});

it("D3: flags order with needsReconciliation when overpaid", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99993",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const eventLabels: string[] = [];

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: 993,
                status: "pending",
                failReason: null,
                totalAmount: 500000,
                receivedAmount: 0,
                voucherId: null,
              },
            ]),
            then: (resolve: any) => resolve([{ id: 1, courseId: "course-1" }]),
          })),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return {
            where: () => ({
              returning: vi.fn().mockReturnValue([{ id: 993, totalAmount: 500000 }]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "label" in val) {
            eventLabels.push(val.label);
          }
          return { onConflictDoNothing: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
        },
      }),
    }),
  );

  // Transfer 600,000 VND for order of 500,000 VND
  const res = await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI99993",
      transferAmount: 600000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "paid",
      receivedAmount: 600000,
      needsReconciliation: true,
    }),
  );
  expect(eventLabels.some((l) => l.includes("Chuyển thừa"))).toBe(true);
});

it("P1: acquires pg_advisory_xact_lock to serialize concurrent transfers", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI12345",
      amount: 125000,
      status: "pending",
      userId: "session-user",
      courseId: "db-id",
    },
  ]);
  const executedSql: string[] = [];

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      execute: (stmt: any) => {
        executedSql.push(stmt?.queryChunks ? JSON.stringify(stmt.queryChunks) : "sql");
        return Promise.resolve();
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "order-123",
                status: "pending",
                totalAmount: 125000,
                receivedAmount: 0,
              },
            ]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockImplementation(() => [{ id: "order-123", totalAmount: 125000 }]),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: vi.fn(),
          returning: vi.fn().mockReturnValue([{ id: 1 }]),
        }),
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
  expect(executedSql.length).toBeGreaterThan(0);
  expect(executedSql[0]).toContain("pg_advisory_xact_lock");
});

it("P2: flags order with needsReconciliation when partial transfer arrives after order expired", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99994",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const eventLabels: string[] = [];

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: 994,
                status: "failed",
                failReason: "expired",
                totalAmount: 500000,
                receivedAmount: 0,
                voucherId: null,
              },
            ]),
            then: (resolve: any) => resolve([]), // courseIds not owned
          })),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return {
            where: () => ({
              returning: vi.fn().mockReturnValue([]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "label" in val) {
            eventLabels.push(val.label);
          }
          return { onConflictDoNothing: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
        },
      }),
    }),
  );

  // Transfer 200,000 VND for expired order of 500,000 VND
  const res = await callback(
    request({
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI99994",
      transferAmount: 200000,
    }),
  );

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toMatchObject({ underpaid: true, receivedAmount: 200000, targetTotal: 500000 });
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      receivedAmount: 200000,
      needsReconciliation: true,
    }),
  );
  expect(eventLabels.some((l) => l.includes("Thanh toán thiếu sau khi hết hạn"))).toBe(true);
});

it("P1: late-honours order if concurrent expiry changed pending order to failed right before settlement", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99995",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const enrollMock = vi.fn();
  const eventLabels: string[] = [];
  let selectCallCount = 0;

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return {
              // 1st: initial select sees pending (before race)
              // 2nd: freshOrder re-select sees failed (expired)
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) {
                  return Promise.resolve([
                    {
                      id: 995,
                      code: "CODI99995",
                      userId: "session-user",
                      status: "pending",
                      failReason: null,
                      totalAmount: 500000,
                      receivedAmount: 0,
                      voucherId: null,
                    },
                  ]);
                }
                return Promise.resolve([
                  {
                    id: 995,
                    status: "failed",
                    failReason: "expired",
                    totalAmount: 500000,
                    voucherId: null,
                  },
                ]);
              }),
              then: (resolve: any) => {
                if (selectCallCount === 3) {
                  // freshItems
                  return resolve([{ id: 1, courseId: "course-1" }]);
                }
                // owned courses check (empty -> not owned)
                return resolve([]);
              },
            };
          }),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return {
            where: () => ({
              returning: vi.fn().mockImplementation(() => {
                // When updating studentTransactions, return the updated id
                if (val?.status === "paid" && !("receivedAmount" in val)) {
                  return [{ id: "CODI99995" }];
                }
                // When updating orders.status = 'pending', return empty to simulate race condition
                return [];
              }),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "label" in val) {
            eventLabels.push(val.label);
          }
          if (val && typeof val === "object" && "courseId" in val && !("orderId" in val)) {
            enrollMock(val);
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
      content: "CODI99995",
      transferAmount: 500000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: "paid" }),
  );
  expect(enrollMock).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "session-user", courseId: "course-1" }),
  );
  expect(eventLabels).toContain("Thanh toán muộn được chấp nhận");
});

it("P1: marks for reconciliation if concurrent expiry changed pending order to failed and courses are already owned", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99996",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const enrollMock = vi.fn();
  let selectCallCount = 0;

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return {
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) {
                  return Promise.resolve([
                    {
                      id: 996,
                      code: "CODI99996",
                      userId: "session-user",
                      status: "pending",
                      failReason: null,
                      totalAmount: 500000,
                      receivedAmount: 0,
                      voucherId: null,
                    },
                  ]);
                }
                return Promise.resolve([
                  {
                    id: 996,
                    status: "failed",
                    failReason: "expired",
                    totalAmount: 500000,
                    voucherId: null,
                  },
                ]);
              }),
              then: (resolve: any) => {
                if (selectCallCount === 3) {
                  return resolve([{ id: 1, courseId: "course-1" }]);
                }
                // owned courses check (has course-1 -> already owned!)
                return resolve([{ courseId: "course-1" }]);
              },
            };
          }),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          updateOrderMock(val);
          return {
            where: () => ({
              returning: vi.fn().mockImplementation(() => {
                // When updating studentTransactions, return the updated id
                if (val?.status === "paid" && !("receivedAmount" in val)) {
                  return [{ id: "CODI99996" }];
                }
                return [];
              }),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "courseId" in val && !("orderId" in val)) {
            enrollMock(val);
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
      content: "CODI99996",
      transferAmount: 500000,
    }),
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, message: "Order not pending, marked for reconciliation" });
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({ needsReconciliation: true }),
  );
  expect(enrollMock).not.toHaveBeenCalled();
});

it("P1: cancels concurrent callback and persists payment failure and reconciliation when order was cancelled", async () => {
  mocks.limit.mockResolvedValue([
    {
      id: "CODI99997",
      amount: 500000,
      status: "pending",
      userId: "session-user",
      courseId: "course-1",
    },
  ]);

  const updateOrderMock = vi.fn();
  const updatePaymentMock = vi.fn();
  const updateTxMock = vi.fn();
  const enrollMock = vi.fn();
  const eventLabels: string[] = [];
  let selectCallCount = 0;

  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            return {
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) {
                  // Idempotency check: providerTxCode not processed yet
                  return Promise.resolve([]);
                }
                if (selectCallCount === 2) {
                  // Initial check sees order pending before cancellation commits
                  return Promise.resolve([
                    {
                      id: 997,
                      code: "CODI99997",
                      userId: "session-user",
                      status: "pending",
                      failReason: null,
                      totalAmount: 500000,
                      receivedAmount: 0,
                      voucherId: null,
                    },
                  ]);
                }
                // Fresh order re-read after updatedTx returns 0: order is cancelled
                return Promise.resolve([
                  {
                    id: 997,
                    status: "cancelled",
                    receivedAmount: 0,
                  },
                ]);
              }),
            };
          }),
        }),
      }),
      update: () => ({
        set: (val: any) => {
          if ("needsReconciliation" in val) {
            updateOrderMock(val);
          } else if ("failureReason" in val) {
            updatePaymentMock(val);
          } else if (val?.status === "failed") {
            updateTxMock(val);
          }
          return {
            where: () => ({
              // Updating studentTransactions pending -> paid returns 0 rows because cancellation changed it to cancelled
              returning: vi.fn().mockReturnValue([]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (val: any) => {
          if (val && typeof val === "object" && "label" in val) {
            eventLabels.push(val.label);
          }
          if (val && typeof val === "object" && "courseId" in val && !("orderId" in val)) {
            enrollMock(val);
          }
          return { onConflictDoNothing: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
        },
      }),
    }),
  );

  const res = await callback(
    request({
      id: 99997001,
      transferType: "in",
      accountNumber: "12345678",
      content: "CODI99997",
      transferAmount: 500000,
      referenceCode: "SEPAY_REF_99997",
    }),
  );

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toMatchObject({ success: true, message: "Order not pending, marked for reconciliation" });

  // Assert order marked for reconciliation
  expect(updateOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      receivedAmount: 500000,
      needsReconciliation: true,
    }),
  );

  // Assert payment receipt marked as failed with failureReason
  expect(updatePaymentMock).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "failed",
    }),
  );

  // Assert transaction marked failed
  expect(updateTxMock).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "failed",
    }),
  );

  // Assert no course was enrolled
  expect(enrollMock).not.toHaveBeenCalled();

  // Assert event was logged
  expect(eventLabels.some((l) => l.includes("cần đối soát hoàn tiền"))).toBe(true);
});


