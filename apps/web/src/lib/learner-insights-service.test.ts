import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { assessmentAnswers, assessmentSubmissions, assessments, courses, enrollmentSkillMastery, lessonProgress, studentEnrollments, studentStudyDays, type Database } from "@codi-1/db";
vi.mock("server-only", () => ({}));
import { analyticsWindow } from "./analytics-contract";
import { buildLearnerStats, getLearnerStatsData, masteryLevel, publishedLearnerSkills, type LearnerStatsRows } from "./learner-insights-service";

const NOW = new Date("2026-10-22T18:00:00Z"); // 01:00 on 23/10 in GMT+7

function rows(overrides: Partial<LearnerStatsRows> = {}): LearnerStatsRows {
  return {
    enrollments: [
      { id: 1, courseId: "course-a", courseTitle: "Khóa A", diagnosticStatus: "done", weeklyGoalMinutes: 240 },
      { id: 2, courseId: "course-b", courseTitle: "Khóa B", diagnosticStatus: "none", weeklyGoalMinutes: null },
    ],
    studyDays: [],
    completions: [],
    skills: [],
    submissions: [],
    answers: [],
    ...overrides,
  };
}

const day = (date: string, minutes: number) => ({ date, seconds: minutes * 60 });

describe("learner window and study time (GMT+7 calendar days)", () => {
  it("counts only study days inside the GMT+7 window and the same-length window before it", () => {
    // Current window is GMT+7 17/10 to 23/10; the previous window is 10/10 to 16/10. 09/10 and 24/10 are outside both.
    const data = buildLearnerStats(rows({
      studyDays: [day("2026-10-16", 50), day("2026-10-17", 30), day("2026-10-23", 40), day("2026-10-24", 99), day("2026-10-09", 20), day("2026-10-12", 20)],
    }), "7", "all", NOW);
    expect(data.window).toMatchObject({ start: "2026-10-16T17:00:00.000Z", end: "2026-10-23T17:00:00.000Z" });
    expect(data.studyMinutes).toBe(70);
    expect(data.previousStudyMinutes).toBe(70);
    expect(data.days.map((d) => d.date)).toEqual(["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(data.days.find((d) => d.date === "2026-10-18")?.minutes).toBe(0);
  });
  it("rounds seconds to whole minutes and keeps the course filter off study time", () => {
    const data = buildLearnerStats(rows({ studyDays: [{ date: "2026-10-22", seconds: 3599 }, { date: "2026-10-21", seconds: 1801 }] }), "7", "course-b", NOW);
    expect(data.studyMinutes).toBe(90);
    expect(data.enrollments).toBe(1);
  });
  it("buckets weeks from Monday in GMT+7 and always returns six weeks ending with the current one", () => {
    // NOW is Friday 23/10 in GMT+7; rows after that day are ignored.
    const data = buildLearnerStats(rows({ studyDays: [day("2026-10-19", 60), day("2026-10-22", 10), day("2026-10-25", 10)] }), "30", "all", NOW);
    expect(data.weeks).toHaveLength(6);
    expect(data.weeks.at(-1)).toEqual({ weekStart: "2026-10-19", minutes: 70 });
    expect(data.weeks.at(-2)).toEqual({ weekStart: "2026-10-12", minutes: 0 });
  });
  it("uses the learner's weekly goal when set and flags the 5-hour default as assumed", () => {
    expect(buildLearnerStats(rows(), "30", "all", NOW)).toMatchObject({ weeklyGoalMinutes: 240, weeklyGoalSet: true });
    const unset = rows({ enrollments: [{ id: 2, courseId: "course-b", courseTitle: "Khóa B", diagnosticStatus: "none", weeklyGoalMinutes: null }] });
    expect(buildLearnerStats(unset, "30", "all", NOW)).toMatchObject({ weeklyGoalMinutes: 300, weeklyGoalSet: false });
  });
});

describe("streak", () => {
  it("counts consecutive days ending today and the best run across history", () => {
    const data = buildLearnerStats(rows({
      studyDays: [day("2026-09-01", 5), day("2026-09-02", 5), day("2026-09-03", 5), day("2026-09-04", 5), day("2026-09-05", 5), day("2026-10-20", 30), day("2026-10-21", 30), day("2026-10-22", 30), day("2026-10-23", 30)],
    }), "30", "all", NOW);
    expect(data.streak).toEqual({ current: 4, best: 5 });
  });
  it("keeps yesterday's run alive when today has no study yet", () => {
    const data = buildLearnerStats(rows({ studyDays: [day("2026-10-20", 30), day("2026-10-21", 30), day("2026-10-22", 30)] }), "30", "all", NOW);
    expect(data.streak.current).toBe(3);
  });
  it("is zero when the latest study day is older than yesterday", () => {
    expect(buildLearnerStats(rows({ studyDays: [day("2026-10-19", 30)] }), "30", "all", NOW).streak.current).toBe(0);
  });
  it("ignores zero-minute rows", () => {
    expect(buildLearnerStats(rows({ studyDays: [{ date: "2026-10-23", seconds: 0 }] }), "30", "all", NOW).streak.current).toBe(0);
  });
});

describe("lesson completions", () => {
  it("counts completions in the window with an inclusive start and exclusive end", () => {
    const data = buildLearnerStats(rows({
      completions: [
        { enrollmentId: 1, completedAt: new Date("2026-10-16T16:59:59Z") }, // 23:59:59 on 16/10: previous window
        { enrollmentId: 1, completedAt: new Date("2026-10-16T17:00:00Z") }, // 00:00 on 17/10: first instant
        { enrollmentId: 1, completedAt: new Date("2026-10-23T16:59:59Z") }, // 23:59:59 on 23/10: last instant
        { enrollmentId: 1, completedAt: new Date("2026-10-23T17:00:00Z") }, // 00:00 on 24/10: outside
        { enrollmentId: 1, completedAt: new Date("2026-10-09T10:00:00Z") }, // previous window
      ],
    }), "7", "all", NOW);
    expect(data.completedLessons).toBe(2);
    expect(data.previousCompletedLessons).toBe(1);
  });
  it("counts only the selected course's completions", () => {
    const data = buildLearnerStats(rows({ completions: [{ enrollmentId: 1, completedAt: new Date("2026-10-20T08:00:00Z") }, { enrollmentId: 2, completedAt: new Date("2026-10-20T08:00:00Z") }] }), "7", "course-b", NOW);
    expect(data.completedLessons).toBe(1);
  });
});

describe("mastery", () => {
  it("maps the posterior to the 5-stop scale and needs evidence for any level above zero", () => {
    expect(masteryLevel(null, null)).toBe(0);
    expect(masteryLevel(0.9, 0)).toBe(0);
    expect(masteryLevel(0.2, 4)).toBe(1);
    expect(masteryLevel(0.5, 4)).toBe(2);
    expect(masteryLevel(0.7, 4)).toBe(3);
    expect(masteryLevel(0.85, 4)).toBe(4);
  });
  it("lists course skills sorted by level, counts level 3 and above as mastered, and includes unassessed skills", () => {
    const data = buildLearnerStats(rows({
      skills: [
        { id: 10, name: "Mảng", courseId: "course-a", pMastery: 0.7, evidenceCount: 3 },
        { id: 11, name: "Biến", courseId: "course-a", pMastery: 0.9, evidenceCount: 4 },
        { id: 12, name: "Hàm", courseId: "course-a", pMastery: null, evidenceCount: null },
        { id: 13, name: "Khác khóa", courseId: "course-x", pMastery: 0.9, evidenceCount: 4 },
      ],
    }), "30", "all", NOW);
    expect(data.skills.items.map((s) => [s.name, s.level, s.courseTitle])).toEqual([["Biến", 4, "Khóa A"], ["Mảng", 3, "Khóa A"], ["Hàm", 0, "Khóa A"]]);
    expect(data.skills).toMatchObject({ total: 3, mastered: 2 });
  });
  it("scopes skills to the selected course", () => {
    const data = buildLearnerStats(rows({ skills: [{ id: 10, name: "Mảng", courseId: "course-a", pMastery: 0.7, evidenceCount: 3 }, { id: 11, name: "Biến", courseId: "course-b", pMastery: 0.9, evidenceCount: 4 }] }), "30", "course-b", NOW);
    expect(data.skills.items.map((s) => s.name)).toEqual(["Biến"]);
  });
});

describe("scores and quizzes", () => {
  const quiz = (overrides: Partial<LearnerStatsRows["submissions"][number]>) => ({
    submissionId: 100, assessmentId: 5, attempt: 1, type: "quiz" as const, mode: null, isDiagnostic: false,
    title: "Quiz: Hàm", courseId: "course-a", maxScore: 100, score: 40, quizPercent: 40,
    submittedAt: new Date("2026-10-01T03:00:00Z"), ...overrides,
  });
  it("uses the latest attempt per assessment and skips the diagnostic in scores", () => {
    const data = buildLearnerStats(rows({
      submissions: [
        quiz({}),
        quiz({ submissionId: 101, attempt: 2, score: 80, quizPercent: 80, submittedAt: new Date("2026-10-02T03:00:00Z") }),
        quiz({ submissionId: 102, assessmentId: 6, isDiagnostic: true, title: "Bài kiểm tra đầu vào", quizPercent: 60 }),
      ],
    }), "30", "all", NOW);
    expect(data.scores).toEqual([{ id: 5, label: "Quiz: Hàm", kind: "Quiz", percent: 80, date: "2026-10-02" }]);
    expect(data.quizzes.map((q) => q.label)).toEqual(["Bài kiểm tra đầu vào · Khóa A", "Quiz: Hàm"]);
  });
  it("includes coding only when submitted, not run, and derives its percent from score over max", () => {
    const data = buildLearnerStats(rows({
      submissions: [
        quiz({ submissionId: 201, assessmentId: 7, type: "coding", mode: "run", title: "Bài code chạy thử", score: 100, quizPercent: null, maxScore: 100 }),
        quiz({ submissionId: 202, assessmentId: 8, type: "coding", mode: "submit", title: "Bài code", score: 7, quizPercent: null, maxScore: 10 }),
      ],
    }), "30", "all", NOW);
    expect(data.scores).toEqual([{ id: 8, label: "Bài code", kind: "Bài code", percent: 70, date: "2026-10-01" }]);
  });
  it("counts correct, wrong and unknown answers of the latest quiz attempt only", () => {
    const data = buildLearnerStats(rows({
      submissions: [quiz({ submissionId: 300, attempt: 1 }), quiz({ submissionId: 301, attempt: 2 })],
      answers: [
        { submissionId: 300, isCorrect: false, isUnknown: false },
        { submissionId: 301, isCorrect: true, isUnknown: false },
        { submissionId: 301, isCorrect: false, isUnknown: false },
        { submissionId: 301, isCorrect: null, isUnknown: true },
      ],
    }), "30", "all", NOW);
    expect(data.quizzes).toEqual([{ id: "course-a:5", label: "Quiz: Hàm", correct: 1, wrong: 1, unknown: 1 }]);
  });
});

describe("diagnostic and course filter", () => {
  it("flags a skipped diagnostic only when no course in scope has finished it", () => {
    const skipped = rows({ enrollments: [{ id: 1, courseId: "course-a", courseTitle: "Khóa A", diagnosticStatus: "skipped", weeklyGoalMinutes: null }] });
    expect(buildLearnerStats(skipped, "30", "all", NOW).diagnosticSkipped).toBe(true);
    const done = rows({ enrollments: [{ id: 1, courseId: "course-a", courseTitle: "Khóa A", diagnosticStatus: "done", weeklyGoalMinutes: null }, { id: 2, courseId: "course-b", courseTitle: "Khóa B", diagnosticStatus: "skipped", weeklyGoalMinutes: null }] });
    expect(buildLearnerStats(done, "30", "all", NOW).diagnosticSkipped).toBe(false);
  });
  it("returns honest zeros for a course the learner does not own", () => {
    const data = buildLearnerStats(rows({ completions: [{ enrollmentId: 1, completedAt: new Date("2026-10-20T08:00:00Z") }] }), "30", "course-z", NOW);
    expect(data).toMatchObject({ enrollments: 0, completedLessons: 0, scores: [], quizzes: [] });
    expect(data.skills.total).toBe(0);
  });
  it("exposes the learner's courses for the filter", () => {
    expect(buildLearnerStats(rows(), "30", "all", NOW).courses).toEqual([{ id: "course-a", title: "Khóa A" }, { id: "course-b", title: "Khóa B" }]);
  });
});

describe("persisted learner aggregates (owner scoping)", () => {
  type Table = object;
  function database(data: Map<Table, unknown[]>) {
    const conditions: SQL[] = [];
    const db = {
      select: vi.fn(() => ({
        from: (table: Table) => {
          const result = data.get(table) ?? [];
          const chain = {
            innerJoin: () => chain,
            leftJoin: () => chain,
            where: (condition: SQL) => { conditions.push(condition); return chain; },
            then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
          };
          return chain;
        },
      })),
    };
    return { db: db as unknown as Database, conditions };
  }
  const params = (condition: SQL) => new PgDialect().sqlToQuery(condition).params;

  it("reads only the trusted learner's enrollments, study days and enrollment-scoped rows", async () => {
    const data = new Map<Table, unknown[]>([
      [studentEnrollments, [{ id: 1, courseId: "course-a", courseTitle: "Khóa A", diagnosticStatus: "done", weeklyGoalMinutes: 300 }]],
      [studentStudyDays, [day("2026-10-22", 30)]],
      [lessonProgress, []], [enrollmentSkillMastery, []], [assessmentSubmissions, []], [assessmentAnswers, []],
    ]);
    const f = database(data);
    const result = await getLearnerStatsData(f.db, "alice", "7", "all", NOW);
    expect(result.studyMinutes).toBe(30);
    // Query order: enrollments, study days, completions, skills, submissions, answers.
    expect(params(f.conditions[0]!)).toContain("alice");
    expect(params(f.conditions[1]!)).toContain("alice");
    for (const index of [2, 4, 5]) expect(params(f.conditions[index]!)).toContain(1);
    expect(params(f.conditions[3]!)).toContain(1);
  });
  it("applies the course filter to the enrollment-scoped queries", async () => {
    const f = database(new Map<Table, unknown[]>([[studentEnrollments, [{ id: 1, courseId: "course-a", courseTitle: "Khóa A", diagnosticStatus: "none", weeklyGoalMinutes: null }]]]));
    await getLearnerStatsData(f.db, "alice", "30", "course-a", NOW);
    expect(params(f.conditions[0]!)).toContain("alice");
    expect(f.conditions).toHaveLength(6);
    expect(params(f.conditions[2]!)).toContain(1);
  });
  it("loads snapshot skills with mastery scoped to their own enrollment", async () => {
    const published = (id: number, name: string) => ({ version: 1, publicationId: "123e4567-e89b-42d3-a456-426614174000", contentGeneration: 1,
      publishedAt: "2026-10-30T00:00:00.000Z", skills: [{ id, name, bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 }], edges: [], links: [] });
    const f = database(new Map<Table, unknown[]>([
      [studentEnrollments, [
        { id: 1, courseId: "course-a", courseTitle: "A", diagnosticStatus: "done", weeklyGoalMinutes: null, confirmedKnowledgeMap: published(10, "Tên đã xuất bản") },
        { id: 2, courseId: "course-b", courseTitle: "B", diagnosticStatus: "done", weeklyGoalMinutes: null, confirmedKnowledgeMap: published(20, "B") },
      ]],
      [enrollmentSkillMastery, [{ enrollmentId: 2, skillId: 10, pMastery: 0.99, evidenceCount: 3 }]],
    ]));
    const data = await getLearnerStatsData(f.db, "alice", "30", "all", NOW);
    expect(data.skills.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 10, name: "Tên đã xuất bản", courseId: "course-a", level: 0 }),
      expect.objectContaining({ id: 20, name: "B", courseId: "course-b", level: 0 }),
    ]));
  });
  it("fails closed on missing learner identity before querying", async () => {
    const f = database(new Map());
    await expect(getLearnerStatsData(f.db, "", "30", "all")).rejects.toThrow();
    expect(f.conditions).toHaveLength(0);
  });
  it("rejects invalid periods before querying", async () => {
    const f = database(new Map());
    await expect(getLearnerStatsData(f.db, "alice", "bad", "all")).rejects.toThrow();
    expect(f.conditions).toHaveLength(0);
  });
  it("returns the honest empty state for a learner with no rows", async () => {
    const f = database(new Map<Table, unknown[]>([[studentEnrollments, []], [studentStudyDays, []]]));
    const result = await getLearnerStatsData(f.db, "new-user", "30", "all", NOW);
    expect(result).toMatchObject({ enrollments: 0, completedLessons: 0, studyMinutes: 0, streak: { current: 0, best: 0 }, scores: [], quizzes: [] });
    expect(result.window).toEqual(analyticsWindow("30", NOW));
    expect(f.conditions).toHaveLength(2);
  });
});

describe("learner publication isolation", () => {
  const skill = (id: number, name: string) => ({ id, name, bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 });
  const publication = (items: ReturnType<typeof skill>[]) => ({ version: 1, publicationId: "123e4567-e89b-42d3-a456-426614174000", contentGeneration: 2,
    publishedAt: "2026-10-30T00:00:00.000Z", skills: items, edges: [], links: [] });
  it("uses only confirmed names and the matching enrollment+skill mastery across courses", () => {
    const enrollments = rows().enrollments.map((row, i) => ({ ...row,
      confirmedKnowledgeMap: publication([skill(i === 0 ? 10 : 20, i === 0 ? "Tên đã xác nhận" : "Khóa B")]) }));
    const result = publishedLearnerSkills(enrollments, [
      { enrollmentId: 1, skillId: 10, pMastery: 0.6, evidenceCount: 2 },
      // A row from another enrollment must not affect the same skill ID.
      { enrollmentId: 2, skillId: 10, pMastery: 0.99, evidenceCount: 20 },
      { enrollmentId: 1, skillId: 20, pMastery: 0.99, evidenceCount: 20 },
    ]);
    expect(result).toEqual([
      { id: 10, name: "Tên đã xác nhận", courseId: "course-a", pMastery: 0.6, evidenceCount: 2 },
      { id: 20, name: "Khóa B", courseId: "course-b", pMastery: null, evidenceCount: null },
    ]);
    expect(buildLearnerStats(rows({ skills: result }), "30", "course-b", NOW).skills.items)
      .toEqual([{ id: 20, name: "Khóa B", courseId: "course-b", courseTitle: "Khóa B", level: 0 }]);
  });
  it("fails closed for missing, malformed and internally inconsistent snapshots", () => {
    const enrollment = rows().enrollments[0]!;
    for (const snapshot of [null, {}, { ...publication([skill(1, "x")]), version: 2 },
      { ...publication([skill(1, "x"), skill(1, "duplicate")]) },
      { ...publication([skill(1, "x")]), links: [{ lessonId: "123e4567-e89b-42d3-a456-426614174001", skillId: 2 }] }]) {
      expect(publishedLearnerSkills([{ ...enrollment, confirmedKnowledgeMap: snapshot }], [])).toEqual([]);
    }
  });
  it("accepts a legacy snapshot with non-UUID publication and lesson IDs", () => {
    const enrollment = rows().enrollments[0]!;
    const snapshot = { ...publication([skill(1, "Đã công bố")]), publicationId: "confirmed-1",
      publishedAt: "legacy", links: [{ lessonId: "lesson-1", skillId: 1 }] };
    expect(publishedLearnerSkills([{ ...enrollment, confirmedKnowledgeMap: snapshot }], []))
      .toMatchObject([{ id: 1, name: "Đã công bố", courseId: "course-a" }]);
  });
});
