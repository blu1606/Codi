import { describe, expect, it } from "vitest";
import { explainError } from "./code-runner";

describe("Coding Error Explanations", () => {
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

    it("dịch lỗi TypeError khi truy cập thuộc tính của undefined", () => {
      const err = "TypeError: Cannot read properties of undefined (reading 'length')";
      const exp = explainError(err);
      expect(exp).toContain("Đang truy cập thuộc tính của giá trị undefined");
    });

    it("trả về chuỗi rỗng khi không có lỗi", () => {
      expect(explainError(null)).toBe("");
    });
  });
});
