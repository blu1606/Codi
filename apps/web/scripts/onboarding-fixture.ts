import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { assessments, quizOptions, quizQuestions } from "@codi-1/db/schema/assessments";
import { lessonSkills, skills } from "@codi-1/db/schema/knowledge-map";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";

type Store = Pick<Database, "select" | "insert">;
function stableUuid(input: string) {
  const hex = createHash("sha256").update(input).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Explicit development/test content, never a fallback returned by application APIs.
export async function seedOnboardingFixture(store: Store, courseId: string, userIds: string[]) {
  // Hidden fixtures remain available to enrolled QA accounts without appearing in the public catalog.
  await store.insert(courses).values({ id: courseId, slug: courseId, title: "TypeScript — thực hành onboarding (dev)", category: "Frontend", level: "Beginner", duration: "30 phút", description: "Dữ liệu phát triển cho mục tiêu, bài kiểm tra đầu vào và BKT.", price: 0, status: "hidden", hiddenReason: "Dữ liệu kiểm thử phát triển, không hiển thị trong danh mục công khai.", knowledgeMapStatus: "confirmed" }).onConflictDoUpdate({ target: courses.id, set: { status: "hidden", hiddenReason: "Dữ liệu kiểm thử phát triển, không hiển thị trong danh mục công khai." } });
  const chapterId = stableUuid(`${courseId}:chapter`);
  await store.insert(courseChapters).values({ id: chapterId, courseId, title: "Kiểu dữ liệu cơ bản", position: 0, isPublished: true }).onConflictDoNothing();
  const examples = [
    { name: "Chuỗi", text: "Kiểu nào biểu diễn một chuỗi ký tự trong TypeScript?", correct: "string", wrong: "number" },
    { name: "Boolean", text: "Kiểu nào chỉ nhận giá trị true hoặc false?", correct: "boolean", wrong: "string" },
    { name: "Mảng", text: "Cách viết nào biểu diễn một mảng số trong TypeScript?", correct: "number[]", wrong: "number" },
  ];
  await store.insert(assessments).values({ courseId, type: "quiz", isDiagnostic: true, title: "Điểm xuất phát TypeScript", status: "published" }).onConflictDoNothing();
  const [assessment] = await store.select().from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true)));
  if (!assessment) throw new Error("Development diagnostic missing");
  for (const [index, example] of examples.entries()) {
    const lessonId = stableUuid(`${courseId}:lesson:${index}`);
    await store.insert(courseLessons).values({ id: lessonId, chapterId, title: example.name, position: index, durationSeconds: 600, isPublished: true, body: `Bài học về ${example.name.toLowerCase()} trong TypeScript.` }).onConflictDoNothing();
    await store.insert(skills).values({ courseId, name: example.name, source: "lecturer", review: "accepted" }).onConflictDoNothing();
    const [skill] = await store.select().from(skills).where(and(eq(skills.courseId, courseId), eq(skills.name, example.name)));
    if (!skill) throw new Error("Development concept missing");
    await store.insert(lessonSkills).values({ lessonId, skillId: skill.id }).onConflictDoNothing();
    await store.insert(quizQuestions).values({ assessmentId: assessment.id, lessonId, text: example.text, position: index }).onConflictDoNothing();
    const [question] = await store.select().from(quizQuestions).where(and(eq(quizQuestions.assessmentId, assessment.id), eq(quizQuestions.position, index)));
    if (!question) throw new Error("Development question missing");
    await store.insert(quizOptions).values([{ questionId: question.id, text: example.correct, position: 0, isCorrect: true }, { questionId: question.id, text: example.wrong, position: 1, isCorrect: false }]).onConflictDoNothing();
  }
  for (const userId of userIds) await store.insert(studentEnrollments).values({ userId, courseId }).onConflictDoNothing();
  return { courseId, chapterId, lessonIds: examples.map((_, index) => stableUuid(`${courseId}:lesson:${index}`)), assessmentId: assessment.id,
    questions: await store.select().from(quizQuestions).where(eq(quizQuestions.assessmentId, assessment.id)).orderBy(asc(quizQuestions.position)) };
}
