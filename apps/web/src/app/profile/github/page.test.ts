import { describe, expect, it, vi } from "vitest";
import GithubProfileRedirectPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("legacy GitHub profile route", () => {
  it("redirects to the profile tab", async () => {
    await expect(GithubProfileRedirectPage()).rejects.toThrow("redirect:/profile?tab=nang-luc");
  });

  it("keeps only the known callback error code when redirecting", async () => {
    await expect(
      GithubProfileRedirectPage({
        searchParams: Promise.resolve({ error: "access_denied", error_description: "private detail" }),
      }),
    ).rejects.toThrow("redirect:/profile?tab=nang-luc&error=access_denied");
  });
});
