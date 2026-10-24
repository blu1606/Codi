import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import {
  courseChapters,
  courseLessons,
} from "@codi-1/db/schema/course-content";
import {
  lessonSkills,
  skills,
  skillPrerequisites,
} from "@codi-1/db/schema/knowledge-map";
import {
  enrollmentSkillMastery,
  pathItems,
  personalizedLearningPaths,
} from "@codi-1/db/schema/learning";
import {
  assessments,
  quizOptions,
  quizQuestions,
} from "@codi-1/db/schema/assessments";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import {
  jsCourseContent,
  masterySeed,
  mockupSnapshot,
} from "./seed-mockup-mapping";

// Explicit opt-in development data, separate from every existing course and enrollment.
// Run from apps/web: pnpm db:seed-knowledge-map -- --user-id=<learner-id>
// Add --catalog to list this simulation on /courses for manual testing.
// No password, account reset, mock API or application-side scenario flag is needed.
export const KNOWLEDGE_MAP_DEV_COURSE = "dev-knowledge-map-161";
const description =
  "Dữ liệu mẫu riêng để đối chiếu bản đồ kiến thức với mockup S13c (issue #161).";
function stableUuid(key: string) {
  const hex = createHash("sha256")
    .update(`${KNOWLEDGE_MAP_DEV_COURSE}:${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.DATABASE_URL)
    throw new Error("Development DATABASE_URL required");
  const userId = process.argv
    .find((arg) => arg.startsWith("--user-id="))
    ?.slice("--user-id=".length);
  const showInCatalog = process.argv.includes("--catalog");
  if (!userId)
    throw new Error(
      "Pass --user-id=<learner-id>; no accounts are selected automatically.",
    );
  const snapshot = mockupSnapshot.parse(
    JSON.parse(readFileSync(resolve("scripts/data/mockup-seed.json"), "utf8")),
  );
  const source = snapshot.courses.find(
    (course) => course.id === "course-js-001",
  );
  const mastery = snapshot.learnerSeed.courses["course-js-001"]?.mastery;
  if (!source || !mastery)
    throw new Error("JavaScript mockup snapshot missing");
  const content = jsCourseContent.parse(
    JSON.parse(
      readFileSync(resolve("scripts/data/js-course-content.json"), "utf8"),
    ),
  );
  const sourceLessons = source.chapters.flatMap((chapter) => chapter.lessons);
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    await db.transaction(async (tx) => {
      const [learner] = await tx
        .select({ id: user.id })
        .from(user)
        .innerJoin(userRoles, eq(userRoles.userId, user.id))
        .where(
          and(
            eq(user.id, userId),
            eq(user.banned, false),
            eq(userRoles.roleId, "LEARNER"),
            isNull(userRoles.revokedAt),
          ),
        );
      if (!learner) throw new Error("Active learner required");
      const [existing] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, KNOWLEDGE_MAP_DEV_COURSE));
      if (existing && existing.description !== description)
        throw new Error(
          "Fixture ID belongs to another course; no changes made",
        );
      await tx
        .insert(courses)
        .values({
          id: KNOWLEDGE_MAP_DEV_COURSE,
          slug: KNOWLEDGE_MAP_DEV_COURSE,
          title: source.title,
          category: "Frontend",
          level: "Beginner",
          duration: "2 giờ",
          description,
          price: 0,
          status: "hidden",
          hiddenReason: description,
          knowledgeMapStatus: "confirmed",
        })
        .onConflictDoNothing();
      if (showInCatalog)
        await tx
          .update(courses)
          .set({
            title: `${source.title} — Mô phỏng bản đồ kiến thức`,
            status: "published",
            hiddenReason: null,
            publishedAt: existing?.publishedAt ?? new Date(),
          })
          .where(eq(courses.id, KNOWLEDGE_MAP_DEV_COURSE));
      const chapterId = stableUuid("chapter");
      await tx
        .insert(courseChapters)
        .values({
          id: chapterId,
          courseId: KNOWLEDGE_MAP_DEV_COURSE,
          title: source.title,
          position: 0,
          isPublished: true,
        })
        .onConflictDoNothing();
      const ids = new Map<string, number>();
      for (const [position, concept] of source.concepts.entries()) {
        await tx
          .insert(skills)
          .values({
            courseId: KNOWLEDGE_MAP_DEV_COURSE,
            name: concept.name,
            review: "accepted",
            source: "lecturer",
          })
          .onConflictDoNothing();
        const [skill] = await tx
          .select({ id: skills.id })
          .from(skills)
          .where(
            and(
              eq(skills.courseId, KNOWLEDGE_MAP_DEV_COURSE),
              eq(skills.name, concept.name),
            ),
          );
        if (!skill) throw new Error("Fixture concept missing");
        ids.set(concept.id, skill.id);
        const lessonId = stableUuid(concept.id);
        const sourceLesson = sourceLessons.find((lesson) =>
          lesson.conceptIds.includes(concept.id),
        );
        const body =
          sourceLesson &&
          (content.lessons[sourceLesson.id]?.body || sourceLesson.reading);
        const placeholder = `# ${concept.name}\n\nBài học mẫu để kiểm tra liên kết từ bản đồ kiến thức. ${description}`;
        await tx
          .insert(courseLessons)
          .values({
            id: lessonId,
            chapterId,
            title: concept.name,
            position,
            durationSeconds: 600,
            isPublished: true,
            body: body || placeholder,
          })
          .onConflictDoNothing();
        // Upgrade only this seed's placeholder, preserving any subsequent authored edits.
        if (body)
          await tx
            .update(courseLessons)
            .set({ body })
            .where(
              and(
                eq(courseLessons.id, lessonId),
                eq(courseLessons.body, placeholder),
              ),
            );
        await tx
          .insert(lessonSkills)
          .values({ lessonId, skillId: skill.id })
          .onConflictDoNothing();
        const quiz = sourceLesson?.quiz;
        if (quiz) {
          const [existingQuiz] = await tx
            .select({ id: assessments.id })
            .from(assessments)
            .where(
              and(
                eq(assessments.courseId, KNOWLEDGE_MAP_DEV_COURSE),
                eq(assessments.lessonId, lessonId),
                eq(assessments.type, "quiz"),
              ),
            );
          if (!existingQuiz) {
            const [assessment] = await tx
              .insert(assessments)
              .values({
                courseId: KNOWLEDGE_MAP_DEV_COURSE,
                lessonId,
                type: "quiz",
                status: "published",
                title: `Quiz: ${concept.name}`,
                passingScore: quiz.passingScore,
                maxScore: 100,
                instructions:
                  "Chọn đáp án đúng. Quiz mẫu dùng để thử cập nhật mức thành thạo trên bản đồ kiến thức.",
              })
              .returning({ id: assessments.id });
            if (!assessment) throw new Error("Fixture quiz missing");
            for (const [position, question] of quiz.questions.entries()) {
              const [created] = await tx
                .insert(quizQuestions)
                .values({
                  assessmentId: assessment.id,
                  lessonId,
                  text: question.text,
                  position,
                  points: 1,
                  explanation: question.explanation,
                })
                .returning({ id: quizQuestions.id });
              if (!created) throw new Error("Fixture quiz question missing");
              await tx.insert(quizOptions).values(
                question.options.map((text, position) => ({
                  questionId: created.id,
                  text,
                  position,
                  isCorrect: position === question.correctIndex,
                })),
              );
            }
          }
        }
      }
      await tx
        .insert(skillPrerequisites)
        .values(
          source.prerequisites.map((edge) => ({
            prerequisiteSkillId: ids.get(edge.from)!,
            skillId: ids.get(edge.to)!,
            review: "accepted" as const,
            source: "lecturer" as const,
          })),
        )
        .onConflictDoNothing();
      const [enrollment] = await tx
        .insert(studentEnrollments)
        .values({
          userId,
          courseId: KNOWLEDGE_MAP_DEV_COURSE,
          status: "active",
        })
        .onConflictDoNothing()
        .returning({ id: studentEnrollments.id });
      // Mastery is only initialized for a new enrollment. A rerun preserves learner activity.
      if (enrollment)
        await tx.insert(enrollmentSkillMastery).values(
          source.concepts.map((concept) => ({
            enrollmentId: enrollment.id,
            skillId: ids.get(concept.id)!,
            ...masterySeed(mastery[concept.id] ?? 0),
          })),
        );
      const [owned] = await tx
        .select()
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.userId, userId),
            eq(studentEnrollments.courseId, KNOWLEDGE_MAP_DEV_COURSE),
          ),
        )
        .for("update");
      if (!owned) throw new Error("Fixture enrollment missing");
      // Prepare only an untouched fixture enrollment; never restart a learner's chosen path.
      const [existingPath] = await tx
        .select({ id: personalizedLearningPaths.id })
        .from(personalizedLearningPaths)
        .where(eq(personalizedLearningPaths.enrollmentId, owned.id));
      if (!owned.goalSetAt && owned.pathStatus === "none" && !existingPath) {
        await tx
          .update(studentEnrollments)
          .set({
            goalSetAt: new Date(),
            learningGoal: "project",
            selfAssessedLevel: "basic",
            weeklyGoalMinutes: 300,
            diagnosticStatus: "skipped",
            pathStatus: "ready",
            pathSource: "default",
          })
          .where(eq(studentEnrollments.id, owned.id));
        const [path] = await tx
          .insert(personalizedLearningPaths)
          .values({
            enrollmentId: owned.id,
            version: 1,
            trigger: "default_order",
            generatedBy: "system",
          })
          .returning({ id: personalizedLearningPaths.id });
        if (!path) throw new Error("Fixture path missing");
        await tx.insert(pathItems).values(
          source.concepts.map((concept, index) => ({
            pathId: path.id,
            lessonId: stableUuid(concept.id),
            position: index + 1,
            estimatedMinutes: 10,
            reason: "Lộ trình mặc định của khoá mô phỏng bản đồ kiến thức.",
          })),
        );
      }
    });
    console.log(
      `http://localhost:3001/insights/knowledge-map?course=${KNOWLEDGE_MAP_DEV_COURSE}`,
    );
    console.log(
      "Separate development fixture ready: 12 concepts, 12 prerequisites; existing progress preserved.",
    );
    console.log(`http://localhost:3001/learn/${KNOWLEDGE_MAP_DEV_COURSE}`);
    if (showInCatalog)
      console.log("Simulation is listed on http://localhost:3001/courses");
  } finally {
    await db.$client.end();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && !error.cause
      ? error.message
      : "Knowledge-map development seed failed; database details suppressed.",
  );
  process.exitCode = 1;
});
