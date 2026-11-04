import { and, avg, count, desc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { courseReviews } from "@codi-1/db/schema/interaction";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import type { CourseReview } from "./course-review-contract";
import { user } from "@codi-1/db/schema/auth";

export async function listPublicCourseReviews(
  store: Pick<Database, "select">,
  courseId: string,
): Promise<CourseReview[]> {
  const rows = await store
    .select({
      id: courseReviews.id,
      name: user.name,
      rating: courseReviews.rating,
      text: courseReviews.text,
      lecturerReply: courseReviews.lecturerReply,
      createdAt: courseReviews.createdAt,
      repliedAt: courseReviews.repliedAt,
      userAvatar: user.image,
    })
    .from(courseReviews)
    .innerJoin(
      studentEnrollments,
      eq(studentEnrollments.id, courseReviews.enrollmentId),
    )
    .innerJoin(user, eq(user.id, studentEnrollments.userId))
    .where(
      and(
        eq(courseReviews.courseId, courseId),
        eq(studentEnrollments.courseId, courseId),
        eq(courseReviews.isVisible, true),
      ),
    )
    .orderBy(desc(courseReviews.createdAt), desc(courseReviews.id))
    .limit(50);
  return rows.map((row) => ({
    id: String(row.id),
    userName: row.name,
    userAvatar: row.userAvatar,
    stars: row.rating,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    reply: row.lecturerReply
      ? { text: row.lecturerReply, createdAt: row.repliedAt?.toISOString() }
      : null,
  }));
}

// Call inside the owner's enrollment transaction. Serialize course-wide aggregates across reviewers.
export async function saveCourseReview(
  store: Pick<Database, "select" | "insert" | "update">,
  enrollmentId: number,
  courseId: string,
  rating: number,
  text: string,
) {
  await store
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .for("update");
  await store
    .insert(courseReviews)
    .values({ enrollmentId, courseId, rating, text: text || null })
    .onConflictDoUpdate({
      target: courseReviews.enrollmentId,
      set: { rating, text: text || null, updatedAt: new Date() },
    });
  await refreshCourseRating(store, courseId);
}

async function refreshCourseRating(
  store: Pick<Database, "select" | "update">,
  courseId: string,
) {
  const [aggregate] = await store
    .select({ rating: avg(courseReviews.rating), count: count() })
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.courseId, courseId),
        eq(courseReviews.isVisible, true),
      ),
    );
  await store
    .update(courses)
    .set({
      rating: Number(aggregate?.rating ?? 0),
      reviewCount: aggregate?.count ?? 0,
    })
    .where(eq(courses.id, courseId));
}

// Internal persistence helper: callers perform authorization/confirmation before their transaction.
// Uses the same course-first lock as saveCourseReview, including when restoring a hidden review.
export async function setCourseReviewVisibility(
  store: Pick<Database, "select" | "update">,
  courseId: string,
  reviewId: number,
  visible: boolean,
) {
  await store
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .for("update");
  await store
    .update(courseReviews)
    .set({ isVisible: visible, updatedAt: new Date() })
    .where(
      and(eq(courseReviews.id, reviewId), eq(courseReviews.courseId, courseId)),
    );
  await refreshCourseRating(store, courseId);
}
