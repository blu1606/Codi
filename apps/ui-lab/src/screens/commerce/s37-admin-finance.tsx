import type { ReactNode } from "react";
import Link from "../../shims/next-link";
import { http, delay } from "msw";
import { AdminFinanceView } from "@/app/dashboard/admin/finance/admin-finance-view";
import { FINANCE_UNAVAILABLE } from "@/lib/analytics-contract";
import { adminFinanceFixture } from "@/demo-fixtures/commerce/s37-admin-finance";
import { jsonBody } from "./lab-support";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

/** Mirrors app/dashboard/admin/finance/[card]/page.tsx (the stub detail page). */
function FinanceDetailStub() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Chi tiết chưa khả dụng</h1>
      <p role="status">{FINANCE_UNAVAILABLE}</p>
      <Link className="text-primary underline" href="/dashboard/admin/finance">Về tổng quan</Link>
    </main>
  );
}

const frame = (children: ReactNode) => (
  <div className="mx-auto max-w-6xl p-4 sm:p-6">
    {children}
  </div>
);

const overview = (body: unknown) => http.get("/api/admin/finance/overview", () => jsonBody(body));
const route = { pathname: "/dashboard/admin/finance" };
const page = () => frame(<AdminFinanceView />);

export const adminFinanceScreen: Screen = {
  id: "S37",
  title: "Tài chính",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/finance",
  states: {
    default: { label: "Có dữ liệu", route, handlers: [overview(adminFinanceFixture("30")), ...fixtureHandlers], render: page },
    loading: {
      label: "Đang tải",
      route,
      handlers: [http.get("/api/admin/finance/overview", async () => { await delay("infinite"); return jsonBody({}); }), ...fixtureHandlers],
      render: page,
    },
    "no-data": { label: "Không có đơn trong kỳ", route, handlers: [overview(adminFinanceFixture("30", true)), ...fixtureHandlers], render: page },
    error: {
      label: "Lỗi tải",
      route,
      handlers: [http.get("/api/admin/finance/overview", () => jsonBody({ error: "Lỗi" }, { status: 500 })), ...fixtureHandlers],
      render: page,
    },
    card: { label: "Chi tiết thẻ", route: { pathname: "/dashboard/admin/finance/revenue" }, handlers: fixtureHandlers, render: () => <FinanceDetailStub /> },
  },
};
