import { describe, expect, it, vi } from "vitest";
import { assessmentAnswers, assessmentSubmissions, assessments, courses,
  courseLessons, enrollmentSkillMastery, quizOptions, quizQuestions,
  skills, studentEnrollments } from "@codi-1/db";
import { createOnboardingService } from "./onboarding-service";
import type { ConfirmedKnowledgeMap } from "@codi-1/db/schema/confirmed-knowledge-map";

function fixture() {
  const publication: ConfirmedKnowledgeMap = {
    version: 1, publicationId: "publication-1", publishedAt: "2026-10-24T00:00:00.000Z", contentGeneration: 0,
    skills: [{ id: 101, name: "Published", bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 }],
    edges: [], links: [{ lessonId: "lesson-1", skillId: 101 }],
  };
  const course: any = { id: "course-1", title: "Course", knowledgeMapStatus: "ready", confirmedKnowledgeMap: null };
  const enrollment = { id: 10, userId: "learner", courseId: course.id, status: "active",
    diagnosticStatus: "in-progress", diagnosticQuestionIndex: 0, pathStatus: "none", goalEditing: false,
    goalSetAt: new Date("2026-10-24T00:00:00.000Z") };
  const attempt: any = { id: 20, status: "draft", quizRevision: 1, gradedAt: null };
  const answer: any = { questionId: 30, selectedOptionId: 40, isUnknown: false };
  const writes: { table: unknown; values: any }[] = [];
  const events: string[] = [];
  const rows = (table: unknown): any[] => {
    if (table === studentEnrollments) return [enrollment];
    if (table === courses) return [course];
    if (table === assessments) return [{ id: 21, title: "Diagnostic", currentQuizRevision: 1 }];
    if (table === assessmentSubmissions) return [attempt];
    if (table === quizQuestions) return [{ id: 30, type: "single_choice", lessonId: "lesson-1", points: 2, text: "Question" }];
    if (table === quizOptions) return [{ id: 40, questionId: 30, isCorrect: true, text: "Correct" }];
    if (table === assessmentAnswers) return [answer];
    if (table === courseLessons) return [{ id: "lesson-1" }];
    if (table === skills) throw new Error("Onboarding must not query review drafts");
    return [];
  };
  const query = (table: unknown): any => {
    const q: any = { then: (resolve: any, reject: any) => Promise.resolve(rows(table)).then(resolve, reject) };
    for (const method of ["where", "innerJoin", "leftJoin", "orderBy", "limit"]) q[method] = () => q;
    q.for = () => { events.push(table === studentEnrollments ? "enrollment" : "assessment"); return q; };
    return q;
  };
  const db: any = {
    select: () => ({ from: query }),
    execute: vi.fn(async () => { events.push("graph"); }),
    update: (table: unknown) => ({ set: (values: any) => ({ where: async () => {
      writes.push({ table, values });
      if (table === studentEnrollments) Object.assign(enrollment, values);
      if (table === assessmentAnswers) Object.assign(answer, values);
      if (table === assessmentSubmissions) Object.assign(attempt, values);
    } }) }),
    insert: (table: unknown) => ({ values: (values: any) => {
      writes.push({ table, values });
      return { onConflictDoUpdate: async () => [] };
    } }),
    transaction: (cb: any) => cb(db),
  };
  return { publication, course, enrollment, attempt, answer, writes, events, service: createOnboardingService(db) };
}

describe("diagnostic confirmed-map boundary", () => {
  it("keeps score, answers and completion with no trusted payload, without mastery or later replay", async () => {
    const f = fixture();
    const result = await f.service.execute("learner", f.course.id, { type: "submit", attemptId: 20 });
    expect(f.attempt).toMatchObject({ score: 2, status: "graded" });
    expect(f.answer).toMatchObject({ isCorrect: true, earnedPoints: 2 });
    expect(f.enrollment.diagnosticStatus).toBe("done");
    expect(result.result).toMatchObject({ right: 1, concepts: [] });
    expect(f.writes.filter((write) => write.table === enrollmentSkillMastery)).toEqual([]);
    f.course.confirmedKnowledgeMap = f.publication;
    await f.service.get("learner", f.course.id);
    await f.service.execute("learner", f.course.id, { type: "submit", attemptId: 20 });
    expect(f.writes.filter((write) => write.table === enrollmentSkillMastery)).toEqual([]);
    expect(f.events.slice(0, 3)).toEqual(["enrollment", "graph", "assessment"]);
  });
  it("grades against published IDs and BKT parameters while the review map is ready", async () => {
    const f = fixture();
    f.course.confirmedKnowledgeMap = f.publication;
    await f.service.execute("learner", f.course.id, { type: "submit", attemptId: 20 });
    const mastery = f.writes.filter((write) => write.table === enrollmentSkillMastery);
    expect(mastery).toHaveLength(1);
    expect(mastery[0].values).toMatchObject({ skillId: 101, enrollmentId: 10, evidenceCount: 1, correctCount: 1 });
    expect(mastery[0].values.pMastery).toBeGreaterThan(0.1);
  });
});
