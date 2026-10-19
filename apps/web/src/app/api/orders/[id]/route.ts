import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { auth, db } from "@/services";
import { orders, orderItems, vouchers } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { getSepayConfig } from "@/lib/sepay-config";

export async function GET(
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

    // Query order for this user
    const [order] = await db
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
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        cancelledAt: orders.cancelledAt,
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

    // Auto-expire check: if status is pending and paymentDeadline has passed, mark as failed
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

    // Sepay config for receiver info — fail closed if configuration is missing for pending orders
    const config = getSepayConfig();
    if (order.status === "pending" && !config) {
      return NextResponse.json(
        { error: "Thanh toán tạm thời chưa khả dụng do thiếu cấu hình cổng thanh toán." },
        { status: 503 },
      );
    }

    // Fetch items with course metadata (slug, title, lecturerId)
    const items = await db
      .select({
        id: orderItems.id,
        courseId: orderItems.courseId,
        courseTitle: orderItems.courseTitle,
        unitPrice: orderItems.unitPrice,
        courseSlug: courses.slug,
      })
      .from(orderItems)
      .leftJoin(courses, eq(courses.id, orderItems.courseId))
      .where(eq(orderItems.orderId, order.id));

    // Fetch voucher code if applied
    let voucherCode: string | null = null;
    if (order.voucherId) {
      const [v] = await db
        .select({ code: vouchers.code })
        .from(vouchers)
        .where(eq(vouchers.id, order.voucherId))
        .limit(1);
      if (v) voucherCode = v.code;
    }

    const bank = config
      ? {
          bank: config.receiver.bankCode,
          accountNumber: config.receiver.accountNumber,
          accountName: "CONG TY CODI EDU",
        }
      : null;

    return NextResponse.json({
      order: {
        id: order.id,
        code: order.code,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        receivedAmount: order.receivedAmount,
        status: order.status,
        failReason: order.failReason,
        isBuyNow: order.isBuyNow,
        paymentDeadline: order.paymentDeadline,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        cancelledAt: order.cancelledAt,
        voucherCode,
        items: items.map((it) => ({
          courseId: it.courseId,
          title: it.courseTitle,
          price: it.unitPrice,
          slug: it.courseSlug || it.courseId,
        })),
      },
      bank,
    });
  } catch (error) {
    console.error("Get order details error:", error);
    return NextResponse.json(
      { error: "Không thể lấy thông tin đơn hàng" },
      { status: 500 },
    );
  }
}
