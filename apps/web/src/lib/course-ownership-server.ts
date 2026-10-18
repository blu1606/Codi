import { and, eq, inArray } from "drizzle-orm";
import { courses, orderItems, orders, studentCart, studentEnrollments, studentTransactions } from "@codi-1/db";
import { db } from "@/services";
import { resolveCourseOwnership, type CourseOwnershipDetail } from "./course-ownership";

/**
 * Server helper to resolve ownership for multiple courses at once via database queries.
 */
export async function getCourseOwnershipMap(
  userId: string | null | undefined,
  courseInput: (string | { id: string; price?: number })[]
): Promise<Record<string, CourseOwnershipDetail>> {
  const result: Record<string, CourseOwnershipDetail> = {};
  if (!courseInput.length) return result;

  // Extract unique course IDs
  const rawIds = courseInput.map((c) => (typeof c === "string" ? c : c.id)).filter(Boolean);
  const uniqueCourseIds = Array.from(new Set(rawIds));
  if (!uniqueCourseIds.length) return result;

  // Query database for published courses to obtain verified prices and omit non-existent/unpublished courses
  const dbCourses = await db
    .select({
      id: courses.id,
      price: courses.price,
    })
    .from(courses)
    .where(
      and(
        inArray(courses.id, uniqueCourseIds),
        eq(courses.status, "published")
      )
    );

  if (!dbCourses.length) return result;

  const validCourseMap = new Map<string, number>();
  for (const c of dbCourses) {
    validCourseMap.set(c.id, c.price);
  }
  const validCourseIds = Array.from(validCourseMap.keys());

  if (!userId) {
    for (const [id, price] of validCourseMap.entries()) {
      result[id] = resolveCourseOwnership({
        isEnrolled: false,
        isInCart: false,
        price,
        signedIn: false,
      });
    }
    return result;
  }

  // 1. Fetch user enrollments
  const enrollments = await db
    .select({ courseId: studentEnrollments.courseId })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        inArray(studentEnrollments.courseId, validCourseIds)
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
        inArray(orderItems.courseId, validCourseIds)
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
        inArray(studentTransactions.courseId, validCourseIds)
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
        inArray(studentCart.courseId, validCourseIds)
      )
    );
  const cartSet = new Set(cartRows.map((r) => r.courseId));

  // 4. Resolve ownership per valid course
  for (const [id, price] of validCourseMap.entries()) {
    result[id] = resolveCourseOwnership({
      isEnrolled: enrolledSet.has(id),
      pendingOrderId: pendingMap.get(id),
      isInCart: cartSet.has(id),
      price,
      signedIn: true,
    });
  }

  return result;
}

/**
 * Shared server helper to resolve single course ownership:
 * owned | pending-payment | in-cart | free | not-owned
 * If the course is missing or not published, returns not-owned (STATE-MACHINES §2).
 */
export async function getOwnership(
  userId: string | null | undefined,
  courseId: string
): Promise<CourseOwnershipDetail> {
  const map = await getCourseOwnershipMap(userId, [courseId]);
  return map[courseId] ?? { ownership: "not-owned" };
}
