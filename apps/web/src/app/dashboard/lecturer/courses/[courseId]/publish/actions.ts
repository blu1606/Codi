"use server";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ROLE } from "@codi-1/auth";
import {
  assessments,
  codingExercises,
  codingTestCases,
  courseChapters,
  courseDetails,
  courseLessons,
  coursePublicationRequests,
  courses,
  lessonMaterials,
  notifications,
  publicationReviewCriteria,
  publicationReviewFlags,
  quizQuestions,
  user,
  userRoles,
} from "@codi-1/db";
import {
  checkReadiness,
  CRITERIA,
  type CourseDataForReview,
  type ReadinessResult,
  type ReviewFlagDto,
  type ReviewRoundDto,
} from "@/lib/publication-service";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

export interface PublicationDataDto {
  course: {
    id: string;
    title: string;
    summary: string;
    description: string;
    status: string;
    price: number;
    proposedPrice: number;
    rejectReason: string | null;
    reviewOutcome: string | null;
    publishedAt: string | null;
    hiddenReason: string | null;
    knowledgeMapStatus: string;
  };
  readiness: ReadinessResult;
  round: ReviewRoundDto | null;
  isLocked: boolean;
}

/**
 * Builds standard CourseDataForReview structure from database for a given course.
 */
export async function fetchCourseDataForReview(courseId: string): Promise<{
  courseRow: typeof courses.$inferSelect;
  courseData: CourseDataForReview;
}> {
  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const [details] = await db
    .select()
    .from(courseDetails)
    .where(eq(courseDetails.courseId, courseId));

  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.position));

  const chapterIds = chapters.map((ch) => ch.id);

  let lessons: Array<typeof courseLessons.$inferSelect> = [];
  if (chapterIds.length > 0) {
    lessons = await db
      .select()
      .from(courseLessons)
      .where(inArray(courseLessons.chapterId, chapterIds))
      .orderBy(asc(courseLessons.position));
  }

  const lessonIds = lessons.map((l) => l.id);

  // Lesson materials
  let materials: Array<typeof lessonMaterials.$inferSelect> = [];
  if (lessonIds.length > 0) {
    materials = await db
      .select()
      .from(lessonMaterials)
      .where(inArray(lessonMaterials.lessonId, lessonIds));
  }

  // Assessments for course
  const courseAssessments = await db
    .select()
    .from(assessments)
    .where(eq(assessments.courseId, courseId));

  const entryAssessment = courseAssessments.find((a) => a.isDiagnostic);
  const assessmentIds = courseAssessments.map((a) => a.id);

  // Quiz questions
  let questions: Array<typeof quizQuestions.$inferSelect> = [];
  if (assessmentIds.length > 0) {
    questions = await db
      .select()
      .from(quizQuestions)
      .where(inArray(quizQuestions.assessmentId, assessmentIds))
      .orderBy(asc(quizQuestions.position));
  }

  // Coding exercises and test cases
  const codingAssessmentIds = courseAssessments
    .filter((a) => a.type === "coding")
    .map((a) => a.id);

  let exercises: Array<typeof codingExercises.$inferSelect> = [];
  let testCases: Array<typeof codingTestCases.$inferSelect> = [];

  if (codingAssessmentIds.length > 0) {
    exercises = await db
      .select()
      .from(codingExercises)
      .where(inArray(codingExercises.assessmentId, codingAssessmentIds));

    const exIds = exercises.map((e) => e.id);
    if (exIds.length > 0) {
      testCases = await db
        .select()
        .from(codingTestCases)
        .where(inArray(codingTestCases.exerciseId, exIds))
        .orderBy(asc(codingTestCases.position));
    }
  }

  // Transform into CourseDataForReview
  const transformedChapters = chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    lessons: lessons
      .filter((l) => l.chapterId === ch.id)
      .map((l) => {
        const lMaterials = materials.filter((m) => m.lessonId === l.id);
        const lQuizAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "quiz"
        );
        const lCodingAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "coding"
        );
        const lAssignmentAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "assignment"
        );

        let quizObj = null;
        if (lQuizAssessment) {
          const qList = questions.filter((q) => q.assessmentId === lQuizAssessment.id);
          quizObj = {
            id: lQuizAssessment.id,
            passingScore: lQuizAssessment.passingScore,
            questions: qList.map((q) => ({
              id: q.id,
              text: q.text,
              explanation: q.explanation,
              options: [],
              aiGenerated: false,
              aiReviewed: true,
            })),
          };
        }

        let codeObj = null;
        if (lCodingAssessment) {
          const ex = exercises.find((e) => e.assessmentId === lCodingAssessment.id);
          const tests = ex ? testCases.filter((t) => t.exerciseId === ex.id) : [];
          codeObj = {
            kind: "challenge" as const,
            tests: tests.map((t) => ({
              id: t.id,
              name: t.name,
              call: t.input || "",
              hidden: !t.isSample,
            })),
            solutionCheck: {
              ok: tests.length > 0 && !!ex?.solutionVerifiedAt,
              passed: tests.length,
              total: tests.length,
            },
          };
        }

        let assignmentObj = null;
        if (lAssignmentAssessment) {
          let rubric: any[] = [];
          if (lAssignmentAssessment.rubric) {
            try {
              rubric = typeof lAssignmentAssessment.rubric === "string"
                ? JSON.parse(lAssignmentAssessment.rubric)
                : (lAssignmentAssessment.rubric as any);
            } catch {
              rubric = [];
            }
          }
          assignmentObj = {
            instructions: lAssignmentAssessment.instructions || "",
            rubric: Array.isArray(rubric) ? rubric : [],
          };
        }

        return {
          id: l.id,
          title: l.title,
          type: lMaterials.length > 0 ? lMaterials[0].type : "reading",
          durationSeconds: l.durationSeconds,
          body: l.body,
          materials: lMaterials.map((m) => ({
            id: m.id,
            type: m.type,
            title: m.title,
            url: m.url,
            fileName: m.title || m.url,
          })),
          quiz: quizObj,
          code: codeObj,
          assignment: assignmentObj,
        };
      }),
  }));

  const entryQuestions = entryAssessment
    ? questions.filter((q) => q.assessmentId === entryAssessment.id)
    : [];

  const courseData: CourseDataForReview = {
    id: courseRow.id,
    title: courseRow.title,
    description: courseRow.description,
    summary: courseRow.description,
    category: courseRow.category,
    level: courseRow.level,
    price: courseRow.price,
    proposedPrice: courseRow.price,
    knowledgeMapStatus: courseRow.knowledgeMapStatus,
    chapters: transformedChapters,
    entryTest: entryAssessment
      ? {
          questions: entryQuestions.map((q) => ({
            id: q.id,
            text: q.text,
            explanation: q.explanation,
            options: [],
            aiGenerated: false,
            aiReviewed: true,
          })),
        }
      : null,
  };

  return { courseRow, courseData };
}

/**
 * Loads publication data for lecturer publish tab (S25).
 */
export async function getPublicationData(courseId: string): Promise<PublicationDataDto> {
  const userSession = await verifyLecturerSession();

  const { courseRow, courseData } = await fetchCourseDataForReview(courseId);

  if (courseRow.instructorId !== userSession.id) {
    throw new Error("Không có quyền truy cập khoá học này.");
  }

  const readiness = checkReadiness(courseData);

  // Load latest review round for this course
  const [latestRequest] = await db
    .select()
    .from(coursePublicationRequests)
    .where(eq(coursePublicationRequests.courseId, courseId))
    .orderBy(desc(coursePublicationRequests.round))
    .limit(1);

  let roundDto: ReviewRoundDto | null = null;

  if (latestRequest) {
    const criteriaRows = await db
      .select()
      .from(publicationReviewCriteria)
      .where(eq(publicationReviewCriteria.requestId, latestRequest.id));

    const flagsRows = await db
      .select()
      .from(publicationReviewFlags)
      .where(eq(publicationReviewFlags.requestId, latestRequest.id))
      .orderBy(
        asc(
          sql`CASE 
            WHEN ${publicationReviewFlags.status} = 'open' THEN 1 
            WHEN ${publicationReviewFlags.status} = 'fixed' THEN 2 
            ELSE 3 
          END`
        ),
        asc(
          sql`CASE 
            WHEN ${publicationReviewFlags.severity} = 'must' THEN 1 
            ELSE 2 
          END`
        ),
        asc(publicationReviewFlags.id)
      );

    const criteriaMap: Record<string, { status: any; note?: string | null }> = {};
    for (const c of CRITERIA) {
      const row = criteriaRows.find((r) => r.criterionId === c.id);
      criteriaMap[c.id] = {
        status: row?.status || null,
        note: row?.note || null,
      };
    }

    const flags: ReviewFlagDto[] = flagsRows.map((f) => ({
      id: f.id,
      requestId: f.requestId,
      targetType: f.targetType,
      lessonId: f.lessonId,
      targetLabel: f.targetLabel,
      target: {
        type: f.targetType,
        lessonId: f.lessonId,
        label: f.targetLabel,
      },
      severity: f.severity as any,
      comment: f.comment,
      status: f.status as any,
      lecturerReply: f.lecturerReply,
      reply: f.lecturerReply,
      source: f.source as any,
      carriedFromFlagId: f.carriedFromFlagId,
      carried: !!f.carriedFromFlagId,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));

    roundDto = {
      id: latestRequest.id,
      courseId: latestRequest.courseId,
      round: latestRequest.round,
      status: latestRequest.status as any,
      requestedBy: latestRequest.requestedBy,
      reviewedBy: latestRequest.reviewedBy,
      validationStatus: latestRequest.validationStatus,
      reviewNote: latestRequest.reviewNote,
      approvedPrice: latestRequest.approvedPrice,
      requestedAt: latestRequest.requestedAt.toISOString(),
      reviewedAt: latestRequest.reviewedAt ? latestRequest.reviewedAt.toISOString() : null,
      criteria: criteriaMap,
      flags,
    };
  }

  return {
    course: {
      id: courseRow.id,
      title: courseRow.title,
      summary: courseRow.description,
      description: courseRow.description,
      status: courseRow.status,
      price: courseRow.price,
      proposedPrice: courseRow.price,
      rejectReason: latestRequest?.reviewNote || null,
      reviewOutcome:
        latestRequest?.status === "changes_requested"
          ? "changes"
          : latestRequest?.status === "rejected"
            ? "rejected"
            : null,
      publishedAt: courseRow.publishedAt ? courseRow.publishedAt.toISOString() : null,
      hiddenReason: courseRow.hiddenReason,
      knowledgeMapStatus: courseRow.knowledgeMapStatus,
    },
    readiness,
    round: roundDto,
    isLocked: courseRow.status === "pending",
  };
}

/**
 * Lecturer action: tc-submit.
 * Guard: readiness(c) all ok.
 * Transitions course.status -> pending, opens round in_review, carries flags.
 */
export async function submitCourseForPublication(courseId: string): Promise<{ success: boolean }> {
  const userSession = await verifyLecturerSession();

  const { courseRow, courseData } = await fetchCourseDataForReview(courseId);

  if (courseRow.instructorId !== userSession.id) {
    throw new Error("Không có quyền yêu cầu xuất bản khoá học này.");
  }

  if (!["draft", "rejected"].includes(courseRow.status)) {
    throw new Error(`Không thể gửi yêu cầu xuất bản khi khoá học đang ở trạng thái "${courseRow.status}".`);
  }

  const readiness = checkReadiness(courseData);
  if (!readiness.allOk) {
    const missing = readiness.items.filter((i) => !i.ok).map((i) => i.label);
    throw new Error(`Chưa đủ điều kiện xuất bản: ${missing.join(", ")}.`);
  }

  await db.transaction(async (tx) => {
    // 1. Fetch latest round to determine round number and carried items
    const [prevRequest] = await tx
      .select()
      .from(coursePublicationRequests)
      .where(eq(coursePublicationRequests.courseId, courseId))
      .orderBy(desc(coursePublicationRequests.round))
      .limit(1);

    const nextRound = prevRequest ? prevRequest.round + 1 : 1;

    // 2. Insert new publication request
    const [newRequest] = await tx
      .insert(coursePublicationRequests)
      .values({
        courseId,
        round: nextRound,
        requestedBy: userSession.id,
        validationStatus: "passed",
        validationNote: "Đã vượt qua tất cả điều kiện kiểm tra tự động.",
        validatedAt: new Date(),
        status: "in_review",
        requestedAt: new Date(),
      })
      .returning({ id: coursePublicationRequests.id });

    // 3. Carry forward criteria and unclosed flags if resubmitting
    if (prevRequest) {
      const prevCriteria = await tx
        .select()
        .from(publicationReviewCriteria)
        .where(eq(publicationReviewCriteria.requestId, prevRequest.id));

      if (prevCriteria.length > 0) {
        await tx.insert(publicationReviewCriteria).values(
          prevCriteria.map((c) => ({
            requestId: newRequest.id,
            criterionId: c.criterionId,
            status: c.status,
            note: c.note,
          }))
        );
      }

      // Carry over flags that are NOT closed (open or fixed)
      const prevFlags = await tx
        .select()
        .from(publicationReviewFlags)
        .where(
          and(
            eq(publicationReviewFlags.requestId, prevRequest.id),
            sql`${publicationReviewFlags.status} <> 'closed'`
          )
        );

      if (prevFlags.length > 0) {
        await tx.insert(publicationReviewFlags).values(
          prevFlags.map((f) => ({
            requestId: newRequest.id,
            targetType: f.targetType,
            lessonId: f.lessonId,
            targetLabel: f.targetLabel,
            severity: f.severity,
            comment: f.comment,
            status: f.status,
            lecturerReply: f.lecturerReply,
            source: f.source,
            carriedFromFlagId: f.id,
          }))
        );
      }
    }

    // 4. Update course status to pending
    await tx
      .update(courses)
      .set({
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    // 5. Notify all active admins
    const activeAdmins = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(user, eq(userRoles.userId, user.id))
      .where(
        and(
          eq(userRoles.roleId, ROLE.ADMIN),
          isNull(userRoles.revokedAt),
          eq(user.banned, false)
        )
      );

    for (const admin of activeAdmins) {
      await tx.insert(notifications).values({
        userId: admin.userId,
        title: nextRound === 1 ? "Yêu cầu xuất bản mới" : `Gửi lại sau góp ý (lần ${nextRound})`,
        body: `Khoá học "${courseRow.title}" đã được gửi để duyệt xuất bản (vòng ${nextRound}).`,
        link: `/dashboard/admin/publication?tab=pending&id=${courseId}`,
      });
    }
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  revalidatePath(`/dashboard/admin/publication`);
  return { success: true };
}

/**
 * Lecturer marks a review flag as fixed with an explanation.
 */
export async function markFlagFixed(
  courseId: string,
  flagId: number,
  reply: string
): Promise<{ success: boolean }> {
  const userSession = await verifyLecturerSession();

  const trimmedReply = (reply || "").trim();
  if (trimmedReply.length < 5) {
    throw new Error("Vui lòng ghi rõ bạn đã chỉnh sửa nội dung gì (ít nhất 5 ký tự).");
  }

  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow || courseRow.instructorId !== userSession.id) {
    throw new Error("Không có quyền chỉnh sửa khoá học này.");
  }

  const [flag] = await db
    .select()
    .from(publicationReviewFlags)
    .where(eq(publicationReviewFlags.id, flagId));

  if (!flag) {
    throw new Error("Không tìm thấy góp ý này.");
  }

  await db
    .update(publicationReviewFlags)
    .set({
      status: "fixed",
      lecturerReply: trimmedReply,
      updatedAt: new Date(),
    })
    .where(eq(publicationReviewFlags.id, flagId));

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Lecturer reopens a review flag previously marked as fixed.
 */
export async function reopenFlag(
  courseId: string,
  flagId: number
): Promise<{ success: boolean }> {
  const userSession = await verifyLecturerSession();

  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow || courseRow.instructorId !== userSession.id) {
    throw new Error("Không có quyền chỉnh sửa khoá học này.");
  }

  await db
    .update(publicationReviewFlags)
    .set({
      status: "open",
      lecturerReply: null,
      updatedAt: new Date(),
    })
    .where(eq(publicationReviewFlags.id, flagId));

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}
