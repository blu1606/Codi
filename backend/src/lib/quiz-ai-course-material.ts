import { asc, eq } from "drizzle-orm";
import { courseChapters, courseDetails, courseLessons } from "@codi-1/db";
import type { db } from "@/services";

/** Cap for the whole-course material of the entry (diagnostic) test. Lesson quizzes keep their own cap. */
export const AI_QUIZ_MAX_COURSE_MATERIAL_CHARS = 24000;

export interface CourseQuizLesson {
  title: string;
  description?: string | null;
  body?: string | null;
}

export interface CourseQuizChapter {
  title: string;
  lessons: CourseQuizLesson[];
}

export interface CourseQuizSource {
  title: string;
  description?: string | null;
  learningOutcomes?: string[];
  chapters: CourseQuizChapter[];
}

interface LessonBlock {
  title: string;
  content: string;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderMaterial(header: string, chapters: { title: string; lessons: LessonBlock[] }[]): string {
  const sections = chapters.map((chapter) => {
    const lessons = chapter.lessons.map((lesson) =>
      lesson.content ? `### Bài: ${lesson.title}\n${lesson.content}` : `### Bài: ${lesson.title}`,
    );
    return [`## Chương: ${chapter.title}`, ...lessons].join("\n\n");
  });
  return [header, ...sections].filter(Boolean).join("\n\n");
}

/**
 * Builds the reading material for the course-level entry test from the course title, description, learning
 * outcomes, chapter titles and every lesson's title, description and reading text.
 *
 * Titles and the course header are always kept. The text budget is shared fairly between lessons: short lessons
 * are kept whole, and long ones share what is left evenly, so later chapters are not cut off.
 * Returns "" when the course has no text to read (titles alone do not count).
 */
export function buildCourseQuizMaterial(source: CourseQuizSource, maxChars = AI_QUIZ_MAX_COURSE_MATERIAL_CHARS): string {
  const outcomes = (source.learningOutcomes ?? []).map(cleanText).filter(Boolean);
  const courseDescription = cleanText(source.description);
  const lessonContents = source.chapters.map((chapter) =>
    chapter.lessons.map((lesson) => [cleanText(lesson.description), cleanText(lesson.body)].filter(Boolean).join("\n\n")),
  );
  const hasText = Boolean(courseDescription || outcomes.length
    || lessonContents.some((contents) => contents.some(Boolean)));
  if (!hasText) return "";

  const headerLines = [`# Khoá học: ${cleanText(source.title)}`];
  if (courseDescription) headerLines.push(`Mô tả khoá học: ${courseDescription}`);
  if (outcomes.length) headerLines.push(`Mục tiêu học tập:\n${outcomes.map((o) => `- ${o}`).join("\n")}`);
  const header = headerLines.join("\n\n").slice(0, Math.floor(maxChars / 3));

  const chapters = source.chapters.map((chapter, c) => ({
    title: cleanText(chapter.title),
    lessons: chapter.lessons.map((lesson, l) => ({
      title: cleanText(lesson.title),
      content: lessonContents[c][l],
    })),
  }));

  // Budget left for lesson text once the titles and separators are in place.
  const skeleton = renderMaterial(header, chapters.map((chapter) => ({
    title: chapter.title,
    lessons: chapter.lessons.map((lesson) => ({ title: lesson.title, content: "" })),
  })));
  // Each lesson with text also takes one line break before its content.
  const withText = chapters
    .flatMap((chapter) => chapter.lessons)
    .filter((lesson) => lesson.content.length > 0)
    .sort((a, b) => a.content.length - b.content.length);
  let budget = Math.max(0, maxChars - skeleton.length - withText.length);

  // Max-min fair share: smallest lessons first, each takes at most an equal share of what remains.
  let pending = withText.length;
  for (const lesson of withText) {
    const share = Math.floor(budget / pending);
    pending -= 1;
    if (lesson.content.length <= share) {
      budget -= lesson.content.length;
    } else if (share <= 1) {
      lesson.content = "";
    } else {
      lesson.content = `${lesson.content.slice(0, share - 1).trimEnd()}…`;
      budget -= lesson.content.length;
    }
  }

  return renderMaterial(header, chapters).slice(0, maxChars);
}

/**
 * Loads the course outline and reading text for the entry test. The caller must have checked that the lecturer
 * owns the course. Includes unpublished lessons, as the lecturer's own lesson quizzes do.
 */
export async function loadCourseQuizMaterial(
  executor: Pick<typeof db, "select">,
  course: { id: string; title: string; description: string | null },
  maxChars = AI_QUIZ_MAX_COURSE_MATERIAL_CHARS,
): Promise<string> {
  const [details] = await executor
    .select({ learningOutcomes: courseDetails.learningOutcomes })
    .from(courseDetails)
    .where(eq(courseDetails.courseId, course.id))
    .limit(1);
  const chapterRows = await executor
    .select({ id: courseChapters.id, title: courseChapters.title })
    .from(courseChapters)
    .where(eq(courseChapters.courseId, course.id))
    .orderBy(asc(courseChapters.position), asc(courseChapters.id));
  const lessonRows = await executor
    .select({
      chapterId: courseLessons.chapterId,
      title: courseLessons.title,
      description: courseLessons.description,
      body: courseLessons.body,
    })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .where(eq(courseChapters.courseId, course.id))
    .orderBy(asc(courseLessons.position), asc(courseLessons.id));

  const lessonsByChapter = new Map<string, CourseQuizLesson[]>();
  for (const row of lessonRows) {
    const list = lessonsByChapter.get(row.chapterId) ?? [];
    list.push({ title: row.title, description: row.description, body: row.body });
    lessonsByChapter.set(row.chapterId, list);
  }

  return buildCourseQuizMaterial({
    title: course.title,
    description: course.description,
    learningOutcomes: details?.learningOutcomes ?? [],
    chapters: chapterRows.map((chapter) => ({
      title: chapter.title,
      lessons: lessonsByChapter.get(chapter.id) ?? [],
    })),
  }, maxChars);
}
