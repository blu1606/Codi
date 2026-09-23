import "varlock/auto-load";

import { and, eq, isNull } from "drizzle-orm";

import { createDb } from "./index";
import { user } from "./schema/auth";
import { userRoles } from "./schema/roles";

const main = async () => {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const email = process.env.SEED_ADMIN_EMAIL || process.argv[2];
  if (!email) {
    console.error(
      "ERROR: provide an email via SEED_ADMIN_EMAIL env var or as the first CLI argument"
    );
    process.exit(1);
  }

  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });

  const [targetUser] = await db.select().from(user).where(eq(user.email, email));
  if (!targetUser) {
    console.error(
      `ERROR: no user with email "${email}" exists yet — register normally first, then re-run this script`
    );
    process.exit(1);
  }

  const [alreadyAdmin] = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, targetUser.id),
        eq(userRoles.roleId, "ADMIN"),
        isNull(userRoles.revokedAt)
      )
    );
  if (alreadyAdmin) {
    console.log(`"${email}" already holds an active ADMIN grant — nothing to do.`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const currentActive = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, targetUser.id), isNull(userRoles.revokedAt)))
      .for("update");

    for (const row of currentActive) {
      await tx
        .update(userRoles)
        .set({ revokedAt: new Date() })
        .where(eq(userRoles.id, row.id));
    }

    await tx.insert(userRoles).values({
      userId: targetUser.id,
      roleId: "ADMIN",
    });
  });

  console.log(`Granted ADMIN to "${email}".`);
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
