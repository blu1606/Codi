import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@codi-1/db";
import * as schema from "@codi-1/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

import { getResetPasswordOTPEmailHtml, getVerificationOTPEmailHtml } from "./email-templates";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  const fromAddress = env.EMAIL_FROM || "Codi <noreply@hoangblue.dev>";

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      nextCookies(),
      emailOTP({
        otpLength: 6,
        expiresIn: 120, // 2 minutes expiry
        sendVerificationOnSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (resend) {
            try {
              const isReset = type === "forget-password";
              const subject = isReset
                ? "Mã OTP đặt lại mật khẩu Codi"
                : "Mã OTP xác thực tài khoản Codi";
              const html = isReset
                ? getResetPasswordOTPEmailHtml({ otp })
                : getVerificationOTPEmailHtml({ otp });

              const result = await resend.emails.send({
                from: fromAddress,
                to: email,
                subject,
                html,
              });

              if (result.error) {
                console.warn(
                  `\n⚠️ [Resend Error]: ${result.error.message}\n👉 [Fallback OTP for ${email}]: ${otp} (Hết hạn sau 2 phút)\n`
                );
              }
            } catch (error) {
              console.error("[Resend] Failed to send OTP email:", error);
              console.log(`👉 [Fallback OTP for ${email}]: ${otp}`);
            }
          } else {
            console.log(`[Auth OTP for ${email}]: ${otp} (Type: ${type}, Hết hạn sau 2 phút)`);
          }
        },
      }),
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
    },
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
