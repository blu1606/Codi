import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { orders, studentCart, studentTransactions } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn(),
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
    pendingPayment: { kind: "pending-payment"; orderCode: string };
  };
  errors: {
    dbUnavailable: string;
  };
}

const fixtures = loadTestData<AddCourseToCartFixtures>("add-course-to-cart-fixtures.json");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where, innerJoin: mocks.innerJoin, leftJoin: mocks.leftJoin });
  mocks.innerJoin.mockReturnValue({ where: mocks.where });
  mocks.leftJoin.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit
    .mockResolvedValueOnce([{ id: fixtures.courses.available.id }]) // course lookup
    .mockResolvedValueOnce([]) // enrollment lookup
    .mockResolvedValueOnce([]) // pending order lookup
    .mockResolvedValueOnce([]); // legacy tx lookup
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

  it("rejects a course with an active pending order containing this course", async () => {
    mocks.limit.mockReset()
      .mockResolvedValueOnce([{ id: fixtures.courses.available.id }]) // course found
      .mockResolvedValueOnce([]) // not enrolled
      .mockResolvedValueOnce([{ code: fixtures.expectedResults.pendingPayment.orderCode }]); // pending order found

    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.pendingPayment);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a course with an active legacy pending transaction", async () => {
    mocks.limit.mockReset()
      .mockResolvedValueOnce([{ id: fixtures.courses.available.id }]) // course found
      .mockResolvedValueOnce([]) // not enrolled
      .mockResolvedValueOnce([]) // no pending order
      .mockResolvedValueOnce([{ id: fixtures.expectedResults.pendingPayment.orderCode }]); // legacy pending transaction found

    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.pendingPayment);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("allows adding to cart when corresponding canonical order is terminal (failed/expired)", async () => {
    mocks.limit.mockReset()
      .mockResolvedValueOnce([{ id: fixtures.courses.available.id }]) // course found
      .mockResolvedValueOnce([]) // not enrolled
      .mockResolvedValueOnce([]) // no pending order
      .mockResolvedValueOnce([]); // legacy query filtered out because order is terminal

    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id))
      .resolves.toEqual(fixtures.expectedResults.added);
    expect(mocks.insert).toHaveBeenCalledWith(studentCart);

    // Verify query structure for legacy fallback and terminal order exclusion
    expect(mocks.from).toHaveBeenNthCalledWith(4, studentTransactions);
    expect(mocks.leftJoin).toHaveBeenCalledWith(orders, expect.anything());

    const dialect = new PgDialect();
    const joinOn = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]);
    expect(joinOn.sql).toContain('"orders"."code"');
    expect(joinOn.sql).toContain('"student_transactions"."id"');

    const legacyWhere = dialect.sqlToQuery(mocks.where.mock.calls[3][0]);
    expect(legacyWhere.params).toEqual([
      fixtures.user.id,
      "pending",
      fixtures.courses.available.id,
      "pending",
    ]);
    expect(legacyWhere.sql).toContain('"student_transactions"."user_id"');
    expect(legacyWhere.sql).toContain('"student_transactions"."status"');
    expect(legacyWhere.sql).toContain('"student_transactions"."course_id"');
    expect(legacyWhere.sql).toContain('"orders"."id" is null');
    expect(legacyWhere.sql).toContain('"orders"."status"');
    expect(legacyWhere.sql).toContain("or");
  });

  it("propagates a persistence failure to the caller", async () => {
    const error = new Error(fixtures.errors.dbUnavailable);
    mocks.returning.mockRejectedValue(error);
    await expect(addCourseToCart(fixtures.user.id, fixtures.courses.available.id)).rejects.toBe(error);
  });
});
