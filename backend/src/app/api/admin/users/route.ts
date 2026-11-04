import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, getPrimaryRole, ROLE, type RoleId } from "@codi-1/auth";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { auth, db } from "@/services";

/** S31 user list: one row per account with its primary active role (same query as the Codi admin users page). */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        banned: user.banned,
        banReason: user.banReason,
        roleId: userRoles.roleId,
      })
      .from(user)
      .leftJoin(userRoles, and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)))
      .orderBy(desc(user.createdAt));

    const byId = new Map<string, { row: (typeof rows)[number]; roles: RoleId[] }>();
    for (const row of rows) {
      const entry = byId.get(row.id) ?? { row, roles: [] };
      if (row.roleId) entry.roles.push(row.roleId as RoleId);
      byId.set(row.id, entry);
    }
    const users = [...byId.values()].map(({ row, roles }) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      banned: row.banned,
      banReason: row.banReason,
      roleId: getPrimaryRole(roles) ?? ROLE.LEARNER,
    }));
    return NextResponse.json({ users, currentUserId: session.user.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không tải được danh sách người dùng." }, { status: 500 });
  }
}
