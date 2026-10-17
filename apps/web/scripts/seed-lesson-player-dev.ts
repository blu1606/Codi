import { and, eq, isNull, like } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { PLAYER_FIXTURE_STATES, seedLessonPlayerFixture } from "./lesson-player-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const targets = await db.select({ id: user.id }).from(user).innerJoin(userRoles, eq(userRoles.userId, user.id))
      .where(and(like(user.email, "%+student@%"), like(user.name, "%(Student)"), eq(user.banned, false), eq(userRoles.roleId, "LEARNER"), isNull(userRoles.revokedAt)));
    const userIds = [...new Set(targets.map((target) => target.id))];
    if (!userIds.length) throw new Error("No existing seeded learner accounts");
    for (const state of PLAYER_FIXTURE_STATES) {
      const fixture = await db.transaction((tx) => seedLessonPlayerFixture(tx, state, userIds));
      console.log(`${state}: /learn/${fixture.courseId}/${fixture.first}`);
      if (state === "reading") console.log(`locked: /learn/${fixture.courseId}/${fixture.locked}`);
    }
    console.log(`Lesson-player fixtures ready for ${userIds.length} existing seeded learner accounts; existing progress preserved.`);
  } catch { console.error("Lesson-player seed failed; database details suppressed."); process.exitCode = 1; }
  finally { await db.$client.end(); }
}
void main().catch(() => { console.error("Could not initialize lesson-player seed."); process.exitCode = 1; });
