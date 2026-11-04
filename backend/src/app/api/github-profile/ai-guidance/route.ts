import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { createGithubProfileStore } from "@/lib/github-profile-store";
import { auth, db } from "@/services";

const headers = { "Cache-Control": "private, no-store" };
const failure = (code: string, error: string, status: number) =>
  NextResponse.json({ code, error }, { status, headers });
const body = z.object({ consent: z.boolean() }).strict();

/**
 * The learner's choice about AI course guidance from their published GitHub profile: { consent: true } grants it,
 * { consent: false } declines or revokes it. Both are remembered. Always the session owner's own profile.
 */
export async function PUT(request: NextRequest) {
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", "Yêu cầu không hợp lệ.", 403);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || request.nextUrl.search)
    return failure("invalid_input", "Lựa chọn không hợp lệ.", 400);
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !(await getActiveRoles(db, session.user.id)).includes(ROLE.LEARNER))
      return failure("unauthorized", "Vui lòng đăng nhập bằng tài khoản học viên.", 401);
    const aiGuidance = await createGithubProfileStore(db).setAiGuidance(session.user.id, parsed.data.consent);
    if (!aiGuidance)
      return failure("profile_not_found", "Chưa có hồ sơ năng lực đã lưu để dùng cho gợi ý.", 404);
    return NextResponse.json({ aiGuidance }, { headers });
  } catch {
    return failure("store_failed", "Chưa lưu được lựa chọn. Bạn có thể thử lại.", 503);
  }
}
