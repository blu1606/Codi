import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/services", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});

import { GET } from "./route";

const course = {
  id: "course-a", slug: "frontend-react-nextjs", title: "Frontend React",
  category: "Frontend", level: "Beginner", duration: "8 tuần",
  description: "Khóa học từ database", price: 125000,
  instructorId: "instructor-1", rating: 4.5, reviewCount: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function row(enrollmentCount = "7", coverImageUrl: string | null = "/images/courses/frontend-react-nextjs.svg") {
  return [course.id, course.slug, course.title, course.category, course.level,
    course.duration, course.description, course.price, course.instructorId, course.rating, course.reviewCount, course.createdAt,
    enrollmentCount, coverImageUrl];
}

function request(query = "") {
  return GET(new NextRequest(`http://localhost/api/courses${query}`));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockResolvedValue({ rows: [row()] });
});

describe("GET /api/courses", () => {
  it.each(["", "?sort=title"])("sorts by title with a stable ID tie-breaker for %s", async (query) => {
    const response = await request(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courses: [{ ...course, enrollmentCount: 7, coverImageUrl: "/images/courses/frontend-react-nextjs.svg" }] });
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('order by "courses"."title" asc, "courses"."id" asc');
    expect(sql).not.toContain(" limit ");
    expect(params).toEqual([]);
  });

  it("sorts popular courses by actual enrollment rows, then title and ID", async () => {
    const response = await request("?sort=popular&limit=4");
    expect(response.status).toBe(200);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('order by count("student_enrollments"."id") desc, "courses"."title" asc, "courses"."id" asc');
    expect(sql).toContain(" limit $1");
    expect(params).toEqual([4]);
  });

  it("left-joins enrollment counts and covers without dropping courses with no matching rows", async () => {
    mocks.execute.mockResolvedValue({ rows: [row("0", null)] });
    const response = await request();
    expect(await response.json()).toEqual({ courses: [{ ...course, enrollmentCount: 0, coverImageUrl: null }] });
    const [sql] = mocks.execute.mock.calls[0];
    expect(sql).toContain('count("student_enrollments"."id")');
    expect(sql).not.toContain("count(*)");
    expect(sql).toContain('left join "student_enrollments" on "student_enrollments"."course_id" = "courses"."id"');
    expect(sql).toContain('left join "course_details" on "course_details"."course_id" = "courses"."id"');
    expect(sql).toContain('"course_details"."cover_image_url"');
    expect(sql).toContain('group by "courses"."id", "course_details"."cover_image_url"');
  });

  it.each([1, 100])("accepts the limit boundary %i", async (limit) => {
    expect((await request(`?limit=${limit}`)).status).toBe(200);
    expect(mocks.execute.mock.calls[0][1]).toEqual([limit]);
  });

  it.each(["0", "-1", "101", "1.5", "nope", "", " ", "Infinity"])("rejects invalid limit %j before querying", async (limit) => {
    const response = await request(`?limit=${encodeURIComponent(limit)}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Limit must be between 1 and 100" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["rating", "POPULAR", ""])("rejects unsupported sort %j before querying", async (sort) => {
    const response = await request(`?sort=${encodeURIComponent(sort)}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid sort" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an honest empty catalog", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courses: [] });
  });

  it("returns 500 on database failure instead of an empty catalog", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Không thể tải khóa học." });
    } finally {
      spy.mockRestore();
    }
  });
});
