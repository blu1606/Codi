import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOnboardingService } from "./onboarding-service";
import { courses } from "@codi-1/db/schema/courses";
import { studentActivities, studentEnrollments } from "@codi-1/db/schema/student-profile";

describe("onboardingService advisor intake hydration", () => {
  let mockStore: any;
  let mockDb: any;

  beforeEach(() => {
    mockStore = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      set: vi.fn(),
    };

    mockStore.from.mockReturnValue(mockStore);
    mockStore.where.mockReturnValue(mockStore);
    mockStore.orderBy.mockReturnValue(mockStore);
    mockStore.limit.mockReturnValue(mockStore);
    mockStore.set.mockReturnValue(mockStore);

    mockDb = {
      transaction: vi.fn(async (cb: (tx: any) => Promise<any>, options?: any) => {
        return cb(mockStore);
      }),
    };
  });

  it("hydrates goalDraft in-memory during read-only get() without updating studentEnrollments", async () => {
    const enrollmentRow = {
      id: "enrollment-1",
      userId: "learner-1",
      courseId: "course-1",
      status: "active",
      goalSetAt: null,
      goalDraft: {},
      goalStep: 0,
      goalEditing: false,
      learningGoal: null,
      selfAssessedLevel: null,
      weeklyGoalMinutes: null,
      diagnosticStatus: "not_started",
      diagnosticQuestionIndex: 0,
      pathStatus: "none",
      pathSource: null,
    };

    const advisorActivity = {
      metadata: JSON.stringify({
        draft: {
          goal: "career",
          level: "intermediate",
          hours: 10,
        },
      }),
    };

    const courseRow = {
      id: "course-1",
      title: "Khóa học React Pro",
    };

    let selectCount = 0;
    mockStore.select.mockImplementation(() => {
      selectCount++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (selectCount === 1) {
              // First query: studentEnrollments
              return Promise.resolve([enrollmentRow]);
            }
            if (selectCount === 2) {
              // Second query: studentActivities for advisor_intake
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([advisorActivity]),
                }),
              };
            }
            if (selectCount === 3) {
              // Third query: courses
              return Promise.resolve([courseRow]);
            }
            if (selectCount === 4) {
              // Fourth query: assessments (diagnostic)
              return Promise.resolve([]);
            }
            if (selectCount === 5) {
              // Fifth query: personalizedLearningPaths
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          }),
        }),
      };
    });

    const service = createOnboardingService(mockDb);
    const view = await service.get("learner-1", "course-1");

    // Must execute inside a read-only repeatable read transaction
    expect(mockDb.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

    // Context must NOT invoke store.update during read-only get()
    expect(mockStore.update).not.toHaveBeenCalled();

    // The returned view must reflect the hydrated draft
    expect(view.enrollment.goalDraft).toEqual({
      goal: "career",
      level: "intermediate",
      hours: 10,
    });
    expect(view.course.id).toBe("course-1");
  });

  it("persists hydrated goalDraft to studentEnrollments when executing a writable command with lock", async () => {
    const enrollmentRow = {
      id: "enrollment-2",
      userId: "learner-2",
      courseId: "course-2",
      status: "active",
      goalSetAt: null,
      goalDraft: {},
      goalStep: 0,
      goalEditing: false,
      learningGoal: null,
      selfAssessedLevel: null,
      weeklyGoalMinutes: null,
      diagnosticStatus: "not_started",
      diagnosticQuestionIndex: 0,
      pathStatus: "none",
      pathSource: null,
    };

    const advisorActivity = {
      metadata: JSON.stringify({
        draft: {
          goal: "finish",
          level: "new",
          hours: 5,
        },
      }),
    };

    const courseRow = {
      id: "course-2",
      title: "Node.js Backend",
    };

    mockStore.select.mockImplementation(() => {
      return {
        from: vi.fn().mockImplementation((table: any) => {
          const firstVal = typeof table === "object" && table !== null ? (Object.values(table)[0] as any) : null;
          const tableName = table?.[Symbol.for("drizzle:Name")] || table?._?.name || table?._?.name?.name || firstVal?._?.name;
          return {
            where: vi.fn().mockImplementation(() => {
              const chain = {
                for: vi.fn().mockResolvedValue([enrollmentRow]),
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([advisorActivity]),
                }),
                limit: vi.fn().mockResolvedValue([advisorActivity]),
                then: (onfulfilled: any) => {
                  if (table === courses || tableName === "courses") {
                    return Promise.resolve([courseRow]).then(onfulfilled);
                  }
                  if (table === studentEnrollments || tableName === "student_enrollments") {
                    return Promise.resolve([enrollmentRow]).then(onfulfilled);
                  }
                  if (table === studentActivities || tableName === "student_activities") {
                    return Promise.resolve([advisorActivity]).then(onfulfilled);
                  }
                  return Promise.resolve([]).then(onfulfilled);
                },
              };
              return chain;
            }),
          };
        }),
      };
    });

    mockStore.update.mockReturnValue(mockStore);
    mockStore.set.mockReturnValue(mockStore);

    const service = createOnboardingService(mockDb);

    // Call execute with a command
    await service.execute("learner-2", "course-2", {
      type: "goal-pick",
      step: 0,
      value: "project",
    });

    // In writable execution, context updates studentEnrollments with hydrated intake
    expect(mockStore.update).toHaveBeenCalledWith(studentEnrollments);
    expect(mockStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        goalDraft: {
          goal: "finish",
          level: "new",
          hours: 5,
        },
      }),
    );
  });
});
