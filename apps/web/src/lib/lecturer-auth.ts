import { headers } from "next/headers";
import { requireRole, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";

/**
 * Xác thực phiên đăng nhập và đảm bảo người dùng có vai trò LECTURER.
 * Hàm tiện ích nội bộ phía server, không export từ "use server" để bảo mật.
 */
export async function verifyLecturerSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  await requireRole(db, session.user.id, ROLE.LECTURER);
  return session.user;
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
