// Shared course context for every AI feature that grounds its answer in a course's own material (learner chat,
// lecturer Q&A drafts, grading drafts). It wraps searchCourseKnowledge, which stays the only place that talks to the
// embedding model and SQL, and tells callers why nothing came back. Learner-visible scope: published lessons only.
import type { Database } from "@codi-1/db";
import { clip } from "./ai-tutor-contract";
import { searchCourseKnowledge, type KnowledgeSearch } from "./course-knowledge";

const EXCERPT_CHARS = 600;
const DEFAULT_LIMIT = 4;

export type CourseContextHit = {
  lessonId: string;
  lessonTitle: string;
  chapter: string;
  sourceTitle: string;
  content: string;
  score: number;
  href: string;
};

export type CourseContext =
  | { status: "ok"; hits: CourseContextHit[] }
  | { status: "no_match" }
  | { status: "unavailable"; reason: "not_configured" | "not_indexed" | "search_failed" };

/** Learner lesson link; sources shown to lecturers point where a learner would read them. */
export const lessonHref = (courseId: string, lessonId: string) =>
  `/learn/${encodeURIComponent(courseId)}/${encodeURIComponent(lessonId)}`;

/** Maps a raw search result to the shared contract (pure, unit-tested). */
export function toCourseContext(courseId: string, search: KnowledgeSearch): CourseContext {
  if (search.status === "ok") {
    return {
      status: "ok",
      hits: search.hits.map((hit) => ({
        ...hit,
        content: clip(hit.content, EXCERPT_CHARS).text,
        href: lessonHref(courseId, hit.lessonId),
      })),
    };
  }
  if (search.status === "no_match") return { status: "no_match" };
  return { status: "unavailable", reason: search.status };
}

export async function courseContext(
  db: Database,
  courseId: string,
  query: string,
  options: { limit?: number } = {},
): Promise<CourseContext> {
  const text = query.trim();
  if (!text) return { status: "no_match" };
  const limit = Math.min(10, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  return toCourseContext(courseId, await searchCourseKnowledge(db, courseId, text.slice(0, 2000), limit));
}
