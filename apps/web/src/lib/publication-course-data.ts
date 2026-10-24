import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { assessments, codingExercises, codingTestCases, courseChapters, courseDetails, courseLessons,
  courses, lessonMaterials, quizOptions, quizQuestions } from "@codi-1/db";
import type { CourseDataForReview } from "./publication-service";
import { db } from "@/services";

function parseInstructions(value: string | null): string[] {
  if (!value) return [];
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) return parsed; }
  catch { /* Plain-text instructions are also supported. */ }
  return [value];
}

/**
 * Builds standard CourseDataForReview structure from database for a given course.
 */
export async function fetchCourseDataForReview(courseId: string, store: Pick<typeof db, "select"> = db): Promise<{
  courseRow: typeof courses.$inferSelect;
  courseData: CourseDataForReview;
}> {
  const [courseRow] = await store
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRow) {
    throw new Error("Không tìm thấy khoá học.");
  }

  const [details] = await store
    .select()
    .from(courseDetails)
    .where(eq(courseDetails.courseId, courseId));

  const chapters = await store
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.position));

  const chapterIds = chapters.map((ch) => ch.id);

  let lessons: Array<typeof courseLessons.$inferSelect> = [];
  if (chapterIds.length > 0) {
    lessons = await store
      .select()
      .from(courseLessons)
      .where(inArray(courseLessons.chapterId, chapterIds))
      .orderBy(asc(courseLessons.position));
  }

  const lessonIds = lessons.map((l) => l.id);

  // Lesson materials
  let materials: Array<typeof lessonMaterials.$inferSelect> = [];
  if (lessonIds.length > 0) {
    materials = await store
      .select()
      .from(lessonMaterials)
      .where(inArray(lessonMaterials.lessonId, lessonIds));
  }

  // Assessments for course
  const courseAssessments = await store
    .select()
    .from(assessments)
    .where(eq(assessments.courseId, courseId));

  const entryAssessment = courseAssessments.find((a) => a.isDiagnostic);
  const assessmentIds = courseAssessments.map((a) => a.id);

  // Quiz questions & options
  let options: Array<typeof quizOptions.$inferSelect> = [];
  let questions: Array<typeof quizQuestions.$inferSelect> = [];
  if (assessmentIds.length > 0) {
    questions = await store
      .select(getTableColumns(quizQuestions))
      .from(quizQuestions)
      .innerJoin(assessments, eq(quizQuestions.assessmentId, assessments.id))
      .where(and(inArray(quizQuestions.assessmentId, assessmentIds),
        // Current schema retains old revisions for immutable learner attempts.
        sql`${quizQuestions}."quiz_revision" = ${assessments}."current_quiz_revision"`))
      .orderBy(asc(quizQuestions.position));

    const questionIds = questions.map((q) => q.id);
    if (questionIds.length > 0) {
      options = await store
        .select()
        .from(quizOptions)
        .where(inArray(quizOptions.questionId, questionIds))
        .orderBy(asc(quizOptions.position));
    }
  }

  // Coding exercises and test cases
  const codingAssessmentIds = courseAssessments
    .filter((a) => a.type === "coding")
    .map((a) => a.id);

  let exercises: Array<typeof codingExercises.$inferSelect> = [];
  let testCases: Array<typeof codingTestCases.$inferSelect> = [];

  if (codingAssessmentIds.length > 0) {
    exercises = await store
      .select()
      .from(codingExercises)
      .where(inArray(codingExercises.assessmentId, codingAssessmentIds));

    const exIds = exercises.map((e) => e.id);
    if (exIds.length > 0) {
      testCases = await store
        .select()
        .from(codingTestCases)
        .where(inArray(codingTestCases.exerciseId, exIds))
        .orderBy(asc(codingTestCases.position));
    }
  }

  // Transform into CourseDataForReview
  const transformedChapters = chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    lessons: lessons
      .filter((l) => l.chapterId === ch.id)
      .map((l) => {
        const lMaterials = materials.filter((m) => m.lessonId === l.id);
        const lQuizAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "quiz"
        );
        const lCodingAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "coding"
        );
        const lAssignmentAssessment = courseAssessments.find(
          (a) => a.lessonId === l.id && a.type === "assignment"
        );

        let quizObj = null;
        if (lQuizAssessment) {
          const qList = questions.filter((q) => q.assessmentId === lQuizAssessment.id);
          quizObj = {
            id: lQuizAssessment.id,
            passingScore: lQuizAssessment.passingScore,
            questions: qList.map((q) => {
              const qOpts = options
                .filter((o) => o.questionId === q.id)
                .sort((a, b) => a.position - b.position);
              return {
              id: q.id,
              text: q.text,
              explanation: q.explanation,
                options: qOpts.map((o) => o.text),
                correctIndex: qOpts.findIndex((o) => o.isCorrect),
                aiGenerated: null,
                aiReviewed: null,
              };
            }),
          };
        }

        let codeObj = null;
        if (lCodingAssessment) {
          const ex = exercises.find((e) => e.assessmentId === lCodingAssessment.id);
          const tests = ex ? testCases.filter((t) => t.exerciseId === ex.id) : [];
          codeObj = {
            kind: "challenge" as const,
            instructions: parseInstructions(lCodingAssessment.instructions),
            starterCode: ex?.starterCode || "",
            tests: tests.map((t) => ({
              id: t.id,
              name: t.name,
              call: t.input || "",
              hidden: !t.isSample,
            })),
            solutionCheck: {
              ok: tests.length > 0 && !!ex?.solutionVerifiedAt,
              passed: tests.length,
              total: tests.length,
            },
          };
        }

        let assignmentObj = null;
        if (lAssignmentAssessment) {
          let rubric: any[] = [];
          if (lAssignmentAssessment.rubric) {
            try {
              rubric = typeof lAssignmentAssessment.rubric === "string"
                ? JSON.parse(lAssignmentAssessment.rubric)
                : (lAssignmentAssessment.rubric as any);
            } catch {
              rubric = [];
            }
          }
          assignmentObj = {
            instructions: lAssignmentAssessment.instructions || "",
            rubric: Array.isArray(rubric) ? rubric : [],
          };
        }

        return {
          id: l.id,
          title: l.title,
          type: lMaterials.length > 0 ? lMaterials[0].type : "reading",
          durationSeconds: l.durationSeconds,
          body: l.body,
          materials: lMaterials.map((m) => ({
            id: m.id,
            type: m.type,
            title: m.title,
            url: m.url,
            fileName: m.title || m.url,
          })),
          quiz: quizObj,
          code: codeObj,
          assignment: assignmentObj,
        };
      }),
  }));

  const entryQuestions = entryAssessment
    ? questions.filter((q) => q.assessmentId === entryAssessment.id)
    : [];

  const courseData: CourseDataForReview = {
    id: courseRow.id,
    title: courseRow.title,
    description: courseRow.description,
    summary: courseRow.description,
    category: courseRow.category,
    level: courseRow.level,
    price: courseRow.price,
    proposedPrice: (courseRow as any).proposedPrice ?? courseRow.price,
    knowledgeMapStatus: courseRow.knowledgeMapStatus,
    chapters: transformedChapters,
    entryTest: entryAssessment
      ? {
          questions: entryQuestions.map((q) => {
            const qOpts = options
              .filter((o) => o.questionId === q.id)
              .sort((a, b) => a.position - b.position);
            return {
            id: q.id,
            text: q.text,
            explanation: q.explanation,
            options: qOpts.map((o) => o.text),
            correctIndex: qOpts.findIndex((o) => o.isCorrect),
            aiGenerated: null,
            aiReviewed: null,
          };
        }),
        }
      : null,
  };

  return { courseRow, courseData };
}
