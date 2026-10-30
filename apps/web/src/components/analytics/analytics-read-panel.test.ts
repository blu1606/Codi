// @vitest-environment happy-dom
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerStatsView } from "../../app/insights/stats/learner-stats-view";
import { learnerStats, learnerStatsDiagnosticSkipped, learnerStatsLittleData, learnerStatsNoActivity } from "../../demo-fixtures/commerce/s13b-learner-stats";
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
describe("learner analytics client states (controlled HTTP doubles)", () => {
  it("renders learner stats from the response and requests the selected course and period", async () => {
    fetcher.mockResolvedValue(ok(learnerStats));
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "7", initialCourse: "c/a" })));
    expect(fetcher).toHaveBeenCalledWith("/api/insights/stats?period=7&course=c%2Fa", expect.anything());
    expect(container.textContent).toContain("Giờ học trong kỳ");
    expect(container.textContent).toContain("Lịch học");
    expect(container.textContent).toContain("Mức thành thạo theo kỹ năng");
    expect(container.textContent).not.toContain("Chưa khả dụng");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(fetcher).toHaveBeenLastCalledWith("/api/insights/stats?period=30&course=c%2Fa", expect.anything());
  });
  it("expands the detail cards with the small-sample caution and the selected quiz donut", async () => {
    fetcher.mockResolvedValue(ok(learnerStats));
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "30", initialCourse: "all" })));
    expect(container.textContent).not.toContain("Điểm quiz & bài code theo thời gian");
    const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Xem chi tiết (2 thẻ)"))!;
    await act(async () => toggle.click());
    expect(container.textContent).toContain("Điểm quiz & bài code theo thời gian");
    expect(container.textContent).toContain("Mẫu nhỏ (n = 4)");
    expect(container.textContent).toContain("Kết quả một bài quiz");
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("shows the no-activity call to action instead of empty charts", async () => {
    fetcher.mockResolvedValue(ok(learnerStatsNoActivity));
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "30", initialCourse: "all" })));
    expect(container.textContent).toContain("Học bài đầu tiên");
    expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Lịch học");
  });
  it("flags little data and the skipped diagnostic without trend claims", async () => {
    fetcher.mockResolvedValue(ok(learnerStatsLittleData));
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "30", initialCourse: "all" })));
    expect(container.textContent).toContain("Mới có 2 ngày học");
    fetcher.mockResolvedValue(ok(learnerStatsDiagnosticSkipped));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(h(LearnerStatsView, { initialPeriod: "30", initialCourse: "all" })));
    expect(container.textContent).toContain("Bạn đã bỏ qua bài kiểm tra đầu vào");
  });
});
