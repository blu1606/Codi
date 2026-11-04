import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles } from "@codi-1/auth";
import { auth, db } from "@/services";
import { notificationService } from "@/lib/notifications";
import { NotificationNotFoundError } from "@/lib/notification-service";

async function viewer(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const roles = await getActiveRoles(db, session.user.id);
  return roles.length ? session.user.id : null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await viewer(request);
    if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json(await notificationService.list(userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Không thể tải thông báo. Vui lòng thử lại." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // Reject cross-origin cookie-authenticated writes, including requests without Origin.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  }
  try {
    const userId = await viewer(request);
    if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    }
    if ("all" in body && body.all === true && !("id" in body)) {
      await notificationService.markAllRead(userId);
    } else if ("id" in body && Number.isSafeInteger(body.id) && Number(body.id) > 0 && !("all" in body)) {
      await notificationService.markRead(userId, Number(body.id));
    } else {
      return NextResponse.json({ error: "Thông báo không hợp lệ." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Không thể đánh dấu đã đọc. Vui lòng thử lại." }, { status: 500 });
  }
}
