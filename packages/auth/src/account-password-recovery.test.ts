import type { Database } from "@codi-1/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth } from "./index";

const state = vi.hoisted(() => ({
  storage: {} as Record<string, Record<string, unknown>[]>,
  sendEmail: vi.fn(),
}));

vi.mock("@better-auth/drizzle-adapter/relations-v2", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(state.storage) };
});
vi.mock("resend", () => ({ Resend: class { emails = { send: state.sendEmail }; } }));

const baseURL = "http://localhost:3000";
const email = "account@example.com";
const originalPassword = "original-password-123";
const newPassword = "new-password-456";

function createTestAuth(withDelivery = true) {
  const database = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  } as unknown as Database;
  return createAuth({
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_SECRET: "account-recovery-test-secret-at-least-32-characters-long",
    ...(withDelivery ? { RESEND_API_KEY: "fixture-resend-key" } : {}),
  }, database);
}

function cookies(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}
async function signUp(auth: ReturnType<typeof createTestAuth>, address = email) {
  const response = await auth.api.signUpEmail({ body: { name: "Recovery Test", email: address, password: originalPassword }, asResponse: true });
  expect(response.status).toBe(200);
  state.sendEmail.mockClear();
  return cookies(response);
}
async function request(auth: ReturnType<typeof createTestAuth>, endpoint: string, cookie: string, body?: unknown) {
  return auth.handler(new Request(`${baseURL}/api/auth/account/password/${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL, Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
function sentOTP() {
  const message = state.sendEmail.mock.calls.at(-1)?.[0];
  const otp = (message?.html as string | undefined)?.match(/>\s*(\d{6})\s*<\/span>/)?.[1];
  expect(otp).toMatch(/^\d{6}$/);
  return otp!;
}
async function verify(auth: ReturnType<typeof createTestAuth>, cookie: string) {
  expect((await request(auth, "request-reset", cookie, {})).status).toBe(200);
  const response = await request(auth, "verify-reset", cookie, { otp: sentOTP() });
  expect(response.status).toBe(200);
  return response;
}

describe("account password recovery", () => {
  beforeEach(() => {
    state.storage = { user: [], session: [], account: [], verification: [] };
    state.sendEmail.mockReset().mockResolvedValue({ data: { id: "fixture-message" }, error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("requires authentication for every recovery step", async () => {
    const auth = createTestAuth();
    for (const [endpoint, body] of [
      ["request-reset", {}], ["verify-reset", { otp: "123456" }],
      ["reset-status", undefined], ["reset", { newPassword }],
    ] as const) expect((await request(auth, endpoint, "", body)).status).toBe(401);
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it("sends only to the signed-in account email, regardless of a client-supplied address", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    expect((await request(auth, "request-reset", cookie, { email: "attacker@example.com" })).status).toBe(200);
    expect(state.sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: email }));
    expect(sentOTP()).toHaveLength(6);
    expect((await request(auth, "reset", cookie, { newPassword })).status).toBe(400);
  });

  it("rejects incorrect and expired codes without granting password-reset access", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await request(auth, "request-reset", cookie, {});
    const otp = sentOTP();
    const wrongOTP = `${(Number(otp[0]) + 1) % 10}${otp.slice(1)}`;
    const wrong = await request(auth, "verify-reset", cookie, { otp: wrongOTP });
    expect(wrong.status).toBe(400);
    expect((await wrong.json() as { code: string }).code).toBe("INVALID_OTP");
    expect(cookies(wrong)).not.toContain("codi.account-password-reset=");
    for (const item of state.storage.verification ?? []) item.expiresAt = new Date(Date.now() - 1_000);
    const expired = await request(auth, "verify-reset", cookie, { otp });
    expect(expired.status).toBe(400);
    expect((await expired.json() as { code: string }).code).toBe("OTP_EXPIRED");
    expect((await request(auth, "reset-status", cookie)).status).toBe(400);
  });

  it("exchanges a correct OTP for an HttpOnly grant once and keeps the secret out of the response body", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await request(auth, "request-reset", cookie, {});
    const otp = sentOTP();
    const response = await request(auth, "verify-reset", cookie, { otp });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("; ")).toMatch(/codi\.account-password-reset=.*HttpOnly/i);
    expect(await response.json()).toEqual({ success: true });
    const status = await request(auth, "reset-status", `${cookie}; ${cookies(response)}`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ email });
    expect((await request(auth, "verify-reset", cookie, { otp })).status).toBe(400);
  });

  it("does not accept another account's code or password-reset grant", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await request(auth, "request-reset", cookie, {});
    const otp = sentOTP();
    const otherCookie = await signUp(auth, "other@example.com");
    expect((await request(auth, "verify-reset", otherCookie, { otp })).status).toBe(400);
    const verified = await request(auth, "verify-reset", cookie, { otp });
    expect(verified.status).toBe(200);
    const combined = `${otherCookie}; ${cookies(verified)}`;
    expect((await request(auth, "reset-status", combined)).status).toBe(400);
    expect((await request(auth, "reset", combined, { newPassword })).status).toBe(400);
  });

  it("rejects a forged or expired grant", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    expect((await request(auth, "reset", `${cookie}; codi.account-password-reset=forged`, { newPassword })).status).toBe(400);
    const grant = cookies(await verify(auth, cookie));
    for (const item of state.storage.verification ?? []) item.expiresAt = new Date(Date.now() - 1_000);
    expect((await request(auth, "reset-status", `${cookie}; ${grant}`)).status).toBe(400);
    expect((await request(auth, "reset", `${cookie}; ${grant}`, { newPassword })).status).toBe(400);
  });

  it("changes the password after verification, revokes sessions and prevents grant reuse", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    const grant = cookies(await verify(auth, cookie));
    const response = await request(auth, "reset", `${cookie}; ${grant}`, { newPassword });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("; ")).toMatch(/codi\.account-password-reset=;.*Max-Age=0/i);
    expect(await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) })).toBeNull();
    const oldSignIn = await auth.api.signInEmail({ body: { email, password: originalPassword }, asResponse: true });
    expect(oldSignIn.status).toBe(401);
    const signIn = await auth.api.signInEmail({ body: { email, password: newPassword }, asResponse: true });
    expect(signIn.status).toBe(200);
    expect((await request(auth, "reset", `${cookies(signIn)}; ${grant}`, { newPassword: "another-password-789" })).status).toBe(400);
  });

  it("blocks codes after too many wrong attempts", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await request(auth, "request-reset", cookie, {});
    const otp = sentOTP();
    const wrongOTP = `${(Number(otp[0]) + 1) % 10}${otp.slice(1)}`;
    for (let attempt = 0; attempt < 3; attempt++) expect((await request(auth, "verify-reset", cookie, { otp: wrongOTP })).status).toBe(400);
    const response = await request(auth, "verify-reset", cookie, { otp });
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("reports delivery failure instead of pretending a recovery email was sent", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    state.sendEmail.mockResolvedValue({ data: null, error: { message: "Delivery rejected" } });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await request(auth, "request-reset", cookie, {})).status).toBe(500);
    expect(log).not.toHaveBeenCalled();
  });

  it("requires email delivery configuration", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const auth = createTestAuth(false);
    const cookie = await signUp(auth);
    expect((await request(auth, "request-reset", cookie, {})).status).toBe(500);
  });
});
