import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER" },
  ForbiddenError: class ForbiddenError extends Error {},
  requireRole: mocks.requireRole,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: {
    select: mocks.select,
    insert: mocks.insert,
    delete: mocks.delete,
    transaction: mocks.transaction,
  },
}));

import { ForbiddenError } from "@codi-1/auth";
import { POST } from "./route";

function request(body: unknown, headersInit?: Record<string, string>) {
  return new NextRequest("http://localhost/api/courses/enroll-free", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersInit },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.getSession.mockResolvedValue({ user: { id: "learner-1" } });
  mocks.requireRole.mockResolvedValue(undefined);

  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([
    { id: "course-free", price: 0, status: "published" },
  ]);

  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({
    onConflictDoNothing: mocks.onConflictDoNothing,
  });
  mocks.onConflictDoNothing.mockResolvedValue(undefined);

  mocks.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

  mocks.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    return callback({
      insert: mocks.insert,
      delete: mocks.delete,
    });
  });
});

describe("POST /api/courses/enroll-free", () => {
  it("returns 415 when Content-Type is not application/json", async () => {
    const req = new NextRequest("http://localhost/api/courses/enroll-free", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ courseId: "course-free" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Yêu cầu Content-Type application/json" });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await POST(request({ courseId: "course-free" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Vui lòng đăng nhập" });
  });

  it("returns 403 when caller is not a learner", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError("Not learner"));
    const res = await POST(request({ courseId: "course-free" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Chỉ tài khoản học viên mới có thể đăng ký khóa học.",
    });
  });

  it("returns 400 when body is invalid JSON or lacks courseId", async () => {
    const res1 = await POST(request("invalid-json"));
    expect(res1.status).toBe(400);

    const res2 = await POST(request({}));
    expect(res2.status).toBe(400);
    expect(await res2.json()).toEqual({ error: "Mã khóa học không hợp lệ" });
  });

  it("returns 404 when course is missing or not published", async () => {
    mocks.limit.mockResolvedValue([]);
    const res = await POST(request({ courseId: "nonexistent" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Không tìm thấy khóa học" });
  });

  it("returns 400 when course is not free (price > 0)", async () => {
    mocks.limit.mockResolvedValue([
      { id: "course-paid", price: 150000, status: "published" },
    ]);
    const res = await POST(request({ courseId: "course-paid" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Khóa học này có tính phí. Vui lòng thanh toán qua giỏ hàng.",
    });
  });

  it("enrolls learner into free course and cleans up cart", async () => {
    const res = await POST(request({ courseId: "course-free" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, courseId: "course-free" });

    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
  });
});
