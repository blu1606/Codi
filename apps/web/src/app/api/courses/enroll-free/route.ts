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

    if (
      typeof body !== "object" ||
      body === null ||
      !("courseId" in body) ||
      typeof (body as { courseId: unknown }).courseId !== "string"
    ) {
      return NextResponse.json({ error: "Mã khóa học không hợp lệ" }, { status: 400 });
    }

    const courseId = (body as { courseId: string }).courseId.trim();

    const [course] = await db
      .select({ id: courses.id, price: courses.price, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course || course.status !== "published") {
      return NextResponse.json({ error: "Không tìm thấy khóa học" }, { status: 404 });
    }

    if (course.price !== 0) {
      return NextResponse.json(
        { error: "Khóa học này có tính phí. Vui lòng thanh toán qua giỏ hàng." },
        { status: 400 }
      );
    }

    // Atomic enrollment insertion and cart cleanup
    await db.transaction(async (tx) => {
      await tx
        .insert(studentEnrollments)
        .values({
          userId,
          courseId,
          status: "active",
          progress: 0,
        })
        .onConflictDoNothing();

      await tx
        .delete(studentCart)
        .where(
          and(eq(studentCart.userId, userId), eq(studentCart.courseId, courseId))
        );
    });

    return NextResponse.json({ success: true, courseId });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Chỉ tài khoản học viên mới có thể đăng ký khóa học." },
        { status: 403 }
      );
    }
    console.error("Free enrollment failed", error);
    return NextResponse.json(
      { error: "Không thể đăng ký khóa học. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
