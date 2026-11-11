// Unit tests for feature F1 "Cart and voucher". Test names start with the function code and the UTCID used in
// the Unit Test Excel (F1-1 validateVoucher, F1-2 validateVoucherForm, F1-3 addCourseToCart).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./test-support/fake-query-db";

const fake = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/services", () => ({
  get db() {
    return fake.current.db;
  },
}));

import { validateVoucher } from "./cart-service";
import { validateVoucherForm } from "./admin-vouchers-service";
import { addCourseToCart } from "./add-course-to-cart";

const NOW = new Date("2026-11-09T03:00:00.000Z");

const voucher = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    code: "SALE10",
    description: null,
    type: "percent",
    value: 10,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    usageLimit: null,
    usedCount: 0,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    createdBy: null,
    createdAt: NOW,
    ...overrides,
  }) as any;

const discountOf = (result: ReturnType<typeof validateVoucher>) => {
  if (!result.valid) throw new Error(`expected a valid voucher, got: ${result.error}`);
  return result.voucher.discount;
};
const errorOf = (result: ReturnType<typeof validateVoucher>) => (result.valid ? null : result.error);

describe("F1-1 validateVoucher(voucher, subtotal, now)", () => {
  it("F1-1 UTCID01: unknown code is rejected", () => {
    expect(errorOf(validateVoucher(undefined, 500000, NOW))).toBe("Mã giảm giá không tồn tại. Kiểm tra lại chính tả.");
  });
  it("F1-1 UTCID02: inactive voucher is rejected", () => {
    expect(errorOf(validateVoucher(voucher({ isActive: false }), 500000, NOW))).toBe("Mã này đã ngừng áp dụng.");
  });
  it("F1-1 UTCID03: voucher starting 1 ms after now is not yet valid", () => {
    const startsAt = new Date(NOW.getTime() + 1);
    expect(errorOf(validateVoucher(voucher({ startsAt }), 500000, NOW))).toBe("Mã giảm giá chỉ có hiệu lực từ 09/11/2026.");
  });
  it("F1-1 UTCID04: voucher that expired 1 ms ago is rejected", () => {
    const expiresAt = new Date(NOW.getTime() - 1);
    expect(errorOf(validateVoucher(voucher({ expiresAt }), 500000, NOW))).toBe("Mã đã hết hạn từ 09/11/2026.");
  });
  it("F1-1 UTCID05: usedCount equal to usageLimit is rejected", () => {
    expect(errorOf(validateVoucher(voucher({ usageLimit: 10, usedCount: 10 }), 500000, NOW))).toBe("Mã đã hết lượt sử dụng.");
  });
  it("F1-1 UTCID06: usedCount one below usageLimit is valid", () => {
    expect(discountOf(validateVoucher(voucher({ usageLimit: 10, usedCount: 9 }), 500000, NOW))).toBe(50000);
  });
  it("F1-1 UTCID07: subtotal 1 VND below the minimum order is rejected", () => {
    expect(errorOf(validateVoucher(voucher({ minOrderAmount: 100000 }), 99999, NOW))).toBe(
      `Đơn hàng cần tối thiểu ${(100000).toLocaleString("vi-VN")} ₫ để dùng mã này.`,
    );
  });
  it("F1-1 UTCID08: percent discount above the cap is reduced to the cap", () => {
    expect(discountOf(validateVoucher(voucher({ value: 50, maxDiscountAmount: 100000 }), 500000, NOW))).toBe(100000);
  });
  it("F1-1 UTCID09: amount voucher smaller than subtotal gives its value", () => {
    expect(discountOf(validateVoucher(voucher({ type: "amount", value: 50000 }), 300000, NOW))).toBe(50000);
  });
});

describe("F1-2 validateVoucherForm(data, isUpdate)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  const form = (overrides: Record<string, unknown> = {}) =>
    ({ code: "SALE20", type: "percent", value: 20, minOrderAmount: 0, usageLimit: 100, expiresAt: "2026-11-30", ...overrides }) as any;
  const errors = (overrides: Record<string, unknown> = {}, isUpdate = false) => validateVoucherForm(form(overrides), isUpdate).errors;

  it("F1-2 UTCID01: code with 3 characters is rejected", () => {
    expect(errors({ code: "ABC" }).code).toBe("Mã gồm 4–20 ký tự chữ in hoa hoặc số.");
  });
  it("F1-2 UTCID02: code with 4 characters is accepted", () => {
    expect(errors({ code: "ABCD" })).toEqual({});
  });
  it("F1-2 UTCID03: code is not checked when updating", () => {
    expect(errors({ code: undefined }, true)).toEqual({});
  });
  it("F1-2 UTCID04: value 0 is rejected", () => {
    expect(errors({ value: 0 }).value).toBe("Nhập số lớn hơn 0.");
  });
  it("F1-2 UTCID05: percent value 100 is accepted", () => {
    expect(errors({ value: 100 })).toEqual({});
  });
  it("F1-2 UTCID06: percent value 101 is rejected", () => {
    expect(errors({ value: 101 }).value).toBe("Phần trăm tối đa là 100.");
  });
  it("F1-2 UTCID07: minimum order -1 is rejected", () => {
    expect(errors({ minOrderAmount: -1 }).minOrderAmount).toBe("Nhập giá trị đơn tối thiểu hợp lệ.");
  });
  it("F1-2 UTCID08: missing minimum order defaults to 0", () => {
    expect(errors({ minOrderAmount: undefined })).toEqual({});
  });
  it("F1-2 UTCID09: usage limit 0 is rejected", () => {
    expect(errors({ usageLimit: 0 }).usageLimit).toBe("Số lượt phải từ 1 trở lên.");
  });
  it("F1-2 UTCID10: empty usage limit means unlimited", () => {
    expect(errors({ usageLimit: null })).toEqual({});
  });
  it("F1-2 UTCID11: expiry date yesterday is rejected", () => {
    expect(errors({ expiresAt: "2026-11-08" }).expiresAt).toBe("Chọn một ngày từ hôm nay trở đi.");
  });
  it("F1-2 UTCID12: no expiry date means the voucher never expires", () => {
    expect(errors({ expiresAt: null })).toEqual({});
  });
});

describe("F1-3 addCourseToCart(userId, courseId)", () => {
  const run = async (results: unknown[]) => {
    fake.current = createFakeDb(results);
    const result = await addCourseToCart("learner-1", "course-1");
    expect(fake.current.remaining()).toBe(0);
    return result;
  };
  const course = [{ id: "course-1", title: "React" }];

  it("F1-3 UTCID01: course that does not exist returns not-found", async () => {
    expect(await run([[]])).toEqual({ kind: "not-found" });
  });
  it("F1-3 UTCID02: course the learner already owns returns already-owned", async () => {
    expect(await run([course, [{ id: 1 }]])).toEqual({ kind: "already-owned" });
  });
  it("F1-3 UTCID03: course in a pending order returns that order code", async () => {
    expect(await run([course, [], [{ code: "CODI12345" }]])).toEqual({ kind: "pending-payment", orderCode: "CODI12345" });
  });
  it("F1-3 UTCID04: course in a pending legacy transaction returns its code", async () => {
    expect(await run([course, [], [], [{ id: "CODI54321" }]])).toEqual({ kind: "pending-payment", orderCode: "CODI54321" });
  });
  it("F1-3 UTCID05: new course is added to the cart", async () => {
    expect(await run([course, [], [], [], [{ courseId: "course-1" }]])).toEqual({ kind: "added", courseId: "course-1" });
    expect(fake.current.written("values")).toEqual([{ userId: "learner-1", courseId: "course-1" }]);
  });
  it("F1-3 UTCID06: course already in the cart is not added twice", async () => {
    expect(await run([course, [], [], [], []])).toEqual({ kind: "already-in-cart", courseId: "course-1" });
  });
});
