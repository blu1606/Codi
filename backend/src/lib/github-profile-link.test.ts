import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  decodeLinkState,
  encodeLinkState,
  exchangeCode,
  GithubLinkError,
  needsRefresh,
  refreshGithubToken,
  newLinkState,
  safeReturnTo,
  sameState,
  withParam,
} from "./github-profile-link";

describe("github profile link", () => {
  it("keeps only same-site return paths", () => {
    expect(safeReturnTo("/profile?tab=nang-luc")).toBe("/profile?tab=nang-luc");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/a\nb", null, ""]) {
      expect(safeReturnTo(bad)).toBe("/profile?tab=nang-luc");
    }
  });

  it("sets the result param and drops an earlier one", () => {
    expect(withParam("/onboarding/github?next=%2Fdashboard&error=failed", "github", "linked"))
      .toBe("/onboarding/github?next=%2Fdashboard&github=linked");
  });

  it("round-trips the state cookie and compares states safely", () => {
    const s = newLinkState("usr-1", "/profile");
    expect(decodeLinkState(encodeLinkState(s))).toEqual(s);
    expect(decodeLinkState("not-json")).toBeNull();
    expect(decodeLinkState(encodeLinkState({ ...s, returnTo: "//evil" }))?.returnTo).toBe("/profile?tab=nang-luc");
    expect(sameState(s.state, s.state)).toBe(true);
    expect(sameState(s.state, s.state + "x")).toBe(false);
    expect(sameState(s.state, null)).toBe(false);
  });

  it("always shows GitHub's account picker", () => {
    const url = new URL(authorizeUrl("cid", "https://codi.test/api/auth/callback/github", "st"));
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("redirect_uri")).toBe("https://codi.test/api/auth/callback/github");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("exchanges the code and reads the GitHub id", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("access_token")) return Response.json({ access_token: "tok", scope: "read:user" });
      return Response.json({ id: 42, login: "octo" });
    }) as typeof fetch;
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, fetcher))
      .resolves.toEqual({ accessToken: "tok", refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null,
        scope: "read:user", githubUserId: "42", login: "octo" });
  });

  it("keeps the refresh token and expiries of an expiring GitHub App token", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).includes("access_token"))
        return Response.json({ access_token: "tok", refresh_token: "ref", expires_in: 28800, refresh_token_expires_in: 15811200, scope: "" });
      return Response.json({ id: 42, login: "octo" });
    }) as typeof fetch;
    const before = Date.now();
    const gh = await exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, fetcher);
    expect(gh.refreshToken).toBe("ref");
    expect(gh.accessTokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + 28800_000);
    expect(gh.refreshTokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + 15811200_000);
  });

  it("refreshes only tokens that are expired or about to expire", () => {
    const now = Date.UTC(2026, 10, 14, 0, 0, 0);
    expect(needsRefresh(null, now)).toBe(false);
    expect(needsRefresh(new Date(now + 3600_000), now)).toBe(false);
    expect(needsRefresh(new Date(now + 60_000), now)).toBe(true);
    expect(needsRefresh(new Date(now - 1), now)).toBe(true);
  });

  it("trades a refresh token for a new pair, and returns null when GitHub refuses", async () => {
    let body: Record<string, unknown> = {};
    const ok = (async (_: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ access_token: "new", refresh_token: "ref2", expires_in: 28800 });
    }) as typeof fetch;
    const next = await refreshGithubToken({ clientId: "c", clientSecret: "s", refreshToken: "ref" }, ok, 0);
    expect(body).toMatchObject({ grant_type: "refresh_token", refresh_token: "ref", client_id: "c" });
    expect(next).toEqual({ accessToken: "new", refreshToken: "ref2", accessTokenExpiresAt: new Date(28800_000), refreshTokenExpiresAt: null });
    const refused = (async () => Response.json({ error: "bad_refresh_token" })) as unknown as typeof fetch;
    await expect(refreshGithubToken({ clientId: "c", clientSecret: "s", refreshToken: "old" }, refused)).resolves.toBeNull();
    const down = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    await expect(refreshGithubToken({ clientId: "c", clientSecret: "s", refreshToken: "old" }, down)).resolves.toBeNull();
  });

  it("fails without a token", async () => {
    const fetcher = (async () => Response.json({ error: "bad_verification_code" })) as unknown as typeof fetch;
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, fetcher))
      .rejects.toBeInstanceOf(GithubLinkError);
  });
});
