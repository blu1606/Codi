import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE, type RoleId } from "@codi-1/auth";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { auth, db } from "@/services";

import UsersClient, { type AdminUserRow } from "./users-client";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string | string[]; role?: string | string[]; q?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialStatus = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined;
  const initialRole = typeof resolvedSearchParams.role === "string" ? resolvedSearchParams.role : undefined;
  const initialQuery = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "";

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      banned: user.banned,
      banReason: user.banReason,
      roleId: userRoles.roleId,
    })
    .from(user)
    .leftJoin(userRoles, and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)));

  const users: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    banned: r.banned,
    banReason: r.banReason,
    roleId: (r.roleId as RoleId) ?? ROLE.LEARNER,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý người dùng</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {users.length} tài khoản · Xem danh sách, thay đổi vai trò (Learner / Lecturer / Admin) và vô hiệu hoá / kích hoạt lại tài khoản.
        </p>
      </div>

      <UsersClient
        users={users}
        currentUserId={session.user.id}
        initialStatus={initialStatus}
        initialRole={initialRole}
        initialQuery={initialQuery}
      />
    </div>
  );
}

