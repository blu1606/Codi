"use server";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ROLE } from "@codi-1/auth";
import {
  coursePublicationRequests,
  courses,
  publicationReviewCriteria,
  publicationReviewFlags,
  user,
  userRoles,
} from "@codi-1/db";
import {
  checkReadiness,
  CRITERIA,
  type ReadinessResult,
  type ReviewFlagDto,
  type ReviewRoundDto,
} from "@/lib/publication-service";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { fetchCourseDataForReview } from "@/lib/publication-course-data";
import { publicationCourseTransaction, requirePublicationClaim, type PublicationContext } from "@/lib/publication-store";

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
      proposedPrice: (courseRow as any).proposedPrice ?? courseRow.price,
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
  await publicationCourseTransaction(courseId, ROLE.LECTURER, async context => {
    const { tx, course: courseRow, request: prevRequest, actorId, notify } = context;
    if (!["draft", "rejected"].includes(courseRow.status) || prevRequest?.status === "in_review")
      throw new Error(`Không thể gửi yêu cầu xuất bản khi khoá học đang ở trạng thái "${courseRow.status}".`);
    const { courseData } = await fetchCourseDataForReview(courseId, tx);
    const readiness = checkReadiness(courseData);
    if (!readiness.allOk)
      throw new Error(`Chưa đủ điều kiện xuất bản: ${readiness.items.filter(i => !i.ok).map(i => i.label).join(", ")}.`);

    const nextRound = prevRequest ? prevRequest.round + 1 : 1;

    // 2. Insert new publication request
    const [newRequest] = await tx
      .insert(coursePublicationRequests)
      .values({
        courseId,
        round: nextRound,
        requestedBy: actorId,
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
    const claimed = await tx
      .update(courses)
      .set({
        status: "pending",
        updatedAt: new Date(),
      })
      .where(and(eq(courses.id, courseId), eq(courses.status, courseRow.status)))
      .returning({ id: courses.id });
    requirePublicationClaim(claimed);

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
      notify({
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

function requireReturnedRound(context: PublicationContext) {
  if (context.course.status !== "rejected" || !context.request || !["changes_requested", "rejected"].includes(context.request.status))
    throw new Error("Chỉ có thể phản hồi góp ý của vòng mới nhất đã trả về để chỉnh sửa.");
  return context.request;
}

export async function markFlagFixed(courseId: string, flagId: number, reply: string): Promise<{ success: boolean }> {
  const trimmedReply = (reply || "").trim();
  if (trimmedReply.length < 5) throw new Error("Vui lòng ghi rõ bạn đã chỉnh sửa nội dung gì (ít nhất 5 ký tự).");
  await changeLecturerFlag(courseId, flagId, "open", "fixed", trimmedReply);
  return { success: true };
}

export async function reopenFlag(courseId: string, flagId: number): Promise<{ success: boolean }> {
  await changeLecturerFlag(courseId, flagId, "fixed", "open", null);
  return { success: true };
}

async function changeLecturerFlag(
  courseId: string, flagId: number, from: "open" | "fixed", to: "fixed" | "open", reply: string | null,
) {
  await publicationCourseTransaction(courseId, ROLE.LECTURER, async context => {
    const request = requireReturnedRound(context);
    const changed = await context.tx.update(publicationReviewFlags).set({
      status: to, lecturerReply: reply, updatedAt: new Date(),
    }).where(and(eq(publicationReviewFlags.id, flagId), eq(publicationReviewFlags.requestId, request.id),
      eq(publicationReviewFlags.status, from))).returning({ id: publicationReviewFlags.id });
    requirePublicationClaim(changed);
  });
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
}
