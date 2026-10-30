// @vitest-environment happy-dom
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatVnd } from "@codi-1/ui/components/charts";
import { AdminInsightsView } from "../../app/dashboard/admin/insights/admin-insights-view";
import { AdminFinanceView } from "../../app/dashboard/admin/finance/admin-finance-view";
import { adminInsightsFixture } from "@/demo-fixtures/commerce/s36-admin-insights";
import { adminFinanceFixture } from "@/demo-fixtures/commerce/s37-admin-finance";

let container: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
const ok = (data: unknown) => ({ ok: true, json: async () => data });
const failed = { ok: false, json: async () => ({ error: "x" }) };
const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("S36 admin insights view", () => {
  it("shows loading cards first, then the real overview numbers from the overview endpoint", async () => {
    fetcher.mockImplementation(() => never());
    await act(async () => root.render(h(AdminInsightsView)));
    expect(container.textContent).toContain("Đang tải…");
    expect(fetcher).toHaveBeenCalledWith("/api/admin/insights/overview?period=30", expect.objectContaining({ cache: "no-store" }));

    const fixture = adminInsightsFixture("30");
    fetcher.mockResolvedValue(ok(fixture));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(h(AdminInsightsView)));
    expect(container.textContent).toContain("Chỉ số chính");
    expect(container.textContent).toContain("Phễu kích hoạt");
    expect(container.textContent).toContain(String(fixture.totals.signups));
    expect(container.textContent).not.toContain("Đang tải…");
  });

  it("keeps the metrics without a source as unavailable, never as zero", async () => {
    fetcher.mockResolvedValue(ok(adminInsightsFixture("30")));
    await act(async () => root.render(h(AdminInsightsView)));
    const expand = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Xem chi tiết"))!;
    await act(async () => expand.click());
    expect(container.textContent).toContain("Chưa có số liệu giữ chân theo tuần");
    expect(container.textContent).toContain("Chưa có số liệu: hệ thống chưa ghi nhận");
    expect(container.textContent).toContain("Chưa có số liệu độ trễ p95");
  });

  it("explains a period with no activity instead of drawing empty charts silently", async () => {
    fetcher.mockResolvedValue(ok(adminInsightsFixture("30", true)));
    await act(async () => root.render(h(AdminInsightsView)));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Không có hoạt động nào được ghi nhận trong kỳ này.");
  });

  it("reports a failed load with a retry that refetches the same period", async () => {
    fetcher.mockResolvedValueOnce(failed);
    await act(async () => root.render(h(AdminInsightsView)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Không tải được thống kê.");

    fetcher.mockResolvedValue(ok(adminInsightsFixture("30")));
    await act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Chỉ số chính");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith("/api/admin/insights/overview?period=30", expect.anything());
  });
});

describe("S37 admin finance view", () => {
  it("shows gross, net and reconciliation from the finance overview, with VND formatting", async () => {
    const fixture = adminFinanceFixture("30");
    fetcher.mockResolvedValue(ok(fixture));
    await act(async () => root.render(h(AdminFinanceView)));
    expect(fetcher).toHaveBeenCalledWith("/api/admin/finance/overview?period=30", expect.anything());
    expect(container.textContent).toContain("Doanh thu gộp");
    expect(container.textContent).toContain(formatVnd(fixture.totals.gross));
    expect(container.textContent).toContain(formatVnd(fixture.totals.net));
    expect(container.textContent).toContain("CODI10342");
  });

  it("states that a period with no paid orders has nothing to reconcile, and links to no order drill-down", async () => {
    fetcher.mockResolvedValue(ok(adminFinanceFixture("30", true)));
    await act(async () => root.render(h(AdminFinanceView)));
    expect(container.textContent).toContain("Không có đơn hàng nào được thanh toán trong kỳ này.");
    expect(container.textContent).toContain("Không có đơn cần đối soát.");
    expect(container.querySelectorAll('a[href*="/dashboard/admin/orders"]')).toHaveLength(0);
    expect(container.textContent).toContain("Chưa có số liệu: hệ thống chưa lưu lịch sử thêm giỏ hàng");
  });

  it("reports a failed load with a retry", async () => {
    fetcher.mockResolvedValueOnce(failed);
    await act(async () => root.render(h(AdminFinanceView)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Không tải được số liệu tài chính.");
  });
});
