import { and, eq } from "drizzle-orm";
import { courseChapters, courseLessons, courses } from "@codi-1/db";
import { assertNoActiveAiJob, enqueueAiJob, AiJobEnqueueError } from "@codi-1/db/ai-jobs";
import type { Database } from "@codi-1/db";
import { lockKnowledgeMap } from "./confirmed-knowledge-map";
import { knowledgeMapProducerEnabled } from "./knowledge-map-extraction";

type CourseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Enqueue a map for the course's latest saved content while its map lock is held. */
export async function enqueueKnowledgeMapAnalysis(
  tx: CourseTransaction,
  input: { courseId: string; userId: string },
): Promise<{ queued: true; jobId: string } | { queued: false; reason: "disabled" | "no_lessons" | "active_job" | "daily_limit" }> {
  if (!knowledgeMapProducerEnabled()) return { queued: false, reason: "disabled" };

  const [course] = await tx.select().from(courses).where(
    and(eq(courses.id, input.courseId), eq(courses.instructorId, input.userId)),
  );
  if (!course || course.status === "pending") throw new Error("course_not_editable");

  const lessons = await tx.select({ id: courseLessons.id }).from(courseLessons)
    .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .where(eq(courseChapters.courseId, input.courseId));
  if (!lessons.length) return { queued: false, reason: "no_lessons" };

  try {
    await assertNoActiveAiJob(tx, { type: "knowledge_map", userId: input.userId, resourceId: input.courseId });
    const jobId = await enqueueAiJob(tx, {
      type: "knowledge_map",
      userId: input.userId,
      resourceId: input.courseId,
      payload: { generation: course.knowledgeMapContentGeneration ?? 0 },
    });
    await tx.update(courses).set({ knowledgeMapStatus: "analysing" })
      .where(eq(courses.id, input.courseId));
    return { queued: true, jobId };
  } catch (error) {
    if (error instanceof AiJobEnqueueError && error.code === "active_job")
      return { queued: false, reason: "active_job" };
    if (error instanceof AiJobEnqueueError && error.code === "daily_limit")
      return { queued: false, reason: "daily_limit" };
    throw error;
  }
}

/** Use after content writes; verifies ownership again under the knowledge-map lock. */
export async function enqueueLatestKnowledgeMapAnalysis(
  db: Database,
  input: { courseId: string; userId: string },
) {
  return db.transaction(async (tx) => {
    await lockKnowledgeMap(tx, input.courseId, "write");
    return enqueueKnowledgeMapAnalysis(tx, input);
  });
}
