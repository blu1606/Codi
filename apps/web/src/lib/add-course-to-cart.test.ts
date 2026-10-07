import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { studentCart } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
  insert: vi.fn(), values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(),
}));
vi.mock("@/services", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
import { addCourseToCart } from "./add-course-to-cart";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValueOnce([{ id: "course-1" }]).mockResolvedValueOnce([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });
  mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ courseId: "course-1" }]);
});

describe("addCourseToCart", () => {
  it("adds an available course to the learner cart", async () => {
    await expect(addCourseToCart("learner-1", "course-1")).resolves.toEqual({ kind: "added", courseId: "course-1" });
    expect(mocks.insert).toHaveBeenCalledWith(studentCart);
    expect(mocks.values).toHaveBeenCalledWith({ userId: "learner-1", courseId: "course-1" });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual(["course-1"]);
    const enrollment = dialect.sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(enrollment.params).toEqual(["learner-1", "course-1"]);
    expect(enrollment.sql).toContain('"student_enrollments"."user_id"');
    expect(enrollment.sql).toContain('"student_enrollments"."course_id"');
    expect(enrollment.sql).toContain(" and ");
  });

  it("rejects a missing course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValue([]);
    await expect(addCourseToCart("learner-1", "course-1")).resolves.toEqual({ kind: "not-found" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns already-in-cart for a duplicate without creating another item", async () => {
    mocks.returning.mockResolvedValue([]);
    await expect(addCourseToCart("learner-1", "course-1")).resolves.toEqual({ kind: "already-in-cart", courseId: "course-1" });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({ target: [studentCart.userId, studentCart.courseId] });
  });

  it("rejects an already-owned course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([{ id: "course-1" }]).mockResolvedValueOnce([{ courseId: "course-1" }]);
    await expect(addCourseToCart("learner-1", "course-1")).resolves.toEqual({ kind: "already-owned" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("propagates a persistence failure to the caller", async () => {
    const error = new Error("Database unavailable");
    mocks.returning.mockRejectedValue(error);
    await expect(addCourseToCart("learner-1", "course-1")).rejects.toBe(error);
  });
});
