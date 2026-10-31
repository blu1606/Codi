import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  codingExercises,
  codingWorkspaces,
} from "@codi-1/db/schema/coding-exercises";
import type { Database } from "@codi-1/db";
import { lessonMaterials } from "@codi-1/db/schema/course-content";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import { lessonProgress } from "@codi-1/db/schema/learning";
import {
  studentActivities,
  studentEnrollments,
} from "@codi-1/db/schema/student-profile";
import {
  LearningPathError,
  type AdjustmentOffer,
} from "./learning-path-contract";
import {
  loadLearningLessonAccess,
  createLearningPathService,
  offerPathAdjustment,
  reconcileLearningPath,
} from "./learning-path-service";
import { createNotificationService } from "./notification-service";
import {
  lessonChecklist,
  lessonMaterialUrl,
  lessonPlayerCommand,
  recordPdfPage,
  requireLessonChecklist,
  videoPosition,
  videoStudied,
  type LessonPlayerCommand,
  type LessonPlayerView,
  type LessonPlayerResponse,
  type LessonMediaUpdate,
} from "./lesson-player-contract";

type Store = Pick<Database, "select" | "insert" | "update" | "execute">;

async function context(
  store: Store,
  userId: string,
  courseId: string,
  lessonId: string,
  lock = false,
  mediaOnly = false,
) {
  const { accessible, enrollment, lesson, progress } =
    await loadLearningLessonAccess(store, userId, courseId, lessonId, lock);
  const materials = await store
    .select()
    .from(lessonMaterials)
    .where(eq(lessonMaterials.lessonId, lessonId))
    .orderBy(asc(lessonMaterials.position));
  const requirements = mediaOnly
    ? []
    : await store
        .select({
          id: assessments.id,
          type: assessments.type,
          title: assessments.title,
          passingScore: assessments.passingScore,
          maxScore: assessments.maxScore,
          isTutorial: sql<boolean>`coalesce(jsonb_array_length(${codingExercises.tutorialSteps}), 0) > 0`,
          tutorialDone: sql<boolean>`coalesce(${codingWorkspaces.tutorialProgress}->'visited', '[0]'::jsonb) @> jsonb_build_array(jsonb_array_length(${codingExercises.tutorialSteps}) - 1)`,
        })
        .from(assessments)
        .leftJoin(
          codingExercises,
          eq(codingExercises.assessmentId, assessments.id),
        )
        .leftJoin(
          codingWorkspaces,
          and(
            eq(codingWorkspaces.exerciseId, codingExercises.id),
            eq(codingWorkspaces.enrollmentId, enrollment.id),
          ),
        )
        .where(
          and(
            eq(assessments.courseId, courseId),
            eq(assessments.lessonId, lessonId),
            eq(assessments.status, "published"),
            eq(assessments.isDiagnostic, false),
          ),
        )
        .orderBy(asc(assessments.id));
  const submissions = mediaOnly
    ? []
    : await store
        .select({ submission: assessmentSubmissions })
        .from(assessmentSubmissions)
        .innerJoin(
          assessments,
          eq(assessments.id, assessmentSubmissions.assessmentId),
        )
        .where(
          and(
            eq(assessmentSubmissions.enrollmentId, enrollment.id),
            eq(assessments.lessonId, lessonId),
            eq(assessments.courseId, courseId),
          ),
        )
        .orderBy(desc(assessmentSubmissions.attempt));
  return {
    enrollment,
    lesson,
    accessible,
    progress,
    materials,
    requirements,
    submissions: submissions.map((s) => s.submission),
    checklist: lessonChecklist(
      !!progress?.studiedAt,
      requirements,
      submissions.map((s) => s.submission),
    ),
  };
}

async function view(
  store: Store,
  userId: string,
  courseId: string,
  lessonId: string,
): Promise<LessonPlayerView> {
  const ctx = await context(store, userId, courseId, lessonId);
  const path = await createLearningPathService(store as Database).get(
    userId,
    courseId,
  );
  return {
    lesson: {
      id: ctx.lesson.id,
      title: ctx.lesson.title,
      chapterTitle: ctx.accessible.chapterTitle,
      description: ctx.lesson.description,
      body: ctx.lesson.body,
      durationSeconds: ctx.lesson.durationSeconds,
    },
    materials: ctx.materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      url: m.url.startsWith("r2-private://")
        ? `/api/learn/${courseId}/lessons/${lessonId}/materials/${m.id}`
        : lessonMaterialUrl(m.url),
      durationSeconds: m.durationSeconds,
    })),
    media: ctx.progress?.mediaProgress ?? {},
    positionSeconds: ctx.progress?.lastPositionSeconds ?? 0,
    studied: !!ctx.progress?.studiedAt,
    completed: ctx.progress?.status === "completed",
    checklist: ctx.checklist,
    path,
  };
}

export function createLessonPlayerService(db: Database) {
  return {
    async get(userId: string, courseId: string, lessonId: string) {
      return db.transaction((tx) => view(tx, userId, courseId, lessonId), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async execute<C extends LessonPlayerCommand>(
      userId: string,
      courseId: string,
      lessonId: string,
      input: C,
    ): Promise<LessonPlayerResponse<C>> {
      const command = lessonPlayerCommand.parse(input);
      const mediaOnly = command.type === "video" || command.type === "pdf-page";
      let adjustment: AdjustmentOffer | null = null;
      const result = await db.transaction(async (tx) => {
        // Every read/write, including resume updates, repeats the role/ownership/publication/prerequisite gate.
        // Assessment writers (#99) must acquire this same enrollment lock before modifying attempts.
        const ctx = await context(
          tx,
          userId,
          courseId,
          lessonId,
          true,
          mediaOnly,
        );
        const { enrollment: e, progress: p } = ctx;
        const now = new Date();
        const values: Partial<typeof lessonProgress.$inferInsert> = {
          lastAccessedAt: now,
          status: p?.status === "completed" ? "completed" : "in_progress",
        };
        if (command.type === "study") {
          if (ctx.requirements.some((a) => a.type === "coding"))
            throw new LearningPathError(
              "Bài code cần kết quả nộp bài đạt yêu cầu.",
            );
          if (
            !ctx.lesson.body?.trim() &&
            !ctx.materials.some((m) => lessonMaterialUrl(m.url))
          )
            throw new LearningPathError("Bài học chưa có nội dung để học.");
          values.studiedAt = p?.studiedAt ?? now;
        } else if (command.type === "video" || command.type === "pdf-page") {
          const material = ctx.materials.find(
            (m) => m.id === command.materialId,
          );
          if (!material || !lessonMaterialUrl(material.url))
            throw new LearningPathError(
              "Không tìm thấy tài liệu hợp lệ của bài học.",
              404,
            );
          const media = { ...p?.mediaProgress };
          if (command.type === "video") {
            if (material.type !== "video")
              throw new LearningPathError("Tài liệu không phải video.", 400);
            const seconds = videoPosition(
              command.seconds,
              material.durationSeconds,
              command.ended,
            );
            media[String(material.id)] = { seconds };
            values.lastPositionSeconds = seconds;
            if (videoStudied(seconds, material.durationSeconds, command.ended))
              values.studiedAt = p?.studiedAt ?? now;
          } else {
            if (!["pdf", "slide"].includes(material.type))
              throw new LearningPathError(
                "Tài liệu không phải PDF/slide.",
                400,
              );
            const result = recordPdfPage(
              media[String(material.id)],
              command.page,
              command.pages,
            );
            media[String(material.id)] = result.progress;
            if (result.studied) values.studiedAt = p?.studiedAt ?? now;
          }
          values.mediaProgress = media;
        } else if (command.type === "complete" && p?.status !== "completed") {
          requireLessonChecklist(ctx.checklist);
          values.status = "completed";
          values.completedAt = now;
          values.studiedAt = p?.studiedAt ?? now;
        }
        if (p)
          await tx
            .update(lessonProgress)
            .set(values)
            .where(eq(lessonProgress.id, p.id));
        else
          await tx
            .insert(lessonProgress)
            .values({
              enrollmentId: e.id,
              lessonId,
              status: "in_progress",
              firstStartedAt: now,
              ...values,
            });
        await tx
          .update(studentEnrollments)
          .set({ lastLessonId: lessonId, lastActiveAt: now })
          .where(eq(studentEnrollments.id, e.id));
        if (command.type === "complete" && p?.status !== "completed") {
          await reconcileLearningPath(tx, userId, courseId);
          await createNotificationService(tx).notify(
            userId,
            "Lộ trình đã được cập nhật",
            `Sau bài “${ctx.lesson.title}”.`,
            `/learn/${encodeURIComponent(courseId)}`,
          );
          await tx
            .insert(studentActivities)
            .values({
              userId,
              courseId,
              type: "lesson_complete",
              metadata: JSON.stringify({ lessonId }),
              occurredAt: now,
            });
          adjustment = await offerPathAdjustment(
            tx,
            userId,
            courseId,
            lessonId,
            latestQuizPercent(ctx.requirements, ctx.submissions),
          );
        }
        return {
          kind: "media-progress",
          media: values.mediaProgress ?? p?.mediaProgress ?? {},
          positionSeconds:
            values.lastPositionSeconds ?? p?.lastPositionSeconds ?? 0,
          studied: !!(values.studiedAt ?? p?.studiedAt),
          completed: values.status === "completed",
        } satisfies LessonMediaUpdate;
      });
      if (mediaOnly) return result as LessonPlayerResponse<C>;
      // Building the sidebar/path is deliberately outside the enrollment lock.
      const lessonView = await db.transaction(
        (tx) => view(tx, userId, courseId, lessonId),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      // A completion always answers with its offer (null when nothing would change).
      return (
        command.type === "complete"
          ? { ...lessonView, adjustment }
          : lessonView
      ) as LessonPlayerResponse<C>;
    },
  };
}

// Latest graded quiz result as a percentage; feeds the completion insight only.
function latestQuizPercent(
  requirements: { id: number; type: string; maxScore: number }[],
  submissions: {
    assessmentId: number;
    attempt: number;
    status: string;
    score: number | null;
  }[],
) {
  const quiz = requirements.find((a) => a.type === "quiz");
  if (!quiz || quiz.maxScore <= 0) return null;
  const latest = submissions
    .filter(
      (s) =>
        s.assessmentId === quiz.id && s.status === "graded" && s.score !== null,
    )
    .sort((a, b) => b.attempt - a.attempt)[0];
  return latest?.score == null ? null : (latest.score / quiz.maxScore) * 100;
}
