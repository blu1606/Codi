import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  createStore: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: { fixture: true },
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/github-profile-store", () => ({
  createGithubProfileStore: mocks.createStore,
  GithubProfileStoreError: class extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));
import { PATCH } from "./corrections/route";
import { DELETE } from "./profile/route";

const origin = "https://codi.test";
const corrections = { excludedRepositoryIds: [], technologies: [], areas: [] };
const patchRequest = (
  body: unknown = { corrections },
  init: { origin?: string; site?: string } = {},
) =>
  new NextRequest(`${origin}/api/github-profile/corrections`, {
    method: "PATCH",
    headers: {
      origin: init.origin ?? origin,
      "content-type": "application/json",
      ...(init.site ? { "sec-fetch-site": init.site } : {}),
    },
    body: JSON.stringify(body),
  });
const deleteRequest = (
  init: { origin?: string; site?: string; query?: string } = {},
) =>
  new NextRequest(`${origin}/api/github-profile/profile${init.query ?? ""}`, {
    method: "DELETE",
    headers: {
      origin: init.origin ?? origin,
      ...(init.site ? { "sec-fetch-site": init.site } : {}),
    },
  });

beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.save.mockResolvedValue({ corrections, summaryJobId: null });
  mocks.remove.mockResolvedValue(true);
  mocks.createStore.mockReturnValue({
    saveCorrections: mocks.save,
    deleteProfile: mocks.remove,
  });
});
afterEach(() => vi.clearAllMocks());

describe("learner-owned profile corrections endpoint", () => {
  it("persists the validated correction set under the signed-in learner", async () => {
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, corrections, summaryJobId: null });
    expect(mocks.save).toHaveBeenCalledWith("owner", corrections);
  });
  it("rejects cross-origin, unauthenticated and malformed mutations before saving", async () => {
    expect(
      (
        await PATCH(
          patchRequest({ corrections }, { origin: "https://foreign.test" }),
        )
      ).status,
    ).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await PATCH(patchRequest())).status).toBe(401);
    expect(
      (await PATCH(patchRequest({ corrections: { unexpected: true } }))).status,
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("profile-only deletion endpoint", () => {
  it("deletes the private profile while keeping the linked account", async () => {
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith("owner");
  });
  it("rejects cross-origin requests and client-supplied targeting", async () => {
    expect(
      (await DELETE(deleteRequest({ origin: "https://foreign.test" }))).status,
    ).toBe(403);
    expect(
      (await DELETE(deleteRequest({ query: "?userId=victim" }))).status,
    ).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
