// Pure revenue and count formulas for S36/S37/S29b. No database access here; the services load rows
// and these functions turn them into the numbers the screens show.
import type {
  AdminDayRow,
  AnalyticsWindow,
  CourseRevenueRow,
  OrderStatusBucket,
  ReconciliationItem,
  RevenueDayRow,
  RevenueTotals,
} from "./analytics-contract";

const DAY_MS = 86_400_000;
const GMT7_MS = 7 * 3_600_000;
const STALE_PENDING_MS = DAY_MS;
const RECONCILIATION_LIMIT = 50;

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

/** One order row as the revenue formulas need it. */
export interface OrderFact {
  id: number;
  code: string;
  status: OrderStatus;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  receivedAmount: number;
  failReason: string | null;
  needsReconciliation: boolean;
  voucherCode: string | null;
  createdAt: Date;
  paidAt: Date | null;
  updatedAt: Date;
}

/** One order line (course) as the per-course formulas need it. */
export interface ItemFact {
  orderId: number;
  status: OrderStatus;
  paidAt: Date | null;
  updatedAt: Date;
  subtotal: number;
  discountAmount: number;
  courseId: string;
  courseTitle: string;
  unitPrice: number;
}

/** GMT+7 calendar day of an instant, e.g. "2026-10-23". */
export function gmt7DayKey(instant: Date | string | number): string {
  return new Date(new Date(instant).getTime() + GMT7_MS).toISOString().slice(0, 10);
}

/** Every GMT+7 day key inside the window, oldest first. */
export function windowDayKeys(window: Pick<AnalyticsWindow, "start" | "end">): string[] {
  const keys: string[] = [];
  const end = Date.parse(window.end);
  for (let t = Date.parse(window.start); t < end; t += DAY_MS) keys.push(gmt7DayKey(t));
  return keys;
}

/** The window of the same length immediately before `window`. Windows start at GMT+7 midnight, so no DST drift. */
export function previousWindowOf(window: AnalyticsWindow): AnalyticsWindow {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  return { ...window, start: new Date(start - (end - start)).toISOString(), end: window.start };
}

export function inWindow(instant: Date | null, window: Pick<AnalyticsWindow, "start" | "end">): instant is Date {
  if (!instant) return false;
  const t = instant.getTime();
  return t >= Date.parse(window.start) && t < Date.parse(window.end);
}

/** A row counts as revenue once it has been paid; refunded orders stay revenue in the period they were paid. */
export function isRevenueStatus(status: OrderStatus, paidAt: Date | null): boolean {
  return (status === "paid" || status === "refunded") && paidAt !== null;
}

/** Counts a learner-visible day row from timestamp lists, bucketed by GMT+7 day. */
export function countByDay(keys: string[], instants: Date[]): number[] {
  const index = new Map(keys.map((key, i) => [key, i]));
  const counts = keys.map(() => 0);
  for (const instant of instants) {
    const i = index.get(gmt7DayKey(instant));
    if (i !== undefined) counts[i] += 1;
  }
  return counts;
}

/** Joins per-day series into the admin S36 daily rows. `activeDays` holds per-learner study-day keys. */
export function adminDayRows(
  window: AnalyticsWindow,
  series: { signups: Date[]; newEnrolments: Date[]; lessonsCompleted: Date[]; activeDays: string[] },
): AdminDayRow[] {
  const keys = windowDayKeys(window);
  const signups = countByDay(keys, series.signups);
  const newEnrolments = countByDay(keys, series.newEnrolments);
  const lessonsCompleted = countByDay(keys, series.lessonsCompleted);
  const active = new Map<string, number>();
  for (const day of series.activeDays) active.set(day, (active.get(day) ?? 0) + 1);
  return keys.map((date, i) => ({
    date,
    signups: signups[i]!,
    newEnrolments: newEnrolments[i]!,
    lessonsCompleted: lessonsCompleted[i]!,
    activeLearners: active.get(date) ?? 0,
  }));
}

export function adminTotals(days: AdminDayRow[]) {
  const sum = (pick: (d: AdminDayRow) => number) => days.reduce((s, d) => s + pick(d), 0);
  return {
    signups: sum((d) => d.signups),
    newEnrolments: sum((d) => d.newEnrolments),
    lessonsCompleted: sum((d) => d.lessonsCompleted),
    activeLearnersAvg: days.length ? Math.round(sum((d) => d.activeLearners) / days.length) : 0,
  };
}

/** Totals and daily rows from order-level facts (admin finance). */
export function orderRevenue(window: AnalyticsWindow, orders: OrderFact[]) {
  const totals: RevenueTotals = { gross: 0, discount: 0, net: 0, paidOrders: 0, averageOrderValue: 0, refunds: 0, refundCount: 0 };
  const daily = new Map<string, RevenueDayRow>(windowDayKeys(window).map((date) => [date, { date, gross: 0, discount: 0, net: 0, refunds: 0 }]));
  for (const o of orders) {
    if (isRevenueStatus(o.status, o.paidAt) && inWindow(o.paidAt, window)) {
      totals.gross += o.subtotal;
      totals.discount += o.discountAmount;
      totals.net += o.totalAmount;
      totals.paidOrders += 1;
      const row = daily.get(gmt7DayKey(o.paidAt!));
      if (row) { row.gross += o.subtotal; row.discount += o.discountAmount; row.net += o.totalAmount; }
    }
    if (o.status === "refunded" && inWindow(o.updatedAt, window)) {
      totals.refunds += o.totalAmount;
      totals.refundCount += 1;
      const row = daily.get(gmt7DayKey(o.updatedAt));
      if (row) row.refunds += o.totalAmount;
    }
  }
  totals.averageOrderValue = totals.paidOrders ? Math.round(totals.net / totals.paidOrders) : 0;
  return { totals, daily: [...daily.values()] };
}

/** Order-status buckets for orders created in the window (S37 B4). Underpaid is not a status: pending with partial receipt. */
export function orderBucket(o: OrderFact): OrderStatusBucket {
  switch (o.status) {
    case "paid": return "paid";
    case "refunded": return "refunded";
    case "cancelled": return "cancelled";
    case "failed": return o.failReason === "expired" ? "expired" : "failed";
    default: return o.receivedAmount > 0 && o.receivedAmount < o.totalAmount ? "underpaid" : "awaiting";
  }
}

export const STATUS_ORDER: OrderStatusBucket[] = ["paid", "awaiting", "underpaid", "expired", "failed", "cancelled", "refunded"];

export function statusDistribution(window: AnalyticsWindow, orders: OrderFact[]) {
  const counts = new Map<OrderStatusBucket, { orders: number; amount: number }>(STATUS_ORDER.map((b) => [b, { orders: 0, amount: 0 }]));
  for (const o of orders) {
    if (!inWindow(o.createdAt, window)) continue;
    const bucket = counts.get(orderBucket(o))!;
    bucket.orders += 1;
    bucket.amount += o.totalAmount;
  }
  return STATUS_ORDER.map((bucket) => ({ bucket, ...counts.get(bucket)! }));
}

const PAYMENT_BUCKETS = [
  { label: "< 1 phút", maxMinutes: 1 },
  { label: "1–5 phút", maxMinutes: 5 },
  { label: "5–15 phút", maxMinutes: 15 },
  { label: "15–30 phút", maxMinutes: 30 },
  { label: "Sau 30 phút", maxMinutes: Number.POSITIVE_INFINITY },
];

/** Time from order creation to payment for orders paid in the window; the median is the bucket holding the middle order. */
export function paymentTime(window: AnalyticsWindow, orders: OrderFact[]) {
  const buckets = PAYMENT_BUCKETS.map((b) => ({ label: b.label, orders: 0 }));
  for (const o of orders) {
    if (!isRevenueStatus(o.status, o.paidAt) || !inWindow(o.paidAt, window)) continue;
    const minutes = (o.paidAt!.getTime() - o.createdAt.getTime()) / 60_000;
    const i = PAYMENT_BUCKETS.findIndex((b) => minutes < b.maxMinutes);
    buckets[i === -1 ? buckets.length - 1 : i]!.orders += 1;
  }
  const total = buckets.reduce((s, b) => s + b.orders, 0);
  let seen = 0;
  const median = buckets.find((b) => {
    seen += b.orders;
    return total > 0 && seen * 2 >= total;
  });
  return { buckets, medianLabel: median ? median.label : null };
}

/** Per-voucher usage for revenue orders paid in the window (S37 B7). */
export function voucherUsage(window: AnalyticsWindow, orders: OrderFact[]) {
  const byCode = new Map<string, { code: string; orders: number; discount: number; net: number }>();
  for (const o of orders) {
    if (!o.voucherCode || !isRevenueStatus(o.status, o.paidAt) || !inWindow(o.paidAt, window)) continue;
    const row = byCode.get(o.voucherCode) ?? { code: o.voucherCode, orders: 0, discount: 0, net: 0 };
    row.orders += 1;
    row.discount += o.discountAmount;
    row.net += o.totalAmount;
    byCode.set(o.voucherCode, row);
  }
  return [...byCode.values()].sort((a, b) => b.net - a.net);
}

/**
 * Orders that need manual follow-up, independent of the period: underpaid pending orders, pending orders
 * older than 24 hours, and orders flagged for reconciliation (overpaid, late, or expired while underpaid).
 */
export function reconciliation(orders: OrderFact[], now: Date) {
  const items: ReconciliationItem[] = [];
  let underpaid = 0;
  let stalePending = 0;
  let flagged = 0;
  for (const o of orders) {
    const reasons: ReconciliationItem["reasons"] = [];
    if (o.status === "pending" && o.receivedAmount > 0 && o.receivedAmount < o.totalAmount) { reasons.push("underpaid"); underpaid += 1; }
    if (o.status === "pending" && now.getTime() - o.createdAt.getTime() > STALE_PENDING_MS) { reasons.push("stale"); stalePending += 1; }
    if (o.needsReconciliation) { reasons.push("flagged"); flagged += 1; }
    if (reasons.length) {
      items.push({
        code: o.code, status: o.status, totalAmount: o.totalAmount, receivedAmount: o.receivedAmount,
        createdAt: o.createdAt.toISOString(), reasons,
      });
    }
  }
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { underpaid, stalePending, flagged, items: items.slice(0, RECONCILIATION_LIMIT) };
}

/** Line-level discount share: the order's discount split in proportion to the line's subtotal share. */
function lineDiscount(item: Pick<ItemFact, "unitPrice" | "subtotal" | "discountAmount">): number {
  return item.subtotal > 0 ? Math.round((item.unitPrice * item.discountAmount) / item.subtotal) : 0;
}

/** Per-course revenue (admin S37 B3 and lecturer S29b). Line discounts are allocated pro rata, so course sums can differ from order totals by a few dong. */
export function courseRevenue(window: AnalyticsWindow, items: ItemFact[]): CourseRevenueRow[] {
  const rows = new Map<string, CourseRevenueRow & { orderIds: Set<number> }>();
  const rowFor = (item: ItemFact) => {
    const row = rows.get(item.courseId) ?? { courseId: item.courseId, title: item.courseTitle, gross: 0, discount: 0, net: 0, refunds: 0, paidOrders: 0, orderIds: new Set<number>() };
    rows.set(item.courseId, row);
    return row;
  };
  for (const item of items) {
    const discount = lineDiscount(item);
    if (isRevenueStatus(item.status, item.paidAt) && inWindow(item.paidAt, window)) {
      const row = rowFor(item);
      row.gross += item.unitPrice;
      row.discount += discount;
      row.net += item.unitPrice - discount;
      row.orderIds.add(item.orderId);
    }
    if (item.status === "refunded" && inWindow(item.updatedAt, window)) {
      rowFor(item).refunds += item.unitPrice - discount;
    }
  }
  return [...rows.values()]
    .map(({ orderIds, ...row }) => ({ ...row, paidOrders: orderIds.size }))
    .sort((a, b) => b.net - a.net || a.title.localeCompare(b.title));
}

/** Totals and daily rows from line-level facts (lecturer S29b), restricted to whatever lines the caller passed in. */
export function itemRevenue(window: AnalyticsWindow, items: ItemFact[]) {
  const totals: RevenueTotals = { gross: 0, discount: 0, net: 0, paidOrders: 0, averageOrderValue: 0, refunds: 0, refundCount: 0 };
  const daily = new Map<string, RevenueDayRow>(windowDayKeys(window).map((date) => [date, { date, gross: 0, discount: 0, net: 0, refunds: 0 }]));
  const paidOrderIds = new Set<number>();
  const refundedOrderIds = new Set<number>();
  for (const item of items) {
    const discount = lineDiscount(item);
    if (isRevenueStatus(item.status, item.paidAt) && inWindow(item.paidAt, window)) {
      totals.gross += item.unitPrice;
      totals.discount += discount;
      totals.net += item.unitPrice - discount;
      paidOrderIds.add(item.orderId);
      const row = daily.get(gmt7DayKey(item.paidAt!));
      if (row) { row.gross += item.unitPrice; row.discount += discount; row.net += item.unitPrice - discount; }
    }
    if (item.status === "refunded" && inWindow(item.updatedAt, window)) {
      totals.refunds += item.unitPrice - discount;
      refundedOrderIds.add(item.orderId);
      const row = daily.get(gmt7DayKey(item.updatedAt));
      if (row) row.refunds += item.unitPrice - discount;
    }
  }
  totals.paidOrders = paidOrderIds.size;
  totals.refundCount = refundedOrderIds.size;
  totals.averageOrderValue = totals.paidOrders ? Math.round(totals.net / totals.paidOrders) : 0;
  return { totals, daily: [...daily.values()] };
}

/** Funnel for the signup cohort (S36 A3). Counts are cumulative: each step is a subset of the one before only if the caller passes nested flags. */
export function cohortFunnel(cohort: { verified: boolean; purchased: boolean; firstLesson: boolean }[]) {
  return {
    signups: cohort.length,
    verified: cohort.filter((c) => c.verified).length,
    purchased: cohort.filter((c) => c.purchased).length,
    firstLesson: cohort.filter((c) => c.firstLesson).length,
  };
}
