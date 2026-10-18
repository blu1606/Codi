import { describe, expect, it } from "vitest";

import {
  executeCode,
  explainError,
  gradeCodeResults,
  stableJSON,
} from "./code-runner";

describe("Shared Code Runner (#100 & #115)", () => {
  describe("stableJSON", () => {
    it("sắp xếp các khoá của object theo thứ tự bảng chữ cái để so sánh công bằng", () => {
      const obj1 = { z: 1, a: 2, m: { y: "test", x: 10 } };
      const obj2 = { a: 2, z: 1, m: { x: 10, y: "test" } };
      expect(stableJSON(obj1)).toBe(stableJSON(obj2));
      expect(stableJSON(obj1)).toBe('{"a":2,"m":{"x":10,"y":"test"},"z":1}');
    });

    it("xử lý đúng mảng, giá trị nguyên thuỷ, undefined và null", () => {
      expect(stableJSON([3, 2, 1])).toBe("[3,2,1]");
      expect(stableJSON(null)).toBe("null");
      expect(stableJSON(undefined)).toBe("undefined");
      expect(stableJSON("hello")).toBe('"hello"');
      expect(stableJSON(42)).toBe("42");
    });
  });

  describe("explainError", () => {
    it("dịch lỗi ReferenceError sang giải thích tiếng Việt dễ hiểu", () => {
      const err = "ReferenceError: tinhTong is not defined";
      const exp = explainError(err);
      expect(exp).toContain('Chưa có biến hoặc hàm "tinhTong"');
    });

    it("dịch lỗi TypeError khi gọi không phải hàm", () => {
      const err = "TypeError: foo is not a function";
      const exp = explainError(err);
      expect(exp).toContain('"foo" không phải là hàm');
    });

    it("dịch lỗi SyntaxError", () => {
      const err = "SyntaxError: Unexpected token '}'";
      const exp = explainError(err);
      expect(exp).toContain("Lỗi cú pháp");
    });
  });

  describe("executeCode & gradeCodeResults (JavaScript)", () => {
    it("chạy thành công hàm JavaScript và chấm đạt các test case", async () => {
      const code = `
        function tinhTong(a, b) {
          console.log("Đang tính tổng:", a, b);
          return a + b;
        }
      `;

      const tests = [
        { id: 1, name: "Tổng 2 số dương", call: "tinhTong(2, 3)", expected: 5 },
        { id: 2, name: "Tổng số âm và dương", call: "tinhTong(-1, 4)", expected: 3 },
        { id: 3, name: "Tổng với 0", call: "tinhTong(0, 0)", expected: 0, hidden: true },
      ];

      const runRes = await executeCode(code, tests, { language: "javascript" });

      expect(runRes.phase).toBe("done");
      expect(runRes.error).toBeNull();
      expect(runRes.logs.length).toBeGreaterThan(0);
      expect(runRes.logs[0].text).toContain("Đang tính tổng: 2 3");

      const outcomes = gradeCodeResults(tests, runRes);
      expect(outcomes.length).toBe(3);
      expect(outcomes.every((o) => o.pass)).toBe(true);
      expect(outcomes[2].hidden).toBe(true);
    });

    it("bắt đúng lỗi cú pháp khi code học viên/giảng viên bị sai", async () => {
      const code = "function tinhTong(a, b { return a + b; }"; // thiếu ngoặc tròn
      const tests = [{ id: 1, call: "tinhTong(1, 2)", expected: 3 }];

      const runRes = await executeCode(code, tests);

      expect(runRes.phase).toBe("syntax");
      expect(runRes.error).not.toBeNull();

      const outcomes = gradeCodeResults(tests, runRes);
      expect(outcomes[0].pass).toBe(false);
      expect(outcomes[0].error).toContain("SyntaxError");
    });

    it("đánh dấu test không đạt khi kết quả trả về sai giá trị mong đợi", async () => {
      const code = `
        function tinhTong(a, b) {
          return a - b; // tính sai
        }
      `;
      const tests = [{ id: 1, name: "Tổng 2 số", call: "tinhTong(5, 2)", expected: 7 }];

      const runRes = await executeCode(code, tests);
      expect(runRes.phase).toBe("done");

      const outcomes = gradeCodeResults(tests, runRes);
      expect(outcomes[0].pass).toBe(false);
      expect(outcomes[0].actual).toBe("3");
      expect(outcomes[0].expected).toBe("7");
    });
  });

  describe("executeCode (Python mô phỏng)", () => {
    it("đạt test khi mã Python khớp với lời giải mẫu", async () => {
      const solution = `def add(a, b):\n    return a + b\n`;
      const code = `def add(a, b):\n    return a + b # comment\n`;
      const tests = [{ id: 1, call: "add(2, 3)", expected: 5 }];

      const runRes = await executeCode(code, tests, {
        language: "python",
        solution,
      });

      expect(runRes.phase).toBe("done");
      const outcomes = gradeCodeResults(tests, runRes);
      expect(outcomes[0].pass).toBe(true);
    });
  });
});
