import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { userRoles } from "@codi-1/db/schema/roles";
import { user } from "@codi-1/db/schema/auth";

export const ROLE = { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" } as const;
export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export async function getActiveRoles(db: Database, userId: string): Promise<RoleId[]> {
  const userRecord = await db
    .select({ banned: user.banned })
    .from(user)
    .where(eq(user.id, userId));

  if (userRecord.length === 0 || userRecord[0]?.banned) {
    return [];
  }

  const result = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(userRoles.revokedAt)
      )
    );

  return result.map((r) => r.roleId as RoleId);
}

export async function countActiveHolders(db: Database, roleId: RoleId): Promise<number> {
  const result = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.roleId, roleId),
        isNull(userRoles.revokedAt)
      )
    );

  if (result.length === 0) return 0;

  const userIds = result.map((r) => r.userId);
  const unbannedUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.id, userIds),
        eq(user.banned, false)
      )
    );

  return unbannedUsers.length;
}

export class ForbiddenError extends Error {}

export async function requireRole(
  db: Database,
  userId: string,
  ...allowedRoles: RoleId[]
): Promise<void> {
  const active = await getActiveRoles(db, userId);
  if (!allowedRoles.some((r) => active.includes(r))) {
    throw new ForbiddenError(`User ${userId} lacks required role(s): ${allowedRoles.join(", ")}`);
  }
}
