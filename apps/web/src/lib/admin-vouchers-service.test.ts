import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  isVoucherExpired,
  validateVoucherForm,
  createAdminVoucher,
  updateAdminVoucher,
  toggleAdminVoucherActive,
  getAdminVouchers,
  nearLimitVoucherPredicate,
} from "./admin-vouchers-service";

describe("admin-vouchers-service unit tests", () => {
  it("compiles the exact active positive-cap usage predicate without division or calendar conditions", () => {
    const query = new PgDialect().sqlToQuery(nearLimitVoucherPredicate()!);
    expect(query.sql).toBe('(("vouchers"."is_active" = $1) and ("vouchers"."usage_limit" > $2) and ("vouchers"."used_count"::numeric * 10 >= "vouchers"."usage_limit"::numeric * 9))');
    expect(query.params).toEqual([true, 0]);
    // Integer caps are finite by schema. SQL NULL > 0 is unknown (excluded);
    // zero/negative caps fail > 0, inactive fails = true. No expiry/start filter.
  });

  describe("isVoucherExpired", () => {
    it("returns false for vouchers without expiry", () => {
      expect(isVoucherExpired(null)).toBe(false);
      expect(isVoucherExpired(undefined as any)).toBe(false);
    });

    it("returns false for future expiry", () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(isVoucherExpired(tomorrow)).toBe(false);
    });

    it("returns true for past expiry", () => {
      const past = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      expect(isVoucherExpired(past)).toBe(true);
    });
  });

  describe("validateVoucherForm", () => {
    it("validates code format on creation (4-20 alphanumeric uppercase)", () => {
      const invalidShort = validateVoucherForm({ code: "ABC", type: "percent", value: 10 });
      expect(invalidShort.valid).toBe(false);
      expect(invalidShort.errors.code).toBe("Mã gồm 4–20 ký tự chữ in hoa hoặc số.");

      const invalidSpecial = validateVoucherForm({ code: "CODI-20", type: "percent", value: 10 });
      expect(invalidSpecial.valid).toBe(false);
      expect(invalidSpecial.errors.code).toBe("Mã gồm 4–20 ký tự chữ in hoa hoặc số.");

      const validCode = validateVoucherForm({ code: "CODI2026", type: "percent", value: 20 });
      expect(validCode.valid).toBe(true);
    });

    it("does not revalidate code on update if not provided/ignored", () => {
      const res = validateVoucherForm({ code: "CODI2026", type: "percent", value: 20 }, true);
      expect(res.valid).toBe(true);
    });

    it("validates value bounds for percent and amount", () => {
      const zeroVal = validateVoucherForm({ code: "CODI", type: "percent", value: 0 });
      expect(zeroVal.valid).toBe(false);
      expect(zeroVal.errors.value).toBe("Nhập số lớn hơn 0.");

      const overHundredPercent = validateVoucherForm({ code: "CODI", type: "percent", value: 105 });
      expect(overHundredPercent.valid).toBe(false);
      expect(overHundredPercent.errors.value).toBe("Phần trăm tối đa là 100.");

      const amountVal = validateVoucherForm({ code: "CODI", type: "amount", value: 500000 });
      expect(amountVal.valid).toBe(true);
    });

    it("validates minOrderAmount and usageLimit", () => {
      const invalidMin = validateVoucherForm({ code: "CODI", type: "amount", value: 50000, minOrderAmount: -100 });
      expect(invalidMin.valid).toBe(false);
      expect(invalidMin.errors.minOrderAmount).toBe("Nhập giá trị đơn tối thiểu hợp lệ.");

      const invalidLimit = validateVoucherForm({ code: "CODI", type: "amount", value: 50000, usageLimit: 0 });
      expect(invalidLimit.valid).toBe(false);
      expect(invalidLimit.errors.usageLimit).toBe("Số lượt phải từ 1 trở lên.");
    });
  });

  describe("createAdminVoucher & updateAdminVoucher with mock db", () => {
    it("creates voucher successfully when code is unique", async () => {
      const mockCreated = {
        id: 1,
        code: "SALE50",
        description: null,
        type: "percent",
        value: 50,
        minOrderAmount: 0,
        maxDiscountAmount: null,
        usageLimit: 100,
        usedCount: 0,
        startsAt: null,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // no existing
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockCreated]),
          }),
        }),
      };

      const res = await createAdminVoucher(mockDb as any, "admin-user", {
        code: "SALE50",
        type: "percent",
        value: 50,
        usageLimit: 100,
      });

      expect(res.code).toBe("SALE50");
      expect(res.value).toBe(50);
      expect(res.isActive).toBe(true);
    });

    it("throws error when code already exists", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 99 }]),
            }),
          }),
        }),
      };

      await expect(
        createAdminVoucher(mockDb as any, "admin-user", {
          code: "DUPLICATE",
          type: "percent",
          value: 10,
        })
      ).rejects.toThrow("Mã này đã tồn tại.");
    });

    it("toggles voucher active state", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 1, code: "CODI20" }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const res = await toggleAdminVoucherActive(mockDb as any, 1, false);
      expect(res.success).toBe(true);
      expect(res.code).toBe("CODI20");
      expect(res.isActive).toBe(false);
    });
  });
});
