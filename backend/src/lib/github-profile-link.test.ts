import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  decodeLinkState,
  encodeLinkState,
  exchangeCode,
  GithubLinkError,
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
      .resolves.toEqual({ accessToken: "tok", scope: "read:user", githubUserId: "42", login: "octo" });
  });

  it("fails without a token", async () => {
    const fetcher = (async () => Response.json({ error: "bad_verification_code" })) as unknown as typeof fetch;
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, fetcher))
      .rejects.toBeInstanceOf(GithubLinkError);
  });
});
