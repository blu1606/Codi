import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  getCourseOwnershipMap: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/course-ownership-server", () => ({
  getCourseOwnershipMap: mocks.getCourseOwnershipMap,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/courses/ownership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.getSession.mockResolvedValue(null);
  mocks.getCourseOwnershipMap.mockResolvedValue({
    "course-1": { ownership: "not-owned" },
  });
});

describe("POST /api/courses/ownership", () => {
  it("rejects invalid JSON", async () => {
    const res = await POST(request("invalid-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "JSON không hợp lệ" });
  });

  it("rejects missing courses array", async () => {
    const res = await POST(request({ invalid: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "courses must be an array" });
  });

  it("resolves ownership for guest user", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.getCourseOwnershipMap.mockResolvedValue({
      "course-1": { ownership: "not-owned" },
      "course-free": { ownership: "free" },
    });

    const res = await POST(
      request({
        courses: [
          { id: "course-1", price: 100000 },
          { id: "course-free", price: 0 },
        ],
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ownerships).toEqual({
      "course-1": { ownership: "not-owned" },
      "course-free": { ownership: "free" },
    });
    expect(data.ownership).toEqual(data.ownerships);
    expect(mocks.getCourseOwnershipMap).toHaveBeenCalledWith(null, [
      { id: "course-1", price: 100000 },
      { id: "course-free", price: 0 },
    ]);
  });

  it("resolves ownership for authenticated user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.getCourseOwnershipMap.mockResolvedValue({
      "course-1": { ownership: "owned" },
    });

    const res = await POST(
      request({
        courses: [{ id: "course-1", price: 100000 }],
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ownerships).toEqual({
      "course-1": { ownership: "owned" },
    });
    expect(mocks.getCourseOwnershipMap).toHaveBeenCalledWith("learner-1", [
      { id: "course-1", price: 100000 },
    ]);
  });
});
