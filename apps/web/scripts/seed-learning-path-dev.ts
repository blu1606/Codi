import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { enrollmentSkillMastery, lessonProgress, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { learningPathCompletions } from "@codi-1/db/schema/learning-path-runtime";
import { skills, skillPrerequisites } from "@codi-1/db/schema/knowledge-map";
import { seedOnboardingFixture } from "./onboarding-fixture";

// Dedicated development courses with explicit fixture labels. No application scenario flags,
// provider stubs or resets of the user's existing onboarding course/progress.
async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const targets = await db.select({ id: user.id }).from(user).innerJoin(userRoles, eq(userRoles.userId, user.id))
      .where(and(like(user.email, "%+student@%"), like(user.name, "%(Student)"), eq(user.banned, false), eq(userRoles.roleId, "LEARNER"), isNull(userRoles.revokedAt)));
    const userIds = [...new Set(targets.map((t) => t.id))];
    if (!userIds.length) throw new Error("Run the per-role development account seed first");
    for (const state of ["none", "default", "ai", "failed", "updated", "complete", "unconfirmed"] as const) {
      const courseId = `dev-path-${state}`;
      await db.transaction(async (tx) => {
        const fixture = await seedOnboardingFixture(tx, courseId, userIds);
        await tx.update(courses).set({ title: `Lộ trình TypeScript — ${state} (dữ liệu dev)`, knowledgeMapStatus: state === "unconfirmed" ? "ready" : "confirmed" }).where(eq(courses.id, courseId));
        const concepts = await tx.select().from(skills).where(eq(skills.courseId, courseId)).orderBy(asc(skills.id));
        await tx.insert(skillPrerequisites).values([{ skillId: concepts[1]!.id, prerequisiteSkillId: concepts[0]!.id, source: "lecturer", review: "accepted" }, { skillId: concepts[2]!.id, prerequisiteSkillId: concepts[1]!.id, source: "lecturer", review: "accepted" }]).onConflictDoNothing();
        const enrollments = await tx.select().from(studentEnrollments).where(and(eq(studentEnrollments.courseId, courseId), inArray(studentEnrollments.userId, userIds)));
        for (const e of enrollments) {
          if (state === "none" || e.goalSetAt) continue; // Re-running never overwrites a learner's work.
          const ai = state === "ai" || state === "updated";
          await tx.update(studentEnrollments).set({ goalSetAt: new Date(), learningGoal: "project", selfAssessedLevel: "basic", weeklyGoalMinutes: 300, diagnosticStatus: ai ? "done" : "skipped", pathStatus: state === "failed" ? "failed" : "ready", pathSource: ai ? "ai" : "default",
            ...(state === "complete" ? { status: "completed" as const, completedAt: new Date(), progress: 100 } : state === "updated" ? { progress: 33 } : {}) }).where(eq(studentEnrollments.id, e.id));
          const [old] = await tx.insert(personalizedLearningPaths).values({ enrollmentId: e.id, version: 1, trigger: "default_order", generatedBy: "system", status: state === "updated" ? "superseded" : "active", supersededAt: state === "updated" ? new Date() : null }).returning();
          if (!old) throw new Error("Development path missing");
          await tx.insert(pathItems).values(fixture.lessonIds.map((lessonId, index) => ({ pathId: old.id, lessonId, position: index + 1, reason: "Theo thứ tự mặc định của giảng viên.", estimatedMinutes: 10 })));
          if (ai) {
            const target = state === "updated" ? (await tx.insert(personalizedLearningPaths).values({ enrollmentId: e.id, version: 2, trigger: "lesson_completed", generatedBy: "ai", aiModel: "development-fixture", aiRationale: "Dữ liệu dev để kiểm tra giao diện thay đổi lộ trình; không phải kết quả gọi AI.", updateSummary: { afterLessonId: fixture.lessonIds[0]!, changes: [{ lessonId: fixture.lessonIds[1]!, type: "unlocked", text: "Boolean đã mở khoá sau khi hoàn thành Chuỗi." }, { lessonId: fixture.lessonIds[2]!, type: "now-skippable", text: "Mảng có thể bỏ qua theo bằng chứng BKT trong dữ liệu dev." }], message: "Lộ trình đã được cập nhật theo tiến độ của bạn." } }).returning())[0]! : old;
            if (state === "ai") await tx.update(personalizedLearningPaths).set({ generatedBy: "ai", aiModel: "development-fixture", aiRationale: "Dữ liệu dev cho trạng thái AI ready; không phải kết quả gọi AI." }).where(eq(personalizedLearningPaths.id, old.id));
            // Only the unfinished third concept has sufficient evidence for skipping.
            await tx.insert(enrollmentSkillMastery).values({ enrollmentId: e.id, skillId: concepts[2]!.id, pMastery: 0.9, evidenceCount: 5, correctCount: 5 }).onConflictDoNothing();
            if (state === "updated") await tx.insert(pathItems).values(fixture.lessonIds.map((lessonId, index) => ({ pathId: target.id, lessonId, position: index + 1, isSkippable: index === 2, reason: index === 2 ? "Có thể bỏ qua: mức thành thạo khái niệm Mảng đã vững (dữ liệu dev)." : "Học phần nền tảng còn thiếu trước (dữ liệu dev).", estimatedMinutes: 10 })));
            else await tx.update(pathItems).set({ isSkippable: true, reason: "Có thể bỏ qua vì đã có bằng chứng thành thạo khái niệm Mảng (dữ liệu dev)." }).where(and(eq(pathItems.pathId, old.id), eq(pathItems.lessonId, fixture.lessonIds[2]!)));
          }
          const completed = state === "complete" ? fixture.lessonIds : state === "updated" ? fixture.lessonIds.slice(0, 1) : [];
          if (completed.length) {
            await tx.insert(lessonProgress).values(completed.map((lessonId) => ({ enrollmentId: e.id, lessonId, status: "completed" as const, studiedAt: new Date(), completedAt: new Date() }))).onConflictDoNothing();
            await tx.insert(learningPathCompletions).values(completed.map((lessonId) => ({ enrollmentId: e.id, lessonId }))).onConflictDoNothing();
          }
        }
      });
      console.log(`/learn/${courseId}`);
    }
    console.log(`Learning-path development fixtures ready for ${userIds.length} seeded learner account(s); existing progress preserved.`);
  } catch { console.error("Learning-path development seed failed; database details suppressed."); process.exitCode = 1; }
  finally { await db.$client.end(); }
}
void main().catch(() => { console.error("Could not initialize learning-path development seed."); process.exitCode = 1; });
