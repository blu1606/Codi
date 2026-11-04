"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import {
  courseReviews,
  courses,
  studentEnrollments,
  user as userTable,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { validateReviewReply } from "@/lib/qa-reviews-service";

export interface ReviewItemDto {
  id: number;
  courseId: string;
  courseTitle: string;
  learnerId: string;
  learnerName: string;
  learnerAvatar: string | null;
  rating: number; // 1..5
  text: string | null;
  lecturerReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface LecturerReviewsDataDto {
  filter: "all" | "unreplied";
  counts: {
    all: number;
    unreplied: number;
  };
  reviews: ReviewItemDto[];
}

/**
 * Lấy danh sách đánh giá của các khoá học do giảng viên phụ trách (Screen S28).
 */
export async function getLecturerReviewsData(filters?: {
  filter?: "all" | "unreplied";
}): Promise<LecturerReviewsDataDto> {
  const user = await verifyLecturerSession();

  const filter: "all" | "unreplied" =
    filters?.filter === "unreplied" ? "unreplied" : "all";

  // 1. Lấy danh sách khoá học của giảng viên
  const myCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.instructorId, user.id));

  const myCourseIds = myCourses.map((c) => c.id);

  if (myCourseIds.length === 0) {
    return {
      filter,
      counts: { all: 0, unreplied: 0 },
      reviews: [],
    };
  }

  // 2. Lấy tất cả đánh giá của các khoá học này
  const rawReviews = await db
    .select({
      id: courseReviews.id,
      courseId: courseReviews.courseId,
      courseTitle: courses.title,
      learnerId: studentEnrollments.userId,
      learnerName: userTable.name,
      learnerAvatar: userTable.image,
      rating: courseReviews.rating,
      text: courseReviews.text,
      lecturerReply: courseReviews.lecturerReply,
      repliedAt: courseReviews.repliedAt,
      createdAt: courseReviews.createdAt,
    })
    .from(courseReviews)
    .innerJoin(courses, eq(courseReviews.courseId, courses.id))
    .innerJoin(
      studentEnrollments,
      eq(courseReviews.enrollmentId, studentEnrollments.id)
    )
    .innerJoin(userTable, eq(studentEnrollments.userId, userTable.id))
    .where(
      and(
        inArray(courseReviews.courseId, myCourseIds),
        eq(courseReviews.isVisible, true)
      )
    )
    .orderBy(desc(courseReviews.createdAt));

  const countAll = rawReviews.length;
  const countUnreplied = rawReviews.filter((r) => !r.lecturerReply).length;

  const filteredReviews = rawReviews.filter(
    (r) => filter === "all" || !r.lecturerReply
  );

  return {
    filter,
    counts: {
      all: countAll,
      unreplied: countUnreplied,
    },
    reviews: filteredReviews.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      learnerId: r.learnerId,
      learnerName: r.learnerName || "Học viên Codi",
      learnerAvatar: r.learnerAvatar,
      rating: r.rating,
      text: r.text,
      lecturerReply: r.lecturerReply,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Đăng hoặc chỉnh sửa phản hồi đánh giá của giảng viên (STATE-MACHINES.md §15).
 */
export async function replyToCourseReview(input: {
  reviewId: number;
  replyText: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const validation = validateReviewReply(input.replyText);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const [review] = await db
    .select({
      id: courseReviews.id,
      instructorId: courses.instructorId,
    })
    .from(courseReviews)
    .innerJoin(courses, eq(courseReviews.courseId, courses.id))
    .where(eq(courseReviews.id, input.reviewId));

  if (!review) {
    return { success: false, error: "Đánh giá không tồn tại." };
  }

  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (review.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền phản hồi đánh giá của khoá học này.",
    };
  }

  await db
    .update(courseReviews)
    .set({
      lecturerReply: input.replyText.trim(),
      repliedBy: user.id,
      repliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(courseReviews.id, input.reviewId));

  revalidatePath("/dashboard/lecturer/reviews");
  return { success: true };
}

/**
 * Xoá phản hồi của giảng viên dưới đánh giá (STATE-MACHINES.md §15).
 */
export async function deleteCourseReviewReply(input: {
  reviewId: number;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const [review] = await db
    .select({
      id: courseReviews.id,
      instructorId: courses.instructorId,
    })
    .from(courseReviews)
    .innerJoin(courses, eq(courseReviews.courseId, courses.id))
    .where(eq(courseReviews.id, input.reviewId));

  if (!review) {
    return { success: false, error: "Đánh giá không tồn tại." };
  }

  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (review.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền xoá phản hồi của đánh giá này.",
    };
  }

  await db
    .update(courseReviews)
    .set({
      lecturerReply: null,
      repliedBy: null,
      repliedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(courseReviews.id, input.reviewId));

  revalidatePath("/dashboard/lecturer/reviews");
  return { success: true };
}
