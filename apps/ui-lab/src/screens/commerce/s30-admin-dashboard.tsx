import { AdminDashboardView } from "@/app/dashboard/admin/admin-dashboard-view";
import { adminDashboardData, adminDashboardEmpty } from "@/demo-fixtures/commerce/s30-admin-dashboard";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

export const adminDashboardScreen: Screen = {
  id: "S30",
  title: "Tổng quan quản trị",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin",
  states: {
    default: { label: "Có dữ liệu", route: { pathname: "/dashboard/admin" }, handlers: fixtureHandlers, render: () => <AdminDashboardView data={adminDashboardData} /> },
    empty: { label: "Chưa có dữ liệu", route: { pathname: "/dashboard/admin" }, handlers: fixtureHandlers, render: () => <AdminDashboardView data={adminDashboardEmpty} /> },
  },
};
