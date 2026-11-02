"use server";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireRole, ROLE } from "@codi-1/auth";
import {
  courseDetails,
  coursePublicationRequests,
  courses,
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
import { fetchCourseDataForReview } from "@/lib/publication-course-data";
import { publicationCourseTransaction, publicationRequestTransaction, publicationFlagTransaction, requireActivePublication, requirePublicationClaim } from "@/lib/publication-store";

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
      submittedAt: (req?.requestedAt || c.updatedAt || new Date()).toISOString(),
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
  await verifyAdminSession();

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

  const activeRequest = allRequests[0];

  if (!activeRequest) throw new Error("Khoá học chưa có yêu cầu xuất bản.");

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

export async function saveCriterionVerdict(
  requestId: number, criterionId: ReviewCriterionId, status: ReviewCriterionStatus | null, note?: string | null,
): Promise<{ success: boolean }> {
  if (!CRITERIA.some(c => c.id === criterionId) || (status !== null && !["pass", "fix", "na"].includes(status)))
    throw new Error("Tiêu chí hoặc kết quả không hợp lệ.");
  await publicationRequestTransaction(requestId, async ({ tx }) => {
    if (!status) {
      await tx.delete(publicationReviewCriteria).where(and(eq(publicationReviewCriteria.requestId, requestId),
        eq(publicationReviewCriteria.criterionId, criterionId)));
    } else {
      await tx.insert(publicationReviewCriteria).values({ requestId, criterionId, status, note: note?.trim() || null })
        .onConflictDoUpdate({ target: [publicationReviewCriteria.requestId, publicationReviewCriteria.criterionId],
          set: { status, note: note === undefined ? undefined : note?.trim() || null } });
    }
  });
  revalidatePath("/dashboard/admin/publication");
  return { success: true };
}

export async function applyAutoCriteria(requestId: number, courseId: string): Promise<{ success: boolean; appliedCount: number }> {
  const appliedCount = await publicationRequestTransaction(requestId, async ({ tx, course }) => {
    if (course.id !== courseId) throw new Error("Yêu cầu duyệt không khớp với khoá học.");
    const { courseData } = await fetchCourseDataForReview(courseId, tx);
    const auto = autoCriteria(courseData);
    const existing = await tx.select().from(publicationReviewCriteria).where(eq(publicationReviewCriteria.requestId, requestId));
    let applied = 0;
    for (const criterion of CRITERIA) {
      const suggestion = auto[criterion.id];
      if (!existing.some(c => c.criterionId === criterion.id && c.status) && suggestion.status) {
        await tx.insert(publicationReviewCriteria).values({ requestId, criterionId: criterion.id,
          status: suggestion.status, note: suggestion.status === "fix" ? suggestion.why : null })
          .onConflictDoNothing();
        applied++;
      }
    }
    return applied;
  });
  revalidatePath("/dashboard/admin/publication");
  return { success: true, appliedCount };
}

export async function addReviewFlag(
  courseId: string, requestId: number,
  input: { targetType: string; lessonId?: string | null; targetLabel: string; severity: ReviewFlagSeverity; comment: string; source?: "admin" | "ai" },
): Promise<{ success: boolean; flagId: number }> {
  const comment = (input.comment || "").trim();
  if (comment.length < 10) throw new Error("Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.");
  if (!["must", "should"].includes(input.severity) || !["admin", "ai"].includes(input.source || "admin"))
    throw new Error("Mức độ hoặc nguồn góp ý không hợp lệ.");
  const flagId = await publicationRequestTransaction(requestId, async ({ tx, course }) => {
    if (course.id !== courseId) throw new Error("Yêu cầu duyệt không khớp với khoá học.");
    if (input.lessonId) {
      const { courseData } = await fetchCourseDataForReview(courseId, tx);
      if (!courseData.chapters.some(ch => ch.lessons.some(l => l.id === input.lessonId)))
        throw new Error("Bài học không thuộc khoá học này.");
    }
    const [flag] = await tx.insert(publicationReviewFlags).values({ requestId, targetType: input.targetType,
      lessonId: input.lessonId || null, targetLabel: input.targetLabel, severity: input.severity, comment,
      status: "open", source: input.source || "admin" }).returning({ id: publicationReviewFlags.id });
    return flag.id;
  });
  revalidatePath("/dashboard/admin/publication");
  return { success: true, flagId };
}

export async function updateFlagStatus(flagId: number, status: ReviewFlagStatus): Promise<{ success: boolean }> {
  if (!["open", "closed"].includes(status)) throw new Error("Trạng thái góp ý không hợp lệ.");
  await publicationFlagTransaction(flagId, async ({ tx }, flag) => {
    const changed = await tx.update(publicationReviewFlags).set({ status, updatedAt: new Date() })
      .where(and(eq(publicationReviewFlags.id, flagId), eq(publicationReviewFlags.requestId, flag.requestId),
        eq(publicationReviewFlags.status, flag.status))).returning({ id: publicationReviewFlags.id });
    requirePublicationClaim(changed);
  });
  revalidatePath("/dashboard/admin/publication");
  return { success: true };
}

export async function deleteReviewFlag(flagId: number): Promise<{ success: boolean }> {
  await publicationFlagTransaction(flagId, async ({ tx }, flag) => {
    requirePublicationClaim(await tx.delete(publicationReviewFlags)
      .where(and(eq(publicationReviewFlags.id, flagId), eq(publicationReviewFlags.requestId, flag.requestId)))
      .returning({ id: publicationReviewFlags.id }));
  });
  revalidatePath("/dashboard/admin/publication");
  return { success: true };
}

async function decidePublication(
  courseId: string, requestId: number, decision: "approved" | "changes_requested" | "rejected",
  approvedPrice?: number, reason?: string,
) {
  await publicationCourseTransaction(courseId, ROLE.ADMIN, async context => {
    const { tx, course, actorId, notify } = context;
    requireActivePublication(context, requestId);
    const criteria = await tx.select().from(publicationReviewCriteria).where(eq(publicationReviewCriteria.requestId, requestId));
    const flags = await tx.select().from(publicationReviewFlags).where(eq(publicationReviewFlags.requestId, requestId));
    if (decision === "approved") {
      const map = Object.fromEntries(CRITERIA.map(c => [c.id, {
        status: criteria.find(row => row.criterionId === c.id)?.status || null,
      }]));
      const blocking = canApprove({ criteria: map, flags: flags.map(f => ({
        id: f.id, targetLabel: f.targetLabel, severity: f.severity, comment: f.comment, status: f.status, source: f.source,
      })) });
      if (blocking.length) throw new Error(`Chưa đủ điều kiện duyệt: ${blocking.join("; ")}`);
    } else if (decision === "changes_requested" && !criteria.some(c => c.status === "fix") && !flags.some(f => f.status !== "closed")) {
      throw new Error("Chưa có tiêu chí 'Cần sửa' hay cờ nào để gửi.");
    }
    const now = new Date();
    requirePublicationClaim(await tx.update(coursePublicationRequests).set({
      status: decision, reviewedBy: actorId, reviewedAt: now, reviewNote: reason || null,
      approvedPrice: decision === "approved" ? approvedPrice : null,
    }).where(and(eq(coursePublicationRequests.id, requestId), eq(coursePublicationRequests.courseId, courseId),
      eq(coursePublicationRequests.status, "in_review"))).returning({ id: coursePublicationRequests.id }));
    requirePublicationClaim(await tx.update(courses).set({
      status: decision === "approved" ? "published" : "rejected", updatedAt: now,
      ...(decision === "approved" ? { price: approvedPrice, priceUpdatedBy: actorId, priceUpdatedAt: now,
        publishedAt: course.publishedAt ?? now, hiddenReason: null } : {}),
    }).where(and(eq(courses.id, courseId), eq(courses.status, "pending"))).returning({ id: courses.id }));
    if (course.instructorId) notify({
      userId: course.instructorId,
      title: decision === "approved" ? "Khoá học đã được duyệt" : decision === "changes_requested" ? "Khoá học cần chỉnh sửa" : "Khoá học bị từ chối",
      body: decision === "approved" ? `"${course.title}" đã xuất bản với giá ${approvedPrice} đ.` : `"${course.title}": ${reason}`,
      link: `/dashboard/lecturer/courses/${courseId}/publish`,
    });
  });
  revalidatePath("/dashboard/admin/publication");
  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true };
}

export async function approvePublication(courseId: string, requestId: number, approvedPrice: number): Promise<{ success: boolean }> {
  if (!Number.isSafeInteger(approvedPrice) || approvedPrice < 0 || approvedPrice > 2147483647)
    throw new Error("Giá bán phải là số nguyên không âm (VND), không vượt quá 2.147.483.647.");
  return decidePublication(courseId, requestId, "approved", approvedPrice);
}

export async function requestChanges(courseId: string, requestId: number, reason: string): Promise<{ success: boolean }> {
  if ((reason || "").trim().length < 5) throw new Error("Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).");
  return decidePublication(courseId, requestId, "changes_requested", undefined, reason.trim());
}

export async function rejectPublication(courseId: string, requestId: number, reason: string): Promise<{ success: boolean }> {
  if ((reason || "").trim().length < 5) throw new Error("Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).");
  return decidePublication(courseId, requestId, "rejected", undefined, reason.trim());
}
