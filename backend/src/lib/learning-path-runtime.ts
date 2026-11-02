import { after } from "next/server";
import { db } from "@/services";
import { generateLearningPath } from "./learning-path-ai";
import { createLearningPathService } from "./learning-path-service";

export const learningPathService = createLearningPathService(db, generateLearningPath);
export function scheduleLearningPath(userId: string, courseId: string) {
  after(async () => {
    try { await learningPathService.runPending(userId, courseId); }
    catch { console.warn("Learning path background work could not finish; durable work will resume on the next request."); }
  });
}
