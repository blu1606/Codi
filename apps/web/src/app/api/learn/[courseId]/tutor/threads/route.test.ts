import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  service: { listThreads: vi.fn() },
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/ai-tutor-runtime", () => ({ tutorService: mocks.service }));
import { GET } from "./route";

const ctx = { params: Promise.resolve({ courseId: "course" }) };
const request = () =>
  new NextRequest("https://codi.test/api/learn/course/tutor/threads");
const thread = {
  lessonId: "lesson-1",
  lessonTitle: "Hàm",
  firstQuestion: "Hàm trả về gì?",
  lastAt: "2026-10-26T03:00:00.000Z",
  messageCount: 4,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.service.listThreads.mockResolvedValue([thread]);
});

describe("AI tutor thread list", () => {
  it("lists the signed-in learner's threads for this course, never cached", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ threads: [thread] });
    expect(mocks.service.listThreads).toHaveBeenCalledWith("viewer", "course");
  });
  it("requires login and the learner role", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), ctx)).status).toBe(401);
    mocks.roles.mockResolvedValueOnce(["LECTURER"]);
    expect((await GET(request(), ctx)).status).toBe(403);
    expect(mocks.service.listThreads).not.toHaveBeenCalled();
  });
});
