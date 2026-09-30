"use server";

import { and, count, eq, isNull } from "drizzle-orm";
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
    // lock this user's active role row(s) first so a concurrent updateUserRole call on
    // the same target, or the self-lockout count below, can't interleave with this one
    const currentActive = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, targetUserId), isNull(userRoles.revokedAt)))
      .for("update");

    if (targetUserId === session.user.id && newRoleId !== ROLE.ADMIN) {
      // counted inside this same locked transaction, not via the shared
      // countActiveHolders(db, ...) helper — a transaction handle (tx) isn't
      // assignable to the plain Database type that helper expects
      const [{ total }] = await tx
        .select({ total: count() })
        .from(userRoles)
        .where(and(eq(userRoles.roleId, ROLE.ADMIN), isNull(userRoles.revokedAt)));
      if (total <= 1) {
        throw new Error("Không thể xoá quyền Admin cuối cùng đang hoạt động.");
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
    throw new Error("Không thể tự khóa tài khoản của chính mình.");
  }

  await db
    .update(user)
    .set({
      banned: ban,
      banReason: ban ? (reason ?? "Vi phạm nội quy nền tảng.") : null,
    })
    .where(eq(user.id, targetUserId));

  // Revoke all active sessions immediately when banning
  if (ban) {
    await db.delete(session_table).where(eq(session_table.userId, targetUserId));
  }
}
