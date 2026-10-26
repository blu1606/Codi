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
  status: "published",
};

function row(enrollmentCount = "7", coverImageUrl: string | null = "/images/courses/frontend-react-nextjs.svg", status = "published", topics: string[] = ["React", "Next.js"]) {
  return [course.id, course.slug, course.title, course.category, course.level,
    course.duration, course.description, course.price, course.instructorId, course.rating, course.reviewCount, course.createdAt,
    status,
    enrollmentCount, coverImageUrl, "Lecturer", topics];
}

function request(query = "") {
  return GET(new NextRequest(`http://localhost/api/courses${query}`));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockResolvedValue({ rows: [row()] });
});

describe("GET /api/courses", () => {
  it("keeps topic eligibility inside the aggregate rather than filtering out courses", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('CASE WHEN (("courses"."status" = $1) and ("courses"."knowledge_map_status" = $2) and ("skills"."review" in ($3, $4))) THEN "skills"."name" END');
    expect(params).toEqual(["published", "confirmed", "accepted", "edited", "published"]);
    expect(sql).toContain('ARRAY_REMOVE(ARRAY_AGG(DISTINCT CASE WHEN');
    expect(sql).toContain('ARRAY[]::text[]');
    expect(sql.match(/where (.*?) group by/)?.[1]).toBe('"courses"."status" = $5');
    expect(sql).toContain('count(distinct "student_enrollments"."id")');
  });

  it.each([
    ["published", "confirmed", "accepted", true],
    ["published", "confirmed", "edited", true],
    ["published", "confirmed", "suggested", false],
    ["published", "confirmed", "declined", false],
    ...["empty", "analysing", "ready", "failed", "stale"].flatMap((mapState) =>
      ["accepted", "edited"].map((review) => ["published", mapState, review, false]),
    ),
    ["hidden", "confirmed", "accepted", false],
    ["hidden", "confirmed", "edited", false],
    ["draft", "confirmed", "accepted", false],
    ["pending", "confirmed", "accepted", false],
    ["rejected", "confirmed", "accepted", false],
  ])("binds topic eligibility for %s / %s / %s to %s", async (status, mapState, review, expected) => {
    await request("?include_hidden=true");
    const [sql, params] = mocks.execute.mock.calls[0];
    // Exact compiled conjunction plus its bindings establish this truth table;
    // this is not PostgreSQL row/aggregate execution.
    expect(sql.match(/CASE WHEN (.*?) THEN/)?.[1]).toBe('(("courses"."status" = $1) and ("courses"."knowledge_map_status" = $2) and ("skills"."review" in ($3, $4)))');
    expect(params).toEqual(["published", "confirmed", "accepted", "edited", "published", "hidden"]);
    const [requiredStatus, requiredMapState, ...eligibleReviews] = params.slice(0, 4);
    expect(status === requiredStatus && mapState === requiredMapState && eligibleReviews.includes(review)).toBe(expected);
    expect(sql.match(/where (.*?) group by/)?.[1]).toBe('"courses"."status" in ($5, $6)');
  });

  it("retains courses and enrollment counts when topic arrays are empty", async () => {
    const retainedRows = ["empty", "analysing", "ready", "failed", "stale"].map((state) => {
      const retained = row("2", null, "published", []);
      retained[0] = `course-${state}`;
      return retained;
    });
    mocks.execute.mockResolvedValue({ rows: retainedRows });
    const response = await request("?sort=popular");
    const body = await response.json();
    expect(body.courses).toHaveLength(5);
    expect(body.courses.map((entry: { id: string }) => entry.id)).toEqual(retainedRows.map((entry) => entry[0]));
    expect(body.courses.every((entry: { topics: string[]; enrollmentCount: number }) => entry.topics.length === 0 && entry.enrollmentCount === 2)).toBe(true);
    const [sql] = mocks.execute.mock.calls[0];
    expect(sql.match(/where (.*?) group by/)?.[1]).toBe('"courses"."status" = $5');
    expect(sql).toContain('order by count(distinct "student_enrollments"."id") desc');
  });

  it.each([""])("sorts by title with a stable ID tie-breaker for %s", async (query) => {
    const response = await request(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courses: [{ ...course, enrollmentCount: 7, coverImageUrl: "/images/courses/frontend-react-nextjs.svg", instructorName: "Lecturer", topics: ["React", "Next.js"] }] });
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('where "courses"."status" = $5');
    expect(sql).toContain('order by "courses"."title" asc, "courses"."id" asc');
    expect(sql).not.toContain(" limit ");
    expect(params).toEqual(["published", "confirmed", "accepted", "edited", "published"]);
  });

  it("includes hidden courses when include_hidden=true is provided", async () => {
    const response = await request("?include_hidden=true");
    expect(response.status).toBe(200);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('"courses"."status" in ($5, $6)');
    expect(params).toEqual(["published", "confirmed", "accepted", "edited", "published", "hidden"]);
  });

  it("sorts popular courses by actual enrollment rows, then title and ID", async () => {
    const response = await request("?sort=popular&limit=4");
    expect(response.status).toBe(200);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('where "courses"."status" = $5');
    expect(sql).toContain('order by count(distinct "student_enrollments"."id") desc, "courses"."title" asc, "courses"."id" asc');
    expect(sql).toContain(" limit $6");
    expect(params).toEqual(["published", "confirmed", "accepted", "edited", "published", 4]);
  });

  it("left-joins enrollment counts, covers and skills without dropping courses with no matching rows", async () => {
    mocks.execute.mockResolvedValue({ rows: [row("0", null, "published", [])] });
    const response = await request();
    expect(await response.json()).toEqual({ courses: [{ ...course, enrollmentCount: 0, coverImageUrl: null, instructorName: "Lecturer", topics: [] }] });
    const [sql] = mocks.execute.mock.calls[0];
    expect(sql).toContain('count(distinct "student_enrollments"."id")');
    expect(sql).not.toContain("count(*)");
    expect(sql).toContain('left join "student_enrollments" on "student_enrollments"."course_id" = "courses"."id"');
    expect(sql).toContain('left join "course_details" on "course_details"."course_id" = "courses"."id"');
    expect(sql).toContain('left join "skills" on "skills"."course_id" = "courses"."id"');
    expect(sql).toContain('where "courses"."status" = $5');
    expect(sql).toContain('"course_details"."cover_image_url"');
    expect(sql).toContain('group by "courses"."id", "course_details"."cover_image_url"');
  });

  it("regression: does not multiply enrollmentCount by number of skills when sorting by popular", async () => {
    // Course A has 2 enrollments and 3 skills.
    // Course B has 3 enrollments and 1 skill.
    // Course B must have enrollmentCount: 3 and Course A must have enrollmentCount: 2.
    // When sorted by popular, Course B (3) must rank ahead of Course A (2).
    const courseA = {
      ...course,
      id: "course-a",
      title: "Course A",
      enrollmentCount: 2,
      topics: ["Skill 1", "Skill 2", "Skill 3"],
    };
    const courseB = {
      ...course,
      id: "course-b",
      title: "Course B",
      enrollmentCount: 3,
      topics: ["Skill 1"],
    };

    // The SQL query orders by count(distinct student_enrollments.id) desc,
    // which ensures Course B with 3 distinct enrollments comes before Course A with 2.
    mocks.execute.mockResolvedValue({
      rows: [
        [
          courseB.id, courseB.slug, courseB.title, courseB.category, courseB.level,
          courseB.duration, courseB.description, courseB.price, courseB.instructorId,
          courseB.rating, courseB.reviewCount, courseB.createdAt, courseB.status,
          "3", "/images/courses/frontend-react-nextjs.svg", "Lecturer", courseB.topics,
        ],
        [
          courseA.id, courseA.slug, courseA.title, courseA.category, courseA.level,
          courseA.duration, courseA.description, courseA.price, courseA.instructorId,
          courseA.rating, courseA.reviewCount, courseA.createdAt, courseA.status,
          "2", "/images/courses/frontend-react-nextjs.svg", "Lecturer", courseA.topics,
        ],
      ],
    });

    const response = await request("?sort=popular");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.courses[0].id).toBe("course-b");
    expect(body.courses[0].enrollmentCount).toBe(3);
    expect(body.courses[1].id).toBe("course-a");
    expect(body.courses[1].enrollmentCount).toBe(2);

    const [sql] = mocks.execute.mock.calls[0];
    expect(sql).toContain('count(distinct "student_enrollments"."id")');
    expect(sql).toContain('order by count(distinct "student_enrollments"."id") desc');
  });

  it.each([1, 100])("accepts the limit boundary %i", async (limit) => {
    expect((await request(`?limit=${limit}`)).status).toBe(200);
    expect(mocks.execute.mock.calls[0][1]).toEqual(["published", "confirmed", "accepted", "edited", "published", limit]);
  });

  it.each(["0", "-1", "101", "1.5", "nope", ""])("rejects invalid limit %j before querying", async (limit) => {
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
