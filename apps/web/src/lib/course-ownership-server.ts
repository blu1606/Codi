import { and, eq, inArray } from "drizzle-orm";
import { courses, orderItems, orders, studentCart, studentEnrollments, studentTransactions } from "@codi-1/db";
import { db } from "@/services";
import { resolveCourseOwnership, type CourseOwnershipDetail } from "./course-ownership";

/**
 * Server helper to resolve ownership for multiple courses at once via database queries.
 */
export async function getCourseOwnershipMap(
  userId: string | null | undefined,
  courseList: { id: string; price: number }[]
): Promise<Record<string, CourseOwnershipDetail>> {
  const result: Record<string, CourseOwnershipDetail> = {};
  if (!courseList.length) return result;

  if (!userId) {
    for (const c of courseList) {
      result[c.id] = resolveCourseOwnership({
        isEnrolled: false,
        isInCart: false,
        price: c.price,
        signedIn: false,
      });
    }
    return result;
  }

  const courseIds = courseList.map((c) => c.id);

  // 1. Fetch user enrollments
  const enrollments = await db
    .select({ courseId: studentEnrollments.courseId })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        inArray(studentEnrollments.courseId, courseIds)
      )
    );
  const enrolledSet = new Set(enrollments.map((e) => e.courseId));

  // 2. Fetch pending orders / items
  const pendingItems = await db
    .select({
      courseId: orderItems.courseId,
      orderCode: orders.code,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "pending"),
        inArray(orderItems.courseId, courseIds)
      )
    );

  const pendingMap = new Map<string, string>();
  for (const item of pendingItems) {
    pendingMap.set(item.courseId, item.orderCode);
  }

  // Check legacy student_transactions for compatibility
  const legacyTxs = await db
    .select({
      courseId: studentTransactions.courseId,
      txId: studentTransactions.id,
    })
    .from(studentTransactions)
    .where(
      and(
        eq(studentTransactions.userId, userId),
        eq(studentTransactions.status, "pending"),
        inArray(studentTransactions.courseId, courseIds)
      )
    );
  for (const tx of legacyTxs) {
    if (!pendingMap.has(tx.courseId)) {
      pendingMap.set(tx.courseId, tx.txId);
    }
  }

  // 3. Fetch cart items
  const cartRows = await db
    .select({ courseId: studentCart.courseId })
    .from(studentCart)
    .where(
      and(
        eq(studentCart.userId, userId),
        inArray(studentCart.courseId, courseIds)
      )
    );
  const cartSet = new Set(cartRows.map((r) => r.courseId));

  // 4. Resolve ownership per course
  for (const c of courseList) {
    result[c.id] = resolveCourseOwnership({
      isEnrolled: enrolledSet.has(c.id),
      pendingOrderId: pendingMap.get(c.id),
      isInCart: cartSet.has(c.id),
      price: c.price,
      signedIn: true,
    });
  }

  return result;
}

/**
 * Shared server helper to resolve single course ownership:
 * owned | pending-payment | in-cart | free | not-owned
 */
export async function getOwnership(
  userId: string | null | undefined,
  courseId: string,
  price?: number
): Promise<CourseOwnershipDetail> {
  let coursePrice = price;
  if (coursePrice === undefined) {
    const [c] = await db
      .select({ price: courses.price })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    coursePrice = c?.price ?? 0;
  }
  const map = await getCourseOwnershipMap(userId, [{ id: courseId, price: coursePrice }]);
  return map[courseId] ?? { ownership: "not-owned" };
}
