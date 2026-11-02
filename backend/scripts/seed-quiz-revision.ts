import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  assessments,
  assessmentSubmissions,
  quizOptions,
  quizQuestions,
} from "@codi-1/db/schema/assessments";

type Store = Pick<Database, "select" | "insert" | "update">;
type QuestionInput = Pick<typeof quizQuestions.$inferInsert, "text"> &
  Partial<
    Pick<
      typeof quizQuestions.$inferInsert,
      "lessonId" | "type" | "codeSnippet" | "points" | "explanation"
    >
  > & {
    options: {
      text: string;
      isCorrect: boolean;
      explanation?: string | null;
    }[];
  };
const content = (question: QuestionInput, position: number) => ({
  position,
  lessonId: question.lessonId ?? null,
  text: question.text,
  type: question.type ?? ("single_choice" as const),
  codeSnippet: question.codeSnippet ?? null,
  points: question.points ?? 1,
  explanation: question.explanation ?? null,
  options: question.options.map((option, position) => ({
    position,
    text: option.text,
    isCorrect: option.isCorrect,
    explanation: option.explanation ?? null,
  })),
});

// Caller owns the transaction. All fixture authors serialize with app publication/start on this row.
export async function seedQuizRevision(
  store: Store,
  assessmentId: number,
  desired: QuestionInput[],
  preserveExisting = false,
) {
  const [assessment] = await store
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .for("update");
  if (
    !assessment ||
    assessment.type !== "quiz" ||
    !Number.isInteger(assessment.currentQuizRevision) ||
    assessment.currentQuizRevision < 1
  )
    throw new Error("Fixture quiz revision missing or invalid");
  const current = await store
    .select()
    .from(quizQuestions)
    .where(
      and(
        eq(quizQuestions.assessmentId, assessmentId),
        eq(quizQuestions.quizRevision, assessment.currentQuizRevision),
      ),
    )
    .orderBy(asc(quizQuestions.position));
  const options = current.length
    ? await store
        .select()
        .from(quizOptions)
        .where(
          inArray(
            quizOptions.questionId,
            current.map((question) => question.id),
          ),
        )
        .orderBy(asc(quizOptions.position))
    : [];
  const existing = current.map((question) => ({
    ...question,
    options: options.filter((option) => option.questionId === question.id),
  }));
  const previous = existing.map((question) =>
    content(question, question.position),
  );
  const proposed = new Map(
    desired.map((question, position) => [
      position,
      content(question, position),
    ]),
  );
  // The development fixtures originally filled missing positions, never overwrote existing content.
  if (preserveExisting)
    for (const question of previous) {
      const choices = new Map(
        (proposed.get(question.position)?.options ?? []).map((option) => [
          option.position,
          option,
        ]),
      );
      for (const option of question.options)
        choices.set(option.position, option);
      proposed.set(question.position, {
        ...question,
        options: [...choices.values()].sort((a, b) => a.position - b.position),
      });
    }
  const next = [...proposed.values()].sort((a, b) => a.position - b.position);
  if (JSON.stringify(previous) === JSON.stringify(next))
    return {
      quizRevision: assessment.currentQuizRevision,
      questions: existing,
    };

  const [attempt] = await store
    .select({ id: assessmentSubmissions.id })
    .from(assessmentSubmissions)
    .where(
      and(
        eq(assessmentSubmissions.assessmentId, assessmentId),
        eq(assessmentSubmissions.quizRevision, assessment.currentQuizRevision),
      ),
    )
    .limit(1);
  const quizRevision =
    current.length || attempt
      ? assessment.currentQuizRevision + 1
      : assessment.currentQuizRevision;
  const questions: typeof existing = [];
  for (const question of next) {
    const { options: choices, ...fields } = question;
    const [created] = await store
      .insert(quizQuestions)
      .values({ assessmentId, quizRevision, ...fields })
      .returning();
    if (!created) throw new Error("Fixture question missing");
    const createdOptions = choices.length
      ? await store
          .insert(quizOptions)
          .values(
            choices.map((option) => ({ questionId: created.id, ...option })),
          )
          .returning()
      : [];
    questions.push({ ...created, options: createdOptions });
  }
  await store
    .update(assessments)
    .set({ currentQuizRevision: quizRevision, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId));
  return { quizRevision, questions };
}
