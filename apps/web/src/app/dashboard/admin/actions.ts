"use server";

import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
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
    let activeAdminRolesQuery = tx
      .select({ id: userRoles.id, userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(user, eq(userRoles.userId, user.id))
      .where(
        and(
          eq(userRoles.roleId, ROLE.ADMIN),
          isNull(userRoles.revokedAt),
          eq(user.banned, false)
        )
      );

    if (typeof (activeAdminRolesQuery as any).orderBy === "function") {
      activeAdminRolesQuery = (activeAdminRolesQuery as any).orderBy(userRoles.id);
    }
    if (typeof (activeAdminRolesQuery as any).for === "function") {
      activeAdminRolesQuery = (activeAdminRolesQuery as any).for("update");
    }
    const activeAdmins = await activeAdminRolesQuery;

    if (!activeAdmins.some((a) => a.userId === session.user.id)) {
      throw new Error("Unauthorized or banned");
    }

    // lock this user's active role row(s) first
    let currentActiveQuery = tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, targetUserId), isNull(userRoles.revokedAt)));

    if (typeof (currentActiveQuery as any).for === "function") {
      currentActiveQuery = (currentActiveQuery as any).for("update");
    }
    const currentActive = await currentActiveQuery;

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
    let activeAdminRolesQuery = tx
      .select({ id: userRoles.id, userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(user, eq(userRoles.userId, user.id))
      .where(
        and(
          eq(userRoles.roleId, ROLE.ADMIN),
          isNull(userRoles.revokedAt),
          eq(user.banned, false)
        )
      );

    if (typeof (activeAdminRolesQuery as any).orderBy === "function") {
      activeAdminRolesQuery = (activeAdminRolesQuery as any).orderBy(userRoles.id);
    }
    if (typeof (activeAdminRolesQuery as any).for === "function") {
      activeAdminRolesQuery = (activeAdminRolesQuery as any).for("update");
    }
    const activeAdmins = await activeAdminRolesQuery;

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

// ─────────────────────────────────────────────────────────────
// Admin Published Courses Actions (S33)
// ─────────────────────────────────────────────────────────────

export async function hideCourseAction(
  courseId: string,
  reason: string
): Promise<{ success: boolean; title: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { adminHideCourse } = await import("@/lib/admin-courses-service");
  return await adminHideCourse(db, courseId, reason, session.user.id);
}

export async function unhideCourseAction(
  courseId: string
): Promise<{ success: boolean; title: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { adminUnhideCourse } = await import("@/lib/admin-courses-service");
  return await adminUnhideCourse(db, courseId, session.user.id);
}

export async function updateCoursePriceAction(
  courseId: string,
  newPrice: number
): Promise<{ success: boolean; title: string; oldPrice: number; newPrice: number }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { adminUpdateCoursePrice } = await import("@/lib/admin-courses-service");
  return await adminUpdateCoursePrice(db, courseId, newPrice, session.user.id);
}

// ─────────────────────────────────────────────────────────────
// Admin Orders Actions (S34)
// ─────────────────────────────────────────────────────────────

export async function cancelAdminOrderAction(
  orderId: number,
  reason?: string
): Promise<{ success: boolean; orderCode: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    throw new Error("Lý do huỷ đơn hàng là bắt buộc.");
  }

  const { adminCancelOrder } = await import("@/lib/admin-orders-service");
  return await adminCancelOrder(db, orderId, session.user.id, trimmedReason);
}

export async function getAdminOrderDetailAction(
  orderIdOrCode: number | string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { getAdminOrderDetail } = await import("@/lib/admin-orders-service");
  return await getAdminOrderDetail(db, orderIdOrCode);
}

export async function getAdminOrdersExportAction(
  filter: import("@/lib/admin-orders-service").AdminOrdersFilter
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { getAdminOrders } = await import("@/lib/admin-orders-service");
  const result = await getAdminOrders(db, filter);
  return result.orders;
}

// ─────────────────────────────────────────────────────────────
// Admin Vouchers Actions (S35)
// ─────────────────────────────────────────────────────────────

export async function createVoucherAction(data: import("@/lib/admin-vouchers-service").VoucherFormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { createAdminVoucher } = await import("@/lib/admin-vouchers-service");
  return await createAdminVoucher(db, session.user.id, data);
}

export async function updateVoucherAction(
  voucherId: number,
  data: Partial<import("@/lib/admin-vouchers-service").VoucherFormData>
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { updateAdminVoucher } = await import("@/lib/admin-vouchers-service");
  return await updateAdminVoucher(db, voucherId, data);
}

export async function toggleVoucherActiveAction(
  voucherId: number,
  active: boolean
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { toggleAdminVoucherActive } = await import("@/lib/admin-vouchers-service");
  return await toggleAdminVoucherActive(db, voucherId, active);
}
