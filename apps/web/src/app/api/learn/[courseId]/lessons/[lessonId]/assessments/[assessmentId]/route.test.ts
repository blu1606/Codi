import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  get: vi.fn(),
  execute: vi.fn(),
  prepareUpload: vi.fn(),
  confirmUpload: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/assessment-runtime", () => ({ assessmentService: mocks }));
import { GET, POST } from "./route";
import { GET as download, POST as upload } from "./file/route";
const origin = "https://codi.test";
const ctx = (assessmentId = "7") => ({
  params: Promise.resolve({
    courseId: "owned",
    lessonId: "lesson",
    assessmentId,
  }),
});
const request = (body?: unknown, source: string | null = origin) =>
  new NextRequest(
    `${origin}/api/learn/owned/lessons/lesson/assessments/7?userId=victim`,
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
const uploadRequest = (source: string | null = origin) =>
  new NextRequest(`${origin}/api/file`, {
    method: "POST",
    headers: {
      ...(source ? { origin: source } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "prepare",
      name: "bài làm.txt",
      size: 8 * 1024 * 1024,
    }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.get.mockResolvedValue({ id: 7 });
  mocks.execute.mockResolvedValue({ id: 7 });
  mocks.prepareUpload.mockResolvedValue({
    url: "https://private.r2.test/put",
    token: "signed",
    expiresIn: 300,
  });
  mocks.confirmUpload.mockResolvedValue({ id: 7 });
  mocks.download.mockImplementation(async () => ({
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("work"));
        c.close();
      },
    }),
    name: "bài làm.html",
    size: 4,
  }));
});
describe("quiz and assignment endpoints", () => {
  it("derives owner from the session and prevents caching", async () => {
    const response = await GET(request(), ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.get).toHaveBeenCalledWith({
      userId: "viewer",
      courseId: "owned",
      lessonId: "lesson",
      assessmentId: 7,
    });
  });
  it("requires authentication for reads, writes, upload and download", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(), ctx())).status).toBe(401);
    expect((await POST(request({ type: "quiz-open" }), ctx())).status).toBe(
      401,
    );
    expect((await upload(uploadRequest(), ctx())).status).toBe(401);
    expect((await download(request(), ctx())).status).toBe(401);
    expect(mocks.prepareUpload).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "LECTURER", "REVOKED"])(
    "rejects a non-learner %s",
    async (role) => {
      mocks.roles.mockResolvedValue([role]);
      expect((await GET(request(), ctx())).status).toBe(403);
      expect((await upload(uploadRequest(), ctx())).status).toBe(403);
    },
  );
  it.each([null, "https://foreign.test"])(
    "requires a same-site origin: %s",
    async (source) => {
      expect(
        (await POST(request({ type: "quiz-open" }, source), ctx())).status,
      ).toBe(403);
      expect((await upload(uploadRequest(source), ctx())).status).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it.each(["-1", "NaN", "9007199254740992", "1.1"])(
    "rejects malformed identifiers %s",
    async (id) => expect((await GET(request(), ctx(id))).status).toBe(404),
  );
  it.each([
    {
      type: "quiz-submit",
      submissionId: 1,
      confirmUnanswered: true,
      score: 100,
    },
    {
      type: "assignment-submit",
      userId: "victim",
      linkUrl: "https://example.com",
      answerText: "work",
    },
    { type: "quiz-answer", submissionId: 1, questionId: 1, optionId: -1 },
  ])("rejects forged/invalid command %j", async (body) => {
    expect((await POST(request(body), ctx())).status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("passes only a validated command to the service", async () => {
    const command = {
      type: "quiz-submit",
      submissionId: 1,
      confirmUnanswered: true,
    };
    expect((await POST(request(command), ctx())).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "viewer", assessmentId: 7 }),
      command,
    );
  });
  it("passes only metadata to prepare an 8 MB direct upload", async () => {
    const response = await upload(uploadRequest(), ctx());
    expect(response.status).toBe(200);
    expect(mocks.prepareUpload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "viewer" }),
      "bài làm.txt",
      8 * 1024 * 1024,
    );
    expect(await response.json()).toMatchObject({
      token: "signed",
      expiresIn: 300,
    });
  });
  it("confirms an upload with the signed ticket", async () => {
    expect(
      (await upload(request({ type: "confirm", token: "signed" }), ctx()))
        .status,
    ).toBe(200);
    expect(mocks.confirmUpload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "viewer" }),
      "signed",
    );
  });
  it("rejects binary bodies and malformed metadata", async () => {
    const binary = new NextRequest(`${origin}/api/file`, {
      method: "POST",
      headers: { origin },
      body: "binary-file-content",
    });
    expect((await upload(binary, ctx())).status).toBe(400);
    expect(
      (
        await upload(
          request({ type: "prepare", name: "work", size: -1 }),
          ctx(),
        )
      ).status,
    ).toBe(400);
    expect(mocks.prepareUpload).not.toHaveBeenCalled();
  });
  it("bounds metadata requests before buffering", async () => {
    const oversized = new NextRequest(`${origin}/api/file`, {
      method: "POST",
      headers: { origin },
      body: "x".repeat(12001),
    });
    expect((await upload(oversized, ctx())).status).toBe(413);
    expect(mocks.prepareUpload).not.toHaveBeenCalled();
  });
  it("reports missing private bucket configuration as 503", async () => {
    mocks.prepareUpload.mockRejectedValue(
      new LearningPathError("Kho tệp bài tập chưa được cấu hình.", 503),
    );
    const response = await upload(uploadRequest(), ctx());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("chưa được cấu hình");
  });
  it("returns private downloads as attachments, never executable HTML", async () => {
    const response = await download(request(), ctx());
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "attachment;",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("work");
  });
  it.each([403, 404, 409])(
    "preserves service guard errors %s",
    async (status) => {
      mocks.execute.mockRejectedValue(
        new LearningPathError("Bài đã chấm không thể nộp lại.", status),
      );
      expect(
        (
          await POST(
            request({
              type: "assignment-submit",
              linkUrl: "https://example.com",
              answerText: "",
            }),
            ctx(),
          )
        ).status,
      ).toBe(status);
    },
  );
  it("does not leak storage errors", async () => {
    mocks.prepareUpload.mockRejectedValue(
      new Error("secret bucket credential"),
    );
    const response = await upload(uploadRequest(), ctx());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
