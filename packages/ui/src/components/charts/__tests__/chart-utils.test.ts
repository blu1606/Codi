import { describe, expect, it } from "vitest";
import {
  calculateScale,
  downloadCsv,
  formatCompact,
  formatNum,
  formatPct,
  formatVnd,
  formatVndCompact,
  getMasteryLabel,
  niceStep,
  pickLabels,
} from "../chart-utils";

describe("chart-utils", () => {
  describe("formatters", () => {
    it("formatNum formats numbers with Vietnamese locale separators", () => {
      expect(formatNum(1000)).toMatch(/1[.,]000/);
      expect(formatNum(0)).toBe("0");
    });

    it("formatCompact compacts thousands and millions", () => {
      expect(formatCompact(500)).toBe("500");
      expect(formatCompact(1500)).toContain("k");
      expect(formatCompact(2500000)).toContain("M");
    });

    it("formatPct formats percentages with optional sign", () => {
      expect(formatPct(15)).toBe("15%");
      expect(formatPct(15.5, { decimals: 1 })).toMatch(/15[.,]5%/);
      expect(formatPct(12, { withSign: true })).toBe("+12%");
      expect(formatPct(-5, { withSign: true })).toMatch(/-5%/);
    });

    it("formatVnd formats VND currency correctly with symbol", () => {
      expect(formatVnd(1290000)).toMatch(/1[.,]290[.,]000\s*₫/);
    });

    it("formatVndCompact formats compact VND currency", () => {
      expect(formatVndCompact(500000)).toMatch(/500k\s*₫/);
      expect(formatVndCompact(1200000)).toMatch(/1[.,]2M\s*₫/);
    });

    it("getMasteryLabel maps mastery levels 0..4 correctly", () => {
      expect(getMasteryLabel(0)).toBe("Chưa bắt đầu");
      expect(getMasteryLabel(1)).toBe("Sơ cấp");
      expect(getMasteryLabel(2)).toBe("Đang học");
      expect(getMasteryLabel(3)).toBe("Khá");
      expect(getMasteryLabel(4)).toBe("Thành thạo");
    });
  });

  describe("scales and steps", () => {
    it("niceStep calculates standard nice round steps", () => {
      expect(niceStep(100, 5)).toBe(20);
      expect(niceStep(75, 4)).toBe(20);
      expect(niceStep(0, 5)).toBe(1);
    });

    it("calculateScale generates min, max, ticks, and step", () => {
      const scale = calculateScale([10, 45, 90], 5);
      expect(scale.min).toBe(0);
      expect(scale.max).toBeGreaterThanOrEqual(90);
      expect(scale.ticks.length).toBeGreaterThan(0);
      expect(scale.ticks[0]).toBe(0);
    });

    it("pickLabels samples labels evenly across count", () => {
      const labels = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"];
      const sampled = pickLabels(labels, 4);
      expect(sampled.length).toBeLessThanOrEqual(4);
      expect(sampled).toContain("D1");
      expect(sampled).toContain("D10");
    });
  });
});
