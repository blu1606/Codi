"use server";

import { submissionIdentity } from "./submission-identity";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ROLE } from "@codi-1/auth";
import { userRoles } from "@codi-1/db/schema/roles";

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
  validateRubricScores,
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
  rubricScores: Record<string, number> | null;
  answerText: string | null;
  fileUrl: string | null;
  fileName: string | null;
  linkUrl: string | null;
  submittedAt: string | null;
  status: "pending" | "graded";
  score: number | null;
  feedback: string;
  history: GradingHistoryEntry[];
  viewToken: string;
  nextPendingId: number | null;
}

export interface GradingQueueDataDto {
  courses: Array<{ id: string; title: string }>;
  assignments: Array<{ id: number; title: string; courseId: string }>;
  counts: { pending: number; graded: number };
  currentStatus: "pending" | "graded";
  selectedCourseId: string;
  selectedAssignmentId: string;
  selectedDate: string;
  submissions: SubmissionListItemDto[];
  selectedSubmission: SubmissionDetailDto | null;
}

export type GradingQueueResult = GradingQueueDataDto;
export type GradingSubmissionDetail = SubmissionDetailDto;

export interface GradeSubmissionInput {
  submissionId: number;
  viewToken: string;
  score: number;
  feedback?: string;
  reason?: string;
  rubricScores?: Record<string, number>;
  courseFilter?: string;
  assignmentFilter?: string;
  dateFilter?: string;
}

export interface GradeSubmissionResult {
  success: boolean;
  error?: string;
  submissionId?: number;
  nextPendingId?: number | null;
}

function getDateFilterCondition(dateFilter?: string) {
  if (!dateFilter || dateFilter === "all") return undefined;

  const now = new Date();
  if (dateFilter === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return sql`${assessmentSubmissions.submittedAt} >= ${startOfToday}`;
  }
  if (dateFilter === "7days") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return sql`${assessmentSubmissions.submittedAt} >= ${sevenDaysAgo}`;
  }
  if (dateFilter === "30days") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return sql`${assessmentSubmissions.submittedAt} >= ${thirtyDaysAgo}`;
  }

  const parsedDate = new Date(dateFilter);
  if (!isNaN(parsedDate.getTime())) {
    const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
    return and(
      sql`${assessmentSubmissions.submittedAt} >= ${startOfDay}`,
      sql`${assessmentSubmissions.submittedAt} <= ${endOfDay}`
    );
  }

  return undefined;
}

/**
 * Lấy dữ liệu hàng đợi chấm bài của giảng viên, hỗ trợ bộ lọc và split view.
 * Chỉ lấy bài nộp tự luận (assessments.type = 'assignment') và trạng thái nộp hợp lệ.
 */
export async function getGradingQueueData(filters?: {
  status?: "pending" | "graded";
  courseId?: string;
  assignmentId?: string;
  date?: string;
  submissionId?: number;
}): Promise<GradingQueueDataDto> {
  const user = await verifyLecturerSession();

  const currentStatus: "pending" | "graded" =
    filters?.status === "graded" ? "graded" : "pending";
  const selectedCourseId = filters?.courseId || "all";
  const selectedAssignmentId = filters?.assignmentId || "all";
  const selectedDate = filters?.date || "all";

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
      assignments: [],
      counts: { pending: 0, graded: 0 },
      currentStatus,
      selectedCourseId: "all",
      selectedAssignmentId: "all",
      selectedDate: "all",
      submissions: [],
      selectedSubmission: null,
    };
  }

  // 2. Lấy danh sách bài tập tự luận (assessments.type = 'assignment') để phục vụ bộ lọc Assignment
  const assignmentsList = await db
    .select({
      id: assessments.id,
      title: sql<string>`coalesce(${courseLessons.title}, ${assessments.title})`,
      courseId: assessments.courseId,
    })
    .from(assessments)
    .leftJoin(courseLessons, eq(assessments.lessonId, courseLessons.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessments.type, "assignment")
      )
    )
    .orderBy(asc(assessments.title));

  // Điều kiện lọc chung
  const courseCondition =
    selectedCourseId !== "all" ? eq(assessments.courseId, selectedCourseId) : undefined;
  const assignmentCondition =
    selectedAssignmentId !== "all"
      ? eq(assessments.id, Number(selectedAssignmentId))
      : undefined;
  const dateCondition = getDateFilterCondition(selectedDate);

  // 3. Tính số lượng Chờ chấm (pending) và Đã chấm (graded)
  const pendingCountRes = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessments.type, "assignment"),
        eq(assessmentSubmissions.status, "pending"),
        courseCondition,
        assignmentCondition,
        dateCondition
      )
    );

  const gradedCountRes = await db
    .select({ count: count() })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessments.type, "assignment"),
        eq(assessmentSubmissions.status, "graded"),
        courseCondition,
        assignmentCondition,
        dateCondition
      )
    );

  const counts = {
    pending: Number(pendingCountRes[0]?.count || 0),
    graded: Number(gradedCountRes[0]?.count || 0),
  };

  // 4. Query danh sách bài nộp theo bộ lọc và sắp xếp
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
        eq(assessments.type, "assignment"),
        eq(assessmentSubmissions.status, currentStatus),
        courseCondition,
        assignmentCondition,
        dateCondition
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

  // 5. Lấy chi tiết bài nộp được chọn (hoặc bài đầu tiên trong danh sách)
  let selectedId = filters?.submissionId;
  if (!selectedId && submissions.length > 0) {
    selectedId = submissions[0].id;
  }

  let selectedSubmission: SubmissionDetailDto | null = null;

  if (selectedId) {
    const detailRes = await db
      .select({
        id: assessmentSubmissions.id,
        assessmentId: assessmentSubmissions.assessmentId,
        enrollmentId: assessmentSubmissions.enrollmentId,
        attempt: assessmentSubmissions.attempt,
        savedAt: assessmentSubmissions.savedAt,
        gradedAt: assessmentSubmissions.gradedAt,
        gradedBy: assessmentSubmissions.gradedBy,
        type: assessments.type,
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
          inArray(assessments.courseId, myCourseIds),
          eq(assessments.type, "assignment"),
          inArray(assessmentSubmissions.status, ["pending", "graded"])
        )
      )
      .limit(1);

    if (detailRes.length > 0) {
      const row = detailRes[0];
      const { feedback: cleanFeedback, history, rubricScores } = parseFeedbackAndHistory(row.feedback);

      // Parse rubric nếu có
      let rubricList: RubricCriterion[] | null = null;
      if (row.rubric) {
        try {
          const parsed = typeof row.rubric === "string" ? JSON.parse(row.rubric) : row.rubric;
          if (Array.isArray(parsed) && parsed.length > 0) {
            rubricList = parsed;
          }
        } catch {
          rubricList = null;
        }
      }

      // Tìm bài chờ chấm tiếp theo (nextPendingId) trong cùng scope bộ lọc
      const nextPendingRes = await db
        .select({ id: assessmentSubmissions.id })
        .from(assessmentSubmissions)
        .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
        .where(
          and(
            inArray(assessments.courseId, myCourseIds),
            eq(assessments.type, "assignment"),
            eq(assessmentSubmissions.status, "pending"),
            sql`${assessmentSubmissions.id} <> ${row.id}`,
            courseCondition,
            assignmentCondition,
            dateCondition
          )
        )
        .orderBy(asc(assessmentSubmissions.submittedAt), asc(assessmentSubmissions.id))
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
        rubricScores,
        answerText: row.answerText,
        fileUrl: row.fileUrl,
        fileName: row.fileName,
        linkUrl: row.linkUrl,
        submittedAt: itemToIso(row.submittedAt),
        status: row.status as "pending" | "graded",
        score: row.score !== null ? Number(row.score) : null,
        feedback: cleanFeedback,
        history,
        viewToken: submissionIdentity(row),
        nextPendingId,
      };
    }
  }

  return {
    courses: myCourses,
    assignments: assignmentsList,
    counts,
    currentStatus,
    selectedCourseId,
    selectedAssignmentId,
    selectedDate,
    submissions,
    selectedSubmission,
  };
}

function itemToIso(dateVal: any): string | null {
  if (!dateVal) return null;
  if (typeof dateVal.toISOString === "function") return dateVal.toISOString();
  return String(dateVal);
}

/**
 * Lưu điểm số, nhận xét và gửi thông báo cho học viên.
 * Hỗ trợ sửa điểm kèm lưu lịch sử và lý do bắt buộc (STATE-MACHINES.md §20).
 * An toàn đồng thời (concurrency-safe), chỉ áp dụng cho bài tập tự luận.
 */
export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradeSubmissionResult> {
  const user = await verifyLecturerSession();

  try {
    await db.transaction(async tx => {
      // Resolve IDs without acquiring locks, then use the learner writer's order:
      // enrollment -> course -> assessment -> submission. Re-read and authorize after locking.
      const [ids] = await tx.select({
        enrollmentId: assessmentSubmissions.enrollmentId,
        assessmentId: assessmentSubmissions.assessmentId,
      }).from(assessmentSubmissions).where(eq(assessmentSubmissions.id, input.submissionId));
      if (!ids) throw new Error("Bài nộp không tồn tại.");
      const [enrollment] = await tx.select().from(studentEnrollments)
        .where(eq(studentEnrollments.id, ids.enrollmentId)).for("update");
      if (!enrollment) throw new Error("Bài nộp không tồn tại.");
      const [course] = await tx.select().from(courses)
        .where(eq(courses.id, enrollment.courseId)).for("share");
      if (!course || course.instructorId !== user.id) throw new Error("Bài nộp không thuộc quyền chấm của bạn.");
      const [assessment] = await tx.select().from(assessments)
        .where(and(eq(assessments.id, ids.assessmentId), eq(assessments.courseId, course.id))).for("share");
      if (!assessment || assessment.type !== "assignment") throw new Error("Chỉ có thể chấm bài tự luận (assignment).");
      const [submission] = await tx.select().from(assessmentSubmissions)
        .where(and(eq(assessmentSubmissions.id, input.submissionId),
          eq(assessmentSubmissions.enrollmentId, enrollment.id),
          eq(assessmentSubmissions.assessmentId, assessment.id))).for("update");
      if (!submission || !["pending", "graded"].includes(submission.status)) {
        throw new Error("Không thể chấm bài nộp ở trạng thái bản nháp (chưa nộp).");
      }
      const [activeRole] = await tx.select({ id: userRoles.id }).from(userRoles)
        .innerJoin(userTable, eq(userRoles.userId, userTable.id))
        .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, ROLE.LECTURER),
          isNull(userRoles.revokedAt), eq(userTable.banned, false))).limit(1);
      if (!activeRole) throw new Error("Bạn không còn quyền chấm bài.");
      const observed = { ...submission, maxScore: assessment.maxScore, passingScore: assessment.passingScore,
        rubric: assessment.rubric, instructions: assessment.instructions, type: assessment.type, courseId: assessment.courseId };
      if (!input.viewToken || input.viewToken !== submissionIdentity(observed)) {
        throw new Error("Bài nộp đã được thay đổi bởi một phiên làm việc khác. Vui lòng tải lại trang.");
      }
      const { feedback: previousFeedback, history } = parseFeedbackAndHistory(submission.feedback, true);
      let rubric: RubricCriterion[] | null = null;
      if (assessment.rubric) {
        try {
          const parsed: unknown = JSON.parse(assessment.rubric);
          if (!Array.isArray(parsed) || !parsed.every(criterion => criterion && typeof criterion.id === "string" &&
            criterion.id.length > 0 && Number.isFinite(Number(criterion.points ?? criterion.maxScore)) &&
            Number(criterion.points ?? criterion.maxScore) >= 0) ||
            new Set(parsed.map(criterion => criterion.id)).size !== parsed.length) throw new Error();
          rubric = parsed;
        } catch {
          throw new Error("Thang điểm rubric không hợp lệ; không thể lưu điểm.");
        }
      }
      const maxScore = Number(assessment.maxScore);
      const newScore = Math.round(Number(input.score) * 10) / 10;
      const rubricValidation = validateRubricScores(rubric, input.rubricScores, newScore);
      if (!rubricValidation.isValid) throw new Error(rubricValidation.error);
      const wasGraded = submission.status === "graded";
      const oldScore = submission.score;
      const validation = validateGradeInput({ score: newScore, maxScore, wasGraded, oldScore, reason: input.reason });
      if (!validation.isValid) throw new Error(validation.error);
      if (wasGraded && oldScore !== null && newScore !== oldScore) {
        history.unshift({ oldScore, newScore, feedback: previousFeedback, reason: input.reason!.trim(),
          at: new Date().toISOString(), gradedBy: user.id });
      }
      const threshold = maxScore * (assessment.passingScore ?? 50) / 100;
      const [updated] = await tx.update(assessmentSubmissions).set({
        status: "graded", score: newScore,
        feedback: serializeFeedbackAndHistory((input.feedback || "").trim(), history, input.rubricScores),
        isPassed: newScore >= threshold, gradedBy: user.id, gradedAt: new Date(),
      }).where(and(eq(assessmentSubmissions.id, submission.id), eq(assessmentSubmissions.status, submission.status)))
        .returning({ id: assessmentSubmissions.id });
      if (!updated) throw new Error("Xung đột phiên làm việc: Bài nộp đã được cập nhật.");
      await createNotificationService(tx).notify(enrollment.userId,
        wasGraded ? "Điểm bài tập đã được cập nhật" : "Bài tập đã được chấm",
        `${assessment.title || course.title} — ${String(newScore).replace(".", ",")}/${maxScore} điểm`,
        "/dashboard/learner");
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu điểm bài nộp." };
  }

  // 6. Tìm bài chờ chấm tiếp theo tuân theo đúng scope bộ lọc của người dùng (FIFO)
  const courseFilter = input.courseFilter || "all";
  const assignmentFilter = input.assignmentFilter || "all";
  const dateFilter = input.dateFilter || "all";

  const nextCourseCondition = courseFilter !== "all" ? eq(assessments.courseId, courseFilter) : undefined;
  const nextAssignmentCondition =
    assignmentFilter !== "all" ? eq(assessments.id, Number(assignmentFilter)) : undefined;
  const nextDateCondition = getDateFilterCondition(dateFilter);

  // Lấy các khoá học của giảng viên
  const myCourseRows = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, user.id));
  const myCourseIds = myCourseRows.map((c) => c.id);

  const nextPendingRes = await db
    .select({ id: assessmentSubmissions.id })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .where(
      and(
        inArray(assessments.courseId, myCourseIds),
        eq(assessments.type, "assignment"),
        eq(assessmentSubmissions.status, "pending"),
        sql`${assessmentSubmissions.id} <> ${input.submissionId}`,
        nextCourseCondition,
        nextAssignmentCondition,
        nextDateCondition
      )
    )
    .orderBy(asc(assessmentSubmissions.submittedAt), asc(assessmentSubmissions.id))
    .limit(1);

  const nextPendingId = nextPendingRes[0]?.id || null;

  revalidatePath("/dashboard/lecturer/grading");
  revalidatePath("/dashboard/lecturer");

  return {
    success: true,
    submissionId: input.submissionId,
    nextPendingId,
  };
}

/**
 * AI grading is unavailable in the manual-only prototype, including direct action calls.
 */
export async function getAiGradingDraft(submissionId: number): Promise<{
  success: boolean;
  suggestedScore?: number;
  feedback?: string;
  error?: string;
}> {
  await verifyLecturerSession();
  return { success: false, error: "AI chấm bài chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm." };
}
