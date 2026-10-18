"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assessments,
  codingExercises,
  codingTestCases,
  courseLessons,
  courses,
} from "@codi-1/db";
import {
  executeCode,
  gradeCodeResults,
  stableJSON,
} from "@/lib/code-runner";
import { db } from "@/services";
import {
  getEditableCourse,
  markKnowledgeMapStaleIfPublished,
} from "../actions";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

export interface CodingTestCaseInput {
  id?: string | number;
  name: string;
  call: string;
  expected: any;
  expectedText?: string;
  isSample?: boolean;
  hidden?: boolean;
}

export interface SaveCodingExerciseInput {
  title: string;
  durationMinutes?: number;
  fileName?: string;
  language: string;
  instructions: string[];
  starterCode: string;
  solutionCode: string;
  hints?: string[];
  tests: CodingTestCaseInput[];
}

export interface VerifySolutionInput {
  solutionCode: string;
  language: string;
  tests: CodingTestCaseInput[];
}

/**
 * Lấy dữ liệu bài tập coding cho trình soạn thảo S23b.
 */
export async function getCodingExerciseData(courseId: string, lessonId: string) {
  const user = await verifyLecturerSession();

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, user.id)));

  if (!course) {
    throw new Error("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
  }

  const [lesson] = await db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId));

  if (!lesson) {
    throw new Error("Không tìm thấy bài học.");
  }

  // Tìm assessment dạng coding
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.courseId, courseId),
        eq(assessments.lessonId, lessonId),
        eq(assessments.type, "coding")
      )
    )
    .limit(1);

  let exerciseData: any = null;
  let testCasesList: CodingTestCaseInput[] = [];

  if (assessment) {
    const [ex] = await db
      .select()
      .from(codingExercises)
      .where(eq(codingExercises.assessmentId, assessment.id))
      .limit(1);

    if (ex) {
      const tests = await db
        .select()
        .from(codingTestCases)
        .where(eq(codingTestCases.exerciseId, ex.id))
        .orderBy(asc(codingTestCases.position));

      testCasesList = tests.map((t) => {
        let parsedExpected: any = t.expectedOutput;
        try {
          parsedExpected = JSON.parse(t.expectedOutput);
        } catch {
          // giữ nguyên nếu không parse được json
        }
        return {
          id: t.id,
          name: t.name,
          call: t.input || "",
          expected: parsedExpected,
          expectedText: t.expectedOutput,
          isSample: t.isSample,
          hidden: !t.isSample,
        };
      });

      let parsedInstructions: string[] = [];
      try {
        if (assessment.instructions) {
          parsedInstructions = JSON.parse(assessment.instructions);
        }
      } catch {
        parsedInstructions = assessment.instructions ? [assessment.instructions] : [];
      }

      let parsedHints: string[] = [];
      try {
        if (assessment.rubric) {
          parsedHints = JSON.parse(assessment.rubric);
        }
      } catch {
        parsedHints = assessment.rubric ? [assessment.rubric] : [];
      }

      exerciseData = {
        id: ex.id,
        assessmentId: assessment.id,
        title: assessment.title || lesson.title,
        durationMinutes: assessment.timeLimitMinutes || 15,
        language: ex.language || "javascript",
        starterCode: ex.starterCode || "",
        solutionCode: ex.solutionCode || "",
        solutionVerifiedAt: ex.solutionVerifiedAt,
        instructions: parsedInstructions.length > 0 ? parsedInstructions : ["Viết hàm hoàn thành yêu cầu."],
        hints: parsedHints,
        tests: testCasesList,
      };
    }
  }

  // Khởi tạo mẫu mặc định nếu chưa có bài tập
  if (!exerciseData) {
    const defaultStarter = `// Viết code của bạn ở đây\nfunction giaiThuat(input) {\n  return input;\n}\n`;
    const defaultSolution = `function giaiThuat(input) {\n  return input;\n}\n`;
    exerciseData = {
      title: lesson.title,
      durationMinutes: 15,
      language: "javascript",
      starterCode: defaultStarter,
      solutionCode: defaultSolution,
      solutionVerifiedAt: null,
      instructions: [
        "Khai báo hàm xử lý theo yêu cầu đề bài.",
        "Trả về kết quả tương ứng với các trường hợp đầu vào.",
      ],
      hints: ["Đọc kỹ kiểu dữ liệu đầu vào và giá trị trả về mong đợi."],
      tests: [
        {
          id: 1,
          name: "Kiểm tra cơ bản",
          call: 'giaiThuat("Codi")',
          expected: "Codi",
          expectedText: '"Codi"',
          isSample: true,
          hidden: false,
        },
      ],
    };
  }

  return {
    course,
    lesson,
    isLocked: course.status === "pending",
    exercise: exerciseData,
  };
}

/**
 * Chạy thử nghiệm lời giải mẫu với toàn bộ test case (kể cả test ẩn).
 */
export async function verifySolutionCode(
  courseId: string,
  lessonId: string,
  input: VerifySolutionInput
) {
  await verifyLecturerSession();

  const formattedTests = input.tests.map((t, idx) => {
    let expectedVal = t.expected;
    if (t.expectedText && t.expected === undefined) {
      try {
        expectedVal = JSON.parse(t.expectedText);
      } catch {
        expectedVal = t.expectedText;
      }
    }
    return {
      id: t.id || idx + 1,
      name: t.name,
      call: t.call,
      expected: expectedVal,
      hidden: t.hidden || !t.isSample,
    };
  });

  const runResult = await executeCode(input.solutionCode, formattedTests, {
    language: input.language,
    solution: input.solutionCode,
  });

  const outcomes = gradeCodeResults(formattedTests, runResult);
  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.pass).length;
  const ok = total > 0 && passed === total && runResult.phase === "done";

  return {
    ok,
    total,
    passed,
    phase: runResult.phase,
    error: runResult.error,
    logs: runResult.logs,
    outcomes,
  };
}

/**
 * Lưu bài tập coding vào cơ sở dữ liệu.
 * BẮT BUỘC: Lời giải mẫu phải chạy đạt 100% test case mới cho phép lưu.
 */
export async function saveCodingExercise(
  courseId: string,
  lessonId: string,
  input: SaveCodingExerciseInput
) {
  const { course } = await getEditableCourse(courseId);

  // 1. Validation trường cơ bản
  if (!input.title || !input.title.trim()) {
    throw new Error("Tên bài tập không được để trống.");
  }

  const validInstructions = (input.instructions || []).filter((s) => s && s.trim());
  if (validInstructions.length === 0) {
    throw new Error("Cần ít nhất một bước yêu cầu đề bài.");
  }

  if (!input.solutionCode || !input.solutionCode.trim()) {
    throw new Error("Lời giải mẫu không được để trống.");
  }

  if (!input.tests || input.tests.length === 0) {
    throw new Error("Cần ít nhất một test case để kiểm tra.");
  }

  for (let i = 0; i < input.tests.length; i++) {
    const t = input.tests[i];
    if (!t.name || !t.name.trim()) {
      throw new Error(`Test ${i + 1}: chưa có tên hiển thị.`);
    }
    if (!t.call || !t.call.trim()) {
      throw new Error(`Test ${i + 1}: chưa có biểu thức gọi hàm.`);
    }
  }

  // 2. Chạy kiểm tra lời giải mẫu (Bắt buộc phải pass mọi test - STATE-MACHINES §12 & S23b)
  const verification = await verifySolutionCode(courseId, lessonId, {
    solutionCode: input.solutionCode,
    language: input.language,
    tests: input.tests,
  });

  if (!verification.ok) {
    throw new Error(
      `Lời giải mẫu chưa vượt qua tất cả các test case (${verification.passed}/${verification.total} test đạt). Không thể lưu bài tập.`
    );
  }

  const verifiedAt = new Date();

  await db.transaction(async (tx) => {
    // 3. Tìm hoặc tạo assessment coding
    const [existingAssessment] = await tx
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.courseId, courseId),
          eq(assessments.lessonId, lessonId),
          eq(assessments.type, "coding")
        )
      )
      .limit(1);

    let assessmentId: number;
    const instructionsJson = JSON.stringify(validInstructions);
    const hintsJson = JSON.stringify((input.hints || []).filter((h) => h && h.trim()));

    if (existingAssessment) {
      assessmentId = existingAssessment.id;
      await tx
        .update(assessments)
        .set({
          title: input.title.trim(),
          instructions: instructionsJson,
          rubric: hintsJson,
          timeLimitMinutes: input.durationMinutes || 15,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessmentId));
    } else {
      const [newAssessment] = await tx
        .insert(assessments)
        .values({
          courseId,
          lessonId,
          type: "coding",
          title: input.title.trim(),
          instructions: instructionsJson,
          rubric: hintsJson,
          timeLimitMinutes: input.durationMinutes || 15,
          status: "published",
        })
        .returning({ id: assessments.id });
      assessmentId = newAssessment.id;
    }

    // 4. Tìm hoặc tạo coding_exercises
    const [existingEx] = await tx
      .select()
      .from(codingExercises)
      .where(eq(codingExercises.assessmentId, assessmentId))
      .limit(1);

    let exerciseId: number;

    if (existingEx) {
      exerciseId = existingEx.id;
      await tx
        .update(codingExercises)
        .set({
          language: input.language || "javascript",
          starterCode: input.starterCode || "",
          solutionCode: input.solutionCode || "",
          solutionVerifiedAt: verifiedAt,
          updatedAt: new Date(),
        })
        .where(eq(codingExercises.id, exerciseId));

      // Xoá test case cũ để cập nhật mới
      await tx
        .delete(codingTestCases)
        .where(eq(codingTestCases.exerciseId, exerciseId));
    } else {
      const [newEx] = await tx
        .insert(codingExercises)
        .values({
          assessmentId,
          language: input.language || "javascript",
          starterCode: input.starterCode || "",
          solutionCode: input.solutionCode || "",
          solutionVerifiedAt: verifiedAt,
        })
        .returning({ id: codingExercises.id });
      exerciseId = newEx.id;
    }

    // 5. Lưu danh sách test cases
    for (let pos = 0; pos < input.tests.length; pos++) {
      const t = input.tests[pos];
      let expText = t.expectedText;
      if (!expText) {
        expText = stableJSON(t.expected);
      }

      await tx.insert(codingTestCases).values({
        exerciseId,
        name: t.name.trim(),
        input: t.call.trim(),
        expectedOutput: expText,
        isSample: t.isSample !== undefined ? t.isSample : !t.hidden,
        position: pos,
      });
    }

    // 6. Đánh dấu bản đồ kiến thức là stale nếu khoá đã xuất bản bị sửa
    await markKnowledgeMapStaleIfPublished(course, tx);
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  return { success: true, verifiedAt };
}

/**
 * AI gợi ý test case biên dựa trên lời giải mẫu và đề bài.
 */
export async function generateAiCodingTestCases(
  courseId: string,
  lessonId: string,
  input: {
    solutionCode: string;
    instructions: string[];
    existingTests: CodingTestCaseInput[];
  }
) {
  await getEditableCourse(courseId);

  if (!input.solutionCode || !input.solutionCode.trim()) {
    throw new Error("Cần có lời giải mẫu để AI có thể chạy thử và sinh test case biên.");
  }

  // Phân tích tên hàm từ lời giải mẫu
  const funcMatch = /function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/.exec(input.solutionCode);
  const funcName = funcMatch ? funcMatch[1] : "solution";

  const candidateCalls = [
    `${funcName}([])`, // Mảng rỗng
    `${funcName}(0)`, // Giá trị 0
    `${funcName}("")`, // Chuỗi rỗng
    `${funcName}(-1)`, // Số âm
    `${funcName}([1, 2, 3])`, // Mảng số
    `${funcName}(null)`, // Giá trị null
  ];

  // Lọc bỏ những call đã có
  const existingCalls = new Set(input.existingTests.map((t) => t.call.replace(/\s+/g, "")));
  const uniqueCandidates = candidateCalls.filter(
    (c) => !existingCalls.has(c.replace(/\s+/g, ""))
  );

  const suggestedTests: CodingTestCaseInput[] = [];

  for (let i = 0; i < Math.min(uniqueCandidates.length, 3); i++) {
    const callExpr = uniqueCandidates[i];
    // Chạy thử với lời giải để lấy expected output
    const runRes = await executeCode(input.solutionCode, [{ id: i + 1, call: callExpr, expected: null }]);
    if (runRes.phase === "done" && runRes.results[0]?.ok) {
      const actualJson = runRes.results[0].actual || "null";
      suggestedTests.push({
        id: `ai-test-${Date.now()}-${i}`,
        name: `Trường hợp biên ${i + 1}: ${callExpr}`,
        call: callExpr,
        expected: JSON.parse(actualJson),
        expectedText: actualJson,
        isSample: false,
        hidden: true,
      });
    }
  }

  return {
    success: true,
    tests: suggestedTests,
  };
}
