import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { ROLE } from "@codi-1/auth";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courseChapters, courseLessons, courses, lessonSkills, skillPrerequisites, skills } from "@codi-1/db";
import { AiJobLeaseError, finishAiJob, lockAiJob, type AiJob } from "@codi-1/db/ai-jobs";
import { lockKnowledgeMap } from "./confirmed-knowledge-map";
import { extractKnowledgeMap, knowledgeMapWorkerConfigured, type KnowledgeMapLesson } from "./knowledge-map-extraction";

async function hasActiveLecturer(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], userId: string): Promise<boolean> {
  const result = await tx.execute(sql`select ${user.id} from ${user} join ${userRoles} on ${userRoles.userId} = ${user.id}
    where ${user.id} = ${userId} and ${user.banned} is not true and ${userRoles.roleId} = ${ROLE.LECTURER}
      and ${userRoles.revokedAt} is null for share of ${user}, ${userRoles}`);
  return result.rows.length > 0;
}

const key = (name: string) => name.trim().toLocaleLowerCase("vi");

/** No transaction is held across the model call. The lease and content version fence publication. */
export async function runKnowledgeMapJob(
  db: Database,
  job: AiJob,
  generate: typeof extractKnowledgeMap = extractKnowledgeMap,
): Promise<void> {
  if (job.type !== "knowledge_map") throw new Error("unexpected_job_type");
  const payload = job.payload as { generation?: unknown } | null;
  const generation = payload?.generation;
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) throw new Error("invalid_job_payload");
  try {
    if (!knowledgeMapWorkerConfigured()) throw new Error("worker_not_configured");
    const lessons = await db.transaction(async (tx) => {
      await lockAiJob(tx, job.id, job.leaseToken);
      await lockKnowledgeMap(tx, job.resourceId, "write");
      const allowed = await hasActiveLecturer(tx, job.userId);
      const [course] = await tx.select().from(courses).where(eq(courses.id, job.resourceId));
      if (!allowed || !course || course.instructorId !== job.userId || course.status === "pending" ||
          course.knowledgeMapStatus !== "analysing" || course.knowledgeMapContentGeneration !== generation) {
        throw new Error("stale_or_unauthorized");
      }
      return tx.select({ id: courseLessons.id, title: courseLessons.title, description: courseLessons.description, body: courseLessons.body })
        .from(courseLessons).innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
        .where(eq(courseChapters.courseId, job.resourceId))
        .orderBy(asc(courseChapters.position), asc(courseLessons.position));
    });
    const { output, alias, model } = await generate(lessons as KnowledgeMapLesson[], AbortSignal.timeout(180_000));
    await db.transaction(async (tx) => {
      await lockAiJob(tx, job.id, job.leaseToken);
      await lockKnowledgeMap(tx, job.resourceId, "write");
      const allowed = await hasActiveLecturer(tx, job.userId);
      const [course] = await tx.select().from(courses).where(eq(courses.id, job.resourceId));
      if (!allowed || !course || course.instructorId !== job.userId || course.status === "pending" ||
          course.knowledgeMapStatus !== "analysing" || course.knowledgeMapContentGeneration !== generation) {
        await finishAiJob(tx, job.id, job.leaseToken, "failed", "content_changed");
        if (course && course.instructorId === job.userId && course.knowledgeMapStatus === "analysing") {
          await tx.update(courses).set({ knowledgeMapStatus: "stale" }).where(eq(courses.id, job.resourceId));
        }
        return;
      }
      const existing = await tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.courseId, job.resourceId));
      const byName = new Map<string, number>();
      for (const item of existing) {
        const name = key(item.name);
        if (byName.has(name)) throw new Error("ambiguous_existing_concepts");
        byName.set(name, item.id);
      }
      const newIds = new Set<number>();
      const existingIds = existing.map((item) => item.id);
      const oldLinks = existingIds.length ? await tx.select({ lessonId: lessonSkills.lessonId, skillId: lessonSkills.skillId })
        .from(lessonSkills).where(inArray(lessonSkills.skillId, existingIds)) : [];
      const oldLinkKeys = new Set(oldLinks.map((link) => JSON.stringify([link.skillId, link.lessonId])));
      for (const item of output.concepts) {
        let id = byName.get(key(item.name));
        if (!id) {
          const [inserted] = await tx.insert(skills).values({ courseId: job.resourceId, name: item.name, description: item.description, source: "ai", review: "suggested" }).returning({ id: skills.id });
          if (!inserted) throw new Error("insert_failed");
          id = inserted.id;
          byName.set(key(item.name), id);
          newIds.add(id);
        }
        const links = [...new Set(item.lessons)].map((lesson) => alias.get(lesson)).filter((lesson): lesson is string => !!lesson);
        if (links.length !== new Set(item.lessons).size) throw new Error("invalid_lesson");
        // Do not silently discard model suggestions about previously reviewed links.
        if (!newIds.has(id)) {
          if (links.some((lesson) => !oldLinkKeys.has(JSON.stringify([id, lesson])))) throw new Error("manual_reconciliation_required");
          continue;
        }
        if (links.length) await tx.insert(lessonSkills).values(links.map((lessonId) => ({ lessonId, skillId: id! }))).onConflictDoNothing();
      }
      for (const edge of output.edges) {
        const from = byName.get(key(edge.from));
        const to = byName.get(key(edge.to));
        if (!from || !to || from === to) throw new Error("invalid_edge");
        // A new edge has its own review state; existing edges remain unchanged.
        await tx.insert(skillPrerequisites).values({ prerequisiteSkillId: from, skillId: to, source: "ai", review: "suggested" }).onConflictDoNothing();
      }
      await tx.update(courses).set({ knowledgeMapStatus: "ready", knowledgeMapGeneratedAt: new Date(),
        knowledgeMapModel: model, knowledgeMapAnalysisGeneration: generation as number }).where(and(eq(courses.id, job.resourceId), eq(courses.instructorId, job.userId)));
      await finishAiJob(tx, job.id, job.leaseToken, "completed");
    });
  } catch (error) {
    if (error instanceof AiJobLeaseError) return;
    try {
      await db.transaction(async (tx) => {
        await lockAiJob(tx, job.id, job.leaseToken);
        await lockKnowledgeMap(tx, job.resourceId, "write");
        const [course] = await tx.select().from(courses).where(eq(courses.id, job.resourceId));
        if (course && course.instructorId === job.userId && course.knowledgeMapStatus === "analysing") {
          await tx.update(courses).set({ knowledgeMapStatus: course.knowledgeMapContentGeneration === generation ? "failed" : "stale" }).where(eq(courses.id, job.resourceId));
        }
        await finishAiJob(tx, job.id, job.leaseToken, "failed", "analysis_failed");
      });
    } catch (finishError) {
      if (!(finishError instanceof AiJobLeaseError)) throw finishError;
    }
  }
}

/** Reconcile a failed/expired job while the queue row is locked by the worker. */
export async function reconcileKnowledgeMapFailure(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  job: AiJob,
): Promise<void> {
  if (job.type !== "knowledge_map") return;
  const generation = (job.payload as { generation?: unknown } | null)?.generation;
  await lockKnowledgeMap(tx, job.resourceId, "write");
  const [course] = await tx.select().from(courses).where(eq(courses.id, job.resourceId));
  if (!course || course.instructorId !== job.userId || course.knowledgeMapStatus !== "analysing") return;
  await tx.update(courses).set({ knowledgeMapStatus: course.knowledgeMapContentGeneration === generation ? "failed" : "stale" }).where(eq(courses.id, job.resourceId));
}
