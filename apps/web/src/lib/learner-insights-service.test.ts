import { describe, expect, it } from "vitest";
import { getLearnerStatsData, getLearnerWindows, calculateStreak } from "./learner-insights-service";
import { SEED_LEARNER_STUDY_DAYS } from "./analytics-seed-data";

describe("learner-insights-service", () => {
  it("calculates learner study windows correctly", () => {
    const w7 = getLearnerWindows("7");
    expect(w7.len).toBe(7);
    const w30 = getLearnerWindows("30");
    expect(w30.len).toBe(30);
  });

  it("calculates learner streaks", () => {
    const streak = calculateStreak(SEED_LEARNER_STUDY_DAYS);
    expect(streak.cur).toBeGreaterThanOrEqual(0);
    expect(streak.best).toBeGreaterThanOrEqual(streak.cur);
  });

  it("calculates learner stats C1..C6 for 7-day period", () => {
    const data = getLearnerStatsData("7", "all");
    expect(data.period).toBe("7");
    expect(data.c1.studyHours).toBeGreaterThanOrEqual(0);
    expect(data.c2.title).toBe("Phút học mỗi ngày");
    expect(data.c2.items.length).toBe(7);
    expect(data.c3.days.length).toBeGreaterThanOrEqual(7);
    expect(data.c4.items.length).toBeGreaterThan(0);
    expect(data.c5.scores.length).toBeGreaterThan(0);
    expect(data.c6.quizzes.length).toBe(3);
  });

  it("calculates learner stats C1..C6 for month period with weekly aggregation for C2", () => {
    const data = getLearnerStatsData("month", "all");
    expect(data.period).toBe("month");
    expect(data.c2.title).toBe("Giờ học mỗi tuần");
    expect(data.c2.items.length).toBeGreaterThan(0);
    expect(data.c2.unit).toBe("giờ");
  });

  it("filters by course properly", () => {
    const dataAll = getLearnerStatsData("30", "all");
    const dataSingle = getLearnerStatsData("30", "course-js-001");
    expect(dataSingle.courseIdFilter).toBe("course-js-001");
    expect(dataAll.courses.length).toBeGreaterThan(0);
  });
});
