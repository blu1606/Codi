import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { assessments, assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { lessonProgress, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { learningPathCompletions } from "@codi-1/db/schema/learning-path-runtime";
import { skills, skillPrerequisites } from "@codi-1/db/schema/knowledge-map";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { seedOnboardingFixture } from "./onboarding-fixture";

export const PLAYER_FIXTURE_STATES = ["reading", "video", "pdf", "error", "checklist", "code", "completed", "complete"] as const;
export async function seedLessonPlayerFixture(tx: Pick<Database, "select" | "insert" | "update">, state: typeof PLAYER_FIXTURE_STATES[number], userIds: string[]) {
  const courseId = `dev-player-${state}`;
  const fixture = await seedOnboardingFixture(tx, courseId, userIds);
  await tx.update(courses).set({ title: `Trang học TypeScript — ${state} (dữ liệu dev)` }).where(eq(courses.id, courseId));
  const first = fixture.lessonIds[0]!;
  await tx.update(courseLessons).set({ body: "Chuỗi trong TypeScript\n\nDùng kiểu string để biểu diễn văn bản.\n\nVí dụ:\nconst greeting: string = 'Xin chào Codi';\nconsole.log(greeting.toUpperCase());\n\nThử tự viết một chuỗi và nối tên của bạn. Đọc xong, bạn có thể đánh dấu đã học nội dung.\n\nĐây là nội dung dev để kiểm tra trang học.", ...(state === "video" ? { durationSeconds: 5 } : {}) }).where(eq(courseLessons.id, first));
  const concepts = await tx.select().from(skills).where(eq(skills.courseId, courseId)).orderBy(asc(skills.id));
  await tx.insert(skillPrerequisites).values([{ skillId: concepts[1]!.id, prerequisiteSkillId: concepts[0]!.id, source: "lecturer", review: "accepted" }, { skillId: concepts[2]!.id, prerequisiteSkillId: concepts[1]!.id, source: "lecturer", review: "accepted" }]).onConflictDoNothing();
  if (["video", "pdf", "error"].includes(state)) await tx.insert(lessonMaterials).values({ lessonId: first, type: state === "video" ? "video" : "pdf", title: state === "video" ? "Video mẫu CC0 — MDN" : "Slide TypeScript (dữ liệu dev)", url: state === "error" ? "/dev/lesson-player/missing.pdf" : `/dev/lesson-player/${state === "video" ? "flower.mp4" : "slides.pdf"}`, durationSeconds: state === "video" ? 5 : null, position: 0 }).onConflictDoNothing();
  const checks: (typeof assessments.$inferSelect)[] = [];
  if (state === "checklist" || state === "code") {
    const [existing] = await tx.select().from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, first)));
    if (!existing) await tx.insert(assessments).values(state === "code" ? [{ courseId, lessonId: first, type: "coding", title: "Bài code (dữ liệu dev)", status: "published" }] : [
      { courseId, lessonId: first, type: "quiz", title: "Quiz (dữ liệu dev)", passingScore: 70, status: "published" },
      { courseId, lessonId: first, type: "assignment", title: "Bài tập (dữ liệu dev)", submissionFormat: "link", status: "published" },
    ]);
    checks.push(...await tx.select().from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, first))));
  }
  const enrollments = await tx.select().from(studentEnrollments).where(eq(studentEnrollments.courseId, courseId));
  for (const e of enrollments.filter((e) => userIds.includes(e.userId))) {
    if (e.goalSetAt) continue; // Do not reset progress, reviews or media on repeat runs.
    const completed = state === "complete" ? fixture.lessonIds : state === "completed" ? [first] : [];
    await tx.update(studentEnrollments).set({ goalSetAt: new Date(), learningGoal: "project", selfAssessedLevel: "basic", weeklyGoalMinutes: 300, diagnosticStatus: "skipped", pathStatus: "ready", pathSource: "default", progress: Math.round(completed.length / fixture.lessonIds.length * 100), ...(state === "complete" ? { status: "completed", completedAt: new Date() } : {}) }).where(eq(studentEnrollments.id, e.id));
    const [path] = await tx.insert(personalizedLearningPaths).values({ enrollmentId: e.id, version: 1, trigger: completed.length ? "lesson_completed" : "default_order", generatedBy: "system", ...(completed.length ? { updateSummary: { afterLessonId: first, message: "Bạn đang học theo thứ tự mặc định của khoá học.", changes: state === "completed" ? [{ lessonId: fixture.lessonIds[1]!, type: "unlocked" as const, text: "Boolean đã mở khoá sau khi hoàn thành Chuỗi." }] : [] } } : {}) }).returning();
    if (!path) throw new Error("Development path missing");
    await tx.insert(pathItems).values(fixture.lessonIds.map((lessonId, index) => ({ pathId: path.id, lessonId, position: index + 1, reason: "Theo thứ tự mặc định của giảng viên." })));
    if (completed.length) {
      await tx.insert(lessonProgress).values(completed.map((lessonId) => ({ enrollmentId: e.id, lessonId, status: "completed" as const, studiedAt: new Date(), completedAt: new Date() }))).onConflictDoNothing();
      await tx.insert(learningPathCompletions).values(completed.map((lessonId) => ({ enrollmentId: e.id, lessonId }))).onConflictDoNothing();
    } else if (checks.length) {
      await tx.insert(lessonProgress).values({ enrollmentId: e.id, lessonId: first, status: "in_progress", studiedAt: state === "checklist" ? new Date() : null });
      for (const a of checks) await tx.insert(assessmentSubmissions).values({ enrollmentId: e.id, assessmentId: a.id, attempt: 1, status: a.type === "assignment" ? "pending" : "graded", score: a.type === "assignment" ? null : a.type === "coding" ? 0 : 50, isPassed: a.type === "assignment" ? null : false, mode: a.type === "coding" ? "submit" : null, submittedAt: new Date(), ...(a.type === "assignment" ? { linkUrl: "https://example.invalid/development-assignment" } : {}) });
    }
  }
  return { courseId, first, locked: fixture.lessonIds[1]! };
}
