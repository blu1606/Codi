import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { orders, orderEvents, orderItems, payments } from "@codi-1/db";
import { studentCart, studentTransactions } from "@codi-1/db/schema/student-profile";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const boundary = vi.hoisted(() => ({ db: {} as any, notify: vi.fn(), getSession: vi.fn() }));
vi.mock("@/services", () => ({ db: boundary.db, auth: { api: { getSession: boundary.getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./notification-service", () => ({ createNotificationService: () => ({ notify: boundary.notify }) }));
import { adminCancelOrder } from "./admin-orders-service";
import { POST as callback } from "../app/api/payments/sepay/callback/route";
import { POST as learnerCancel } from "../app/api/orders/cancel/route";

beforeEach(() => {
  vi.clearAllMocks();
  boundary.getSession.mockResolvedValue({ user: { id: "buyer" } });
  vi.stubEnv("SEPAY_WEBHOOK_SECRET", "offline-secret");
  vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "12345678");
  vi.stubEnv("SEPAY_BANK_CODE", "VCB");
});
afterEach(() => vi.unstubAllEnvs());

// Infrastructure boundary model: runs both real entry points in controlled serial
// orders. It does not implement PostgreSQL locking, scheduling or rollback.
function scenario() {
  const order = { id: 101, code: "CODI10101", userId: "buyer", status: "pending", totalAmount: 500000, receivedAmount: 0, needsReconciliation: false };
  const legacy = { id: order.code, userId: order.userId, courseId: "course-1", amount: order.totalAmount, status: "pending" };
  const receipts: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const items = [{ orderId: order.id, courseId: "course-1" }, { orderId: order.id, courseId: "course-2" }];
  const cart = new Set(["course-1"]);
  const cartInserts: Record<string, unknown>[] = [];
  const trace: string[] = [];
  const writes: Array<{ table: unknown; value: Record<string, unknown>; predicate: SQL }> = [];
  let onLock: (() => void) | undefined;
  let onOrderWrite: (() => void) | undefined;
  const query = (predicate: SQL) => new PgDialect().sqlToQuery(predicate);
  const select = (fields?: Record<string, unknown>) => ({ from: (table: unknown) => ({ where: (predicate: SQL) => {
    const rows = () => {
      const compiled = query(predicate);
      if (table === orders) {
        trace.push("read-order");
        if (compiled.sql.includes('"user_id"') && !compiled.params.includes(order.userId)) return [];
        return [fields ? Object.fromEntries(Object.keys(fields).map(key => [key, order[key as keyof typeof order]])) : { ...order }];
      }
      if (table === studentTransactions) return [{ ...legacy }];
      if (table === orderItems) {
        expect(compiled.params).toEqual([order.id]);
        return items.map(item => ({ ...item }));
      }
      if (table === payments) return receipts.filter(receipt => compiled.params.includes(receipt.transactionCode));
      throw new Error("Unexpected select table");
    };
    return { limit: async () => rows(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve) };
  } }) });
  const tx = {
    select,
    execute: vi.fn(async (statement: SQL) => {
      const compiled = query(statement);
      expect(compiled.sql).toContain("pg_advisory_xact_lock(hashtext(");
      expect(compiled.params).toEqual([order.code]);
      trace.push("lock");
      onLock?.();
    }),
    update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: (predicate: SQL) => {
      const apply = () => {
        writes.push({ table, value, predicate });
        trace.push("update");
        const compiled = query(predicate);
        if (table === orders) {
          onOrderWrite?.();
          if (compiled.params.includes("pending") && order.status !== "pending") return [];
          Object.assign(order, Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
          return [{ ...order }];
        }
        expect(table).toBe(studentTransactions);
        if (compiled.sql.includes('"user_id"') && !compiled.params.includes(legacy.userId)) return [];
        if (compiled.params.includes("pending") && legacy.status !== "pending") return [];
        Object.assign(legacy, value);
        return [{ ...legacy }];
      };
      return { returning: async () => apply(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(apply()).then(resolve) };
    } }) }),
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
      if (table === studentCart) return { onConflictDoNothing: async () => {
        expect(value.userId).toBe(order.userId);
        cartInserts.push(value);
        cart.add(String(value.courseId));
      } };
      if (table === payments) receipts.push(value);
      else if (table === orderEvents) events.push(value);
      else throw new Error("Unexpected insert: cancellation must never enroll");
      return Promise.resolve();
    } }),
  };
  Object.assign(boundary.db, { select, transaction: async (fn: (tx: unknown) => unknown) => fn(tx) });
  const cancel = () => adminCancelOrder(boundary.db, order.id, "admin", "  Theo yêu cầu  ");
  const cancelLearner = () => learnerCancel(new Request("http://localhost/api/orders/cancel", {
    method: "POST", body: JSON.stringify({ orderId: order.id }),
  }));
  const deliver = () => callback(new Request("http://localhost/api/payments/sepay/callback", {
    method: "POST", headers: { authorization: "Apikey offline-secret" },
    body: JSON.stringify({ id: "receipt-101", transferType: "in", accountNumber: "12345678", content: order.code, transferAmount: 100000 }),
  }));
  return {
    order, legacy, receipts, events, trace, writes, tx, cancel, cancelLearner, deliver, cart, cartInserts, items,
    atLock: (fn: () => void) => { onLock = fn; },
    atOrderWrite: (fn: () => void) => { onOrderWrite = fn; },
  };
}

it.each([
  ["admin", "receipt-first"], ["admin", "cancel-first"],
  ["learner", "receipt-first"], ["learner", "cancel-first"],
])("preserves cancelled money and deduplicates replay: %s %s", async (actor, ordering) => {
  const s = scenario();
  if (ordering === "receipt-first") {
    const response = await s.deliver();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ underpaid: true, receivedAmount: 100000 });
    expect(s.order).toMatchObject({ status: "pending", needsReconciliation: false });
    expect(s.receipts).toHaveLength(1);
    expect(s.receipts[0]).toMatchObject({ amount: 100000, status: "pending" });
  }
  if (actor === "admin") {
    await expect(s.cancel()).resolves.toEqual({ success: true, orderCode: s.order.code });
  } else {
    const cancelled = await s.cancelLearner();
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ success: true, message: "Đã hủy đơn hàng thành công" });
    expect([...s.cart].sort()).toEqual(["course-1", "course-2"]);
    expect(s.cartInserts).toHaveLength(2);
    const legacyWrite = s.writes.find(write => write.table === studentTransactions)!;
    expect(new PgDialect().sqlToQuery(legacyWrite.predicate).params).toEqual([s.order.code, s.order.userId, "pending"]);
  }
  if (ordering === "cancel-first") {
    const response = await s.deliver();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: "Order not pending, marked for reconciliation" });
    expect(s.receipts[0]).toMatchObject({ amount: 100000, status: "failed" });
  }
  expect(s.order).toMatchObject({ status: "cancelled", receivedAmount: 100000, needsReconciliation: true });
  expect(s.legacy.status).toBe("cancelled");
  const eventCount = actor === "admin" ? 2 : 1;
  expect(s.events).toHaveLength(eventCount);
  if (actor === "admin") expect(s.events).toContainEqual(expect.objectContaining({ actorId: "admin", label: "Quản trị viên huỷ đơn (Theo yêu cầu)" }));
  const writesBeforeReplay = s.writes.length;
  const replay = await s.deliver();
  expect(await replay.json()).toEqual({ success: true, message: "Already processed" });
  expect(s.order).toMatchObject({ status: "cancelled", receivedAmount: 100000, needsReconciliation: true });
  expect(s.receipts).toHaveLength(1);
  expect(s.receipts[0]).toMatchObject({
    transactionCode: "receipt-101", amount: 100000,
    status: ordering === "receipt-first" ? "pending" : "failed",
  });
  expect(s.events).toHaveLength(eventCount);
  expect(s.writes).toHaveLength(writesBeforeReplay);
  expect(boundary.notify).toHaveBeenCalledTimes(actor === "admin" ? 1 : 0);
  expect(s.items).toEqual([{ orderId: s.order.id, courseId: "course-1" }, { orderId: s.order.id, courseId: "course-2" }]);
  if (actor === "learner") {
    expect((await s.cancelLearner()).status).toBe(404);
    expect(s.cartInserts).toHaveLength(2);
    expect([...s.cart].sort()).toEqual(["course-1", "course-2"]);
    expect(s.writes).toHaveLength(writesBeforeReplay);
  }
});

it("reads receipt funding after acquiring the canonical lock before any writes", async () => {
  const s = scenario();
  s.atLock(() => { s.order.receivedAmount = 100000; });
  await s.cancel();
  expect(s.trace.slice(0, 4)).toEqual(["read-order", "lock", "read-order", "update"]);
  expect(s.order).toMatchObject({ status: "cancelled", receivedAmount: 100000, needsReconciliation: true });
  const orderWrite = s.writes.find(write => write.table === orders)!;
  expect(new PgDialect().sqlToQuery(orderWrite.predicate).params).toEqual([s.order.id, "pending"]);
  const legacyWrite = s.writes.find(write => write.table === studentTransactions)!;
  expect(new PgDialect().sqlToQuery(legacyWrite.predicate).params).toEqual([s.order.code, "pending"]);
});

it("does not cancel or synchronize legacy state when full settlement wins before the lock", async () => {
  const s = scenario();
  s.atLock(() => { s.order.status = "paid"; s.order.receivedAmount = 500000; s.legacy.status = "paid"; });
  await expect(s.cancel()).rejects.toThrow("trạng thái hiện tại: paid");
  expect(s.trace).toEqual(["read-order", "lock", "read-order"]);
  expect(s.writes).toHaveLength(0);
  expect(s.events).toHaveLength(0);
  expect(s.legacy.status).toBe("paid");
  expect(boundary.notify).not.toHaveBeenCalled();
});

it.each([false, true])("zero-receipt cancellation retains existing reconciliation=%s", async (flag) => {
  const s = scenario();
  s.order.needsReconciliation = flag;
  await s.cancel();
  expect(s.order).toMatchObject({ status: "cancelled", receivedAmount: 0, needsReconciliation: flag });
  expect(s.legacy.status).toBe("cancelled");
  expect(s.receipts).toHaveLength(0);
  expect(s.events).toHaveLength(1);
});

it("keeps the conditional pending update as a final guard before legacy or audit writes", async () => {
  const s = scenario();
  // A non-cooperating writer is outside advisory serialization; the row predicate
  // must still reject a terminal state rather than trusting the earlier read.
  s.atOrderWrite(() => { s.order.status = "paid"; s.legacy.status = "paid"; });
  await expect(s.cancel()).rejects.toThrow("trạng thái hiện tại: paid");
  expect(s.order.status).toBe("paid");
  expect(s.legacy.status).toBe("paid");
  expect(s.writes).toHaveLength(1);
  expect(s.writes[0].table).toBe(orders);
  expect(s.events).toHaveLength(0);
  expect(boundary.notify).not.toHaveBeenCalled();
});

it.each([false, true])("learner zero-receipt cancellation preserves reconciliation=%s and restores cart once", async (flag) => {
  const s = scenario();
  s.order.needsReconciliation = flag;
  expect((await s.cancelLearner()).status).toBe(200);
  expect(s.order).toMatchObject({ status: "cancelled", receivedAmount: 0, needsReconciliation: flag });
  expect(s.legacy.status).toBe("cancelled");
  expect((await s.cancelLearner()).status).toBe(404);
  expect(s.cartInserts).toHaveLength(2);
  expect([...s.cart].sort()).toEqual(["course-1", "course-2"]);
  expect(s.receipts).toHaveLength(0);
});

it.each(["guest", "other-owner", "paid"])("learner cancellation has no side effects for %s", async (kind) => {
  const s = scenario();
  if (kind === "guest") boundary.getSession.mockResolvedValue(null);
  if (kind === "other-owner") boundary.getSession.mockResolvedValue({ user: { id: "stranger" } });
  if (kind === "paid") { s.order.status = "paid"; s.legacy.status = "paid"; }
  expect((await s.cancelLearner()).status).toBe(kind === "guest" ? 401 : 404);
  expect(s.writes).toHaveLength(0);
  expect(s.cartInserts).toHaveLength(0);
  expect(s.receipts).toHaveLength(0);
  expect(s.events).toHaveLength(0);
  expect(s.order.status).toBe(kind === "paid" ? "paid" : "pending");
  if (kind === "guest") expect(s.trace).toHaveLength(0);
});
