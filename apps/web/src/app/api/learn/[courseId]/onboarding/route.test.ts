import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OnboardingError } from "@/lib/onboarding-contract";

const mocks = vi.hoisted(() => ({ session: vi.fn(), roles: vi.fn(), get: vi.fn(), execute: vi.fn() }));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/lib/onboarding-service", () => ({ createOnboardingService: () => mocks }));
vi.mock("@/lib/learning-path-runtime", () => ({ scheduleLearningPath: vi.fn() }));
import { GET, POST } from "./route";

const origin = "https://codi.test";
const ctx = () => ({ params: Promise.resolve({ courseId: "owned-course" }) });
const request = (body: unknown, source: string | null = origin) => new NextRequest(`${origin}/api/learn/owned-course/onboarding`, { method: "POST", headers: { "Content-Type": "application/json", ...(source ? { origin: source } : {}) }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { id: "viewer" } }); mocks.roles.mockResolvedValue(["LEARNER"]); mocks.get.mockResolvedValue({ course: { id: "owned-course" } }); mocks.execute.mockResolvedValue({ enrollment: { pathStatus: "none" } }); });

describe("onboarding authentication and input guards", () => {
  it("reads using session identity and URL course, with no-store caching", async () => {
    const response = await GET(new NextRequest(`${origin}/api/learn/owned-course/onboarding?userId=victim`), ctx());
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledWith("viewer", "owned-course");
  });
  it("rejects an anonymous reader and writer", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(new NextRequest(origin), ctx())).status).toBe(401);
    expect((await POST(request({ type: "goal-skip" }), ctx())).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([[], ["ADMIN"], ["LECTURER"]])("requires an active learner grant: %j", async (...roles) => {
    mocks.roles.mockResolvedValue(roles);
    expect((await POST(request({ type: "goal-skip" }), ctx())).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([null, "https://attacker.test"])("rejects missing or foreign Origin %s", async (source) => {
    expect((await POST(request({ type: "goal-skip" }, source), ctx())).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects injected identity and malformed JSON", async () => {
    expect((await POST(request({ type: "goal-skip", userId: "victim" }), ctx())).status).toBe(400);
    expect((await POST(new NextRequest(origin, { method: "POST", headers: { origin }, body: "{" }), ctx())).status).toBe(400);
  });
  it("passes validated writes with the server session identity", async () => {
    expect((await POST(request({ type: "answer", attemptId: 4, questionId: 12, optionId: null, unknown: true }), ctx())).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith("viewer", "owned-course", { type: "answer", attemptId: 4, questionId: 12, optionId: null, unknown: true });
  });
  it.each([403, 404, 409])("preserves expected ownership/transition error %s", async (status) => {
    mocks.execute.mockRejectedValue(new OnboardingError("Không thể thực hiện.", status));
    expect((await POST(request({ type: "diagnostic-retake" }), ctx())).status).toBe(status);
  });
  it("does not leak connection details on unexpected errors", async () => {
    mocks.get.mockRejectedValue(new Error("private connection credential"));
    const response = await GET(new NextRequest(origin), ctx());
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("credential");
  });
});
