import { beforeEach, describe, expect, it, vi } from "vitest";
import GithubProfilePage from "./page";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  headers: vi.fn(),
  db: {},
  read: vi.fn(),
  linked: vi.fn(),
}));
vi.mock("@/lib/github-profile-store", () => ({
  createGithubProfileStore: () => ({
    read: mocks.read,
    getLinkedAccount: mocks.linked,
  }),
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
  mocks.read.mockResolvedValue(null);
  mocks.linked.mockResolvedValue(null);
});

describe("GitHub profile page authorization", () => {
  it("requires an authenticated session before looking up roles", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(GithubProfilePage()).rejects.toThrow("redirect:/login");
    expect(mocks.roles).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.linked).not.toHaveBeenCalled();
  });
  it.each([[], ["LECTURER"], ["ADMIN"]])(
    "rejects nonlearner active roles %j",
    async (...roles) => {
      mocks.roles.mockResolvedValue(roles);
      await expect(GithubProfilePage()).rejects.toThrow("redirect:/dashboard");
      expect(mocks.linked).not.toHaveBeenCalled();
    },
  );
  it("looks up the session user's active roles and returns the learner page", async () => {
    const page = await GithubProfilePage();
    expect(mocks.roles).toHaveBeenCalledWith(mocks.db, "session-owned-user");
    expect(mocks.session).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
    expect(page.type).toBe("main");
    expect(mocks.read).toHaveBeenCalledWith("session-owned-user");
  });
  it("keeps the page available with a safe warning when stored data cannot be read", async () => {
    mocks.read.mockRejectedValue(new Error("private database details"));
    const page = await GithubProfilePage();
    const warning = page.props.children.props.children[1];
    expect(warning.props.role).toBe("alert");
    expect(warning.props.children).not.toContain("private database details");
    expect(warning.props.children).toContain("Chưa tải được hồ sơ đã lưu");
  });
  it("passes only linked status, never account identifiers, to the client", async () => {
    mocks.linked.mockResolvedValue({
      accountId: "private-account",
      githubUserId: "123",
    });
    const page = await GithubProfilePage();
    const panel = page.props.children.props.children[2];
    expect(mocks.linked).toHaveBeenCalledWith("session-owned-user");
    expect(panel.props).toEqual({
      initialProfile: null,
      initialLinked: true,
      initialLinkError: null,
    });
    expect(JSON.stringify(panel.props)).not.toContain("private-account");
  });
  it("distinguishes absent account from unknown account lookup", async () => {
    const unlinked = await GithubProfilePage();
    expect(unlinked.props.children.props.children[2].props.initialLinked).toBe(
      false,
    );
    mocks.linked.mockRejectedValue(new Error("private upstream failure"));
    const unknown = await GithubProfilePage();
    expect(
      unknown.props.children.props.children[2].props.initialLinked,
    ).toBeNull();
  });
  it.each([
    ["access_denied", "denied"],
    ["account_already_linked_to_different_user", "already_linked"],
    ["<script>untrusted callback</script>", "failed"],
  ])("maps callback %s to safe outcome %s", async (error, expected) => {
    const page = await GithubProfilePage({
      searchParams: Promise.resolve({
        error,
        error_description: "private detail",
      }),
    });
    const panel = page.props.children.props.children[2];
    expect(panel.props.initialLinkError).toBe(expected);
    expect(JSON.stringify(panel.props)).not.toContain("private detail");
    expect(JSON.stringify(panel.props)).not.toContain("<script>");
  });
});
