import { describe, expect, it } from "vitest";
import {
  calculateScale,
  formatCompact,
  formatNum,
  formatPct,
  formatVnd,
  formatVndCompact,
  getMasteryLabel,
  niceStep,
  pickLabels,
} from "@codi-1/ui/components/charts";

describe("chart-utils (apps/web)", () => {
  describe("formatters", () => {
    it("formatNum formats numbers with Vietnamese locale separators", () => {
      expect(formatNum(1000)).toMatch(/1[.,]000/);
      expect(formatNum(0)).toBe("0");
    });

    it("formatCompact compacts thousands and millions according to charts.js", () => {
      expect(formatCompact(500)).toBe("500");
      expect(formatCompact(15000)).toContain("k");
      expect(formatCompact(2500000)).toContain("tr");
      expect(formatCompact(3000000000)).toContain("tỷ");
    });

    it("formatPct formats percentages with optional digits", () => {
      expect(formatPct(15)).toBe("15%");
      expect(formatPct(15.5, 1)).toMatch(/15[.,]5%/);
    });

    it("formatVnd formats VND currency correctly with symbol", () => {
      expect(formatVnd(1290000)).toMatch(/1[.,]290[.,]000\s*₫/);
    });

    it("formatVndCompact formats compact VND currency", () => {
      expect(formatVndCompact(500000)).toMatch(/500k\s*₫/);
      expect(formatVndCompact(1200000)).toMatch(/1[.,]2\s*tr\s*₫/);
    });

    it("getMasteryLabel maps mastery levels 0..4 correctly", () => {
      expect(getMasteryLabel(0)).toBe("Chưa học");
      expect(getMasteryLabel(1)).toBe("Đang học · mới bắt đầu");
      expect(getMasteryLabel(2)).toBe("Đang học · khá");
      expect(getMasteryLabel(3)).toBe("Thành thạo");
      expect(getMasteryLabel(4)).toBe("Thành thạo · vững");
    });
  });

  describe("scales and steps", () => {
    it("niceStep calculates standard nice round steps", () => {
      expect(niceStep(100)).toBe(25);
      expect(niceStep(10)).toBe(2.5);
    });

    it("calculateScale generates top and ticks array", () => {
      const scale = calculateScale(90);
      expect(scale.top).toBeGreaterThanOrEqual(90);
      expect(scale.ticks.length).toBeGreaterThan(0);
      expect(scale.ticks[0]).toBe(0);
    });

    it("pickLabels samples indices evenly across count", () => {
      const indices = pickLabels(10, 4);
      expect(indices.length).toBe(4);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(9);
    });
  });
});
