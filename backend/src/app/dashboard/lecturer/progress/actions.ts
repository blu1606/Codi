"use server";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  assessmentAnswers,
  assessmentSubmissions,
  assessments,
  courseChapters,
  courseLessons,
  courses,
  lessonProgress,
  quizQuestions,
  studentEnrollments,
  user as userTable,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import {
  calculateAveragePercentage,
  calculateAverageQuizScore,
  calculateLearnerCompletionRate,
  calculateQuestionAccuracy,
  selectLatestCompletedAttempts,
  type CourseProgressDetailDto,
  type CourseProgressSummaryDto,
  type LearnerProgressDto,
} from "@/lib/lecturer-progress-service";

export async function getLecturerCoursesProgress(): Promise<
  CourseProgressSummaryDto[]
> {
  const user = await verifyLecturerSession();
  return db.transaction(
    async (tx) => {
      const owned = await tx
        .select({
          id: courses.id,
          title: courses.title,
          status: courses.status,
        })
        .from(courses)
        .where(
          and(
            eq(courses.instructorId, user.id),
            inArray(courses.status, ["published", "hidden"]),
          ),
        )
        .orderBy(courses.title, courses.id);
      if (!owned.length) return [];
      const ids = owned.map((course) => course.id);
      const lessons = await tx
        .select({ id: courseLessons.id, courseId: courseChapters.courseId })
        .from(courseLessons)
        .innerJoin(
          courseChapters,
          eq(courseLessons.chapterId, courseChapters.id),
        )
        .where(inArray(courseChapters.courseId, ids));
      const enrollments = await tx
        .select({
          id: studentEnrollments.id,
          courseId: studentEnrollments.courseId,
        })
        .from(studentEnrollments)
        .where(inArray(studentEnrollments.courseId, ids));
      const completions =
        enrollments.length && lessons.length
          ? await tx
              .select({
                enrollmentId: lessonProgress.enrollmentId,
                lessonId: lessonProgress.lessonId,
              })
              .from(lessonProgress)
              .where(
                and(
                  inArray(
                    lessonProgress.enrollmentId,
                    enrollments.map((row) => row.id),
                  ),
                  inArray(
                    lessonProgress.lessonId,
                    lessons.map((row) => row.id),
                  ),
                  eq(lessonProgress.status, "completed"),
                ),
              )
          : [];
      return owned.map((course) => {
        const courseLessonIds = new Set(
          lessons
            .filter((lesson) => lesson.courseId === course.id)
            .map((lesson) => lesson.id),
        );
        const students = enrollments.filter(
          (row) => row.courseId === course.id,
        );
        const rates = students.map((row) =>
          calculateLearnerCompletionRate(
            new Set(
              completions
                .filter(
                  (progress) =>
                    progress.enrollmentId === row.id &&
                    courseLessonIds.has(progress.lessonId),
                )
                .map((progress) => progress.lessonId),
            ).size,
            courseLessonIds.size,
          ),
        );
        return {
          courseId: course.id,
          title: course.title,
          status: course.status,
          learnersCount: students.length,
          averageCompletionRate: calculateAveragePercentage(rates),
        };
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getCourseLearnerProgress(
  courseId: string,
): Promise<CourseProgressDetailDto | null> {
  const user = await verifyLecturerSession();
  if (typeof courseId !== "string" || !courseId.trim() || courseId.length > 200)
    return null;
  return db.transaction(
    async (tx) => {
      const [course] = await tx
        .select({ id: courses.id, title: courses.title })
        .from(courses)
        .where(
          and(eq(courses.id, courseId), eq(courses.instructorId, user.id)),
        );
      if (!course) return null;
      const lessons = await tx
        .select({ id: courseLessons.id, title: courseLessons.title })
        .from(courseLessons)
        .innerJoin(
          courseChapters,
          eq(courseLessons.chapterId, courseChapters.id),
        )
        .where(eq(courseChapters.courseId, courseId))
        .orderBy(
          courseChapters.position,
          courseLessons.position,
          courseLessons.id,
        );
      const lessonIds = lessons.map((lesson) => lesson.id);
      const courseAssessments = lessonIds.length
        ? await tx
            .select({
              id: assessments.id,
              lessonId: assessments.lessonId,
              type: assessments.type,
              maxScore: assessments.maxScore,
              currentQuizRevision: assessments.currentQuizRevision,
            })
            .from(assessments)
            .where(
              and(
                eq(assessments.courseId, courseId),
                inArray(assessments.lessonId, lessonIds),
                eq(assessments.isDiagnostic, false),
                eq(assessments.status, "published"),
              ),
            )
        : [];
      const enrollments = await tx
        .select({
          enrollmentId: studentEnrollments.id,
          userId: studentEnrollments.userId,
          userName: userTable.name,
          userImage: userTable.image,
        })
        .from(studentEnrollments)
        .innerJoin(userTable, eq(studentEnrollments.userId, userTable.id))
        .where(eq(studentEnrollments.courseId, courseId))
        .orderBy(desc(studentEnrollments.enrolledAt), studentEnrollments.id);
      const enrollmentIds = enrollments.map((row) => row.enrollmentId);
      const progress =
        enrollmentIds.length && lessonIds.length
          ? await tx
              .select({
                enrollmentId: lessonProgress.enrollmentId,
                lessonId: lessonProgress.lessonId,
                status: lessonProgress.status,
                lastAccessedAt: lessonProgress.lastAccessedAt,
                completedAt: lessonProgress.completedAt,
              })
              .from(lessonProgress)
              .where(
                and(
                  inArray(lessonProgress.enrollmentId, enrollmentIds),
                  inArray(lessonProgress.lessonId, lessonIds),
                ),
              )
          : [];
      const quizzes = courseAssessments.filter(
        (assessment) => assessment.type === "quiz",
      );
      const quizIds = quizzes.map((assessment) => assessment.id);
      const submittedQuizzes =
        quizIds.length && enrollmentIds.length
          ? await tx
              .select({
                id: assessmentSubmissions.id,
                assessmentId: assessmentSubmissions.assessmentId,
                enrollmentId: assessmentSubmissions.enrollmentId,
                status: assessmentSubmissions.status,
                attempt: assessmentSubmissions.attempt,
                quizPercent: assessmentSubmissions.quizPercent,
                quizRevision: assessmentSubmissions.quizRevision,
                submittedAt: assessmentSubmissions.submittedAt,
              })
              .from(assessmentSubmissions)
              .where(
                and(
                  inArray(assessmentSubmissions.assessmentId, quizIds),
                  inArray(assessmentSubmissions.enrollmentId, enrollmentIds),
                  eq(assessmentSubmissions.status, "graded"),
                  isNotNull(assessmentSubmissions.submittedAt),
                ),
              )
              .orderBy(
                desc(assessmentSubmissions.attempt),
                desc(assessmentSubmissions.id),
              )
          : [];
      const completedQuizzes = selectLatestCompletedAttempts(
        submittedQuizzes.map((row) => ({
          ...row,
          lessonId: quizzes.find((quiz) => quiz.id === row.assessmentId)!
            .lessonId,
        })),
      );
      // Historical percentages stay useful, but only current pinned content is question evidence.
      const currentEvidenceIds = completedQuizzes
        .filter(
          (row) =>
            row.quizRevision ===
            quizzes.find((quiz) => quiz.id === row.assessmentId)
              ?.currentQuizRevision,
        )
        .map((row) => row.id);
      const questions = quizIds.length
        ? await tx
            .select({
              id: quizQuestions.id,
              lessonId: assessments.lessonId,
              text: quizQuestions.text,
            })
            .from(quizQuestions)
            .innerJoin(
              assessments,
              eq(quizQuestions.assessmentId, assessments.id),
            )
            .where(
              and(
                inArray(quizQuestions.assessmentId, quizIds),
                eq(assessments.courseId, courseId),
                eq(assessments.isDiagnostic, false),
                eq(assessments.status, "published"),
                eq(quizQuestions.quizRevision, assessments.currentQuizRevision),
              ),
            )
            .orderBy(
              quizQuestions.assessmentId,
              quizQuestions.position,
              quizQuestions.id,
            )
        : [];
      const answers =
        currentEvidenceIds.length && questions.length
          ? await tx
              .select({
                questionId: assessmentAnswers.questionId,
                isCorrect: assessmentAnswers.isCorrect,
              })
              .from(assessmentAnswers)
              .innerJoin(
                assessmentSubmissions,
                eq(assessmentAnswers.submissionId, assessmentSubmissions.id),
              )
              .innerJoin(
                assessments,
                eq(assessmentSubmissions.assessmentId, assessments.id),
              )
              .innerJoin(
                quizQuestions,
                and(
                  eq(assessmentAnswers.questionId, quizQuestions.id),
                  eq(quizQuestions.assessmentId, assessments.id),
                ),
              )
              .innerJoin(
                studentEnrollments,
                eq(assessmentSubmissions.enrollmentId, studentEnrollments.id),
              )
              .where(
                and(
                  inArray(assessmentSubmissions.id, currentEvidenceIds),
                  inArray(assessmentSubmissions.enrollmentId, enrollmentIds),
                  inArray(
                    assessmentAnswers.questionId,
                    questions.map((question) => question.id),
                  ),
                  eq(studentEnrollments.courseId, courseId),
                  eq(assessments.courseId, courseId),
                  eq(assessments.type, "quiz"),
                  eq(assessments.isDiagnostic, false),
                  eq(assessments.status, "published"),
                  eq(assessmentSubmissions.status, "graded"),
                  isNotNull(assessmentSubmissions.submittedAt),
                  isNotNull(assessmentAnswers.isCorrect),
                  eq(
                    assessmentSubmissions.quizRevision,
                    assessments.currentQuizRevision,
                  ),
                  eq(
                    quizQuestions.quizRevision,
                    assessmentSubmissions.quizRevision,
                  ),
                ),
              )
          : [];
      const assignmentIds = courseAssessments
        .filter((assessment) => assessment.type === "assignment")
        .map((assessment) => assessment.id);
      const assignments =
        assignmentIds.length && enrollmentIds.length
          ? await tx
              .select({
                id: assessmentSubmissions.id,
                assessmentId: assessmentSubmissions.assessmentId,
                enrollmentId: assessmentSubmissions.enrollmentId,
                status: assessmentSubmissions.status,
                score: assessmentSubmissions.score,
                submittedAt: assessmentSubmissions.submittedAt,
              })
              .from(assessmentSubmissions)
              .where(
                and(
                  inArray(assessmentSubmissions.assessmentId, assignmentIds),
                  inArray(assessmentSubmissions.enrollmentId, enrollmentIds),
                  inArray(assessmentSubmissions.status, ["pending", "graded"]),
                  isNotNull(assessmentSubmissions.submittedAt),
                ),
              )
              .orderBy(
                desc(assessmentSubmissions.attempt),
                desc(assessmentSubmissions.id),
              )
          : [];
      const learners: LearnerProgressDto[] = enrollments.map((enrollment) => {
        const records = progress.filter(
          (row) => row.enrollmentId === enrollment.enrollmentId,
        );
        const completed = new Set(
          records
            .filter((row) => row.status === "completed")
            .map((row) => row.lessonId),
        );
        const results = completedQuizzes.filter(
          (row) => row.enrollmentId === enrollment.enrollmentId,
        );
        const submittedAssignments = assignments.filter(
          (row) => row.enrollmentId === enrollment.enrollmentId,
        );
        const activity = [
          ...records.flatMap((row) => [row.lastAccessedAt, row.completedAt]),
          ...results.map((row) => row.submittedAt),
          ...submittedAssignments.map((row) => row.submittedAt),
        ]
          .filter((date): date is Date => date !== null)
          .map((date) => date.getTime());
        return {
          userId: enrollment.userId,
          name: enrollment.userName || "Học viên",
          avatar: enrollment.userImage,
          progressPercent: calculateLearnerCompletionRate(
            completed.size,
            lessons.length,
          ),
          completedLessonsCount: completed.size,
          totalLessonsCount: lessons.length,
          averageQuizScore: calculateAverageQuizScore(
            results.map((row) => row.quizPercent),
          ),
          hintUsageCount: null,
          lastActive: activity.length
            ? new Date(Math.max(...activity)).toISOString()
            : null,
          lessons: lessons.map((lesson) => {
            const quiz = results.find((row) => row.lessonId === lesson.id);
            const assignment = submittedAssignments.find(
              (row) =>
                courseAssessments.find(
                  (assessment) => assessment.id === row.assessmentId,
                )?.lessonId === lesson.id,
            );
            return {
              id: lesson.id,
              title: lesson.title,
              isCompleted: completed.has(lesson.id),
              quizScore: quiz?.quizPercent ?? null,
              assignmentSubmission: assignment
                ? {
                    status: assignment.status,
                    score: assignment.score,
                    maxScore: courseAssessments.find(
                      (assessment) => assessment.id === assignment.assessmentId,
                    )!.maxScore,
                  }
                : null,
            };
          }),
        };
      });
      return {
        courseId,
        courseTitle: course.title,
        totalLessons: lessons.length,
        learnersCount: learners.length,
        averageCompletionRate: calculateAveragePercentage(
          learners.map((row) => row.progressPercent),
        ),
        averageQuizScore: calculateAverageQuizScore(
          learners.map((row) => row.averageQuizScore),
        ),
        learners,
        quizQuestions: questions.map((question) => {
          const evidence = answers.filter(
            (answer) =>
              answer.questionId === question.id && answer.isCorrect !== null,
          );
          const correct = evidence.filter(
            (answer) => answer.isCorrect === true,
          ).length;
          return {
            lessonId: question.lessonId,
            lessonTitle:
              lessons.find((lesson) => lesson.id === question.lessonId)
                ?.title || "Bài học",
            questionId: question.id,
            questionText: question.text,
            totalAnswers: evidence.length,
            correctAnswers: correct,
            ...calculateQuestionAccuracy(correct, evidence.length),
          };
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
