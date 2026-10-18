import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { orderEvents, orderItems, orders, studentCart, vouchers } from "@codi-1/db";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
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

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export async function createOrderFromCart(
  db: Database,
  userId: string,
  voucherCode?: string | null,
  forceReplaceOrderId?: number | null,
): Promise<CheckoutResult> {
  const normalizedVoucherCode =
    typeof voucherCode === "string" && voucherCode.trim()
      ? voucherCode.trim().toUpperCase()
      : null;

  // 1. Get summary from cart
  const summary = await getCartSummary(db, userId, normalizedVoucherCode);

  if (!summary.items.length) {
    throw new CheckoutError(400, "Giỏ hàng của bạn đang trống");
  }

  // 2. Point 5: If voucher was provided but invalid/expired/exhausted, abort with 409
  if (normalizedVoucherCode) {
    if (!summary.voucher) {
      throw new CheckoutError(
        409,
        summary.voucherError || "Mã giảm giá không hợp lệ hoặc đã hết hạn",
      );
    }
  }

  return await db.transaction(async (tx) => {
    // 3. Point 3: Guard against concurrent or existing pending order
    const [existingPending] = await tx
      .select({ id: orders.id, code: orders.code })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (existingPending) {
      // Must explicitly provide matching replaceOrderId to replace
      if (!forceReplaceOrderId || forceReplaceOrderId !== existingPending.id) {
        throw new CheckoutError(
          409,
          `Bạn đang có đơn hàng ${existingPending.code} chờ thanh toán. Vui lòng hoàn tất hoặc huỷ đơn cũ trước khi đặt đơn mới.`,
          "PENDING_ORDER_EXISTS",
        );
      }

      // Point 4: Cancel pending order safely in atomic UPDATE
      const updated = await tx
        .update(orders)
        .set({
          status: "cancelled",
          failReason: "Huỷ để tạo đơn mới",
          cancelledAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, existingPending.id),
            eq(orders.userId, userId),
            eq(orders.status, "pending"),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        throw new CheckoutError(
          409,
          "Đơn hàng cũ đã thay đổi trạng thái hoặc đã được thanh toán.",
        );
      }

      // Also cancel in legacy studentTransactions if exists
      await tx
        .update(studentTransactions)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(studentTransactions.id, existingPending.code),
            eq(studentTransactions.userId, userId),
            eq(studentTransactions.status, "pending"),
          ),
        );
    }

    // 4. Find voucherId if voucher applied
    let voucherId: number | null = null;
    if (summary.voucher) {
      const [v] = await tx
        .select({ id: vouchers.id })
        .from(vouchers)
        .where(eq(vouchers.code, summary.voucher.code))
        .limit(1);
      if (v) voucherId = v.id;
    }

    // 5. Generate unique order code
    let code = generateOrderCode();
    let retries = 5;
    while (retries > 0) {
      const [existingOrder] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.code, code))
        .limit(1);

      const [existingTx] = await tx
        .select({ id: studentTransactions.id })
        .from(studentTransactions)
        .where(eq(studentTransactions.id, code))
        .limit(1);

      if (!existingOrder && !existingTx) break;
      code = generateOrderCode();
      retries--;
    }

    const paymentDeadline = new Date(Date.now() + 30 * 60 * 1000); // 30 mins deadline

    // 6. Point 1: Set paymentDeadline NOT NULL
    const [order] = await tx
      .insert(orders)
      .values({
        code,
        userId,
        voucherId,
        subtotal: summary.subtotal,
        discountAmount: summary.discount,
        totalAmount: summary.total,
        receivedAmount: 0,
        currency: "VND",
        status: "pending",
        isBuyNow: false,
        replacesOrderId: forceReplaceOrderId ?? undefined,
        paymentDeadline,
      })
      .returning({ id: orders.id, code: orders.code, totalAmount: orders.totalAmount });

    // Timeline event
    await tx.insert(orderEvents).values({
      orderId: order.id,
      label: forceReplaceOrderId ? "Đã tạo đơn mới (thay đơn cũ)" : "Đã tạo đơn",
      actorId: userId,
    });

    // 7. Point 1: Insert order items with correct column names (courseTitle, unitPrice)
    for (const item of summary.items) {
      await tx.insert(orderItems).values({
        orderId: order.id,
        courseId: item.id,
        courseTitle: item.title,
        unitPrice: item.price,
      });
    }

    // Insert studentTransactions for payment matching compatibility
    await tx.insert(studentTransactions).values({
      id: order.code,
      userId,
      courseId: summary.items[0].id,
      amount: order.totalAmount,
      status: "pending",
    });

    // 8. Point 2: Clear cart in same atomic transaction
    await tx.delete(studentCart).where(eq(studentCart.userId, userId));

    return {
      orderId: order.id,
      orderCode: order.code,
      totalAmount: order.totalAmount,
    };
  });
}
