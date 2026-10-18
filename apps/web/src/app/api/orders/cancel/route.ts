import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth, db } from "@/services";
import { orders } from "@codi-1/db";
import { studentTransactions } from "@codi-1/db/schema/student-profile";

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

    // Cancel in orders table
    if (orderId) {
      await db
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
        );
    }

    if (orderCode) {
      await db
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
        );

      // Also cancel in studentTransactions if matched
      await db
        .update(studentTransactions)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(studentTransactions.id, String(orderCode)),
            eq(studentTransactions.userId, session.user.id),
            eq(studentTransactions.status, "pending"),
          ),
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
