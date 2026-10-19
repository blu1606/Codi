import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { auth, db } from "@/services";
import { orders } from "@codi-1/db";

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

    const [order] = await db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        failReason: orders.failReason,
        receivedAmount: orders.receivedAmount,
        totalAmount: orders.totalAmount,
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

    if (!order) {
      return NextResponse.json(
        { error: "Không tìm thấy đơn hàng" },
        { status: 404 },
      );
    }

    // Check expiry
    if (order.status === "pending" && order.paymentDeadline && new Date(order.paymentDeadline) <= new Date()) {
      const isUnderpaid = order.receivedAmount > 0;
      await db
        .update(orders)
        .set({
          status: "failed",
          failReason: "expired",
          needsReconciliation: isUnderpaid ? true : undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));

      order.status = "failed";
      order.failReason = "expired";
    }

    return NextResponse.json({
      status: order.status,
      failReason: order.failReason,
      receivedAmount: order.receivedAmount,
      totalAmount: order.totalAmount,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Manual check error:", error);
    return NextResponse.json(
      { error: "Không thể kiểm tra giao dịch" },
      { status: 500 },
    );
  }
}
