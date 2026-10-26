import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@codi-1/db";
vi.mock("server-only", () => ({}));
import { analyticsWindow } from "./analytics-contract";
import { getAdminCount } from "./admin-analytics-service";

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
  it("returns zero for an empty admin creation aggregate without synthesizing activity", async () => {
    const f = database([0]);
    expect(await getAdminCount(f.db, "orders", "30")).toMatchObject({ value: 0 });
  });
});
