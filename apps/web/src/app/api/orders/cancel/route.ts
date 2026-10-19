import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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
      let orderCancelledCount = 0;

      if (orderId) {
        const res = await tx
          .update(orders)
          .set({
            status: "cancelled",
            failReason: "Người mua đã huỷ",
            cancelledAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, Number(orderId)),
              eq(orders.userId, session.user.id),
              eq(orders.status, "pending"),
            ),
          )
          .returning({ id: orders.id, code: orders.code });
        if (res.length > 0) {
          orderCancelledCount += res.length;
          const targetOrderId = res[0].id;
          const items = await tx
            .select({ courseId: orderItems.courseId })
            .from(orderItems)
            .where(eq(orderItems.orderId, targetOrderId));

          for (const item of items) {
            await tx
              .insert(studentCart)
              .values({
                userId: session.user.id,
                courseId: item.courseId,
              })
              .onConflictDoNothing();
          }

          if (res[0]?.code) {
            await tx
              .update(studentTransactions)
              .set({ status: "cancelled" })
              .where(
                and(
                  eq(studentTransactions.id, res[0].code),
                  eq(studentTransactions.userId, session.user.id),
                  eq(studentTransactions.status, "pending"),
                ),
              );
          }
        }
      } else if (orderCode) {
        const res = await tx
          .update(orders)
          .set({
            status: "cancelled",
            failReason: "Người mua đã huỷ",
            cancelledAt: new Date(),
          })
          .where(
            and(
              eq(orders.code, String(orderCode)),
              eq(orders.userId, session.user.id),
              eq(orders.status, "pending"),
            ),
          )
          .returning({ id: orders.id, code: orders.code });

        if (res.length > 0) {
          orderCancelledCount += res.length;
          const targetOrderId = res[0].id;
          const items = await tx
            .select({ courseId: orderItems.courseId })
            .from(orderItems)
            .where(eq(orderItems.orderId, targetOrderId));

          for (const item of items) {
            await tx
              .insert(studentCart)
              .values({
                userId: session.user.id,
                courseId: item.courseId,
              })
              .onConflictDoNothing();
          }
        }

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
        orderCancelledCount += txRes.length;
      }

      return orderCancelledCount > 0;
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
