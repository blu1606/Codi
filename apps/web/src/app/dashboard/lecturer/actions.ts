"use server";

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  aiContentDrafts,
  aiDraftStatus,
  assessments,
  assessmentSubmissions,
  courseChapters,
  courseConversations,
  courseDetails,
  courseDiscussions,
  courseLessons,
  coursePublicationRequests,
  courseReviews,
  courses,
  courseStatus,
  studentEnrollments,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { COURSE_STATUSES, type CourseStatusType } from "@/lib/course-constants";
import { createCourseSchema, type CreateCourseInput } from "@/lib/course-schema";
import { generateUniqueCourseSlug } from "@/lib/course-slug";

export type { CourseStatusType, CreateCourseInput };

export interface LecturerCounts {
  grading: number;
  questions: number;
  reviews: number;
  byStatus: {
    draft: number;
    pending: number;
    rejected: number;
    published: number;
    hidden: number;
  };
}

export interface LecturerCourseItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  level: string;
  status: CourseStatusType;
  chaptersCount: number;
  lessonsCount: number;
  learnersCount: number;
  rejectReason?: string | null;
  hideReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseResult {
  success: boolean;
  courseId?: string;
  errors?: Record<string, string>;
}

/**
 * Lấy các chỉ số việc cần làm và phân bố trạng thái khoá học của giảng viên.
 */
export async function getLecturerDashboardStats(): Promise<{
  counts: LecturerCounts;
  rejectedCourseAlert?: { id: string; title: string; rejectReason: string } | null;
}> {
  const user = await verifyLecturerSession();

  // 1. Lấy danh sách ID các khoá học của giảng viên
  const myCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
      hiddenReason: courses.hiddenReason,
    })
    .from(courses)
    .where(eq(courses.instructorId, user.id));

  const myCourseIds = myCourses.map((c) => c.id);

  // Đếm theo từng trạng thái khoá học
  const byStatus = {
    draft: 0,
    pending: 0,
    rejected: 0,
    published: 0,
    hidden: 0,
  };

  for (const c of myCourses) {
    if (c.status in byStatus) {
      byStatus[c.status as CourseStatusType]++;
    }
  }

  // Nếu chưa có khoá học nào thì trả về số liệu 0
  if (myCourseIds.length === 0) {
    return {
      counts: {
        grading: 0,
        questions: 0,
        reviews: 0,
        byStatus,
      },
      rejectedCourseAlert: null,
    };
  }

  // 2. Đếm bài chờ chấm (assessment_submissions status = 'pending')
  let gradingCount = 0;
  const gradingRes = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessmentSubmissions.status, "pending")
      )
    );
  gradingCount = Number(gradingRes[0]?.count || 0);

  // 3. Đếm câu hỏi chưa trả lời (course_discussions root questions status = 'unanswered' + open conversations)
  let questionsCount = 0;
  const questionsRes = await db
    .select({ count: count() })
    .from(courseDiscussions)
    .where(
      and(
        inArray(courseDiscussions.courseId, myCourseIds),
        isNull(courseDiscussions.parentId),
        eq(courseDiscussions.status, "unanswered")
      )
    );
  questionsCount = Number(questionsRes[0]?.count || 0);

  // 4. Đếm đánh giá chưa phản hồi (course_reviews lecturerReply is null)
  let reviewsCount = 0;
  const reviewsRes = await db
    .select({ count: count() })
    .from(courseReviews)
    .where(
      and(
        inArray(courseReviews.courseId, myCourseIds),
        isNull(courseReviews.lecturerReply),
        eq(courseReviews.isVisible, true)
      )
    );
  reviewsCount = Number(reviewsRes[0]?.count || 0);

  // 5. Kiểm tra xem có khoá học nào bị từ chối không để hiện banner cảnh báo
  let rejectedAlert = null;
  const rejectedCourse = myCourses.find((c) => c.status === "rejected");
  if (rejectedCourse) {
    // Lấy lý do từ chối mới nhất từ bảng publication requests
    const latestRequest = await db
      .select({ reviewNote: coursePublicationRequests.reviewNote })
      .from(coursePublicationRequests)
      .where(eq(coursePublicationRequests.courseId, rejectedCourse.id))
      .orderBy(desc(coursePublicationRequests.round))
      .limit(1);

    rejectedAlert = {
      id: rejectedCourse.id,
      title: rejectedCourse.title,
      rejectReason: latestRequest[0]?.reviewNote || "Cần điều chỉnh lại nội dung theo quy định.",
    };
  }

  return {
    counts: {
      grading: gradingCount,
      questions: questionsCount,
      reviews: reviewsCount,
      byStatus,
    },
    rejectedCourseAlert: rejectedAlert,
  };
}

/**
 * Lấy danh sách các khoá học của giảng viên, hỗ trợ lọc theo trạng thái.
 */
export async function getLecturerCourses(
  filterStatus?: CourseStatusType | "all"
): Promise<LecturerCourseItem[]> {
  const user = await verifyLecturerSession();

  const isFiltered =
    Boolean(filterStatus) &&
    filterStatus !== "all" &&
    COURSE_STATUSES.includes(filterStatus as CourseStatusType);

  let query = db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
      category: courses.category,
      level: courses.level,
      status: courses.status,
      hiddenReason: courses.hiddenReason,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .where(
      isFiltered
        ? and(eq(courses.instructorId, user.id), eq(courses.status, filterStatus as CourseStatusType))
        : eq(courses.instructorId, user.id)
    )
    .orderBy(desc(courses.createdAt));

  const list = await query;
  if (list.length === 0) return [];

  const courseIds = list.map((c) => c.id);

  // Đếm số chương cho mỗi khoá
  const chaptersList = await db
    .select({
      courseId: courseChapters.courseId,
      count: count(),
    })
    .from(courseChapters)
    .where(inArray(courseChapters.courseId, courseIds))
    .groupBy(courseChapters.courseId);

  const chaptersMap = new Map<string, number>();
  for (const ch of chaptersList) {
    chaptersMap.set(ch.courseId, Number(ch.count));
  }

  // Đếm số bài học cho mỗi khoá
  const lessonsList = await db
    .select({
      courseId: courseChapters.courseId,
      count: count(),
    })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .where(inArray(courseChapters.courseId, courseIds))
    .groupBy(courseChapters.courseId);

  const lessonsMap = new Map<string, number>();
  for (const ls of lessonsList) {
    lessonsMap.set(ls.courseId, Number(ls.count));
  }

  // Đếm số học viên ghi danh cho mỗi khoá
  const enrollmentsList = await db
    .select({
      courseId: studentEnrollments.courseId,
      count: count(),
    })
    .from(studentEnrollments)
    .where(inArray(studentEnrollments.courseId, courseIds))
    .groupBy(studentEnrollments.courseId);

  const enrollmentsMap = new Map<string, number>();
  for (const en of enrollmentsList) {
    enrollmentsMap.set(en.courseId, Number(en.count));
  }

  // Lấy lý do từ chối cho các khoá có status = 'rejected'
  const rejectedIds = list.filter((c) => c.status === "rejected").map((c) => c.id);
  const rejectReasonMap = new Map<string, string>();
  if (rejectedIds.length > 0) {
    const pubRequests = await db
      .select({
        courseId: coursePublicationRequests.courseId,
        reviewNote: coursePublicationRequests.reviewNote,
      })
      .from(coursePublicationRequests)
      .where(inArray(coursePublicationRequests.courseId, rejectedIds))
      .orderBy(desc(coursePublicationRequests.round));

    for (const req of pubRequests) {
      if (!rejectReasonMap.has(req.courseId) && req.reviewNote) {
        rejectReasonMap.set(req.courseId, req.reviewNote);
      }
    }
  }

  return list.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    category: c.category,
    level: c.level,
    status: c.status as CourseStatusType,
    chaptersCount: chaptersMap.get(c.id) || 0,
    lessonsCount: lessonsMap.get(c.id) || 0,
    learnersCount: enrollmentsMap.get(c.id) || 0,
    rejectReason: rejectReasonMap.get(c.id) || null,
    hideReason: c.hiddenReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

/**
 * Tạo một khoá học tối giản mới ở trạng thái Bản nháp (draft).
 */
export async function createCourseDraft(
  input: unknown
): Promise<CreateCourseResult> {
  const user = await verifyLecturerSession();

  const parseResult = createCourseSchema.safeParse(input);
  if (!parseResult.success) {
    const fieldErrors = parseResult.error.flatten().fieldErrors;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      if (v && v.length > 0) {
        errors[k] = v[0];
      }
    }
    return { success: false, errors };
  }

  const { title, summary, category, level } = parseResult.data;
  const courseId = `course-${randomUUID()}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateUniqueCourseSlug(title);
    try {
      await db.transaction(async (tx) => {
        // 1. Thêm khoá học vào bảng courses
        await tx.insert(courses).values({
          id: courseId,
          slug,
          title,
          description: summary,
          category,
          level,
          duration: "0 giờ",
          price: 0,
          instructorId: user.id,
          status: "draft",
          knowledgeMapStatus: "empty",
        });

        // 2. Khởi tạo bản ghi course_details
        await tx.insert(courseDetails).values({
          courseId,
          learningOutcomes: [],
          requirements: [],
        });
      });

      revalidatePath("/dashboard/lecturer");
      revalidatePath("/dashboard/lecturer/courses");

      return { success: true, courseId };
    } catch (err: any) {
      lastError = err;
      if (err?.code === "23505" || err?.message?.includes("unique")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Không thể tạo slug duy nhất cho khoá học.");
}

/**
 * Xử lý bản nháp tạo outline khoá học do AI sinh ra (ai_content_drafts).
 */
export async function saveAiCourseDraft(
  payload: Record<string, any>
): Promise<{ success: boolean; draftId?: number }> {
  const user = await verifyLecturerSession();

  const [inserted] = await db
    .insert(aiContentDrafts)
    .values({
      lecturerId: user.id,
      kind: "course_outline",
      status: "pending",
      payload,
    })
    .returning({ id: aiContentDrafts.id });

  return { success: true, draftId: inserted.id };
}

/**
 * Quyết định duyệt bản nháp AI (chấp nhận hoặc huỷ bỏ).
 */
export async function decideAiCourseDraft(
  draftId: number,
  decision: "accepted" | "discarded"
): Promise<{ success: boolean }> {
  const user = await verifyLecturerSession();

  const updated = await db
    .update(aiContentDrafts)
    .set({
      status: decision,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(aiContentDrafts.id, draftId),
        eq(aiContentDrafts.lecturerId, user.id),
        eq(aiContentDrafts.status, "pending")
      )
    )
    .returning({ id: aiContentDrafts.id });

  if (updated.length === 0) {
    throw new Error("Bản nháp AI không tồn tại, đã được xử lý hoặc không thuộc quyền quản lý của bạn.");
  }

  return { success: true };
}
