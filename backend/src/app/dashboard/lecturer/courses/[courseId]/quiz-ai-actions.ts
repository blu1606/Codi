"use server";

import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { aiContentDrafts, aiJobs } from "@codi-1/db";
import { AiJobEnqueueError, enqueueAiJob, readLatestAiJob } from "@codi-1/db/ai-jobs";
import { db } from "@/services";
import { quizJobInput } from "@/lib/quiz-ai-worker";
import { getEditableCourse, requireCourseLesson } from "./course-queries";
import type { AiQuizDifficulty, AiQuizSourceInput, QuizQuestionInput } from "./actions";

export async function startQuizGeneration(courseId: string, lessonId: string, count: number,
  difficulty: AiQuizDifficulty, source: AiQuizSourceInput) {
  if (process.env.AI_BACKGROUND_WORKER_ENABLED !== "true") return { mode: "sync" as const };
  const input = quizJobInput.parse({ courseId, lessonId, count, difficulty, ...source });
  const { user } = await getEditableCourse(courseId);
  if (lessonId !== "entry") await requireCourseLesson(courseId, lessonId);
  try {
    const id = await enqueueAiJob(db, { type: "quiz_generation", userId: user.id, resourceId: `${courseId}/${lessonId}`, payload: input });
    return { mode: "queued" as const, id };
  } catch (error) {
    if (error instanceof AiJobEnqueueError && error.code === "daily_limit")
      return { mode: "error" as const, message: "Đã hết số lượt tạo AI hôm nay. Vui lòng thử lại sau." };
    if (error instanceof AiJobEnqueueError && error.code === "active_job")
      return { mode: "error" as const, message: "Một lượt tạo câu hỏi đang chạy. Vui lòng đợi kết quả." };
    return { mode: "error" as const, message: "Chưa thể tạo tác vụ. Vui lòng thử lại." };
  }
}

export async function readQuizGeneration(courseId: string, lessonId: string, jobId?: string): Promise<
  | { status: "none" }
  | { status: "queued" | "running"; jobId: string }
  | { status: "failed" }
  | { status: "completed"; jobId: string; questions: QuizQuestionInput[] }
> {
  if (process.env.AI_BACKGROUND_WORKER_ENABLED !== "true") return { status: "none" };
  const { user } = await getEditableCourse(courseId);
  if (lessonId !== "entry") await requireCourseLesson(courseId, lessonId);
  if (jobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return { status: "none" };
  const job = jobId ? (await db.select({ id: aiJobs.id, status: aiJobs.status }).from(aiJobs).where(and(
    eq(aiJobs.id, jobId), eq(aiJobs.userId, user.id), eq(aiJobs.type, "quiz_generation"),
    eq(aiJobs.resourceId, `${courseId}/${lessonId}`),
  )).limit(1))[0] : await readLatestAiJob(db, { type: "quiz_generation", userId: user.id, resourceId: `${courseId}/${lessonId}` });
  if (!job) return { status: "none" };
  if (job.status === "queued" || job.status === "running") return { status: job.status, jobId: job.id };
  if (jobId && job.status !== "completed") return { status: "failed" };
  const [draft] = await db.select({ payload: aiContentDrafts.payload }).from(aiContentDrafts)
    .where(and(eq(aiContentDrafts.lecturerId, user.id), eq(aiContentDrafts.courseId, courseId),
      lessonId === "entry" ? isNull(aiContentDrafts.lessonId) : eq(aiContentDrafts.lessonId, lessonId),
      eq(aiContentDrafts.kind, "quiz_questions"), eq(aiContentDrafts.status, "pending"),
      isNotNull(sql<string>`${aiContentDrafts.payload}->>'jobId'`),
      jobId ? sql`${aiContentDrafts.payload}->>'jobId' = ${jobId}` : undefined))
    .orderBy(desc(aiContentDrafts.createdAt), desc(aiContentDrafts.id)).limit(1);
  const payload = draft?.payload as { jobId?: string; questions?: QuizQuestionInput[] } | undefined;
  if (!payload?.jobId || !Array.isArray(payload.questions)) return job.status === "failed" ? { status: "failed" } : { status: "none" };
  return { status: "completed", jobId: payload.jobId, questions: payload.questions };
}
