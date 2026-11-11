// Codi's AI background worker (apps/web/scripts/ai-worker.ts upstream), run inside the API process instead of as a
// separate service. Same handlers and lease: GitHub profile analysis, knowledge-map extraction, quiz generation, and
// pending learning paths between jobs. Jobs are leased in Postgres, so a second worker process would be safe too.
import { runAiWorker } from "@codi-1/db/ai-worker";
import { db } from "../services";
import { runGithubProfileJob } from "../lib/github-profile-worker";
import { reconcileKnowledgeMapFailure, runKnowledgeMapJob } from "../lib/knowledge-map-worker";
import { runLearningPathWorkerOnce } from "../lib/learning-path-worker";
import { createLearningPathService } from "../lib/learning-path-service";
import { generateLearningPath } from "../lib/learning-path-ai";
import { processQuizJob } from "../lib/quiz-ai-worker";
import { indexNextKnowledgeSource } from "../lib/course-knowledge";

export const aiWorkerEnabled = () => process.env.AI_BACKGROUND_WORKER_ENABLED === "true";

/** Runs until `signal` aborts. Resolves when the loop has stopped; never rejects. */
export async function startAiWorker(signal: AbortSignal): Promise<void> {
  const learningPathService = createLearningPathService(db, generateLearningPath);
  try {
    await runAiWorker({
      db,
      signal,
      leaseSeconds: 300,
      handlers: {
        github_profile: { run: runGithubProfileJob },
        knowledge_map: { run: (job) => runKnowledgeMapJob(db, job), onFailure: reconcileKnowledgeMapFailure },
        quiz_generation: { run: processQuizJob },
      },
      // Pending learning paths first; otherwise index one course source (lesson text, PDF/slide OCR, video transcript).
      idle: async () => (await runLearningPathWorkerOnce(db, learningPathService)) || (await indexNextKnowledgeSource(db)),
    });
  } catch {
    // Provider/database errors may contain credentials; do not print their details.
    console.error("AI worker stopped unexpectedly");
  }
}
