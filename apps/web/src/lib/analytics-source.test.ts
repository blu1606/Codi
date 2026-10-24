import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve("apps/web/src", file), "utf8");
describe("analytics production boundaries", () => {
  it.each(["lib/admin-analytics-service.ts", "lib/learner-insights-service.ts"])("keeps %s server-only and fixture-free", (file) => {
    const text = source(file);
    expect(text).toContain('import "server-only"');
    expect(text).not.toMatch(/SEED_|analytics-seed-data|ANALYTICS_AS_OF/);
  });
  it.each([
    "app/dashboard/admin/insights/admin-insights-view.tsx",
    "app/dashboard/admin/finance/admin-finance-view.tsx",
    "app/insights/stats/learner-stats-view.tsx",
    "components/analytics/analytics-read-panel.tsx",
  ])("never synthesizes data or exposes unsupported drilldowns in %s", (file) => {
    const text = source(file);
    expect(text).not.toMatch(/analytics-seed-data|admin-analytics-service|learner-insights-service|SEED_|downloadCsv|detailHref|\/dashboard\/admin\/orders/);
  });
});
