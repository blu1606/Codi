"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  aiInteractionLogs,
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
  type CourseProgressDetailDto,
  type CourseProgressSummaryDto,
  type LearnerProgressDto,
  type QuizQuestionStatDto,
} from "@/lib/lecturer-progress-service";

/**
 * Lấy danh sách khoá học của giảng viên cùng số liệu tiến độ tổng quát (Screen S29).
 * Chỉ bao gồm các khoá học đã xuất bản hoặc đã ẩn (đang/từng mở bán).
 */
export async function getLecturerCoursesProgress(): Promise<CourseProgressSummaryDto[]> {
  const user = await verifyLecturerSession();

  // 1. Lấy danh sách khoá học thuộc sở hữu của giảng viên
  const myCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
    })
    .from(courses)
    .where(
      and(
        eq(courses.instructorId, user.id),
        inArray(courses.status, ["published", "hidden"])
      )
    );

  if (!myCourses.length) {
    return [];
  }

  const courseIds = myCourses.map((c) => c.id);

  // 2. Lấy danh sách bài học của các khoá này (qua courseChapters)
  const lessons = await db
    .select({
      id: courseLessons.id,
      courseId: courseChapters.courseId,
    })
    .from(courseLessons)
    .innerJoin(
      courseChapters,
      eq(courseLessons.chapterId, courseChapters.id)
    )
    .where(inArray(courseChapters.courseId, courseIds));

  const totalLessonsByCourse = new Map<string, number>();
  lessons.forEach((l) => {
    totalLessonsByCourse.set(
      l.courseId,
      (totalLessonsByCourse.get(l.courseId) || 0) + 1
    );
  });

  // 3. Lấy danh sách lượt đăng ký (enrollments)
  const enrollments = await db
    .select({
      id: studentEnrollments.id,
      courseId: studentEnrollments.courseId,
      progress: studentEnrollments.progress,
    })
    .from(studentEnrollments)
    .where(inArray(studentEnrollments.courseId, courseIds));

  // 4. Lấy số bài học hoàn thành theo enrollment
  const completedProgress = await db
    .select({
      enrollmentId: lessonProgress.enrollmentId,
      completedCount: sql<number>`count(${lessonProgress.id})`,
    })
    .from(lessonProgress)
    .where(eq(lessonProgress.status, "completed"))
    .groupBy(lessonProgress.enrollmentId);

  const completedMap = new Map<number, number>();
  completedProgress.forEach((cp) => {
    completedMap.set(cp.enrollmentId, Number(cp.completedCount));
  });

  // 5. Tổng hợp theo từng khoá học
  return myCourses.map((c) => {
    const courseEnrollments = enrollments.filter((e) => e.courseId === c.id);
    const totalLessons = totalLessonsByCourse.get(c.id) || 0;

    const completionRates = courseEnrollments.map((e) => {
      const completed = completedMap.get(e.id) || 0;
      return calculateLearnerCompletionRate(completed, totalLessons);
    });

    const avgRate = calculateAveragePercentage(completionRates);

    return {
      courseId: c.id,
      title: c.title,
      status: c.status,
      learnersCount: courseEnrollments.length,
      averageCompletionRate: avgRate,
    };
  });
}

/**
 * Lấy chi tiết tiến độ học viên của một khoá học cụ thể (Screen S29 & S29 Drill-down).
 * Kiểm tra phân quyền sở hữu khoá ở server (Server Guard).
 */
export async function getCourseLearnerProgress(
  courseId: string
): Promise<CourseProgressDetailDto | null> {
  const user = await verifyLecturerSession();

  // 1. Kiểm tra khoá học và quyền sở hữu
  const [course] = await db
    .select({
      id: courses.id,
      title: courses.title,
      instructorId: courses.instructorId,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    return null;
  }

  // 2. Lấy danh sách bài học của khoá (qua courseChapters)
  const lessons = await db
    .select({
      id: courseLessons.id,
      title: courseLessons.title,
      position: courseLessons.position,
    })
    .from(courseLessons)
    .innerJoin(
      courseChapters,
      eq(courseLessons.chapterId, courseChapters.id)
    )
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(courseChapters.position, courseLessons.position);

  const totalLessons = lessons.length;

  // 3. Lấy các bài kiểm tra (assessments) của khoá học
  const courseAssessments = await db
    .select({
      id: assessments.id,
      lessonId: assessments.lessonId,
      type: assessments.type,
      maxScore: assessments.maxScore,
    })
    .from(assessments)
    .where(eq(assessments.courseId, courseId));

  const hasCoding = courseAssessments.some((a) => a.type === "coding");

  // 4. Lấy danh sách học viên đã ghi danh
  const enrollments = await db
    .select({
      enrollmentId: studentEnrollments.id,
      userId: studentEnrollments.userId,
      userName: userTable.name,
      userImage: userTable.image,
      enrolledAt: studentEnrollments.enrolledAt,
    })
    .from(studentEnrollments)
    .innerJoin(userTable, eq(studentEnrollments.userId, userTable.id))
    .where(eq(studentEnrollments.courseId, courseId))
    .orderBy(desc(studentEnrollments.enrolledAt));

  const enrollmentIds = enrollments.map((e) => e.enrollmentId);

  // 5. Lấy tiến độ bài học của học viên
  const progressRows = enrollmentIds.length
    ? await db
        .select({
          enrollmentId: lessonProgress.enrollmentId,
          lessonId: lessonProgress.lessonId,
          status: lessonProgress.status,
          lastAccessedAt: lessonProgress.lastAccessedAt,
          completedAt: lessonProgress.completedAt,
        })
        .from(lessonProgress)
        .where(inArray(lessonProgress.enrollmentId, enrollmentIds))
    : [];

  // 6. Lấy bài nộp kiểm tra (quiz / assignment) của các enrollments
  const assessmentIds = courseAssessments.map((a) => a.id);
  const submissions =
    assessmentIds.length && enrollmentIds.length
      ? await db
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
              inArray(assessmentSubmissions.assessmentId, assessmentIds),
              inArray(assessmentSubmissions.enrollmentId, enrollmentIds)
            )
          )
      : [];

  // 7. Lấy log gợi ý AI (không trừ điểm)
  const hintLogs = await db
    .select({
      userId: aiInteractionLogs.userId,
      hintLevel: aiInteractionLogs.hintLevel,
    })
    .from(aiInteractionLogs)
    .where(
      and(
        eq(aiInteractionLogs.courseId, courseId),
        sql`${aiInteractionLogs.hintLevel} IS NOT NULL`
      )
    );

  const hintsByUser = new Map<string, { count: number; maxLevel: number }>();
  hintLogs.forEach((h) => {
    if (!h.userId) return;
    const current = hintsByUser.get(h.userId) || { count: 0, maxLevel: 0 };
    current.count += 1;
    current.maxLevel = Math.max(current.maxLevel, h.hintLevel || 0);
    hintsByUser.set(h.userId, current);
  });

  // 8. Thống kê câu hỏi quiz (tỉ lệ đúng từng câu)
  const quizAssessments = courseAssessments.filter((a) => a.type === "quiz");
  const quizAssessmentIds = quizAssessments.map((a) => a.id);

  let quizQuestionStats: QuizQuestionStatDto[] = [];

  if (quizAssessmentIds.length) {
    const questions = await db
      .select({
        id: quizQuestions.id,
        assessmentId: quizQuestions.assessmentId,
        lessonId: quizQuestions.lessonId,
        text: quizQuestions.text,
      })
      .from(quizQuestions)
      .where(inArray(quizQuestions.assessmentId, quizAssessmentIds));

    const questionIds = questions.map((q) => q.id);

    const answers = questionIds.length
      ? await db
          .select({
            questionId: assessmentAnswers.questionId,
            isCorrect: assessmentAnswers.isCorrect,
          })
          .from(assessmentAnswers)
          .where(inArray(assessmentAnswers.questionId, questionIds))
      : [];

    const answersByQuestion = new Map<
      number,
      { total: number; correct: number }
    >();
    answers.forEach((ans) => {
      const q = answersByQuestion.get(ans.questionId) || {
        total: 0,
        correct: 0,
      };
      q.total += 1;
      if (ans.isCorrect) q.correct += 1;
      answersByQuestion.set(ans.questionId, q);
    });

    const lessonTitleMap = new Map(lessons.map((l) => [l.id, l.title]));

    quizQuestionStats = questions.map((q) => {
      const stats = answersByQuestion.get(q.id) || { total: 0, correct: 0 };
      const { correctPercent, needsReview } = calculateQuestionAccuracy(
        stats.correct,
        stats.total
      );

      return {
        lessonId: q.lessonId,
        lessonTitle: q.lessonId
          ? lessonTitleMap.get(q.lessonId) || "Bài học"
          : "Đầu khoá / Tổng quát",
        questionId: q.id,
        questionText: q.text,
        totalAnswers: stats.total,
        correctAnswers: stats.correct,
        correctPercent,
        needsReview,
      };
    });
  }

  // 9. Lập danh sách chi tiết từng học viên
  const learners: LearnerProgressDto[] = enrollments.map((e) => {
    const learnerProgress = progressRows.filter(
      (p) => p.enrollmentId === e.enrollmentId
    );
    const completedLessonIds = new Set(
      learnerProgress
        .filter((p) => p.status === "completed")
        .map((p) => p.lessonId)
    );

    const learnerSubmissions = submissions.filter(
      (s) => s.enrollmentId === e.enrollmentId
    );

    // Tính điểm quiz trung bình của học viên
    const quizSubmissions = learnerSubmissions.filter((s) => {
      const ass = courseAssessments.find((a) => a.id === s.assessmentId);
      return ass?.type === "quiz" && s.score !== null;
    });

    const quizScores = quizSubmissions.map((s) => Number(s.score));
    const averageQuizScore = calculateAverageQuizScore(quizScores);

    // Hoạt động gần nhất
    const activityDates = [
      ...learnerProgress.map((p) => p.lastAccessedAt || p.completedAt),
      ...learnerSubmissions.map((s) => s.submittedAt),
    ]
      .filter((d): d is Date => d !== null && d !== undefined)
      .map((d) => new Date(d).getTime());

    const lastActiveTime = activityDates.length
      ? Math.max(...activityDates)
      : null;
    const lastActive = lastActiveTime
      ? new Date(lastActiveTime).toISOString()
      : null;

    // Gợi ý AI của học viên
    const hintInfo = hintsByUser.get(e.userId) || { count: 0, maxLevel: 0 };

    // Chi tiết từng bài học của học viên
    const lessonItems = lessons.map((l) => {
      const isCompleted = completedLessonIds.has(l.id);

      // Điểm quiz của bài (nếu có)
      const lessonQuizAss = courseAssessments.find(
        (a) => a.lessonId === l.id && a.type === "quiz"
      );
      const lessonQuizSub = lessonQuizAss
        ? learnerSubmissions.find((s) => s.assessmentId === lessonQuizAss.id)
        : null;

      // Bài tập tự luận của bài (nếu có)
      const lessonAssignAss = courseAssessments.find(
        (a) => a.lessonId === l.id && a.type === "assignment"
      );
      const lessonAssignSub = lessonAssignAss
        ? learnerSubmissions.find((s) => s.assessmentId === lessonAssignAss.id)
        : null;

      return {
        id: l.id,
        title: l.title,
        isCompleted,
        quizScore:
          lessonQuizSub && lessonQuizSub.score !== null
            ? Number(lessonQuizSub.score)
            : null,
        assignmentSubmission: lessonAssignSub
          ? {
              status: lessonAssignSub.status,
              score:
                lessonAssignSub.score !== null
                  ? Number(lessonAssignSub.score)
                  : null,
              maxScore: Number(lessonAssignAss?.maxScore || 100),
            }
          : null,
      };
    });

    const progressPercent = calculateLearnerCompletionRate(
      completedLessonIds.size,
      totalLessons
    );

    return {
      userId: e.userId,
      name: e.userName || "Học viên",
      avatar: e.userImage,
      progressPercent,
      completedLessonsCount: completedLessonIds.size,
      totalLessonsCount: totalLessons,
      averageQuizScore,
      hintUsageCount: hintInfo.count,
      maxHintLevel: hintInfo.maxLevel,
      lastActive,
      lessons: lessonItems,
    };
  });

  const completionPercentages = learners.map((l) => l.progressPercent);
  const averageCompletionRate = calculateAveragePercentage(completionPercentages);

  const allQuizAverages = learners
    .map((l) => l.averageQuizScore)
    .filter((s): s is number => s !== null);
  const courseAverageQuizScore = calculateAverageQuizScore(allQuizAverages);

  return {
    courseId,
    courseTitle: course.title,
    totalLessons,
    learnersCount: learners.length,
    averageCompletionRate,
    averageQuizScore: courseAverageQuizScore,
    hasCodingExercise: hasCoding,
    learners,
    quizQuestions: quizQuestionStats,
  };
}
