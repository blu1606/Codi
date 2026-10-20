import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { auth, db } from "@/services";
import { orderItems, orders } from "@codi-1/db";
import { studentCart, studentTransactions } from "@codi-1/db/schema/student-profile";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body.orderId;
    const orderCode = body.orderCode;

    if (!orderId && !orderCode) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp mã đơn hàng cần hủy" },
        { status: 400 },
      );
    }

    const cancelled = await db.transaction(async (tx) => {
      // 1. Resolve canonical order to get its code
      const [orderToCancel] = await tx
        .select({
          id: orders.id,
          code: orders.code,
          status: orders.status,
        })
        .from(orders)
        .where(
          and(
            eq(orders.userId, session.user.id),
            orderId ? eq(orders.id, Number(orderId)) : eq(orders.code, String(orderCode)),
          ),
        )
        .limit(1);

      if (!orderToCancel) {
        // Fallback: check studentTransactions if no order row exists
        if (orderCode) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${String(orderCode)}))`);
          const txRes = await tx
            .update(studentTransactions)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(studentTransactions.id, String(orderCode)),
                eq(studentTransactions.userId, session.user.id),
                eq(studentTransactions.status, "pending"),
              ),
            )
            .returning({ id: studentTransactions.id });
          return txRes.length > 0;
        }
        return false;
      }

      // Serialize concurrent operations on this canonical order code
      const lockCode = orderToCancel.code || (orderCode ? String(orderCode) : String(orderToCancel.id));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockCode}))`);

      // Re-read status under advisory lock to avoid race conditions with payment settlement
      const [lockedOrder] = await tx
        .select({
          id: orders.id,
          code: orders.code,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderToCancel.id))
        .limit(1);

      if (!lockedOrder || lockedOrder.status !== "pending") {
        return false;
      }

      // 2. Atomically update orders to cancelled
      const res = await tx
        .update(orders)
        .set({
          status: "cancelled",
          failReason: "Người mua đã huỷ",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, lockedOrder.id), eq(orders.status, "pending")))
        .returning({ id: orders.id, code: orders.code });

      if (res.length === 0) {
        return false;
      }

      // Re-add items to studentCart
      const items = await tx
        .select({ courseId: orderItems.courseId })
        .from(orderItems)
        .where(eq(orderItems.orderId, lockedOrder.id));

      for (const item of items) {
        await tx
          .insert(studentCart)
          .values({
            userId: session.user.id,
            courseId: item.courseId,
          })
          .onConflictDoNothing();
      }

      // Cancel associated studentTransactions
      const txCode = lockedOrder.code || (orderCode ? String(orderCode) : null);
      if (txCode) {
        await tx
          .update(studentTransactions)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(studentTransactions.id, txCode),
              eq(studentTransactions.userId, session.user.id),
              eq(studentTransactions.status, "pending"),
            ),
          );
      }

      return true;
    });

    if (!cancelled) {
      return NextResponse.json(
        { error: "Đơn hàng không tồn tại, đã hoàn tất thanh toán hoặc đã được huỷ trước đó." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, message: "Đã hủy đơn hàng thành công" });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json(
      { error: "Không thể hủy đơn hàng. Vui lòng thử lại sau." },
      { status: 500 },
    );
  }
}
