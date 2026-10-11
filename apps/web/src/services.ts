import { createAuth } from "@codi-1/auth";
import { createDb } from "@codi-1/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth({
  ...ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
}, db);
