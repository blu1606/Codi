import "server-only";
import { and, eq, gte, lt, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { courses, orderItems, orders, vouchers, type Database } from "@codi-1/db";
import { analyticsWindow, type AnalyticsWindow, type FinanceData } from "./analytics-contract";
import {
  courseRevenue,
  itemRevenue,
  orderRevenue,
  paymentTime,
  previousWindowOf,
  reconciliation,
  statusDistribution,
  voucherUsage,
  type ItemFact,
  type OrderFact,
  type OrderStatus,
} from "./analytics-formulas";
import type { LecturerInsightsDto } from "./lecturer-insights-service";

// Read-only revenue aggregates shared by admin S37 and lecturer S29b. Formulas live in analytics-formulas.ts.

const span = (column: AnyPgColumn, window: Pick<AnalyticsWindow, "start" | "end">): SQL =>
  and(gte(column, new Date(window.start)), lt(column, new Date(window.end)))!;

/** Orders that could belong to the window (created, paid, or refunded inside it) plus any open ones when asked. */
async function loadOrderFacts(db: Database, where: SQL | undefined): Promise<OrderFact[]> {
  const rows = await db.select({
    id: orders.id,
    code: orders.code,
    status: orders.status,
    subtotal: orders.subtotal,
    discountAmount: orders.discountAmount,
    totalAmount: orders.totalAmount,
    receivedAmount: orders.receivedAmount,
    failReason: orders.failReason,
    needsReconciliation: orders.needsReconciliation,
    voucherCode: vouchers.code,
    createdAt: orders.createdAt,
    paidAt: orders.paidAt,
    updatedAt: orders.updatedAt,
  }).from(orders).leftJoin(vouchers, eq(orders.voucherId, vouchers.id)).where(where);
  return rows.map((row) => ({ ...row, status: row.status as OrderStatus }));
}

function orderWindowFilter(window: Pick<AnalyticsWindow, "start" | "end">) {
  return or(span(orders.createdAt, window), span(orders.paidAt, window), span(orders.updatedAt, window));
}

/** Line-level facts for orders touching the window, optionally limited to one lecturer's courses. */
async function loadItemFacts(db: Database, window: Pick<AnalyticsWindow, "start" | "end">, instructorId?: string): Promise<ItemFact[]> {
  const rows = await db.select({
    orderId: orders.id,
    status: orders.status,
    paidAt: orders.paidAt,
    updatedAt: orders.updatedAt,
    subtotal: orders.subtotal,
    discountAmount: orders.discountAmount,
    courseId: orderItems.courseId,
    courseTitle: orderItems.courseTitle,
    unitPrice: orderItems.unitPrice,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(courses, eq(orderItems.courseId, courses.id))
    .where(and(
      instructorId ? eq(courses.instructorId, instructorId) : undefined,
      or(span(orders.paidAt, window), span(orders.updatedAt, window)),
    ));
  return rows.map((row) => ({ ...row, status: row.status as OrderStatus }));
}

export async function getAdminFinanceOverview(db: Database, period: string, now = new Date()): Promise<FinanceData> {
  const window = analyticsWindow(period, now);
  const previousWindow = previousWindowOf(window);
  const wide = { start: previousWindow.start, end: window.end };
  const [orderRows, openRows, items] = await Promise.all([
    loadOrderFacts(db, orderWindowFilter(wide)),
    loadOrderFacts(db, or(eq(orders.status, "pending"), eq(orders.needsReconciliation, true))),
    loadItemFacts(db, wide),
  ]);
  const current = orderRevenue(window, orderRows);
  const previous = orderRevenue(previousWindow, orderRows);
  const payments = paymentTime(window, orderRows);
  const reconcile = reconciliation(openRows, now);
  return {
    window,
    previousWindow,
    totals: current.totals,
    previousTotals: previous.totals,
    daily: current.daily,
    previousDaily: previous.daily,
    statusDistribution: statusDistribution(window, orderRows),
    courses: courseRevenue(window, items),
    paymentTime: payments,
    vouchers: voucherUsage(window, orderRows),
    reconciliation: { underpaid: reconcile.underpaid, stalePending: reconcile.stalePending, flagged: reconcile.flagged, items: reconcile.items },
  };
}

/** S29b: revenue of the lecturer's own courses only. The instructor filter is applied in SQL, never trusted from the client. */
export async function getLecturerInsights(db: Database, instructorId: string, period: string, now = new Date()): Promise<LecturerInsightsDto> {
  if (!instructorId.trim()) throw new Error("Lecturer identity required");
  const ownCourses = await db.select({ status: courses.status }).from(courses).where(eq(courses.instructorId, instructorId));
  if (!ownCourses.length) return { state: "no-courses" };
  if (!ownCourses.some((c) => c.status === "published" || c.status === "hidden")) return { state: "no-published" };

  const window = analyticsWindow(period, now);
  const previousWindow = previousWindowOf(window);
  const items = await loadItemFacts(db, { start: previousWindow.start, end: window.end }, instructorId);
  const current = itemRevenue(window, items);
  const previous = itemRevenue(previousWindow, items);
  return {
    state: "ready",
    window,
    previousWindow,
    totals: current.totals,
    previousTotals: previous.totals,
    daily: current.daily,
    previousDaily: previous.daily,
    courses: courseRevenue(window, items),
  };
}
