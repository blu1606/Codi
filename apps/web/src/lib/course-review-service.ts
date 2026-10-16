import { and, avg, count, desc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { courseReviews } from "@codi-1/db/schema/interaction";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { user } from "@codi-1/db/schema/auth";

export async function listPublicCourseReviews(store: Pick<Database, "select">, courseId: string) {
  const rows = await store.select({ id: courseReviews.id, name: user.name, rating: courseReviews.rating, text: courseReviews.text, lecturerReply: courseReviews.lecturerReply, createdAt: courseReviews.createdAt })
    .from(courseReviews).innerJoin(studentEnrollments, eq(studentEnrollments.id, courseReviews.enrollmentId)).innerJoin(user, eq(user.id, studentEnrollments.userId))
    .where(and(eq(courseReviews.courseId, courseId), eq(studentEnrollments.courseId, courseId), eq(courseReviews.isVisible, true)))
    .orderBy(desc(courseReviews.createdAt), desc(courseReviews.id)).limit(50);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// Call inside the owner's enrollment transaction. Serialize course-wide aggregates across reviewers.
export async function saveCourseReview(store: Pick<Database, "select" | "insert" | "update">, enrollmentId: number, courseId: string, rating: number, text: string) {
  await store.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for("update");
  await store.insert(courseReviews).values({ enrollmentId, courseId, rating, text: text || null })
    .onConflictDoUpdate({ target: courseReviews.enrollmentId, set: { rating, text: text || null, updatedAt: new Date() } });
  const [aggregate] = await store.select({ rating: avg(courseReviews.rating), count: count() }).from(courseReviews)
    .where(and(eq(courseReviews.courseId, courseId), eq(courseReviews.isVisible, true)));
  await store.update(courses).set({ rating: Number(aggregate?.rating ?? 0), reviewCount: aggregate?.count ?? 0 }).where(eq(courses.id, courseId));
}
