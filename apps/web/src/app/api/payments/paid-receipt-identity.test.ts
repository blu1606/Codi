import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { orders, orderEvents, orderItems, payments } from "@codi-1/db";
import { studentEnrollments, studentTransactions } from "@codi-1/db/schema/student-profile";
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
function paidReceipt(status = "paid", canonical = true) {
  const order = { id: 998, code: "CODI99998", userId: "buyer", status, totalAmount: 500000, receivedAmount: status === "paid" ? 500000 : 0, needsReconciliation: false, paidAt: status === "paid" ? new Date("2026-10-01T00:00:00Z") : null, voucherId: null, failReason: status === "failed" ? "expired" : null };
  const legacy = { id: order.code, userId: order.userId, courseId: "course-1", amount: 500000, status };
  const receipts: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const updates = vi.fn();
  const unexpectedWrite = vi.fn();
  const fulfill = vi.fn();
  const receiptInsert = vi.fn();
  const select = () => ({ from: (table: unknown) => ({ where: (predicate: SQL) => {
    const rows = () => {
      const query = new PgDialect().sqlToQuery(predicate);
      if (table === studentTransactions) { expect(query.params).toEqual([order.code]); return [{ ...legacy }]; }
      if (table === orders) { expect(query.params).toEqual([order.code]); return canonical ? [{ ...order }] : []; }
      if (table === payments) {
        if (query.sql.includes('"transaction_code"')) return receipts.filter(receipt => query.params.includes(receipt.transactionCode));
        expect(query.params).toEqual([order.id]);
        return receipts.filter(receipt => receipt.orderId === order.id);
      }
      if (table === orderItems) { expect(query.params).toEqual([order.id]); return [{ id: 1, courseId: "course-1" }]; }
      if (table === studentEnrollments) return [];
      throw new Error("Unexpected receipt read");
    };
    return { limit: async () => rows(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve) };
  } }) });
  const tx = {
    select,
    execute: vi.fn(async (statement: SQL) => {
      const query = new PgDialect().sqlToQuery(statement);
      expect(query.sql).toContain("pg_advisory_xact_lock");
      expect(query.params).toEqual([order.code]);
    }),
    update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: (predicate: SQL) => {
      const apply = () => {
        updates(table, value);
        const query = new PgDialect().sqlToQuery(predicate);
        if (table === orders) {
          if (query.params.includes("pending") && order.status !== "pending") return [];
          Object.assign(order, Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
          return [{ ...order }];
        }
        expect(table).toBe(studentTransactions);
        if (query.params.includes("pending") && legacy.status !== "pending" && !(query.params.includes(true) && legacy.status === "failed")) return [];
        Object.assign(legacy, value);
        return [{ ...legacy }];
      };
      return { returning: async () => apply(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(apply()).then(resolve) };
    } }) }),
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
      if (table === studentEnrollments) return { onConflictDoNothing: async () => { fulfill(value); } };
      if (table === payments) {
        if (receipts.some(receipt => receipt.transactionCode === value.transactionCode)) throw new Error("Duplicate physical receipt key");
        receiptInsert(value);
        receipts.push(value);
      } else if (table === orderEvents) events.push(value);
      else unexpectedWrite(table, value);
      return Promise.resolve();
    } }),
  };
  Object.assign(boundary.db, { select, transaction: async (run: (tx: unknown) => unknown) => run(tx) });
  const deliver = (identity: Record<string, unknown>, amount = 50000) => POST(new Request("http://localhost/api/payments/sepay/callback", {
    method: "POST", headers: { authorization: "Apikey offline-secret" },
    body: JSON.stringify({ transferType: "in", accountNumber: "12345678", content: order.code, transferAmount: amount, ...identity }),
  }));
  return { order, legacy, receipts, events, updates, unexpectedWrite, fulfill, receiptInsert, deliver };
}

const malformedPrimaries: { id: unknown }[] = [{ id: false }, { id: {} }, { id: [] }, { id: "" }, { id: " \t" }];
it.each(malformedPrimaries)("preserves settlement identity across pending to paid with primary %j", async ({ id }) => {
  const s = paidReceipt("pending");
  expect((await s.deliver({ id, referenceCode: "stable-ref" }, 500000)).status).toBe(200);
  expect(s.order.status).toBe("paid");
  const settled = structuredClone({ order: s.order, legacy: s.legacy, receipts: s.receipts, events: s.events });
  expect(await (await s.deliver({ id, referenceCode: "stable-ref" }, 500000)).json()).toEqual({ success: true, message: "Already processed" });
  expect({ order: s.order, legacy: s.legacy, receipts: s.receipts, events: s.events }).toEqual(settled);
  expect(s.receipts).toEqual([expect.objectContaining({ transactionCode: "stable-ref" })]);
  expect(s.fulfill).toHaveBeenCalledTimes(1);
  expect(boundary.notify).toHaveBeenCalledTimes(1);
});

it.each(malformedPrimaries.slice(0, 2))("counts distinct partial references sharing malformed primary %j", async ({ id }) => {
  const s = paidReceipt("pending");
  for (const [referenceCode, amount, total] of [["part-a", 100000, 100000], ["part-b", 100000, 200000], ["part-c", 300000, 500000]] as const) {
    expect((await s.deliver({ id, referenceCode }, amount)).status).toBe(200);
    expect(s.order.receivedAmount).toBe(total);
    const beforeReplay = structuredClone({ order: s.order, receipts: s.receipts, events: s.events });
    expect(await (await s.deliver({ id, referenceCode }, amount)).json()).toEqual({ success: true, message: "Already processed" });
    expect({ order: s.order, receipts: s.receipts, events: s.events }).toEqual(beforeReplay);
  }
  expect(s.receipts.map(receipt => receipt.transactionCode)).toEqual(["part-a", "part-b", "part-c"]);
  expect(s.order.status).toBe("paid");
  expect(s.fulfill).toHaveBeenCalledTimes(1);
  expect(boundary.notify).toHaveBeenCalledTimes(1);
});

const unusableIdentities: Record<string, unknown>[] = [
  {}, { id: null }, { id: "" }, { id: " \t " }, { id: {} }, { id: { toString: null } }, { id: [] }, { id: false },
  { referenceCode: "" }, { referenceCode: " \n " }, { referenceCode: {} },
  { id: "", referenceCode: [] }, { id: {}, referenceCode: "   " },
];

it.each(unusableIdentities)("rejects repeated paid deliveries with unusable receipt identity %j without accounting writes", async identity => {
  const s = paidReceipt();
  const original = structuredClone({ order: s.order, legacy: s.legacy });
  for (let delivery = 0; delivery < 2; delivery++) {
    const response = await s.deliver(identity);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, message: "Order receipts require a valid provider transaction identifier" });
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

const historicalAliases: { id: unknown; key: string }[] = [
  { id: false, key: "false" }, { id: {}, key: "[object Object]" },
  { id: " \t", key: " \t" }, { id: [1, 2], key: "1,2" },
];
it.each(historicalAliases)("deduplicates saved alias and counts a distinct reference sharing %j", async ({ id, key }) => {
  const s = paidReceipt();
  const old = { orderId: s.order.id, transactionCode: key, providerResponse: JSON.stringify({ id, referenceCode: "old-ref" }), amount: 500000 };
  s.receipts.push(old);
  expect(await (await s.deliver({ id, referenceCode: "old-ref" })).json()).toEqual({ success: true, message: "Already processed" });
  // A retry can change the malformed primary representation without changing its reference.
  expect(await (await s.deliver({ id: { toString: null }, referenceCode: "old-ref" })).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.updates).not.toHaveBeenCalled();
  expect(s.order.receivedAmount).toBe(500000);
  expect((await s.deliver({ id, referenceCode: "new-ref" })).status).toBe(200);
  expect(s.order.receivedAmount).toBe(550000);
  expect(await (await s.deliver({ id, referenceCode: "new-ref" })).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.receipts).toEqual([old, expect.objectContaining({ transactionCode: "new-ref" })]);
  expect(s.receipts[0]).toEqual(old);
  expect(s.events).toHaveLength(1);
  expect(s.fulfill).not.toHaveBeenCalled();
});

it.each([null, "{", "null", "false", "[]", '{"id":false}', '{"id":{},"referenceCode":"ref"}'])(
  "rejects unresolved same-order historical alias without writes: %j", async providerResponse => {
    const s = paidReceipt();
    s.receipts.push({ orderId: s.order.id, transactionCode: "false", providerResponse });
    const before = structuredClone({ order: s.order, legacy: s.legacy, receipts: s.receipts });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await s.deliver({ id: false, referenceCode: "ref" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ success: false, message: "Receipt identity cannot be reconciled automatically" });
      expect({ order: s.order, legacy: s.legacy, receipts: s.receipts }).toEqual(before);
      expect(s.updates).not.toHaveBeenCalled();
      expect(s.events).toEqual([]);
      expect(s.fulfill).not.toHaveBeenCalled();
    }
  },
);

it("does not suppress a new reference because another order has the same malformed raw key", async () => {
  const s = paidReceipt();
  s.receipts.push({ orderId: 999, transactionCode: "false", providerResponse: null });
  expect((await s.deliver({ id: false, referenceCode: "own-ref" })).status).toBe(200);
  expect(s.order.receivedAmount).toBe(550000);
  expect(s.receipts).toHaveLength(2);
});

it.each([null, "", "inconsistent-key"])("does not prove alias replay from a missing or inconsistent ledger key: %j", async transactionCode => {
  const s = paidReceipt();
  s.receipts.push({ orderId: s.order.id, transactionCode, providerResponse: JSON.stringify({ id: { toString: null }, referenceCode: "ref" }) });
  const response = await s.deliver({ id: false, referenceCode: "ref" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false });
  expect(s.order.receivedAmount).toBe(500000);
  expect(s.updates).not.toHaveBeenCalled();
  expect(s.events).toEqual([]);
});

it.each(["different-order", "different-saved-identity"])("rejects a physical canonical key conflict: %s", async kind => {
  const s = paidReceipt();
  s.receipts.push({
    orderId: kind === "different-order" ? 999 : s.order.id, transactionCode: "false",
    providerResponse: kind === "different-order" ? null : JSON.stringify({ id: false, referenceCode: "another-receipt" }),
  });
  const response = await s.deliver({ id: "false" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false });
  expect(s.order.receivedAmount).toBe(500000);
  expect(s.receipts).toHaveLength(1);
  expect(s.updates).not.toHaveBeenCalled();
  expect(s.events).toEqual([]);
});

it.each([0, 777, " padded-key "])("retains stable historical key idempotency without a saved payload: %j", async id => {
  const s = paidReceipt();
  s.receipts.push({ orderId: s.order.id, transactionCode: String(id), providerResponse: null });
  expect(await (await s.deliver({ id: String(id) })).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.order.receivedAmount).toBe(500000);
  expect(s.updates).not.toHaveBeenCalled();
});

it.each(["pending", "paid", "cancelled", "failed", "refunded"])("rejects unidentified canonical %s deliveries before any write", async status => {
  for (const identity of [{}, { id: false }, { id: { toString: null }, referenceCode: " " }]) {
    const s = paidReceipt(status);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await s.deliver(identity)).status).toBe(400);
      expect(s.updates).not.toHaveBeenCalled();
      expect(s.receipts).toEqual([]);
      expect(s.events).toEqual([]);
      expect(s.fulfill).not.toHaveBeenCalled();
    }
  }
});

it.each(["cancelled", "failed"])("retains identity through partial payment then %s", async terminal => {
  const s = paidReceipt("pending");
  const original = { id: false, referenceCode: "partial-ref" };
  expect((await s.deliver(original, 100000)).status).toBe(200);
  s.order.status = terminal;
  s.order.failReason = terminal === "failed" ? "expired" : null;
  s.legacy.status = terminal;
  expect(await (await s.deliver(original, 100000)).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.order.receivedAmount).toBe(100000);
  expect((await s.deliver({ id: false, referenceCode: "later-ref" }, 400000)).status).toBe(200);
  expect(s.order.receivedAmount).toBe(500000);
  expect(s.order.status).toBe(terminal === "failed" ? "paid" : "cancelled");
  const count = s.events.length;
  expect(await (await s.deliver({ id: false, referenceCode: "later-ref" }, 400000)).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.events).toHaveLength(count);
  expect(s.fulfill).toHaveBeenCalledTimes(terminal === "failed" ? 1 : 0);
});

const legacyIdentities: Record<string, unknown>[] = [{}, { id: false }, { id: {} }, { id: "" }, { referenceCode: "legacy-ref" }];
it.each(legacyIdentities)("preserves legacy-only underpaid, settlement and retry behavior: %j", async identity => {
  const s = paidReceipt("pending", false);
  expect(await (await s.deliver(identity, 1)).json()).toMatchObject({ success: true, underpaid: true, receivedAmount: 1 });
  expect((await s.deliver(identity, 500000)).status).toBe(200);
  expect(s.legacy.status).toBe("paid");
  expect(await (await s.deliver(identity, 500000)).json()).toEqual({ success: true, message: "Already processed" });
  expect(s.receipts).toEqual([]);
  expect(s.fulfill).toHaveBeenCalledTimes(1);
  expect(s.events).toEqual([]);
});

it.each(["direct", "wrapped", "other-constraint"])("handles only the receipt unique-constraint insertion error: %s", async kind => {
  const s = paidReceipt("pending");
  const pgError = { code: "23505", constraint: kind === "other-constraint" ? "another_unique_index" : "payments_transaction_code_idx" };
  s.receiptInsert.mockImplementation(() => { throw kind === "wrapped" ? { cause: pgError } : pgError; });
  const response = await s.deliver({ id: "new-receipt" }, 500000);
  expect(response.status).toBe(kind === "other-constraint" ? 500 : 409);
  expect(await response.json()).toMatchObject({ success: false });
  expect(s.order.status).toBe("pending");
  expect(s.order.receivedAmount).toBe(0);
  expect(s.receipts).toEqual([]);
  expect(s.events).toEqual([]);
  expect(s.updates).not.toHaveBeenCalled();
  expect(s.fulfill).not.toHaveBeenCalled();
});
