import { and, eq } from "drizzle-orm";
import { courseChapters, courseLessons, courses } from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

/**
 * Lấy khoá học thuộc quyền sở hữu của giảng viên (kể cả pending).
 */
export async function getOwnedCourse(courseId: string) {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
  }

  return { course, user };
}

/**
 * Xác minh quyền chỉnh sửa của giảng viên đối với khoá học.
 * Chặn chỉnh sửa nếu khoá học đang chờ duyệt (pending).
 */
export async function getEditableCourse(courseId: string) {
  const { course, user } = await getOwnedCourse(courseId);

  if (course.status === "pending") {
    throw new Error("Khoá học đang chờ duyệt — nội dung chỉ đọc.");
  }

  return { course, user };
}

/**
 * Xác minh chapter thuộc khoá học do giảng viên quản lý.
 */
export async function requireCourseChapter(courseId: string, chapterId: string, executor: any = db) {
  const [chapter] = await executor
    .select({ id: courseChapters.id, courseId: courseChapters.courseId })
    .from(courseChapters)
    .where(and(eq(courseChapters.id, chapterId), eq(courseChapters.courseId, courseId)));
  if (!chapter) throw new Error("Không tìm thấy chương trong khoá học này.");
  return chapter;
}

/**
 * Lấy bài học thuộc khoá học qua join course_chapters.
 */
export async function getCourseLesson(courseId: string, lessonId: string, executor: any = db) {
  const [result] = await executor
    .select({ lesson: courseLessons })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .where(and(eq(courseLessons.id, lessonId), eq(courseChapters.courseId, courseId)));
  return result ? (result.lesson ?? result) : undefined;
}

/**
 * Xác minh lesson thuộc khoá học do giảng viên quản lý.
 */
export async function requireCourseLesson(courseId: string, lessonId: string, executor: any = db) {
  const lesson = await getCourseLesson(courseId, lessonId, executor);
  if (!lesson) throw new Error("Không tìm thấy bài học trong khoá học này.");
  return lesson;
}

// Aliases cho tương thích ngược
export const verifyChapterBelongsToCourse = requireCourseChapter;
export const verifyLessonBelongsToCourse = requireCourseLesson;

/**
 * Đánh dấu bản đồ kiến thức là 'stale' nếu khoá học đã xuất bản bị chỉnh sửa nội dung (D17).
 * Đây là internal helper, KHÔNG được export qua Server Action ("use server").
 */
export async function markKnowledgeMapStaleIfPublished(
  course: typeof courses.$inferSelect,
  executor: any = db
) {
  if (course.status === "published" && course.knowledgeMapStatus === "confirmed") {
    await executor
      .update(courses)
      .set({ knowledgeMapStatus: "stale" })
      .where(eq(courses.id, course.id));
  }
}
