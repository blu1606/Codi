import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { LearningPathError } from "./learning-path-contract";

export const privateHeaders = { "Cache-Control": "private, no-store" };
export async function learningViewer(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new LearningPathError("Vui lòng đăng nhập.", 401);
  if (!(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER)) throw new LearningPathError("Bạn không có quyền học viên đang hoạt động.", 403);
  return session.user.id;
}
export function learningFailure(error: unknown) {
  const status = error instanceof LearningPathError ? error.status : error instanceof ZodError ? 400 : 500;
  const message = error instanceof LearningPathError ? error.message : status === 400 ? "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại." : "Không thể tải hoặc cập nhật lộ trình. Vui lòng thử lại.";
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}
