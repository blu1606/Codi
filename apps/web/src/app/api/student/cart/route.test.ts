import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { courses } from "@codi-1/db/schema/courses";
import { studentCart, studentEnrollments } from "@codi-1/db/schema/student-profile";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  delete: vi.fn(),
  getCartSummary: vi.fn(),
  removeFromCart: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER" },
  ForbiddenError: class ForbiddenError extends Error {},
  requireRole: mocks.requireRole,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: { select: mocks.select, insert: mocks.insert, delete: mocks.delete },
}));
vi.mock("@/lib/cart-service", () => ({
  getCartSummary: mocks.getCartSummary,
  removeFromCart: mocks.removeFromCart,
}));

import { ForbiddenError, ROLE } from "@codi-1/auth";
import { db } from "@/services";
import { DELETE, GET, POST } from "./route";

function postRequest(body: unknown = { courseId: "course-1" }) {
  return new NextRequest("http://localhost/api/student/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(query: string = "") {
  return new NextRequest(`http://localhost/api/student/cart${query}`, {
    method: "GET",
  });
}

function deleteRequest(body: unknown = { courseId: "course-1" }) {
  return new NextRequest("http://localhost/api/student/cart", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-test-session": "learner" }));
  mocks.getSession.mockResolvedValue({ user: { id: "learner-1" } });
  mocks.requireRole.mockResolvedValue(undefined);
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where, innerJoin: mocks.innerJoin });
  mocks.innerJoin.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit
    .mockResolvedValueOnce([{ id: "course-1" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });
  mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ courseId: "course-1" }]);
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.getCartSummary.mockResolvedValue({
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    voucher: null,
    removedOwnedTitles: [],
    pendingOrder: null,
  });
  mocks.removeFromCart.mockResolvedValue({ success: true, courseTitle: "Course 1" });
});

describe("GET /api/student/cart", () => {
  it("returns cart summary for authenticated learner", async () => {
    const res = await GET(getRequest("?voucher=WELCOME20"));
    expect(res.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalled();
    expect(mocks.requireRole).toHaveBeenCalledWith(db, "learner-1", ROLE.LEARNER);
    expect(mocks.getCartSummary).toHaveBeenCalledWith(db, "learner-1", "WELCOME20");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a learner", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError("Not a learner"));
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 500 when service throws unexpected error", async () => {
    mocks.getCartSummary.mockRejectedValue(new Error("DB error"));
    const res = await GET(getRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/student/cart core scenarios", () => {
  it("adds a course for the authenticated learner using the trimmed course ID", async () => {
    const response = await POST(postRequest({ courseId: "  course-1  ", userId: "another-user" }));
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
    expect((await POST(postRequest())).status).toBe(401);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing course without inserting", async () => {
    mocks.limit.mockReset().mockResolvedValue([]);
    expect((await POST(postRequest())).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("treats an existing cart item as an idempotent success", async () => {
    mocks.returning.mockResolvedValue([]);
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courseId: "course-1", added: false });
  });

  it("rejects a course the learner already owns", async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([{ id: "course-1" }]).mockResolvedValueOnce([{ courseId: "course-1" }]);
    expect((await POST(postRequest())).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a course if the learner has an active pending order containing this course", async () => {
    mocks.limit.mockReset()
      .mockResolvedValueOnce([{ id: "course-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ code: "CODI-99999" }]);

    const response = await POST(postRequest({ courseId: "course-1" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Khóa học này đang có đơn hàng chờ thanh toán. Vui lòng thanh toán hoặc huỷ đơn cũ.",
      orderCode: "CODI-99999",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a course if the learner has an active legacy pending transaction", async () => {
    mocks.limit.mockReset()
      .mockResolvedValueOnce([{ id: "course-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "TX-LEGACY-1" }]);

    const response = await POST(postRequest({ courseId: "course-1" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Khóa học này đang có đơn hàng chờ thanh toán. Vui lòng thanh toán hoặc huỷ đơn cũ.",
      orderCode: "TX-LEGACY-1",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/student/cart validation and failures", () => {
  it("returns 403 when learner authorization fails", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError("Missing learner role"));
    expect((await POST(postRequest())).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const invalidRequest = new NextRequest("http://localhost/api/student/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await POST(invalidRequest)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { courseId: 1 }, { courseId: " " }, { courseId: "x".repeat(201) }])(
    "returns 400 for invalid input %j",
    async (body) => {
      expect((await POST(postRequest(body))).status).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it("rejects a simple text/plain cross-origin request before database access", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/student/cart", {
        method: "POST",
        headers: { "Content-Type": "text/plain", Origin: "https://other.example" },
        body: JSON.stringify({ courseId: "course-1" }),
      }),
    );
    expect(response.status).toBe(415);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without exposing database exception details", async () => {
    mocks.returning.mockRejectedValue(new Error("private database connection details"));
    const response = await POST(postRequest());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("private database connection details");
  });
});

describe("DELETE /api/student/cart", () => {
  it("removes a course for authenticated learner", async () => {
    const res = await DELETE(deleteRequest({ courseId: "course-1" }));
    expect(res.status).toBe(200);
    expect(mocks.removeFromCart).toHaveBeenCalledWith(db, "learner-1", "course-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest({ courseId: "course-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a learner", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError("Not a learner"));
    const res = await DELETE(deleteRequest({ courseId: "course-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 415 for non-json content-type", async () => {
    const req = new NextRequest("http://localhost/api/student/cart", {
      method: "DELETE",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ courseId: "course-1" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(415);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/student/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it.each([null, [], {}, { courseId: 1 }, { courseId: " " }])(
    "returns 400 for invalid courseId %j",
    async (body) => {
      const res = await DELETE(deleteRequest(body));
      expect(res.status).toBe(400);
    },
  );

  it("returns 500 when removeFromCart throws", async () => {
    mocks.removeFromCart.mockRejectedValue(new Error("DB error"));
    const res = await DELETE(deleteRequest({ courseId: "course-1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/student/cart", () => {
  it("returns user cart items and count when authenticated", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.getCartSummary.mockResolvedValueOnce({
      items: [
        { id: "c-1", title: "C1", price: 100000 },
        { id: "c-2", title: "C2", price: 200000 },
      ],
      subtotal: 300000,
      discount: 0,
      total: 300000,
      voucher: null,
      removedOwnedTitles: [],
      pendingOrder: null,
    });
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.itemIds).toEqual(["c-1", "c-2"]);
    expect(body.total).toBe(300000);
  });
});
