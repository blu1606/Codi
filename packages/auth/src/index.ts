import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@codi-1/db";
import * as schema from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

import { getChangeEmailOTPEmailHtml, getResetPasswordOTPEmailHtml, getVerificationOTPEmailHtml } from "./email-templates";
import { ROLE } from "./rbac";
import { accountPasswordRecovery } from "./account-password-recovery";

export * from "./rbac";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  const fromAddress = env.EMAIL_FROM || "Codi <noreply@hoangblue.dev>";

  const otpPlugin = emailOTP({
    otpLength: 6,
    expiresIn: 120,
    sendVerificationOnSignUp: true,
    changeEmail: { enabled: true },
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (type === "change-email" || type === "forget-password") {
        if (!resend) throw new Error("Email delivery is not configured.");
        const result = await resend.emails.send({
          from: fromAddress,
          to: email,
          subject: type === "change-email" ? "Mã xác thực đổi email Codi" : "Mã OTP đặt lại mật khẩu Codi",
          html: type === "change-email" ? getChangeEmailOTPEmailHtml({ otp }) : getResetPasswordOTPEmailHtml({ otp }),
        });
        if (result.error) throw new Error("Could not send the verification code.");
        return;
      }
      if (resend) {
        try {
          const result = await resend.emails.send({
            from: fromAddress,
            to: email,
            subject: "Mã OTP xác thực tài khoản Codi",
            html: getVerificationOTPEmailHtml({ otp }),
          });
          if (result.error) {
            console.warn(`\n⚠️ [Resend Error]: ${result.error.message}\n👉 [Fallback OTP for ${email}]: ${otp} (Hết hạn sau 2 phút)\n`);
          }
        } catch (error) {
          console.error("[Resend] Failed to send OTP email:", error);
          console.log(`👉 [Fallback OTP for ${email}]: ${otp}`);
        }
      } else {
        console.log(`[Auth OTP for ${email}]: ${otp} (Type: ${type}, Hết hạn sau 2 phút)`);
      }
    },
  });

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/request-email-change") return;
        // Email-change requests must report delivery failures, rather than
        // swallowing them through Better Auth's background-task helper.
        return {
          context: {
            context: {
              runInBackgroundOrAwait: async (promise: void | Promise<unknown>) => { await promise; },
            },
          },
        };
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/request-email-change" || !ctx.context.session) return;
        const response = ctx.context.returned;
        if (!response || typeof response !== "object" || !("success" in response) || response.success !== true) return;
        if (typeof ctx.body?.newEmail !== "string") return;
        // The OTP plugin silently returns success for an occupied address.
        // After its session checks, report that the email cannot be used so
        // signed-in users are not asked to enter a code that was never sent.
        const existingAccount = await ctx.context.internalAdapter.findUserByEmail(ctx.body.newEmail.toLowerCase());
        if (existingAccount) {
          throw new APIError("BAD_REQUEST", {
            code: "EMAIL_UNAVAILABLE",
            message: "This email cannot be used for an email change.",
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // idempotent via onConflictDoNothing, not check-then-insert: a retried hook
            // call (or future OAuth account linking) can safely race this same insert.
            await database
              .insert(userRoles)
              .values({ userId: user.id, roleId: ROLE.LEARNER, grantedBy: null })
              .onConflictDoNothing();
          },
        },
      },
    },
    plugins: [
      nextCookies(),
      otpPlugin,
      accountPasswordRecovery(otpPlugin),
    ],
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
