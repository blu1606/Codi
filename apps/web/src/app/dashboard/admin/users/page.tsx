import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE, type RoleId } from "@codi-1/auth";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { auth, db } from "@/services";

import RoleSelect from "./role-select";
import BanToggle from "./ban-toggle";

export default async function AdminUsersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý người dùng</h1>
        <p className="text-sm text-muted-foreground">
          Xem danh sách người dùng, thay đổi vai trò (Learner / Lecturer / Admin) và khóa / mở khóa tài khoản.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Họ và tên</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Ngày tham gia</th>
              <th className="px-4 py-2 font-medium">Vai trò</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{row.email}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString("vi-VN")}
                </td>
                <td className="px-4 py-2">
                  <RoleSelect userId={row.id} currentRoleId={(row.roleId as RoleId) ?? ROLE.LEARNER} />
                </td>
                <td className="px-4 py-2">
                  <BanToggle
                    userId={row.id}
                    isBanned={row.banned}
                    banReason={row.banReason ?? undefined}
                    isSelf={row.id === session.user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
