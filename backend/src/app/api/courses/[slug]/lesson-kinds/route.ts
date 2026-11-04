import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/services";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { codingExercises } from "@codi-1/db/schema/coding-exercises";
import { assessments } from "@codi-1/db/schema/assessments";
import type { LessonKind } from "@/lib/lesson-kind";

/**
 * Public curriculum labels for a published course: each lesson's content kind (same rule as the learning path)
 * plus whether it carries a published quiz or assignment. GET /api/courses/:slug/lesson-kinds →
 * { lessons: { [lessonId]: { kind, quiz, assignment } } }.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: "Đường dẫn khóa học không hợp lệ." }, { status: 400 });
  }
  try {
    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.slug, slug), eq(courses.status, "published")))
      .limit(1);
    if (!course) return NextResponse.json({ error: "Không tìm thấy khóa học." }, { status: 404 });

    // Correlated subqueries need the outer lesson id qualified (Drizzle strips qualification inside sql``).
    const lessonId = sql.raw('"course_lessons"."id"');
    const published = sql`a.lesson_id = ${lessonId} and a.status = 'published' and a.is_diagnostic = false`;
    const rows = await db
      .select({
        id: courseLessons.id,
        kind: sql<LessonKind>`case
          when exists (select 1 from ${assessments} a join ${codingExercises} e on e.assessment_id = a.id where ${published} and jsonb_array_length(e.tutorial_steps) > 0) then 'tutorial'
          when exists (select 1 from ${assessments} a where ${published} and a.type = 'coding') then 'coding'
          when exists (select 1 from ${lessonMaterials} m where m.lesson_id = ${lessonId} and m.type = 'video') then 'video'
          when exists (select 1 from ${lessonMaterials} m where m.lesson_id = ${lessonId} and m.type in ('pdf', 'slide')) then 'pdf'
          when exists (select 1 from ${assessments} a where ${published} and a.type = 'quiz') then 'quiz'
          else 'reading' end`,
        quiz: sql<boolean>`exists (select 1 from ${assessments} a where ${published} and a.type = 'quiz')`,
        assignment: sql<boolean>`exists (select 1 from ${assessments} a where ${published} and a.type = 'assignment')`,
      })
      .from(courseLessons)
      .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
      .where(and(eq(courseChapters.courseId, course.id), eq(courseChapters.isPublished, true), eq(courseLessons.isPublished, true)));

    const lessons: Record<string, { kind: LessonKind; quiz: boolean; assignment: boolean }> = {};
    for (const row of rows) lessons[row.id] = { kind: row.kind, quiz: !!row.quiz, assignment: !!row.assignment };
    return NextResponse.json({ lessons }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load lesson kinds", error);
    return NextResponse.json({ error: "Không thể tải nội dung khóa học." }, { status: 500 });
  }
}
