import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { courses } from "@codi-1/db/schema/courses";
import { studentCart, studentEnrollments } from "@codi-1/db/schema/student-profile";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), headers: vi.fn(), requireRole: vi.fn(),
  select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
  insert: vi.fn(), values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER" },
  ForbiddenError: class ForbiddenError extends Error {},
  requireRole: mocks.requireRole,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: { select: mocks.select, insert: mocks.insert },
}));

import { ForbiddenError, ROLE } from "@codi-1/auth";
import { db } from "@/services";
import { POST } from "./route";

function request(body: unknown = { courseId: "course-1" }) {
  return new NextRequest("http://localhost/api/student/cart", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-test-session": "learner" }));
  mocks.getSession.mockResolvedValue({ user: { id: "learner-1" } });
  mocks.requireRole.mockResolvedValue(undefined);
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValueOnce([{ id: "course-1" }]).mockResolvedValueOnce([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });
  mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ courseId: "course-1" }]);
});

describe("POST /api/student/cart core scenarios", () => {
  it("adds a course for the authenticated learner using the trimmed course ID", async () => {
    const response = await POST(request({ courseId: "  course-1  ", userId: "another-user" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ courseId: "course-1", added: true });
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: await mocks.headers.mock.results[0].value });
    expect(mocks.requireRole).toHaveBeenCalledWith(db, "learner-1", ROLE.LEARNER);
    expect(mocks.from).toHaveBeenNthCalledWith(1, courses);
    expect(mocks.from).toHaveBeenNthCalledWith(2, studentEnrollments);
    const dialect = new PgDialect();
    const courseQuery = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(courseQuery.params).toEqual(["course-1"]);
    expect(courseQuery.sql).toContain('"courses"."id"');
    const enrollmentQuery = dialect.sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(enrollmentQuery.params).toEqual(["learner-1", "course-1"]);
    expect(enrollmentQuery.sql).toContain('"student_enrollments"."user_id"');
    expect(enrollmentQuery.sql).toContain('"student_enrollments"."course_id"');
    expect(enrollmentQuery.sql).toContain(" and ");
    expect(mocks.insert).toHaveBeenCalledWith(studentCart);
    expect(mocks.values).toHaveBeenCalledWith({ userId: "learner-1", courseId: "course-1" });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({ target: [studentCart.userId, studentCart.courseId] });
  });

  it("rejects an unauthenticated request before database access", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValue([]);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("treats an existing cart item as an idempotent success", async () => {
    mocks.returning.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courseId: "course-1", added: false });
  });

  it("rejects a course the learner already owns", async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([{ id: "course-1" }]).mockResolvedValueOnce([{ courseId: "course-1" }]);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/student/cart validation and failures", () => {
  it("returns 403 when learner authorization fails", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError("Missing learner role"));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const invalidRequest = new NextRequest("http://localhost/api/student/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect((await POST(invalidRequest)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { courseId: 1 }, { courseId: " " }, { courseId: "x".repeat(201) }])("returns 400 for invalid input %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a simple text/plain cross-origin request before database access", async () => {
    const response = await POST(new NextRequest("http://localhost/api/student/cart", {
      method: "POST", headers: { "Content-Type": "text/plain", Origin: "https://other.example" },
      body: JSON.stringify({ courseId: "course-1" }),
    }));
    expect(response.status).toBe(415);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without exposing database exception details", async () => {
    mocks.returning.mockRejectedValue(new Error("private database connection details"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("private database connection details");
  });
});
