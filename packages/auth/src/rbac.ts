import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { userRoles } from "@codi-1/db/schema/roles";

export const ROLE = { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" } as const;
export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export async function getActiveRoles(db: Database, userId: string): Promise<RoleId[]> {
  const result = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

  return result.map((r) => r.roleId as RoleId);
}

export async function countActiveHolders(db: Database, roleId: RoleId): Promise<number> {
  const result = await db
    .select({ total: count() })
    .from(userRoles)
    .where(and(eq(userRoles.roleId, roleId), isNull(userRoles.revokedAt)));

  return result[0]?.total ?? 0;
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
