import { describe, expect, it } from "vitest";
import { validateVoucher } from "./cart-service";
import type { vouchers } from "@codi-1/db";

type VoucherRow = typeof vouchers.$inferSelect;

function makeVoucher(overrides: Partial<VoucherRow> = {}): VoucherRow {
  return {
    id: 1,
    code: "WELCOME20",
    description: "Giảm 20%",
    type: "percent",
    value: 20,
    minOrderAmount: 500000,
    maxDiscountAmount: 200000,
    usageLimit: 100,
    usedCount: 5,
    startsAt: null,
    expiresAt: new Date(Date.now() + 86400000 * 30),
    isActive: true,
    createdBy: "admin-1",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("validateVoucher unit tests", () => {
  it("rejects non-existent voucher", () => {
    const result = validateVoucher(undefined, 600000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Mã giảm giá không tồn tại. Kiểm tra lại chính tả.");
    }
  });

  it("rejects inactive voucher", () => {
    const voucher = makeVoucher({ isActive: false });
    const result = validateVoucher(voucher, 600000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Mã này đã ngừng áp dụng.");
    }
  });

  it("rejects expired voucher with formatted date", () => {
    const pastDate = new Date("2026-08-15T00:00:00Z");
    const voucher = makeVoucher({ expiresAt: pastDate });
    const result = validateVoucher(voucher, 600000, new Date("2026-08-20T00:00:00Z"));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Mã đã hết hạn từ");
      expect(result.error).toContain("15/08/2026");
    }
  });

  it("rejects when usage limit is reached", () => {
    const voucher = makeVoucher({ usageLimit: 10, usedCount: 10 });
    const result = validateVoucher(voucher, 600000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Mã đã hết lượt sử dụng.");
    }
  });

  it("rejects when subtotal does not meet minOrderAmount", () => {
    const voucher = makeVoucher({ minOrderAmount: 500000 });
    const result = validateVoucher(voucher, 400000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Đơn hàng cần tối thiểu 500.000 ₫ để dùng mã này.");
    }
  });

  it("calculates percentage discount capped by maxDiscountAmount", () => {
    const voucher = makeVoucher({
      type: "percent",
      value: 20,
      minOrderAmount: 500000,
      maxDiscountAmount: 150000,
    });
    // 20% of 1,000,000 = 200,000, capped at 150,000
    const result = validateVoucher(voucher, 1000000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.voucher.discount).toBe(150000);
      expect(result.voucher.code).toBe("WELCOME20");
    }
  });

  it("calculates percentage discount without cap when under maxDiscountAmount", () => {
    const voucher = makeVoucher({
      type: "percent",
      value: 10,
      minOrderAmount: 200000,
      maxDiscountAmount: 100000,
    });
    // 10% of 500,000 = 50,000
    const result = validateVoucher(voucher, 500000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.voucher.discount).toBe(50000);
    }
  });

  it("calculates fixed amount discount correctly", () => {
    const voucher = makeVoucher({
      type: "amount",
      value: 100000,
      minOrderAmount: 300000,
    });
    const result = validateVoucher(voucher, 500000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.voucher.discount).toBe(100000);
    }
  });

  it("caps fixed amount discount to subtotal if value > subtotal", () => {
    const voucher = makeVoucher({
      type: "amount",
      value: 200000,
      minOrderAmount: 0,
    });
    const result = validateVoucher(voucher, 150000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.voucher.discount).toBe(150000);
    }
  });
});
