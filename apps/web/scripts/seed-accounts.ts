import { createAuth, hashPassword } from "@codi-1/auth";
import { createDb } from "@codi-1/db";
import { account, user } from "@codi-1/db/schema/auth";
import { roles, userRoles } from "@codi-1/db/schema/roles";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// The repo is public: emails and the shared password come from the local .env, never from source.
// SEED_ACCOUNT_TARGETS="base@gmail.com:Display Name,other@gmail.com:Other Name"
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} environment variable is not set`);
    process.exit(1);
  }
  return value;
}

const DEFAULT_TARGETS = requireEnv("SEED_ACCOUNT_TARGETS")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [baseEmail, ...name] = entry.split(":");
    return { baseEmail: baseEmail.trim(), displayName: name.join(":").trim() || baseEmail.trim() };
  });

const PASSWORD = requireEnv("SEED_ACCOUNT_PASSWORD");

const ROLES_SPEC = [
  {
    suffix: "student",
    roleName: "LEARNER",
    label: "Student",
    verifyEmail: true,
    triggerVerification: false,
  },
  {
    suffix: "gv",
    roleName: "LECTURER",
    label: "Lecturer",
    verifyEmail: false,
    triggerVerification: true,
  },
  {
    suffix: "admin",
    roleName: "ADMIN",
    label: "Admin",
    verifyEmail: false,
    triggerVerification: true,
  },
] as const;

export async function seedAccounts() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const db = createDb({ DATABASE_URL: databaseUrl });

  const auth = createAuth(
    {
      BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM || "Codi <noreply@hoangblue.dev>",
    },
    db
  );

  console.log("Ensuring roles exist in database...");
  await db
    .insert(roles)
    .values([
      { roleId: "LEARNER", roleName: "Learner" },
      { roleId: "LECTURER", roleName: "Lecturer" },
      { roleId: "ADMIN", roleName: "Admin" },
    ])
    .onConflictDoNothing();

  const hashedPassword = await hashPassword(PASSWORD);

  for (const target of DEFAULT_TARGETS) {
    const [localPart, domain] = target.baseEmail.split("@");
    console.log(`\n========================================`);
    console.log(`Processing base email: ${target.baseEmail}`);
    console.log(`========================================`);

    for (const spec of ROLES_SPEC) {
      const email = `${localPart}+${spec.suffix}@${domain}`;
      const fullName = `${target.displayName} (${spec.label})`;

      console.log(`\n--> Seeding account: ${email} [Role: ${spec.roleName}]`);

      // 1. Check or create user
      let [existingUser] = await db.select().from(user).where(eq(user.email, email));
      let userId: string;

      if (!existingUser) {
        userId = randomUUID().replace(/-/g, "").slice(0, 32);
        console.log(`Creating new user with ID: ${userId}`);
        await db.insert(user).values({
          id: userId,
          name: fullName,
          email,
          emailVerified: spec.verifyEmail,
        });
      } else {
        userId = existingUser.id;
        console.log(`Existing user found (ID: ${userId}). Updating metadata...`);
        await db
          .update(user)
          .set({
            name: fullName,
            emailVerified: spec.verifyEmail,
            updatedAt: new Date(),
          })
          .where(eq(user.id, userId));
      }

      // 2. Ensure the password credential account exists with the seed password
      const [existingAccount] = await db
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

      if (!existingAccount) {
        console.log(`Creating credential account for ${email}...`);
        await db.insert(account).values({
          id: randomUUID().replace(/-/g, "").slice(0, 32),
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
        });
      } else {
        console.log("Updating credential password to the seed password...");
        await db
          .update(account)
          .set({
            password: hashedPassword,
            updatedAt: new Date(),
          })
          .where(eq(account.id, existingAccount.id));
      }

      // 3. Assign role
      await db.transaction(async (tx) => {
        // Revoke active roles
        await tx
          .update(userRoles)
          .set({ revokedAt: new Date() })
          .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

        // Insert new active role
        await tx.insert(userRoles).values({
          userId,
          roleId: spec.roleName,
          grantedAt: new Date(),
        });
      });
      console.log(`Role "${spec.roleName}" assigned to ${email}`);

      // 4. Trigger email verification if required
      if (spec.triggerVerification) {
        try {
          console.log(`Triggering email verification OTP for ${email}...`);
          // @ts-ignore
          await auth.api.sendVerificationOTP({
            body: {
              email,
              type: "email-verification",
            },
          });
          console.log(`✅ Verification email OTP sent to ${email}`);
        } catch (err: any) {
          console.warn(`⚠️ Warning triggering verification OTP for ${email}:`, err.message || err);
        }
      } else {
        console.log(`Email verification marked as verified (${spec.verifyEmail})`);
      }
    }
  }

  console.log("\n========================================");
  console.log("All accounts seeded successfully!");
  console.log("========================================");

  await (db as any).$client?.end?.();
}

seedAccounts()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
