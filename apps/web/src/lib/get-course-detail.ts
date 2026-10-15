import { and, asc, count, desc, eq } from "drizzle-orm";
import {
  courseChapters,
  courseDetails,
  courseLessons,
  courseReviews,
  courses,
  studentEnrollments,
  user,
} from "@codi-1/db";
import { db } from "@/services";
import type { CourseChapter, CourseDetail, CourseReview } from "./course-details";
import { MOCK_COURSE_REVIEWS } from "./course-mock-reviews";

export const PUBLIC_COURSE_COLUMNS = {
  id: courses.id,
  slug: courses.slug,
  title: courses.title,
  category: courses.category,
  level: courses.level,
  duration: courses.duration,
  description: courses.description,
  price: courses.price,
  instructorId: courses.instructorId,
  rating: courses.rating,
  reviewCount: courses.reviewCount,
  status: courses.status,
  createdAt: courses.createdAt,
  publishedAt: courses.publishedAt,
  updatedAt: courses.updatedAt,
};

export async function getCourseDetail(slug: string): Promise<CourseDetail | null> {
  const [course] = await db
    .select({
      ...PUBLIC_COURSE_COLUMNS,
      enrollmentCount: count(studentEnrollments.id),
      instructorName: user.name,
      instructorImage: user.image,
    })
    .from(courses)
    .leftJoin(studentEnrollments, eq(studentEnrollments.courseId, courses.id))
    .leftJoin(user, eq(courses.instructorId, user.id))
    .where(eq(courses.slug, slug))
    .groupBy(courses.id, user.id)
    .limit(1);
  if (!course) return null;

  const [detailsRows, rows, dbReviewsRows] = await Promise.all([
    db.select().from(courseDetails).where(eq(courseDetails.courseId, course.id)).limit(1),
    db.select({
      chapterId: courseChapters.id, chapterTitle: courseChapters.title,
      lessonId: courseLessons.id, lessonTitle: courseLessons.title,
      description: courseLessons.description, durationSeconds: courseLessons.durationSeconds,
      isFreePreview: courseLessons.isFreePreview,
    }).from(courseChapters)
      .leftJoin(courseLessons, and(eq(courseLessons.chapterId, courseChapters.id), eq(courseLessons.isPublished, true)))
      .where(and(eq(courseChapters.courseId, course.id), eq(courseChapters.isPublished, true)))
      .orderBy(asc(courseChapters.position), asc(courseChapters.id), asc(courseLessons.position), asc(courseLessons.id)),
    db.select({
      id: courseReviews.id,
      rating: courseReviews.rating,
      text: courseReviews.text,
      lecturerReply: courseReviews.lecturerReply,
      repliedAt: courseReviews.repliedAt,
      createdAt: courseReviews.createdAt,
      userName: user.name,
      userImage: user.image,
    }).from(courseReviews)
      .leftJoin(studentEnrollments, eq(courseReviews.enrollmentId, studentEnrollments.id))
      .leftJoin(user, eq(studentEnrollments.userId, user.id))
      .where(and(eq(courseReviews.courseId, course.id), eq(courseReviews.isVisible, true)))
      .orderBy(desc(courseReviews.createdAt))
      .limit(20)
      .catch(() => []),
  ]);
  const details = detailsRows[0];
  const chapters = new Map<string, CourseChapter>();
  let lessonCount = 0;
  let durationSeconds = 0;
  for (const row of rows) {
    let chapter = chapters.get(row.chapterId);
    if (!chapter) {
      chapter = { id: row.chapterId, title: row.chapterTitle, lessons: [] };
      chapters.set(row.chapterId, chapter);
    }
    if (row.lessonId && row.lessonTitle !== null) {
      chapter.lessons.push({
        id: row.lessonId,
        title: row.lessonTitle,
        description: row.description,
        durationSeconds: row.durationSeconds ?? 0,
        isFreePreview: row.isFreePreview ?? false,
      });
      lessonCount++;
      durationSeconds += row.durationSeconds ?? 0;
    }
  }
  const { instructorName, instructorImage, ...courseData } = course;
  const mockExtra = MOCK_COURSE_REVIEWS[slug];

  let reviews: CourseReview[] = [];
  let ratingBreakdown = [0, 0, 0, 0, 0];

  if (Array.isArray(dbReviewsRows) && dbReviewsRows.length > 0) {
    reviews = dbReviewsRows.map((r) => ({
      id: String(r.id),
      userName: r.userName || "Học viên",
      userAvatar: r.userImage,
      stars: r.rating,
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "",
      text: r.text,
      reply: r.lecturerReply
        ? {
            text: r.lecturerReply,
            createdAt: r.repliedAt ? new Date(r.repliedAt).toLocaleDateString("vi-VN") : undefined,
          }
        : null,
    }));
    for (const r of dbReviewsRows) {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingBreakdown[5 - r.rating]++;
      }
    }
  } else {
    reviews = mockExtra?.reviews ?? [];
    ratingBreakdown = mockExtra?.ratingBreakdown ?? [0, 0, 0, 0, 0];
  }

  return {
    course: { ...courseData, createdAt: courseData.createdAt.toISOString() },
    instructor: instructorName ? {
      name: instructorName,
      title: mockExtra?.instructorTitle ?? null,
      avatar: instructorImage ?? null,
      bio: null,
    } : null,
    rating: course.rating,
    reviewCount: course.reviewCount,
    ratingBreakdown,
    reviews,
    learningOutcomes: details?.learningOutcomes ?? [],
    requirements: details?.requirements ?? [],
    targetAudience: details?.targetAudience ?? null,
    coverImageUrl: details?.coverImageUrl ?? null,
    introVideoUrl: details?.introVideoUrl ?? null,
    introVideoCaptionsUrl: details?.introVideoCaptionsUrl ?? null,
    chapters: [...chapters.values()],
    summary: { chapterCount: chapters.size, lessonCount, durationSeconds },
  };
}
