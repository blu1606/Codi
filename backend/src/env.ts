// Plain process.env reader that replaces Codi's varlock-generated ENV. Values come from backend/.env
// (loaded by `tsx --env-file-if-exists=.env`) with local development defaults. Keys mirror
// Codi's apps/web/.env.schema; see backend/.env.example.

const DEV_SECRET = "codi-rebuild-local-dev-secret-change-me-0123456789";

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const NODE_ENV = (read("NODE_ENV") ?? "development") as "development" | "production" | "test";
const DATABASE_URL = read("DATABASE_URL") ?? "postgresql://codi:codi@localhost:5544/codi";
const BETTER_AUTH_SECRET = read("BETTER_AUTH_SECRET") ?? DEV_SECRET;

if (NODE_ENV === "production" && BETTER_AUTH_SECRET === DEV_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be set in production.");
}
if (BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
}
if (/supabase\.(co|com)/i.test(DATABASE_URL)) {
  throw new Error("DATABASE_URL points at Supabase; codi-rebuild only runs against the local Postgres.");
}

export const ENV = {
  NODE_ENV,
  DATABASE_URL,
  BETTER_AUTH_SECRET,
  // The browser origin. The Vite dev server proxies /api to the backend, so auth is same-origin.
  BETTER_AUTH_URL: read("BETTER_AUTH_URL") ?? "http://localhost:3001",
  AI_PROVIDER: (read("AI_PROVIDER") ?? "gemini") as "gemini" | "openai",
  AI_MODEL: read("AI_MODEL"),
  GOOGLE_GENERATIVE_AI_API_KEY: read("GOOGLE_GENERATIVE_AI_API_KEY"),
  OPENAI_API_KEY: read("OPENAI_API_KEY"),
  RESEND_API_KEY: read("RESEND_API_KEY"),
  EMAIL_FROM: read("EMAIL_FROM"),
  GOOGLE_CLIENT_ID: read("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: read("GOOGLE_CLIENT_SECRET"),
  GITHUB_CLIENT_ID: read("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: read("GITHUB_CLIENT_SECRET"),
  R2_ACCOUNT_ID: read("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: read("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: read("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET: read("R2_BUCKET"),
  R2_ASSIGNMENT_BUCKET: read("R2_ASSIGNMENT_BUCKET"),
  R2_PUBLIC_URL: read("R2_PUBLIC_URL"),
  SEPAY_WEBHOOK_SECRET: read("SEPAY_WEBHOOK_SECRET"),
  SEPAY_BANK_CODE: read("SEPAY_BANK_CODE"),
  SEPAY_ACCOUNT_NUMBER: read("SEPAY_ACCOUNT_NUMBER"),
  SEED_ACCOUNT_PASSWORD: read("SEED_ACCOUNT_PASSWORD") ?? "Codi@12345",
  // Prototype demo deploys: keeps the simulated SePay route (POST /api/dev/simulate-payment) on in production.
  DEMO_TOOLS: read("DEMO_TOOLS") === "true",
} as const;
