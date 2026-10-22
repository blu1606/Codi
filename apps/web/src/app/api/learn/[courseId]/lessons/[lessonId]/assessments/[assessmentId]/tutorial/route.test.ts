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
vi.mock("@/lib/tutorial-runtime", () => ({ tutorialService: mocks }));
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
    `${origin}/api/tutorial?userId=victim`,
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
  mocks.get.mockResolvedValue({ current: 0 });
  mocks.execute.mockResolvedValue({ current: 1 });
});
describe("tutorial endpoint", () => {
  it("uses the authenticated learner and private/no-store responses", async () => {
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
  it("requires login, learner role and a valid assessment id", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), ctx)).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "viewer" } });
    mocks.roles.mockResolvedValue(["LECTURER"]);
    expect((await POST(request({ type: "step", step: 1 }), ctx)).status).toBe(
      403,
    );
    mocks.roles.mockResolvedValue(["LEARNER"]);
    expect(
      (
        await GET(request(), {
          params: Promise.resolve({
            courseId: "owned",
            lessonId: "lesson",
            assessmentId: "NaN",
          }),
        })
      ).status,
    ).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([null, "https://foreign.test"])(
    "rejects unsafe origin %s",
    async (source) => {
      expect(
        (
          await POST(
            request({ type: "run", step: 0, code: "null" }, source),
            ctx,
          )
        ).status,
      ).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("validates step commands, confirmation and rejects forged completion", async () => {
    expect((await POST(request({ type: "step", step: 1 }), ctx)).status).toBe(
      200,
    );
    expect((await POST(request({ type: "step", step: -1 }), ctx)).status).toBe(
      400,
    );
    expect(
      (await POST(request({ type: "step", step: 1, done: true }), ctx)).status,
    ).toBe(400);
    expect(
      (await POST(request({ type: "solution", step: 6 }), ctx)).status,
    ).toBe(400);
    expect(
      (await POST(request({ type: "solution", step: 6, confirmed: true }), ctx))
        .status,
    ).toBe(200);
    expect(
      (await POST(request({ type: "submit", step: 0, code: "null" }), ctx))
        .status,
    ).toBe(400);
  });
  it("bounds upload size and rejects malformed JSON", async () => {
    expect(
      (
        await POST(
          request({ type: "draft", step: 0, code: "x".repeat(400001) }),
          ctx,
        )
      ).status,
    ).toBe(413);
    const bad = new NextRequest(`${origin}/api/tutorial`, {
      method: "POST",
      headers: { origin },
      body: "{",
    });
    expect((await POST(bad, ctx)).status).toBe(400);
  });
});
