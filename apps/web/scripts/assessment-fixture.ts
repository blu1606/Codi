import { and, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  assessments,
} from "@codi-1/db/schema/assessments";
import { seedOnboardingFixture } from "./onboarding-fixture";
import { seedQuizRevision } from "./seed-quiz-revision";

export async function seedAssessmentFixture(
  tx: Pick<Database, "select" | "insert" | "update">,
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
  const desired = Array.from({ length: questionCount }, (_, position) => {
    const item = examples[position % examples.length]!;
    return { lessonId, text: item.text, explanation: item.explanation, options: [
      { text: item.right, isCorrect: true }, { text: item.wrong, isCorrect: false },
    ] };
  });
  const { questions } = await seedQuizRevision(tx, quiz.id, desired, true);
  return {
    ...fixture,
    lessonId,
    quizId: quiz.id,
    assignmentId: assignment.id,
    questions,
  };
}
