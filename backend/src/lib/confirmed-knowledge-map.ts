import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { courses } from "@codi-1/db/schema/courses";
import type { ConfirmedKnowledgeMap } from "@codi-1/db/schema/confirmed-knowledge-map";

// All participants use the same transaction-scoped namespace. Learner writers lock
// enrollment first, then shared graph; authors lock graph before child/course rows
// and never lock enrollment. Do not retain this lock across provider calls.
export async function lockKnowledgeMap(
  store: Pick<Database, "execute">,
  courseId: string,
  mode: "read" | "write",
) {
  const key = `codi:confirmed-knowledge-map:${courseId}`;
  await store.execute(mode === "write"
    ? sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    : sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`);
  if (mode === "write") {
    // Hold lifecycle/ownership stable as well, including non-graph admin writers.
    await store.execute(sql`select ${courses.id} from ${courses} where ${courses.id} = ${courseId} for update`);
  }
}

export function readConfirmedKnowledgeMap(
  course: { confirmedKnowledgeMap?: ConfirmedKnowledgeMap | null },
  liveLessonIds: readonly string[],
) {
  const payload = course.confirmedKnowledgeMap;
  if (!payload || payload.version !== 1) return null;
  const lessons = new Set(liveLessonIds);
  const links = payload.links.filter((link) => lessons.has(link.lessonId));
  return {
    ...payload,
    // Publication stays stable; only lesson accessibility is live. In particular,
    // an unpublished lesson is never returned just because its old link survived.
    links,
  };
}

export async function loadConfirmedKnowledgeMap(
  store: Pick<Database, "select">,
  course: { id: string; confirmedKnowledgeMap?: ConfirmedKnowledgeMap | null },
) {
  if (!course.confirmedKnowledgeMap) return null;
  const lessons = await store.select({ id: courseLessons.id }).from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(and(eq(courseChapters.courseId, course.id), eq(courseChapters.isPublished, true),
      eq(courseLessons.isPublished, true)));
  return readConfirmedKnowledgeMap(course, lessons.map((lesson) => lesson.id));
}
