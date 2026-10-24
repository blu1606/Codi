"use server";

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assessments,
  codingExercises,
  codingRunLeases,
  codingTestCases,
  codingTestResults,
} from "@codi-1/db";
import { runJavaScript, type RunPhase } from "@codi-1/coding-runner";
import { canonical, requireCodingTests } from "@/lib/coding-contract";
import { db } from "@/services";
import {
  getEditableCourse,
  getOwnedCourse,
  requireCourseLesson,
  markKnowledgeMapStaleIfPublished,
} from "../course-queries";

export interface CodingTestCaseInput {
  id?: string | number;
  name: string;
  call: string;
  expected?: unknown;
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
 * Chuẩn hoá giá trị kỳ vọng (expected output) sang chuẩn JSON canonical tương thích hoàn toàn với #128.
 * Giúp người dùng gõ chuỗi trần (ví dụ Codi) vẫn tự động được chuẩn hoá thành chuỗi JSON hợp lệ ("Codi").
 */
function normalizeExpectedValue(expectedText?: string, expected?: unknown): {
  parsed: unknown;
  canonicalJson: string;
} {
  let parsed: unknown = expected;

  if (expectedText !== undefined && expectedText.trim() !== "") {
    try {
      parsed = JSON.parse(expectedText.trim());
    } catch {
      // Giảng viên gõ chuỗi thuần không có ngoặc kép (e.g. Codi) -> chuẩn hoá thành string
      parsed = expectedText.trim();
    }
  }

  const canonicalJson = canonical(parsed);
  return { parsed, canonicalJson };
}

/**
 * Quản lý lease chạy code độc quyền theo user để chống spam và nghẽn tài nguyên sandbox worker.
 */
async function withRunLease<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const token = randomUUID();

  // Đăng ký lease
  const [lease] = await db
    .insert(codingRunLeases)
    .values({
      userId,
      token,
      runningUntil: sql`clock_timestamp() + interval '20 seconds'`,
      lastStartedAt: sql`clock_timestamp()`,
    })
    .onConflictDoUpdate({
      target: codingRunLeases.userId,
      set: {
        token,
        runningUntil: sql`clock_timestamp() + interval '20 seconds'`,
        lastStartedAt: sql`clock_timestamp()`,
      },
      setWhere: sql`${codingRunLeases.runningUntil} <= clock_timestamp() and ${codingRunLeases.lastStartedAt} <= clock_timestamp() - interval '2 seconds'`,
    })
    .returning();

  if (!lease) {
    const [existing] = await db
      .select()
      .from(codingRunLeases)
      .where(eq(codingRunLeases.userId, userId));

    if (existing && existing.runningUntil > new Date()) {
      throw new Error("Môi trường chấm đang bận xử lý lượt chạy trước. Vui lòng đợi trong giây lát.");
    }
    throw new Error("Bạn thao tác quá nhanh. Vui lòng chờ 2 giây rồi thử lại.");
  }

  try {
    return await action();
  } finally {
    await db
      .update(codingRunLeases)
      .set({ runningUntil: sql`clock_timestamp()` })
      .where(and(eq(codingRunLeases.userId, userId), eq(codingRunLeases.token, token)));
  }
}

/**
 * Lấy dữ liệu bài tập coding cho trình soạn thảo S23b.
 * Ràng buộc cả khoá học và bài học thuộc quyền sở hữu của giảng viên.
 */
export async function getCodingExerciseData(courseId: string, lessonId: string) {
  const { course } = await getOwnedCourse(courseId);
  const lesson = await requireCourseLesson(courseId, lessonId);

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

  let exerciseData = null;

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

      const testCasesList: CodingTestCaseInput[] = tests.map((t) => {
        let parsedExpected: unknown = t.expectedOutput;
        try {
          parsedExpected = JSON.parse(t.expectedOutput);
        } catch {
          parsedExpected = t.expectedOutput;
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

      // Hướng dẫn bài tập lưu dạng chuỗi xuống dòng (tương thích học viên lesson-coding.tsx)
      let parsedInstructions: string[] = [];
      if (assessment.instructions) {
        if (assessment.instructions.startsWith("[") && assessment.instructions.endsWith("]")) {
          try {
            parsedInstructions = JSON.parse(assessment.instructions);
          } catch {
            parsedInstructions = assessment.instructions.split("\n").filter(Boolean);
          }
        } else {
          parsedInstructions = assessment.instructions.split("\n").filter(Boolean);
        }
      }

      // Gợi ý lưu trong coding_exercises.hints
      let hintsList: string[] = [];
      if (ex.hints && Array.isArray(ex.hints) && ex.hints.length > 0) {
        hintsList = ex.hints;
      } else if (assessment.rubric) {
        try {
          hintsList = JSON.parse(assessment.rubric);
        } catch {
          hintsList = assessment.rubric ? [assessment.rubric] : [];
        }
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
        hints: hintsList,
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
          id: "draft-default",
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
 * Chạy kiểm chứng lời giải mẫu trong sandbox QuickJS WebAssembly an toàn (@codi-1/coding-runner).
 * Ngăn chặn truy cập process Node, chống vòng lặp vô hạn và cấm giả lập Python.
 */
export async function verifySolutionCode(
  courseId: string,
  lessonId: string,
  input: VerifySolutionInput
) {
  const { user } = await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);

  // 1. Kiểm tra ngôn ngữ: Cấm giả lập Python theo STATE-MACHINES §23.5
  if (!input.language || input.language.toLowerCase() !== "javascript") {
    throw new Error(
      `Ngôn ngữ ${input.language || "được chọn"} hiện chưa được hỗ trợ trong môi trường chạy sandbox. Vui lòng chọn JavaScript.`
    );
  }

  if (!input.solutionCode || !input.solutionCode.trim()) {
    throw new Error("Vui lòng cung cấp mã nguồn lời giải mẫu.");
  }

  if (!input.tests || input.tests.length === 0) {
    throw new Error("Cần ít nhất một test case để chạy kiểm chứng.");
  }

  // 2. Chuẩn hoá các test cases
  const preparedTests = input.tests.map((t, idx) => {
    const { parsed, canonicalJson } = normalizeExpectedValue(t.expectedText, t.expected);
    return {
      // Execution identity is independent of untrusted persistence/draft IDs.
      id: idx + 1,
      name: t.name || `Test #${idx + 1}`,
      call: t.call.trim(),
      input: t.call.trim(),
      expected: parsed,
      expectedText: canonicalJson,
      expectedOutput: canonicalJson,
      isSample: t.isSample !== undefined ? !!t.isSample : !t.hidden,
      hidden: t.hidden !== undefined ? !!t.hidden : !t.isSample,
    };
  });

  // Kiểm tra tính hợp lệ theo hợp đồng kiểm thử của #128
  requireCodingTests(preparedTests);

  // 3. Thực thi an toàn trong QuickJS Worker với cơ chế lease
  const runResult = await withRunLease(user.id, async () => {
    return await runJavaScript({
      code: input.solutionCode,
      tests: preparedTests.map((t) => ({
        id: t.id,
        input: t.input,
        isSample: t.isSample,
      })),
    });
  });

  // 4. Chấm điểm kết quả thực thi
  const outcomes = preparedTests.map((t) => {
    const o = runResult.outcomes.find((out) => out.id === t.id);
    const pass = o?.phase === "done" && o.actual === t.expectedText;
    return {
      id: t.id,
      name: t.name,
      call: t.call,
      pass,
      expected: t.expectedText,
      actual: o?.actual ?? null,
      error: o?.error ?? null,
      phase: o?.phase ?? runResult.phase,
      durationMs: o?.durationMs ?? 0,
      hidden: t.hidden,
    };
  });

  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.pass).length;
  const ok = total > 0 && passed === total && runResult.phase === "done";

  return {
    ok,
    total,
    passed,
    phase: runResult.phase,
    error: runResult.phase !== "done" ? runResult.phase : null,
    logs: runResult.logs.map((text) => ({ kind: "log", text })),
    outcomes,
  };
}

/**
 * Lưu bài tập coding vào cơ sở dữ liệu.
 * - Kiểm tra quyền sở hữu khoá và bài học.
 * - Lời giải mẫu phải chạy đạt 100% test case trong QuickJS sandbox.
 * - Cập nhật test cases tại chỗ (in-place) để bảo tồn lịch sử bài nộp của học viên trong coding_test_results.
 * - Chuẩn hoá dữ liệu đúng hợp đồng của #128.
 */
export async function saveCodingExercise(
  courseId: string,
  lessonId: string,
  input: SaveCodingExerciseInput
) {
  const { course } = await getEditableCourse(courseId);
  const lesson = await requireCourseLesson(courseId, lessonId);

  // 1. Validation cú pháp cơ bản
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

  if (!input.language || input.language.toLowerCase() !== "javascript") {
    throw new Error("Ngôn ngữ Python hiện chưa được hỗ trợ chạy trong sandbox. Vui lòng chọn JavaScript.");
  }

  // 2. Chuẩn hoá test cases và áp dụng hợp đồng kiểm thử của #128
  const seenIds = new Set<string>();
  const preparedTests = input.tests.map((t, idx) => {
    if (t.id !== undefined) {
      // Persistence accepts numeric strings, so aliases must not update the same row twice.
      const numericId = Number(t.id);
      const key = Number.isNaN(numericId) ? `draft:${t.id}` : `row:${numericId}`;
      if (seenIds.has(key)) throw new Error("ID test case không được trùng nhau.");
      seenIds.add(key);
    }
    if (!t.name || !t.name.trim()) {
      throw new Error(`Test ${idx + 1}: chưa có tên hiển thị.`);
    }
    if (!t.call || !t.call.trim()) {
      throw new Error(`Test ${idx + 1}: chưa có biểu thức gọi hàm.`);
    }
    const { canonicalJson } = normalizeExpectedValue(t.expectedText, t.expected);
    const isSample = t.isSample !== undefined ? !!t.isSample : !t.hidden;
    return {
      id: idx + 1,
      rawId: t.id,
      name: t.name.trim(),
      input: t.call.trim(),
      expectedOutput: canonicalJson,
      isSample,
      position: idx,
    };
  });

  // Kiểm tra tính hợp lệ bằng requireCodingTests từ @/lib/coding-contract
  requireCodingTests(preparedTests);

  // 3. Chạy kiểm chứng lời giải mẫu ở server (Không tin kết quả client)
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

  const testIds = await db.transaction(async (tx) => {
    // 4. Tìm hoặc tạo assessment coding
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
    // Instructions lưu dạng text xuống dòng theo đúng chuẩn hiển thị của lesson-coding.tsx
    const instructionsText = validInstructions.join("\n");
    const hintsList = (input.hints || []).filter((h): h is string => Boolean(h && h.trim()));

    if (existingAssessment) {
      assessmentId = existingAssessment.id;
      await tx
        .update(assessments)
        .set({
          title: input.title.trim(),
          instructions: instructionsText,
          rubric: null,
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
          instructions: instructionsText,
          rubric: null,
          timeLimitMinutes: input.durationMinutes || 15,
          status: course.status === "published" ? "published" : "draft",
        })
        .returning({ id: assessments.id });
      assessmentId = newAssessment.id;
    }

    // 5. Tìm hoặc tạo coding_exercises
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
          language: "javascript",
          starterCode: input.starterCode || "",
          solutionCode: input.solutionCode || "",
          hints: hintsList,
          solutionVerifiedAt: verifiedAt,
          updatedAt: new Date(),
        })
        .where(eq(codingExercises.id, exerciseId));
    } else {
      const [newEx] = await tx
        .insert(codingExercises)
        .values({
          assessmentId,
          language: "javascript",
          starterCode: input.starterCode || "",
          solutionCode: input.solutionCode || "",
          hints: hintsList,
          solutionVerifiedAt: verifiedAt,
        })
        .returning({ id: codingExercises.id });
      exerciseId = newEx.id;
    }

    // 6. Cập nhật test cases tại chỗ (Finding 2: Bảo tồn kết quả chấm coding_test_results của học viên)
    const existingDbTests = await tx
      .select()
      .from(codingTestCases)
      .where(eq(codingTestCases.exerciseId, exerciseId));

    const existingTestMap = new Map(existingDbTests.map((t) => [t.id, t]));
    const incomingNumericIds = new Set(
      preparedTests
        .map((t) => (typeof t.rawId === "number" ? t.rawId : Number(t.rawId)))
        .filter((n) => !isNaN(n) && existingTestMap.has(n))
    );

    // Kiểm tra các test case cũ bị xoá khỏi đề
    const removedTestIds = existingDbTests
      .filter((t) => !incomingNumericIds.has(t.id))
      .map((t) => t.id);

    if (removedTestIds.length > 0) {
      const [submissionUsage] = await tx
        .select({ count: count() })
        .from(codingTestResults)
        .where(inArray(codingTestResults.testCaseId, removedTestIds));

      if (Number(submissionUsage?.count || 0) > 0) {
        throw new Error(
          "Không thể xoá test case đã có học viên nộp bài và chấm điểm. Bạn có thể sửa nội dung thay vì xoá test case này."
        );
      }

      await tx.delete(codingTestCases).where(inArray(codingTestCases.id, removedTestIds));
    }

    // Cập nhật tại chỗ hoặc thêm mới
    const savedTestIds: number[] = [];
    for (const t of preparedTests) {
      const testId = typeof t.rawId === "number" ? t.rawId : Number(t.rawId);
      if (!isNaN(testId) && existingTestMap.has(testId)) {
        await tx
          .update(codingTestCases)
          .set({
            name: t.name,
            input: t.input,
            expectedOutput: t.expectedOutput,
            isSample: t.isSample,
            position: t.position,
          })
          .where(eq(codingTestCases.id, testId));
        savedTestIds.push(testId);
      } else {
        const [inserted] = await tx.insert(codingTestCases).values({
          exerciseId,
          name: t.name,
          input: t.input,
          expectedOutput: t.expectedOutput,
          isSample: t.isSample,
          position: t.position,
        }).returning({ id: codingTestCases.id });
        savedTestIds.push(inserted.id);
      }
    }

    // 7. Đánh dấu bản đồ kiến thức là stale nếu khoá học đã xuất bản
    await markKnowledgeMapStaleIfPublished(course, tx);
    return savedTestIds;
  });

  revalidatePath(`/dashboard/lecturer/courses/${courseId}`);
  // IDs follow submitted test order, not execution order (samples run first).
  return { success: true, verifiedAt, testIds };
}

/**
 * Thực thi xem trước code (Preview Mode) trong môi trường sandbox của học viên.
 * - Test mẫu: hiển thị chi tiết (lệnh gọi, kỳ vọng, thực tế).
 * - Test ẩn: chỉ trả về tổng số đạt/không đạt để giữ bí mật bài chấm như học viên thật.
 */
export async function runPreviewCode(
  courseId: string,
  lessonId: string,
  input: {
    code: string;
    mode: "run" | "submit";
  }
) {
  const { user } = await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);

  // Lấy test cases hiện có từ cơ sở dữ liệu
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

  if (!assessment) {
    throw new Error("Chưa có bài tập code nào được lưu cho bài học này.");
  }

  const [exercise] = await db
    .select()
    .from(codingExercises)
    .where(eq(codingExercises.assessmentId, assessment.id))
    .limit(1);

  if (!exercise) {
    throw new Error("Bài tập code chưa sẵn sàng.");
  }

  const dbTests = await db
    .select()
    .from(codingTestCases)
    .where(eq(codingTestCases.exerciseId, exercise.id))
    .orderBy(asc(codingTestCases.position));

  if (!dbTests.length) {
    throw new Error("Bài tập chưa có bộ kiểm thử nào.");
  }

  const testsToRun =
    input.mode === "run" ? dbTests.filter((t) => t.isSample) : dbTests;

  // Thực thi trong sandbox QuickJS
  const result = await withRunLease(user.id, async () => {
    return await runJavaScript({
      code: input.code,
      tests: testsToRun.map((t) => ({
        id: t.id,
        input: t.input,
        isSample: t.isSample,
      })),
    });
  });

  // Chấm điểm test cases
  const sampleOutcomes: Array<{
    id: number;
    name: string;
    call: string;
    pass: boolean;
    expected: string;
    actual: string | null;
    error: string | null;
  }> = [];

  let hiddenPassed = 0;
  let hiddenTotal = 0;

  for (const t of dbTests) {
    const o = result.outcomes.find((out) => out.id === t.id);
    let expectedCanonical: string;
    try {
      expectedCanonical = canonical(JSON.parse(t.expectedOutput));
    } catch {
      expectedCanonical = t.expectedOutput;
    }

    const isPassed = o?.phase === "done" && o.actual === expectedCanonical;

    if (t.isSample) {
      sampleOutcomes.push({
        id: t.id,
        name: t.name,
        call: t.input || "",
        pass: isPassed,
        expected: t.expectedOutput,
        actual: o?.actual ?? null,
        error: o?.error ?? null,
      });
    } else if (input.mode === "submit") {
      hiddenTotal++;
      if (isPassed) hiddenPassed++;
    }
  }

  const samplePassed = sampleOutcomes.filter((s) => s.pass).length;
  const sampleTotal = sampleOutcomes.length;
  const totalPassed = samplePassed + hiddenPassed;
  const totalTests = sampleTotal + hiddenTotal;

  return {
    mode: input.mode,
    phase: result.phase,
    sampleOutcomes,
    hiddenPassed,
    hiddenTotal,
    totalPassed,
    totalTests,
    allPass: totalPassed === totalTests && result.phase === "done",
    logs: result.logs,
  };
}

/**
 * Gợi ý các trường hợp test biên tự động dựa trên lời giải mẫu.
 * Thực thi an toàn trong QuickJS sandbox và xử lý chuỗi an toàn.
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
  const { user } = await getEditableCourse(courseId);
  await requireCourseLesson(courseId, lessonId);

  if (!input.solutionCode || !input.solutionCode.trim()) {
    throw new Error("Cần có lời giải mẫu để chạy thử và sinh test case biên.");
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

  const existingCalls = new Set(input.existingTests.map((t) => t.call.replace(/\s+/g, "")));
  const uniqueCandidates = candidateCalls.filter(
    (c) => !existingCalls.has(c.replace(/\s+/g, ""))
  );

  const suggestedTests: CodingTestCaseInput[] = [];

  const candidates = uniqueCandidates.slice(0, 3);
  if (candidates.length === 0) return { success: true, tests: suggestedTests };
  const runRes = await withRunLease(user.id, async () => {
    return await runJavaScript({
      code: input.solutionCode,
      tests: candidates.map((call, i) => ({ id: i + 1, input: call, isSample: false })),
    });
  });

  for (const [i, callExpr] of candidates.entries()) {
    const outcome = runRes.outcomes.find((out) => out.id === i + 1);
    if (outcome && outcome.phase === "done" && outcome.actual !== null) {
      let parsedVal: unknown;
      try {
        parsedVal = JSON.parse(outcome.actual);
      } catch {
        parsedVal = outcome.actual;
      }

      suggestedTests.push({
        id: `ai-test-${randomUUID()}`,
        name: `Trường hợp biên: ${callExpr}`,
        call: callExpr,
        expected: parsedVal,
        expectedText: outcome.actual,
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
