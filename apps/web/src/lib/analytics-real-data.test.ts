import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@codi-1/db";
vi.mock("server-only", () => ({}));
import { analyticsWindow } from "./analytics-contract";
import { getAdminCount } from "./admin-analytics-service";
import { getLearnerStatsData } from "./learner-insights-service";

function database(values: number[]) {
  const conditions: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const selections: unknown[] = [];
  const joins: unknown[] = [];
  const db = { select: vi.fn((selection) => {
    selections.push(selection);
    const rows = [{ value: values.shift() ?? 0 }];
    return { from: () => ({
      where: (condition: SQL) => { conditions.push(new PgDialect().sqlToQuery(condition)); return Promise.resolve(rows); },
      innerJoin: (_table: unknown, condition: SQL) => {
        joins.push(new PgDialect().sqlToQuery(condition));
        return { where: (where: SQL) => { conditions.push(new PgDialect().sqlToQuery(where)); return Promise.resolve(rows); } };
      },
    }) };
  }) };
  return { db: db as unknown as Database, conditions, selections, joins };
}

describe("persisted analytics", () => {
  it("uses GMT+7 calendar boundaries including today, with exclusive next midnight", () => {
    const w = analyticsWindow("7", new Date("2026-10-22T18:00:00Z"));
    expect(w).toMatchObject({ start: "2026-10-16T17:00:00.000Z", end: "2026-10-23T17:00:00.000Z", timeZone: "Asia/Ho_Chi_Minh" });
    expect(analyticsWindow("month", new Date("2026-03-01T00:00:00Z")).start).toBe("2026-02-28T17:00:00.000Z");
    expect(() => analyticsWindow("bad")).toThrow();
  });
  it.each(["users", "courses", "orders"] as const)("counts %s by creation date, not activity or settlement", async (metric) => {
    const f = database([4]);
    const result = await getAdminCount(f.db, metric, "7", new Date("2026-10-23T00:00:00Z"));
    expect(result.value).toBe(4);
    const query = f.conditions[0]!;
    expect(query.sql).toContain('"created_at" >=');
    expect(query.sql).toContain('"created_at" <');
    expect(query.params).toEqual([result.window.start, result.window.end]);
    expect(new PgDialect().sqlToQuery((f.selections[0] as { value: SQL }).value).sql).toContain("count(*)");
  });
  it.each(["alice", "bob"])("scopes every learner aggregate to trusted owner %s and course", async (owner) => {
    const values = owner === "alice" ? [2, 1, 3] : [0, 0, 0];
    const f = database([...values]);
    const result = await getLearnerStatsData(f.db, owner, "7", "course-a");
    expect(result).toMatchObject({ enrollments: values[0], completedLessons: values[1], studiedLessons: values[2] });
    expect(f.conditions).toHaveLength(3);
    for (const q of f.conditions) {
      expect(q.params).toContain(owner);
      expect(q.params).toContain("course-a");
      expect(q.sql).toContain('"user_id" =');
    }
    expect(f.joins).toHaveLength(2);
    for (const join of f.joins as { sql: string }[]) {
      expect(join.sql).toContain('"lesson_progress"."enrollment_id" = "student_enrollments"."id"');
    }
    expect(f.conditions[1]!.sql).toContain('"completed_at" >=');
    expect(f.conditions[1]!.params).toContain("completed");
    expect(f.conditions[2]!.sql).toContain('"studied_at" >=');
  });
  it("returns real empty counts as zero but duration as unavailable", async () => {
    const f = database([0, 0, 0]);
    expect(await getLearnerStatsData(f.db, "new-user", "30", "all")).toMatchObject({ enrollments: 0, completedLessons: 0, studiedLessons: 0, studyMinutes: null });
    expect(f.conditions.every((q) => !q.params.includes("all"))).toBe(true);
  });
  it("returns zero for an empty admin creation aggregate without synthesizing activity", async () => {
    const f = database([0]);
    expect(await getAdminCount(f.db, "orders", "30")).toMatchObject({ value: 0 });
  });
  it("fails closed on missing learner identity before querying", async () => {
    const f = database([]);
    await expect(getLearnerStatsData(f.db, "", "30", "all")).rejects.toThrow();
    expect(f.conditions).toHaveLength(0);
  });
});
