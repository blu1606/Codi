import { runAiWorker } from "@codi-1/db/ai-worker";
import { db } from "../src/services";
import { runGithubProfileJob } from "../src/lib/github-profile-worker";
import { runKnowledgeMapJob, reconcileKnowledgeMapFailure } from "../src/lib/knowledge-map-worker";
import { runLearningPathWorkerOnce } from "../src/lib/learning-path-worker";
import { createLearningPathService } from "../src/lib/learning-path-service";
import { generateLearningPath } from "../src/lib/learning-path-ai";
import { processQuizJob } from "../src/lib/quiz-ai-worker";

async function main() {
if (process.env.AI_BACKGROUND_WORKER_ENABLED !== "true") {
  throw new Error("AI background worker is disabled");
}

const stop = new AbortController();
process.once("SIGTERM", () => stop.abort());
process.once("SIGINT", () => stop.abort());
const learningPathService = createLearningPathService(db, generateLearningPath);
try {
await runAiWorker({
  db,
  signal: stop.signal,
  leaseSeconds: 300,
  handlers: {
    github_profile: { run: runGithubProfileJob },
    knowledge_map: { run: (job) => runKnowledgeMapJob(db, job), onFailure: reconcileKnowledgeMapFailure },
    quiz_generation: { run: processQuizJob },
  },
  idle: () => runLearningPathWorkerOnce(db, learningPathService),
});
} finally {
  await db.$client.end();
}

}

main().catch(() => {
  // Provider/database errors may contain credentials; do not print their details.
  console.error("AI worker could not start");
  process.exitCode = 1;
});
