import type { AdminOrderDetail, AdminOrderSummaryItem } from "@/lib/admin-orders-service";
import ordersSnapshot from "../snapshot/admin-orders.json";
import orderDetailSnapshot from "../snapshot/admin-order-detail.json";

/** Seed-buyer orders and stats for S34, written by `pnpm demo:snapshot`. */
export const adminOrderRows = ordersSnapshot.orders as unknown as AdminOrderSummaryItem[];
export const adminOrderStats = ordersSnapshot.stats;

/** Detail of the first seed-buyer order in the snapshot. */
export const adminOrderDetail = orderDetailSnapshot as unknown as AdminOrderDetail;

export const adminOrdersEmpty = { orders: [] as AdminOrderSummaryItem[], stats: { total: 0, paidCount: 0, pendingCount: 0, overdueCount: 0, reconciliationCount: 0, totalRevenue: 0 } };
