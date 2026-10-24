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
      if (!reason || !reason.trim()) {
        throw new Error("Lý do vô hiệu hoá là bắt buộc.");
      }
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
        banReason: ban ? (reason ? reason.trim() : "Vi pham noi quy nen tang.") : null,
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

export type UserImpactCounts = {
  ownedCourses: number;
  pendingOrders: number;
  taughtCourses: number;
};

export async function getUserImpactCounts(targetUserId: string): Promise<UserImpactCounts> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { studentEnrollments } = await import("@codi-1/db/schema/student-profile");
  const { courses } = await import("@codi-1/db/schema/courses");
  const { orders } = await import("@codi-1/db/schema/commerce");

  // 1. owned courses that are published
  const [ownedRes] = await db
    .select({ val: count() })
    .from(studentEnrollments)
    .innerJoin(courses, eq(studentEnrollments.courseId, courses.id))
    .where(and(eq(studentEnrollments.userId, targetUserId), eq(courses.status, "published")));

  // 2. pending orders
  const [ordersRes] = await db
    .select({ val: count() })
    .from(orders)
    .where(and(eq(orders.userId, targetUserId), eq(orders.status, "pending")));

  // 3. taught courses that are published
  const [taughtRes] = await db
    .select({ val: count() })
    .from(courses)
    .where(and(eq(courses.instructorId, targetUserId), eq(courses.status, "published")));

  return {
    ownedCourses: Number(ownedRes?.val ?? 0),
    pendingOrders: Number(ordersRes?.val ?? 0),
    taughtCourses: Number(taughtRes?.val ?? 0),
  };
}

export type AdminDashboardData = {
  kpis: {
    revenue30d: number;
    paidOrders30d: number;
    allOrders30d: number;
    newLearners30d: number;
    publishedCourses: number;
  };
  todo: {
    pendingCoursesCount: number;
    overdueOrdersCount: number;
    expiringVouchersCount: number;
    inactiveUsersCount: number;
  };
  recentOrders: Array<{
    id: number;
    code: string;
    buyerName: string;
    buyerEmail: string;
    totalAmount: number;
    status: string;
    createdAt: Date;
    isOverdue: boolean;
  }>;
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await requireRole(db, session.user.id, ROLE.ADMIN);

  const { courses } = await import("@codi-1/db/schema/courses");
  const { orders } = await import("@codi-1/db/schema/commerce");
  const { vouchers } = await import("@codi-1/db/schema/commerce");
  const { gte, sql, desc } = await import("drizzle-orm");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // KPIs:
  // 1. Paid orders in last 30d (revenue + count)
  const paidOrders30dRes = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
      count: count(),
    })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.paidAt, thirtyDaysAgo)));

  // 2. All orders in last 30d
  const [allOrders30dRes] = await db
    .select({ count: count() })
    .from(orders)
    .where(gte(orders.createdAt, thirtyDaysAgo));

  // 3. New learners in last 30d
  const [newLearnersRes] = await db
    .select({ count: count() })
    .from(user)
    .innerJoin(userRoles, and(eq(userRoles.userId, user.id), eq(userRoles.roleId, ROLE.LEARNER), isNull(userRoles.revokedAt)))
    .where(gte(user.createdAt, thirtyDaysAgo));

  // 4. Published courses
  const [publishedCoursesRes] = await db
    .select({ count: count() })
    .from(courses)
    .where(eq(courses.status, "published"));

  // Todo / Can xu ly:
  // 1. Khoa hoc cho duyet (courses with status = 'pending')
  const [pendingCoursesRes] = await db
    .select({ count: count() })
    .from(courses)
    .where(eq(courses.status, "pending"));

  // 2. Don cho thanh toan qua han (>= 24h)
  const [overdueOrdersRes] = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        sql`${orders.createdAt} <= ${oneDayAgo}`
      )
    );

  // 3. Same usage-exhaustion predicate as the voucher queue (not date expiry).
  const { nearLimitVoucherPredicate } = await import("@/lib/admin-vouchers-service");
  const [expiringVouchersRes] = await db
    .select({ count: count() })
    .from(vouchers)
    .where(
      nearLimitVoucherPredicate()
    );

  // 4. Tai khoan bi vo hieu hoa (banned = true)
  const [inactiveUsersRes] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.banned, true));

  // Recent 5 orders
  const recentOrdersRaw = await db
    .select({
      id: orders.id,
      code: orders.code,
      totalAmount: orders.totalAmount,
      status: orders.status,
      createdAt: orders.createdAt,
      buyerName: user.name,
      buyerEmail: user.email,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(5);

  const recentOrders = recentOrdersRaw.map((o) => ({
    id: o.id,
    code: o.code,
    buyerName: o.buyerName ?? "Người dùng",
    buyerEmail: o.buyerEmail ?? "",
    totalAmount: o.totalAmount,
    status: o.status,
    createdAt: o.createdAt,
    isOverdue: o.status === "pending" && new Date(o.createdAt).getTime() <= oneDayAgo.getTime(),
  }));

  return {
    kpis: {
      revenue30d: Number(paidOrders30dRes[0]?.totalRevenue ?? 0),
      paidOrders30d: Number(paidOrders30dRes[0]?.count ?? 0),
      allOrders30d: Number(allOrders30dRes?.count ?? 0),
      newLearners30d: Number(newLearnersRes?.count ?? 0),
      publishedCourses: Number(publishedCoursesRes?.count ?? 0),
    },
    todo: {
      pendingCoursesCount: Number(pendingCoursesRes?.count ?? 0),
      overdueOrdersCount: Number(overdueOrdersRes?.count ?? 0),
      expiringVouchersCount: Number(expiringVouchersRes?.count ?? 0),
      inactiveUsersCount: Number(inactiveUsersRes?.count ?? 0),
    },
    recentOrders,
  };
}
