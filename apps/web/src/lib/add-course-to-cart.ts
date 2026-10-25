import { and, eq } from "drizzle-orm";
import { courses, orderItems, orders, studentCart, studentEnrollments, studentTransactions } from "@codi-1/db";
import { db } from "@/services";

export type AddCourseToCartResult =
  | { kind: "not-found" }
  | { kind: "already-owned" }
  | { kind: "pending-payment"; orderCode: string }
  | { kind: "added" | "already-in-cart"; courseId: string };

/** Caller must authorize the learner and validate/normalize courseId before calling. */
export async function addCourseToCart(userId: string, courseId: string): Promise<AddCourseToCartResult> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return { kind: "not-found" };

  const [enrollment] = await db.select().from(studentEnrollments).where(and(
    eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)
  )).limit(1);
  if (enrollment) return { kind: "already-owned" };

  // Pending payment guard: check if user already has an active pending order containing this course
  const [pendingOrder] = await db
    .select({ code: orders.code })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "pending"),
        eq(orderItems.courseId, courseId)
      )
    )
    .limit(1);

  if (pendingOrder) {
    return { kind: "pending-payment", orderCode: pendingOrder.code };
  }

  // Also check legacy studentTransactions for fallback
  const [legacyTx] = await db
    .select({ id: studentTransactions.id })
    .from(studentTransactions)
    .where(
      and(
        eq(studentTransactions.userId, userId),
        eq(studentTransactions.status, "pending"),
        eq(studentTransactions.courseId, courseId)
      )
    )
    .limit(1);

  if (legacyTx) {
    return { kind: "pending-payment", orderCode: legacyTx.id };
  }

  // The database unique constraint also handles simultaneous duplicate requests.
  const inserted = await db.insert(studentCart).values({ userId, courseId })
    .onConflictDoNothing({ target: [studentCart.userId, studentCart.courseId] })
    .returning({ courseId: studentCart.courseId });
  return { kind: inserted.length > 0 ? "added" : "already-in-cart", courseId };
}
