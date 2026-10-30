import { describe, expect, it, vi } from "vitest";
import { studentEnrollments } from "@codi-1/db";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  formatVnd,
  levelLabel,
  getLearnerProgressContext,
  logAdvisorInteraction,
} from "./ai-advisor-service";

describe("ai-advisor-service business logic", () => {
  it("formats VND properly", () => {
    expect(formatVnd(0)).toBe("Miễn phí");
    expect(formatVnd(1290000)).toMatch(/1\.290\.000\s?₫/);
  });

  it("maps level labels to Vietnamese standard", () => {
    expect(levelLabel("Beginner")).toBe("Cơ bản");
    expect(levelLabel("Intermediate")).toBe("Trung cấp");
    expect(levelLabel("Advanced")).toBe("Nâng cao");
  });
});

describe("advisor intake owner storage", () => {
  it("logs the provider model and token usage of an answer", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: 42 }] }));
    const db: any = { insert: () => ({ values }) };
    expect(await logAdvisorInteraction(db, {
      userId: null, userPrompt: "So sánh khoá học", aiResponse: "answer", latencyMs: 5, isSuccess: true,
      model: "gpt-6-luna", promptTokens: 900, completionTokens: 120,
    })).toBe(42);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-6-luna", promptTokens: 900, completionTokens: 120, isSuccess: true, requestType: "ask_advisor",
    }));
  });

  it("loads only the requested owner's saved activity when there are no enrollments", async () => {
    const intake = { goal: "Làm được dự án", level: "Mới bắt đầu", hoursPerWeek: "< 5 giờ" };
    const predicates: unknown[] = [];
    const db: any = { select: () => ({ from: (table: unknown) => ({
      innerJoin() { return this; },
      where(predicate: unknown) { predicates.push(predicate); return this; },
      orderBy() { return table === studentEnrollments ? Promise.resolve([]) : this; },
      limit: async () => [{ metadata: JSON.stringify({ type: "advisor_intake", intake }) }],
    }) }) };
    expect(await getLearnerProgressContext(db, "saved-owner")).toEqual({
      currentCourse: null, ownedCourseIds: [], savedIntake: intake,
    });
    const activityQuery = new PgDialect().sqlToQuery(predicates[1] as any);
    expect(activityQuery.params).toEqual(["saved-owner", "course_view", "%advisor_intake%"]);
    expect(activityQuery.sql).toContain('"student_activities"."user_id"');
  });
});
