import { and, asc, count, eq, getTableColumns } from "drizzle-orm";
import { courseChapters, courseDetails, courseLessons, courses, studentEnrollments } from "@codi-1/db";
import { db } from "@/services";
import type { CourseChapter, CourseDetail } from "./course-details";

export async function getCourseDetail(slug: string): Promise<CourseDetail | null> {
  const [course] = await db
    .select({ ...getTableColumns(courses), enrollmentCount: count(studentEnrollments.id) })
    .from(courses)
    .leftJoin(studentEnrollments, eq(studentEnrollments.courseId, courses.id))
    .where(eq(courses.slug, slug))
    .groupBy(courses.id)
    .limit(1);
  if (!course) return null;

  const [detailsRows, rows] = await Promise.all([
    db.select().from(courseDetails).where(eq(courseDetails.courseId, course.id)).limit(1),
    db.select({
      chapterId: courseChapters.id, chapterTitle: courseChapters.title,
      lessonId: courseLessons.id, lessonTitle: courseLessons.title,
      description: courseLessons.description, durationSeconds: courseLessons.durationSeconds,
    }).from(courseChapters)
      .leftJoin(courseLessons, and(eq(courseLessons.chapterId, courseChapters.id), eq(courseLessons.isPublished, true)))
      .where(and(eq(courseChapters.courseId, course.id), eq(courseChapters.isPublished, true)))
      .orderBy(asc(courseChapters.position), asc(courseChapters.id), asc(courseLessons.position), asc(courseLessons.id)),
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
        id: row.lessonId, title: row.lessonTitle,
        description: row.description, durationSeconds: row.durationSeconds ?? 0,
      });
      lessonCount++;
      durationSeconds += row.durationSeconds ?? 0;
    }
  }
  return {
    course: { ...course, createdAt: course.createdAt.toISOString() },
    learningOutcomes: details?.learningOutcomes ?? [],
    requirements: details?.requirements ?? [],
    targetAudience: details?.targetAudience ?? null,
    coverImageUrl: details?.coverImageUrl ?? null,
    introVideoUrl: details?.introVideoUrl ?? null,
    chapters: [...chapters.values()],
    summary: { chapterCount: chapters.size, lessonCount, durationSeconds },
  };
}
