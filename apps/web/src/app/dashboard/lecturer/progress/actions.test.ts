import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentSubmissions } from "@codi-1/db";

const state = vi.hoisted(() => ({
  verify: vi.fn(),
  transaction: vi.fn(),
  rows: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as Array<{
    table: string;
    fields: Record<string, unknown>;
    where: { sql: string; params: unknown[] };
    joins: string[];
    order: string[];
    compiled?: { sql: string; params: unknown[] };
  }>,
}));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: state.verify }));
vi.mock("@/services", async () => {
  const { getTableName, sql } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const compiler = drizzle.mock();
  const dialect = new PgDialect();
  const store = {
    select: (fields: Record<string, unknown>) => {
      const record: (typeof state.queries)[number] = {
        table: "",
        fields,
        where: { sql: "", params: [] as unknown[] },
        joins: [] as string[],
        order: [] as string[],
      };
      let built: any = compiler.select(fields as any);
      const query: any = {
        from: (table: Parameters<typeof getTableName>[0]) => {
          built = built.from(table);
          record.table = getTableName(table);
          state.queries.push(record);
          return query;
        },
        innerJoin: (table: unknown, condition: any) => {
          built = built.innerJoin(table, condition);
          record.joins.push(dialect.sqlToQuery(condition).sql);
          return query;
        },
        where: (condition: any) => {
          built = built.where(condition);
          record.where = dialect.sqlToQuery(condition);
          return query;
        },
        orderBy: (...conditions: any[]) => {
          built = built.orderBy(...conditions);
          record.order = conditions.map(
            (condition) => dialect.sqlToQuery(sql`${condition}`).sql,
          );
          return query;
        },
        groupBy: (...conditions: any[]) => {
          built = built.groupBy(...conditions);
          return query;
        },
        then: (resolve: any, reject: any) => {
          record.compiled = built.toSQL();
          return Promise.resolve(state.rows[record.table] ?? []).then(
            resolve,
            reject,
          );
        },
      };
      return query;
    },
  };
  return {
    db: {
      ...store,
      transaction: async (
        callback: (tx: typeof store) => unknown,
        options: unknown,
      ) => {
        state.transaction(options);
        return callback(store);
      },
    },
  };
});
import {
  getCourseLearnerProgress,
  getLecturerCoursesProgress,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  state.queries = [];
  state.verify.mockResolvedValue({ id: "teacher" });
  state.rows = {
    courses: [
      {
        id: "owned",
        title: "Course",
        instructorId: "teacher",
        status: "published",
      },
    ],
    course_lessons: [
      { id: "lesson", title: "Lesson", courseId: "owned", position: 1 },
    ],
    assessments: [
      {
        id: 10,
        lessonId: "lesson",
        type: "quiz",
        maxScore: 10,
        currentQuizRevision: 2,
      },
    ],
    student_enrollments: [
      {
        id: 1,
        courseId: "owned",
        enrollmentId: 1,
        userId: "learner",
        userName: "Learner",
        userImage: null,
        enrolledAt: new Date("2026-10-01"),
      },
    ],
    lesson_progress: [
      {
        enrollmentId: 1,
        lessonId: "lesson",
        status: "completed",
        completedCount: 1,
        lastAccessedAt: new Date("2026-10-21"),
        completedAt: new Date("2026-10-21"),
      },
    ],
    assessment_submissions: [
      {
        id: 1,
        assessmentId: 10,
        enrollmentId: 1,
        status: "graded",
        attempt: 1,
        score: 2,
        quizPercent: 20,
        quizRevision: 1,
        submittedAt: new Date("2026-10-19"),
      },
      {
        id: 2,
        assessmentId: 10,
        enrollmentId: 1,
        status: "graded",
        attempt: 2,
        score: 8,
        quizPercent: 80,
        quizRevision: 2,
        submittedAt: new Date("2026-10-20"),
      },
      {
        id: 3,
        assessmentId: 10,
        enrollmentId: 1,
        status: "draft",
        attempt: 3,
        score: null,
        quizPercent: null,
        quizRevision: 2,
        submittedAt: null,
      },
    ],
    quiz_questions: [
      {
        id: 50,
        assessmentId: 10,
        lessonId: "lesson",
        text: "Question",
        quizRevision: 2,
      },
    ],
    assessment_answers: [{ questionId: 50, isCorrect: true }],
  };
});

describe("owned-course progress readers", () => {
  it("returns persisted percent from the completed attempt, not raw marks or all attempts", async () => {
    const result = await getCourseLearnerProgress("owned");
    expect(result?.averageQuizScore).toBe(80);
    expect(result?.learners[0]?.lessons[0]?.quizScore).toBe(80);
    expect(result?.learners[0]?.progressPercent).toBe(100);
    const query = state.queries.find(
      (q) => q.table === "assessment_submissions",
    )!;
    expect(query.fields.quizPercent).toBe(assessmentSubmissions.quizPercent);
    expect(query.where.sql).toContain('"assessment_submissions"."status" =');
    expect(query.where.params).toContain("graded");
    expect(query.where.sql).toContain(
      '"assessment_submissions"."submitted_at" is not null',
    );
    expect(query.order.join(" ")).toContain(
      '"assessment_submissions"."attempt" desc',
    );
    expect(query.order.join(" ")).toContain(
      '"assessment_submissions"."id" desc',
    );
    expect(state.transaction).toHaveBeenCalledWith({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });
  it("keeps missing historical percent unknown instead of rescaling marks", async () => {
    state.rows.assessment_submissions![1]!.quizPercent = null;
    const result = await getCourseLearnerProgress("owned");
    expect(result?.averageQuizScore).toBeNull();
    expect(result?.learners[0]?.lessons[0]?.quizScore).toBeNull();
    expect(result?.learners[0]?.hintUsageCount).toBeNull();
  });
  it("binds owner, lesson-quiz eligibility, current question revision and selected evidence in SQL", async () => {
    await getCourseLearnerProgress("owned");
    const owner = state.queries[0]!;
    expect(owner.where.sql).toContain('"courses"."instructor_id" =');
    expect(owner.where.params).toEqual(["owned", "teacher"]);
    const assessments = state.queries.find((q) => q.table === "assessments")!;
    expect(assessments.where.sql).toContain('"assessments"."is_diagnostic" =');
    expect(assessments.where.params).toContain(false);
    expect(assessments.where.params).toContain("published");
    const questions = state.queries.find((q) => q.table === "quiz_questions")!;
    expect(questions.where.sql + questions.joins.join(" ")).toContain(
      '"quiz_questions"."quiz_revision" = "assessments"."current_quiz_revision"',
    );
    const answers = state.queries.find(
      (q) => q.table === "assessment_answers",
    )!;
    const sql = answers.where.sql + answers.joins.join(" ");
    expect(sql).toContain('"assessment_answers"."is_correct" is not null');
    expect(sql).toContain(
      '"assessment_submissions"."quiz_revision" = "assessments"."current_quiz_revision"',
    );
    expect(sql).toContain(
      '"quiz_questions"."quiz_revision" = "assessment_submissions"."quiz_revision"',
    );
    expect(sql).toContain('"student_enrollments"."course_id" =');
    expect(answers.where.params).toContain("owned");
    const selectedIds = answers.where.sql.match(
      /"assessment_submissions"\."id" in \(([^)]+)\)/,
    )![1]!;
    expect(
      [...selectedIds.matchAll(/\$(\d+)/g)].map(
        (match) => answers.where.params[Number(match[1]) - 1],
      ),
    ).toEqual([2]);
    expect(answers.compiled?.sql).toContain(
      'inner join "student_enrollments" on "assessment_submissions"."enrollment_id" = "student_enrollments"."id"',
    );
    expect(state.queries.some((q) => q.table === "ai_interaction_logs")).toBe(
      false,
    );
  });
  it("keeps no graded question evidence unknown", async () => {
    state.rows.assessment_answers = [];
    const result = await getCourseLearnerProgress("owned");
    expect(result?.quizQuestions[0]).toMatchObject({
      totalAnswers: 0,
      correctPercent: null,
      needsReview: false,
    });
  });
  it("does not put null correctness into the denominator even at the boundary", async () => {
    state.rows.assessment_answers = [
      { questionId: 50, isCorrect: null },
      { questionId: 50, isCorrect: true },
    ];
    const result = await getCourseLearnerProgress("owned");
    expect(result?.quizQuestions[0]).toMatchObject({
      totalAnswers: 1,
      correctPercent: 100,
    });
  });
  it("returns empty real-data states without querying absent enrollments", async () => {
    state.rows.student_enrollments = [];
    const result = await getCourseLearnerProgress("owned");
    expect(result?.learners).toEqual([]);
    expect(result?.averageQuizScore).toBeNull();
    expect(
      state.queries.some(
        (q) =>
          q.table === "assessment_submissions" ||
          q.table === "assessment_answers",
      ),
    ).toBe(false);
    state.rows.courses = [];
    expect(await getLecturerCoursesProgress()).toEqual([]);
  });
  it("rejects malformed course input before opening a snapshot", async () => {
    expect(await getCourseLearnerProgress(42 as unknown as string)).toBeNull();
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });
  it("does not query answer evidence for the latest completed old revision", async () => {
    state.rows.assessment_submissions![1]!.quizRevision = 1;
    const result = await getCourseLearnerProgress("owned");
    expect(result?.averageQuizScore).toBe(80);
    expect(result?.quizQuestions[0]?.correctPercent).toBeNull();
    expect(state.queries.some((q) => q.table === "assessment_answers")).toBe(
      false,
    );
  });
  it("denies unowned courses before learner reads and propagates auth failure", async () => {
    state.rows.courses = [];
    expect(await getCourseLearnerProgress("foreign")).toBeNull();
    expect(state.queries).toHaveLength(1);
    state.verify.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(getCourseLearnerProgress("owned")).rejects.toThrow(
      "Forbidden",
    );
    expect(state.queries).toHaveLength(1);
  });
  it("scopes overview completions to owned enrollments and actual course lessons", async () => {
    const result = await getLecturerCoursesProgress();
    expect(result[0]).toMatchObject({
      learnersCount: 1,
      averageCompletionRate: 100,
    });
    const progress = state.queries.find((q) => q.table === "lesson_progress")!;
    expect(progress.where.sql).toContain(
      '"lesson_progress"."enrollment_id" in',
    );
    expect(progress.where.sql).toContain('"lesson_progress"."lesson_id" in');
    expect(progress.where.params).toContain(1);
    expect(progress.where.params).toContain("lesson");
    const course = state.queries[0]!;
    expect(course.where.params).toEqual(["teacher", "published", "hidden"]);
  });
  it("does not disguise a failed read as an empty course", async () => {
    state.transaction.mockImplementationOnce(() => {
      throw new Error("Read failed");
    });
    await expect(getCourseLearnerProgress("owned")).rejects.toThrow(
      "Read failed",
    );
  });
  it("uses the installed driver's read-only snapshot syntax and rollback on failed reads", async () => {
    await getCourseLearnerProgress("owned");
    const config = state.transaction.mock.calls[0]![0];
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const query = vi.fn(async (_config: { text: string }) => ({ rows: [] }));
    const driver = drizzle({ client: { query } as any });
    await driver.transaction(async () => "read", config);
    expect(query.mock.calls.map(([statement]) => statement.text)).toEqual([
      "begin isolation level repeatable read read only",
      "commit",
    ]);
    query.mockClear();
    await expect(
      driver.transaction(async () => {
        throw new Error("failed read");
      }, config),
    ).rejects.toThrow("failed read");
    expect(query.mock.calls.map(([statement]) => statement.text)).toEqual([
      "begin isolation level repeatable read read only",
      "rollback",
    ]);
  });
});
