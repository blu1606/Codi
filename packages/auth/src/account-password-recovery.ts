import { randomBytes } from "node:crypto";
import { APIError, createAuthEndpoint, resetPassword, sessionMiddleware } from "better-auth/api";
import type { emailOTP } from "better-auth/plugins";
import { z } from "zod";

const recoveryCookie = "codi.account-password-reset";
const recoveryLifetime = 10 * 60;

export function accountPasswordRecovery(otpPlugin: ReturnType<typeof emailOTP>) {
  return {
    id: "account-password-recovery",
    endpoints: {
      requestAccountPasswordReset: createAuthEndpoint("/account/password/request-reset", {
        method: "POST",
        body: z.object({}),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const email = ctx.context.session.user.email.toLowerCase();
        await otpPlugin.endpoints.requestPasswordResetEmailOTP({
          context: {
            ...ctx.context,
            // Delivery failure must reach the user before showing OTP inputs.
            runInBackgroundOrAwait: async (promise: void | Promise<unknown>) => { await promise; },
          },
          body: { email },
          headers: ctx.headers,
          request: ctx.request,
        });
        return ctx.json({ success: true, email });
      }),
      verifyAccountPasswordReset: createAuthEndpoint("/account/password/verify-reset", {
        method: "POST",
        body: z.object({ otp: z.string().regex(/^\d{6}$/) }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const email = ctx.context.session.user.email.toLowerCase();
        const identifier = `forget-password-otp-${email}`;
        const original = await ctx.context.internalAdapter.findVerificationValue(identifier);
        if (original && original.expiresAt <= new Date()) {
          throw new APIError("BAD_REQUEST", { code: "OTP_EXPIRED", message: "Verification code expired." });
        }
        await otpPlugin.endpoints.checkVerificationOTP({
          context: ctx.context,
          body: { email, type: "forget-password", otp: ctx.body.otp },
          headers: ctx.headers,
          request: ctx.request,
        });
        // Exchange the checked OTP once. Reject a concurrent resend/replay
        // instead of issuing a second password-reset grant.
        const consumed = await ctx.context.internalAdapter.consumeVerificationValue(identifier);
        if (!original || !consumed || consumed.id !== original.id || consumed.value !== original.value) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid verification code." });
        }
        const token = randomBytes(32).toString("hex");
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: `reset-password:${token}`,
          value: ctx.context.session.user.id,
          expiresAt: new Date(Date.now() + recoveryLifetime * 1_000),
        });
        ctx.setCookie(recoveryCookie, token, {
          httpOnly: true,
          secure: ctx.context.baseURL.startsWith("https://"),
          sameSite: "lax",
          path: "/",
          maxAge: recoveryLifetime,
        });
        return ctx.json({ success: true });
      }),
      getAccountPasswordResetStatus: createAuthEndpoint("/account/password/reset-status", {
        method: "GET",
        use: [sessionMiddleware],
      }, async (ctx) => {
        const token = ctx.getCookie(recoveryCookie);
        const verification = token ? await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`) : null;
        if (!verification || verification.value !== ctx.context.session.user.id || verification.expiresAt <= new Date()) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_RESET_GRANT", message: "Verify your email before resetting the password." });
        }
        return ctx.json({ email: ctx.context.session.user.email });
      }),
      resetAccountPassword: createAuthEndpoint("/account/password/reset", {
        method: "POST",
        body: z.object({ newPassword: z.string().min(8).max(128) }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const token = ctx.getCookie(recoveryCookie);
        const verification = token ? await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`) : null;
        if (!token || !verification || verification.value !== ctx.context.session.user.id || verification.expiresAt <= new Date()) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_RESET_GRANT", message: "Verify your email before resetting the password." });
        }
        await resetPassword({
          context: ctx.context,
          body: { newPassword: ctx.body.newPassword, token },
          headers: ctx.headers,
          request: ctx.request,
        });
        ctx.setCookie(recoveryCookie, "", { httpOnly: true, secure: ctx.context.baseURL.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 0 });
        return ctx.json({ success: true });
      }),
    },
    rateLimit: [
      { pathMatcher: (path: string) => path === "/account/password/request-reset", window: 60, max: 3 },
      { pathMatcher: (path: string) => path === "/account/password/verify-reset", window: 60, max: 5 },
      { pathMatcher: (path: string) => path === "/account/password/reset", window: 60, max: 3 },
    ],
  };
}
