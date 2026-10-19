import { eq, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  studentStudyClocks,
  studentStudyDays,
} from "@codi-1/db/schema/study-activity";
import { loadLearningLessonAccess } from "./learning-path-service";
import { studyCredits } from "./learner-overview-contract";

export function createStudyActivityService(
  db: Database,
  clock = () => new Date(),
) {
  return {
    async heartbeat(
      userId: string,
      courseId: string,
      lessonId: string,
      active: boolean,
    ) {
      return db.transaction(async (tx) => {
        // All metrics stay behind exactly the same access guard as the player.
        await loadLearningLessonAccess(tx, userId, courseId, lessonId);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`study:${userId}`}))`,
        );
        const now = clock();
        const [previous] = await tx
          .select()
          .from(studentStudyClocks)
          .where(eq(studentStudyClocks.userId, userId));
        const credits = studyCredits(previous?.lastSeenAt ?? null, now);
        for (const credit of credits) {
          await tx
            .insert(studentStudyDays)
            .values({ userId, ...credit })
            .onConflictDoUpdate({
              target: [studentStudyDays.userId, studentStudyDays.date],
              set: {
                seconds: sql`least(86400, ${studentStudyDays.seconds} + ${credit.seconds})`,
              },
            });
        }
        const values = { courseId, lessonId, lastSeenAt: active ? now : null };
        await tx
          .insert(studentStudyClocks)
          .values({ userId, ...values })
          .onConflictDoUpdate({
            target: studentStudyClocks.userId,
            set: values,
          });
        return { recorded: true };
      });
    },
  };
}
