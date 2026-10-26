import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { orders, orderEvents, payments } from "@codi-1/db";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const boundary = vi.hoisted(() => ({ db: {} as any, notify: vi.fn() }));
vi.mock("@/services", () => ({ db: boundary.db }));
vi.mock("@/lib/notification-service", () => ({ createNotificationService: () => ({ notify: boundary.notify }) }));
import { POST } from "./sepay/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SEPAY_WEBHOOK_SECRET", "offline-secret");
  vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "12345678");
  vi.stubEnv("SEPAY_BANK_CODE", "VCB");
});
afterEach(() => vi.unstubAllEnvs());

// Only the DB/provider boundary is modeled; the real authenticated handler
// selects identities, validates, deduplicates and decides every requested write.
function paidReceipt() {
  const order = { id: 998, code: "CODI99998", userId: "buyer", status: "paid", totalAmount: 500000, receivedAmount: 500000, needsReconciliation: false, paidAt: new Date("2026-10-01T00:00:00Z") };
  const legacy = { id: order.code, userId: order.userId, courseId: "course-1", amount: 500000, status: "paid" };
  const receipts: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const updates = vi.fn();
  const unexpectedWrite = vi.fn();
  const select = () => ({ from: (table: unknown) => ({ where: (predicate: SQL) => ({ limit: async () => {
    const query = new PgDialect().sqlToQuery(predicate);
    if (table === studentTransactions) { expect(query.params).toEqual([order.code]); return [{ ...legacy }]; }
    if (table === orders) { expect(query.params).toEqual([order.code]); return [{ ...order }]; }
    if (table === payments) return receipts.filter(receipt => query.params.includes(receipt.transactionCode));
    throw new Error("Unexpected paid-receipt read");
  } }) }) });
  const tx = {
    select,
    execute: vi.fn(async (statement: SQL) => {
      const query = new PgDialect().sqlToQuery(statement);
      expect(query.sql).toContain("pg_advisory_xact_lock");
      expect(query.params).toEqual([order.code]);
    }),
    update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: async (predicate: SQL) => {
      updates(table, value);
      const query = new PgDialect().sqlToQuery(predicate);
      if (table === orders) { expect(query.params).toEqual([order.id]); Object.assign(order, value); }
      else {
        expect(table).toBe(studentTransactions);
        expect(query.params).toEqual([order.code, "pending"]);
        if (legacy.status === "pending") Object.assign(legacy, value);
      }
    } }) }),
    insert: (table: unknown) => ({ values: async (value: Record<string, unknown>) => {
      if (table === payments) receipts.push(value);
      else if (table === orderEvents) events.push(value);
      else unexpectedWrite(table, value);
    } }),
  };
  Object.assign(boundary.db, { select, transaction: async (run: (tx: unknown) => unknown) => run(tx) });
  const deliver = (identity: Record<string, unknown>, amount = 50000) => POST(new Request("http://localhost/api/payments/sepay/callback", {
    method: "POST", headers: { authorization: "Apikey offline-secret" },
    body: JSON.stringify({ transferType: "in", accountNumber: "12345678", content: order.code, transferAmount: amount, ...identity }),
  }));
  return { order, legacy, receipts, events, updates, unexpectedWrite, deliver };
}

it.each([
  {}, { id: null }, { id: "" }, { id: " \t " }, { id: {} }, { id: { toString: null } }, { id: [] }, { id: false },
  { referenceCode: "" }, { referenceCode: " \n " }, { referenceCode: {} },
  { id: "", referenceCode: [] }, { id: {}, referenceCode: "   " },
])("rejects repeated paid deliveries with unusable receipt identity %j without accounting writes", async identity => {
  const s = paidReceipt();
  const original = structuredClone({ order: s.order, legacy: s.legacy });
  for (let delivery = 0; delivery < 2; delivery++) {
    const response = await s.deliver(identity);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, message: "Paid-order receipts require a valid provider transaction identifier" });
    expect({ order: s.order, legacy: s.legacy }).toEqual(original);
    expect(s.receipts).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.updates).not.toHaveBeenCalled();
    expect(s.unexpectedWrite).not.toHaveBeenCalled();
    expect(boundary.notify).not.toHaveBeenCalled();
  }
});

it.each([
  [{ id: 0 }, "0"], [{ id: 777 }, "777"], [{ id: "receipt-1" }, "receipt-1"],
  [{ id: " padded-id " }, " padded-id "], [{ referenceCode: "ref-1" }, "ref-1"],
  [{ id: "", referenceCode: "ref-1" }, "ref-1"], [{ id: " \t", referenceCode: "ref-1" }, "ref-1"],
  [{ id: {}, referenceCode: "ref-1" }, "ref-1"], [{ id: [], referenceCode: "ref-1" }, "ref-1"],
  [{ id: { toString: null }, referenceCode: "ref-1" }, "ref-1"],
  [{ id: false, referenceCode: "ref-1" }, "ref-1"], [{ id: null, referenceCode: 123 }, "123"],
  [{ id: "primary", referenceCode: "fallback" }, "primary"],
] as const)("records identified paid delivery once and accepts a distinct receipt: %j", async (identity, code) => {
  const s = paidReceipt();
  const paidAt = s.order.paidAt;
  const first = await s.deliver(identity);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ success: true, message: "Order not pending, marked for reconciliation" });
  expect(s.order).toMatchObject({ status: "paid", paidAt, receivedAmount: 550000, needsReconciliation: true });
  expect(s.receipts).toEqual([expect.objectContaining({ transactionCode: code, amount: 50000 })]);
  expect(s.events).toHaveLength(1);
  const replay = await s.deliver(identity);
  expect(await replay.json()).toEqual({ success: true, message: "Already processed" });
  expect(s.order.receivedAmount).toBe(550000);
  expect(s.receipts).toHaveLength(1);
  expect(s.events).toHaveLength(1);
  await s.deliver({ referenceCode: "different-ref" }, 10000);
  expect(s.order).toMatchObject({ status: "paid", paidAt, receivedAmount: 560000 });
  expect(s.receipts).toHaveLength(2);
  expect(s.events).toHaveLength(2);
  expect(s.legacy.status).toBe("paid");
  expect(s.unexpectedWrite).not.toHaveBeenCalled();
  expect(boundary.notify).not.toHaveBeenCalled();
});

it("rejects unusable paid identity even when its old stringification matches a ledger row", async () => {
  const s = paidReceipt();
  s.receipts.push({ transactionCode: "[object Object]", amount: 1 });
  const response = await s.deliver({ id: {} });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ success: false });
  expect(s.order.receivedAmount).toBe(500000);
  expect(s.receipts).toHaveLength(1);
  expect(s.events).toEqual([]);
  expect(s.updates).not.toHaveBeenCalled();
  expect(s.unexpectedWrite).not.toHaveBeenCalled();
});
