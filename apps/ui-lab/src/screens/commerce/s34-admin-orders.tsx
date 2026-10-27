import { OrdersTableClient } from "@/app/dashboard/admin/orders/orders-table-client";
import { adminOrderDetail, adminOrderRows, adminOrderStats, adminOrdersEmpty } from "@/demo-fixtures/commerce/s34-admin-orders";
import type { Screen } from "../screen-types";
import { Scripted, clickButton, clickRowContaining, fixtureHandlers } from "./lab-support";

const route = { pathname: "/dashboard/admin/orders" };
const base = { range: "30", status: "all", q: "", overdue: false, reconciliation: false };
const actions = { getAdminOrderDetailAction: { ok: adminOrderDetail }, getAdminOrdersExportAction: { ok: adminOrderRows } };

export const adminOrdersScreen: Screen = {
  id: "S34",
  title: "Đơn hàng & giao dịch",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/orders",
  states: {
    default: { label: "Bảng giao dịch", route, actions, handlers: fixtureHandlers, render: () => <OrdersTableClient orders={adminOrderRows} stats={adminOrderStats} initialFilter={base} /> },
    empty: { label: "Không có đơn", route, actions, handlers: fixtureHandlers, render: () => <OrdersTableClient orders={adminOrdersEmpty.orders} stats={adminOrdersEmpty.stats} initialFilter={base} /> },
    overdue: { label: "Quá hạn", route: { pathname: "/dashboard/admin/orders", search: { overdue: "1" } }, actions, handlers: fixtureHandlers, render: () => <OrdersTableClient orders={adminOrderRows.filter((o) => o.isOverdue)} stats={adminOrderStats} initialFilter={{ ...base, overdue: true }} /> },
    drawer: {
      label: "Chi tiết giao dịch",
      route, actions, handlers: fixtureHandlers,
      render: () => <Scripted script={() => clickRowContaining("CODI20261026-0052")}><OrdersTableClient orders={adminOrderRows} stats={adminOrderStats} initialFilter={base} /></Scripted>,
    },
    export: {
      label: "Xuất CSV",
      route, actions, handlers: fixtureHandlers,
      render: () => <Scripted script={() => clickButton("Xuất CSV")}><OrdersTableClient orders={adminOrderRows} stats={adminOrderStats} initialFilter={base} /></Scripted>,
    },
  },
};
