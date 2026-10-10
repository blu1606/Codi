import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { studentCart } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
  insert: vi.fn(), values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(),
}));
vi.mock("@/services", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
import { addCourseToCart } from "./add-course-to-cart";
import { loadTestData } from "./load-test-data";

interface AddCourseToCartFixtures {
  user: {
    id: string;
  };
  courses: {
    available: { id: string };
    missing: { id: string };
  };
  expectedResults: {
    added: { kind: "added"; courseId: string };
    notFound: { kind: "not-found" };
    alreadyInCart: { kind: "already-in-cart"; courseId: string };
    alreadyOwned: { kind: "already-owned" };
  };
  errors: {
    dbUnavailable: string;
  };
}

const fixtures = loadTestData<AddCourseToCartFixtures>("add-course-to-cart-fixtures.json");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValueOnce([{ id: fixtures.courses.available.id }]).mockResolvedValueOnce([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });
  mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ courseId: fixtures.courses.available.id }]);
});

describe("addCourseToCart", () => {
  it("adds an available course to the learner cart", async () => {
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.added);
    expect(mocks.insert).toHaveBeenCalledWith(studentCart);
    expect(mocks.values).toHaveBeenCalledWith({
      userId: fixtures.user.id,
      courseId: fixtures.courses.available.id,
    });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([fixtures.courses.available.id]);
    const enrollment = dialect.sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(enrollment.params).toEqual([fixtures.user.id, fixtures.courses.available.id]);
    expect(enrollment.sql).toContain('"student_enrollments"."user_id"');
    expect(enrollment.sql).toContain('"student_enrollments"."course_id"');
    expect(enrollment.sql).toContain(" and ");
  });

  it("rejects a missing course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValue([]);
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.missing.id))
      .resolves.toEqual(fixtures.expectedResults.notFound);
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([fixtures.courses.missing.id]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns already-in-cart for a duplicate without creating another item", async () => {
    mocks.returning.mockResolvedValue([]);
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.alreadyInCart);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({ target: [studentCart.userId, studentCart.courseId] });
  });

  it("rejects an already-owned course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([{ id: fixtures.courses.available.id }]).mockResolvedValueOnce([{ courseId: fixtures.courses.available.id }]);
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.alreadyOwned);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("propagates a persistence failure to the caller", async () => {
    const error = new Error(fixtures.errors.dbUnavailable);
    mocks.returning.mockRejectedValue(error);
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id)).rejects.toBe(error);
  });
});
