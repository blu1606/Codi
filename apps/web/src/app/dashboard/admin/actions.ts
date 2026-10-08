"use server";

import { and, count, eq, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";

import { requireRole, ROLE, type RoleId } from "@codi-1/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { user } from "@codi-1/db/schema/auth";
import { session as session_table } from "@codi-1/db/schema/auth";
import { auth, db } from "@/services";

export async function updateUserRole(targetUserId: string, newRoleId: RoleId): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  await db.transaction(async (tx) => {
    // Lock all active admins to serialize admin-altering operations and revalidate caller
    const activeAdmins = await tx
      .select({ id: userRoles.id, userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(user, eq(userRoles.userId, user.id))
      .where(
        and(
          eq(userRoles.roleId, ROLE.ADMIN),
          isNull(userRoles.revokedAt),
          eq(user.banned, false)
        )
      )
      .orderBy(userRoles.id)
      .for("update");

    if (!activeAdmins.some((a) => a.userId === session.user.id)) {
      throw new Error("Unauthorized or banned");
    }

    // lock this user's active role row(s) first
    const currentActive = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, targetUserId), isNull(userRoles.revokedAt)))
      .for("update");

    const wasAdmin = currentActive.some(r => r.roleId === ROLE.ADMIN);

    if (wasAdmin && newRoleId !== ROLE.ADMIN) {
      const otherAdmins = activeAdmins.filter((a) => a.userId !== targetUserId);
      if (otherAdmins.length === 0) {
        throw new Error("Khong the xoa quyen Admin cuoi cung dang hoat dong.");
      }
    }

    for (const row of currentActive) {
      await tx
        .update(userRoles)
        .set({ revokedAt: new Date(), revokedBy: session.user.id })
        .where(eq(userRoles.id, row.id));
    }

    await tx.insert(userRoles).values({
      userId: targetUserId,
      roleId: newRoleId,
      grantedBy: session.user.id,
    });
  });
}

export async function toggleUserBan(
  targetUserId: string,
  ban: boolean,
  reason?: string,
): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  if (targetUserId === session.user.id) {
    throw new Error("Khong the tu khoa tai khoan cua chinh minh.");
  }

  await db.transaction(async (tx) => {
    // Lock all active admins to serialize admin-altering operations and revalidate caller
    const activeAdmins = await tx
      .select({ id: userRoles.id, userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(user, eq(userRoles.userId, user.id))
      .where(
        and(
          eq(userRoles.roleId, ROLE.ADMIN),
          isNull(userRoles.revokedAt),
          eq(user.banned, false)
        )
      )
      .orderBy(userRoles.id)
      .for("update");

    if (!activeAdmins.some((a) => a.userId === session.user.id)) {
      throw new Error("Unauthorized or banned");
    }

    if (ban) {
      const targetIsAdmin = activeAdmins.some(a => a.userId === targetUserId);

      if (targetIsAdmin) {
        const otherAdmins = activeAdmins.filter((a) => a.userId !== targetUserId);

        if (otherAdmins.length === 0) {
          throw new Error("Khong the khoa Admin dang hoat dong duy nhat.");
        }
      }
    }

    await tx
      .update(user)
      .set({
        banned: ban,
        banReason: ban ? (reason ?? "Vi pham noi quy nen tang.") : null,
      })
      .where(eq(user.id, targetUserId));

    if (ban) {
      await tx.delete(session_table).where(eq(session_table.userId, targetUserId));
    }
  });
}
