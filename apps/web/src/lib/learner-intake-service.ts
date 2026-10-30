import { and, desc, eq, isNull, like } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { studentActivities, studentEnrollments } from "@codi-1/db/schema/student-profile";
import type { GoalDraft } from "@codi-1/db/schema/onboarding-values";
import {
  applyIntakePatch,
  sanitizeIntake,
  type IntakeField,
} from "./learner-intake-contract";

const ACTIVITY_TYPE = "course_view" as const;
const INTAKE_MARK = "%advisor_intake%";

/** The learner's latest intake answers, read where course onboarding reads them. */
export async function readLearnerIntake(db: Database, userId: string): Promise<GoalDraft> {
  const [row] = await db
    .select({ metadata: studentActivities.metadata })
    .from(studentActivities)
    .where(
      and(
        eq(studentActivities.userId, userId),
        eq(studentActivities.type, ACTIVITY_TYPE),
        like(studentActivities.metadata, INTAKE_MARK),
      ),
    )
    .orderBy(desc(studentActivities.occurredAt))
    .limit(1);
  if (!row?.metadata) return {};
  try {
    const parsed = JSON.parse(row.metadata) as { draft?: Record<string, unknown> };
    return sanitizeIntake(parsed.draft ?? {});
  } catch {
    return {};
  }
}

/**
 * Save answers (null clears one). The new draft is recorded as an intake activity, and every
 * active enrolment whose goal is not set yet takes it as its onboarding draft.
 */
export async function saveLearnerIntake(
  db: Database,
  userId: string,
  patch: Partial<Record<IntakeField, string | number | null>>,
): Promise<GoalDraft> {
  const draft = applyIntakePatch(await readLearnerIntake(db, userId), patch);
  await db.insert(studentActivities).values({
    userId,
    type: ACTIVITY_TYPE,
    metadata: JSON.stringify({ type: "advisor_intake", intake: draft, draft }),
  });
  const pending = await db
    .select({ id: studentEnrollments.id, goalDraft: studentEnrollments.goalDraft })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        eq(studentEnrollments.status, "active"),
        isNull(studentEnrollments.goalSetAt),
      ),
    );
  for (const enrollment of pending) {
    await db
      .update(studentEnrollments)
      .set({
        goalDraft: applyIntakePatch(
          (enrollment.goalDraft as GoalDraft | null) ?? {},
          patch,
        ),
      })
      .where(eq(studentEnrollments.id, enrollment.id));
  }
  return draft;
}
