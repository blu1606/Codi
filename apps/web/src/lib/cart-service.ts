import { and, desc, eq, inArray } from "drizzle-orm";
import {
  courses,
  orders,
  orderItems,
  studentCart,
  studentEnrollments,
  user,
  vouchers,
} from "@codi-1/db";
import type {
  AppliedVoucher,
  CartCourse,
  CartSummaryData,
  PendingOrderBanner,
  VoucherValidationResult,
} from "./cart-contract";

export interface DatabaseContext {
  select: any;
  insert: any;
  delete: any;
  update: any;
  transaction?: any;
}

export function validateVoucher(
  voucher: typeof vouchers.$inferSelect | undefined,
  subtotal: number,
  now: Date = new Date(),
): VoucherValidationResult {
  if (!voucher) {
    return { valid: false, error: "Mã giảm giá không tồn tại. Kiểm tra lại chính tả." };
  }
  if (!voucher.isActive) {
    return { valid: false, error: "Mã này đã ngừng áp dụng." };
  }
  if (voucher.expiresAt && new Date(voucher.expiresAt) < now) {
    const d = new Date(voucher.expiresAt);
    const dateFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return { valid: false, error: `Mã đã hết hạn từ ${dateFormatted}.` };
  }
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
    return { valid: false, error: "Mã đã hết lượt sử dụng." };
  }
  if (voucher.minOrderAmount > 0 && subtotal < voucher.minOrderAmount) {
    const formattedMin = `${voucher.minOrderAmount.toLocaleString("vi-VN")} ₫`;
    return { valid: false, error: `Đơn hàng cần tối thiểu ${formattedMin} để dùng mã này.` };
  }

  let discount = 0;
  if (voucher.type === "percent") {
    discount = Math.round((subtotal * voucher.value) / 100);
    if (voucher.maxDiscountAmount && discount > voucher.maxDiscountAmount) {
      discount = voucher.maxDiscountAmount;
    }
  } else {
    discount = Math.min(voucher.value, subtotal);
  }

  return {
    valid: true,
    voucher: {
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      discount,
    },
  };
}

export async function getCartSummary(
  db: DatabaseContext,
  userId: string,
  voucherCode?: string | null,
): Promise<CartSummaryData> {
  // 1. Fetch cart rows
  const cartRows = await db
    .select({
      id: studentCart.id,
      courseId: studentCart.courseId,
    })
    .from(studentCart)
    .where(eq(studentCart.userId, userId));

  if (!cartRows.length) {
    // Check pending order even if cart is empty
    const pendingOrder = await getPendingOrderBanner(db, userId);
    return {
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      voucher: null,
      removedOwnedTitles: [],
      pendingOrder,
    };
  }

  const courseIds = cartRows.map((r: { courseId: string }) => r.courseId);

  // 2. Check for enrolled courses
  const enrollments = await db
    .select({ courseId: studentEnrollments.courseId })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        inArray(studentEnrollments.courseId, courseIds),
      ),
    );

  const ownedCourseIds = new Set(enrollments.map((e: { courseId: string }) => e.courseId));
  const removedOwnedTitles: string[] = [];

  // 3. Remove owned courses from cart immediately
  if (ownedCourseIds.size > 0) {
    for (const ownedId of Array.from(ownedCourseIds)) {
      await db
        .delete(studentCart)
        .where(
          and(
            eq(studentCart.userId, userId),
            eq(studentCart.courseId, ownedId as string),
          ),
        );
    }
  }

  // 4. Fetch details of courses remaining in cart
  const remainingCourseIds = courseIds.filter((id: string) => !ownedCourseIds.has(id));

  // Query details including lecturer
  const courseDetails = await db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      price: courses.price,
      level: courses.level,
      category: courses.category,
      lecturerName: user.name,
    })
    .from(courses)
    .leftJoin(user, eq(courses.instructorId, user.id))
    .where(inArray(courses.id, courseIds));

  const items: CartCourse[] = [];
  for (const c of courseDetails) {
    if (ownedCourseIds.has(c.id)) {
      removedOwnedTitles.push(c.title);
    } else if (remainingCourseIds.includes(c.id)) {
      items.push({
        id: c.id,
        title: c.title,
        slug: c.slug,
        price: c.price,
        level: c.level,
        category: c.category,
        coverImageUrl: null,
        lecturerName: c.lecturerName || "Codi",
      });
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // 5. Validate voucher if provided
  let appliedVoucher: AppliedVoucher | null = null;
  let voucherError: string | null = null;

  if (voucherCode && voucherCode.trim() && subtotal > 0) {
    const trimmedCode = voucherCode.trim().toUpperCase();
    const [voucherRow] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.code, trimmedCode))
      .limit(1);

    const validation = validateVoucher(voucherRow, subtotal);
    if (validation.valid) {
      appliedVoucher = validation.voucher;
    } else {
      voucherError = validation.error;
    }
  }

  const discount = appliedVoucher ? appliedVoucher.discount : 0;
  const total = Math.max(0, subtotal - discount);
  const pendingOrder = await getPendingOrderBanner(db, userId);

  return {
    items,
    subtotal,
    discount,
    total,
    voucher: appliedVoucher,
    voucherError,
    removedOwnedTitles,
    pendingOrder,
  };
}

export async function removeFromCart(
  db: DatabaseContext,
  userId: string,
  courseId: string,
): Promise<{ success: boolean; courseTitle?: string }> {
  const [course] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  await db
    .delete(studentCart)
    .where(
      and(
        eq(studentCart.userId, userId),
        eq(studentCart.courseId, courseId),
      ),
    );

  return { success: true, courseTitle: course?.title };
}

export async function getPendingOrderBanner(
  db: DatabaseContext,
  userId: string,
): Promise<PendingOrderBanner | null> {
  const [pending] = await db
    .select({
      id: orders.id,
      code: orders.code,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "pending")))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!pending) return null;

  const items = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, pending.id));

  return {
    id: pending.id,
    code: pending.code,
    itemCount: items.length,
    totalAmount: pending.totalAmount,
    createdAt: new Date(pending.createdAt).toISOString(),
  };
}
