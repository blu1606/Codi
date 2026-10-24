import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicationTestStore } from "./publication-test-store";
import { fetchCourseDataForReview } from "./publication-course-data";
import { checkReadiness } from "./publication-service";
vi.mock("@/services", () => ({ db: {} }));
let boundary: ReturnType<typeof createPublicationTestStore>;
beforeEach(() => { boundary = createPublicationTestStore(); });

describe("publication question projection", () => {
  it("loads only the current revision with its real sorted options and correct answer", async () => {
    boundary.state.quiz_questions = [
      { id: 1, assessmentId: 1, quizRevision: 1, text: "Old question", position: 0 },
      { id: 2, assessmentId: 1, quizRevision: 2, text: "Current question", position: 0 },
    ];
    boundary.state.quiz_options = [
      { id: 1, questionId: 1, text: "Old answer", position: 0, isCorrect: true },
      { id: 3, questionId: 2, text: "Correct", position: 1, isCorrect: true },
      { id: 2, questionId: 2, text: "Wrong", position: 0, isCorrect: false },
    ];
    const { courseData } = await fetchCourseDataForReview("c-1", boundary.store as any);
    expect(courseData.entryTest?.questions).toEqual([expect.objectContaining({
      id: 2, text: "Current question", options: ["Wrong", "Correct"], correctIndex: 1,
      aiGenerated: null, aiReviewed: null,
    })]);
    const query = boundary.predicates.find(p => p.table === "quiz_questions")!;
    expect(query.sql).toContain('"quiz_questions"."quiz_revision" = "assessments"."current_quiz_revision"');
    expect(query.params).toEqual([1]);
  });
  it("does not satisfy entry readiness using historical questions", async () => {
    boundary.state.quiz_questions = [
      ...[1, 2, 3, 4, 5].map(id => ({ id, assessmentId: 1, quizRevision: 1, text: "Old", position: id })),
      { id: 6, assessmentId: 1, quizRevision: 2, text: "Only current question", position: 0 },
    ];
    const { courseData } = await fetchCourseDataForReview("c-1", boundary.store as any);
    expect(courseData.entryTest?.questions).toHaveLength(1);
    expect(checkReadiness(courseData).items.find(item => item.key === "entry")?.ok).toBe(false);
  });
  it("uses the same revision guard for lesson quizzes, and does not certify absent AI provenance", async () => {
    boundary.state.assessments.push({ id: 2, courseId: "c-1", lessonId: "lesson-1", isDiagnostic: false, type: "quiz", currentQuizRevision: 3 });
    boundary.state.quiz_questions.push(
      { id: 20, assessmentId: 2, quizRevision: 2, text: "Old lesson question", position: 0 },
      { id: 21, assessmentId: 2, quizRevision: 3, text: "Current lesson question", position: 0 },
    );
    const { courseData } = await fetchCourseDataForReview("c-1", boundary.store as any);
    const quiz = courseData.chapters[0].lessons[0].quiz!;
    expect(quiz.questions.map(q => q.id)).toEqual([21]);
    expect(quiz.questions[0].aiGenerated).toBeNull();
    expect(quiz.questions[0].aiReviewed).toBeNull();
  });
  it("loads real material URLs and coding instructions/starter code without running code", async () => {
    boundary.state.lesson_materials = [{ id: 1, lessonId: "lesson-1", type: "video", url: "https://example.invalid/video.mp4", title: "Video" }];
    boundary.state.assessments.push({ id: 2, courseId: "c-1", lessonId: "lesson-1", type: "coding", instructions: '["Return the input"]' });
    boundary.state.coding_exercises = [{ id: 1, assessmentId: 2, starterCode: "function solve(input) {}", solutionVerifiedAt: null }];
    const { courseData } = await fetchCourseDataForReview("c-1", boundary.store as any);
    expect(courseData.chapters[0].lessons[0]).toMatchObject({
      materials: [{ url: "https://example.invalid/video.mp4" }],
      code: { instructions: ["Return the input"], starterCode: "function solve(input) {}" },
    });
    expect(boundary.events.filter(e => e.startsWith("write:"))).toEqual([]);
  });
});
