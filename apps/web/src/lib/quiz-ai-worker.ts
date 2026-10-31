import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, ROLE } from "@codi-1/auth";
import { aiContentDrafts, courseChapters, courseLessons, courses, lessonMaterials } from "@codi-1/db";
import { finishAiJob, lockAiJob, type AiJob } from "@codi-1/db/ai-jobs";
import { db } from "@/services";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { AI_QUIZ_MAX_MATERIAL_CHARS, generateQuizDraft } from "@/lib/quiz-ai-generation";

export const quizJobInput = z.object({
  courseId: z.string().min(1).max(200),
  lessonId: z.union([z.literal("entry"), z.string().uuid()]),
  count: z.number().int().min(1).max(10),
  difficulty: z.enum(["easy", "medium", "hard"]),
  sourceText: z.string().max(6000).optional(),
  focus: z.string().max(200).optional(),
}).strict();

/** Must only be called by the private worker. Job content is never logged. */
export async function processQuizJob(job: AiJob) {
  if (job.type !== "quiz_generation") throw new Error("invalid_job");
  const input = quizJobInput.parse(job.payload);
  if (job.resourceId !== `${input.courseId}/${input.lessonId}`) throw new Error("invalid_job");
  await requireRole(db, job.userId, ROLE.LECTURER);
  const [course] = await db.select().from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.instructorId, job.userId))).limit(1);
  if (!course || course.status === "pending") throw new Error("not_authorized");
  const [lesson] = input.lessonId === "entry" ? [] : await db.select({ lesson: courseLessons })
    .from(courseLessons).innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .where(and(eq(courseLessons.id, input.lessonId), eq(courseChapters.courseId, course.id))).limit(1);
  if (input.lessonId !== "entry" && !lesson) throw new Error("lesson_unavailable");
  const materials = lesson ? await db.select({ title: lessonMaterials.title }).from(lessonMaterials)
    .where(eq(lessonMaterials.lessonId, input.lessonId)) : [];
  const lessonText = [lesson?.lesson.description, lesson?.lesson.body].map((part) => part?.trim()).filter(Boolean).join("\n\n");
  const material = (input.sourceText?.trim() || lessonText).slice(0, AI_QUIZ_MAX_MATERIAL_CHARS);
  if (!material) throw new Error("no_material");
  const generated = await generateQuizDraft({ courseTitle: course.title, lessonTitle: lesson?.lesson.title ?? null,
    count: input.count, difficulty: input.difficulty, focus: input.focus, materialTitles: materials.map((row) => row.title), material }, "background");
  if (!generated.success) throw new Error(generated.code);
  await db.transaction(async (tx) => {
    await lockAiJob(tx, job.id, job.leaseToken);
    const active = await tx.execute(sql`select ${user.id} from ${user} join ${userRoles} on ${userRoles.userId} = ${user.id}
      where ${user.id} = ${job.userId} and ${user.banned} is not true and ${userRoles.roleId} = ${ROLE.LECTURER}
        and ${userRoles.revokedAt} is null for share of ${user}, ${userRoles}`);
    if (!active.rows.length) throw new Error("not_authorized");
    const [current] = await tx.select().from(courses)
      .where(and(eq(courses.id, input.courseId), eq(courses.instructorId, job.userId))).for("update");
    if (!current || current.status === "pending") throw new Error("not_authorized");
    if (current.knowledgeMapContentGeneration !== course.knowledgeMapContentGeneration) throw new Error("content_changed");
    if (input.lessonId !== "entry") {
      const [liveLesson] = await tx.select({ id: courseLessons.id }).from(courseLessons)
        .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
        .where(and(eq(courseLessons.id, input.lessonId), eq(courseChapters.courseId, current.id))).limit(1);
      if (!liveLesson) throw new Error("lesson_unavailable");
    }
    await tx.insert(aiContentDrafts).values({ lecturerId: job.userId, courseId: input.courseId,
      lessonId: input.lessonId === "entry" ? null : input.lessonId, kind: "quiz_questions", status: "pending",
      payload: { jobId: job.id, courseId: input.courseId, lessonId: input.lessonId,
        difficulty: input.difficulty, questions: generated.questions } });
    await finishAiJob(tx, job.id, job.leaseToken, "completed");
  });
}
