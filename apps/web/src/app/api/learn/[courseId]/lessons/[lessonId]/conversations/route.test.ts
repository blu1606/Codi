import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  scope: vi.fn(),
  get: vi.fn(),
  escalate: vi.fn(),
  reply: vi.fn(),
}));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/lib/ai-tutor-runtime", () => ({ tutorService: { scope: mocks.scope } }));
vi.mock("@/lib/lesson-qa-service", () => ({
  getLearnerLessonConversation: mocks.get,
  escalateToLecturer: mocks.escalate,
  postLearnerConversationReply: mocks.reply,
}));
import { GET, POST } from "./route";

const origin = "https://codi.test";
const context = () => ({ params: Promise.resolve({ courseId: "course", lessonId: "lesson" }) });
const request = (body?: unknown, source: string | null = origin) => new NextRequest(
  `${origin}/api/learn/course/lessons/lesson`,
  body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", ...(source ? { origin: source } : {}) }, body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "learner" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.scope.mockResolvedValue({ userId: "learner" });
  mocks.get.mockResolvedValue(null);
  mocks.escalate.mockResolvedValue({ id: 5 });
  mocks.reply.mockResolvedValue({ id: 9 });
});

describe("private lesson lecturer conversations", () => {
  it("requires the learner's enrolled lesson before reading the private thread", async () => {
    mocks.scope.mockRejectedValue(new LearningPathError("Không có quyền truy cập bài học.", 403));
    expect((await GET(request(), context())).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("reads only the authenticated learner's conversation", async () => {
    expect((await GET(request(), context())).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith({}, "learner", "course", "lesson");
  });

  it("rejects cross-site and forged conversation writes", async () => {
    expect((await POST(request({ text: "Tôi cần giảng viên giải thích thêm nội dung này" }, "https://evil.test"), context())).status).toBe(403);
    expect((await POST(request({ text: "Tôi cần giảng viên giải thích thêm nội dung này", learnerId: "victim" }), context())).status).toBe(400);
    expect(mocks.escalate).not.toHaveBeenCalled();
  });

  it("checks lesson access before creating a private lecturer conversation", async () => {
    expect((await POST(request({ text: "Tôi cần giảng viên giải thích thêm nội dung này" }), context())).status).toBe(200);
    expect(mocks.scope).toHaveBeenCalledWith("learner", "course", "lesson");
    expect(mocks.escalate).toHaveBeenCalledWith({}, "learner", "course", "lesson", expect.objectContaining({ text: "Tôi cần giảng viên giải thích thêm nội dung này" }));
  });

  it("binds replies to the course and lesson in the route", async () => {
    const response = await POST(request({
      text: "Tôi cần giảng viên giải thích thêm nội dung này",
      conversationId: 42,
    }), context());
    expect(response.status).toBe(200);
    expect(mocks.reply).toHaveBeenCalledWith({}, "learner", 42, "course", "lesson", "Tôi cần giảng viên giải thích thêm nội dung này");
  });
});
