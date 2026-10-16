import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { assessments, assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { lessonProgress } from "@codi-1/db/schema/learning";
import { studentActivities, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { LearningPathError } from "./learning-path-contract";
import { assertLearningLessonAccess, createLearningPathService, reconcileLearningPath } from "./learning-path-service";
import { createNotificationService } from "./notification-service";
import { lessonChecklist, lessonMaterialUrl, lessonPlayerCommand, recordPdfPage, requireLessonChecklist, type LessonPlayerCommand, type LessonPlayerView } from "./lesson-player-contract";

type Store = Pick<Database, "select" | "insert" | "update">;

async function context(store: Store, userId: string, courseId: string, lessonId: string, lock = false) {
  const accessible = await assertLearningLessonAccess(store, userId, courseId, lessonId, lock);
  const [enrollment] = await store.select().from(studentEnrollments).where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
  if (!enrollment) throw new LearningPathError("Bạn chưa có quyền học khoá học này.", 403);
  const [lesson] = await store.select().from(courseLessons).where(eq(courseLessons.id, lessonId));
  if (!lesson) throw new LearningPathError("Không tìm thấy bài học.", 404);
  const [progress] = await store.select().from(lessonProgress).where(and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lessonId)));
  const materials = await store.select().from(lessonMaterials).where(eq(lessonMaterials.lessonId, lessonId)).orderBy(asc(lessonMaterials.position));
  const requirements = await store.select({ id: assessments.id, type: assessments.type, title: assessments.title, passingScore: assessments.passingScore, maxScore: assessments.maxScore })
    .from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lessonId), eq(assessments.status, "published"), eq(assessments.isDiagnostic, false))).orderBy(asc(assessments.id));
  const submissions = await store.select({ submission: assessmentSubmissions }).from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
    .where(and(eq(assessmentSubmissions.enrollmentId, enrollment.id), eq(assessments.lessonId, lessonId), eq(assessments.courseId, courseId)))
    .orderBy(desc(assessmentSubmissions.attempt));
  return { enrollment, lesson, accessible, progress, materials, requirements,
    checklist: lessonChecklist(!!progress?.studiedAt, requirements, submissions.map((s) => s.submission)) };
}

async function view(store: Store, userId: string, courseId: string, lessonId: string): Promise<LessonPlayerView> {
  const ctx = await context(store, userId, courseId, lessonId);
  const path = await createLearningPathService(store as Database).get(userId, courseId);
  return {
    lesson: { id: ctx.lesson.id, title: ctx.lesson.title, chapterTitle: ctx.accessible.chapterTitle, description: ctx.lesson.description, body: ctx.lesson.body, durationSeconds: ctx.lesson.durationSeconds },
    materials: ctx.materials.map((m) => ({ id: m.id, title: m.title, type: m.type, url: lessonMaterialUrl(m.url), durationSeconds: m.durationSeconds })),
    media: ctx.progress?.mediaProgress ?? {}, positionSeconds: ctx.progress?.lastPositionSeconds ?? 0,
    studied: !!ctx.progress?.studiedAt, completed: ctx.progress?.status === "completed", checklist: ctx.checklist, path,
  };
}

export function createLessonPlayerService(db: Database) {
  return {
    async get(userId: string, courseId: string, lessonId: string) {
      return db.transaction((tx) => view(tx, userId, courseId, lessonId), { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async execute(userId: string, courseId: string, lessonId: string, input: LessonPlayerCommand) {
      const command = lessonPlayerCommand.parse(input);
      return db.transaction(async (tx) => {
        // Every read/write, including resume updates, repeats the role/ownership/publication/prerequisite gate.
        // Assessment writers (#99) must acquire this same enrollment lock before modifying attempts.
        const ctx = await context(tx, userId, courseId, lessonId, true);
        const { enrollment: e, progress: p } = ctx;
        const now = new Date();
        const values: Partial<typeof lessonProgress.$inferInsert> = { lastAccessedAt: now, status: p?.status === "completed" ? "completed" : "in_progress" };
        if (command.type === "study") {
          if (ctx.requirements.some((a) => a.type === "coding")) throw new LearningPathError("Bài code cần kết quả nộp bài đạt yêu cầu.");
          if (!ctx.lesson.body?.trim() && !ctx.materials.some((m) => lessonMaterialUrl(m.url))) throw new LearningPathError("Bài học chưa có nội dung để học.");
          values.studiedAt = p?.studiedAt ?? now;
        } else if (command.type === "video" || command.type === "pdf-page") {
          const material = ctx.materials.find((m) => m.id === command.materialId);
          if (!material || !lessonMaterialUrl(material.url)) throw new LearningPathError("Không tìm thấy tài liệu hợp lệ của bài học.", 404);
          const media = { ...p?.mediaProgress };
          if (command.type === "video") {
            if (material.type !== "video") throw new LearningPathError("Tài liệu không phải video.", 400);
            const duration = material.durationSeconds ?? ctx.lesson.durationSeconds;
            if (duration > 0 && command.seconds > duration + 5) throw new LearningPathError("Vị trí video không hợp lệ.", 400);
            if (command.ended && duration > 0 && command.seconds < duration - 2) throw new LearningPathError("Video chưa được xem hết.");
            media[String(material.id)] = { seconds: command.seconds };
            values.lastPositionSeconds = command.seconds;
            if (command.ended) values.studiedAt = p?.studiedAt ?? now;
          } else {
            if (!["pdf", "slide"].includes(material.type)) throw new LearningPathError("Tài liệu không phải PDF/slide.", 400);
            const result = recordPdfPage(media[String(material.id)], command.page, command.pages);
            media[String(material.id)] = result.progress;
            if (result.studied) values.studiedAt = p?.studiedAt ?? now;
          }
          values.mediaProgress = media;
        } else if (command.type === "complete" && p?.status !== "completed") {
          requireLessonChecklist(ctx.checklist);
          values.status = "completed"; values.completedAt = now; values.studiedAt = p?.studiedAt ?? now;
        }
        if (p) await tx.update(lessonProgress).set(values).where(eq(lessonProgress.id, p.id));
        else await tx.insert(lessonProgress).values({ enrollmentId: e.id, lessonId, status: "in_progress", firstStartedAt: now, ...values });
        await tx.update(studentEnrollments).set({ lastLessonId: lessonId, lastActiveAt: now }).where(eq(studentEnrollments.id, e.id));
        if (command.type === "complete" && p?.status !== "completed") {
          await reconcileLearningPath(tx, userId, courseId);
          await createNotificationService(tx).notify(userId, "Lộ trình đã được cập nhật", `Sau bài “${ctx.lesson.title}”.`, `/learn/${encodeURIComponent(courseId)}`);
          await tx.insert(studentActivities).values({ userId, courseId, type: "lesson_complete", metadata: JSON.stringify({ lessonId }), occurredAt: now });
        }
        return view(tx, userId, courseId, lessonId);
      });
    },
  };
}
