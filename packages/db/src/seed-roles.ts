import "varlock/auto-load";

import { isNull, sql } from "drizzle-orm";
import { user } from "./schema/auth";
import { roles, userRoles } from "./schema/roles";
import { createDb } from "./index";

const main = async () => {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });

  console.log("Seeding roles...");

  const ROLES = [
    { roleId: "LEARNER", roleName: "Learner" },
    { roleId: "LECTURER", roleName: "Lecturer" },
    { roleId: "ADMIN", roleName: "Admin" },
  ];

  await db.insert(roles).values(ROLES).onConflictDoNothing();

  console.log("Backfilling users with LEARNER role...");

  // db.insert(...).values() only accepts row objects, not a raw SELECT — INSERT ... SELECT
  // needs db.execute() with an explicit column list instead.
  await db.execute(sql`
    INSERT INTO ${userRoles} (user_id, role_id, granted_at)
    SELECT ${user.id}, 'LEARNER', NOW()
    FROM ${user}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${userRoles}
      WHERE ${userRoles.userId} = ${user.id}
      AND ${userRoles.roleId} = 'LEARNER'
      AND ${userRoles.revokedAt} IS NULL
    )
    ON CONFLICT DO NOTHING
  `);

  const roleCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(roles);

  const userRoleCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRoles)
    .where(isNull(userRoles.revokedAt));

  console.log(
    `Seed complete: ${roleCount[0]?.count} roles, ${userRoleCount[0]?.count} active user role assignments`
  );
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
