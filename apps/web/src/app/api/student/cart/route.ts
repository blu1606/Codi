import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ForbiddenError, requireRole, ROLE } from "@codi-1/auth";
import { courses, studentCart, studentEnrollments } from "@codi-1/db";
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
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!course) {
      return NextResponse.json({ error: "Không tìm thấy khóa học" }, { status: 404 });
    }
    const [enrollment] = await db.select().from(studentEnrollments).where(and(
      eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)
    )).limit(1);
    if (enrollment) {
      return NextResponse.json({ error: "Bạn đã sở hữu khóa học này" }, { status: 409 });
    }
    // The database unique constraint also handles simultaneous duplicate requests.
    const inserted = await db.insert(studentCart).values({ userId, courseId })
      .onConflictDoNothing({ target: [studentCart.userId, studentCart.courseId] })
      .returning({ courseId: studentCart.courseId });
    const added = inserted.length > 0;
    return NextResponse.json({ courseId, added }, { status: added ? 201 : 200 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Chỉ học viên được thêm khóa học vào giỏ" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể thêm khóa học vào giỏ. Vui lòng thử lại." }, { status: 500 });
  }
}
