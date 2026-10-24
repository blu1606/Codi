import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessments,
  codingExercises,
  codingRunLeases,
  codingTestCases,
  codingTestResults,
  courseChapters,
  courseLessons,
  courses,
} from "@codi-1/db";

const mockGetSession = vi.fn();
const mockRequireRole = vi.fn();
const mockHeaders = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
    transaction: (cb: any) => mockTransaction(cb),
  },
}));

import {
  generateAiCodingTestCases,
  getCodingExerciseData,
  runPreviewCode,
  saveCodingExercise,
  verifySolutionCode,
} from "./actions";

interface SetupDbOptions {
  course?: any;
  lesson?: any;
  chapter?: any;
  assessment?: any;
  exercise?: any;
  testCases?: any[];
  submissionUsageCount?: number;
  enforceLease?: boolean;
}

let insertedRows: Array<{ table: any; values: any }>;
let updatedRows: Array<{ table: any; values: any }>;
let deletedRows: Array<{ table: any }>;

function setupDb({
  course = {
    id: "c-1",
    instructorId: "lecturer-1",
    status: "draft",
    title: "Codi JS",
    knowledgeMapStatus: "confirmed",
  },
  lesson = {
    id: "ls-1",
    chapterId: "ch-1",
    title: "Bài 1: Tổng 2 số",
  },
  chapter = {
    id: "ch-1",
    courseId: "c-1",
  },
  assessment = null,
  exercise = null,
  testCases = [],
  submissionUsageCount = 0,
  enforceLease = false,
}: SetupDbOptions = {}) {
  insertedRows = [];
  updatedRows = [];
  deletedRows = [];
  let lastStartedAt = 0;
  let running = false;
  let nextTestId = 1000;

  mockSelect.mockImplementation((selection?: any) => {
    const query: any = {
      from: vi.fn().mockImplementation((table: any) => {
        let rows: any[] = [];
        if (table === courses) {
          rows = course ? [course] : [];
        } else if (table === courseLessons) {
          rows = lesson ? (selection?.lesson ? [{ lesson }] : [lesson]) : [];
        } else if (table === courseChapters) {
          rows = chapter ? [chapter] : [];
        } else if (table === assessments) {
          rows = assessment ? [assessment] : [];
        } else if (table === codingExercises) {
          rows = exercise ? [exercise] : [];
        } else if (table === codingTestCases) {
          rows = [...testCases];
        } else if (table === codingTestResults) {
          rows = [{ count: submissionUsageCount }];
        } else if (table === codingRunLeases) {
          rows = enforceLease ? [{ runningUntil: new Date(running ? Date.now() + 20000 : 0) }] : [];
        }

        const chain: any = {};
        chain.innerJoin = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockImplementation(() => chain);
        chain.orderBy = vi.fn().mockImplementation(() => chain);
        chain.limit = vi.fn().mockImplementation(() => chain);
        chain.then = (resolve: any, reject?: any) => Promise.resolve(rows).then(resolve, reject);
        return chain;
      }),
    };
    return query;
  });

  const mockInsertChain = (table: any) => ({
    values: vi.fn().mockImplementation((val) => {
      insertedRows.push({ table, values: val });
      const record = { id: val.id ?? (table === codingTestCases ? nextTestId++ : 101), ...val };
      const chain: any = {};
      chain.onConflictDoUpdate = vi.fn().mockImplementation(() => chain);
      chain.returning = vi.fn().mockImplementation(async () => {
        if (table === codingRunLeases && enforceLease) {
          if (running || Date.now() - lastStartedAt < 2000) return [];
          lastStartedAt = Date.now();
          running = true;
        }
        return [record];
      });
      chain.then = (resolve: any, reject?: any) => Promise.resolve([record]).then(resolve, reject);
      return chain;
    }),
  });

  const mockUpdateChain = (table: any) => ({
    set: vi.fn().mockImplementation((val) => {
      updatedRows.push({ table, values: val });
      if (table === codingRunLeases && enforceLease) running = false;
      const chain: any = {};
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.then = (resolve: any, reject?: any) => Promise.resolve().then(resolve, reject);
      return chain;
    }),
  });

  const mockDeleteChain = (table: any) => ({
    where: vi.fn().mockImplementation(() => {
      deletedRows.push({ table });
      return {
        then: (resolve: any, reject?: any) => Promise.resolve().then(resolve, reject),
      };
    }),
  });

  mockInsert.mockImplementation(mockInsertChain);
  mockUpdate.mockImplementation(mockUpdateChain);
  mockDelete.mockImplementation(mockDeleteChain);

  mockTransaction.mockImplementation(async (cb: any) => {
    return cb({
      execute: vi.fn(),
      select: mockSelect,
      insert: mockInsertChain,
      update: mockUpdateChain,
      delete: mockDeleteChain,
    });
  });
}

describe("Coding Exercise Builder Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1" },
    });
    mockRequireRole.mockResolvedValue(undefined);
    setupDb();
  });

  describe("getCodingExerciseData", () => {
    it("ném lỗi khi khoá học không thuộc quyền quản lý của giảng viên", async () => {
      setupDb({ course: null });

      await expect(getCodingExerciseData("c-999", "ls-1")).rejects.toThrow(
        "Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn."
      );
    });

    it("ném lỗi khi bài học không thuộc về khoá học (cross-course scoping)", async () => {
      setupDb({ lesson: null });

      await expect(getCodingExerciseData("c-1", "ls-foreign")).rejects.toThrow(
        "Không tìm thấy bài học trong khoá học này."
      );
    });

    it("trả về cờ isLocked = true khi khoá học đang chờ duyệt", async () => {
      setupDb({
        course: {
          id: "c-1",
          instructorId: "lecturer-1",
          status: "pending",
          title: "Codi JS",
        },
      });

      const res = await getCodingExerciseData("c-1", "ls-1");
      expect(res.isLocked).toBe(true);
      expect(res.exercise).toBeDefined();
      expect(res.exercise.tests.length).toBeGreaterThan(0);
    });

    it("trả về dữ liệu bài tập và bộ test đã lưu", async () => {
      setupDb({
        assessment: { id: 10, title: "Tổng 2 số", instructions: "Viết hàm sum(a, b)" },
        exercise: {
          id: 20,
          assessmentId: 10,
          language: "javascript",
          starterCode: "function sum(a, b) {}",
          solutionCode: "function sum(a, b) { return a + b; }",
          hints: ["Dùng dấu +"],
        },
        testCases: [
          {
            id: 501,
            exerciseId: 20,
            name: "Test 1",
            input: "sum(1, 2)",
            expectedOutput: "3",
            isSample: true,
            position: 0,
          },
        ],
      });

      const res = await getCodingExerciseData("c-1", "ls-1");
      expect(res.isLocked).toBe(false);
      expect(res.exercise.tests).toHaveLength(1);
      expect(res.exercise.tests[0].name).toBe("Test 1");
      expect(res.exercise.tests[0].call).toBe("sum(1, 2)");
      expect(res.exercise.tests[0].isSample).toBe(true);
    });
  });

  describe("verifySolutionCode", () => {
    it.each([
      [777, 777],
      [2, "new-test"],
      [2, undefined],
      [2, "2"],
    ])("grades each expression independently for caller IDs %s and %s", async (first, second) => {
      const result = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: "function f(x) { return x; }",
        language: "javascript",
        tests: [
          { id: first, name: "A", call: "f(1)", expected: 1 },
          { id: second, name: "B", call: "f(2)", expected: 1 },
        ],
      });
      expect(result.ok).toBe(false);
      expect(result.passed).toBe(1);
      expect(result.outcomes.map((o) => o.actual)).toEqual(["1", "2"]);
    });
    it("ném lỗi khi khoá học không thuộc quyền quản lý của giảng viên", async () => {
      setupDb({ course: null });

      await expect(
        verifySolutionCode("c-999", "ls-1", {
          solutionCode: "function sum(a, b) { return a + b; }",
          language: "javascript",
          tests: [{ name: "T1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
    });

    it("chặn kiểm chứng khi khoá học đang chờ duyệt", async () => {
      setupDb({
        course: { id: "c-1", instructorId: "lecturer-1", status: "pending" },
      });

      await expect(
        verifySolutionCode("c-1", "ls-1", {
          solutionCode: "function sum(a, b) { return a + b; }",
          language: "javascript",
          tests: [{ name: "T1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Khoá học đang chờ duyệt — nội dung chỉ đọc.");
    });

    it("chặn kiểm chứng khi bài học thuộc khoá học khác", async () => {
      setupDb({ lesson: null });

      await expect(
        verifySolutionCode("c-1", "ls-foreign", {
          solutionCode: "function sum(a, b) { return a + b; }",
          language: "javascript",
          tests: [{ name: "T1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Không tìm thấy bài học trong khoá học này.");
    });

    it("từ chối ngôn ngữ không phải JavaScript (Python) với thông báo rõ ràng", async () => {
      await expect(
        verifySolutionCode("c-1", "ls-1", {
          solutionCode: "def sum(a, b):\n    return a + b",
          language: "python",
          tests: [{ name: "T1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow(/ngôn ngữ python hiện chưa được hỗ trợ/i);
    });

    it("từ chối khi không có test case công khai nào (hợp đồng requireCodingTests)", async () => {
      await expect(
        verifySolutionCode("c-1", "ls-1", {
          solutionCode: "function sum(a, b) { return a + b; }",
          language: "javascript",
          tests: [{ name: "T1", call: "sum(1, 2)", expected: 3, isSample: false, hidden: true }],
        })
      ).rejects.toThrow(/bộ kiểm thử/i);
    });

    it("trả về ok = true khi lời giải mẫu giải đúng tất cả test cases", async () => {
      const solution = `function tinhTong(a, b) { return a + b; }`;
      const tests = [
        { name: "Test 1", call: "tinhTong(1, 2)", expected: 3 },
        { name: "Test 2", call: "tinhTong(-5, 5)", expected: 0 },
      ];

      const res = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: solution,
        language: "javascript",
        tests,
      });

      expect(res.ok).toBe(true);
      expect(res.passed).toBe(2);
      expect(res.total).toBe(2);
      expect(res.phase).toBe("done");
    });

    it("trả về ok = false khi lời giải mẫu không đạt một test case", async () => {
      const solution = `function tinhTong(a, b) { return a * b; }`;
      const tests = [{ name: "Test 1", call: "tinhTong(1, 2)", expected: 3 }];

      const res = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: solution,
        language: "javascript",
        tests,
      });

      expect(res.ok).toBe(false);
      expect(res.passed).toBe(0);
      expect(res.total).toBe(1);
    });

    it("chuẩn hoá giá trị kỳ vọng là chuỗi trần không phải JSON (Finding 3)", async () => {
      const solution = `function chao(name) { return "Xin chào " + name; }`;
      const tests = [
        { name: "Test 1", call: 'chao("Codi")', expectedText: "Xin chào Codi" },
      ];

      const res = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: solution,
        language: "javascript",
        tests,
      });

      expect(res.ok).toBe(true);
      expect(res.passed).toBe(1);
    });

    it("xử lý an toàn vòng lặp vô hạn qua QuickJS sandbox timeout không làm treo server (Finding 1)", async () => {
      const solution = `function loop() { while(true) {} }`;
      const tests = [{ name: "Test loop", call: "loop()", expected: 1 }];

      const res = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: solution,
        language: "javascript",
        tests,
      });

      expect(res.ok).toBe(false);
      expect(res.phase === "timeout" || res.outcomes[0]?.phase === "timeout").toBe(true);
    });

    it("cách ly môi trường chạy và không làm lộ biến môi trường hay Node globals (Finding 1)", async () => {
      const solution = `function checkEnv() { return typeof process; }`;
      const tests = [{ name: "Test env", call: "checkEnv()", expectedText: '"undefined"' }];

      const res = await verifySolutionCode("c-1", "ls-1", {
        solutionCode: solution,
        language: "javascript",
        tests,
      });

      expect(res.ok).toBe(true);
      expect(res.outcomes[0]?.actual).toBe('"undefined"');
    });
  });

  describe("saveCodingExercise guard & execution", () => {
    it("returns canonical IDs for existing and newly inserted tests", async () => {
      setupDb({ assessment: { id: 10 }, exercise: { id: 20 }, testCases: [{ id: 501 }] });
      const result = await saveCodingExercise("c-1", "ls-1", {
        title: "Identity", language: "javascript", instructions: ["Return input"],
        starterCode: "", solutionCode: "function f(x) { return x; }",
        tests: [
          { id: "501", name: "Existing", call: "f(1)", expected: 1 },
          { id: "draft-new", name: "New", call: "f(2)", expected: 2 },
          { name: "No ID", call: "f(3)", expected: 3 },
        ],
      });
      expect(result).toMatchObject({ testIds: [501, 1000, 1001] });
    });

    it("preserves saved IDs on a title-only second save after student results exist", async () => {
      setupDb({ assessment: { id: 10 }, exercise: { id: 20 }, testCases: [{ id: 501 }] });
      const input = {
        title: "Identity", language: "javascript", instructions: ["Return input"],
        starterCode: "", solutionCode: "function f(x) { return x; }",
        tests: [
          { id: "501", name: "Existing", call: "f(1)", expected: 1 },
          { id: "draft-new", name: "New", call: "f(2)", expected: 2 },
        ],
      };
      const saved = await saveCodingExercise("c-1", "ls-1", input);
      setupDb({
        assessment: { id: 10 }, exercise: { id: 20 },
        testCases: saved.testIds.map((id: number) => ({ id })), submissionUsageCount: 2,
      });
      const second = await saveCodingExercise("c-1", "ls-1", {
        ...input, title: "Title only",
        tests: input.tests.map((test, index) => ({ ...test, id: saved.testIds[index] })),
      });
      expect(second.testIds).toEqual(saved.testIds);
      expect(deletedRows.filter((r) => r.table === codingTestCases)).toHaveLength(0);
      expect(insertedRows.filter((r) => r.table === codingTestCases)).toHaveLength(0);
      expect(updatedRows.filter((r) => r.table === codingTestCases)).toHaveLength(2);
    });

    it.each([[777, 777], [501, "501"], [501, "0501"], ["draft-new", "draft-new"]])(
      "rejects repeated persistence IDs %s and %s before writing",
      async (first, second) => {
        await expect(saveCodingExercise("c-1", "ls-1", {
          title: "Identity", language: "javascript", instructions: ["Return input"],
          starterCode: "", solutionCode: "function f(x) { return x; }",
          tests: [
            { id: first, name: "A", call: "f(1)", expected: 1 },
            { id: second, name: "B", call: "f(2)", expected: 2 },
          ],
        })).rejects.toThrow("ID test case không được trùng nhau");
        expect(mockTransaction).not.toHaveBeenCalled();
      },
    );

    it("cannot stamp verification or persist the duplicate-ID false-positive payload", async () => {
      await expect(saveCodingExercise("c-1", "ls-1", {
        title: "Identity", language: "javascript", instructions: ["Return input"],
        starterCode: "", solutionCode: "function f(x) { return x; }",
        tests: [
          { id: 777, name: "A", call: "f(1)", expected: 1 },
          { id: 777, name: "B", call: "f(2)", expected: 1 },
        ],
      })).rejects.toThrow("ID test case không được trùng nhau");
      expect(mockTransaction).not.toHaveBeenCalled();
    });
    it("chặn không cho lưu khi khoá học đang chờ duyệt", async () => {
      setupDb({
        course: { id: "c-1", instructorId: "lecturer-1", status: "pending" },
      });

      await expect(
        saveCodingExercise("c-1", "ls-1", {
          title: "Bài tập cộng số",
          language: "javascript",
          instructions: ["Viết hàm tính tổng"],
          starterCode: "function sum() {}",
          solutionCode: "function sum(a, b) { return a + b; }",
          tests: [{ name: "Test 1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Khoá học đang chờ duyệt — nội dung chỉ đọc.");
    });

    it("chặn không cho lưu khi bài học không thuộc khoá học", async () => {
      setupDb({ lesson: null });

      await expect(
        saveCodingExercise("c-1", "ls-foreign", {
          title: "Bài tập cộng số",
          language: "javascript",
          instructions: ["Viết hàm tính tổng"],
          starterCode: "function sum() {}",
          solutionCode: "function sum(a, b) { return a + b; }",
          tests: [{ name: "Test 1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Không tìm thấy bài học trong khoá học này.");
    });

    it("chặn không cho lưu ngôn ngữ Python", async () => {
      await expect(
        saveCodingExercise("c-1", "ls-1", {
          title: "Bài tập cộng số",
          language: "python",
          instructions: ["Viết hàm tính tổng"],
          starterCode: "def sum(): pass",
          solutionCode: "def sum(a, b): return a + b",
          tests: [{ name: "Test 1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Ngôn ngữ Python hiện chưa được hỗ trợ");
    });

    it("BẮT BUỘC CHẶN LƯU khi lời giải mẫu chưa chạy đạt mọi test case", async () => {
      await expect(
        saveCodingExercise("c-1", "ls-1", {
          title: "Bài tập cộng số",
          language: "javascript",
          instructions: ["Viết hàm tính tổng"],
          starterCode: "function sum() {}",
          solutionCode: "function sum(a, b) { return a - b; }",
          tests: [{ name: "Test 1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Lời giải mẫu chưa vượt qua tất cả các test case");
    });

    it("lưu thành công và đánh dấu stale nếu khoá học đã xuất bản (Finding 4)", async () => {
      setupDb({
        course: {
          id: "c-1",
          instructorId: "lecturer-1",
          status: "published",
          knowledgeMapStatus: "confirmed",
        },
      });

      const res = await saveCodingExercise("c-1", "ls-1", {
        title: "Tính giai thừa",
        language: "javascript",
        instructions: ["Viết hàm tính giai thừa của n"],
        starterCode: "function giaithua(n) {}",
        solutionCode: "function giaithua(n) { return n <= 1 ? 1 : n * giaithua(n - 1); }",
        hints: ["Dùng đệ quy"],
        tests: [
          { name: "n = 0", call: "giaithua(0)", expected: 1 },
          { name: "n = 4", call: "giaithua(4)", expected: 24 },
        ],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();

      // Đã đánh dấu stale
      const courseUpdate = updatedRows.find((r) => r.table === courses);
      expect(courseUpdate?.values.knowledgeMapStatus).toBe("stale");
    });

    it("lưu instructions dạng phân tách bởi dòng mới và hints trong codingExercises.hints (Finding 3)", async () => {
      await saveCodingExercise("c-1", "ls-1", {
        title: "Tính tổng 2 số",
        language: "javascript",
        instructions: ["Bước 1: Khai báo hàm", "Bước 2: Trả về a + b"],
        starterCode: "function sum(a, b) {}",
        solutionCode: "function sum(a, b) { return a + b; }",
        hints: ["Dùng toán tử +"],
        tests: [{ name: "1 + 2", call: "sum(1, 2)", expected: 3 }],
      });

      const assessmentInsert = insertedRows.find((r) => r.table === assessments);
      expect(assessmentInsert?.values.instructions).toBe("Bước 1: Khai báo hàm\nBước 2: Trả về a + b");

      const exerciseInsert = insertedRows.find((r) => r.table === codingExercises);
      expect(exerciseInsert?.values.hints).toEqual(["Dùng toán tử +"]);
    });

    it("cập nhật tại chỗ (in-place) các test case đã có thay vì xoá cascade (Finding 2)", async () => {
      setupDb({
        assessment: { id: 10 },
        exercise: { id: 20 },
        testCases: [
          {
            id: 501,
            exerciseId: 20,
            name: "Test cũ",
            call: "sum(1, 2)",
            expectedOutput: "3",
            position: 0,
          },
        ],
      });

      await saveCodingExercise("c-1", "ls-1", {
        title: "Tính tổng 2 số",
        language: "javascript",
        instructions: ["Tính tổng"],
        starterCode: "function sum(a, b) {}",
        solutionCode: "function sum(a, b) { return a + b; }",
        tests: [
          { id: 501, name: "Test 501 sửa tên", call: "sum(1, 2)", expected: 3 },
          { name: "Test mới hoàn toàn", call: "sum(10, 20)", expected: 30 },
        ],
      });

      // Kiểm tra test 501 được update
      const testCaseUpdate = updatedRows.find((r) => r.table === codingTestCases);
      expect(testCaseUpdate?.values.name).toBe("Test 501 sửa tên");

      // Kiểm tra test mới được insert
      const testCaseInsert = insertedRows.find((r) => r.table === codingTestCases);
      expect(testCaseInsert?.values.name).toBe("Test mới hoàn toàn");

      // Không có delete trên test 501
      expect(deletedRows.filter((d) => d.table === codingTestCases)).toHaveLength(0);
    });

    it("chặn xoá test case nếu học viên đã có kết quả làm bài trong codingTestResults (Finding 2)", async () => {
      setupDb({
        assessment: { id: 10 },
        exercise: { id: 20 },
        testCases: [
          {
            id: 501,
            exerciseId: 20,
            name: "Test cũ đã có học viên làm",
            call: "sum(1, 2)",
            expectedOutput: "3",
            position: 0,
          },
        ],
        submissionUsageCount: 2,
      });

      // Giảng viên cố tình xoá test 501 bằng cách không gửi nó lên
      await expect(
        saveCodingExercise("c-1", "ls-1", {
          title: "Tính tổng 2 số",
          language: "javascript",
          instructions: ["Tính tổng"],
          starterCode: "function sum(a, b) {}",
          solutionCode: "function sum(a, b) { return a + b; }",
          tests: [
            { name: "Chỉ gửi test mới", call: "sum(10, 20)", expected: 30 },
          ],
        })
      ).rejects.toThrow("Không thể xoá test case đã có học viên nộp bài và chấm điểm.");
    });
  });

  describe("runPreviewCode", () => {
    it("ném lỗi khi khoá học không thuộc quyền quản lý", async () => {
      setupDb({ course: null });

      await expect(
        runPreviewCode("c-foreign", "ls-1", {
          code: "function sum() {}",
          mode: "run",
        })
      ).rejects.toThrow("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
    });

    it("ném lỗi khi bài học không thuộc về khoá học", async () => {
      setupDb({ lesson: null });

      await expect(
        runPreviewCode("c-1", "ls-foreign", {
          code: "function sum() {}",
          mode: "run",
        })
      ).rejects.toThrow("Không tìm thấy bài học trong khoá học này.");
    });

    it("chế độ run chỉ chạy và hiển thị chi tiết các test mẫu (Finding 7)", async () => {
      setupDb({
        assessment: { id: 10 },
        exercise: { id: 20 },
        testCases: [
          {
            id: 1,
            exerciseId: 20,
            name: "Sample 1",
            input: "sum(1, 2)",
            expectedOutput: "3",
            isSample: true,
            position: 0,
          },
          {
            id: 2,
            exerciseId: 20,
            name: "Hidden 1",
            input: "sum(3, 4)",
            expectedOutput: "7",
            isSample: false,
            position: 1,
          },
        ],
      });

      const res = await runPreviewCode("c-1", "ls-1", {
        code: "function sum(a, b) { return a + b; }",
        mode: "run",
      });

      expect(res.mode).toBe("run");
      expect(res.sampleOutcomes).toHaveLength(1);
      expect(res.sampleOutcomes[0].name).toBe("Sample 1");
      expect(res.sampleOutcomes[0].pass).toBe(true);
      expect(res.hiddenTotal).toBe(0);
    });

    it("chế độ submit chạy tất cả nhưng ẩn biểu thức gọi và kỳ vọng của test ẩn (Finding 7)", async () => {
      setupDb({
        assessment: { id: 10 },
        exercise: { id: 20 },
        testCases: [
          {
            id: 1,
            exerciseId: 20,
            name: "Sample 1",
            input: "sum(1, 2)",
            expectedOutput: "3",
            isSample: true,
            position: 0,
          },
          {
            id: 2,
            exerciseId: 20,
            name: "Secret hidden test",
            input: "sum(100, 200)",
            expectedOutput: "300",
            isSample: false,
            position: 1,
          },
        ],
      });

      const res = await runPreviewCode("c-1", "ls-1", {
        code: "function sum(a, b) { return a + b; }",
        mode: "submit",
      });

      expect(res.mode).toBe("submit");
      expect(res.sampleOutcomes).toHaveLength(1);
      expect(res.sampleOutcomes[0].name).toBe("Sample 1");
      expect(res.hiddenPassed).toBe(1);
      expect(res.hiddenTotal).toBe(1);
      expect(res.allPass).toBe(true);

      // Đảm bảo không bị rò rỉ input hay expected của test ẩn trong response
      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain("Secret hidden test");
      expect(serialized).not.toContain("sum(100, 200)");
    });
  });

  describe("generateAiCodingTestCases", () => {
    it("releases the lease on infrastructure rejection without fabricating suggestions", async () => {
      setupDb({ enforceLease: true });
      await expect(generateAiCodingTestCases("c-1", "ls-1", {
        solutionCode: "x".repeat(65537), instructions: [], existingTests: [],
      })).rejects.toThrow("Invalid sandbox input");
      expect(updatedRows.filter((r) => r.table === codingRunLeases)).toHaveLength(1);
    });

    it("does not acquire a lease when all candidate calls already exist", async () => {
      const calls = ["solution([])", "solution(0)", 'solution("")', "solution(-1)", "solution([1, 2, 3])", "solution(null)"];
      const result = await generateAiCodingTestCases("c-1", "ls-1", {
        solutionCode: "function solution(x) { return x; }", instructions: [],
        existingTests: calls.map((call) => ({ name: call, call })),
      });
      expect(result.tests).toEqual([]);
      expect(insertedRows.filter((r) => r.table === codingRunLeases)).toHaveLength(0);
    });
    it("uses one lease for fast suggestions and retains the cross-request cooldown", async () => {
      setupDb({ enforceLease: true });
      const input = {
        solutionCode: "function solution(x) { return x; }",
        instructions: ["Return input"], existingTests: [],
      };
      const result = await generateAiCodingTestCases("c-1", "ls-1", input);
      expect(result.tests.map((t) => t.expected)).toEqual([[], 0, ""]);
      expect(insertedRows.filter((r) => r.table === codingRunLeases)).toHaveLength(1);
      expect(updatedRows.filter((r) => r.table === codingRunLeases)).toHaveLength(1);
      await expect(generateAiCodingTestCases("c-1", "ls-1", input)).rejects.toThrow("chờ 2 giây");
    });
    it("chặn khi khoá học không thuộc quyền quản lý", async () => {
      setupDb({ course: null });

      await expect(
        generateAiCodingTestCases("c-foreign", "ls-1", {
          solutionCode: "function sum(a, b) { return a + b; }",
          instructions: ["Tính tổng"],
          existingTests: [],
        })
      ).rejects.toThrow("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
    });

    it("chặn khi bài học không thuộc về khoá học", async () => {
      setupDb({ lesson: null });

      await expect(
        generateAiCodingTestCases("c-1", "ls-foreign", {
          solutionCode: "function sum(a, b) { return a + b; }",
          instructions: ["Tính tổng"],
          existingTests: [],
        })
      ).rejects.toThrow("Không tìm thấy bài học trong khoá học này.");
    });

    it("sinh các trường hợp test biên chạy được với lời giải mẫu và đánh dấu hidden = true", async () => {
      const res = await generateAiCodingTestCases("c-1", "ls-1", {
        solutionCode: "function demPhanTu(arr) { return arr ? arr.length : 0; }",
        instructions: ["Đếm số phần tử trong mảng"],
        existingTests: [],
      });

      expect(res.success).toBe(true);
      expect(res.tests.length).toBeGreaterThan(0);
      expect(res.tests[0].hidden).toBe(true);
    });
  });
});

// Session transport is a boundary here; transactional revalidation has its own tests.
vi.mock("@/lib/lecturer-auth", () => ({
  readLecturerIdentity: async () => {
    const identity = await mockGetSession();
    if (!identity?.user) throw new Error("Unauthorized");
    return identity;
  },
  verifyLecturerSession: async (_store: unknown, identity?: any) => {
    const authenticated = identity ?? await mockGetSession();
    if (!authenticated?.user) throw new Error("Unauthorized");
    await mockRequireRole();
    return authenticated.user;
  },
}));
