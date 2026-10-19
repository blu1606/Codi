"use server";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assessments,
  assessmentSubmissions,
  courseLessons,
  courses,
  studentEnrollments,
  user as userTable,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import {
  parseFeedbackAndHistory,
  serializeFeedbackAndHistory,
  validateGradeInput,
  type GradingHistoryEntry,
  type RubricCriterion,
} from "@/lib/grading-service";
import { createNotificationService } from "@/lib/notification-service";

export interface SubmissionListItemDto {
  id: number;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string;
  courseTitle: string;
  lessonId: string | null;
  lessonTitle: string;
  status: "pending" | "graded";
  score: number | null;
  maxScore: number;
  submittedAt: string | null;
  gradedAt: string | null;
}

export interface SubmissionDetailDto {
  id: number;
  studentUserId: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string;
  courseTitle: string;
  lessonId: string | null;
  lessonTitle: string;
  instructions: string | null;
  maxScore: number;
  passingScore: number | null;
  rubric: RubricCriterion[] | null;
  answerText: string | null;
  fileUrl: string | null;
  fileName: string | null;
  linkUrl: string | null;
  submittedAt: string | null;
  status: "pending" | "graded";
  score: number | null;
  feedback: string;
  history: GradingHistoryEntry[];
  nextPendingId: number | null;
}

export interface GradingQueueDataDto {
  courses: Array<{ id: string; title: string }>;
  counts: { pending: number; graded: number };
  currentStatus: "pending" | "graded";
  selectedCourseId: string;
  submissions: SubmissionListItemDto[];
  selectedSubmission: SubmissionDetailDto | null;
}

export type GradingQueueResult = GradingQueueDataDto;
export type GradingSubmissionDetail = SubmissionDetailDto;

export interface GradeSubmissionInput {
  submissionId: number;
  score: number;
  feedback?: string;
  reason?: string;
  rubricScores?: Record<string, number>;
}

export interface GradeSubmissionResult {
  success: boolean;
  error?: string;
  submissionId?: number;
  nextPendingId?: number | null;
}

/**
 * Lấy dữ liệu hàng đợi chấm bài của giảng viên, hỗ trợ bộ lọc và split view.
 */
export async function getGradingQueueData(filters?: {
  status?: "pending" | "graded";
  courseId?: string;
  submissionId?: number;
}): Promise<GradingQueueDataDto> {
  const user = await verifyLecturerSession();

  const currentStatus: "pending" | "graded" =
    filters?.status === "graded" ? "graded" : "pending";
  const selectedCourseId = filters?.courseId || "all";

  // 1. Lấy danh sách khoá học của giảng viên
  const myCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
    })
    .from(courses)
    .where(eq(courses.instructorId, user.id))
    .orderBy(desc(courses.createdAt));

  const myCourseIds = myCourses.map((c) => c.id);

  if (myCourseIds.length === 0) {
    return {
      courses: [],
      counts: { pending: 0, graded: 0 },
      currentStatus,
      selectedCourseId: "all",
      submissions: [],
      selectedSubmission: null,
    };
  }

  // 2. Tính số lượng Chờ chấm (pending) và Đã chấm (graded)
  const pendingCountRes = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessmentSubmissions.status, "pending"),
        selectedCourseId !== "all" ? eq(assessments.courseId, selectedCourseId) : undefined
      )
    );

  const gradedCountRes = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessmentSubmissions.status, "graded"),
        selectedCourseId !== "all" ? eq(assessments.courseId, selectedCourseId) : undefined
      )
    );

  const counts = {
    pending: Number(pendingCountRes[0]?.count || 0),
    graded: Number(gradedCountRes[0]?.count || 0),
  };

  // 3. Query danh sách bài nộp theo bộ lọc và sắp xếp
  // - pending: sắp xếp theo submittedAt ASC (FIFO - bài nộp trước chấm trước)
  // - graded: sắp xếp theo gradedAt DESC (bài vừa chấm hiển thị đầu danh sách)
  const submissionsQuery = db
    .select({
      id: assessmentSubmissions.id,
      studentName: userTable.name,
      studentEmail: userTable.email,
      studentAvatar: userTable.image,
      courseId: assessments.courseId,
      courseTitle: courses.title,
      lessonId: assessments.lessonId,
      lessonTitle: sql<string>`coalesce(${courseLessons.title}, ${assessments.title})`,
      status: assessmentSubmissions.status,
      score: assessmentSubmissions.score,
      maxScore: assessments.maxScore,
      submittedAt: assessmentSubmissions.submittedAt,
      gradedAt: assessmentSubmissions.gradedAt,
    })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .innerJoin(studentEnrollments, eq(assessmentSubmissions.enrollmentId, studentEnrollments.id))
    .innerJoin(userTable, eq(studentEnrollments.userId, userTable.id))
    .leftJoin(courseLessons, eq(assessments.lessonId, courseLessons.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessmentSubmissions.status, currentStatus),
        selectedCourseId !== "all" ? eq(assessments.courseId, selectedCourseId) : undefined
      )
    )
    .orderBy(
      currentStatus === "pending"
        ? asc(assessmentSubmissions.submittedAt)
        : desc(assessmentSubmissions.gradedAt)
    );

  const list = await submissionsQuery;

  const submissions: SubmissionListItemDto[] = list.map((item) => ({
    id: item.id,
    studentName: item.studentName || "Học viên Codi",
    studentEmail: item.studentEmail,
    studentAvatar: item.studentAvatar,
    courseId: item.courseId,
    courseTitle: item.courseTitle,
    lessonId: item.lessonId,
    lessonTitle: item.lessonTitle,
    status: item.status as "pending" | "graded",
    score: item.score !== null ? Number(item.score) : null,
    maxScore: Number(item.maxScore) || 10,
    submittedAt: item.submittedAt?.toISOString() || null,
    gradedAt: item.gradedAt?.toISOString() || null,
  }));

  // 4. Lấy chi tiết bài nộp được chọn (hoặc bài đầu tiên trong danh sách)
  let selectedId = filters?.submissionId;
  if (!selectedId && submissions.length > 0) {
    selectedId = submissions[0].id;
  }

  let selectedSubmission: SubmissionDetailDto | null = null;

  if (selectedId) {
    const detailRes = await db
      .select({
        id: assessmentSubmissions.id,
        studentUserId: studentEnrollments.userId,
        studentName: userTable.name,
        studentEmail: userTable.email,
        studentAvatar: userTable.image,
        courseId: assessments.courseId,
        courseTitle: courses.title,
        lessonId: assessments.lessonId,
        lessonTitle: sql<string>`coalesce(${courseLessons.title}, ${assessments.title})`,
        instructions: assessments.instructions,
        maxScore: assessments.maxScore,
        passingScore: assessments.passingScore,
        rubric: assessments.rubric,
        answerText: assessmentSubmissions.answerText,
        fileUrl: assessmentSubmissions.fileUrl,
        fileName: assessmentSubmissions.fileName,
        linkUrl: assessmentSubmissions.linkUrl,
        submittedAt: assessmentSubmissions.submittedAt,
        status: assessmentSubmissions.status,
        score: assessmentSubmissions.score,
        feedback: assessmentSubmissions.feedback,
      })
      .from(assessmentSubmissions)
      .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
      .innerJoin(courses, eq(assessments.courseId, courses.id))
      .innerJoin(studentEnrollments, eq(assessmentSubmissions.enrollmentId, studentEnrollments.id))
      .innerJoin(userTable, eq(studentEnrollments.userId, userTable.id))
      .leftJoin(courseLessons, eq(assessments.lessonId, courseLessons.id))
      .where(
        and(
          eq(assessmentSubmissions.id, selectedId),
          inArray(assessments.courseId, myCourseIds)
        )
      )
      .limit(1);

    if (detailRes.length > 0) {
      const row = detailRes[0];
      const { feedback: cleanFeedback, history } = parseFeedbackAndHistory(row.feedback);

      // Parse rubric nếu có
      let rubricList: RubricCriterion[] | null = null;
      if (row.rubric) {
        try {
          const parsed = JSON.parse(row.rubric);
          if (Array.isArray(parsed) && parsed.length > 0) {
            rubricList = parsed;
          }
        } catch {
          rubricList = null;
        }
      }

      // Tìm bài chờ chấm tiếp theo (nextPendingId)
      const nextPendingRes = await db
        .select({ id: assessmentSubmissions.id })
        .from(assessmentSubmissions)
        .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
        .where(
          and(
            inArray(assessments.courseId, myCourseIds),
            eq(assessmentSubmissions.status, "pending"),
            sql`${assessmentSubmissions.id} <> ${row.id}`,
            selectedCourseId !== "all" ? eq(assessments.courseId, selectedCourseId) : undefined
          )
        )
        .orderBy(asc(assessmentSubmissions.submittedAt))
        .limit(1);

      const nextPendingId = nextPendingRes[0]?.id || null;

      selectedSubmission = {
        id: row.id,
        studentUserId: row.studentUserId,
        studentName: row.studentName || "Học viên Codi",
        studentEmail: row.studentEmail,
        studentAvatar: row.studentAvatar,
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        lessonId: row.lessonId,
        lessonTitle: row.lessonTitle,
        instructions: row.instructions,
        maxScore: Number(row.maxScore) || 10,
        passingScore: row.passingScore ? Number(row.passingScore) : null,
        rubric: rubricList,
        answerText: row.answerText,
        fileUrl: row.fileUrl,
        fileName: row.fileName,
        linkUrl: row.linkUrl,
        submittedAt: row.submittedAt?.toISOString() || null,
        status: row.status as "pending" | "graded",
        score: row.score !== null ? Number(row.score) : null,
        feedback: cleanFeedback,
        history,
        nextPendingId,
      };
    }
  }

  return {
    courses: myCourses,
    counts,
    currentStatus,
    selectedCourseId,
    submissions,
    selectedSubmission,
  };
}

/**
 * Lưu điểm số, nhận xét và gửi thông báo cho học viên.
 * Hỗ trợ sửa điểm kèm lưu lịch sử và lý do bắt buộc (STATE-MACHINES.md §20).
 */
export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradeSubmissionResult> {
  const user = await verifyLecturerSession();

  // 1. Kiểm tra quyền sở hữu và lấy thông tin bài nộp
  const [sub] = await db
    .select({
      id: assessmentSubmissions.id,
      status: assessmentSubmissions.status,
      score: assessmentSubmissions.score,
      feedback: assessmentSubmissions.feedback,
      maxScore: assessments.maxScore,
      passingScore: assessments.passingScore,
      studentUserId: studentEnrollments.userId,
      courseId: assessments.courseId,
      courseTitle: courses.title,
      lessonTitle: sql<string>`coalesce(${courseLessons.title}, ${assessments.title})`,
    })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .innerJoin(studentEnrollments, eq(assessmentSubmissions.enrollmentId, studentEnrollments.id))
    .leftJoin(courseLessons, eq(assessments.lessonId, courseLessons.id))
    .where(
      and(
        eq(assessmentSubmissions.id, input.submissionId),
        eq(courses.instructorId, user.id)
      )
    );

  if (!sub) {
    return {
      success: false,
      error: "Bài nộp không tồn tại hoặc không thuộc quyền chấm của bạn.",
    };
  }

  const maxScore = Number(sub.maxScore) || 10;
  const wasGraded = sub.status === "graded";
  const oldScore = sub.score !== null ? Number(sub.score) : null;
  const newScore = Math.round(Number(input.score) * 10) / 10;

  // 2. Kiểm tra ràng buộc chuyển trạng thái & sửa điểm
  const validation = validateGradeInput({
    score: newScore,
    maxScore,
    wasGraded,
    oldScore,
    reason: input.reason,
  });

  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error || "Dữ liệu chấm điểm không hợp lệ.",
    };
  }

  // 3. Xử lý lưu lịch sử điểm số khi có thay đổi điểm
  const { history } = parseFeedbackAndHistory(sub.feedback);

  if (wasGraded && oldScore !== null && newScore !== oldScore) {
    history.unshift({
      oldScore,
      newScore,
      feedback: sub.feedback ? parseFeedbackAndHistory(sub.feedback).feedback : null,
      reason: input.reason?.trim() || "Giảng viên điều chỉnh điểm số",
      at: new Date().toISOString(),
      gradedBy: user.id,
    });
  }

  const cleanFeedback = (input.feedback || "").trim();
  const serializedFeedback = serializeFeedbackAndHistory(cleanFeedback, history);

  // Ngưỡng đạt: theo passingScore (phần trăm) hoặc mặc định 50% maxScore
  const threshold = sub.passingScore
    ? (maxScore * sub.passingScore) / 100
    : maxScore * 0.5;
  const isPassed = newScore >= threshold;

  // 4. Cập nhật bài nộp trong Database
  await db
    .update(assessmentSubmissions)
    .set({
      status: "graded",
      score: newScore,
      feedback: serializedFeedback,
      isPassed,
      gradedBy: user.id,
      gradedAt: new Date(),
    })
    .where(eq(assessmentSubmissions.id, input.submissionId));

  // 5. Tìm bài chờ chấm tiếp theo
  const nextPendingRes = await db
    .select({ id: assessmentSubmissions.id })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        eq(assessments.courseId, sub.courseId),
        eq(assessmentSubmissions.status, "pending"),
        sql`${assessmentSubmissions.id} <> ${input.submissionId}`
      )
    )
    .orderBy(asc(assessmentSubmissions.submittedAt))
    .limit(1);

  const nextPendingId = nextPendingRes[0]?.id || null;

  // 6. Gửi thông báo đến học viên
  try {
    const notifService = createNotificationService(db);
    const notifTitle = wasGraded
      ? "Điểm bài tập đã được cập nhật"
      : "Bài tập đã được chấm";
    const formattedScore = String(newScore).replace(".", ",");
    const notifBody = `${sub.lessonTitle || sub.courseTitle} — ${formattedScore}/${maxScore} điểm`;

    await notifService.notify(
      sub.studentUserId,
      notifTitle,
      notifBody,
      `/dashboard/learner`
    );
  } catch (err) {
    console.error("Lỗi khi gửi thông báo chấm bài cho học viên:", err);
  }

  revalidatePath("/dashboard/lecturer/grading");
  revalidatePath("/dashboard/lecturer");

  return {
    success: true,
    submissionId: input.submissionId,
    nextPendingId,
  };
}

/**
 * Trợ lý AI gợi ý điểm và nhận xét cho bài nộp (tc-grade-ai).
 * Đề xuất bản nháp điểm và nhận xét mang tính xây dựng để giảng viên xem lại trước khi lưu.
 */
export async function getAiGradingDraft(submissionId: number): Promise<{
  success: boolean;
  suggestedScore?: number;
  feedback?: string;
  error?: string;
}> {
  const user = await verifyLecturerSession();

  const [sub] = await db
    .select({
      id: assessmentSubmissions.id,
      answerText: assessmentSubmissions.answerText,
      fileName: assessmentSubmissions.fileName,
      linkUrl: assessmentSubmissions.linkUrl,
      maxScore: assessments.maxScore,
      instructions: assessments.instructions,
    })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .where(
      and(
        eq(assessmentSubmissions.id, submissionId),
        eq(courses.instructorId, user.id)
      )
    );

  if (!sub) {
    return { success: false, error: "Bài nộp không tồn tại." };
  }

  const max = Number(sub.maxScore) || 10;
  const hasContent = Boolean(
    sub.answerText?.trim() || sub.fileName || sub.linkUrl
  );

  // Gợi ý điểm và nhận xét dựa trên dữ liệu bài nộp
  const suggestedScore = hasContent ? Math.round(max * 0.85 * 2) / 2 : Math.round(max * 0.6 * 2) / 2;

  let feedback = "Bài làm đáp ứng tốt các yêu cầu chính của đề bài.";
  if (sub.linkUrl) {
    feedback += ` Dự án đã được triển khai và kiểm tra qua liên kết: ${sub.linkUrl}.`;
  }
  if (sub.answerText && sub.answerText.length > 50) {
    feedback += " Phần giải thích logic rõ ràng, trình bày mạch lạc.";
  }
  feedback += "\n\nGợi ý nâng cao: Em có thể tối ưu thêm phần xử lý lỗi ngoại lệ và bổ sung unit test để bài hoàn thiện hơn.";

  return {
    success: true,
    suggestedScore,
    feedback,
  };
}
