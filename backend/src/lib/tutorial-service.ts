import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { assessments } from "@codi-1/db/schema/assessments";
import {
  codingExercises,
  codingWorkspaces,
  codingRunLeases,
} from "@codi-1/db/schema/coding-exercises";
import type { TutorialProgress } from "@codi-1/db/schema/coding-tutorial";
import { runJavaScript } from "@codi-1/coding-runner";
import { runLeaseExpiresAt } from "./coding-run-lease";
import { loadLearningLessonAccess } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";
import {
  tutorialCommand,
  tutorialTransition,
  tutorialView,
  tutorialRun,
  type TutorialCommand,
} from "./tutorial-contract";

type Scope = {
  userId: string;
  courseId: string;
  lessonId: string;
  assessmentId: number;
};
type Store = Pick<Database, "select" | "insert" | "update" | "execute">;
async function context(store: Store, scope: Scope, lock = false) {
  const { enrollment } = await loadLearningLessonAccess(
    store,
    scope.userId,
    scope.courseId,
    scope.lessonId,
    lock,
  );
  const [row] = await store
    .select({ exercise: codingExercises })
    .from(assessments)
    .innerJoin(
      codingExercises,
      eq(codingExercises.assessmentId, assessments.id),
    )
    .where(
      and(
        eq(assessments.id, scope.assessmentId),
        eq(assessments.courseId, scope.courseId),
        eq(assessments.lessonId, scope.lessonId),
        eq(assessments.type, "coding"),
        eq(assessments.status, "published"),
        eq(assessments.isDiagnostic, false),
      ),
    );
  if (!row?.exercise.tutorialSteps.length)
    throw new LearningPathError("Không tìm thấy hướng dẫn code.", 404);
  const [workspace] = await store
    .select()
    .from(codingWorkspaces)
    .where(
      and(
        eq(codingWorkspaces.exerciseId, row.exercise.id),
        eq(codingWorkspaces.enrollmentId, enrollment.id),
      ),
    );
  return { enrollment, exercise: row.exercise, workspace };
}
type Context = Awaited<ReturnType<typeof context>>;
const project = (ctx: Context) =>
  tutorialView(
    ctx.exercise.tutorialSteps,
    ctx.workspace?.tutorialProgress ?? null,
    ctx.workspace?.solutionViewed ?? false,
    ctx.exercise.language,
    ctx.exercise.fileName,
  );
async function save(
  store: Store,
  ctx: Context,
  progress: TutorialProgress,
  solutionViewed: boolean,
) {
  await store
    .insert(codingWorkspaces)
    .values({
      exerciseId: ctx.exercise.id,
      enrollmentId: ctx.enrollment.id,
      draft: ctx.workspace?.draft ?? ctx.exercise.starterCode,
      tutorialProgress: progress,
      solutionViewed,
    })
    .onConflictDoUpdate({
      target: [codingWorkspaces.exerciseId, codingWorkspaces.enrollmentId],
      set: {
        tutorialProgress: progress,
        solutionViewed,
        updatedAt: new Date(),
      },
    });
}

export function createTutorialService(db: Database, runner = runJavaScript) {
  const get = (scope: Scope) =>
    db.transaction(async (tx) => project(await context(tx, scope)), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  async function execute(scope: Scope, raw: TutorialCommand) {
    const command = tutorialCommand.parse(raw);
    const token = randomUUID();
    const ctx = await db.transaction(async (tx) => {
      const ctx = await context(tx, scope, true);
      const next = tutorialTransition(
        ctx.exercise.tutorialSteps,
        ctx.workspace?.tutorialProgress ?? null,
        ctx.workspace?.solutionViewed ?? false,
        command,
      );
      if (command.type === "run") {
        if (ctx.exercise.language !== "javascript")
          throw new LearningPathError(
            "Dịch vụ chạy code chưa sẵn sàng. Bạn vẫn có thể lưu nháp.",
            503,
          );
        const [lease] = await tx
          .insert(codingRunLeases)
          .values({
            userId: scope.userId,
            token,
            runningUntil: runLeaseExpiresAt,
            lastStartedAt: sql`clock_timestamp()`,
          })
          .onConflictDoUpdate({
            target: codingRunLeases.userId,
            set: {
              token,
              runningUntil: runLeaseExpiresAt,
              lastStartedAt: sql`clock_timestamp()`,
            },
            setWhere: sql`${codingRunLeases.runningUntil} <= clock_timestamp() and ${codingRunLeases.lastStartedAt} <= clock_timestamp() - interval '2 seconds'`,
          })
          .returning();
        if (!lease)
          throw new LearningPathError(
            "Một lượt chạy đang diễn ra hoặc bạn chạy quá nhanh. Vui lòng thử lại sau 2 giây.",
            429,
          );
      } else if (command.type !== "draft" && command.type !== "step") {
        const [lease] = await tx
          .select()
          .from(codingRunLeases)
          .where(eq(codingRunLeases.userId, scope.userId))
          .for("update");
        if (lease && lease.runningUntil > new Date())
          throw new LearningPathError("Hãy chờ lượt chạy kết thúc.", 409);
      }
      await save(tx, ctx, next.progress, next.solutionViewed);
      return ctx;
    });
    if (command.type === "run") {
      try {
        const s = ctx.exercise.tutorialSteps[command.step]!;
        let result;
        try {
          // The sentinel executes console-only steps inside the same sandbox as challenges.
          result = await runner({
            code: command.code,
            tests: s.tests?.length
              ? s.tests.map((t, i) => ({
                  id: i + 1,
                  input: t.input,
                  isSample: true,
                }))
              : [{ id: 1, input: "null", isSample: true }],
          });
        } catch {
          throw new LearningPathError(
            "Sandbox chưa sẵn sàng. Code nháp của bạn vẫn được giữ; hãy thử lại.",
            503,
          );
        }
        await db.transaction(async (tx) => {
          const fresh = await context(tx, scope, true);
          const [lease] = await tx
            .select()
            .from(codingRunLeases)
            .where(eq(codingRunLeases.userId, scope.userId))
            .for("update");
          if (
            !lease ||
            lease.token !== token ||
            lease.runningUntil <= new Date()
          )
            throw new LearningPathError(
              "Lượt chạy đã hết hạn. Vui lòng chạy lại.",
              409,
            );
          if (JSON.stringify(fresh.exercise) !== JSON.stringify(ctx.exercise))
            throw new LearningPathError(
              "Bài hướng dẫn vừa được cập nhật. Vui lòng tải lại.",
              409,
            );
          const p = fresh.workspace!.tutorialProgress!;
          p.runs[String(command.step)] = tutorialRun(s, result);
          await save(tx, fresh, p, fresh.workspace!.solutionViewed);
        });
      } finally {
        await db
          .update(codingRunLeases)
          .set({ runningUntil: sql`clock_timestamp()` })
          .where(
            and(
              eq(codingRunLeases.userId, scope.userId),
              eq(codingRunLeases.token, token),
            ),
          );
      }
    }
    return command.type === "draft"
      ? { saved: true, code: command.code }
      : get(scope);
  }
  return { get, execute };
}
