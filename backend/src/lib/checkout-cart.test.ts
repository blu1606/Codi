// Unit tests for feature F2 "Checkout and VietQR payment": F2-1 createOrderFromCart.
// Test names start with the UTCID used in the Unit Test Excel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./test-support/fake-query-db";

const mocks = vi.hoisted(() => ({ getCartSummary: vi.fn(), getSepayConfig: vi.fn() }));
vi.mock("./cart-service", () => ({ getCartSummary: mocks.getCartSummary }));
vi.mock("./sepay-config", () => ({ getSepayConfig: mocks.getSepayConfig }));

import { CheckoutError, createOrderFromCart } from "./checkout-cart";

const NOW = new Date("2026-11-09T03:00:00.000Z");
const ITEM = { id: "course-1", title: "React", slug: "react", price: 500000, level: "Beginner", category: "FE", coverImageUrl: null, lecturerName: "GV" };
const SEPAY = { webhookSecret: "s", receiver: { bankCode: "MB", accountNumber: "123" } };

const summary = (overrides: Record<string, unknown> = {}) => ({
  items: [ITEM], subtotal: 500000, discount: 0, total: 500000, voucher: null, voucherError: null,
  removedOwnedTitles: [], pendingOrder: null, ...overrides,
});
const FREE_VOUCHER = { code: "FREE100", type: "percent", value: 100, discount: 500000 };
const pending = (overrides: Record<string, unknown> = {}) => ({
  id: 7, code: "CODI00007", status: "pending", totalAmount: 400000, receivedAmount: 0,
  paymentDeadline: new Date(NOW.getTime() + 60_000), ...overrides,
});

// Query results after the pending-order step for a normal paid order: code is free, insert order, timeline
// event, one order item, legacy transaction row, clear cart.
const PAID_TAIL = [[], [], [{ id: 10, code: "CODI11111", totalAmount: 500000 }], undefined, undefined, undefined, undefined];
const FREE_TAIL = [[], [], [{ id: 10, code: "CODI11111", totalAmount: 0 }], undefined, undefined, undefined, undefined];

let fake: ReturnType<typeof createFakeDb>;
const checkout = async (results: unknown[], voucherCode?: string | null, replaceId?: number | null) => {
  fake = createFakeDb(results);
  const result = await createOrderFromCart(fake.db, "learner-1", voucherCode, replaceId);
  expect(fake.remaining()).toBe(0);
  return result;
};
const checkoutError = async (results: unknown[], voucherCode?: string | null, replaceId?: number | null) => {
  try {
    await checkout(results, voucherCode, replaceId);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckoutError);
    return error as CheckoutError;
  }
  throw new Error("expected CheckoutError");
};
const orderRow = () => fake.written("values").find((v) => v && "paymentDeadline" in v);
const eventLabel = () => fake.written("values").find((v) => v && "label" in v)?.label;

describe("F2-1 createOrderFromCart(db, userId, voucherCode, replaceOrderId)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.getCartSummary.mockReset().mockResolvedValue(summary());
    mocks.getSepayConfig.mockReset().mockReturnValue(SEPAY);
  });
  afterEach(() => vi.useRealTimers());

  it("UTCID01: empty cart is rejected with 400", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ items: [] }));
    const error = await checkoutError([]);
    expect([error.status, error.message]).toEqual([400, "Giỏ hàng của bạn đang trống"]);
  });
  it("UTCID02: invalid voucher code is rejected with 409 and the voucher error", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucherError: "Mã đã hết hạn từ 01/11/2026." }));
    const error = await checkoutError([], "OLD10");
    expect([error.status, error.message]).toEqual([409, "Mã đã hết hạn từ 01/11/2026."]);
  });
  it("UTCID03: invalid voucher without a reason uses the default message", async () => {
    const error = await checkoutError([], "OLD10");
    expect([error.status, error.message]).toEqual([409, "Mã giảm giá không hợp lệ hoặc đã hết hạn"]);
  });
  it("UTCID04: paid order without SePay configuration is rejected with 503", async () => {
    mocks.getSepayConfig.mockReturnValue(null);
    const error = await checkoutError([]);
    expect([error.status, error.code]).toEqual([503, "PAYMENTS_UNAVAILABLE"]);
  });
  it("UTCID05: normal checkout creates a pending order with a 30-minute deadline", async () => {
    const result = await checkout([[], ...PAID_TAIL]);
    expect(result).toEqual({ orderId: 10, orderCode: "CODI11111", totalAmount: 500000 });
    const order = orderRow();
    expect(order.code).toMatch(/^CODI\d{5}$/);
    expect([order.status, order.totalAmount, order.paidAt, order.voucherId]).toEqual(["pending", 500000, null, null]);
    expect(order.paymentDeadline).toEqual(new Date(NOW.getTime() + 30 * 60 * 1000));
    expect(eventLabel()).toBe("Đã tạo đơn");
    expect(fake.written("values")).toContainEqual({ id: "CODI11111", userId: "learner-1", courseId: "course-1", amount: 500000, status: "pending" });
  });
  it("UTCID06: voucher code is trimmed and upper-cased, and its id is saved on the order", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucher: { code: "SALE10", type: "percent", value: 10, discount: 50000 }, discount: 50000, total: 450000 }));
    await checkout([[], [{ id: 3 }], ...PAID_TAIL], "  sale10 ");
    expect(mocks.getCartSummary).toHaveBeenCalledWith(fake.db, "learner-1", "SALE10");
    expect([orderRow().voucherId, orderRow().discountAmount, orderRow().totalAmount]).toEqual([3, 50000, 450000]);
  });
  it("UTCID07: blank voucher code is treated as no voucher", async () => {
    await checkout([[], ...PAID_TAIL], "   ");
    expect(mocks.getCartSummary).toHaveBeenCalledWith(fake.db, "learner-1", null);
  });
  it("UTCID08: applied voucher that was deleted is saved without a voucher id", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucher: { code: "SALE10", type: "percent", value: 10, discount: 50000 }, total: 450000 }));
    await checkout([[], [], ...PAID_TAIL], "SALE10");
    expect(orderRow().voucherId).toBeNull();
  });
  it("UTCID09: 100% voucher (total 0) creates a paid order, claims the voucher and enrolls the learner", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucher: FREE_VOUCHER, discount: 500000, total: 0 }));
    mocks.getSepayConfig.mockReturnValue(null);
    await checkout([[], [{ id: 3 }], [{ id: 3 }], ...FREE_TAIL], "FREE100");
    expect([orderRow().status, orderRow().totalAmount, orderRow().paidAt]).toEqual(["paid", 0, NOW]);
    expect(eventLabel()).toBe("Đã thanh toán (Miễn phí qua mã giảm giá)");
    expect(fake.written("values")).toContainEqual({ userId: "learner-1", courseId: "course-1" });
  });
  it("UTCID10: free order with a voucher that no longer exists is rejected", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucher: FREE_VOUCHER, total: 0 }));
    const error = await checkoutError([[], []], "FREE100");
    expect([error.status, error.message]).toEqual([409, "Mã giảm giá không còn khả dụng. Vui lòng kiểm tra lại giỏ hàng."]);
  });
  it("UTCID11: free order whose voucher ran out meanwhile is rejected", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ voucher: FREE_VOUCHER, total: 0 }));
    const error = await checkoutError([[], [{ id: 3 }], []], "FREE100");
    expect([error.status, error.message]).toEqual([409, "Mã đã hết lượt sử dụng."]);
  });
  it("UTCID12: free cart without a voucher (total 0) is paid directly", async () => {
    mocks.getCartSummary.mockResolvedValue(summary({ subtotal: 0, total: 0 }));
    await checkout([[], ...FREE_TAIL]);
    expect(orderRow().status).toBe("paid");
  });
  it("UTCID13: an unexpired pending order blocks a new checkout", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending()]]);
    expect([error.status, error.code, error.pendingOrder]).toEqual([409, "PENDING_ORDER_EXISTS", { id: 7, code: "CODI00007", totalAmount: 400000 }]);
  });
  it("UTCID14: replace id that does not match the pending order is rejected", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending()]], null, 99);
    expect(error.code).toBe("PENDING_ORDER_EXISTS");
  });
  it("UTCID15: matching replace id cancels the old order and creates a new one", async () => {
    await checkout([[{ id: 7, code: "CODI00007" }], [pending()], [{ id: 7 }], undefined, ...PAID_TAIL], null, 7);
    const cancel = fake.written("set")[0];
    expect([cancel.status, cancel.needsReconciliation]).toEqual(["cancelled", undefined]);
    expect([orderRow().replacesOrderId, eventLabel()]).toEqual([7, "Đã tạo đơn mới (thay đơn cũ)"]);
  });
  it("UTCID16: replacing an order that already received money flags it for reconciliation", async () => {
    await checkout([[{ id: 7, code: "CODI00007" }], [pending({ receivedAmount: 200000 })], [{ id: 7 }], undefined, ...PAID_TAIL], null, 7);
    expect(fake.written("set")[0].needsReconciliation).toBe(true);
  });
  it("UTCID17: old order paid while replacing (update hits no row) is rejected", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending()], []], null, 7);
    expect([error.status, error.message]).toEqual([409, "Đơn hàng cũ đã thay đổi trạng thái hoặc đã được thanh toán."]);
  });
  it("UTCID18: pending order that disappeared after locking is rejected", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], []]);
    expect(error.status).toBe(409);
  });
  it("UTCID19: pending order that became paid after locking is rejected", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending({ status: "paid" })]]);
    expect(error.status).toBe(409);
  });
  it("UTCID20: pending order expired 1 ms ago is marked failed and checkout continues", async () => {
    await checkout([[{ id: 7, code: "CODI00007" }], [pending({ paymentDeadline: new Date(NOW.getTime() - 1) })], [{ id: 7 }], undefined, ...PAID_TAIL]);
    const fail = fake.written("set")[0];
    expect([fail.status, fail.failReason, fail.needsReconciliation]).toEqual(["failed", "expired", undefined]);
    expect(orderRow().status).toBe("pending");
  });
  it("UTCID21: pending order whose deadline is exactly now counts as expired", async () => {
    await checkout([[{ id: 7, code: "CODI00007" }], [pending({ paymentDeadline: NOW })], [{ id: 7 }], undefined, ...PAID_TAIL]);
    expect(fake.written("set")[0].status).toBe("failed");
  });
  it("UTCID22: pending order without a deadline is never treated as expired", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending({ paymentDeadline: null })]]);
    expect(error.code).toBe("PENDING_ORDER_EXISTS");
  });
  it("UTCID23: expired order that received part of the money is flagged for reconciliation", async () => {
    await checkout([[{ id: 7, code: "CODI00007" }], [pending({ paymentDeadline: NOW, receivedAmount: 100000 })], [{ id: 7 }], undefined, ...PAID_TAIL]);
    expect(fake.written("set")[0].needsReconciliation).toBe(true);
  });
  it("UTCID24: expired order changed by a payment meanwhile is rejected", async () => {
    const error = await checkoutError([[{ id: 7, code: "CODI00007" }], [pending({ paymentDeadline: NOW })], []]);
    expect(error.status).toBe(409);
  });
  it("UTCID25: a used order code is regenerated until a free one is found", async () => {
    await checkout([[], [{ id: 1 }], [], [], [{ id: 1 }], ...PAID_TAIL]);
    expect(orderRow().code).toMatch(/^CODI\d{5}$/);
  });
  it("UTCID26: after 5 code collisions the last generated code is used", async () => {
    const taken = Array.from({ length: 5 }, () => [[{ id: 1 }], []]).flat();
    await checkout([[], ...taken, ...PAID_TAIL.slice(2)]);
    expect(orderRow().code).toMatch(/^CODI\d{5}$/);
  });
  it("UTCID27: replace id without an existing pending order is recorded on the new order", async () => {
    await checkout([[], ...PAID_TAIL], null, 7);
    expect([orderRow().replacesOrderId, eventLabel()]).toEqual([7, "Đã tạo đơn mới (thay đơn cũ)"]);
  });
});
