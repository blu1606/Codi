import { describe, expect, it } from "vitest";
import { getAuthOriginConfig } from "./auth-origin";
import { createAuth } from "./index";
import type { Database } from "@codi-1/db";

const canonical = "https://codi.hoangblue.dev";

describe("auth deployment origin", () => {
  it("wires runtime preview identity into Better Auth without disabling origin checks", () => {
    const auth = createAuth({
      BETTER_AUTH_URL: canonical,
      BETTER_AUTH_SECRET: "test-only-secret-not-a-real-credential-123456",
      VERCEL_ENV: "preview",
      VERCEL_URL: "codi-reviewed-deployment.vercel.app",
    }, {} as Database);
    expect(auth.options.baseURL).toBe("https://codi-reviewed-deployment.vercel.app");
    expect(auth.options.trustedOrigins).toEqual([canonical, "https://codi-reviewed-deployment.vercel.app"]);
    expect(auth.options).not.toHaveProperty("advanced.disableCSRFCheck", true);
    expect(auth.options).not.toHaveProperty("advanced.disableOriginCheck", true);
  });
  it("accepts exactly the runtime preview origin while preserving the canonical origin", () => {
    expect(getAuthOriginConfig({
      BETTER_AUTH_URL: canonical,
      VERCEL_ENV: "preview",
      VERCEL_URL: "codi-reviewed-deployment.vercel.app",
    })).toEqual({
      baseURL: "https://codi-reviewed-deployment.vercel.app",
      trustedOrigins: [canonical, "https://codi-reviewed-deployment.vercel.app"],
    });
  });

  it.each([undefined, "production", "development"])("preserves configured origin outside preview: %s", (environment) => {
    expect(getAuthOriginConfig({ BETTER_AUTH_URL: canonical, VERCEL_ENV: environment, VERCEL_URL: "other.vercel.app" }))
      .toEqual({ baseURL: canonical, trustedOrigins: [canonical] });
  });

  it("keeps the configured origin when runtime deployment identity is unavailable", () => {
    expect(getAuthOriginConfig({ BETTER_AUTH_URL: canonical, VERCEL_ENV: "preview" }))
      .toEqual({ baseURL: canonical, trustedOrigins: [canonical] });
  });

  it.each(["*.vercel.app", "https://codi.vercel.app", "codi.vercel.app.evil.test", "codi.vercel.app/path", "codi.vercel.app:443", "user@codi.vercel.app", "codi.vercel.app\n", "evil.test"])("rejects invalid deployment identity: %j", (hostname) => {
    expect(() => getAuthOriginConfig({ BETTER_AUTH_URL: canonical, VERCEL_ENV: "preview", VERCEL_URL: hostname }))
      .toThrow("Invalid Vercel preview hostname");
  });

  it("does not duplicate the canonical origin", () => {
    expect(getAuthOriginConfig({ BETTER_AUTH_URL: "https://codi.vercel.app", VERCEL_ENV: "preview", VERCEL_URL: "CODI.vercel.app" }).trustedOrigins)
      .toEqual(["https://codi.vercel.app"]);
  });
});
