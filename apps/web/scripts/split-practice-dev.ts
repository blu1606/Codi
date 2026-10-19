import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { PRACTICE_SPLIT, splitPracticeLessons } from "./practice-lesson-split";

async function main() {
  assert.ok(
    process.env.DATABASE_URL && process.env.NODE_ENV !== "production",
    "Development DB required",
  );
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("PREVIEW_ROLLBACK");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      // Full-row fingerprints verify preservation without logging learner data.
      const fingerprint = async () =>
        (
          await tx.execute(sql`
        select
          (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text, '[]')) from assessment_submissions s join assessments a on a.id = s.assessment_id where a.course_id = ${PRACTICE_SPLIT.courseId}) as attempts,
          (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.submission_id, r.question_id)::text, '[]')) from assessment_answers r join assessment_submissions s on s.id = r.submission_id join assessments a on a.id = s.assessment_id where a.course_id = ${PRACTICE_SPLIT.courseId}) as answers,
          (select md5(coalesce(jsonb_agg(to_jsonb(w) order by w.exercise_id, w.enrollment_id)::text, '[]')) from coding_workspaces w join coding_exercises x on x.id = w.exercise_id join assessments a on a.id = x.assessment_id where a.course_id = ${PRACTICE_SPLIT.courseId}) as drafts
      `)
        ).rows;
      const before = await fingerprint();
      const result = await splitPracticeLessons(tx);
      assert.deepEqual(
        await fingerprint(),
        before,
        "Existing attempts, answers or workspaces changed",
      );
      const positions = async () =>
        (
          await tx.execute(
            sql`select i.path_id, i.lesson_id, i.position from path_items i join personalized_learning_paths p on p.id = i.path_id join student_enrollments e on e.id = p.enrollment_id where e.course_id = ${PRACTICE_SPLIT.courseId} order by i.path_id, i.position`,
          )
        ).rows;
      const first = await positions();
      await splitPracticeLessons(tx);
      assert.deepEqual(
        await positions(),
        first,
        "Repeat split must not duplicate or reorder lessons",
      );
      assert.deepEqual(await fingerprint(), before);
      console.log(
        JSON.stringify({
          mode: process.argv.includes("--apply") ? "apply" : "rollback preview",
          ...result,
        }),
      );
      console.log(
        "Verified: attempts, answers and code drafts preserved; repeat run is idempotent.",
      );
      if (!process.argv.includes("--apply")) throw rollback;
    });
  } catch (e) {
    if (e !== rollback) {
      console.error(
        "Practice split failed:",
        e instanceof assert.AssertionError
          ? e.message
          : ((e as { cause?: { code?: string } }).cause?.code ??
              (e as Error).name),
      );
      process.exitCode = 1;
    }
  } finally {
    await db.$client.end();
  }
}
void main();
