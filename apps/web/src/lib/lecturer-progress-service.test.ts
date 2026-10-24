import { describe, expect, it } from "vitest";
import {
  calculateAveragePercentage,
  calculateAverageQuizScore,
  calculateLearnerCompletionRate,
  calculateQuestionAccuracy,
  formatHintUsage,
} from "./lecturer-progress-service";

describe("Lecturer Progress Service Helper Functions", () => {
  describe("calculateLearnerCompletionRate", () => {
    it("returns 0 when totalLessons is 0 or negative", () => {
      expect(calculateLearnerCompletionRate(0, 0)).toBe(0);
      expect(calculateLearnerCompletionRate(5, 0)).toBe(0);
      expect(calculateLearnerCompletionRate(2, -1)).toBe(0);
    });

    it("returns correct percentage rounded to integer", () => {
      expect(calculateLearnerCompletionRate(1, 3)).toBe(33);
      expect(calculateLearnerCompletionRate(2, 3)).toBe(67);
      expect(calculateLearnerCompletionRate(5, 10)).toBe(50);
      expect(calculateLearnerCompletionRate(10, 10)).toBe(100);
    });

    it("caps at 100%", () => {
      expect(calculateLearnerCompletionRate(15, 10)).toBe(100);
    });
  });

  describe("calculateAverageQuizScore", () => {
    it("returns null for empty or null array", () => {
      expect(calculateAverageQuizScore([])).toBeNull();
      expect(calculateAverageQuizScore([null, undefined])).toBeNull();
    });

    it("calculates average ignoring null/undefined", () => {
      expect(calculateAverageQuizScore([80, 90, 100])).toBe(90);
      expect(calculateAverageQuizScore([75, null, 85, undefined])).toBe(80);
    });
  });

  describe("calculateAveragePercentage", () => {
    it("returns 0 for empty array", () => {
      expect(calculateAveragePercentage([])).toBe(0);
    });

    it("calculates average of numbers", () => {
      expect(calculateAveragePercentage([50, 60, 70])).toBe(60);
      expect(calculateAveragePercentage([33, 67])).toBe(50);
    });
  });

  describe("calculateQuestionAccuracy", () => {
    it("returns null and needsReview=false when total is 0", () => {
      const res = calculateQuestionAccuracy(0, 0);
      expect(res.correctPercent).toBeNull();
      expect(res.needsReview).toBe(false);
    });

    it("flags needsReview=true when correct percentage < 60%", () => {
      const res1 = calculateQuestionAccuracy(5, 10); // 50%
      expect(res1.correctPercent).toBe(50);
      expect(res1.needsReview).toBe(true);

      const res2 = calculateQuestionAccuracy(59, 100); // 59%
      expect(res2.correctPercent).toBe(59);
      expect(res2.needsReview).toBe(true);
    });

    it("flags needsReview=false when correct percentage >= 60%", () => {
      const res1 = calculateQuestionAccuracy(6, 10); // 60%
      expect(res1.correctPercent).toBe(60);
      expect(res1.needsReview).toBe(false);

      const res2 = calculateQuestionAccuracy(8, 10); // 80%
      expect(res2.correctPercent).toBe(80);
      expect(res2.needsReview).toBe(false);
    });
  });

  describe("formatHintUsage", () => {
    it("returns '0' when count is 0 or falsy", () => {
      expect(formatHintUsage(0, 0)).toBe("0");
      expect(formatHintUsage(0, 2)).toBe("0");
    });

    it("formats count with maxLevel without affecting score", () => {
      expect(formatHintUsage(2, 2)).toBe("2 (L2)");
      expect(formatHintUsage(1, 3)).toBe("1 (L3)");
      expect(formatHintUsage(4, 1)).toBe("4 (L1)");
    });
  });
});
