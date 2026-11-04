import { describe, expect, it } from "vitest";
import type { Database } from "@codi-1/db";
import { createAuth } from "./index";

const baseURL = "http://localhost:3001";
const secret = "test-only-secret-not-a-real-credential-123456";

function signUp(auth: ReturnType<typeof createAuth>, headers: Record<string, string> = {}) {
  return auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL, ...headers },
    body: JSON.stringify({ name: "Captcha Test", email: "captcha@example.test", password: "Password123!" }),
  }));
}

describe("email sign-up captcha", () => {
  it("rejects a sign-up without a Turnstile token before touching the database", async () => {
    // The empty database would throw on any query, so a 400 proves the request stopped at the captcha check.
    const auth = createAuth({ BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret, TURNSTILE_SECRET_KEY: "test-secret" }, {} as Database);
    const response = await signUp(auth);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MISSING_RESPONSE" });
  });

  it("does not register the captcha plugin without a Turnstile secret", () => {
    const auth = createAuth({ BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret }, {} as Database);
    expect(auth.options.plugins.map((plugin) => plugin.id)).not.toContain("captcha");
  });
});
