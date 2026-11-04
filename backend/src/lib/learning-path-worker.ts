import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { learningPathJobs } from "@codi-1/db/schema/learning-path-runtime";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import type { createLearningPathService } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";

/**
 * Process one unclaimed job or reconcile an expired claim without a model call.
 * The service takes the row lock and fences the observed job ID.
 */
export async function runLearningPathWorkerOnce(
  db: Pick<Database, "select" | "transaction">,
  service: Pick<ReturnType<typeof createLearningPathService>, "runPending">,
): Promise<boolean> {
  const [job] = await db
    .select({
      id: learningPathJobs.id,
      enrollmentId: studentEnrollments.id,
      userId: studentEnrollments.userId,
      courseId: studentEnrollments.courseId,
    })
    .from(learningPathJobs)
    .innerJoin(studentEnrollments, eq(studentEnrollments.id, learningPathJobs.enrollmentId))
    .where(and(isNull(learningPathJobs.finishedAt), or(isNull(learningPathJobs.leaseToken), lte(learningPathJobs.leaseExpiresAt, new Date()))))
    .orderBy(asc(learningPathJobs.createdAt), asc(learningPathJobs.id))
    .limit(1);
  if (!job) return false;
  try {
    await service.runPending(job.userId, job.courseId, { observedJobId: job.id });
  } catch (error) {
    // An inaccessible enrollment is permanent for this attempt, unlike a DB
    // outage. Finish only this unclaimed/expired job so it cannot starve the queue.
    if (!(error instanceof LearningPathError) || ![403, 404].includes(error.status)) throw error;
    await db.transaction(async (tx) => {
      // Same lock order as runPending: enrollment before job.
      const [enrollment] = await tx.select({ id: studentEnrollments.id })
        .from(studentEnrollments).where(eq(studentEnrollments.id, job.enrollmentId)).for("update");
      if (!enrollment) return;
      const [finished] = await tx.update(learningPathJobs).set({ finishedAt: new Date() }).where(and(
        eq(learningPathJobs.id, job.id), isNull(learningPathJobs.finishedAt),
        or(isNull(learningPathJobs.leaseToken), lte(learningPathJobs.leaseExpiresAt, new Date())),
      )).returning({ id: learningPathJobs.id });
      if (!finished) return;
      await tx.update(studentEnrollments).set({ pathStatus: "failed" }).where(and(
        eq(studentEnrollments.id, job.enrollmentId), eq(studentEnrollments.pathStatus, "generating"),
        sql`not exists (select 1 from ${learningPathJobs} pending where pending.enrollment_id = ${job.enrollmentId} and pending.finished_at is null)`,
      ));
    });
  }
  return true;
}
