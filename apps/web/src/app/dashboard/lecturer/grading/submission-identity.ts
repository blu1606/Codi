import { createHash } from "node:crypto";

/** A stale-view fence, not a credential. Authorization is checked independently under locks. */
export function submissionIdentity(row: Record<string, unknown>): string {
  const fields = [
    "id", "assessmentId", "enrollmentId", "attempt", "answerText", "fileUrl", "fileName", "linkUrl",
    "submittedAt", "savedAt", "status", "score", "feedback", "gradedAt", "gradedBy",
    "maxScore", "passingScore", "rubric", "instructions", "type", "courseId",
  ];
  return createHash("sha256").update(JSON.stringify(fields.map(key => {
    const value = row[key];
    return value instanceof Date ? value.toISOString() : value ?? null;
  }))).digest("hex");
}
