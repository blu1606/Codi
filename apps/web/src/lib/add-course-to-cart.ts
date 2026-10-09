import { and, eq } from "drizzle-orm";
import { courses, studentCart, studentEnrollments } from "@codi-1/db";
import { db } from "@/services";

export type AddCourseToCartResult =
  | { kind: "not-found" }
  | { kind: "already-owned" }
  | { kind: "added" | "already-in-cart"; courseId: string };

/** Caller must authorize the learner and validate/normalize courseId before calling. */
export async function addCourseToCart(userId: string, courseId: string): Promise<AddCourseToCartResult> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return { kind: "not-found" };

  const [enrollment] = await db.select().from(studentEnrollments).where(and(
    eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)
  )).limit(1);
  if (enrollment) return { kind: "already-owned" };

  // The database unique constraint also handles simultaneous duplicate requests.
  const inserted = await db.insert(studentCart).values({ userId, courseId })
    .onConflictDoNothing({ target: [studentCart.userId, studentCart.courseId] })
    .returning({ courseId: studentCart.courseId });
  return { kind: inserted.length > 0 ? "added" : "already-in-cart", courseId };
}
