import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  innerJoin: vi.fn(),
}));

vi.mock("@/services", () => ({
  db: {
    select: mocks.select,
  },
}));

import { getCourseOwnershipMap, getOwnership } from "./course-ownership-server";

describe("getCourseOwnershipMap (Server DB Integration)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("omits courses that are missing or not published in DB", async () => {
    // Only published courses are returned by db.select()
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    // First query: db.select({ id, price }).from(courses).where(...)
    mocks.where.mockResolvedValueOnce([
      { id: "course-published-1", price: 100000 },
    ]);

    const result = await getCourseOwnershipMap(null, [
      "course-published-1",
      "course-unpublished-or-missing",
    ]);

    expect(result).toEqual({
      "course-published-1": { ownership: "not-owned" },
    });
    expect(result["course-unpublished-or-missing"]).toBeUndefined();
  });

  it("resolves free course for guest", async () => {
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValueOnce([
      { id: "course-free", price: 0 },
    ]);

    const result = await getCourseOwnershipMap(null, ["course-free"]);
    expect(result).toEqual({
      "course-free": { ownership: "free" },
    });
  });

  it("resolves ownership for authenticated user querying enrollments, orders, and cart", async () => {
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockImplementation(() => ({
      where: mocks.where,
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: mocks.innerJoin,
    }));
    mocks.innerJoin.mockReturnValue({ where: mocks.where });

    // 1. courses query
    mocks.where.mockResolvedValueOnce([
      { id: "course-1", price: 200000 },
      { id: "course-2", price: 300000 },
    ]);
    // 2. enrollments query -> course-1 is enrolled
    mocks.where.mockResolvedValueOnce([
      { courseId: "course-1" },
    ]);
    // 3. pending orders query -> empty
    mocks.where.mockResolvedValueOnce([]);
    // 4. legacy transactions query -> empty
    mocks.where.mockResolvedValueOnce([]);
    // 5. cart rows query -> course-2 in cart
    mocks.where.mockResolvedValueOnce([
      { courseId: "course-2" },
    ]);

    const result = await getCourseOwnershipMap("user-1", ["course-1", "course-2"]);
    expect(result).toEqual({
      "course-1": { ownership: "owned" },
      "course-2": { ownership: "in-cart" },
    });
  });

  it("verifies legacy transaction query boundary: left join on orders and 30-minute expiration", async () => {
    const leftJoinMock = vi.fn().mockReturnThis();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockImplementation(() => ({
      where: mocks.where,
      leftJoin: leftJoinMock,
      innerJoin: mocks.innerJoin,
    }));
    mocks.innerJoin.mockReturnValue({ where: mocks.where });

    // 1. courses query -> course-1 published
    mocks.where.mockResolvedValueOnce([
      { id: "course-1", price: 200000 },
    ]);
    // 2. enrollments query -> not enrolled
    mocks.where.mockResolvedValueOnce([]);
    // 3. pending canonical orders query -> none
    mocks.where.mockResolvedValueOnce([]);
    // 4. legacy transactions query -> returns legacy tx (e.g. active orphan within 30 min)
    mocks.where.mockResolvedValueOnce([
      { courseId: "course-1", txId: "TX_12345" },
    ]);
    // 5. cart rows query -> empty
    mocks.where.mockResolvedValueOnce([]);

    const result = await getCourseOwnershipMap("user-1", ["course-1"]);
    expect(result).toEqual({
      "course-1": { ownership: "pending-payment", pendingOrderId: "TX_12345" },
    });

    // Check leftJoin and where on studentTransactions
    expect(leftJoinMock).toHaveBeenCalled();
    const calls = mocks.where.mock.calls;
    // Call 4 is the legacy transactions where clause
    const legacyWhere = calls[3][0];
    expect(legacyWhere).toBeDefined();

    // Verify dialect query parameters for user, pending status, courseIds, and cutoff date
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const compiled = dialect.sqlToQuery(legacyWhere);
    expect(compiled.sql).toContain('"student_transactions"."user_id"');
    expect(compiled.sql).toContain('"student_transactions"."status"');
    expect(compiled.sql).toContain('"student_transactions"."course_id"');
    expect(compiled.sql).toContain('"orders"."id" is null');
    expect(compiled.sql).toContain('"orders"."status"');
    expect(compiled.sql).toContain('"student_transactions"."created_at" >=');

    expect(compiled.params).toEqual([
      "user-1",
      "pending",
      "course-1",
      "pending",
      expect.any(String),
    ]);
  });

  it("getOwnership returns 'not-owned' if course is not found in DB", async () => {
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValueOnce([]); // no courses found

    const result = await getOwnership("user-1", "missing-course");
    expect(result).toEqual({ ownership: "not-owned" });
  });
});
