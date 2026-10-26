import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  rate: vi.fn(),
  service: {
    scope: vi.fn(),
    get: vi.fn(),
    beginTurn: vi.fn(),
    finishTurn: vi.fn(),
    recordLimit: vi.fn(),
    execute: vi.fn(),
  },
  stream: vi.fn(),
  hint: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/ai-tutor-runtime", () => ({ tutorService: mocks.service }));
vi.mock("@/lib/ai-tutor-ai", () => ({
  streamTutorAnswer: mocks.stream,
  generateTutorHint: mocks.hint,
}));
import { GET, POST } from "./route";

const origin = "https://codi.test";
const ctx = {
  params: Promise.resolve({ courseId: "course", lessonId: "lesson" }),
};
const scope = {
  userId: "viewer",
  courseId: "course",
  lessonId: "lesson",
  enrollmentId: 1,
  lesson: {
    title: "Hàm",
    chapterTitle: null,
    description: null,
    body: null,
    materials: [],
    isCode: true,
  },
  instructorId: "lecturer",
  lecturerName: "Cô Lan",
};
const code = "const a = 1;\nconsole.lg(a);\nreturn a;";
const request = (body?: unknown, source: string | null = origin) =>
  new NextRequest(
    `${origin}/api/learn/course/lessons/lesson/tutor`,
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
function streaming(parts: (string | Error)[]) {
  return {
    model: "test-model",
    chunks: (async function* () {
      for (const part of parts) {
        if (part instanceof Error) throw part;
        yield part;
      }
    })(),
    usage: async () => ({ promptTokens: 10, completionTokens: 5 }),
  };
}
const ask = { type: "ask", question: "Vì sao lỗi?", context: { code } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.rate.mockReturnValue({ success: true, remaining: 7, reset: Date.now() + 60000 });
  mocks.service.scope.mockResolvedValue(scope);
  mocks.service.get.mockResolvedValue({ messages: [] });
  mocks.service.finishTurn.mockResolvedValue({ messages: ["done"] });
  mocks.service.recordLimit.mockResolvedValue({ messages: ["limit"] });
  mocks.service.execute.mockResolvedValue({ messages: ["voted"] });
  mocks.service.beginTurn.mockImplementation(async (_scope, command) => ({
    history: [],
    question: command.type === "ask" ? command.question : "Cho mình gợi ý 3/3",
    level: command.type === "hint" ? 3 : null,
    logId: command.type === "hint" ? 42 : null,
  }));
});

describe("AI tutor endpoint access", () => {
  it("reads the thread of the signed-in learner, never a user from the request", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.service.scope).toHaveBeenCalledWith("viewer", "course", "lesson");
  });
  it("requires login, the learner role and a same-origin POST", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), ctx)).status).toBe(401);
    mocks.roles.mockResolvedValueOnce(["LECTURER"]);
    expect((await POST(request(ask), ctx)).status).toBe(403);
    expect((await POST(request(ask, "https://evil.test"), ctx)).status).toBe(403);
    expect(mocks.service.beginTurn).not.toHaveBeenCalled();
  });
  it("rejects an escalation shorter than 10 characters before touching data", async () => {
    const response = await POST(
      request({ type: "escalate", text: "ngắn", withSummary: true }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(mocks.service.execute).not.toHaveBeenCalled();
  });
  it("routes non-turn commands to the service", async () => {
    const vote = { type: "vote", messageId: 5, vote: "down", reason: "Khó hiểu" };
    const response = await POST(request(vote), ctx);
    expect(await response.json()).toEqual({ messages: ["voted"] });
    expect(mocks.service.execute).toHaveBeenCalledWith(scope, vote);
  });
});

describe("AI tutor turns", () => {
  it("thinking → streaming → answered: streams text and saves it with line refs", async () => {
    mocks.stream.mockReturnValue(streaming(["Xem lại dòng 2", " và dòng 9."]));
    const response = await POST(request(ask), ctx);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("Xem lại dòng 2 và dòng 9.");
    expect(mocks.service.finishTurn).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ question: "Vì sao lỗi?" }),
      { kind: "answer", text: "Xem lại dòng 2 và dòng 9.", lines: [2], diff: null },
      expect.objectContaining({ model: "test-model", promptTokens: 10 }),
    );
    const prompt = mocks.stream.mock.calls[0]![0].prompt as string;
    expect(prompt).toContain("2| console.lg(a);");
  });
  it("Dừng mid-stream saves a stopped answer with the text received so far", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mocks.stream.mockReturnValue({
      model: "test-model",
      chunks: (async function* () {
        yield "Bắt đầu";
        await gate;
        yield " phần sau";
      })(),
      usage: async () => ({ promptTokens: null, completionTokens: null }),
    });
    const response = await POST(request(ask), ctx);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    release();
    await vi.waitFor(() => expect(mocks.service.finishTurn).toHaveBeenCalled());
    expect(mocks.service.finishTurn.mock.calls[0]![2]).toEqual({
      kind: "stopped",
      text: "Bắt đầu",
    });
  });
  it("→ error: a provider failure is a 503 with the saved error row, not a broken stream", async () => {
    mocks.stream.mockReturnValue(streaming([new Error("upstream 500")]));
    mocks.service.get.mockResolvedValue({ messages: ["error row"] });
    const response = await POST(request(ask), ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "AI trợ lý tạm thời không khả dụng",
      view: { messages: ["error row"] },
    });
    expect(mocks.service.finishTurn.mock.calls[0]![2]).toEqual({
      kind: "error",
      message: "upstream 500",
    });
  });
  it("→ rate limited: records the warning and never calls the model", async () => {
    mocks.rate.mockReturnValue({ success: false, remaining: 0, reset: Date.now() + 30000 });
    const response = await POST(request(ask), ctx);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect((await response.json()).view).toEqual({ messages: ["limit"] });
    expect(mocks.service.recordLimit).toHaveBeenCalledWith(scope, "Vì sao lỗi?");
    expect(mocks.service.beginTurn).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("hint 3/3 keeps a ≤ 3-line diff but drops a longer one (G9)", async () => {
    const hint = { type: "hint", context: { code } };
    mocks.hint.mockResolvedValueOnce({
      model: "m",
      hint: { text: "**Gợi ý 3/3**", lines: [2, 50], diff: { at: 2, add: ["console.log(a);"] } },
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    await POST(request(hint), ctx);
    expect(mocks.service.finishTurn.mock.calls[0]![2]).toEqual({
      kind: "answer",
      text: "**Gợi ý 3/3**",
      lines: [2],
      diff: { at: 2, add: ["console.log(a);"], context: "console.lg(a);", state: null },
    });
    mocks.hint.mockResolvedValueOnce({
      model: "m",
      hint: { text: "x", lines: [], diff: { at: 2, add: ["a", "b", "c", "d"] } },
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    await POST(request(hint), ctx);
    expect(mocks.service.finishTurn.mock.calls[1]![2]).toMatchObject({ diff: null });
    expect(mocks.service.finishTurn.mock.calls[1]![1]).toMatchObject({ logId: 42 });
  });
});
