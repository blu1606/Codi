import { and, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { assessments } from "@codi-1/db/schema/assessments";
import {
  codingExercises,
  codingTestCases,
} from "@codi-1/db/schema/coding-exercises";
import { courses } from "@codi-1/db/schema/courses";
import { courseLessons } from "@codi-1/db/schema/course-content";
import { seedOnboardingFixture } from "./onboarding-fixture";

export const codingSolution =
  "function sumEven(numbers) {\n  return numbers.filter(n => n % 2 === 0).reduce((sum, n) => sum + n, 0);\n}\n";
export async function seedCodingFixture(
  tx: Pick<Database, "select" | "insert" | "update">,
  courseId: string,
  userIds: string[],
) {
  const f = await seedOnboardingFixture(tx, courseId, userIds);
  const lessonId = f.lessonIds[0]!;
  await tx
    .update(courses)
    .set({ title: "JavaScript — bài tập code (dev)" })
    .where(eq(courses.id, courseId));
  await tx
    .update(courseLessons)
    .set({
      title: "Cộng các số chẵn",
      body: "Thực hành hàm, mảng, filter và reduce bằng JavaScript.",
    })
    .where(eq(courseLessons.id, lessonId));
  const [existing] = await tx
    .select()
    .from(assessments)
    .where(
      and(eq(assessments.lessonId, lessonId), eq(assessments.type, "coding")),
    );
  const [assessment] = existing
    ? [existing]
    : await tx
        .insert(assessments)
        .values({
          courseId,
          lessonId,
          type: "coding",
          title: "Bài tập code: Cộng các số chẵn",
          instructions:
            "Viết hàm sumEven(numbers) nhận một mảng số nguyên.\nTrả về tổng các số chẵn, gồm cả số âm. Mảng rỗng trả về 0.\nKhông thay đổi mảng đầu vào. Không cần đọc stdin hay in kết quả; hãy return giá trị.",
          status: "published",
          maxScore: 100,
        })
        .returning();
  await tx
    .insert(codingExercises)
    .values({
      assessmentId: assessment!.id,
      language: "javascript",
      starterCode:
        "function sumEven(numbers) {\n  // Viết code của bạn ở đây\n  return 0;\n}\n",
      hints: [
        "Một số là chẵn khi chia 2 có phần dư bằng 0.",
        "Dùng filter để giữ lại số chẵn rồi reduce để cộng tổng.",
        "Giá trị ban đầu của tổng là 0 để xử lý mảng rỗng.",
      ],
      solutionCode: codingSolution,
      solutionVerifiedAt: new Date(),
    })
    .onConflictDoNothing();
  const [exercise] = await tx
    .select()
    .from(codingExercises)
    .where(eq(codingExercises.assessmentId, assessment!.id));
  for (const [position, item] of [
    {
      name: "Mảng có số chẵn và lẻ",
      input: "sumEven([1,2,3,4])",
      expectedOutput: "6",
      isSample: true,
    },
    {
      name: "Mảng rỗng",
      input: "sumEven([])",
      expectedOutput: "0",
      isSample: true,
    },
    {
      name: "Toàn số lẻ",
      input: "sumEven([1,3,5])",
      expectedOutput: "0",
      isSample: true,
    },
    {
      name: "Số chẵn âm",
      input: "sumEven([-4,-3,-2,0])",
      expectedOutput: "-6",
      isSample: false,
    },
    {
      name: "Giữ nguyên đầu vào",
      input: "(() => { const a=[2,4,5]; const r=sumEven(a); return [r,a]; })()",
      expectedOutput: "[6,[2,4,5]]",
      isSample: false,
    },
  ].entries())
    await tx
      .insert(codingTestCases)
      .values({ ...item, exerciseId: exercise!.id, position })
      .onConflictDoNothing();
  return { ...f, lessonId, codingId: assessment!.id, exerciseId: exercise!.id };
}
