import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@codi-1/db";
import * as schema from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

import { getResetPasswordOTPEmailHtml, getVerificationOTPEmailHtml } from "./email-templates";
import { ROLE } from "./rbac";
import { getAuthOriginConfig, type AuthOriginConfig } from "./auth-origin";

export * from "./rbac";

export type AuthConfig = AuthOriginConfig & {
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

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    ...getAuthOriginConfig(env),
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
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
      session: {
        create: {
          before: async (session) => {
            const [dbUser] = await database
              .select({ banned: schema.user.banned })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
              
            if (dbUser?.banned) {
              throw new APIError("UNAUTHORIZED", { message: "Tai khoan da bi khoa." });
            }
            return { data: session };
          },
          after: async (session) => {
            // Re-check after insertion to close the race condition with concurrent bans
            const [dbUser] = await database
              .select({ banned: schema.user.banned })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
              
            if (dbUser?.banned) {
              await database.delete(schema.session).where(eq(schema.session.id, session.id));
              throw new APIError("UNAUTHORIZED", { message: "Tai khoan da bi khoa." });
            }
          }
        }
      }
    },
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
                ? "Ma OTP dat lai mat khau Codi"
                : "Ma OTP xac thuc tai khoan Codi";
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
                  `\n[Resend Error]: ${result.error.message}\n[Fallback OTP for ${email}]: ${otp} (Het han sau 2 phut)\n`
                );
              }
            } catch (error) {
              console.error("[Resend] Failed to send OTP email:", error);
              console.log(`[Fallback OTP for ${email}]: ${otp}`);
            }
          } else {
            console.log(`[Auth OTP for ${email}]: ${otp} (Type: ${type}, Het han sau 2 phut)`);
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
