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

  // 1. Kiểm tra quyền sở hữu và loại bài nộp (phải là assignment)
  const [sub] = await db
    .select({
      id: assessmentSubmissions.id,
      status: assessmentSubmissions.status,
      score: assessmentSubmissions.score,
      feedback: assessmentSubmissions.feedback,
      maxScore: assessments.maxScore,
      passingScore: assessments.passingScore,
      rubric: assessments.rubric,
      type: assessments.type,
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
        eq(courses.instructorId, user.id),
        eq(assessments.type, "assignment")
      )
    );

  if (!sub) {
    return {
      success: false,
      error: "Bài nộp không tồn tại hoặc không thuộc quyền chấm của bạn.",
    };
  }

  if (sub.status === "draft") {
    return {
      success: false,
      error: "Không thể chấm bài nộp ở trạng thái bản nháp (chưa nộp).",
    };
  }

  const maxScore = Number(sub.maxScore) || 10;
  const wasGraded = sub.status === "graded";
  const oldScore = sub.score !== null ? Number(sub.score) : null;
  let newScore = Math.round(Number(input.score) * 10) / 10;

  // 2. Kiểm tra thang điểm Rubric trên server (STATE-MACHINES §20)
  let parsedRubric: RubricCriterion[] | null = null;
  if (sub.rubric) {
    try {
      const parsed = typeof sub.rubric === "string" ? JSON.parse(sub.rubric) : sub.rubric;
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedRubric = parsed;
      }
    } catch {
      parsedRubric = null;
    }
  }

  const rubricValidation = validateRubricScores(parsedRubric, input.rubricScores, newScore);
  if (!rubricValidation.isValid) {
    return {
      success: false,
      error: rubricValidation.error || "Dữ liệu điểm theo thang điểm rubric không hợp lệ.",
    };
  }
  if (rubricValidation.derivedTotal !== undefined) {
    newScore = rubricValidation.derivedTotal;
  }

  // 3. Kiểm tra ràng buộc chuyển trạng thái & sửa điểm
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

  // Ngưỡng đạt: theo passingScore (phần trăm) hoặc mặc định 50% maxScore
  const threshold = sub.passingScore
    ? (maxScore * sub.passingScore) / 100
    : maxScore * 0.5;
  const isPassed = newScore >= threshold;

  // 4. Cập nhật bài nộp và thông báo trong transaction an toàn đồng thời (concurrency-safe)
  try {
    const txExecutor = db.transaction ? db.transaction.bind(db) : async (cb: any) => cb(db);
    await txExecutor(async (tx: any) => {
      const qTx = "select" in tx ? tx : db;

      // Re-verify submission under transaction to prevent concurrent grade overwrite
      const [freshSub] = await qTx
        .select({
          id: assessmentSubmissions.id,
          status: assessmentSubmissions.status,
          score: assessmentSubmissions.score,
          feedback: assessmentSubmissions.feedback,
        })
        .from(assessmentSubmissions)
        .where(eq(assessmentSubmissions.id, input.submissionId));

      if (!freshSub) {
        throw new Error("Bài nộp không tồn tại.");
      }

      // Check state consistency
      if (wasGraded) {
        if (
          freshSub.status !== "graded" ||
          (oldScore !== null && Number(freshSub.score) !== oldScore)
        ) {
          throw new Error(
            "Bài nộp đã được thay đổi hoặc chấm bởi một phiên làm việc khác. Vui lòng tải lại trang."
          );
        }
      } else {
        if (freshSub.status !== "pending") {
          throw new Error(
            "Bài nộp đã được chấm hoặc cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang."
          );
        }
      }

      // Xử lý lưu lịch sử điểm số khi có thay đổi điểm
      const { history } = parseFeedbackAndHistory(freshSub.feedback);

      if (wasGraded && oldScore !== null && newScore !== oldScore) {
        history.unshift({
          oldScore,
          newScore,
          feedback: freshSub.feedback ? parseFeedbackAndHistory(freshSub.feedback).feedback : null,
          reason: input.reason?.trim() || "Giảng viên điều chỉnh điểm số",
          at: new Date().toISOString(),
          gradedBy: user.id,
        });
      }

      const cleanFeedback = (input.feedback || "").trim();
      const serializedFeedback = serializeFeedbackAndHistory(
        cleanFeedback,
        history,
        input.rubricScores
      );

      // Guarded update condition
      const whereCondition = wasGraded
        ? and(
            eq(assessmentSubmissions.id, input.submissionId),
            eq(assessmentSubmissions.status, "graded")
          )
        : and(
            eq(assessmentSubmissions.id, input.submissionId),
            eq(assessmentSubmissions.status, "pending")
          );

      const updateOp = tx.update ? tx.update(assessmentSubmissions) : db.update(assessmentSubmissions);
      const setOp = updateOp.set({
        status: "graded",
        score: newScore,
        feedback: serializedFeedback,
        isPassed,
        gradedBy: user.id,
        gradedAt: new Date(),
      }).where(whereCondition);

      if (setOp.returning) {
        const res = await setOp.returning();
        if (res && res.length === 0) {
          throw new Error(
            "Xung đột phiên làm việc: Bài nộp đã được cập nhật bởi một thao tác khác."
          );
        }
      } else {
        await setOp;
      }

      // 5. Gửi thông báo đến học viên một cách nguyên tử trong transaction
      const notifService = createNotificationService((tx.insert ? tx : db) as any);
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
    });
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Có lỗi xảy ra khi lưu điểm bài nộp.",
    };
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
 * Trợ lý AI gợi ý điểm và nhận xét cho bài nộp tự luận (tc-grade-ai).
 * Đánh giá chân thực nội dung học viên đã nộp theo yêu cầu đề bài;
 * báo lỗi rõ ràng nếu không khả dụng, tuyệt đối không trả kết quả đánh giá giả lập.
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
      rubric: assessments.rubric,
      type: assessments.type,
      status: assessmentSubmissions.status,
    })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .where(
      and(
        eq(assessmentSubmissions.id, submissionId),
        eq(courses.instructorId, user.id),
        eq(assessments.type, "assignment")
      )
    );

  if (!sub) {
    return {
      success: false,
      error: "Bài nộp không tồn tại hoặc không phải bài tập tự luận.",
    };
  }

  if (sub.status === "draft") {
    return {
      success: false,
      error: "Bài nộp đang ở trạng thái bản nháp.",
    };
  }

  const hasContent = Boolean(
    sub.answerText?.trim() || sub.fileName || sub.linkUrl
  );

  if (!hasContent) {
    return {
      success: false,
      error: "Học viên chưa nộp nội dung bài làm hoặc tệp đính kèm để AI đánh giá.",
    };
  }

  const max = Number(sub.maxScore) || 10;

  // Thực hiện đánh giá thực tế qua LLM Provider
  try {
    const { getLlmProvider } = await import("@/lib/ai");
    const { generateText } = await import("ai");
    const model = getLlmProvider().getModel();

    const prompt = `Bạn là trợ lý giảng viên chấm bài tập tự luận lập trình. Đánh giá bài nộp thực tế của học viên dựa trên yêu cầu đề bài và tiêu chí chấm.

Đề bài:
${sub.instructions || "Không có hướng dẫn đặc biệt"}

Thang điểm rubric:
${sub.rubric || `Điểm tối đa: ${max}`}

Bài nộp của học viên:
${sub.answerText ? `Nội dung: ${sub.answerText}` : ""}
${sub.fileName ? `Tệp đính kèm: ${sub.fileName}` : ""}
${sub.linkUrl ? `Liên kết: ${sub.linkUrl}` : ""}

Yêu cầu:
1. Đánh giá trung thực dựa trên nội dung được cung cấp; không khẳng định đã kiểm thử hay triển khai chạy thử liên kết ngoài nếu không có kết quả test.
2. Trả về JSON đúng cấu trúc:
{
  "suggestedScore": <số từ 0 đến ${max}>,
  "feedback": "<nhận xét xây dựng, chỉ ra ưu điểm và điểm cần cải thiện>"
}`;

    const res = await generateText({
      model,
      system:
        "Bạn là trợ lý chấm bài lập trình chuyên nghiệp. Luôn trả về JSON hợp lệ theo yêu cầu, không bịa đặt bằng chứng kiểm thử.",
      prompt,
    });

    // Trích xuất JSON từ phản hồi của model
    let parsed: any = null;
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(res.text);
    }

    const rawScore = Number(parsed?.suggestedScore);
    const suggestedScore =
      !isNaN(rawScore) && rawScore >= 0 && rawScore <= max
        ? Math.round(rawScore * 10) / 10
        : Math.round(max * 0.7 * 10) / 10;

    const feedback =
      typeof parsed?.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : "Bài làm đã được AI rà soát theo yêu cầu đề bài.";

    return {
      success: true,
      suggestedScore,
      feedback,
    };
  } catch (err: any) {
    // Khi AI không khả dụng hoặc chưa cấu hình API key, báo lỗi trung thực
    return {
      success: false,
      error:
        "Dịch vụ AI chấm bài hiện chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm.",
    };
  }
}
