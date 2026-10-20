import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { auth, db } from "@/services";
import { orders, orderItems, orderEvents } from "@codi-1/db";
import { studentTransactions } from "@codi-1/db/schema/student-profile";

function generateOrderCode(): string {
  const num = 10000 + Math.floor(Math.random() * 90000);
  return `CODI${num}`;
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const { id: rawId } = await props.params;
    if (!rawId) {
      return NextResponse.json({ error: "Thiếu mã đơn hàng" }, { status: 400 });
    }

    const trimmed = decodeURIComponent(rawId).trim();
    const isNumeric = /^\d+$/.test(trimmed);

    return await db.transaction(async (tx) => {
      // Serialize concurrent operations on this order code
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${trimmed}))`);

      // Find old order
      const [oldOrder] = await tx
        .select({
          id: orders.id,
          code: orders.code,
          userId: orders.userId,
          voucherId: orders.voucherId,
          subtotal: orders.subtotal,
          discountAmount: orders.discountAmount,
          totalAmount: orders.totalAmount,
          receivedAmount: orders.receivedAmount,
          status: orders.status,
          failReason: orders.failReason,
          isBuyNow: orders.isBuyNow,
          paymentDeadline: orders.paymentDeadline,
        })
        .from(orders)
        .where(
          and(
            eq(orders.userId, session.user.id),
            isNumeric ? or(eq(orders.id, Number(trimmed)), eq(orders.code, trimmed)) : eq(orders.code, trimmed),
          ),
        )
        .limit(1);

      if (!oldOrder) {
        return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
      }

      // Check if old order has crossed payment deadline while still pending
      if (oldOrder.status === "pending" && oldOrder.paymentDeadline && new Date(oldOrder.paymentDeadline) <= new Date()) {
        const isUnderpaid = oldOrder.receivedAmount > 0;
        await tx
          .update(orders)
          .set({
            status: "failed",
            failReason: "expired",
            needsReconciliation: isUnderpaid ? true : undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(orders.id, oldOrder.id), eq(orders.status, "pending")));

        oldOrder.status = "failed";
        oldOrder.failReason = "expired";
      }

      // Old order must be failed (or expired)
      if (oldOrder.status !== "failed") {
        return NextResponse.json(
          { error: "Chỉ đơn hàng đã hết hạn hoặc thất bại mới có thể tạo mã mới" },
          { status: 400 },
        );
      }

      // Generate new unique code
      let code = generateOrderCode();
      let retries = 5;
      while (retries > 0) {
        const [existing] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.code, code))
          .limit(1);
        if (!existing) break;
        code = generateOrderCode();
        retries--;
      }

      const now = new Date();
      const paymentDeadline = new Date(now.getTime() + 30 * 60 * 1000);

      // Create replacement order
      const [newOrder] = await tx
        .insert(orders)
        .values({
          code,
          userId: session.user.id,
          voucherId: oldOrder.voucherId,
          subtotal: oldOrder.subtotal,
          discountAmount: oldOrder.discountAmount,
          totalAmount: oldOrder.totalAmount,
          receivedAmount: 0,
          currency: "VND",
          status: "pending",
          isBuyNow: oldOrder.isBuyNow,
          replacesOrderId: oldOrder.id,
          paymentDeadline,
        })
        .returning({ id: orders.id, code: orders.code });

      // Timeline event on new order
      await tx.insert(orderEvents).values({
        orderId: newOrder.id,
        label: `Đã tạo đơn (thay cho ${oldOrder.code})`,
        actorId: session.user.id,
      });

      // Copy order items from old order
      const oldItems = await tx
        .select({
          courseId: orderItems.courseId,
          courseTitle: orderItems.courseTitle,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, oldOrder.id));

      for (const item of oldItems) {
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          courseId: item.courseId,
          courseTitle: item.courseTitle,
          unitPrice: item.unitPrice,
        });
      }

      // Create studentTransactions record for webhook matching compatibility
      if (oldItems.length > 0) {
        await tx.insert(studentTransactions).values({
          id: newOrder.code,
          userId: session.user.id,
          courseId: oldItems[0].courseId,
          amount: oldOrder.totalAmount,
          status: "pending",
        });
      }

      return NextResponse.json({
        orderId: newOrder.id,
        orderCode: newOrder.code,
      }, { status: 201 });
    });
  } catch (error) {
    console.error("New code error:", error);
    return NextResponse.json(
      { error: "Không thể tạo mã mới. Vui lòng thử lại sau." },
      { status: 500 },
    );
  }
}
