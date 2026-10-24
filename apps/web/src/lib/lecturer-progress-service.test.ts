import { describe, expect, it } from "vitest";
import {
  calculateAverageQuizScore,
  calculateLearnerCompletionRate,
  calculateQuestionAccuracy,
  selectLatestCompletedAttempts,
} from "./lecturer-progress-service";

const attempt = (
  id: number,
  number: number,
  status = "graded",
  submittedAt: Date | null = new Date("2026-10-20"),
) => ({
  id,
  attempt: number,
  assessmentId: 10,
  enrollmentId: 1,
  status,
  submittedAt,
  quizPercent: 80,
});

describe("lecturer completed result selection", () => {
  it.each([false, true])(
    "selects latest completed result without draft displacement (reversed=%s)",
    (reverse) => {
      const rows = [
        attempt(1, 1),
        attempt(2, 2),
        attempt(3, 3, "draft", null),
        attempt(4, 4, "pending"),
      ];
      const result = selectLatestCompletedAttempts(
        reverse ? rows.toReversed() : rows,
      );
      expect(result.map((row) => row.id)).toEqual([2]);
      expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
    },
  );
  it("keeps enrollment/assessment scopes separate and breaks attempt ties by id", () => {
    const result = selectLatestCompletedAttempts([
      attempt(5, 2),
      attempt(6, 2),
      { ...attempt(7, 1), enrollmentId: 2 },
      { ...attempt(8, 1), assessmentId: 11 },
    ]);
    expect(result.map((row) => row.id).sort()).toEqual([6, 7, 8]);
  });
  it("selects only one completed quiz result per lesson even across assessment rows", () => {
    const result = selectLatestCompletedAttempts([
      { ...attempt(5, 2), lessonId: "lesson" },
      { ...attempt(6, 2), lessonId: "lesson", assessmentId: 11 },
    ]);
    expect(result.map((row) => row.id)).toEqual([6]);
  });
  it("does not fall back to an older percentage or a mark when the selected result has no percent", () => {
    const rows = [
      attempt(1, 1),
      { ...attempt(2, 2), quizPercent: null, score: 8 },
    ];
    const [selected] = selectLatestCompletedAttempts(rows);
    expect(selected?.id).toBe(2);
    expect(calculateAverageQuizScore([selected?.quizPercent])).toBeNull();
  });
  it("excludes unsubmitted graded rows", () => {
    expect(
      selectLatestCompletedAttempts([attempt(1, 1, "graded", null)]),
    ).toEqual([]);
  });
  it("keeps absent scores and correctness unknown", () => {
    expect(calculateAverageQuizScore([null])).toBeNull();
    expect(calculateQuestionAccuracy(0, 0)).toEqual({
      correctPercent: null,
      needsReview: false,
    });
    expect(calculateQuestionAccuracy(1, 2)).toEqual({
      correctPercent: 50,
      needsReview: true,
    });
    expect(calculateLearnerCompletionRate(1, 2)).toBe(50);
  });
});
