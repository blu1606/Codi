import { getSepayConfig } from "@/lib/sepay-config";
import { NextResponse } from "next/server";
import { db } from "@/services";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
import { auth } from "@/services";
import { headers } from "next/headers";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId, courseSlug } = await req.json();

    if ((!courseId && !courseSlug) || (courseId != null && typeof courseId !== "string") || (courseSlug != null && typeof courseSlug !== "string")) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { courses } = await import("@codi-1/db/schema/courses");
    const { eq } = await import("drizzle-orm");
    const [course] = await db.select().from(courses).where(courseSlug ? eq(courses.slug, courseSlug) : eq(courses.id, courseId)).limit(1);

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const amount = course.price;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "Khóa học này không yêu cầu thanh toán. Vui lòng quay lại trang khóa học." }, { status: 422 });
    }
    const config = getSepayConfig();
    if (!config) {
      return NextResponse.json({ error: "Thanh toán tạm thời chưa khả dụng." }, { status: 503 });
    }

    // Generate a simple ID like CODI12345
    const transactionId = `CODI${Math.floor(10000 + Math.random() * 90000)}`;

    await db.insert(studentTransactions).values({
      id: transactionId,
      userId: session.user.id,
      courseId: course.id,
      amount,
      status: "pending",
    });

    return NextResponse.json({ transactionId, amount, receiver: config.receiver, course: { id: course.id, title: course.title, category: course.category } });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
