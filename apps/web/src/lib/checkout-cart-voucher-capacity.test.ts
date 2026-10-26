import { afterEach, expect, it, vi } from "vitest";
import { orders, orderEvents, orderItems, studentCart, vouchers } from "@codi-1/db";
import { studentEnrollments, studentTransactions } from "@codi-1/db/schema/student-profile";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createOrderFromCart } from "./checkout-cart";
import * as cartService from "./cart-service";

afterEach(() => vi.restoreAllMocks());

// This boundary stages writes and models transaction commit/rollback. Production
// checkout and real SQL predicates run; no PostgreSQL concurrency is simulated.
function capacityScenario(capacity: "available" | "exhausted" | "missing", failOrderInsert = false) {
  const initial = { orders: [] as unknown[], items: [] as unknown[], events: [] as unknown[], enrollments: [] as unknown[], cart: ["course-1"], used: 1 };
  let committed = structuredClone(initial);
  const trace: string[] = [];
  const claimPredicates: SQL[] = [];
  const inserts = vi.fn();
  const consumeCart = vi.fn();
  let rolledBack = false;
  vi.spyOn(cartService, "getCartSummary").mockResolvedValue({
    items: [{ id: "course-1", slug: "one", title: "One", category: "Web", level: "beginner", price: 500000, coverImageUrl: null, lecturerName: "Lecturer" }],
    subtotal: 500000, discount: 500000, total: 0,
    voucher: { code: "LASTFREE", type: "percent", value: 100, discount: 500000 },
    voucherError: null, removedOwnedTitles: [], pendingOrder: null,
  });
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const staged = structuredClone(committed);
      const tx = {
        execute: async () => { trace.push("user-lock"); },
        select: () => ({ from: (table: unknown) => ({ where: () => {
          const query = { limit: async () => table === vouchers && capacity !== "missing" ? [{ id: 88 }] : [] };
          return { ...query, orderBy: () => query };
        } }) }),
        update: (table: unknown) => ({ set: () => ({ where: (predicate: SQL) => {
          if (table === vouchers) {
            claimPredicates.push(predicate);
            return { returning: async () => {
              trace.push("capacity-claim");
              if (capacity !== "available") return [];
              staged.used++;
              return [{ id: 88 }];
            } };
          }
          // Older checkout's reconciliation fallback must not make this test
          // fail because of unsupported fixture infrastructure.
          expect(table).toBe(orders);
          return Promise.resolve();
        } }) }),
        insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
          inserts(table, value);
          if (table === orders) {
            if (failOrderInsert) throw new Error("Order write failed");
            staged.orders.push(value); trace.push("order");
            return { returning: async () => [{ id: 101, ...value }] };
          }
          if (table === orderEvents) staged.events.push(value);
          else if (table === orderItems) staged.items.push(value);
          else if (table === studentEnrollments) return { onConflictDoNothing: async () => {
            trace.push("enroll"); staged.enrollments.push(value);
          } };
          else expect(table).toBe(studentTransactions);
          return Promise.resolve();
        } }),
        delete: (table: unknown) => ({ where: async () => {
          expect(table).toBe(studentCart); consumeCart(); staged.cart = [];
        } }),
      };
      try { const result = await run(tx); committed = staged; return result; }
      catch (error) { rolledBack = true; throw error; }
    },
  };
  return { run: () => createOrderFromCart(db as never, "buyer", "LASTFREE"), initial, state: () => committed, trace, claimPredicates, inserts, consumeCart, rolledBack: () => rolledBack };
}

it.each(["exhausted", "missing"] as const)("rejects a %s zero-total voucher without fulfillment or cart consumption", async capacity => {
  const s = capacityScenario(capacity);
  await expect(s.run()).rejects.toMatchObject({ name: "CheckoutError", status: 409 });
  expect(s.rolledBack()).toBe(true);
  expect(s.state()).toEqual(s.initial);
  expect(s.inserts).not.toHaveBeenCalled();
  expect(s.consumeCart).not.toHaveBeenCalled();
  if (capacity === "exhausted") {
    expect(s.trace).toEqual(["user-lock", "capacity-claim"]);
    const claim = new PgDialect().sqlToQuery(s.claimPredicates[0]);
    expect(claim.params).toEqual([88]);
    expect(claim.sql).toContain('"used_count" < "vouchers"."usage_limit"');
    expect(claim.sql).toContain('"usage_limit" is null');
  }
});

it("claims zero-total voucher capacity before committing paid order, enrollment and cart consumption", async () => {
  const s = capacityScenario("available");
  const result = await s.run();
  expect(result).toMatchObject({ orderId: 101, totalAmount: 0 });
  expect(s.trace.indexOf("capacity-claim")).toBeLessThan(s.trace.indexOf("order"));
  expect(s.trace.indexOf("capacity-claim")).toBeLessThan(s.trace.indexOf("enroll"));
  expect(s.state()).toMatchObject({ used: 2, orders: [expect.objectContaining({ status: "paid", totalAmount: 0, voucherId: 88 })], enrollments: [{ userId: "buyer", courseId: "course-1" }], cart: [] });
  expect(s.consumeCart).toHaveBeenCalledOnce();
  expect(s.rolledBack()).toBe(false);
});

it("keeps the voucher claim inside the transaction when later order creation fails", async () => {
  const s = capacityScenario("available", true);
  await expect(s.run()).rejects.toThrow("Order write failed");
  expect(s.rolledBack()).toBe(true);
  expect(s.state()).toEqual(s.initial);
  expect(s.trace).toEqual(["user-lock", "capacity-claim"]);
  expect(s.consumeCart).not.toHaveBeenCalled();
});
