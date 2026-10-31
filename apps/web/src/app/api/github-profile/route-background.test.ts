import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), roles: vi.fn(), getLinkedAccount: vi.fn(), read: vi.fn(), enqueue: vi.fn(), latest: vi.fn(),
  env: { AI_PROVIDER: "openai", AI_MODEL: "gpt-6-luna", OPENAI_API_KEY: "fixture", GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "fixture" },
}));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/env.server", () => ({ ENV: mocks.env }));
vi.mock("@codi-1/db/ai-jobs", () => ({ enqueueAiJob: mocks.enqueue, readLatestAiJob: mocks.latest }));
vi.mock("@/lib/github-profile-store", () => ({ createGithubProfileStore: () => ({ getLinkedAccount: mocks.getLinkedAccount, read: mocks.read }), GithubProfileStoreError: class extends Error {} }));
vi.mock("@/lib/github-profile-budget", () => ({ trustedBudget: () => undefined }));
import { GET, POST } from "./route";
const url = "https://codi.test/api/github-profile";
function request(body: unknown) { return new NextRequest(url, { method: "POST", headers: { origin: "https://codi.test", "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("GitHub profile background route", () => {
  beforeEach(() => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.roles.mockResolvedValue(["LEARNER"]);
    mocks.getLinkedAccount.mockResolvedValue({ accountId: "account", githubUserId: "123" });
    mocks.enqueue.mockResolvedValue("00000000-0000-4000-8000-000000000001");
    mocks.read.mockResolvedValue(null);
    mocks.latest.mockResolvedValue({ status: "running" });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("queues only consent and server-owned account ids, never OAuth credentials", async () => {
    const response = await POST(request({ consentVersion: "public-github-v1", githubProfileInput: "octocat" }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), { type: "github_profile", userId: "owner", resourceId: "owner", payload: { consentVersion: "public-github-v1", githubProfileInput: "octocat", accountId: "account", githubUserId: "123" } });
  });
  it("does not require model or GitHub app secrets in the web runtime", async () => {
    mocks.env.OPENAI_API_KEY = "";
    mocks.env.GITHUB_CLIENT_SECRET = "";
    const response = await POST(request({ consentVersion: "public-github-v1", githubProfileInput: "octocat" }));
    expect(response.status).toBe(202);
  });
  it("rejects missing consent or extra fields before queueing", async () => {
    expect((await POST(request({ consentVersion: "no", githubProfileInput: "octocat" }))).status).toBe(400);
    expect((await POST(request({ consentVersion: "public-github-v1", githubProfileInput: "octocat", userId: "victim" }))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects a user who has lost access", async () => {
    mocks.roles.mockResolvedValue([]);
    expect((await POST(request({ consentVersion: "public-github-v1", githubProfileInput: "octocat" }))).status).toBe(401);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("returns conflict for a duplicate active background job", async () => {
    mocks.enqueue.mockRejectedValue({ code: "active_job" });
    const response = await POST(request({ consentVersion: "public-github-v1", githubProfileInput: "octocat" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "active_request" });
  });
  it("returns only the viewer's latest job status", async () => {
    const response = await GET(new NextRequest(url));
    expect(await response.json()).toEqual({ profile: null, job: { status: "running" } });
    expect(mocks.latest).toHaveBeenCalledWith(expect.anything(), { type: "github_profile", userId: "owner", resourceId: "owner" });
  });
});
