import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ForbiddenError, requireRole, ROLE } from "@codi-1/auth";
import { addCourseToCart } from "@/lib/add-course-to-cart";
import { auth, db } from "@/services";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }
    const userId = session.user.id;
    await requireRole(db, userId, ROLE.LEARNER);

    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Yêu cầu Content-Type application/json" }, { status: 415 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || !("courseId" in body) ||
        typeof body.courseId !== "string" || !body.courseId.trim() || body.courseId.trim().length > 200) {
      return NextResponse.json({ error: "Mã khóa học không hợp lệ" }, { status: 400 });
    }
    const courseId = body.courseId.trim();
    const result = await addCourseToCart(userId, courseId);
    if (result.kind === "not-found") {
      return NextResponse.json({ error: "Không tìm thấy khóa học" }, { status: 404 });
    }
    if (result.kind === "already-owned") {
      return NextResponse.json({ error: "Bạn đã sở hữu khóa học này" }, { status: 409 });
    }
    const added = result.kind === "added";
    return NextResponse.json({ courseId, added }, { status: added ? 201 : 200 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Chỉ học viên được thêm khóa học vào giỏ" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể thêm khóa học vào giỏ. Vui lòng thử lại." }, { status: 500 });
  }
}
