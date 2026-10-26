import { jsonBody } from "./lab-support";
import type { ReactNode } from "react";
import Link from "../../shims/next-link";
import { http, delay } from "msw";
import { AdminInsightsView } from "@/app/dashboard/admin/insights/admin-insights-view";
import { ANALYTICS_UNAVAILABLE } from "@/lib/analytics-contract";
import { adminInsightsFixture } from "@/demo-fixtures/commerce/s36-admin-insights";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

const frame = (children: ReactNode) => (
  <div className="mx-auto max-w-6xl p-4 sm:p-6">
    {children}
  </div>
);

/** Mirrors app/dashboard/admin/insights/[card]/page.tsx (the stub detail page). */
export function InsightDetailStub() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Chi tiết chưa khả dụng</h1>
      <p role="status">{ANALYTICS_UNAVAILABLE}</p>
      <Link className="text-primary underline" href="/dashboard/admin/insights">Về tổng quan</Link>
    </main>
  );
}

const overview = (body: unknown) => http.get("/api/admin/insights/overview", () => jsonBody(body));
const route = { pathname: "/dashboard/admin/insights" };
const page = () => frame(<AdminInsightsView />);

export const adminInsightsScreen: Screen = {
  id: "S36",
  title: "Quan sát hệ thống",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/insights",
  states: {
    default: { label: "Có dữ liệu", route, handlers: [overview(adminInsightsFixture("30")), ...fixtureHandlers], mockupScenario: {}, render: page },
    loading: {
      label: "Đang tải",
      route,
      handlers: [http.get("/api/admin/insights/overview", async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: page,
    },
    "no-data": { label: "Không có dữ liệu trong kỳ", route, handlers: [overview(adminInsightsFixture("30", true)), ...fixtureHandlers], render: page },
    error: {
      label: "Lỗi tải",
      route,
      handlers: [http.get("/api/admin/insights/overview", () => jsonBody({ error: "Lỗi" }, { status: 500 })), ...fixtureHandlers],
      render: page,
    },
    card: { label: "Chi tiết thẻ", route: { pathname: "/dashboard/admin/insights/users" }, handlers: fixtureHandlers, render: () => <InsightDetailStub /> },
  },
};
