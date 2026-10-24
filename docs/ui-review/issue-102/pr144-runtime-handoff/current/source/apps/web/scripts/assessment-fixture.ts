import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  assessments,
  quizQuestions,
  quizOptions,
} from "@codi-1/db/schema/assessments";
import { seedOnboardingFixture } from "./onboarding-fixture";

export async function seedAssessmentFixture(
  tx: Pick<Database, "select" | "insert">,
  courseId: string,
  userIds: string[],
  questionCount = 3,
) {
  const fixture = await seedOnboardingFixture(tx, courseId, userIds);
  const lessonId = fixture.lessonIds[0]!;
  for (const type of ["quiz", "assignment"] as const) {
    const [existing] = await tx
      .select()
      .from(assessments)
      .where(
        and(eq(assessments.lessonId, lessonId), eq(assessments.type, type)),
      );
    if (!existing)
      await tx.insert(assessments).values({
        courseId,
        lessonId,
        type,
        title:
          type === "quiz"
            ? "Quiz cuối bài: Chuỗi TypeScript"
            : "Bài tập: Xử lý chuỗi",
        instructions:
          type === "quiz"
            ? "Chọn một đáp án đúng cho mỗi câu."
            : "Viết hàm chào người dùng và nộp tệp hoặc đường dẫn repository. Giải thích cách bạn xử lý chuỗi rỗng.",
        maxScore: type === "quiz" ? 100 : 10,
        passingScore: type === "quiz" ? 70 : 50,
        submissionFormat: type === "assignment" ? "file_or_link" : null,
        maxFileSizeMb: type === "assignment" ? 20 : null,
        status: "published",
      });
  }
  const checks = await tx
    .select()
    .from(assessments)
    .where(eq(assessments.lessonId, lessonId));
  const quiz = checks.find((a) => a.type === "quiz")!;
  const assignment = checks.find((a) => a.type === "assignment")!;
  const examples = [
    {
      text: "Kiểu nào biểu diễn văn bản trong TypeScript?",
      right: "string",
      wrong: "number",
      explanation: "string là kiểu dữ liệu cho chuỗi ký tự.",
    },
    {
      text: "Kết quả của 'Codi'.toUpperCase() là gì?",
      right: "CODI",
      wrong: "codi",
      explanation: "toUpperCase() chuyển các ký tự thành chữ hoa.",
    },
    {
      text: "Dùng thuộc tính nào để lấy độ dài chuỗi?",
      right: "length",
      wrong: "size",
      explanation: "Thuộc tính length cho biết độ dài chuỗi.",
    },
  ];
  for (let position = 0; position < questionCount; position++) {
    const item = examples[position % examples.length]!;
    await tx
      .insert(quizQuestions)
      .values({
        assessmentId: quiz.id,
        lessonId,
        text: item.text,
        explanation: item.explanation,
        position,
      })
      .onConflictDoNothing();
    const [q] = await tx
      .select()
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.assessmentId, quiz.id),
          eq(quizQuestions.position, position),
        ),
      );
    if (!q) throw new Error("Fixture question missing");
    await tx
      .insert(quizOptions)
      .values([
        { questionId: q.id, text: item.right, isCorrect: true, position: 0 },
        { questionId: q.id, text: item.wrong, isCorrect: false, position: 1 },
      ])
      .onConflictDoNothing();
  }
  const questions = await tx
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.assessmentId, quiz.id))
    .orderBy(asc(quizQuestions.position));
  const options = await tx.select().from(quizOptions);
  return {
    ...fixture,
    lessonId,
    quizId: quiz.id,
    assignmentId: assignment.id,
    questions: questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.questionId === q.id),
    })),
  };
}
