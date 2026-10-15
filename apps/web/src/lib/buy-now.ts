import { and, eq } from "drizzle-orm";
import { ForbiddenError, requireRole, ROLE } from "@codi-1/auth";
import { courses, orders, orderItems, orderEvents } from "@codi-1/db";
import { studentEnrollments, studentTransactions } from "@codi-1/db/schema/student-profile";
import type { Database } from "@codi-1/db";

export interface BuyNowResult {
  orderId: number;
  orderCode: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  price: number;
  isExisting: boolean;
}

export class BuyNowError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "BuyNowError";
  }
}

export async function createBuyNowOrder(
  db: Database,
  userId: string,
  courseIdOrSlug: string
): Promise<BuyNowResult> {
  // 1. Role Guard
  await requireRole(db, userId, ROLE.LEARNER);

  // 2. Course Check
  const [course] = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      price: courses.price,
      status: courses.status,
    })
    .from(courses)
    .where(
      eq(courses.id, courseIdOrSlug)
    )
    .limit(1);

  let targetCourse = course;
  if (!targetCourse) {
    const [bySlug] = await db
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        price: courses.price,
        status: courses.status,
      })
      .from(courses)
      .where(eq(courses.slug, courseIdOrSlug))
      .limit(1);
    targetCourse = bySlug;
  }

  if (!targetCourse) {
    throw new BuyNowError(404, "Không tìm thấy khóa học.");
  }
  if (targetCourse.status !== "published") {
    throw new BuyNowError(400, "Khóa học hiện không mở bán.");
  }
  if (targetCourse.price <= 0) {
    throw new BuyNowError(422, "Khóa học miễn phí không cần mua ngay. Vui lòng bấm Đăng ký miễn phí.");
  }

  // 3. Ownership Guard: check if already enrolled
  const [enrollment] = await db
    .select({ id: studentEnrollments.id })
    .from(studentEnrollments)
    .where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, targetCourse.id)))
    .limit(1);

  if (enrollment) {
    throw new BuyNowError(409, "Bạn đã sở hữu khóa học này.");
  }

  // 4. Pending payment Guard: check if user already has an active pending order containing this course
  const [existingPending] = await db
    .select({
      id: orders.id,
      code: orders.code,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "pending"),
        eq(orderItems.courseId, targetCourse.id)
      )
    )
    .limit(1);

  if (existingPending) {
    return {
      orderId: existingPending.id,
      orderCode: existingPending.code,
      courseId: targetCourse.id,
      courseTitle: targetCourse.title,
      courseSlug: targetCourse.slug,
      price: targetCourse.price,
      isExisting: true,
    };
  }

  // Also check legacy studentTransactions for fallback
  const [existingTx] = await db
    .select({ id: studentTransactions.id, amount: studentTransactions.amount })
    .from(studentTransactions)
    .where(
      and(
        eq(studentTransactions.userId, userId),
        eq(studentTransactions.status, "pending"),
        eq(studentTransactions.courseId, targetCourse.id)
      )
    )
    .limit(1);

  if (existingTx) {
    return {
      orderId: 0,
      orderCode: existingTx.id,
      courseId: targetCourse.id,
      courseTitle: targetCourse.title,
      courseSlug: targetCourse.slug,
      price: existingTx.amount,
      isExisting: true,
    };
  }

  // 5. Create new Buy Now single-course order (D4: is_buy_now=true, voucherId=null, cart untouched)
  const orderCode = `CODI${Math.floor(10000 + Math.random() * 90000)}`;
  const paymentDeadline = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

  const [newOrder] = await db
    .insert(orders)
    .values({
      code: orderCode,
      userId,
      voucherId: null, // D4: no voucher
      subtotal: targetCourse.price,
      discountAmount: 0,
      totalAmount: targetCourse.price,
      receivedAmount: 0,
      currency: "VND",
      status: "pending",
      isBuyNow: true, // D4: is_buy_now = true
      paymentDeadline,
    })
    .returning({ id: orders.id, code: orders.code });

  if (!newOrder) {
    throw new BuyNowError(500, "Không thể tạo đơn hàng mua ngay.");
  }

  // Insert order item
  await db.insert(orderItems).values({
    orderId: newOrder.id,
    courseId: targetCourse.id,
    courseTitle: targetCourse.title,
    unitPrice: targetCourse.price,
  });

  // Insert timeline event
  await db.insert(orderEvents).values({
    orderId: newOrder.id,
    label: "Đã tạo đơn",
    actorId: userId,
  });

  // Also record in studentTransactions for payment polling compatibility
  await db.insert(studentTransactions).values({
    id: orderCode,
    userId,
    courseId: targetCourse.id,
    amount: targetCourse.price,
    status: "pending",
  }).catch(() => {});

  return {
    orderId: newOrder.id,
    orderCode: newOrder.code,
    courseId: targetCourse.id,
    courseTitle: targetCourse.title,
    courseSlug: targetCourse.slug,
    price: targetCourse.price,
    isExisting: false,
  };
}
