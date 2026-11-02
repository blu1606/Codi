import { createAuth } from "@codi-1/auth";
import { createDb } from "@codi-1/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth({
  ...ENV,
  GOOGLE_CLIENT_ID: ENV.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: ENV.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: ENV.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: ENV.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
}, db);
