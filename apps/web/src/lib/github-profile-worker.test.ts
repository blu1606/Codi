import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roles: vi.fn(), token: vi.fn(), run: vi.fn(),
  generate: vi.fn(),
  store: { getLinkedAccount: vi.fn(), read: vi.fn(), claim: vi.fn(), reserveGeneration: vi.fn(), publish: vi.fn(), finishBackground: vi.fn() },
}));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/services", () => ({ db: {}, auth: { api: { getAccessToken: mocks.token } } }));
vi.mock("@/env.server", () => ({ ENV: { AI_PROVIDER: "openai", AI_MODEL: "gpt-6-luna", OPENAI_API_KEY: "fake", GITHUB_CLIENT_ID: "fake", GITHUB_CLIENT_SECRET: "fake" } }));
vi.mock("./github-profile-budget", () => ({ trustedBudget: () => ({ budgetKey: "fake", slot: "test-local", candidateSha: "a".repeat(40) }) }));
vi.mock("./github-profile-store", () => ({ createGithubProfileStore: () => mocks.store }));
vi.mock("./github-profile-service", () => ({ parseGithubProfileInput: (v: unknown) => v, runGithubProfileRequest: mocks.run }));
vi.mock("./github-profile-ai", () => ({ generateGithubProfileAnalysis: mocks.generate }));
import { runGithubProfileJob } from "./github-profile-worker";
import type { AiJob } from "@codi-1/db/ai-jobs";

const job: AiJob = { id: "00000000-0000-4000-8000-000000000001", type: "github_profile", userId: "owner", resourceId: "owner", leaseToken: "00000000-0000-4000-8000-000000000002", payload: { consentVersion: "public-github-v1", githubProfileInput: "octocat", accountId: "account", githubUserId: "123" } };
const lease = { id: job.id, leaseToken: job.leaseToken };
const claim = { userId: "owner", accountId: "account", githubUserId: "123" };

describe("GitHub profile worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roles.mockResolvedValue(["LEARNER"]);
    mocks.store.getLinkedAccount.mockResolvedValue({ accountId: "account", githubUserId: "123" });
    mocks.store.claim.mockResolvedValue(claim);
    mocks.store.reserveGeneration.mockResolvedValue(true);
    mocks.store.read.mockResolvedValue({ accountId: "account", githubUserId: "123", snapshot: { fixture: "retained" }, corrections: { excludedRepositoryIds: [7] } });
    mocks.generate.mockResolvedValue({ analysis: { fixture: "summary" } });
    mocks.token.mockResolvedValue({ accessToken: "do-not-log" });
  });
  it("binds token to the server-owned user and publishes with the job lease", async () => {
    mocks.run.mockImplementation(async (_input, options) => {
      expect(options.background).toBe(true);
      expect(await options.getLinkedAccount(new AbortController().signal)).toEqual({ accountRowId: "account", githubUserId: "123" });
      expect(await options.getAccessToken("account", new AbortController().signal)).toBe("do-not-log");
      expect(await options.ai.reserveGeneration({ model: "fake" })).toBe(true);
      return { ok: true, snapshot: { fixture: true }, generation: { analysis: { fixture: true } } };
    });
    await runGithubProfileJob(job);
    expect(mocks.token).toHaveBeenCalledWith({ body: { userId: "owner", accountId: "account" } });
    expect(mocks.store.claim).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", accountId: "account" }), lease);
    expect(mocks.store.publish).toHaveBeenCalledWith(claim, { fixture: true }, { fixture: true }, lease);
    expect(mocks.store.finishBackground).not.toHaveBeenCalled();
  });
  it("does not access a relinked or other user's account", async () => {
    mocks.store.getLinkedAccount.mockResolvedValue({ accountId: "different", githubUserId: "123" });
    mocks.run.mockImplementation(async (_input, options) => {
      expect(await options.getLinkedAccount(new AbortController().signal)).toBeNull();
      return { ok: false, code: "github_not_linked" };
    });
    await runGithubProfileJob(job);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.store.claim).not.toHaveBeenCalled();
    expect(mocks.store.finishBackground).toHaveBeenCalledWith(undefined, lease, "failed", "github_not_linked");
  });
  it("refuses invalid user binding and does not contact provider", async () => {
    await runGithubProfileJob({ ...job, resourceId: "victim" });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.store.finishBackground).toHaveBeenCalledWith(undefined, lease, "failed", "request_failed");
  });
  it("fails safely when role is revoked before work", async () => {
    mocks.roles.mockResolvedValue([]);
    await runGithubProfileJob(job);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.store.finishBackground).toHaveBeenCalledWith(undefined, lease, "failed", "unauthorized");
  });
  it("regenerates excluded-repository summaries from the retained snapshot without GitHub access", async () => {
    const summaryJob: AiJob = { ...job, payload: { consentVersion: "public-github-v1", accountId: "account", githubUserId: "123", summaryOnly: true } };
    await runGithubProfileJob(summaryJob);
    expect(mocks.generate).toHaveBeenCalledWith({ fixture: "retained" }, expect.objectContaining({ excludedRepositoryIds: [7], timeoutMs: 75_000 }));
    expect(mocks.store.publish).toHaveBeenCalledWith(claim, { fixture: "retained" }, { fixture: "summary" }, lease);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.store.finishBackground).not.toHaveBeenCalled();
  });
});
