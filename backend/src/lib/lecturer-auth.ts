import { headers } from "next/headers";
import { requireRole, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { and, eq, gt } from "drizzle-orm";
import { session as authSessions } from "@codi-1/db/schema/auth";

export type LecturerIdentity = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export async function readLecturerIdentity(): Promise<LecturerIdentity> {
  const identity = await auth.api.getSession({ headers: await headers() });
  if (!identity?.user) throw new Error("Unauthorized");
  return identity;
}

/**
 * Xác thực phiên đăng nhập và đảm bảo người dùng có vai trò LECTURER.
 * Hàm tiện ích nội bộ phía server, không export từ "use server" để bảo mật.
 */
export async function verifyLecturerSession(
  executor: Pick<typeof db, "select"> = db,
  identity?: LecturerIdentity,
) {
  const authenticated = identity ?? await readLecturerIdentity();
  if (identity) {
    // Recheck on the transaction connection after waiting, not through another
    // pooled auth query while other writers occupy connections waiting on locks.
    const [live] = await executor.select({ id: authSessions.id }).from(authSessions)
      .where(and(eq(authSessions.id, identity.session.id),
        eq(authSessions.userId, identity.user.id), gt(authSessions.expiresAt, new Date())));
    if (!live) throw new Error("Unauthorized");
  }
  await requireRole(executor as typeof db, authenticated.user.id, ROLE.LECTURER);
  return authenticated.user;
}

/**
 * Xác thực phiên đăng nhập và đảm bảo người dùng có vai trò LECTURER hoặc ADMIN.
 * Phục vụ các thao tác điều hành hội thoại theo Decision D9 & STATE-MACHINES §14.2.
 */
export async function verifyLecturerOrAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  await requireRole(db, session.user.id, ROLE.LECTURER, ROLE.ADMIN);
  return session.user;
}
