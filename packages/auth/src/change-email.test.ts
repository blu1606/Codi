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

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: state.sendEmail };
  },
}));

const baseURL = "http://localhost:3000";
const oldEmail = "original@example.com";
const newEmail = "replacement@example.com";

function createTestAuth(withEmailDelivery = true) {
  const database = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  } as unknown as Database;
  return createAuth({
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_SECRET: "email-change-test-secret-at-least-32-characters-long",
    ...(withEmailDelivery ? { RESEND_API_KEY: "fixture-resend-key" } : {}),
  }, database);
}

async function signUp(auth: ReturnType<typeof createTestAuth>, email = oldEmail) {
  const response = await auth.api.signUpEmail({
    body: { name: "Email Change Test", email, password: "test-password-123" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token=");
  state.sendEmail.mockClear();
  return cookie;
}

async function post(auth: ReturnType<typeof createTestAuth>, endpoint: string, cookie: string, body: unknown) {
  return auth.handler(new Request(`${baseURL}/api/auth/email-otp/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL, Cookie: cookie },
    body: JSON.stringify(body),
  }));
}

function sentOTP() {
  const message = state.sendEmail.mock.calls.at(-1)?.[0];
  const otp = (message?.html as string | undefined)?.match(/>\s*(\d{6})\s*<\/span>/)?.[1];
  expect(otp).toMatch(/^\d{6}$/);
  return otp!;
}

describe("email changes verified by OTP", () => {
  beforeEach(() => {
    state.storage = { user: [], session: [], account: [], verification: [] };
    state.sendEmail.mockReset().mockResolvedValue({ data: { id: "fixture-message" }, error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("requires a signed-in account to request an email change", async () => {
    const auth = createTestAuth();
    const response = await post(auth, "request-email-change", "", { newEmail });
    expect(response.status).toBe(401);
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it("sends the OTP to the new email while keeping the original email unchanged", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    const response = await post(auth, "request-email-change", cookie, { newEmail });
    expect(response.status).toBe(200);
    expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: newEmail, subject: "Mã xác thực đổi email Codi" }));
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
    expect(sentOTP()).toHaveLength(6);
  });

  it("keeps the original email for an incorrect OTP", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await post(auth, "request-email-change", cookie, { newEmail });
    const otp = sentOTP();
    const wrongOTP = `${(Number(otp[0]) + 1) % 10}${otp.slice(1)}`;
    const response = await post(auth, "change-email", cookie, { newEmail, otp: wrongOTP });
    expect(response.status).toBe(400);
    expect((await response.json() as { code: string }).code).toBe("INVALID_OTP");
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
  });

  it("rejects expired OTPs without changing the email", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await post(auth, "request-email-change", cookie, { newEmail });
    const otp = sentOTP();
    for (const verification of state.storage.verification ?? []) verification.expiresAt = new Date(Date.now() - 1_000);
    const response = await post(auth, "change-email", cookie, { newEmail, otp });
    expect(response.status).toBe(400);
    expect((await response.json() as { code: string }).code).toBe("OTP_EXPIRED");
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
  });

  it("updates and verifies the email only after a correct OTP and prevents reuse", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await post(auth, "request-email-change", cookie, { newEmail });
    const otp = sentOTP();
    const response = await post(auth, "change-email", cookie, { newEmail, otp });
    expect(response.status).toBe(200);
    const context = await auth.$context;
    expect(await context.internalAdapter.findUserByEmail(oldEmail)).toBeNull();
    expect((await context.internalAdapter.findUserByEmail(newEmail))?.user).toMatchObject({ email: newEmail, emailVerified: true });
    const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) });
    expect(session?.user.email).toBe(newEmail);
    const reused = await post(auth, "change-email", cookie, { newEmail, otp });
    expect(reused.status).toBe(400);
  });

  it("binds the OTP to the requested destination email", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await post(auth, "request-email-change", cookie, { newEmail });
    const response = await post(auth, "change-email", cookie, { newEmail: "different@example.com", otp: sentOTP() });
    expect(response.status).toBe(400);
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
  });

  it("binds the OTP to the account that requested it", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await post(auth, "request-email-change", cookie, { newEmail });
    const otp = sentOTP();
    const otherCookie = await signUp(auth, "other@example.com");
    const response = await post(auth, "change-email", otherCookie, { newEmail, otp });
    expect(response.status).toBe(400);
    const context = await auth.$context;
    expect((await context.internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
    expect((await context.internalAdapter.findUserByEmail("other@example.com"))?.user.email).toBe("other@example.com");
  });

  it("reports an unavailable email instead of pretending an OTP was sent", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    await signUp(auth, newEmail);
    const response = await post(auth, "request-email-change", cookie, { newEmail });
    expect(response.status).toBe(400);
    expect((await response.json() as { code: string }).code).toBe("EMAIL_UNAVAILABLE");
    expect(state.sendEmail).not.toHaveBeenCalled();
    const verification = await post(auth, "change-email", cookie, { newEmail, otp: "123456" });
    expect(verification.status).toBe(400);
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
  });

  it("reports delivery failure and does not log a fallback OTP for email changes", async () => {
    const auth = createTestAuth();
    const cookie = await signUp(auth);
    state.sendEmail.mockResolvedValue({ data: null, error: { message: "Delivery rejected" } });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post(auth, "request-email-change", cookie, { newEmail });
    expect(response.status).toBe(500);
    expect(log).not.toHaveBeenCalled();
    expect((await (await auth.$context).internalAdapter.findUserByEmail(oldEmail))?.user.email).toBe(oldEmail);
  });

  it("requires email delivery to be configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const auth = createTestAuth(false);
    const cookie = await signUp(auth);
    log.mockClear();
    const response = await post(auth, "request-email-change", cookie, { newEmail });
    expect(response.status).toBe(500);
    expect(log).not.toHaveBeenCalled();
  });
});
