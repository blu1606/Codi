import { and, eq, isNull, like } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedCodingFixture } from "./coding-fixture";
async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const accounts = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(userRoles, eq(userRoles.userId, user.id))
      .where(
        and(
          like(user.email, "%+student@%"),
          like(user.name, "%(Student)"),
          eq(user.banned, false),
          eq(userRoles.roleId, "LEARNER"),
          isNull(userRoles.revokedAt),
        ),
      );
    const userIds = [...new Set(accounts.map((a) => a.id))];
    if (!userIds.length) throw new Error("Seeded learners required");
    const f = await db.transaction((tx) =>
      seedCodingFixture(tx, "dev-coding-practice", userIds),
    );
    for (const userId of userIds) {
      const [enrollment] = await db
        .select()
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.courseId, f.courseId),
            eq(studentEnrollments.userId, userId),
          ),
        );
      if (enrollment?.pathStatus !== "none") continue;
      const onboarding = createOnboardingService(db);
      if (!enrollment.goalSetAt)
        await onboarding.execute(userId, f.courseId, { type: "goal-skip" });
      await onboarding.execute(userId, f.courseId, { type: "fork-default" });
    }
    console.log(
      `Bài tập code: http://localhost:3001/learn/${f.courseId}/${f.lessonId}`,
    );
    console.log("Existing learner drafts and submissions preserved.");
  } catch {
    console.error("Coding seed failed; database details suppressed.");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Could not initialize coding seed.");
  process.exitCode = 1;
});
