import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { assessments } from "@codi-1/db/schema/assessments";
import { runJavaScript } from "@codi-1/coding-runner";
import { acquireRunLease, releaseRunLease } from "./coding-run-lease";
import { loadLearningLessonAccess } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";
import {
  assignmentCodeLanguage,
  assignmentRunCommand,
  type AssignmentRunView,
} from "./assessment-contract";

type Scope = {
  userId: string;
  courseId: string;
  lessonId: string;
  assessmentId: number;
};
type Runner = typeof runJavaScript;

// A free run has no tests: the script runs once and its console output is the result.
const FREE_RUN = [{ id: 0, input: null, isSample: true }];

/**
 * "Chạy" for code assignments: runs the learner's draft code once in the server sandbox and returns its console and
 * error. Nothing is stored or graded (the lecturer grades the submitted code); the per-user run lease shared with
 * coding exercises limits learners to one run at a time and one start every 2 seconds.
 */
export function createAssignmentRunService(db: Database, runner: Runner = runJavaScript) {
  async function language(scope: Scope) {
    await loadLearningLessonAccess(db, scope.userId, scope.courseId, scope.lessonId);
    const [assessment] = await db
      .select({ title: assessments.title, instructions: assessments.instructions })
      .from(assessments)
      .where(
        and(
          eq(assessments.id, scope.assessmentId),
          eq(assessments.courseId, scope.courseId),
          eq(assessments.lessonId, scope.lessonId),
          eq(assessments.type, "assignment"),
          eq(assessments.status, "published"),
          eq(assessments.isDiagnostic, false),
        ),
      );
    if (!assessment) throw new LearningPathError("Không tìm thấy bài tập.", 404);
    const lang = assignmentCodeLanguage(assessment);
    if (!lang)
      throw new LearningPathError("Bài tập này không có trình chạy code.", 400);
    return lang;
  }

  return {
    async run(scope: Scope, input: unknown): Promise<AssignmentRunView> {
      const { code } = assignmentRunCommand.parse(input);
      if (!code.trim())
        throw new LearningPathError("Hãy viết code trước khi chạy.", 400);
      const lang = await language(scope);
      const token = randomUUID();
      await acquireRunLease(db, scope.userId, token);
      try {
        let result;
        try {
          result = await runner({ code, language: lang, tests: FREE_RUN });
        } catch {
          throw new LearningPathError(
            "Máy chạy code đang bận hoặc chưa sẵn sàng. Code của bạn vẫn được giữ; hãy thử lại.",
            503,
          );
        }
        const outcome = result.outcomes[0];
        return {
          phase: result.phase,
          durationMs: result.durationMs,
          logs: result.logs,
          error: result.phase === "done" ? null : (outcome?.error ?? null),
          line: result.phase === "done" ? null : (outcome?.line ?? null),
        };
      } finally {
        await releaseRunLease(db, scope.userId, token);
      }
    },
  };
}
