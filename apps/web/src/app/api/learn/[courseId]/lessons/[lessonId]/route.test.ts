import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  get: vi.fn(),
  execute: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/lesson-player-runtime", () => ({ lessonPlayerService: mocks }));
vi.mock("@/lib/learning-path-runtime", () => ({
  scheduleLearningPath: mocks.schedule,
}));
import { GET, POST } from "./route";

const origin = "https://codi.test";
const ctx = () => ({
  params: Promise.resolve({ courseId: "owned", lessonId: "lesson" }),
});
const request = (body?: unknown, source: string | null = origin) =>
  new NextRequest(
    `${origin}/api/learn/owned/lessons/lesson?userId=victim`,
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
  mocks.get.mockResolvedValue({ lesson: { id: "lesson" } });
  mocks.execute.mockResolvedValue({ path: { updating: false } });
});
describe("lesson player HTTP guards", () => {
  it("reads only the session owner and disables caching", async () => {
    const response = await GET(request(), ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.get).toHaveBeenCalledWith("viewer", "owned", "lesson");
  });
  it("requires authentication for reads and writes", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), ctx())).status).toBe(401);
    expect((await POST(request({ type: "study" }), ctx())).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([[], ["ADMIN"], ["LECTURER"]])(
    "rejects absent/inactive/revoked learner grants: %j",
    async (...roles) => {
      mocks.roles.mockResolvedValue(roles);
      expect((await GET(request(), ctx())).status).toBe(403);
      expect((await POST(request({ type: "open" }), ctx())).status).toBe(403);
    },
  );
  it.each([null, "https://attacker.test"])(
    "rejects foreign/missing Origin %s",
    async (source) => {
      expect(
        (await POST(request({ type: "complete" }, source), ctx())).status,
      ).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    { type: "complete", checklist: [] },
    { type: "study", userId: "victim" },
    { type: "video", materialId: 1, seconds: -1, ended: true },
    { type: "pdf-page", materialId: 1, page: 1, pages: 10000 },
  ])("rejects forged fields: %j", async (input) =>
    expect((await POST(request(input), ctx())).status).toBe(400),
  );
  it("rejects malformed JSON", async () =>
    expect(
      (
        await POST(
          new NextRequest(`${origin}/api`, {
            method: "POST",
            headers: { origin },
            body: "{",
          }),
          ctx(),
        )
      ).status,
    ).toBe(400));
  it.each(["complete"])(
    "uses the validated route/session on %s",
    async (type) => {
      expect((await POST(request({ type }), ctx())).status).toBe(200);
      expect(mocks.execute).toHaveBeenCalledWith("viewer", "owned", "lesson", {
        type,
      });
    },
  );
  it("schedules durable path work only when a job is pending", async () => {
    await POST(request({ type: "study" }), ctx());
    expect(mocks.schedule).not.toHaveBeenCalled();
    mocks.execute.mockResolvedValue({ path: { updating: true } });
    await POST(request({ type: "complete" }), ctx());
    expect(mocks.schedule).toHaveBeenCalledWith("viewer", "owned");
  });
  it.each([403, 404, 409])(
    "preserves server ownership/lock/checklist rejection %s",
    async (status) => {
      mocks.execute.mockRejectedValue(
        new LearningPathError("Còn thiếu: Đạt quiz.", status),
      );
      expect((await POST(request({ type: "complete" }), ctx())).status).toBe(
        status,
      );
      expect(mocks.schedule).not.toHaveBeenCalled();
    },
  );
  it("does not expose provider/database errors", async () => {
    mocks.get.mockRejectedValue(new Error("secret-connection-string"));
    const response = await GET(request(), ctx());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});

it("returns compact media acknowledgements without scheduling path work", async () => {
  const ack = {
    kind: "media-progress",
    media: {},
    positionSeconds: 5,
    studied: true,
    completed: false,
  };
  mocks.execute.mockResolvedValue(ack);
  const response = await POST(
    request({ type: "video", materialId: 1, seconds: 5, ended: true }),
    ctx(),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ack);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
