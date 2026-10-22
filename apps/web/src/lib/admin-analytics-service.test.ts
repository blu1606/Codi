import { describe, expect, it } from "vitest";
import {
  formatRangeText,
  getAnalyticsWindow,
  getFinanceB1,
  getFinanceB2,
  getFinanceB3,
  getFinanceB4,
  getFinanceB5,
  getFinanceB6,
  getFinanceB7,
  getFinanceB8,
  getInsightsA1,
  getInsightsA2,
  getInsightsA3,
  getInsightsA4,
  getInsightsA5,
  getInsightsA6,
  getInsightsA7,
  getInsightsA8,
  getInsightsA9,
} from "./admin-analytics-service";

describe("admin-analytics-service", () => {
  describe("time windows & formatting", () => {
    it("computes 7-day, 30-day, and 90-day windows accurately", () => {
      const w7 = getAnalyticsWindow("7");
      expect(w7.days).toBe(7);
      expect(w7.cur.length).toBe(7);
      expect(w7.prev?.length).toBe(7);

      const w30 = getAnalyticsWindow("30");
      expect(w30.days).toBe(30);
      expect(w30.cur.length).toBe(30);

      const w90 = getAnalyticsWindow("90");
      expect(w90.days).toBe(90);
    });

    it("formats range subtitle with comparison range", () => {
      const w7 = getAnalyticsWindow("7", true);
      const text = formatRangeText(w7);
      expect(text).toContain("· so với");
    });
  });

  describe("S36 Admin Insights A1..A9", () => {
    it("calculates A1 active learners KPI tiles correctly", () => {
      const w = getAnalyticsWindow("7", true);
      const a1 = getInsightsA1(w);
      expect(a1.tiles).toHaveLength(5);
      expect(a1.tiles[0].label).toContain("WAU");
      expect(a1.tiles[0].value).toBeGreaterThan(0);
      expect(a1.table.rows.length).toBe(5);
    });

    it("calculates A2 daily active users (DAU)", () => {
      const w = getAnalyticsWindow("30", true);
      const a2 = getInsightsA2(w);
      expect(a2.cur.length).toBe(30);
      expect(a2.curAvgDau).toBeGreaterThan(0);
      expect(a2.curSticky).toBeGreaterThan(0);
    });

    it("calculates A3 activation funnel", () => {
      const w = getAnalyticsWindow("30", true);
      const a3 = getInsightsA3(w);
      expect(a3.steps).toHaveLength(4);
      expect(a3.steps[0].label).toBe("Đăng ký");
      expect(a3.steps[3].label).toBe("Hoàn thành bài đầu tiên");
    });

    it("calculates A4 cohort retention matrix", () => {
      const w = getAnalyticsWindow("30", true);
      const a4 = getInsightsA4(w);
      expect(a4.rows.length).toBeGreaterThan(0);
      expect(a4.rows[0].pinned).toBe(true);
      expect(a4.cols.length).toBe(9);
    });

    it("calculates A5 course completion rates sorted", () => {
      const a5 = getInsightsA5("rate");
      expect(a5.rows.length).toBeGreaterThan(0);
      expect(a5.rows[0].rate).toBeGreaterThanOrEqual(a5.rows[1].rate);
    });

    it("calculates A6 diagnostic vs lesson 1 trend", () => {
      const w = getAnalyticsWindow("30", true);
      const a6 = getInsightsA6(w);
      expect(a6.segs.length).toBe(2);
      expect(a6.trend.length).toBeGreaterThan(0);
    });

    it("calculates A7 courses by status and pending wait time", () => {
      const a7 = getInsightsA7();
      expect(a7.segs.length).toBe(5);
      expect(a7.table.rows.length).toBe(5);
    });

    it("calculates A8 operational health SLAs", () => {
      const a8 = getInsightsA8();
      expect(a8.windows).toHaveLength(3);
      expect(a8.rows.length).toBe(3);
    });

    it("calculates A9 AI health and p95 latency", () => {
      const w = getAnalyticsWindow("30", true);
      const a9 = getInsightsA9(w);
      expect(a9.tiles.length).toBe(4);
      expect(a9.cur.length).toBe(30);
    });
  });

  describe("S37 Admin Finance B1..B9", () => {
    it("calculates B1 revenue tiles and table", () => {
      const w = getAnalyticsWindow("7", true);
      const b1 = getFinanceB1(w);
      expect(b1.tiles).toHaveLength(6);
      expect(b1.table.rows.length).toBe(6);
    });

    it("calculates B2 revenue over time series", () => {
      const w = getAnalyticsWindow("30", true);
      const b2 = getFinanceB2(w);
      expect(b2.cur.length).toBe(30);
      expect(b2.prev?.length).toBe(30);
      expect(b2.mean).toBeGreaterThan(0);
    });

    it("calculates B3 revenue by course", () => {
      const w = getAnalyticsWindow("30", true);
      const b3 = getFinanceB3(w, "course");
      expect(b3.rows.length).toBeGreaterThan(0);
      expect(b3.totalRev).toBeGreaterThan(0);
    });

    it("calculates B4 order status breakdown", () => {
      const w = getAnalyticsWindow("30", true);
      const b4 = getFinanceB4(w);
      expect(b4.segs.length).toBe(6);
      expect(b4.created).toBeGreaterThan(0);
      expect(b4.paidCount).toBeGreaterThan(0);
    });

    it("calculates B5 checkout funnel and traffic sources", () => {
      const w = getAnalyticsWindow("30", true);
      const b5 = getFinanceB5(w);
      expect(b5.steps.length).toBe(3);
      expect(b5.sources.length).toBe(2);
    });

    it("calculates B6 payment time to completion buckets", () => {
      const w = getAnalyticsWindow("30", true);
      const b6 = getFinanceB6(w);
      expect(b6.buckets.length).toBe(4);
      expect(b6.medianLabel).toBeDefined();
    });

    it("calculates B7 voucher performance", () => {
      const w = getAnalyticsWindow("30", true);
      const b7 = getFinanceB7(w);
      expect(b7.rows.length).toBeGreaterThan(0);
      expect(b7.table.rows.length).toBeGreaterThan(0);
    });

    it("calculates B8 bank reconciliation cards", () => {
      const b8 = getFinanceB8();
      expect(b8.cards.length).toBe(3);
      expect(b8.total).toBeGreaterThanOrEqual(0);
    });
  });
});
