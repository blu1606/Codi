import { and, desc, eq, gt, sql } from "drizzle-orm";
import { vouchers } from "@codi-1/db";

export type AdminVoucherItem = {
  id: number;
  code: string;
  description: string | null;
  type: "percent" | "amount";
  value: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  isExpired: boolean;
  isLimitReached: boolean;
};

export type VoucherFormData = {
  id?: number | null;
  code: string;
  description?: string;
  type: "percent" | "amount";
  value: number;
  minOrderAmount?: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
};

export function isVoucherExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false;
  // End of day evaluation for expiry
  const expDate = new Date(expiresAt);
  expDate.setHours(23, 59, 59, 999);
  return expDate.getTime() < Date.now();
}

export function validateVoucherForm(data: VoucherFormData, isUpdate: boolean = false): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const code = (data.code || "").trim().toUpperCase();
  if (!isUpdate) {
    if (!/^[A-Z0-9]{4,20}$/.test(code)) {
      errors.code = "Mã gồm 4–20 ký tự chữ in hoa hoặc số.";
    }
  }

  const value = Number(data.value);
  if (isNaN(value) || value <= 0) {
    errors.value = "Nhập số lớn hơn 0.";
  } else if (data.type === "percent" && value > 100) {
    errors.value = "Phần trăm tối đa là 100.";
  }

  const minOrder = data.minOrderAmount !== undefined ? Number(data.minOrderAmount) : 0;
  if (isNaN(minOrder) || minOrder < 0) {
    errors.minOrderAmount = "Nhập giá trị đơn tối thiểu hợp lệ.";
  }

  if (data.usageLimit !== null && data.usageLimit !== undefined) {
    const limit = Number(data.usageLimit);
    if (isNaN(limit) || limit < 1) {
      errors.usageLimit = "Số lượt phải từ 1 trở lên.";
    }
  }

  if (data.expiresAt) {
    const expDate = new Date(data.expiresAt);
    expDate.setHours(23, 59, 59, 999);
    if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
      errors.expiresAt = "Chọn một ngày từ hôm nay trở đi.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// The legacy URL name denotes usage exhaustion, not calendar expiry.
export function nearLimitVoucherPredicate() {
  return and(
    eq(vouchers.isActive, true),
    gt(vouchers.usageLimit, 0),
    sql`${vouchers.usedCount}::numeric * 10 >= ${vouchers.usageLimit}::numeric * 9`,
  );
}

export async function getAdminVouchers(db: any, filter?: string): Promise<AdminVoucherItem[]> {
  const rows = await db
    .select()
    .from(vouchers)
    .where(filter === "expiring" ? nearLimitVoucherPredicate() : undefined)
    .orderBy(desc(vouchers.createdAt));

  return rows.map((v: any) => {
    const isExpired = isVoucherExpired(v.expiresAt);
    const isLimitReached = v.usageLimit !== null && v.usedCount >= v.usageLimit;
    return {
      id: v.id,
      code: v.code,
      description: v.description,
      type: v.type,
      value: v.value,
      minOrderAmount: v.minOrderAmount,
      maxDiscountAmount: v.maxDiscountAmount,
      usageLimit: v.usageLimit,
      usedCount: v.usedCount,
      startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null,
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      isActive: v.isActive,
      createdAt: new Date(v.createdAt).toISOString(),
      isExpired,
      isLimitReached,
    };
  });
}

export async function createAdminVoucher(
  db: any,
  adminUserId: string,
  data: VoucherFormData
): Promise<AdminVoucherItem> {
  const validation = validateVoucherForm(data, false);
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0];
    throw new Error(firstErr || "Dữ liệu voucher không hợp lệ.");
  }

  const code = data.code.trim().toUpperCase();

  // Check unique code
  const [existing] = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(eq(vouchers.code, code))
    .limit(1);

  if (existing) {
    throw new Error("Mã này đã tồn tại.");
  }

  const expiresDate = data.expiresAt ? new Date(data.expiresAt) : null;
  if (expiresDate) {
    // Set to end of day UTC/local
    expiresDate.setHours(23, 59, 59, 999);
  }

  const [created] = await db
    .insert(vouchers)
    .values({
      code,
      description: data.description?.trim() || null,
      type: data.type,
      value: Number(data.value),
      minOrderAmount: Number(data.minOrderAmount || 0),
      usageLimit: data.usageLimit !== null && data.usageLimit !== undefined ? Number(data.usageLimit) : null,
      usedCount: 0,
      expiresAt: expiresDate,
      isActive: true,
      createdBy: adminUserId,
    })
    .returning();

  return {
    id: created.id,
    code: created.code,
    description: created.description,
    type: created.type,
    value: created.value,
    minOrderAmount: created.minOrderAmount,
    maxDiscountAmount: created.maxDiscountAmount,
    usageLimit: created.usageLimit,
    usedCount: created.usedCount,
    startsAt: created.startsAt ? new Date(created.startsAt).toISOString() : null,
    expiresAt: created.expiresAt ? new Date(created.expiresAt).toISOString() : null,
    isActive: created.isActive,
    createdAt: new Date(created.createdAt).toISOString(),
    isExpired: isVoucherExpired(created.expiresAt),
    isLimitReached: false,
  };
}

export async function updateAdminVoucher(
  db: any,
  voucherId: number,
  data: Partial<VoucherFormData>
): Promise<AdminVoucherItem> {
  const [existing] = await db
    .select()
    .from(vouchers)
    .where(eq(vouchers.id, voucherId))
    .limit(1);

  if (!existing) {
    throw new Error("Không tìm thấy voucher.");
  }

  const updatedData: VoucherFormData = {
    id: voucherId,
    code: existing.code,
    description: data.description !== undefined ? data.description : existing.description,
    type: data.type || existing.type,
    value: data.value !== undefined ? data.value : existing.value,
    minOrderAmount: data.minOrderAmount !== undefined ? data.minOrderAmount : existing.minOrderAmount,
    usageLimit: data.usageLimit !== undefined ? data.usageLimit : existing.usageLimit,
    expiresAt: data.expiresAt !== undefined ? data.expiresAt : (existing.expiresAt ? new Date(existing.expiresAt).toISOString().split("T")[0] : null),
  };

  const validation = validateVoucherForm(updatedData, true);
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0];
    throw new Error(firstErr || "Dữ liệu voucher không hợp lệ.");
  }

  const expiresDate = updatedData.expiresAt ? new Date(updatedData.expiresAt) : null;
  if (expiresDate) {
    expiresDate.setHours(23, 59, 59, 999);
  }

  const [updated] = await db
    .update(vouchers)
    .set({
      type: updatedData.type,
      value: Number(updatedData.value),
      minOrderAmount: Number(updatedData.minOrderAmount || 0),
      usageLimit: updatedData.usageLimit !== null && updatedData.usageLimit !== undefined ? Number(updatedData.usageLimit) : null,
      expiresAt: expiresDate,
      description: updatedData.description?.trim() || null,
    })
    .where(eq(vouchers.id, voucherId))
    .returning();

  return {
    id: updated.id,
    code: updated.code,
    description: updated.description,
    type: updated.type,
    value: updated.value,
    minOrderAmount: updated.minOrderAmount,
    maxDiscountAmount: updated.maxDiscountAmount,
    usageLimit: updated.usageLimit,
    usedCount: updated.usedCount,
    startsAt: updated.startsAt ? new Date(updated.startsAt).toISOString() : null,
    expiresAt: updated.expiresAt ? new Date(updated.expiresAt).toISOString() : null,
    isActive: updated.isActive,
    createdAt: new Date(updated.createdAt).toISOString(),
    isExpired: isVoucherExpired(updated.expiresAt),
    isLimitReached: updated.usageLimit !== null && updated.usedCount >= updated.usageLimit,
  };
}

export async function toggleAdminVoucherActive(
  db: any,
  voucherId: number,
  active: boolean
): Promise<{ success: boolean; code: string; isActive: boolean }> {
  const [existing] = await db
    .select({ id: vouchers.id, code: vouchers.code })
    .from(vouchers)
    .where(eq(vouchers.id, voucherId))
    .limit(1);

  if (!existing) {
    throw new Error("Không tìm thấy voucher.");
  }

  await db
    .update(vouchers)
    .set({ isActive: active })
    .where(eq(vouchers.id, voucherId));

  return { success: true, code: existing.code, isActive: active };
}
