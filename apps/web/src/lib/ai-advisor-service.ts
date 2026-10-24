import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  aiInteractionLogs,
  courseChapters,
  courseDetails,
  courseLessons,
  courses,
  lessonProgress,
  studentActivities,
  studentEnrollments,
} from "@codi-1/db";
import type { GoalDraft } from "@codi-1/db/schema/onboarding-values";
import {
  INTAKE_QUESTIONS,
  formatVnd,
  levelLabel,
  type AdvisorCourseCard,
  type AdvisorStructuredResponse,
  type IntakeState,
} from "./ai-advisor-contract";

export { formatVnd, levelLabel };

export function generateGuestFeedbackToken(logId: number, secret: string): string {
  return createHmac("sha256", secret).update(`advisor-guest-log:${logId}`).digest("base64url");
}

export function verifyGuestFeedbackToken(logId: number, token: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(`advisor-guest-log:${logId}`).digest();
    const actual = Buffer.from(token, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface AdvisorContextUser {
  id: string;
  name?: string | null;
}

export interface AdvisorCourseItem {
  id: string;
  slug: string;
  title: string;
  level: string;
  price: number;
  rating: number | null;
  lessonCount: number;
  enrollmentCount: number;
  coverImageUrl: string | null;
  description: string;
}

export interface LearnerProgressContext {
  currentCourse: {
    id: string;
    slug: string;
    title: string;
    doneLessons: number;
    totalLessons: number;
  } | null;
  ownedCourseIds: string[];
  savedIntake?: Partial<IntakeState> | null;
}

export async function getLearnerProgressContext(
  db: Database,
  userId: string | null
): Promise<LearnerProgressContext> {
  if (!userId) {
    return { currentCourse: null, ownedCourseIds: [] };
  }

  // Get active enrollments with progress and goals
  const enrollments = await db
    .select({
      enrollmentId: studentEnrollments.id,
      courseId: studentEnrollments.courseId,
      progress: studentEnrollments.progress,
      lastActiveAt: studentEnrollments.lastActiveAt,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      learningGoal: studentEnrollments.learningGoal,
      selfAssessedLevel: studentEnrollments.selfAssessedLevel,
      weeklyGoalMinutes: studentEnrollments.weeklyGoalMinutes,
      goalDraft: studentEnrollments.goalDraft,
    })
    .from(studentEnrollments)
    .innerJoin(courses, eq(courses.id, studentEnrollments.courseId))
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        eq(courses.status, "published")
      )
    )
    .orderBy(desc(studentEnrollments.lastActiveAt), desc(studentEnrollments.enrolledAt));

  if (!enrollments.length) {
    // Check if the learner previously stored an advisor intake in studentActivities
    try {
      const [activity] = await db
        .select({
          metadata: studentActivities.metadata,
        })
        .from(studentActivities)
        .where(
          and(
            eq(studentActivities.userId, userId),
            eq(studentActivities.type, "course_view"),
            like(studentActivities.metadata, "%advisor_intake%")
          )
        )
        .orderBy(desc(studentActivities.occurredAt))
        .limit(1);

      if (activity?.metadata) {
        const parsed = JSON.parse(activity.metadata);
        if (parsed?.intake) {
          return { currentCourse: null, ownedCourseIds: [], savedIntake: parsed.intake };
        }
      }
    } catch {
      // Ignore parse / read errors
    }
    return { currentCourse: null, ownedCourseIds: [] };
  }

  const ownedCourseIds = enrollments.map((e) => e.courseId);
  const first = enrollments[0];

  // Map existing goals to advisor intake labels if available
  let savedIntake: Partial<IntakeState> | null = null;
  const draft = first.goalDraft as { goal?: string; level?: string; hours?: number } | null;
  const goalKey = draft?.goal ?? first.learningGoal;
  const levelKey = draft?.level ?? first.selfAssessedLevel;
  const hoursVal = draft?.hours ?? (first.weeklyGoalMinutes ? Math.round(first.weeklyGoalMinutes / 60) : null);

  const goalText =
    goalKey === "project"
      ? "Làm được dự án"
      : goalKey === "finish" || goalKey === "complete_course"
        ? "Hoàn thành khoá học"
        : goalKey === "interview"
          ? "Chuẩn bị phỏng vấn"
          : null;

  const levelText =
    levelKey === "new" || levelKey === "Beginner"
      ? "Mới bắt đầu"
      : levelKey === "basic" || levelKey === "Intermediate"
        ? "Có kinh nghiệm cơ bản"
        : levelKey === "solid" || levelKey === "Advanced"
          ? "Trung cấp"
          : null;

  const hoursText =
    hoursVal && hoursVal < 5
      ? "< 5 giờ"
      : hoursVal && hoursVal <= 10
        ? "5-10 giờ"
        : hoursVal && hoursVal > 10
          ? "> 10 giờ"
          : null;

  if (goalText || levelText || hoursText) {
    savedIntake = {
      ...(goalText ? { goal: goalText } : {}),
      ...(levelText ? { level: levelText } : {}),
      ...(hoursText ? { hoursPerWeek: hoursText } : {}),
    };
  }

  // Count done lessons and total lessons for the first active course
  const [totalRow] = await db
    .select({ count: count(courseLessons.id) })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(
      and(
        eq(courseChapters.courseId, first.courseId),
        eq(courseLessons.isPublished, true)
      )
    );

  const [doneRow] = await db
    .select({ count: count(lessonProgress.id) })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.enrollmentId, first.enrollmentId),
        eq(lessonProgress.status, "completed")
      )
    );

  return {
    currentCourse: {
      id: first.courseId,
      slug: first.courseSlug,
      title: first.courseTitle,
      doneLessons: doneRow?.count ?? 0,
      totalLessons: totalRow?.count ?? 0,
    },
    ownedCourseIds,
    savedIntake,
  };
}

export async function syncLearnerIntakeGoalDraft(
  db: Database,
  userId: string,
  intake: IntakeState
): Promise<void> {
  const goal =
    intake.goal === "Làm được dự án"
      ? "project"
      : intake.goal === "Hoàn thành khoá học"
        ? "finish"
        : intake.goal === "Chuẩn bị phỏng vấn"
          ? "interview"
          : undefined;

  const level =
    intake.level === "Mới bắt đầu"
      ? "new"
      : intake.level === "Có kinh nghiệm cơ bản"
        ? "basic"
        : intake.level === "Trung cấp"
          ? "solid"
          : undefined;

  const hours =
    intake.hoursPerWeek === "< 5 giờ"
      ? 2
      : intake.hoursPerWeek === "5-10 giờ"
        ? 5
        : intake.hoursPerWeek === "> 10 giờ"
          ? 10
          : undefined;

  if (!goal && !level && !hours) return;

  // 1. Always record in studentActivities so intake persists even with 0 active enrollments
  try {
    await db.insert(studentActivities).values({
      userId,
      type: "course_view",
      metadata: JSON.stringify({
        type: "advisor_intake",
        intake: {
          goal: intake.goal ?? null,
          level: intake.level ?? null,
          hoursPerWeek: intake.hoursPerWeek ?? null,
        },
        draft: {
          ...(goal ? { goal } : {}),
          ...(level ? { level } : {}),
          ...(hours ? { hours } : {}),
        },
      }),
    });
  } catch (err) {
    console.warn("Failed to persist intake activity", err);
  }

  // 2. Find active enrollments where goal is not yet finalized
  const pendingEnrollments = await db
    .select({
      id: studentEnrollments.id,
      goalDraft: studentEnrollments.goalDraft,
      goalSetAt: studentEnrollments.goalSetAt,
    })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        eq(studentEnrollments.status, "active")
      )
    );

  for (const enr of pendingEnrollments) {
    if (!enr.goalSetAt) {
      const existingDraft = (enr.goalDraft as GoalDraft | null) || {};
      const updatedDraft: GoalDraft = {
        ...existingDraft,
        ...(goal ? { goal } : {}),
        ...(level ? { level } : {}),
        ...(hours ? { hours } : {}),
      };
      await db
        .update(studentEnrollments)
        .set({ goalDraft: updatedDraft })
        .where(eq(studentEnrollments.id, enr.id));
    }
  }
}

export async function getPublishedCatalog(db: Database): Promise<AdvisorCourseItem[]> {
  const lessonCountSubquery = db
    .select({
      courseId: courseChapters.courseId,
      lessonCount: count(courseLessons.id).as("lesson_count"),
    })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(eq(courseLessons.isPublished, true))
    .groupBy(courseChapters.courseId)
    .as("lesson_counts");

  const enrollmentCountSubquery = db
    .select({
      courseId: studentEnrollments.courseId,
      enrollmentCount: count(studentEnrollments.id).as("enrollment_count"),
    })
    .from(studentEnrollments)
    .groupBy(studentEnrollments.courseId)
    .as("enrollment_counts");

  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      level: courses.level,
      price: courses.price,
      rating: courses.rating,
      description: courses.description,
      coverImageUrl: courseDetails.coverImageUrl,
      lessonCount: sql<number>`COALESCE(${lessonCountSubquery.lessonCount}, 0)`,
      enrollmentCount: sql<number>`COALESCE(${enrollmentCountSubquery.enrollmentCount}, 0)`,
    })
    .from(courses)
    .leftJoin(courseDetails, eq(courseDetails.courseId, courses.id))
    .leftJoin(lessonCountSubquery, eq(lessonCountSubquery.courseId, courses.id))
    .leftJoin(enrollmentCountSubquery, eq(enrollmentCountSubquery.courseId, courses.id))
    .where(eq(courses.status, "published"))
    .orderBy(asc(courses.title));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    level: r.level,
    price: Number(r.price),
    rating: r.rating !== null ? Number(r.rating) : null,
    lessonCount: Number(r.lessonCount),
    enrollmentCount: Number(r.enrollmentCount),
    coverImageUrl: r.coverImageUrl,
    description: r.description ?? "",
  }));
}

/**
 * Pure generator mirroring the contract and reference logic from docs/mockup/js/ai-advisor.js
 */
export function buildAdvisorAnswer(params: {
  prompt: string;
  catalog: AdvisorCourseItem[];
  intake: IntakeState;
  ownedCourseIds: string[];
}): AdvisorStructuredResponse {
  const { prompt, catalog, intake, ownedCourseIds } = params;
  const owned = new Set(ownedCourseIds);
  const promptLower = prompt.toLowerCase();

  const beginner =
    !intake.level ||
    intake.level === "Mới bắt đầu" ||
    /mới bắt đầu|người mới/i.test(prompt);

  const rank: Record<string, number> = {
    Beginner: 0,
    "Cơ bản": 0,
    Intermediate: 1,
    "Trung cấp": 1,
    Advanced: 2,
    "Nâng cao": 2,
  };

  const sortedList = [...catalog].sort((a, b) => {
    // 1. Unowned courses first
    const aOwned = owned.has(a.id) ? 1 : 0;
    const bOwned = owned.has(b.id) ? 1 : 0;
    if (aOwned !== bOwned) return aOwned - bOwned;

    // 2. Level rank
    const aRank = rank[a.level] ?? 1;
    const bRank = rank[b.level] ?? 1;
    if (aRank !== bRank) {
      return beginner ? aRank - bRank : bRank - aRank;
    }

    // 3. Rating
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  const toCard = (c: AdvisorCourseItem, reason?: string, isBestMatch?: boolean): AdvisorCourseCard => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    level: levelLabel(c.level),
    lessonCount: c.lessonCount,
    price: c.price,
    rating: c.rating,
    learnersCount: c.enrollmentCount,
    coverImageUrl: c.coverImageUrl,
    reason:
      reason ??
      `${levelLabel(c.level)} · ${c.rating ? c.rating + "★ · " : ""}${c.enrollmentCount.toLocaleString("vi-VN")} học viên`,
    isBestMatch,
  });

  // Scenario 1: User explicitly asks for a subject/topic
  // Match common queries like "có khoá python không?", "có khoá học về web3 không?", "học flutter cho người mới"
  // As well as explicit keywords: blockchain, web3, solidity, rust, swift, flutter, etc.
  const subjectExtractionRegex =
    /(?:có\s+khoá(?:\s+học)?(?:\s+nào)?(?:\s+về|\s+cho)?|dạy\s+về|tìm\s+khoá(?:\s+học)?(?:\s+về)?)\s+([a-zA-Z0-9+#.\s]+?)(?:\s+không|\s+cho\s+người|\?|$)/i;
  const keywordFallbackRegex =
    /\b(blockchain|web3|solidity|rust|swift|flutter|python|golang|kotlin|vue|angular|devops|aws|docker|kubernetes|ai|machine learning)\b/i;

  let querySubject: string | null = null;
  const matchDirect = promptLower.match(subjectExtractionRegex);
  if (matchDirect && matchDirect[1]) {
    const rawClean = matchDirect[1].trim().replace(/[?!.,]+$/, "");
    if (rawClean.length >= 2) {
      querySubject = rawClean.toLowerCase();
    }
  }
  if (!querySubject) {
    const matchKeyword = promptLower.match(keywordFallbackRegex);
    if (matchKeyword && matchKeyword[1]) {
      querySubject = matchKeyword[1].toLowerCase();
    }
  }

  if (querySubject) {
    const hasSubjectInCatalog = catalog.some((c) =>
      c.title.toLowerCase().includes(querySubject!) ||
      c.description.toLowerCase().includes(querySubject!) ||
      c.slug.toLowerCase().includes(querySubject!)
    );

    if (!hasSubjectInCatalog) {
      const alternative = sortedList.slice(0, 2);
      return {
        text: "Codi chưa có khoá cho mục tiêu này. Bạn có thể tham khảo các khoá nền tảng lập trình gần nhất dưới đây:",
        courses: alternative.map((c, idx) => toCard(c, undefined, idx === 0)),
        table: null,
        order: [],
        followups: ["Mới bắt đầu học lập trình nên học gì?", "So sánh các khoá cơ bản"],
        noMatch: true,
      };
    }
  }

  // Scenario 2: Comparison table
  if (/so sánh/i.test(prompt)) {
    const pick = sortedList.slice(0, 3);
    const headers = ["Khoá học", "Trình độ", "Số bài", "Học phí", "Phù hợp khi"];
    const rows = pick.map((c) => [
      c.title,
      levelLabel(c.level),
      String(c.lessonCount),
      formatVnd(c.price),
      (rank[c.level] ?? 0) === 0 ? "Bạn mới bắt đầu" : "Bạn đã nắm nền tảng",
    ]);

    return {
      text: "Đây là bảng so sánh các khoá theo quy tắc danh mục. Cột cuối là gợi ý theo trình độ khoá học.",
      table: { headers, rows },
      courses: pick.map((c, idx) => toCard(c, undefined, idx === 0)),
      order: [],
      followups: ["Nên học theo thứ tự nào?", "Khoá nào hợp với 5 giờ/tuần?"],
      noMatch: false,
    };
  }

  // Scenario 3: Order / Roadmap
  if (/thứ tự|lộ trình|tiếp theo|nên học gì tiếp/i.test(prompt)) {
    const unownedOrder = sortedList
      .filter((c) => !owned.has(c.id))
      .sort((a, b) => (rank[a.level] ?? 0) - (rank[b.level] ?? 0))
      .slice(0, 3);

    const orderCards = unownedOrder.map((c, i) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      reason: i === 0 ? "trình độ nền tảng, xếp trước" : "xếp theo trình độ khoá học",
    }));

    return {
      text: `Thứ tự tham khảo theo trình độ khoá học${intake.hoursPerWeek ? ` (bạn chọn ${intake.hoursPerWeek}/tuần)` : ""}; chưa phân tích quan hệ tiên quyết hay ước tính thời gian hoàn thành.`,
      courses: unownedOrder.map((c, idx) =>
        toCard(
          c,
          idx === 0 ? "Xếp trước theo trình độ khoá học" : "Xếp tiếp theo trình độ khoá học",
          idx === 0
        )
      ),
      table: null,
      order: orderCards,
      followups: ["So sánh các khoá này", "Mình bị chậm tiến độ, nên làm gì?"],
      noMatch: false,
    };
  }

  // Scenario 4: Falling behind / Pace
  if (/chậm tiến độ/i.test(prompt)) {
    return {
      text: "Một vài cách lấy lại nhịp:\n- Đặt mục tiêu tuần nhỏ hơn ở **Bàn làm việc**\n- Học 15 phút mỗi ngày thay vì dồn cuối tuần\n- Dùng **Tìm điểm bắt đầu của tôi** để bỏ qua phần đã biết",
      courses: [],
      table: null,
      order: [],
      followups: ["Nên học gì tiếp?", "Tìm khoá cho mục tiêu"],
      noMatch: false,
    };
  }

  // Scenario 5: Default recommendations
  const pick = sortedList.slice(0, 3);
  const contextSummary =
    [intake.goal, intake.level, intake.hoursPerWeek ? `${intake.hoursPerWeek}/tuần` : null]
      .filter(Boolean)
      .join(", ") || "câu hỏi của bạn";

  return {
    text: `Thông tin bạn cung cấp: ${contextSummary}. Đây là gợi ý theo quy tắc danh mục (ưu tiên khoá chưa sở hữu và trình độ), không phải phân tích mục tiêu bằng AI:`,
    courses: pick.map((c, idx) => toCard(c, undefined, idx === 0)),
    table: null,
    order: [],
    followups: ["So sánh các khoá này", "Nên học theo thứ tự nào?"],
    noMatch: false,
  };
}

/**
 * Log advisor conversation to ai_interaction_logs table
 */
export async function logAdvisorInteraction(
  db: Database,
  params: {
    userId: string | null;
    userPrompt: string;
    aiResponse: string;
    latencyMs: number;
    isSuccess: boolean;
    errorMessage?: string | null;
  }
): Promise<number | null> {
  try {
    const [inserted] = await db
      .insert(aiInteractionLogs)
      .values({
        userId: params.userId,
        requestType: "ask_advisor",
        model: "codi-catalog-rules-v1",
        userPrompt: params.userPrompt,
        aiResponse: params.aiResponse,
        latencyMs: params.latencyMs,
        isSuccess: params.isSuccess,
        errorMessage: params.errorMessage ?? null,
      })
      .returning({ id: aiInteractionLogs.id });

    return inserted?.id ?? null;
  } catch (error) {
    console.error("Failed to log advisor interaction", error);
    return null;
  }
}
