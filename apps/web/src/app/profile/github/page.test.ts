import { beforeEach, describe, expect, it, vi } from "vitest";
import GithubProfilePage from "./page";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  headers: vi.fn(),
  db: {},
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: mocks.db,
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`redirect:${target}`);
  },
}));
vi.mock("@/components/profile/github-profile-panel", () => ({
  default: () => null,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.session.mockResolvedValue({ user: { id: "session-owned-user" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
});

describe("GitHub profile page authorization", () => {
  it("requires an authenticated session before looking up roles", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(GithubProfilePage()).rejects.toThrow("redirect:/login");
    expect(mocks.roles).not.toHaveBeenCalled();
  });
  it.each([[], ["LECTURER"], ["ADMIN"]])(
    "rejects nonlearner active roles %j",
    async (...roles) => {
      mocks.roles.mockResolvedValue(roles);
      await expect(GithubProfilePage()).rejects.toThrow("redirect:/dashboard");
    },
  );
  it("looks up the session user's active roles and returns the learner page", async () => {
    const page = await GithubProfilePage();
    expect(mocks.roles).toHaveBeenCalledWith(mocks.db, "session-owned-user");
    expect(mocks.session).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
    expect(page.type).toBe("main");
  });
});
