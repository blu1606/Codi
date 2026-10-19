import { describe, expect, it } from "vitest";
import {
  overviewCommand,
  resultView,
  streakDays,
  studyCredits,
  studyDate,
  studyHeartbeat,
  weekDates,
} from "./learner-overview-contract";
import type { assessmentSubmissions } from "@codi-1/db/schema/assessments";

describe("study accounting", () => {
  it("uses the Vietnam calendar at the UTC day and week boundary", () => {
    const now = new Date("2026-10-18T17:00:00Z");
    expect(studyDate(now)).toBe("2026-10-19");
    expect(weekDates(now)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(weekDates(new Date("2026-10-18T16:59:59Z"))[0]).toBe("2026-10-12");
  });
  it("splits a heartbeat across midnight without losing fractional seconds", () => {
    expect(
      studyCredits(
        new Date("2026-10-18T16:59:45.700Z"),
        new Date("2026-10-18T17:00:15.700Z"),
      ),
    ).toEqual([
      { date: "2026-10-18", seconds: 15 },
      { date: "2026-10-19", seconds: 15 },
    ]);
    expect(
      studyCredits(
        new Date("2026-10-18T17:00:15.700Z"),
        new Date("2026-10-18T17:00:16.100Z"),
      ),
    ).toEqual([{ date: "2026-10-19", seconds: 1 }]);
  });
  it("never credits a first request, expired clock, duplicate or backwards timestamp", () => {
    const now = new Date("2026-10-19T03:00:00Z");
    for (const previous of [
      null,
      now,
      new Date(now.getTime() + 1000),
      new Date(now.getTime() - 45001),
    ])
      expect(studyCredits(previous, now)).toEqual([]);
    expect(studyCredits(new Date(now.getTime() - 45000), now)).toEqual([
      { date: "2026-10-19", seconds: 45 },
    ]);
  });
  it("keeps yesterday's streak, deduplicates events and breaks on a missed day", () => {
    const now = new Date("2026-10-19T03:00:00Z");
    expect(
      streakDays(["2026-10-18", "2026-10-18", "2026-10-17", "2026-10-15"], now),
    ).toBe(2);
    expect(streakDays(["2026-10-19", "2026-10-18", "2026-10-17"], now)).toBe(3);
    expect(streakDays(["2026-10-17", "2026-10-20"], now)).toBe(0);
  });
  it("rejects browser-supplied durations, forged user IDs and malformed undo tokens", () => {
    expect(
      studyHeartbeat.safeParse({
        action: "start",
        trackerId: "19a88269-9c03-4c26-921d-bcecd007906b",
        expectedOwner: null,
        seconds: 3600,
      }).success,
    ).toBe(false);
    expect(
      overviewCommand.safeParse({
        type: "dismiss-diagnostic",
        courseId: "owned",
        userId: "victim",
      }).success,
    ).toBe(false);
    expect(
      overviewCommand.safeParse({
        type: "restore-diagnostic",
        courseId: "owned",
        dismissedAt: "yesterday",
      }).success,
    ).toBe(false);
  });
});

describe("public result projection", () => {
  const assessment = {
    id: 1,
    title: "Quiz",
    type: "quiz" as const,
    maxScore: 20,
    passingScore: 70,
  };
  const submission = (
    fields: Partial<typeof assessmentSubmissions.$inferSelect>,
  ) =>
    ({
      status: "graded",
      score: 10,
      quizPercent: null,
      isPassed: false,
      feedback: "Nhận xét",
      gradedAt: new Date("2026-10-19T03:00:00Z"),
      answerText: "secret answer",
      codingRun: { logs: ["secret code"] },
      ...fields,
    }) as typeof assessmentSubmissions.$inferSelect;
  it("uses persisted quiz percentage and never exposes answers or coding run internals", () => {
    const view = resultView(assessment, submission({ quizPercent: 67 }));
    expect(view.percent).toBe(67);
    expect(view.passed).toBe(false);
    expect(view).not.toHaveProperty("answerText");
    expect(view).not.toHaveProperty("codingRun");
  });
  it("scales code points and hides feedback while not graded", () => {
    expect(
      resultView({ ...assessment, type: "coding" }, submission({})).percent,
    ).toBe(50);
    expect(
      resultView(assessment, submission({ status: "pending" })),
    ).toMatchObject({ percent: null, passed: null, feedback: null });
    expect(resultView(assessment)).toMatchObject({
      status: null,
      percent: null,
      feedback: null,
    });
  });
});
