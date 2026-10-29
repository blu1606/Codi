import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { orderEvents, orderItems, orders, studentCart, vouchers } from "@codi-1/db";
import { studentEnrollments, studentTransactions } from "@codi-1/db/schema/student-profile";
import { getCartSummary } from "./cart-service";
import { getSepayConfig } from "./sepay-config";

function generateOrderCode(): string {
  const num = 10000 + Math.floor(Math.random() * 90000);
  return `CODI${num}`;
}

export interface CheckoutResult {
  orderId: number;
  orderCode: string;
  totalAmount: number;
}

export interface PendingOrderDetails {
  id: number;
  code: string;
  totalAmount?: number;
}

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public pendingOrder?: PendingOrderDetails,
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

  // 2. If voucher was provided but invalid/expired/exhausted, abort with 409
  if (normalizedVoucherCode) {
    if (!summary.voucher) {
      throw new CheckoutError(
        409,
        summary.voucherError || "Mã giảm giá không hợp lệ hoặc đã hết hạn",
      );
    }
  }

  // Guard against missing payment gateway config for orders with total > 0
  if (summary.total > 0 && !getSepayConfig()) {
    throw new CheckoutError(503, "Thanh toán tạm thời chưa khả dụng do thiếu cấu hình cổng thanh toán.");
  }

  return await db.transaction(async (tx) => {
    // Acquire PostgreSQL transaction-level advisory lock per user to prevent concurrent checkout race condition
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    // 3. Guard against concurrent or existing pending order
    const [resolvedPending] = await tx
      .select({ id: orders.id, code: orders.code })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (resolvedPending) {
      // Checkout always acquires user -> code; code-locked payment/cancellation
      // paths never acquire the user lock. Do not hold row writes while waiting.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${resolvedPending.code}))`);
      const [existingPending] = await tx
        .select({
          id: orders.id,
          code: orders.code,
          status: orders.status,
          receivedAmount: orders.receivedAmount,
          paymentDeadline: orders.paymentDeadline,
        })
        .from(orders)
        .where(and(eq(orders.id, resolvedPending.id), eq(orders.userId, userId)))
        .limit(1);

      if (!existingPending || existingPending.status !== "pending") {
        throw new CheckoutError(409, "Đơn hàng cũ đã thay đổi trạng thái hoặc đã được thanh toán.");
      }
      const isExpired =
        existingPending.paymentDeadline &&
        new Date(existingPending.paymentDeadline) <= new Date();

      if (isExpired) {
        // Automatically mark expired pending order as failed
        const updated = await tx
          .update(orders)
          .set({
            status: "failed",
            failReason: "expired",
            needsReconciliation: existingPending.receivedAmount > 0 ? true : undefined,
            updatedAt: new Date(),
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
          throw new CheckoutError(409, "Đơn hàng cũ đã thay đổi trạng thái hoặc đã được thanh toán.");
        }

        await tx
          .update(studentTransactions)
          .set({ status: "failed" })
          .where(
            and(
              eq(studentTransactions.id, existingPending.code),
              eq(studentTransactions.userId, userId),
              eq(studentTransactions.status, "pending"),
            ),
          );
      } else {
        // Must explicitly provide matching replaceOrderId to replace
        if (!forceReplaceOrderId || forceReplaceOrderId !== existingPending.id) {
          throw new CheckoutError(
            409,
            `Bạn đang có đơn hàng ${existingPending.code} chờ thanh toán. Vui lòng hoàn tất hoặc huỷ đơn cũ trước khi đặt đơn mới.`,
            "PENDING_ORDER_EXISTS",
            {
              id: existingPending.id,
              code: existingPending.code,
              totalAmount: summary.total,
            },
          );
        }

        // Cancel pending order safely in atomic UPDATE
        const updated = await tx
          .update(orders)
          .set({
            status: "cancelled",
            failReason: "Huỷ để tạo đơn mới",
            needsReconciliation: existingPending.receivedAmount > 0 ? true : undefined,
            cancelledAt: new Date(),
            updatedAt: new Date(),
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
    }

    const isZeroVndOrder = summary.total <= 0;
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

    if (isZeroVndOrder && summary.voucher) {
      if (!voucherId) {
        throw new CheckoutError(409, "Mã giảm giá không còn khả dụng. Vui lòng kiểm tra lại giỏ hàng.");
      }
      // No money was received: a failed capacity claim must abort the whole
      // checkout transaction, not commit free fulfillment for reconciliation.
      const claimed = await tx
        .update(vouchers)
        .set({ usedCount: sql`${vouchers.usedCount} + 1` })
        .where(and(
          eq(vouchers.id, voucherId),
          or(isNull(vouchers.usageLimit), sql`${vouchers.usedCount} < ${vouchers.usageLimit}`),
        ))
        .returning({ id: vouchers.id });
      if (claimed.length === 0) {
        throw new CheckoutError(409, "Mã đã hết lượt sử dụng.");
      }
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

    const now = new Date();
    const paymentDeadline = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins deadline

    // 6. Insert order
    const [order] = await tx
      .insert(orders)
      .values({
        code,
        userId,
        voucherId,
        subtotal: summary.subtotal,
        discountAmount: summary.discount,
        totalAmount: isZeroVndOrder ? 0 : summary.total,
        receivedAmount: 0,
        currency: "VND",
        status: isZeroVndOrder ? "paid" : "pending",
        paidAt: isZeroVndOrder ? now : null,
        isBuyNow: false,
        replacesOrderId: forceReplaceOrderId ?? undefined,
        paymentDeadline,
      })
      .returning({ id: orders.id, code: orders.code, totalAmount: orders.totalAmount });

    // Timeline event
    await tx.insert(orderEvents).values({
      orderId: order.id,
      label: isZeroVndOrder
        ? "Đã thanh toán (Miễn phí qua mã giảm giá)"
        : forceReplaceOrderId
          ? "Đã tạo đơn mới (thay đơn cũ)"
          : "Đã tạo đơn",
      actorId: userId,
    });

    // 7. Insert order items
    for (const item of summary.items) {
      await tx.insert(orderItems).values({
        orderId: order.id,
        courseId: item.id,
        courseTitle: item.title,
        unitPrice: item.price,
      });
    }

    if (isZeroVndOrder) {
      // Voucher capacity was claimed before creating this paid order.
      for (const item of summary.items) {
        await tx
          .insert(studentEnrollments)
          .values({
            userId,
            courseId: item.id,
          })
          .onConflictDoNothing();
      }
    } else {
      // Insert studentTransactions for payment matching compatibility
      await tx.insert(studentTransactions).values({
        id: order.code,
        userId,
        courseId: summary.items[0].id,
        amount: order.totalAmount,
        status: "pending",
      });
    }

    // 8. Delete only the courses that were placed in this order
    const orderedCourseIds = summary.items.map((it) => it.id);
    if (orderedCourseIds.length > 0) {
      await tx
        .delete(studentCart)
        .where(
          and(
            eq(studentCart.userId, userId),
            inArray(studentCart.courseId, orderedCourseIds),
          ),
        );
    }

    return {
      orderId: order.id,
      orderCode: order.code,
      totalAmount: order.totalAmount,
    };
  });
}
