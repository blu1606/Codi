import { createAuth } from "@codi-1/auth";
import { createDb } from "@codi-1/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth({
  BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET!,
  BETTER_AUTH_URL: ENV.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL!,
  RESEND_API_KEY: ENV.RESEND_API_KEY || process.env.RESEND_API_KEY,
  EMAIL_FROM: ENV.EMAIL_FROM || process.env.EMAIL_FROM,
  GOOGLE_CLIENT_ID: ENV.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: ENV.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: ENV.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: ENV.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
}, db);
