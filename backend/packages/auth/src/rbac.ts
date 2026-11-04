import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { userRoles } from "@codi-1/db/schema/roles";
import { user } from "@codi-1/db/schema/auth";

import type { RoleId } from "./roles";
export { ROLE, ROLE_LABEL, getPrimaryRole, getRoleHome, type RoleId } from "./roles";

// One request often asks for the same user's roles several times (the route, then each service it calls; a lesson
// read did it three times). Inside withRoleCache() the first answer is reused for the rest of that request.
const roleCache = new AsyncLocalStorage<Map<string, Promise<RoleId[]>>>();

/** Runs fn with a role cache that lives for this call only (the host wraps every request in it). */
export function withRoleCache<T>(fn: () => T): T {
  return roleCache.run(new Map(), fn);
}

/** Drops the cached roles of a user, for code that changes roles or bans and then checks them in the same request. */
export function forgetActiveRoles(userId: string): void {
  roleCache.getStore()?.delete(userId);
}

/** Active roles of a user; none when the user is banned or missing. */
export function getActiveRoles(db: Database, userId: string): Promise<RoleId[]> {
  const cache = roleCache.getStore();
  if (!cache) return loadActiveRoles(db, userId);
  let roles = cache.get(userId);
  if (!roles) {
    roles = loadActiveRoles(db, userId);
    cache.set(userId, roles);
    // A failed lookup must not be reused.
    roles.catch(() => {
      if (cache.get(userId) === roles) cache.delete(userId);
    });
  }
  return roles;
}

// One query: the user's ban flag with each active role (a user without roles still returns one row).
async function loadActiveRoles(db: Database, userId: string): Promise<RoleId[]> {
  const rows = await db
    .select({ banned: user.banned, roleId: userRoles.roleId })
    .from(user)
    .leftJoin(userRoles, and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)))
    .where(eq(user.id, userId));

  if (rows.length === 0 || rows[0]?.banned) return [];
  return rows.flatMap((r) => (r.roleId ? [r.roleId as RoleId] : []));
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
