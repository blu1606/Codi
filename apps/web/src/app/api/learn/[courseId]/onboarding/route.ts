import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { ZodError } from "zod";
import { auth, db } from "@/services";
import { onboardingCommand, OnboardingError } from "@/lib/onboarding-contract";
import { createOnboardingService } from "@/lib/onboarding-service";

const service = createOnboardingService(db);
type Context = { params: Promise<{ courseId: string }> };
async function viewer(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new OnboardingError("Vui lòng đăng nhập.", 401);
  const roles = await getActiveRoles(db, session.user.id);
  if (!roles.includes(ROLE.LEARNER)) throw new OnboardingError("Bạn không có quyền học viên đang hoạt động.", 403);
  return session.user.id;
}
function failure(error: unknown) {
  if (error instanceof OnboardingError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof ZodError) return NextResponse.json({ error: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại." }, { status: 400 });
  return NextResponse.json({ error: "Không thể lưu hoặc tải thiết lập. Vui lòng thử lại." }, { status: 500 });
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await viewer(request);
    const { courseId } = await context.params;
    return NextResponse.json(await service.get(userId, courseId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  try {
    const userId = await viewer(request);
    const { courseId } = await context.params;
    const command = onboardingCommand.parse(await request.json().catch(() => null));
    return NextResponse.json(await service.execute(userId, courseId, command), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
