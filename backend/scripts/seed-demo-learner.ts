// Gives a learner real progress in the demo course by driving the same services the learner UI calls:
// goal → entry test (diagnostic) → AI path → study, quiz and assignment per lesson → AI path update after each lesson.
// It stops with the next lesson half-watched, so completing it in the UI shows a fresh path change.
// Re-running resets that learner's enrollment in the course first. Needs DATABASE_URL and the AI key (path generation).
//   npx tsx --env-file=.env scripts/seed-demo-learner.ts [learnerEmail] [courseId] [lessonsToComplete]
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { user } from "@codi-1/db/schema/auth";
import { courseChapters, courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { assessments, assessmentSubmissions, quizOptions, quizQuestions } from "@codi-1/db/schema/assessments";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { learningPathJobs } from "@codi-1/db/schema/learning-path-runtime";
import { db } from "@/services";
import { createOnboardingService } from "@/lib/onboarding-service";
import { createLessonPlayerService } from "@/lib/lesson-player-service";
import { learningPathService } from "@/lib/learning-path-runtime";
import { assessmentService } from "@/lib/assessment-runtime";

const [email = "dongthanhquandtq+student@gmail.com", courseId = "course-demo-js-full", countArg = "5"] = process.argv.slice(2);
const toComplete = Number(countArg);

const onboarding = createOnboardingService(db);
const player = createLessonPlayerService(db);

const [learner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
if (!learner) throw new Error(`learner ${email} not found`);
const userId = learner.id;
const [enrollment] = await db.select({ id: studentEnrollments.id }).from(studentEnrollments)
  .where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
if (!enrollment) throw new Error(`${email} is not enrolled in ${courseId}`);

// Start from a clean enrollment; every learning record hangs off it and cascades.
for (const table of ["lesson_progress", "personalized_learning_paths", "assessment_submissions", "enrollment_skill_mastery", "learning_path_jobs", "learning_path_completions"])
  await db.execute(sql`delete from ${sql.identifier(table)} where enrollment_id = ${enrollment.id}`);
await db.update(studentEnrollments).set({
  progress: 0, status: "active", completedAt: null, learningGoal: null, targetSkillId: null, weeklyGoalMinutes: null, goalSetAt: null,
  selfAssessedLevel: null, goalDraft: {}, goalStep: 0, goalEditing: false, diagnosticQuestionIndex: 0, diagnosticCardDismissedAt: null,
  diagnosticStatus: "none", pathStatus: "none", pathSource: null, lastLessonId: null, lastActiveAt: null,
}).where(eq(studentEnrollments.id, enrollment.id));

/** Runs queued path jobs the way the AI worker does, until none is pending. */
async function settlePath(label: string) {
  // The first run also reconciles, which is what queues the job after a completion or a diagnostic.
  for (let i = 0; i < 5; i++) {
    await learningPathService.runPending(userId, courseId);
    const [job] = await db.select({ id: learningPathJobs.id }).from(learningPathJobs)
      .where(and(eq(learningPathJobs.enrollmentId, enrollment.id), isNull(learningPathJobs.finishedAt)));
    if (!job) break;
  }
  const [p] = await db.execute<{ version: number; generated_by: string; trigger: string; message: string | null }>(sql`
    select version, generated_by, trigger, update_summary->>'message' as message from personalized_learning_paths
    where enrollment_id = ${enrollment.id} and status = 'active'`).then((r) => r.rows);
  console.log(`  path after ${label}: ${p ? `v${p.version} ${p.generated_by}/${p.trigger}${p.message ? ` — ${p.message}` : ""}` : "none"}`);
}

const latestSubmission = async (assessmentId: number) =>
  (await db.select({ id: assessmentSubmissions.id }).from(assessmentSubmissions)
    .where(and(eq(assessmentSubmissions.enrollmentId, enrollment.id), eq(assessmentSubmissions.assessmentId, assessmentId)))
    .orderBy(desc(assessmentSubmissions.attempt)).limit(1))[0]?.id;

async function questionsOf(assessmentId: number) {
  const [a] = await db.select({ revision: assessments.currentQuizRevision }).from(assessments).where(eq(assessments.id, assessmentId));
  const qs = await db.select({ id: quizQuestions.id }).from(quizQuestions)
    .where(and(eq(quizQuestions.assessmentId, assessmentId), eq(quizQuestions.quizRevision, a.revision))).orderBy(asc(quizQuestions.position));
  const opts = qs.length ? await db.select({ id: quizOptions.id, questionId: quizOptions.questionId, isCorrect: quizOptions.isCorrect })
    .from(quizOptions).where(inArray(quizOptions.questionId, qs.map((q) => q.id))).orderBy(asc(quizOptions.position)) : [];
  return qs.map((q) => {
    const own = opts.filter((o) => o.questionId === q.id);
    return { id: q.id, right: own.find((o) => o.isCorrect)!.id, wrong: own.find((o) => !o.isCorrect)!.id };
  });
}

// 1. Goal: build a project, some basics, 5 hours a week.
await onboarding.execute(userId, courseId, { type: "goal-commit", draft: { goal: "project", level: "basic", hours: 5 } });

// 2. Entry test: confident on the first half, "chưa biết" on the rest, so the AI path has real gaps to plan around.
const [diagnostic] = await db.select({ id: assessments.id }).from(assessments)
  .where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true)));
if (diagnostic) {
  await onboarding.execute(userId, courseId, { type: "fork-diagnostic" });
  await onboarding.execute(userId, courseId, { type: "diagnostic-start" });
  const attemptId = (await latestSubmission(diagnostic.id))!;
  const qs = await questionsOf(diagnostic.id);
  for (const [i, q] of qs.entries()) {
    const known = i < Math.ceil(qs.length / 2);
    await onboarding.execute(userId, courseId, { type: "answer", attemptId, questionId: q.id, optionId: known ? q.right : null, unknown: !known });
    if (i < qs.length - 1) await onboarding.execute(userId, courseId, { type: "next", attemptId, questionId: q.id });
  }
  await onboarding.execute(userId, courseId, { type: "submit", attemptId });
  await onboarding.execute(userId, courseId, { type: "request-path" });
  console.log(`entry test: ${qs.length} questions, ${Math.ceil(qs.length / 2)} known`);
} else {
  await onboarding.execute(userId, courseId, { type: "fork-default" });
}
await settlePath("entry test");

// 3. Lessons in course order.
const lessons = await db.select({ id: courseLessons.id, title: courseLessons.title }).from(courseLessons)
  .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
  .where(and(eq(courseChapters.courseId, courseId), eq(courseLessons.isPublished, true)))
  .orderBy(asc(courseChapters.position), asc(courseLessons.position));

let quizNo = 0;
for (const lesson of lessons.slice(0, toComplete)) {
  const reqs = await db.select({ id: assessments.id, type: assessments.type }).from(assessments)
    .where(and(eq(assessments.lessonId, lesson.id), eq(assessments.status, "published")));
  if (reqs.some((r) => r.type === "coding")) throw new Error(`"${lesson.title}" is a code lesson; lower lessonsToComplete`);
  await player.execute(userId, courseId, lesson.id, { type: "study" });
  for (const r of reqs) {
    const scope = { userId, courseId, lessonId: lesson.id, assessmentId: r.id };
    if (r.type === "quiz") {
      await assessmentService.execute(scope, { type: "quiz-open" });
      const submissionId = (await latestSubmission(r.id))!;
      const qs = await questionsOf(r.id);
      // Every second quiz misses one question, so mastery is not uniformly perfect.
      const miss = quizNo++ % 2 === 1 && qs.length >= 4 ? qs.length - 1 : -1;
      for (const [i, q] of qs.entries())
        await assessmentService.execute(scope, { type: "quiz-answer", submissionId, questionId: q.id, optionId: i === miss ? q.wrong : q.right });
      await assessmentService.execute(scope, { type: "quiz-submit", submissionId, confirmUnanswered: true });
    } else if (r.type === "assignment") {
      await assessmentService.execute(scope, { type: "assignment-submit", linkUrl: "https://github.com/codi-demo/javascript-nen-tang-bai-tap",
        answerText: "Em đã làm xong bài tập: viết các hàm theo yêu cầu, thử với vài đầu vào và ghi lại kết quả chạy ở phần dưới." });
    }
  }
  await player.execute(userId, courseId, lesson.id, { type: "complete" });
  console.log(`completed: ${lesson.title}`);
  await settlePath(lesson.title);
}

// 4. Next lesson: video watched halfway, so the learner resumes it and completing it updates the path.
const next = lessons[toComplete];
if (next) {
  const [video] = await db.select({ id: lessonMaterials.id, duration: lessonMaterials.durationSeconds }).from(lessonMaterials)
    .where(and(eq(lessonMaterials.lessonId, next.id), eq(lessonMaterials.type, "video"))).orderBy(asc(lessonMaterials.position)).limit(1);
  if (video) await player.execute(userId, courseId, next.id, { type: "video", materialId: video.id, seconds: Math.floor((video.duration ?? 600) / 2), ended: false });
  console.log(`in progress: ${next.title}`);
}

const [final] = await db.select({ progress: studentEnrollments.progress, pathStatus: studentEnrollments.pathStatus, pathSource: studentEnrollments.pathSource })
  .from(studentEnrollments).where(eq(studentEnrollments.id, enrollment.id));
console.log(`done: ${email} in ${courseId} → ${JSON.stringify(final)}`);
process.exit(0);
