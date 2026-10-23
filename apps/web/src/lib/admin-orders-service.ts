import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { courses, orderEvents, orderItems, orders, user, vouchers } from "@codi-1/db";
import { studentEnrollments, studentTransactions } from "@codi-1/db/schema/student-profile";
import { createNotificationService } from "./notification-service";

export type AdminOrderSummaryItem = {
  id: number;
  code: string;
  userId: string;
  buyerName: string;
  buyerEmail: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  receivedAmount: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  failReason: string | null;
  needsReconciliation: boolean;
  isBuyNow: boolean;
  voucherCode: string | null;
  coursesText: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  isOverdue: boolean;
};

export type AdminOrderDetail = AdminOrderSummaryItem & {
  items: Array<{
    id: number;
    courseId: string;
    courseTitle: string;
    unitPrice: number;
  }>;
  timeline: Array<{
    id: number;
    label: string;
    createdAt: string;
  }>;
  method: string;
  content: string;
};

export type AdminOrdersFilter = {
  range?: "7" | "30" | "90" | "all";
  status?: "all" | "pending" | "paid" | "failed" | "cancelled" | "refunded";
  q?: string;
  overdueOnly?: boolean;
  reconciliationOnly?: boolean;
};

export function isOrderOverdue(order: { status: string; createdAt: Date | string }): boolean {
  if (order.status !== "pending") return false;
  const created = new Date(order.createdAt).getTime();
  const now = Date.now();
  // 24 hours overdue threshold for admin attention (D1 / mockup)
  return now - created >= 24 * 60 * 60 * 1000;
}

export async function getAdminOrders(
  db: any,
  filter: AdminOrdersFilter = {}
): Promise<{
  orders: AdminOrderSummaryItem[];
  stats: {
    total: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    reconciliationCount: number;
    totalRevenue: number;
  };
}> {
  const range = filter.range || "30";
  const status = filter.status || "all";
  const term = (filter.q || "").trim().toLowerCase();

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const sinceDate =
    range === "all"
      ? null
      : new Date(now - (Number(range) || 30) * DAY_MS);

  // Load all matching orders with user and items
  const conditions: any[] = [];
  if (sinceDate) {
    conditions.push(gte(orders.createdAt, sinceDate));
  }
  if (status !== "all") {
    conditions.push(eq(orders.status, status as any));
  }
  if (filter.reconciliationOnly) {
    conditions.push(eq(orders.needsReconciliation, true));
  }

  const query = db
    .select({
      id: orders.id,
      code: orders.code,
      userId: orders.userId,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      totalAmount: orders.totalAmount,
      receivedAmount: orders.receivedAmount,
      status: orders.status,
      failReason: orders.failReason,
      needsReconciliation: orders.needsReconciliation,
      isBuyNow: orders.isBuyNow,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      cancelledAt: orders.cancelledAt,
      buyerName: user.name,
      buyerEmail: user.email,
      voucherCode: vouchers.code,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id))
    .leftJoin(vouchers, eq(orders.voucherId, vouchers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt));

  const rows = await query;

  // Fetch all order items for the returned orders
  const orderIds = rows.map((r: any) => r.id);
  const itemsByOrderId: Record<number, string[]> = {};

  if (orderIds.length > 0) {
    const items = await db
      .select({
        orderId: orderItems.orderId,
        courseTitle: orderItems.courseTitle,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    for (const item of items) {
      if (!itemsByOrderId[item.orderId]) {
        itemsByOrderId[item.orderId] = [];
      }
      itemsByOrderId[item.orderId].push(item.courseTitle);
    }
  }

  const allItems: AdminOrderSummaryItem[] = rows.map((r: any) => {
    const isOverdue = isOrderOverdue({ status: r.status, createdAt: r.createdAt });
    const courseTitles = itemsByOrderId[r.id] || [];
    return {
      id: r.id,
      code: r.code,
      userId: r.userId,
      buyerName: r.buyerName || "Người dùng",
      buyerEmail: r.buyerEmail || "",
      subtotal: r.subtotal,
      discountAmount: r.discountAmount,
      totalAmount: r.totalAmount,
      receivedAmount: r.receivedAmount,
      status: r.status,
      failReason: r.failReason,
      needsReconciliation: r.needsReconciliation,
      isBuyNow: r.isBuyNow,
      voucherCode: r.voucherCode || null,
      coursesText: courseTitles.join(", ") || "(Chưa có khoá học)",
      createdAt: new Date(r.createdAt).toISOString(),
      paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
      cancelledAt: r.cancelledAt ? new Date(r.cancelledAt).toISOString() : null,
      isOverdue,
    };
  });

  // Client-side / in-memory search and overdue filter
  const filtered = allItems.filter((o) => {
    if (filter.overdueOnly && !o.isOverdue) return false;
    if (term) {
      const matchCode = o.code.toLowerCase().includes(term);
      const matchName = o.buyerName.toLowerCase().includes(term);
      const matchEmail = o.buyerEmail.toLowerCase().includes(term);
      const matchCourses = o.coursesText.toLowerCase().includes(term);
      if (!matchCode && !matchName && !matchEmail && !matchCourses) return false;
    }
    return true;
  });

  const paidOrders = filtered.filter((o) => o.status === "paid");
  const pendingOrders = filtered.filter((o) => o.status === "pending");
  const overdueOrders = filtered.filter((o) => o.isOverdue);
  const reconOrders = filtered.filter((o) => o.needsReconciliation);
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  return {
    orders: filtered,
    stats: {
      total: filtered.length,
      paidCount: paidOrders.length,
      pendingCount: pendingOrders.length,
      overdueCount: overdueOrders.length,
      reconciliationCount: reconOrders.length,
      totalRevenue,
    },
  };
}

export async function getAdminOrderDetail(
  db: any,
  orderIdOrCode: number | string
): Promise<AdminOrderDetail | null> {
  const isNumeric = typeof orderIdOrCode === "number" || /^\d+$/.test(String(orderIdOrCode));
  const whereClause = isNumeric
    ? eq(orders.id, Number(orderIdOrCode))
    : eq(orders.code, String(orderIdOrCode));

  const [r] = await db
    .select({
      id: orders.id,
      code: orders.code,
      userId: orders.userId,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      totalAmount: orders.totalAmount,
      receivedAmount: orders.receivedAmount,
      status: orders.status,
      failReason: orders.failReason,
      needsReconciliation: orders.needsReconciliation,
      isBuyNow: orders.isBuyNow,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      cancelledAt: orders.cancelledAt,
      buyerName: user.name,
      buyerEmail: user.email,
      voucherCode: vouchers.code,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id))
    .leftJoin(vouchers, eq(orders.voucherId, vouchers.id))
    .where(whereClause)
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: orderItems.id,
      courseId: orderItems.courseId,
      courseTitle: orderItems.courseTitle,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, r.id));

  const events = await db
    .select({
      id: orderEvents.id,
      label: orderEvents.label,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, r.id))
    .orderBy(desc(orderEvents.createdAt));

  const isOverdue = isOrderOverdue({ status: r.status, createdAt: r.createdAt });
  const courseTitles = items.map((i: any) => i.courseTitle);

  return {
    id: r.id,
    code: r.code,
    userId: r.userId,
    buyerName: r.buyerName || "Người dùng",
    buyerEmail: r.buyerEmail || "",
    subtotal: r.subtotal,
    discountAmount: r.discountAmount,
    totalAmount: r.totalAmount,
    receivedAmount: r.receivedAmount,
    status: r.status,
    failReason: r.failReason,
    needsReconciliation: r.needsReconciliation,
    isBuyNow: r.isBuyNow,
    voucherCode: r.voucherCode || null,
    coursesText: courseTitles.join(", ") || "(Chưa có khoá học)",
    createdAt: new Date(r.createdAt).toISOString(),
    paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
    cancelledAt: r.cancelledAt ? new Date(r.cancelledAt).toISOString() : null,
    isOverdue,
    items: items.map((i: any) => ({
      id: i.id,
      courseId: i.courseId,
      courseTitle: i.courseTitle,
      unitPrice: i.unitPrice,
    })),
    timeline: events.map((e: any) => ({
      id: e.id,
      label: e.label,
      createdAt: new Date(e.createdAt).toISOString(),
    })),
    method: "Chuyển khoản ngân hàng (VietQR)",
    content: r.code,
  };
}

export async function adminCancelOrder(
  db: any,
  orderId: number,
  adminUserId: string,
  reason?: string
): Promise<{ success: boolean; orderCode: string }> {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    throw new Error("Lý do huỷ đơn hàng là bắt buộc.");
  }

  return await db.transaction(async (tx: any) => {
    // 1. Atomically UPDATE order only if status is currently 'pending'
    const failReason = `Quản trị viên huỷ: ${trimmedReason}`;
    const now = new Date();

    const updatedOrders = await tx
      .update(orders)
      .set({
        status: "cancelled",
        failReason,
        cancelledAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ id: orders.id, code: orders.code, userId: orders.userId });

    if (!updatedOrders || updatedOrders.length === 0) {
      // Check whether order exists or already in another terminal state
      const [existing] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!existing) {
        throw new Error("Không tìm thấy đơn hàng.");
      }
      throw new Error(`Chỉ có thể huỷ đơn đang chờ thanh toán (trạng thái hiện tại: ${existing.status}).`);
    }

    const order = updatedOrders[0];

    // 2. Atomically synchronize legacy studentTransactions record if it exists and is pending
    await tx
      .update(studentTransactions)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(studentTransactions.id, order.code),
          eq(studentTransactions.status, "pending")
        )
      );

    // 3. Record order audit event
    await tx.insert(orderEvents).values({
      orderId,
      label: `Quản trị viên huỷ đơn (${trimmedReason})`,
      actorId: adminUserId,
    });

    // 4. Notify learner
    try {
      const notificationService = createNotificationService(tx);
      await notificationService.notify(
        order.userId,
        `Đơn hàng ${order.code} đã bị huỷ`,
        `Đơn hàng ${order.code} đã được quản trị viên huỷ. Lý do: ${trimmedReason}`,
        "/dashboard/learner"
      );
    } catch {
      // Best-effort notification
    }

    return { success: true, orderCode: order.code };
  });
}
