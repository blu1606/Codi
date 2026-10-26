import { describe, expect, it, vi } from "vitest";
import type { GithubProfileStore } from "@/lib/github-profile-store";
import {
  githubLinkErrorFrom,
  loadGithubConnectionState,
  loadGithubProfilePageState,
} from "./github-profile-page-state";
import { githubSnapshotComplete } from "@/demo-fixtures/learner/github-profile";

function fakeStore(overrides: Partial<Record<"read" | "getLinkedAccount", unknown>> = {}) {
  return {
    read: vi.fn().mockResolvedValue(null),
    getLinkedAccount: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GithubProfileStore & {
    read: ReturnType<typeof vi.fn>;
    getLinkedAccount: ReturnType<typeof vi.fn>;
  };
}

describe("githubLinkErrorFrom", () => {
  it.each([
    ["access_denied", "denied"],
    ["account_already_linked_to_different_user", "already_linked"],
    ["<script>untrusted</script>", "failed"],
    [undefined, null],
  ])("maps callback %s to %s", (input, expected) => {
    expect(githubLinkErrorFrom(input)).toBe(expected);
  });
});

describe("loadGithubProfilePageState", () => {
  it("reports a safe warning without the underlying read error", async () => {
    const store = fakeStore({ read: vi.fn().mockRejectedValue(new Error("private database details")) });
    const state = await loadGithubProfilePageState(store, "user-1", undefined);
    expect(state.readFailed).toBe(true);
    expect(state.initialProfile).toBeNull();
    expect(JSON.stringify(state)).not.toContain("private database details");
  });

  it("passes only linked status, never account identifiers", async () => {
    const store = fakeStore({
      getLinkedAccount: vi.fn().mockResolvedValue({ accountId: "private-account", githubUserId: "123" }),
    });
    const state = await loadGithubProfilePageState(store, "user-1", undefined);
    expect(state).toEqual({ initialProfile: null, initialLinked: true, initialLinkError: null, readFailed: false });
    expect(JSON.stringify(state)).not.toContain("private-account");
  });

  it("distinguishes an unlinked account from an unknown lookup", async () => {
    const unlinked = await loadGithubProfilePageState(fakeStore(), "user-1", undefined);
    expect(unlinked.initialLinked).toBe(false);
    const unknown = await loadGithubProfilePageState(
      fakeStore({ getLinkedAccount: vi.fn().mockRejectedValue(new Error("private upstream failure")) }),
      "user-1",
      undefined,
    );
    expect(unknown.initialLinked).toBeNull();
  });
});

describe("loadGithubConnectionState", () => {
  it("reports not connected without reading the profile", async () => {
    const store = fakeStore();
    expect(await loadGithubConnectionState(store, "user-1")).toEqual({ connected: false, username: null });
    expect(store.read).not.toHaveBeenCalled();
  });

  it("returns the login from the stored snapshot when connected", async () => {
    const store = fakeStore({
      getLinkedAccount: vi.fn().mockResolvedValue({ accountId: "a", githubUserId: "1" }),
      read: vi.fn().mockResolvedValue({ snapshot: githubSnapshotComplete }),
    });
    expect(await loadGithubConnectionState(store, "user-1")).toEqual({ connected: true, username: "minhan-dev" });
  });

  it("stays neutral when the link lookup fails", async () => {
    const store = fakeStore({ getLinkedAccount: vi.fn().mockRejectedValue(new Error("down")) });
    expect(await loadGithubConnectionState(store, "user-1")).toBeUndefined();
  });
});
