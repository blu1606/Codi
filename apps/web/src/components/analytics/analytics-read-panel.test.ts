// @vitest-environment happy-dom
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInsightsView } from "../../app/dashboard/admin/insights/admin-insights-view";
import { LearnerStatsView } from "../../app/insights/stats/learner-stats-view";
import { AdminFinanceView } from "../../app/dashboard/admin/finance/admin-finance-view";
const window = { start: "2026-10-16T17:00:00.000Z", end: "2026-10-23T17:00:00.000Z", timeZone: "Asia/Ho_Chi_Minh", period: "7" };
let container: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const ok = (data: unknown) => ({ ok: true, json: async () => data });
describe("analytics client states (controlled HTTP doubles)", () => {
  it("loads independent cards, preserves successful counts and retries failure", async () => {
    let resolveUsers!: (value: unknown) => void;
    fetcher.mockImplementation((url: string) => {
      if (url.includes("users")) return new Promise((resolve) => { resolveUsers = resolve; });
      if (url.includes("courses")) return Promise.resolve(ok({ value: 0, window }));
      return Promise.resolve({ ok: false });
    });
    await act(async () => root.render(h(AdminInsightsView)));
    expect(container.textContent).toContain("Đang tải thống kê");
    expect(container.textContent).toContain("Không có bản ghi");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => resolveUsers(ok({ value: 12, window })));
    expect(container.textContent).toContain("12");
    expect(fetcher).toHaveBeenCalledWith("/api/admin/insights/users?period=30", expect.objectContaining({ cache: "no-store" }));
    fetcher.mockResolvedValue(ok({ value: 9, window }));
    await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("9");
    expect(container.textContent).toContain("12");
  });
  it("uses learner response and course/period request, distinguishes unavailable from empty", async () => {
    fetcher.mockResolvedValue(ok({ enrollments: 0, completedLessons: 0, studiedLessons: 0, studyMinutes: null, window }));
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "7", initialCourse: "c/a" })));
    expect(fetcher).toHaveBeenCalledWith("/api/insights/stats?period=7&course=c%2Fa", expect.anything());
    expect(container.textContent).toContain("Học bài đầu tiên");
    expect(container.textContent).toContain("Chưa khả dụng: giờ học");
    expect(container.textContent).not.toContain("0 giờ");
    expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(fetcher).toHaveBeenLastCalledWith("/api/insights/stats?period=30&course=c%2Fa", expect.anything());
  });
  it("retains honest finance unavailability without fake amounts, export or queue links", async () => {
    await act(async () => root.render(h(AdminFinanceView)));
    expect(container.textContent).toContain("Chưa khả dụng");
    expect(container.querySelectorAll("a,button,table")).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
