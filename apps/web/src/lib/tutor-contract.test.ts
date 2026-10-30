import { describe, expect, it } from "vitest";
import {
  applyDiff,
  errorLine,
  generateHint,
  generateSocraticAnswer,
  targetLine,
  tutorCommand,
  undoDiff,
  type TutorContext,
} from "./tutor-contract";

describe("Tutor Contract & Domain Logic", () => {
  it("locates targetLine at first return statement", () => {
    const code = `function sum(a, b) {\n  const res = a + b;\n  return res;\n}`;
    const result = targetLine(code);
    expect(result.n).toBe(3);
    expect(result.text).toContain("return res;");
    expect(result.indent).toBe("  ");
  });

  it("locates errorLine by identifier mention", () => {
    const code = `function test() {\n  const x = y + 1;\n  return x;\n}`;
    const err = "ReferenceError: y is not defined";
    const res = errorLine(code, err);
    expect(res).not.toBeNull();
    expect(res?.n).toBe(2);
    expect(res?.name).toBe("y");
  });

  it("locates errorLine on timeout by finding first loop", () => {
    const code = `function loop() {\n  let i = 0;\n  while (true) {\n    i++;\n  }\n}`;
    const err = "Chạy quá thời gian quy định (timeout)";
    const res = errorLine(code, err);
    expect(res).not.toBeNull();
    expect(res?.n).toBe(3);
    expect(res?.loop).toBe(true);
  });

  it("generates Socratic answer without giving full solution", () => {
    const ctx: TutorContext = {
      isCodeLesson: true,
      lessonTitle: "Tính tổng mảng",
      code: "function sum(arr) {\n  return 0;\n}",
      testName: "Mảng [1, 2, 3]",
      expected: "6",
      actual: "0",
    };

    const res = generateSocraticAnswer(ctx, "Vì sao code mình sai?");
    expect(res.text).toContain("kết quả mong đợi là `6` nhưng code đang trả về `0`");
    expect(res.text).toContain("Mình không viết sẵn lời giải");
    expect(res.lines).toContain(2);
  });

  it("generates Hint ladder 1 -> 2 -> 3 with line refs and diff proposal", () => {
    const ctx: TutorContext = {
      isCodeLesson: true,
      code: "function add(a, b) {\n  return a - b;\n}",
      testName: "add(2, 3)",
    };

    const h1 = generateHint(ctx, 1);
    expect(h1.text).toContain("Gợi ý 1/3 · Hướng nghĩ");
    expect(h1.lines).toBeUndefined();
    expect(h1.diff).toBeUndefined();

    const h2 = generateHint(ctx, 2);
    expect(h2.text).toContain("Gợi ý 2/3 · Chỗ cần xem lại");
    expect(h2.lines).toEqual([2]);
    expect(h2.diff).toBeUndefined();

    const h3 = generateHint(ctx, 3);
    expect(h3.text).toContain("Gợi ý 3/3 · Khung cách làm");
    expect(h3.lines).toEqual([2]);
    expect(h3.diff).toBeDefined();
    expect(h3.diff?.at).toBe(2);
    expect(h3.diff?.add).toContain("console.log");
  });

  it("applies diff ≤ 3 lines and undoes accurately", () => {
    const code = "function test() {\n  return true;\n}";
    const diff = {
      at: 2,
      ctx: "  return true;",
      add: "  console.log('inspect');",
      state: null,
      original: null,
    };

    const { newCode, original } = applyDiff(code, diff);
    expect(original).toBe(code);
    expect(newCode.split("\n")).toHaveLength(4);
    expect(newCode).toContain("console.log('inspect');");

    const restored = undoDiff(original);
    expect(restored).toBe(code);
  });

  it("parses valid tutor commands and rejects invalid ones", () => {
    expect(() =>
      tutorCommand.parse({
        type: "ask",
        text: "Giải thích giúp mình",
      }),
    ).not.toThrow();

    expect(() =>
      tutorCommand.parse({
        type: "hint",
        level: 2,
      }),
    ).not.toThrow();

    expect(() =>
      tutorCommand.parse({
        type: "vote",
        messageId: "msg-1",
        vote: "down",
        reason: "Lộ lời giải",
      }),
    ).not.toThrow();

    expect(() =>
      tutorCommand.parse({
        type: "hint",
        level: 5, // exceeds 3
      }),
    ).toThrow();
  });
});
