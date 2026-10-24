import assert from "node:assert/strict";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { assessments, quizQuestions } from "@codi-1/db/schema/assessments";
import {
  courseChapters,
  courseLessons,
} from "@codi-1/db/schema/course-content";
import { lessonSkills } from "@codi-1/db/schema/knowledge-map";
import {
  lessonProgress,
  pathItems,
  personalizedLearningPaths,
} from "@codi-1/db/schema/learning";
import { learningPathCompletions } from "@codi-1/db/schema/learning-path-runtime";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const PRACTICE_SPLIT = {
  courseId: "dev-practice-quiz-code",
  codeLessonId: "eeb00ab1-10c0-4d69-a0fc-731c1788f101",
  quizLessonId: "c937bd55-1283-493e-bca0-31047cd80aa3",
};

// Move the assessment, never recreate it: attempts, answers and grading evidence
// continue to reference the same IDs. The code lesson and its workspaces stay put.
export async function splitPracticeLessons(
  tx: Transaction,
  target = PRACTICE_SPLIT,
) {
  const { courseId, codeLessonId, quizLessonId } = target;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${courseId}))`);
  const enrollments = await tx
    .select({ id: studentEnrollments.id })
    .from(studentEnrollments)
    .where(eq(studentEnrollments.courseId, courseId))
    .for("update");
  const [code] = await tx
    .select({ lesson: courseLessons })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(
      and(
        eq(courseLessons.id, codeLessonId),
        eq(courseChapters.courseId, courseId),
      ),
    );
  assert.ok(code, "Expected practice code lesson missing");
  const quizzes = await tx
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.courseId, courseId),
        eq(assessments.type, "quiz"),
        eq(assessments.isDiagnostic, false),
        eq(assessments.status, "published"),
      ),
    );
  assert.equal(quizzes.length, 1, "Expected exactly one practice quiz");
  const quiz = quizzes[0]!;
  assert.ok([codeLessonId, quizLessonId].includes(quiz.lessonId!));
  const [existing] = await tx
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.id, quizLessonId));
  if (!existing) {
    await tx
      .update(courseLessons)
      .set({ position: sql`${courseLessons.position} + 1` })
      .where(
        and(
          eq(courseLessons.chapterId, code.lesson.chapterId),
          gte(courseLessons.position, code.lesson.position),
        ),
      );
    await tx.insert(courseLessons).values({
      id: quizLessonId,
      chapterId: code.lesson.chapterId,
      position: code.lesson.position,
      title: "Quiz: Kiểu dữ liệu và chuỗi",
      description: "Ôn tập kiến thức qua 3 câu hỏi trắc nghiệm.",
      durationSeconds: 600,
      isPublished: true,
      body: "Ôn tập nhanh: string biểu diễn văn bản; toUpperCase() chuyển chuỗi thành chữ hoa; length là thuộc tính lấy độ dài chuỗi.\n\nBắt đầu quiz bên dưới để trả lời 3 câu hỏi. Cần đạt ít nhất 70%; bạn có thể làm lại và xem giải thích sau khi nộp bài.",
    });
  } else assert.equal(existing.chapterId, code.lesson.chapterId);
  await tx
    .update(courseLessons)
    .set({
      title: "Thực hành code: Tổng các số chẵn",
      durationSeconds: 1200,
      description: "Viết hàm JavaScript và chạy test ngay trong trình duyệt.",
      body: "Viết hàm sumEven(numbers) trả về tổng các số chẵn trong mảng. Bấm Chạy để thử test mẫu, rồi Nộp bài để chấm toàn bộ test. Bản nháp được tự động lưu.",
    })
    .where(eq(courseLessons.id, codeLessonId));
  await tx
    .update(assessments)
    .set({ lessonId: quizLessonId })
    .where(eq(assessments.id, quiz.id));
  await tx
    .update(quizQuestions)
    .set({ lessonId: quizLessonId })
    .where(
      and(
        eq(quizQuestions.assessmentId, quiz.id),
        eq(quizQuestions.lessonId, codeLessonId),
      ),
    );
  const links = await tx
    .select()
    .from(lessonSkills)
    .where(eq(lessonSkills.lessonId, codeLessonId));
  if (links.length)
    await tx
      .insert(lessonSkills)
      .values(links.map((l) => ({ ...l, lessonId: quizLessonId })))
      .onConflictDoNothing();
  // A completed combined lesson proves both requirements were met. Preserve that
  // completion, but never infer a quiz pass from an unfinished code draft.
  const completed = await tx
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.lessonId, codeLessonId),
        eq(lessonProgress.status, "completed"),
      ),
    );
  if (completed.length) {
    await tx
      .insert(lessonProgress)
      .values(
        completed.map(({ id: _id, ...p }) => ({
          ...p,
          lessonId: quizLessonId,
          studiedAt: p.studiedAt ?? p.completedAt,
          mediaProgress: {},
          lastPositionSeconds: null,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(learningPathCompletions)
      .values(
        completed.map((p) => ({
          enrollmentId: p.enrollmentId,
          lessonId: quizLessonId,
        })),
      )
      .onConflictDoNothing();
  }
  for (const enrollment of enrollments) {
    const paths = await tx
      .select()
      .from(personalizedLearningPaths)
      .where(
        and(
          eq(personalizedLearningPaths.enrollmentId, enrollment.id),
          eq(personalizedLearningPaths.status, "active"),
        ),
      );
    for (const path of paths) {
      const items = await tx
        .select()
        .from(pathItems)
        .where(eq(pathItems.pathId, path.id))
        .orderBy(desc(pathItems.position));
      if (items.some((i) => i.lessonId === quizLessonId)) continue;
      const position =
        items.find((i) => i.lessonId === codeLessonId)?.position ?? 1;
      // Descending updates preserve the unique (path_id, position) constraint.
      for (const item of items.filter((i) => i.position >= position)) {
        await tx
          .update(pathItems)
          .set({ position: item.position + 1 })
          .where(eq(pathItems.id, item.id));
      }
      await tx
        .insert(pathItems)
        .values({
          pathId: path.id,
          lessonId: quizLessonId,
          position,
          isSkippable: false,
          reason: "Ôn tập kiến thức trước khi thực hành code.",
          estimatedMinutes: 10,
        });
    }
  }
  await tx.execute(sql`update student_enrollments e set progress = (
    select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where p.status = 'completed') / count(*)) end
    from course_lessons l join course_chapters c on c.id = l.chapter_id
    left join lesson_progress p on p.lesson_id = l.id and p.enrollment_id = e.id
    where c.course_id = e.course_id and l.is_published = true
  ) where e.course_id = ${courseId}`);
  return {
    courseId,
    codeLessonId,
    quizLessonId,
    quizAssessmentId: quiz.id,
    enrollments: enrollments.length,
  };
}
