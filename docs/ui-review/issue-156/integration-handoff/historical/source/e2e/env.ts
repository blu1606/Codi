import fs from "node:fs";
import path from "node:path";

// Loads apps/web/.env into process.env without overriding values that are already set.
// Values are never logged.
export function loadLocalEnv(file = path.resolve(__dirname, "..", ".env")): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

export type SeedRole = "learner" | "lecturer" | "admin";

const ROLE_SUFFIX: Record<SeedRole, string> = { learner: "student", lecturer: "gv", admin: "admin" };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to apps/web/.env (see docs/ui-test-flows.md §5).`);
  }
  return value;
}

// SEED_ACCOUNT_TARGETS="base@mail:Name,other@mail:Name"; the first target's +student/+gv/+admin aliases are
// the accounts created by `pnpm db:seed-accounts`.
function seedBase(): { local: string; domain: string } {
  const first = requireEnv("SEED_ACCOUNT_TARGETS").split(",")[0]?.split(":")[0]?.trim() ?? "";
  const [local, domain] = first.split("@");
  if (!local || !domain) throw new Error("SEED_ACCOUNT_TARGETS must start with an email address");
  return { local, domain };
}

export function seedEmail(role: SeedRole): string {
  const { local, domain } = seedBase();
  return `${local}+${ROLE_SUFFIX[role]}@${domain}`;
}

export function seedPassword(): string {
  return requireEnv("SEED_ACCOUNT_PASSWORD");
}

// Throwaway addresses share the seed mailbox (plus-alias), prefixed `uitest` so they are easy to find and purge.
export function throwawayEmail(tag: string): string {
  const { local, domain } = seedBase();
  return `${local}+uitest${tag}${Date.now()}@${domain}`;
}

export const dbAllowed = (): boolean => process.env.E2E_ALLOW_DB === "1";

export const authFile = (role: SeedRole): string => path.resolve(__dirname, ".auth", `${role}.json`);
