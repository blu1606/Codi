import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  scope: vi.fn(),
  list: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/lib/ai-tutor-runtime", () => ({ tutorService: { scope: mocks.scope } }));
vi.mock("@/lib/lesson-qa-service", () => ({
  listLessonQuestions: mocks.list,
  postLessonQuestion: mocks.post,
}));
import { GET, POST } from "./route";

const origin = "https://codi.test";
const context = () => ({ params: Promise.resolve({ courseId: "course", lessonId: "lesson" }) });
const request = (method = "GET", body?: unknown, source: string | null = origin) =>
  new NextRequest(`${origin}/api/learn/course/lessons/lesson?userId=other`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(source ? { origin: source } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "learner" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.scope.mockResolvedValue({ userId: "learner" });
  mocks.list.mockResolvedValue([]);
  mocks.post.mockResolvedValue({ id: 5 });
});

describe("learner lesson Q&A privacy and guards", () => {
  it("requires an active learner and enrolled lesson access before listing", async () => {
    mocks.roles.mockResolvedValue(["LECTURER"]);
    expect((await GET(request(), context())).status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();

    mocks.roles.mockResolvedValue(["LEARNER"]);
    mocks.scope.mockRejectedValue(new LearningPathError("Không có quyền truy cập bài học.", 403));
    expect((await GET(request(), context())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists only the signed-in learner's question threads", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith("learner", "course", "lesson");
    expect(mocks.list).toHaveBeenCalledWith({}, "learner", "course", "lesson");
  });

  it("rejects cross-site and forged-field question writes", async () => {
    expect((await POST(request("POST", { text: "Câu hỏi hợp lệ cho bài này" }, "https://evil.test"), context())).status).toBe(403);
    expect((await POST(request("POST", { text: "Câu hỏi hợp lệ cho bài này", authorId: "victim" }), context())).status).toBe(400);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("validates lesson access and attributes new questions to the session owner", async () => {
    const response = await POST(request("POST", { text: "Câu hỏi hợp lệ cho bài này" }), context());
    expect(response.status).toBe(200);
    expect(mocks.scope).toHaveBeenCalledWith("learner", "course", "lesson");
    expect(mocks.post).toHaveBeenCalledWith({}, "learner", "course", "lesson", "Câu hỏi hợp lệ cho bài này");
  });
});
