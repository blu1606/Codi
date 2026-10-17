import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { seedOnboardingFixture } from "./onboarding-fixture";

async function main() {
if (process.env.NODE_ENV === "production" || !process.env.DATABASE_URL) throw new Error("Development DATABASE_URL required");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
try {
  const emails = process.env.SEED_ACCOUNT_TARGETS?.split(",").map((entry) => {
    const base = entry.trim().split(":")[0]!;
    const at = base.lastIndexOf("@");
    if (at <= 0) throw new Error("Invalid development seed target");
    return `${base.slice(0, at)}+student${base.slice(at)}`;
  });
  // Without explicit targets, only accounts bearing BOTH signatures of seed-accounts.ts qualify.
  const accountScope = emails?.length ? inArray(user.email, emails) : and(like(user.email, "%+student@%"), like(user.name, "%(Student)"));
  const targets = await db.select({ id: user.id }).from(user).innerJoin(userRoles, eq(userRoles.userId, user.id)).where(and(accountScope, eq(user.banned, false), eq(userRoles.roleId, "LEARNER"), isNull(userRoles.revokedAt)));
  if (!targets.length) throw new Error("Run the per-role account seed first");
  await db.transaction((tx) => seedOnboardingFixture(tx, "dev-onboarding-typescript", [...new Set(targets.map((target) => target.id))]));
  console.log(`Development diagnostic fixture ready for ${targets.length} seeded learner account(s).`);
  console.log("http://localhost:3001/learn/dev-onboarding-typescript/onboarding");
} catch { console.error("Onboarding dev seed failed; database details suppressed."); process.exitCode = 1; }
finally { await db.$client.end(); }
}
void main().catch(() => { console.error("Could not initialize development seed."); process.exitCode = 1; });
