"use server";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireRole, ROLE } from "@codi-1/auth";
import {
  courseDetails,
  coursePublicationRequests,
  courses,
  notifications,
  publicationReviewCriteria,
  publicationReviewFlags,
  user,
} from "@codi-1/db";
import {
  autoCriteria,
  canApprove,
  CRITERIA,
  type AutoCriterionResult,
  type CourseDataForReview,
  type ReviewCriterionId,
  type ReviewCriterionStatus,
  type ReviewFlagDto,
  type ReviewFlagSeverity,
  type ReviewFlagStatus,
  type ReviewRoundDto,
} from "@/lib/publication-service";
import { auth, db } from "@/services";
import { fetchCourseDataForReview } from "../../lecturer/courses/[courseId]/publish/actions";

/**
 * Ensures session caller has active ADMIN role.
 */
async function verifyAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Vui lòng đăng nhập.");
  }
  await requireRole(db, session.user.id, ROLE.ADMIN);
  return session.user;
}

export interface AdminQueueItemDto {
  id: string;
  title: string;
  instructorId: string | null;
  instructorName: string;
  category: string;
  level: string;
  price: number;
  status: string;
  round: number;
  openFlagsCount: number;
  submittedAt: string;
}

export interface AdminPublicationQueueDto {
  tab: "pending" | "changes" | "approved";
  counts: {
    pending: number;
    changes: number;
    approved: number;
  };
  items: AdminQueueItemDto[];
}

/**
 * Returns courses in the review queue split by status tab.
 */
export async function getAdminPublicationQueue(
  activeTab: "pending" | "changes" | "approved" = "pending"
): Promise<AdminPublicationQueueDto> {
  await verifyAdminSession();

  // 1. Fetch count totals for the 3 tabs
  const [pendingCountRow] = await db
    .select({ count: count() })
    .from(courses)
    .where(eq(courses.status, "pending"));

  const [changesCountRow] = await db
    .select({ count: count() })
    .from(courses)
    .where(eq(courses.status, "rejected"));

  const [approvedCountRow] = await db
    .select({ count: count() })
    .from(courses)
    .where(inArray(courses.status, ["published", "hidden"]));

  const counts = {
    pending: Number(pendingCountRow?.count || 0),
    changes: Number(changesCountRow?.count || 0),
    approved: Number(approvedCountRow?.count || 0),
  };

  // 2. Fetch courses for active tab
  const statusCondition =
    activeTab === "pending"
      ? eq(courses.status, "pending")
      : activeTab === "changes"
        ? eq(courses.status, "rejected")
        : inArray(courses.status, ["published", "hidden"]);

  const courseList = await db
    .select({
      id: courses.id,
      title: courses.title,
      instructorId: courses.instructorId,
      instructorName: user.name,
      category: courses.category,
      level: courses.level,
      price: courses.price,
      status: courses.status,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .leftJoin(user, eq(courses.instructorId, user.id))
    .where(statusCondition)
    .orderBy(desc(courses.updatedAt));

  const courseIds = courseList.map((c) => c.id);

  // 3. For each course, fetch latest request to get round and open flags count
  let latestRequests: Array<typeof coursePublicationRequests.$inferSelect> = [];
  let flags: Array<{ requestId: number; status: string }> = [];

  if (courseIds.length > 0) {
    latestRequests = await db
      .select()
      .from(coursePublicationRequests)
      .where(inArray(coursePublicationRequests.courseId, courseIds))
      .orderBy(desc(coursePublicationRequests.round));

    const requestIds = latestRequests.map((r) => r.id);
    if (requestIds.length > 0) {
      flags = await db
        .select({
          requestId: publicationReviewFlags.requestId,
          status: publicationReviewFlags.status,
        })
        .from(publicationReviewFlags)
        .where(inArray(publicationReviewFlags.requestId, requestIds));
    }
  }

  const items: AdminQueueItemDto[] = courseList.map((c) => {
    // Newest request for this course
    const req = latestRequests.find((r) => r.courseId === c.id);
    const reqFlags = req ? flags.filter((f) => f.requestId === req.id) : [];
    const openFlags = reqFlags.filter((f) => f.status !== "closed").length;

    return {
      id: c.id,
      title: c.title,
      instructorId: c.instructorId,
      instructorName: c.instructorName || "Giảng viên",
      category: c.category,
      level: c.level,
      price: c.price,
      status: c.status,
      round: req?.round || 1,
      openFlagsCount: openFlags,
      submittedAt: (req?.requestedAt || c.updatedAt).toISOString(),
    };
  });

  return {
    tab: activeTab,
    counts,
    items,
  };
}

export interface AdminCourseReviewDetailDto {
  course: CourseDataForReview;
  instructor: {
    id: string;
    name: string;
    email: string;
  } | null;
  details: {
    learningOutcomes: string[];
    requirements: string[];
    targetAudience: string | null;
  };
  round: ReviewRoundDto;
  roundsHistory: Array<{
    id: number;
    round: number;
    status: string;
    requestedAt: string;
    reviewedAt: string | null;
    note: string | null;
    flagsCount: number;
    closedFlagsCount: number;
  }>;
  autoCriteria: Record<ReviewCriterionId, AutoCriterionResult>;
  blockingReasons: string[];
}

/**
 * Loads full review detail for a course in the admin review screen (S32).
 */
export async function getAdminCourseReview(
  courseId: string
): Promise<AdminCourseReviewDetailDto> {
  const adminUser = await verifyAdminSession();

  const { courseRow, courseData } = await fetchCourseDataForReview(courseId);

  // Instructor info
  let instructor = null;
  if (courseRow.instructorId) {
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, courseRow.instructorId));
    if (u) instructor = u;
  }

  // Course details (learning outcomes & requirements)
  const [details] = await db
    .select()
    .from(courseDetails)
    .where(eq(courseDetails.courseId, courseId));

  // Find or ensure round
  const allRequests = await db
    .select()
    .from(coursePublicationRequests)
    .where(eq(coursePublicationRequests.courseId, courseId))
    .orderBy(desc(coursePublicationRequests.round));

  let activeRequest = allRequests[0];

  // If course is pending and has no in_review round, open one
  if (courseRow.status === "pending" && (!activeRequest || activeRequest.status !== "in_review")) {
    const nextRound = activeRequest ? activeRequest.round + 1 : 1;
    const [inserted] = await db
      .insert(coursePublicationRequests)
      .values({
        courseId,
        round: nextRound,
        requestedBy: courseRow.instructorId || adminUser.id,
        status: "in_review",
        validationStatus: "passed",
        validationNote: "Vòng duyệt được khởi tạo cho quản trị viên",
        requestedAt: new Date(),
      })
      .returning();

    activeRequest = inserted;

    // Carry forward criteria & open flags from prev round
    if (allRequests[0]) {
      const prevCriteria = await db
        .select()
        .from(publicationReviewCriteria)
        .where(eq(publicationReviewCriteria.requestId, allRequests[0].id));

      if (prevCriteria.length > 0) {
        await db.insert(publicationReviewCriteria).values(
          prevCriteria.map((c) => ({
            requestId: activeRequest.id,
            criterionId: c.criterionId,
            status: c.status,
            note: c.note,
          }))
        );
      }

      const prevFlags = await db
        .select()
        .from(publicationReviewFlags)
        .where(
          and(
            eq(publicationReviewFlags.requestId, allRequests[0].id),
            sql`${publicationReviewFlags.status} <> 'closed'`
          )
        );

      if (prevFlags.length > 0) {
        await db.insert(publicationReviewFlags).values(
          prevFlags.map((f) => ({
            requestId: activeRequest.id,
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
  }

  // Load criteria and flags for the active round
  const criteriaRows = await db
    .select()
    .from(publicationReviewCriteria)
    .where(eq(publicationReviewCriteria.requestId, activeRequest.id));

  const criteriaMap: Record<string, { status: any; note?: string | null }> = {};
  for (const c of CRITERIA) {
    const row = criteriaRows.find((r) => r.criterionId === c.id);
    criteriaMap[c.id] = {
      status: row?.status || null,
      note: row?.note || null,
    };
  }

  const flagsRows = await db
    .select()
    .from(publicationReviewFlags)
    .where(eq(publicationReviewFlags.requestId, activeRequest.id))
    .orderBy(
      asc(
        sql`CASE 
          WHEN ${publicationReviewFlags.status} = 'closed' THEN 2 
          ELSE 1 
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

  const roundDto: ReviewRoundDto = {
    id: activeRequest.id,
    courseId: activeRequest.courseId,
    round: activeRequest.round,
    status: activeRequest.status as any,
    requestedBy: activeRequest.requestedBy,
    reviewedBy: activeRequest.reviewedBy,
    validationStatus: activeRequest.validationStatus,
    reviewNote: activeRequest.reviewNote,
    approvedPrice: activeRequest.approvedPrice,
    requestedAt: activeRequest.requestedAt.toISOString(),
    reviewedAt: activeRequest.reviewedAt ? activeRequest.reviewedAt.toISOString() : null,
    criteria: criteriaMap,
    flags,
  };

  // Rounds history
  const allRequestIds = allRequests.map((r) => r.id);
  let allFlags: Array<{ requestId: number; status: string }> = [];
  if (allRequestIds.length > 0) {
    allFlags = await db
      .select({
        requestId: publicationReviewFlags.requestId,
        status: publicationReviewFlags.status,
      })
      .from(publicationReviewFlags)
      .where(inArray(publicationReviewFlags.requestId, allRequestIds));
  }

  const roundsHistory = allRequests.map((r) => {
    const rFlags = allFlags.filter((f) => f.requestId === r.id);
    return {
      id: r.id,
      round: r.round,
      status: r.status,
      requestedAt: r.requestedAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      note: r.reviewNote,
      flagsCount: rFlags.length,
      closedFlagsCount: rFlags.filter((f) => f.status === "closed").length,
    };
  });

  const auto = autoCriteria(courseData);
  const blockingReasons = canApprove(roundDto);

  return {
    course: courseData,
    instructor,
    details: {
      learningOutcomes: details?.learningOutcomes || [],
      requirements: details?.requirements || [],
      targetAudience: details?.targetAudience || null,
    },
    round: roundDto,
    roundsHistory,
    autoCriteria: auto,
    blockingReasons,
  };
}

/**
 * Saves or toggles status/note for a specific review criterion.
 */
export async function saveCriterionVerdict(
  requestId: number,
  criterionId: ReviewCriterionId,
  status: ReviewCriterionStatus | null,
  note?: string | null
): Promise<{ success: boolean }> {
  await verifyAdminSession();

  if (!status) {
    // Delete criterion row to leave it unmarked
    await db
      .delete(publicationReviewCriteria)
      .where(
        and(
          eq(publicationReviewCriteria.requestId, requestId),
          eq(publicationReviewCriteria.criterionId, criterionId)
        )
      );
  } else {
    await db
      .insert(publicationReviewCriteria)
      .values({
        requestId,
        criterionId,
        status,
        note: note ? note.trim() : null,
      })
      .onConflictDoUpdate({
        target: [
          publicationReviewCriteria.requestId,
          publicationReviewCriteria.criterionId,
        ],
        set: {
          status,
          note: note !== undefined ? (note ? note.trim() : null) : undefined,
        },
      });
  }

  return { success: true };
}

/**
 * Fills unmarked criteria using autoCriteria suggestions (rv-crit-auto).
 */
export async function applyAutoCriteria(
  requestId: number,
  courseId: string
): Promise<{ success: boolean; appliedCount: number }> {
  await verifyAdminSession();

  const { courseData } = await fetchCourseDataForReview(courseId);
  const auto = autoCriteria(courseData);

  const existingCriteria = await db
    .select()
    .from(publicationReviewCriteria)
    .where(eq(publicationReviewCriteria.requestId, requestId));

  const existingMap = new Set(
    existingCriteria.filter((c) => !!c.status).map((c) => c.criterionId)
  );

  let appliedCount = 0;
  for (const c of CRITERIA) {
    if (!existingMap.has(c.id)) {
      const suggestion = auto[c.id];
      if (suggestion && suggestion.status) {
        await db
          .insert(publicationReviewCriteria)
          .values({
            requestId,
            criterionId: c.id,
            status: suggestion.status,
            note: suggestion.status === "fix" ? suggestion.why : null,
          })
          .onConflictDoUpdate({
            target: [
              publicationReviewCriteria.requestId,
              publicationReviewCriteria.criterionId,
            ],
            set: {
              status: suggestion.status,
              note: suggestion.status === "fix" ? suggestion.why : null,
            },
          });
        appliedCount++;
      }
    }
  }

  revalidatePath(`/dashboard/admin/publication`);
  return { success: true, appliedCount };
}

/**
 * Adds a new review flag (rv-flag-save).
 */
export async function addReviewFlag(
  courseId: string,
  requestId: number,
  input: {
    targetType: string;
    lessonId?: string | null;
    targetLabel: string;
    severity: ReviewFlagSeverity;
    comment: string;
    source?: "admin" | "ai";
  }
): Promise<{ success: boolean; flagId: number }> {
  await verifyAdminSession();

  const trimmedComment = (input.comment || "").trim();
  if (trimmedComment.length < 10) {
    throw new Error("Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.");
  }

  const [inserted] = await db
    .insert(publicationReviewFlags)
    .values({
      requestId,
      targetType: input.targetType,
      lessonId: input.lessonId || null,
      targetLabel: input.targetLabel,
      severity: input.severity,
      comment: trimmedComment,
      status: "open",
      source: input.source || "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: publicationReviewFlags.id });

  revalidatePath(`/dashboard/admin/publication`);
  return { success: true, flagId: inserted.id };
}

/**
 * Updates status of a flag (open <-> closed).
 */
export async function updateFlagStatus(
  flagId: number,
  status: ReviewFlagStatus
): Promise<{ success: boolean }> {
  await verifyAdminSession();

  await db
    .update(publicationReviewFlags)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(publicationReviewFlags.id, flagId));

  revalidatePath(`/dashboard/admin/publication`);
  return { success: true };
}

/**
 * Deletes a review flag.
 */
export async function deleteReviewFlag(flagId: number): Promise<{ success: boolean }> {
  await verifyAdminSession();

  await db
    .delete(publicationReviewFlags)
    .where(eq(publicationReviewFlags.id, flagId));

  revalidatePath(`/dashboard/admin/publication`);
  return { success: true };
}

/**
 * Admin action: rv-approve.
 * Guard: canApprove(round) is empty.
 * Sets course.status = published, sets price, notifies lecturer.
 */
export async function approvePublication(
  courseId: string,
  requestId: number,
  approvedPrice: number
): Promise<{ success: boolean }> {
  const adminUser = await verifyAdminSession();

  if (typeof approvedPrice !== "number" || approvedPrice < 0 || !Number.isInteger(approvedPrice)) {
    throw new Error("Giá bán phải là số nguyên không âm (VND). Nhập 0 cho khoá miễn phí.");
  }

  const [request] = await db
    .select()
    .from(coursePublicationRequests)
    .where(eq(coursePublicationRequests.id, requestId));

  if (!request) {
    throw new Error("Không tìm thấy yêu cầu xuất bản.");
  }

  const criteriaRows = await db
    .select()
    .from(publicationReviewCriteria)
    .where(eq(publicationReviewCriteria.requestId, requestId));

  const flagsRows = await db
    .select()
    .from(publicationReviewFlags)
    .where(eq(publicationReviewFlags.requestId, requestId));

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
    severity: f.severity as any,
    status: f.status as any,
    targetLabel: f.targetLabel,
    comment: f.comment,
    source: f.source as any,
  }));

  const blockingReasons = canApprove({ criteria: criteriaMap, flags });
  if (blockingReasons.length > 0) {
    throw new Error(`Chưa đủ điều kiện duyệt: ${blockingReasons.join("; ")}`);
  }

  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Update publication request
    await tx
      .update(coursePublicationRequests)
      .set({
        status: "approved",
        reviewedBy: adminUser.id,
        reviewedAt: now,
        approvedPrice,
      })
      .where(eq(coursePublicationRequests.id, requestId));

    // 2. Update course
    await tx
      .update(courses)
      .set({
        status: "published",
        price: approvedPrice,
        priceUpdatedBy: adminUser.id,
        priceUpdatedAt: now,
        publishedAt: now,
        hiddenReason: null,
        updatedAt: now,
      })
      .where(eq(courses.id, courseId));

    // 3. Notify lecturer
    if (courseRow.instructorId) {
      const priceText = approvedPrice > 0 ? `${approvedPrice.toLocaleString("vi-VN")} đ` : "Miễn phí";
      await tx.insert(notifications).values({
        userId: courseRow.instructorId,
        title: "Khoá học đã được duyệt",
        body: `"${courseRow.title}" đã được duyệt và xuất bản với giá ${priceText}.`,
        link: `/dashboard/lecturer/courses/${courseId}/publish`,
      });
    }
  });

  revalidatePath(`/dashboard/admin/publication`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Admin action: rv-request (Yêu cầu sửa).
 * Guard: at least one fix criterion or open flag. Reason required.
 */
export async function requestChanges(
  courseId: string,
  requestId: number,
  reason: string
): Promise<{ success: boolean }> {
  const adminUser = await verifyAdminSession();

  const trimmedReason = (reason || "").trim();
  if (trimmedReason.length < 5) {
    throw new Error("Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).");
  }

  const criteriaRows = await db
    .select()
    .from(publicationReviewCriteria)
    .where(eq(publicationReviewCriteria.requestId, requestId));

  const flagsRows = await db
    .select()
    .from(publicationReviewFlags)
    .where(eq(publicationReviewFlags.requestId, requestId));

  const fixes = criteriaRows.filter((c) => c.status === "fix");
  const openFlags = flagsRows.filter((f) => f.status !== "closed");

  if (fixes.length === 0 && openFlags.length === 0) {
    throw new Error("Chưa có tiêu chí 'Cần sửa' hay cờ nào để gửi. Vui lòng chấm tiêu chí hoặc gắn cờ trước khi yêu cầu sửa.");
  }

  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Update publication request
    await tx
      .update(coursePublicationRequests)
      .set({
        status: "changes_requested",
        reviewedBy: adminUser.id,
        reviewedAt: now,
        reviewNote: trimmedReason,
      })
      .where(eq(coursePublicationRequests.id, requestId));

    // 2. Update course status to rejected
    await tx
      .update(courses)
      .set({
        status: "rejected",
        updatedAt: now,
      })
      .where(eq(courses.id, courseId));

    // 3. Notify lecturer
    if (courseRow.instructorId) {
      await tx.insert(notifications).values({
        userId: courseRow.instructorId,
        title: "Khoá học cần chỉnh sửa",
        body: `"${courseRow.title}": Quản trị viên yêu cầu sửa: ${trimmedReason}`,
        link: `/dashboard/lecturer/courses/${courseId}/publish`,
      });
    }
  });

  revalidatePath(`/dashboard/admin/publication`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

/**
 * Admin action: rv-reject (Từ chối).
 * Guard: reason required.
 */
export async function rejectPublication(
  courseId: string,
  requestId: number,
  reason: string
): Promise<{ success: boolean }> {
  const adminUser = await verifyAdminSession();

  const trimmedReason = (reason || "").trim();
  if (trimmedReason.length < 5) {
    throw new Error("Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).");
  }

  const [courseRow] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Update publication request
    await tx
      .update(coursePublicationRequests)
      .set({
        status: "rejected",
        reviewedBy: adminUser.id,
        reviewedAt: now,
        reviewNote: trimmedReason,
      })
      .where(eq(coursePublicationRequests.id, requestId));

    // 2. Update course status to rejected
    await tx
      .update(courses)
      .set({
        status: "rejected",
        updatedAt: now,
      })
      .where(eq(courses.id, courseId));

    // 3. Notify lecturer
    if (courseRow.instructorId) {
      await tx.insert(notifications).values({
        userId: courseRow.instructorId,
        title: "Khoá học bị từ chối",
        body: `"${courseRow.title}": ${trimmedReason}`,
        link: `/dashboard/lecturer/courses/${courseId}/publish`,
      });
    }
  });

  revalidatePath(`/dashboard/admin/publication`);
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}
