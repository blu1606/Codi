import { beforeEach, describe, expect, it, vi } from "vitest";

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

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    transaction: (cb: any) => mockTransaction(cb),
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

import {
  generateAiCodingTestCases,
  getCodingExerciseData,
  saveCodingExercise,
  verifySolutionCode,
} from "./actions";

describe("Coding Exercise Builder Actions (#115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1" },
    });
    mockRequireRole.mockResolvedValue(undefined);
  });

  describe("getCodingExerciseData", () => {
    it("ném lỗi khi khoá học không thuộc quyền quản lý của giảng viên", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(getCodingExerciseData("c-999", "ls-1")).rejects.toThrow(
        "Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn."
      );
    });

    it("trả về cờ isLocked = true khi khoá học đang chờ duyệt", async () => {
      let callCount = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([
                { id: "c-1", instructorId: "lecturer-1", status: "pending", title: "Codi JS" },
              ]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ id: "ls-1", title: "Bài 1: Tổng 2 số" }]);
            }
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }),
        }),
      });

      const res = await getCodingExerciseData("c-1", "ls-1");
      expect(res.isLocked).toBe(true);
      expect(res.exercise).toBeDefined();
      expect(res.exercise.tests.length).toBeGreaterThan(0);
    });
  });

  describe("verifySolutionCode", () => {
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
      const solution = `function tinhTong(a, b) { return a * b; }`; // Viết sai thuật toán
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
  });

  describe("saveCodingExercise guard & execution", () => {
    it("chặn không cho lưu khi khoá học đang chờ duyệt", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "pending" },
          ]),
        }),
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

    it("BẮT BUỘC CHẶN LƯU khi lời giải mẫu chưa chạy đạt mọi test case", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

      await expect(
        saveCodingExercise("c-1", "ls-1", {
          title: "Bài tập cộng số",
          language: "javascript",
          instructions: ["Viết hàm tính tổng"],
          starterCode: "function sum() {}",
          solutionCode: "function sum(a, b) { return a - b; }", // Sai thuật toán
          tests: [{ name: "Test 1", call: "sum(1, 2)", expected: 3 }],
        })
      ).rejects.toThrow("Lời giải mẫu chưa vượt qua tất cả các test case");
    });

    it("cho phép lưu thành công khi lời giải mẫu đạt 100% test và đánh dấu stale nếu đã xuất bản", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "c-1",
              instructorId: "lecturer-1",
              status: "published",
              knowledgeMapStatus: "confirmed",
            },
          ]),
        }),
      });

      const mockTxUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const mockTxDeleteWhere = vi.fn().mockResolvedValue(undefined);
      const mockTxInsertValues = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 888 }]),
      }));

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 101 }]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
          delete: vi.fn().mockReturnValue({ where: mockTxDeleteWhere }),
          insert: vi.fn().mockReturnValue({ values: mockTxInsertValues }),
        });
      });

      const res = await saveCodingExercise("c-1", "ls-1", {
        title: "Tính giai thừa",
        language: "javascript",
        instructions: ["Viết hàm tính giai thừa của n"],
        starterCode: "function giaithua(n) {}",
        solutionCode: "function giaithua(n) { return n <= 1 ? 1 : n * giaithua(n - 1); }",
        tests: [
          { name: "n = 0", call: "giaithua(0)", expected: 1 },
          { name: "n = 4", call: "giaithua(4)", expected: 24 },
        ],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();
    });
  });

  describe("generateAiCodingTestCases", () => {
    it("sinh các trường hợp test biên chạy được với lời giải mẫu", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

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
