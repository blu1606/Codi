import { and, asc, count, desc, eq, like, sql } from "drizzle-orm";
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
import { formatVnd, levelLabel, type IntakeState } from "./ai-advisor-contract";

export { formatVnd, levelLabel };

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
    model?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  }
): Promise<number | null> {
  try {
    const [inserted] = await db
      .insert(aiInteractionLogs)
      .values({
        userId: params.userId,
        requestType: "ask_advisor",
        model: params.model ?? null,
        promptTokens: params.promptTokens ?? null,
        completionTokens: params.completionTokens ?? null,
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
