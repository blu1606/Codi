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

    const { courseId, courseSlug, orderCode } = await req.json();

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

    let transactionId = typeof orderCode === "string" && orderCode.trim() ? orderCode.trim() : null;
    let finalAmount = amount;

    if (transactionId) {
      // Validate that the order belongs to this user, matches this course, and is pending
      const { orders, orderItems } = await import("@codi-1/db");
      const { and } = await import("drizzle-orm");

      const [matchedOrder] = await db
        .select({
          id: orders.id,
          code: orders.code,
          totalAmount: orders.totalAmount,
        })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orders.code, transactionId),
            eq(orders.userId, session.user.id),
            eq(orders.status, "pending"),
            eq(orderItems.courseId, course.id)
          )
        )
        .limit(1);

      if (matchedOrder) {
        finalAmount = matchedOrder.totalAmount;
        // Ensure studentTransactions record exists for webhook polling
        const [existingTx] = await db
          .select()
          .from(studentTransactions)
          .where(and(eq(studentTransactions.id, transactionId), eq(studentTransactions.userId, session.user.id)))
          .limit(1);

        if (!existingTx) {
          await db.insert(studentTransactions).values({
            id: transactionId,
            userId: session.user.id,
            courseId: course.id,
            amount: finalAmount,
            status: "pending",
          });
        }
      } else {
        // Fallback: check studentTransactions belonging to this user
        const [existingTx] = await db
          .select()
          .from(studentTransactions)
          .where(
            and(
              eq(studentTransactions.id, transactionId),
              eq(studentTransactions.userId, session.user.id),
              eq(studentTransactions.courseId, course.id),
              eq(studentTransactions.status, "pending")
            )
          )
          .limit(1);

        if (!existingTx) {
          return NextResponse.json({ error: "Đơn hàng không hợp lệ hoặc đã hết hạn." }, { status: 404 });
        }
        finalAmount = existingTx.amount;
      }
    } else {
      const { orders } = await import("@codi-1/db");
      let generatedId: string | null = null;
      let attempts = 0;

      while (attempts < 5) {
        attempts++;
        const candidate = `CODI${Math.floor(10000 + Math.random() * 90000)}`;

        const [existingOrder] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.code, candidate))
          .limit(1);

        if (existingOrder) continue;

        const [existingTx] = await db
          .select({ id: studentTransactions.id })
          .from(studentTransactions)
          .where(eq(studentTransactions.id, candidate))
          .limit(1);

        if (existingTx) continue;

        generatedId = candidate;
        break;
      }

      if (!generatedId) {
        return NextResponse.json({ error: "Không thể tạo mã giao dịch duy nhất. Vui lòng thử lại." }, { status: 500 });
      }

      transactionId = generatedId;
      await db.insert(studentTransactions).values({
        id: transactionId,
        userId: session.user.id,
        courseId: course.id,
        amount: finalAmount,
        status: "pending",
      });
    }

    return NextResponse.json({ transactionId, amount: finalAmount, receiver: config.receiver, course: { id: course.id, title: course.title, category: course.category } });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
