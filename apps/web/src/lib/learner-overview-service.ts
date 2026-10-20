import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
} from "drizzle-orm";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import type { Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { courses } from "@codi-1/db/schema/courses";
import {
  courseChapters,
  courseDetails,
  courseLessons,
} from "@codi-1/db/schema/course-content";
import {
  studentActivities,
  studentEnrollments,
} from "@codi-1/db/schema/student-profile";
import { studentStudyDays } from "@codi-1/db/schema/study-activity";
import {
  enrollmentSkillMastery,
  lessonProgress,
  pathItems,
  personalizedLearningPaths,
} from "@codi-1/db/schema/learning";
import {
  lessonSkills,
  skillPrerequisites,
  skills,
} from "@codi-1/db/schema/knowledge-map";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import { courseDiscussions } from "@codi-1/db/schema/interaction";
import {
  defaultPathItems,
  levelOf,
  selectPath,
  type PathInput,
} from "./learning-path-contract";
import {
  LearnerOverviewError,
  overviewCommand,
  resultView,
  streakDays,
  studyDate,
  weekDates,
  type LearnerCourse,
  type LearnerOverview,
} from "./learner-overview-contract";

// Bulk reads: query count is independent of the number of enrolled courses.
// GET never reconciles/completes a path, changes mastery or calls an AI provider.
export function createLearnerOverviewService(
  db: Database,
  clock = () => new Date(),
) {
  return {
    async execute(userId: string, raw: unknown) {
      const command = overviewCommand.parse(raw);
      return db.transaction(async (tx) => {
        if (
          !(await getActiveRoles(tx as unknown as Database, userId)).includes(
            ROLE.LEARNER,
          )
        )
          throw new LearnerOverviewError(
            "Bạn không có quyền học viên đang hoạt động.",
            403,
          );
        const [e] = await tx
          .select()
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.userId, userId),
              eq(studentEnrollments.courseId, command.courseId),
            ),
          )
          .for("update");
        if (!e || e.status === "suspended")
          throw new LearnerOverviewError(
            "Bạn chưa có quyền học khoá học này.",
            403,
          );
        if (
          e.pathSource !== "default" ||
          e.pathStatus !== "ready" ||
          e.diagnosticStatus !== "skipped"
        )
          throw new LearnerOverviewError(
            "Thông báo cá nhân hoá không còn áp dụng cho khoá học này.",
          );
        if (
          command.type === "restore-diagnostic" &&
          e.diagnosticCardDismissedAt?.toISOString() !== command.dismissedAt
        )
          throw new LearnerOverviewError(
            "Thông báo đã thay đổi. Vui lòng tải lại.",
          );
        const dismissedAt =
          command.type === "dismiss-diagnostic"
            ? (e.diagnosticCardDismissedAt ?? clock())
            : null;
        await tx
          .update(studentEnrollments)
          .set({ diagnosticCardDismissedAt: dismissedAt })
          .where(eq(studentEnrollments.id, e.id));
        return { dismissedAt: dismissedAt?.toISOString() ?? null };
      });
    },
    async get(userId: string): Promise<LearnerOverview> {
      return db.transaction(
        async (tx) => {
          const roles = await getActiveRoles(tx as unknown as Database, userId);
          const [learner] = await tx
            .select({ name: user.name, banned: user.banned })
            .from(user)
            .where(eq(user.id, userId));
          if (!learner || learner.banned || !roles.includes(ROLE.LEARNER))
            throw new LearnerOverviewError(
              "Bạn không có quyền học viên đang hoạt động.",
              403,
            );
          const now = clock();
          const owned = await tx
            .select({
              enrollment: studentEnrollments,
              course: courses,
              cover: courseDetails.coverImageUrl,
            })
            .from(studentEnrollments)
            .innerJoin(courses, eq(courses.id, studentEnrollments.courseId))
            .leftJoin(courseDetails, eq(courseDetails.courseId, courses.id))
            .where(
              and(
                eq(studentEnrollments.userId, userId),
                ne(studentEnrollments.status, "suspended"),
              ),
            )
            .orderBy(desc(studentEnrollments.enrolledAt), asc(courses.id));
          const courseIds = owned.map((x) => x.course.id),
            enrollmentIds = owned.map((x) => x.enrollment.id);
          const lessons = courseIds.length
            ? await tx
                .select({
                  lesson: courseLessons,
                  courseId: courseChapters.courseId,
                })
                .from(courseLessons)
                .innerJoin(
                  courseChapters,
                  eq(courseChapters.id, courseLessons.chapterId),
                )
                .where(
                  and(
                    inArray(courseChapters.courseId, courseIds),
                    eq(courseChapters.isPublished, true),
                    eq(courseLessons.isPublished, true),
                  ),
                )
                .orderBy(
                  asc(courseChapters.position),
                  asc(courseChapters.id),
                  asc(courseLessons.position),
                  asc(courseLessons.id),
                )
            : [];
          const lessonIds = lessons.map((x) => x.lesson.id);
          const progress = enrollmentIds.length
            ? await tx
                .select()
                .from(lessonProgress)
                .where(inArray(lessonProgress.enrollmentId, enrollmentIds))
            : [];
          const concepts = courseIds.length
            ? await tx
                .select()
                .from(skills)
                .where(
                  and(
                    inArray(skills.courseId, courseIds),
                    inArray(skills.review, ["accepted", "edited"]),
                  ),
                )
                .orderBy(asc(skills.id))
            : [];
          const conceptIds = concepts.map((x) => x.id);
          const mastery = enrollmentIds.length
            ? await tx
                .select()
                .from(enrollmentSkillMastery)
                .where(
                  inArray(enrollmentSkillMastery.enrollmentId, enrollmentIds),
                )
            : [];
          const edges = conceptIds.length
            ? await tx
                .select()
                .from(skillPrerequisites)
                .where(
                  and(
                    inArray(skillPrerequisites.skillId, conceptIds),
                    inArray(skillPrerequisites.prerequisiteSkillId, conceptIds),
                    inArray(skillPrerequisites.review, ["accepted", "edited"]),
                  ),
                )
            : [];
          const links = lessonIds.length
            ? await tx
                .select()
                .from(lessonSkills)
                .where(inArray(lessonSkills.lessonId, lessonIds))
            : [];
          const paths = enrollmentIds.length
            ? await tx
                .select()
                .from(personalizedLearningPaths)
                .where(
                  and(
                    inArray(
                      personalizedLearningPaths.enrollmentId,
                      enrollmentIds,
                    ),
                    eq(personalizedLearningPaths.status, "active"),
                  ),
                )
            : [];
          const items = paths.length
            ? await tx
                .select()
                .from(pathItems)
                .where(
                  inArray(
                    pathItems.pathId,
                    paths.map((p) => p.id),
                  ),
                )
                .orderBy(asc(pathItems.position))
            : [];
          const checks = lessonIds.length
            ? await tx
                .select()
                .from(assessments)
                .where(
                  and(
                    inArray(assessments.courseId, courseIds),
                    inArray(assessments.lessonId, lessonIds),
                    eq(assessments.isDiagnostic, false),
                    eq(assessments.status, "published"),
                  ),
                )
            : [];
          const submissions = checks.length
            ? await tx
                .select()
                .from(assessmentSubmissions)
                .where(
                  and(
                    inArray(assessmentSubmissions.enrollmentId, enrollmentIds),
                    inArray(
                      assessmentSubmissions.assessmentId,
                      checks.map((a) => a.id),
                    ),
                  ),
                )
                .orderBy(
                  desc(assessmentSubmissions.attempt),
                  desc(assessmentSubmissions.id),
                )
            : [];
          const answered = courseIds.length
            ? await tx
                .select({ id: courseDiscussions.id })
                .from(courseDiscussions)
                .where(
                  and(
                    eq(courseDiscussions.authorId, userId),
                    inArray(courseDiscussions.courseId, courseIds),
                    isNull(courseDiscussions.parentId),
                    eq(courseDiscussions.status, "answered"),
                    eq(courseDiscussions.isHidden, false),
                  ),
                )
            : [];
          const events = await tx
            .select({ at: studentActivities.occurredAt })
            .from(studentActivities)
            .where(
              and(
                eq(studentActivities.userId, userId),
                inArray(studentActivities.type, [
                  "lesson_complete",
                  "quiz_complete",
                ]),
                lte(studentActivities.occurredAt, now),
              ),
            );
          const week = weekDates(now);
          const time = await tx
            .select()
            .from(studentStudyDays)
            .where(
              and(
                eq(studentStudyDays.userId, userId),
                inArray(studentStudyDays.date, week),
              ),
            );
          const recommendations = owned.length
            ? await tx
                .select({
                  id: courses.id,
                  slug: courses.slug,
                  title: courses.title,
                  level: courses.level,
                  price: courses.price,
                  cover: courseDetails.coverImageUrl,
                })
                .from(courses)
                .leftJoin(courseDetails, eq(courseDetails.courseId, courses.id))
                .where(
                  and(
                    eq(courses.status, "published"),
                    notExists(
                      tx
                        .select({ id: studentEnrollments.id })
                        .from(studentEnrollments)
                        .where(
                          and(
                            eq(studentEnrollments.userId, userId),
                            eq(studentEnrollments.courseId, courses.id),
                          ),
                        ),
                    ),
                  ),
                )
                .orderBy(desc(courses.rating), asc(courses.id))
                .limit(3)
            : [];
          const courseViews: LearnerCourse[] = owned.map(
            ({ enrollment: e, course: c, cover }) => {
              const previous = items
                .filter(
                  (i) =>
                    i.pathId === paths.find((p) => p.enrollmentId === e.id)?.id,
                )
                .map((i) => ({
                  lessonId: i.lessonId,
                  isSkippable: i.isSkippable,
                  reason: i.reason ?? "Theo thứ tự bài học tiên quyết.",
                }));
              const input: PathInput = {
                goal: e.learningGoal,
                hours: e.weeklyGoalMinutes ? e.weeklyGoalMinutes / 60 : null,
                level: e.selfAssessedLevel,
                previous,
                lessons: lessons
                  .filter((x) => x.courseId === c.id)
                  .map(({ lesson: l }) => {
                    const p = progress.find(
                      (p) => p.enrollmentId === e.id && p.lessonId === l.id,
                    );
                    return {
                      id: l.id,
                      title: l.title,
                      chapterId: l.chapterId,
                      chapterTitle: "",
                      durationSeconds: l.durationSeconds,
                      skillIds: links
                        .filter((x) => x.lessonId === l.id)
                        .map((x) => x.skillId),
                      progress: p?.status ?? "not_started",
                      studied: !!p?.studiedAt,
                    };
                  }),
                concepts: concepts
                  .filter((s) => s.courseId === c.id)
                  .map((s) => {
                    const m = mastery.find(
                      (m) => m.enrollmentId === e.id && m.skillId === s.id,
                    );
                    return {
                      id: s.id,
                      name: s.name,
                      probability: m?.evidenceCount ? m.pMastery : null,
                      evidenceCount: m?.evidenceCount ?? 0,
                    };
                  }),
                edges: edges
                  .filter(
                    (edge) =>
                      concepts.find((s) => s.id === edge.skillId)?.courseId ===
                      c.id,
                  )
                  .map((edge) => ({
                    from: edge.prerequisiteSkillId,
                    to: edge.skillId,
                  })),
              };
              const path = selectPath(
                input,
                paths.some((p) => p.enrollmentId === e.id)
                  ? previous
                  : defaultPathItems(input),
                e.pathSource,
              );
              return {
                id: c.id,
                title: c.title,
                slug: c.slug,
                cover,
                hidden: c.status !== "published",
                goal: e.learningGoal,
                goalSetAt: e.goalSetAt?.toISOString() ?? null,
                weeklyGoalMinutes: e.weeklyGoalMinutes,
                lastActiveAt: (e.lastActiveAt ?? e.enrolledAt).toISOString(),
                pathStatus: e.pathStatus,
                showDiagnostic:
                  e.pathSource === "default" &&
                  e.pathStatus === "ready" &&
                  e.diagnosticStatus === "skipped" &&
                  !e.diagnosticCardDismissedAt,
                complete: path.complete,
                done: path.done,
                total: path.total,
                percent: path.percent,
                nextLessonId: path.currentLessonId,
                skills: input.concepts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  level: levelOf(s),
                })),
                lessons: path.rows.map((l) => ({
                  id: l.id,
                  title: l.title,
                  status: l.status,
                  lock: l.lock?.concept ?? null,
                  results: checks
                    .filter((a) => a.lessonId === l.id && a.courseId === c.id)
                    .map((a) =>
                      resultView(
                        a,
                        submissions.find(
                          (s) =>
                            s.enrollmentId === e.id &&
                            s.assessmentId === a.id &&
                            (a.type !== "coding" || s.mode === "submit"),
                        ),
                      ),
                    ),
                })),
              };
            },
          );
          const active = courseViews
            .filter((c) => !c.complete)
            .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
          const goalCourse =
            active.find((c) => c.weeklyGoalMinutes) ??
            courseViews.find((c) => c.weeklyGoalMinutes);
          const activityDates = new Set(events.map((e) => studyDate(e.at)));
          for (const p of progress) {
            for (const at of [p.studiedAt, p.completedAt])
              if (at && at <= now) activityDates.add(studyDate(at));
          }
          for (const s of submissions)
            if (
              s.status !== "draft" &&
              s.submittedAt &&
              s.submittedAt <= now &&
              s.mode !== "run"
            )
              activityDates.add(studyDate(s.submittedAt));
          const results = courseViews.flatMap((c) =>
            c.lessons.flatMap((l) =>
              l.results.map((r) => ({ course: c, lesson: l, result: r })),
            ),
          );
          const feedback = results
            .filter(
              (x) =>
                x.result.type === "assignment" &&
                x.result.status === "graded" &&
                x.result.feedback?.trim(),
            )
            .sort((a, b) =>
              (b.result.gradedAt ?? "").localeCompare(a.result.gradedAt ?? ""),
            );
          const latest = feedback[0];
          return {
            name: learner.name,
            courses: courseViews,
            continueCourseId: active[0]?.id ?? null,
            weekly: {
              minutes: Math.floor(
                time.reduce(
                  (n, x) => n + (x.date <= studyDate(now) ? x.seconds : 0),
                  0,
                ) / 60,
              ),
              goalMinutes: goalCourse?.weeklyGoalMinutes ?? 300,
              assumed: !goalCourse,
              courseId: goalCourse?.id ?? active[0]?.id ?? null,
              streak: streakDays([...activityDates], now),
              days: week.map((date) => ({
                date,
                studied: activityDates.has(date),
                today: date === studyDate(now),
              })),
            },
            stats: {
              active: active.length,
              completed: courseViews.filter((c) => c.complete).length,
              lessons: courseViews.reduce((n, c) => n + c.done, 0),
              pending: results.filter(
                (x) =>
                  x.result.type === "assignment" &&
                  x.result.status === "pending",
              ).length,
              answered: answered.length,
              feedback: feedback.length,
            },
            latestFeedback: latest
              ? {
                  courseId: latest.course.id,
                  courseTitle: latest.course.title,
                  lessonTitle: latest.lesson.title,
                  score: latest.result.score!,
                  maxScore: latest.result.maxScore,
                  text: latest.result.feedback!,
                }
              : null,
            recommendations,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
