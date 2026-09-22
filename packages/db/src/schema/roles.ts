import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const roles = pgTable("roles", {
  roleId: text("role_id").primaryKey(),
  roleName: text("role_name").notNull().unique(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.roleId),
    grantedBy: text("granted_by").references(() => user.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedBy: text("revoked_by").references(() => user.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    // a user may hold a given role once at a time, but may be re-granted later
    uniqueIndex("user_roles_active_idx")
      .on(table.userId, table.roleId)
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      "ck_user_roles_revoke_order",
      sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.grantedAt}`,
    ),
  ],
);
