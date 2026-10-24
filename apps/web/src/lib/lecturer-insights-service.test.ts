import { describe, expect, it } from "vitest";
import {
  buildKpiData,
  calculateDeltaPercent,
  calculatePeriodDates,
  formatNumber,
  formatVnd,
  generateChartSeries,
} from "./lecturer-insights-service";

describe("Lecturer Insights Service Helper Functions", () => {
  describe("calculatePeriodDates", () => {
    it("returns correct start, end, and previous period dates for 7d", () => {
      const fixedNow = new Date("2026-10-24T12:00:00Z");
      const res = calculatePeriodDates("7d", fixedNow);

      expect(res.days).toBe(7);
      expect(res.end.toISOString()).toBe(fixedNow.toISOString());

      const expectedStart = new Date("2026-10-17T12:00:00Z");
      expect(res.start.toISOString()).toBe(expectedStart.toISOString());

      const expectedPrevStart = new Date("2026-10-10T12:00:00Z");
      expect(res.prevStart.toISOString()).toBe(expectedPrevStart.toISOString());
    });

    it("defaults to 30d if invalid or unspecified", () => {
      const fixedNow = new Date("2026-10-24T12:00:00Z");
      const res = calculatePeriodDates(undefined as any, fixedNow);
      expect(res.days).toBe(30);
    });
  });

  describe("calculateDeltaPercent", () => {
    it("handles zero previous period gracefully", () => {
      expect(calculateDeltaPercent(100, 0)).toBe(100);
      expect(calculateDeltaPercent(0, 0)).toBe(0);
    });

    it("calculates positive and negative percentage changes", () => {
      expect(calculateDeltaPercent(150, 100)).toBe(50);
      expect(calculateDeltaPercent(50, 100)).toBe(-50);
      expect(calculateDeltaPercent(200, 100)).toBe(100);
    });
  });

  describe("formatVnd and formatNumber", () => {
    it("formats VND amounts with currency symbol", () => {
      expect(formatVnd(0)).toBe("0 ₫");
      expect(formatVnd(500000)).toMatch(/500[.,]000 ₫/);
    });

    it("formats counts with standard grouping", () => {
      expect(formatNumber(0)).toBe("0");
      expect(formatNumber(1250)).toMatch(/1[.,]250/);
    });
  });

  describe("buildKpiData", () => {
    it("generates 4 KPI cards with proper delta and formatted values", () => {
      const curr = { gross: 2000000, net: 1800000, orders: 10, discount: 200000 };
      const prev = { gross: 1000000, net: 900000, orders: 5, discount: 100000 };

      const kpis = buildKpiData(curr, prev);
      expect(kpis).toHaveLength(4);

      const gross = kpis.find((k) => k.key === "gross")!;
      expect(gross.current).toBe(2000000);
      expect(gross.previous).toBe(1000000);
      expect(gross.deltaPercent).toBe(100);
      expect(gross.isPositive).toBe(true);

      const orders = kpis.find((k) => k.key === "orders")!;
      expect(orders.current).toBe(10);
      expect(orders.previous).toBe(5);
      expect(orders.deltaPercent).toBe(100);
      expect(orders.formattedCurrent).toBe("10");
    });
  });

  describe("generateChartSeries", () => {
    it("creates continuous daily series matching period days", () => {
      const fixedNow = new Date("2026-10-24T12:00:00Z");
      const curr = [{ paidAt: "2026-10-24T05:00:00Z", amount: 500000 }];
      const prev = [{ paidAt: "2026-10-17T05:00:00Z", amount: 300000 }];

      const res = generateChartSeries(curr, prev, "7d", fixedNow);

      expect(res.series).toHaveLength(7);
      expect(res.currentTotal).toBe(500000);
      expect(res.averagePerDay).toBe(Math.round(500000 / 7));

      const todayPoint = res.series[res.series.length - 1];
      expect(todayPoint.current).toBe(500000);
      expect(todayPoint.previous).toBe(300000);
    });
  });
});
