import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  get: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/coding-runtime", () => ({ codingService: mocks }));
import { GET, POST } from "./route";
const origin = "https://codi.test";
const ctx = {
  params: Promise.resolve({
    courseId: "owned",
    lessonId: "lesson",
    assessmentId: "7",
  }),
};
const request = (body?: unknown, source: string | null = origin) =>
  new NextRequest(
    `${origin}/api/code?userId=victim`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(source ? { origin: source } : {}),
          },
          body: JSON.stringify(body),
        },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.get.mockResolvedValue({ id: 7 });
  mocks.execute.mockResolvedValue({ id: 7 });
});
describe("coding endpoint", () => {
  it("derives identity from the session and prevents caching", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.get).toHaveBeenCalledWith({
      userId: "viewer",
      courseId: "owned",
      lessonId: "lesson",
      assessmentId: 7,
    });
  });
  it("requires login and learner role", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), ctx)).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "viewer" } });
    mocks.roles.mockResolvedValue(["LECTURER"]);
    expect((await POST(request({ type: "run", code: "" }), ctx)).status).toBe(
      403,
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([null, "https://foreign.test"])(
    "rejects cross-site or missing origin %s",
    async (source) => {
      expect(
        (await POST(request({ type: "run", code: "" }, source), ctx)).status,
      ).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("accepts run/submit but rejects forged score and missing confirmation", async () => {
    expect(
      (await POST(request({ type: "run", code: "function f(){}" }), ctx))
        .status,
    ).toBe(200);
    expect(
      (await POST(request({ type: "submit", code: "", score: 100 }), ctx))
        .status,
    ).toBe(400);
    expect((await POST(request({ type: "reset" }), ctx)).status).toBe(400);
    expect(
      (await POST(request({ type: "solution", confirmed: true }), ctx)).status,
    ).toBe(200);
  });
  it("bounds the request body", async () => {
    expect(
      (await POST(request({ type: "draft", code: "x".repeat(400001) }), ctx))
        .status,
    ).toBe(413);
  });
});
