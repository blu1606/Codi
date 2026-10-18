import { and, eq } from "drizzle-orm";
import { orders, orderItems, studentCart, vouchers } from "@codi-1/db";
import type { DatabaseContext } from "./cart-service";
import { getCartSummary } from "./cart-service";

function generateOrderCode(): string {
  const num = 10000 + Math.floor(Math.random() * 90000);
  return `CODI${num}`;
}

export interface CheckoutResult {
  orderId: number;
  orderCode: string;
  totalAmount: number;
}

export async function createOrderFromCart(
  db: DatabaseContext,
  userId: string,
  voucherCode?: string | null,
  forceReplaceOrderId?: number | null,
): Promise<CheckoutResult> {
  const summary = await getCartSummary(db, userId, voucherCode);

  if (!summary.items.length) {
    throw new Error("Giỏ hàng của bạn đang trống");
  }

  // If a pending order exists and forceReplaceOrderId is provided, cancel that order
  if (forceReplaceOrderId) {
    const [existing] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, forceReplaceOrderId), eq(orders.userId, userId)))
      .limit(1);

    if (existing && existing.status === "pending") {
      await db
        .update(orders)
        .set({ status: "cancelled", failReason: "Huỷ để tạo đơn mới" })
        .where(eq(orders.id, forceReplaceOrderId));
    }
  }

  // Find voucherId if voucher applied
  let voucherId: number | null = null;
  if (summary.voucher) {
    const [v] = await db
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(eq(vouchers.code, summary.voucher.code))
      .limit(1);
    if (v) voucherId = v.id;
  }

  // Generate unique order code
  let code = generateOrderCode();
  let retries = 5;
  while (retries > 0) {
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.code, code))
      .limit(1);
    if (!existing) break;
    code = generateOrderCode();
    retries--;
  }

  const [order] = await db
    .insert(orders)
    .values({
      code,
      userId,
      voucherId,
      subtotal: summary.subtotal,
      discountAmount: summary.discount,
      totalAmount: summary.total,
      currency: "VND",
      status: "pending",
      isBuyNow: false,
    })
    .returning({ id: orders.id, code: orders.code, totalAmount: orders.totalAmount });

  // Insert order items
  for (const item of summary.items) {
    await db.insert(orderItems).values({
      orderId: order.id,
      courseId: item.id,
      courseTitle: item.title,
      unitPrice: item.price,
    });
  }

  // Clear cart after creating order
  await db.delete(studentCart).where(eq(studentCart.userId, userId));

  return {
    orderId: order.id,
    orderCode: order.code,
    totalAmount: order.totalAmount,
  };
}
