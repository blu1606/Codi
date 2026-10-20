import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@codi-1/db";
import { assessments } from "@codi-1/db/schema/assessments";
import { codingExercises } from "@codi-1/db/schema/coding-exercises";
import {
  codingExerciseFromMockup,
  mockupLessonUuid,
  mockupSnapshot,
} from "./seed-mockup-mapping";

// Only the additive tutorial migration and the existing mockup tutorial content.
// No enrollment, answer, submission or saved workspace is modified.
async function main() {
  assert.ok(
    process.env.DATABASE_URL && process.env.NODE_ENV !== "production",
    "Development DB required",
  );
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const folder = resolve("../../packages/db/src/migrations");
    const local = readMigrationFiles({ migrationsFolder: folder });
    const history = await db.execute(
      sql`select hash, name from drizzle.__drizzle_migrations`,
    );
    const applied = new Set(history.rows.map((r) => String(r.name)));
    const pending = local.filter((m) => !applied.has(m.name!));
    assert.ok(
      pending.every((m) => m.name === "20261019102323_coding_tutorial_steps"),
      "Unexpected pending migrations; stop without changing DB",
    );
    const data = mockupSnapshot.parse(
      JSON.parse(readFileSync("scripts/data/mockup-seed.json", "utf8")),
    );
    const course = data.courses.find((c) => c.id === "course-js-001")!;
    const lesson = course.chapters
      .flatMap((c) => c.lessons)
      .find((l) => l.code?.kind === "tutorial")!;
    assert.ok(lesson?.code?.kind === "tutorial");
    const lessonId = mockupLessonUuid(lesson.id);
    const [assessment] = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(
        and(
          eq(assessments.courseId, course.id),
          eq(assessments.lessonId, lessonId),
          eq(assessments.type, "coding"),
          eq(assessments.status, "published"),
        ),
      );
    assert.ok(assessment, "Existing published tutorial required");
    const mapped = codingExerciseFromMockup(lesson.title, lesson.code);
    console.log(
      JSON.stringify({
        mode: process.argv.includes("--apply") ? "apply" : "dry-run",
        migrations: pending.map((m) => m.name),
        lesson: lesson.title,
        steps: mapped.tutorialSteps.length,
        url: `http://localhost:3001/learn/${course.id}/${lessonId}`,
      }),
    );
    if (!process.argv.includes("--apply")) return;
    if (pending.length) await migrate(db, { migrationsFolder: folder });
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(codingExercises)
        .set({ fileName: mapped.fileName, tutorialSteps: mapped.tutorialSteps })
        .where(eq(codingExercises.assessmentId, assessment.id))
        .returning({ id: codingExercises.id });
      assert.equal(updated.length, 1);
    });
    console.log(
      "Tutorial ready; existing progress, attempts and drafts preserved.",
    );
  } catch (error) {
    console.error(
      "Preview preparation failed:",
      error instanceof assert.AssertionError
        ? error.message
        : ((error as { code?: string }).code ?? (error as Error).name),
    );
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
void main();
