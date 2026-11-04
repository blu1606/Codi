import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import {
  createGithubProfileStore,
  GithubProfileStoreError,
} from "@/lib/github-profile-store";
import { auth, db } from "@/services";

const headers = { "Cache-Control": "private, no-store" };
const failure = (code: string, error: string, status: number) =>
  NextResponse.json({ code, error }, { status, headers });

/** Remove only the saved analysis and evidence. The linked GitHub account stays connected. */
export async function DELETE(request: NextRequest) {
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", "Yêu cầu không hợp lệ.", 403);
  if (request.body !== null || request.nextUrl.search)
    return failure("invalid_input", "Yêu cầu xoá hồ sơ không hợp lệ.", 400);
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (
      !session?.user ||
      !(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER)
    )
      return failure(
        "unauthorized",
        "Vui lòng đăng nhập bằng tài khoản học viên.",
        401,
      );
    const deleted = await createGithubProfileStore(db).deleteProfile(
      session.user.id,
    );
    return NextResponse.json({ deleted }, { headers });
  } catch (error) {
    if (
      error instanceof GithubProfileStoreError &&
      error.code === "active_request"
    )
      return failure(
        "active_request",
        "Phân tích đang chạy. Hãy xoá hồ sơ sau khi lượt này kết thúc.",
        409,
      );
    return failure("store_failed", "Chưa xoá được hồ sơ GitHub.", 503);
  }
}
