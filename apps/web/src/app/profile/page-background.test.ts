import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), roles: vi.fn(), latest: vi.fn(), load: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@codi-1/db/ai-jobs", () => ({ readLatestAiJob: mocks.latest }));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@/components/profile/github-profile-page-state", () => ({ loadGithubProfilePageState: mocks.load }));
vi.mock("@/lib/github-profile-store", () => ({ createGithubProfileStore: () => ({}) }));
vi.mock("./profile-view", () => ({ ProfileView: () => null }));
import ProfilePage from "./page";

describe("server-side profile job metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.roles.mockResolvedValue(["LEARNER"]);
    mocks.load.mockResolvedValue({ initialProfile: null, initialLinked: true, initialLinkError: null, readFailed: false });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("does not read job status with the worker disabled", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "false");
    const page = await ProfilePage({ searchParams: Promise.resolve({ tab: "nang-luc" }) });
    expect(mocks.latest).not.toHaveBeenCalled();
    expect(page.props.github.initialJob).toBeUndefined();
  });
  it("passes only the owner's active job id and status to the panel", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
    mocks.latest.mockResolvedValue({ id: "job", status: "running", userId: "owner", payload: { private: "data" } });
    const page = await ProfilePage({ searchParams: Promise.resolve({ tab: "nang-luc" }) });
    expect(mocks.latest).toHaveBeenCalledWith(expect.anything(), { type: "github_profile", userId: "owner", resourceId: "owner" });
    expect(page.props.github.initialJob).toEqual({ id: "job", status: "running" });
  });
  it("does not resume an already completed job", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
    mocks.latest.mockResolvedValue({ id: "job", status: "completed" });
    const page = await ProfilePage({ searchParams: Promise.resolve({ tab: "nang-luc" }) });
    expect(page.props.github.initialJob).toBeUndefined();
  });
});
