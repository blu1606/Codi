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

  it("getOwnership returns 'not-owned' if course is not found in DB", async () => {
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValueOnce([]); // no courses found

    const result = await getOwnership("user-1", "missing-course");
    expect(result).toEqual({ ownership: "not-owned" });
  });
});
