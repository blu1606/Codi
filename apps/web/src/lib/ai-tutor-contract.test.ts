import { describe, expect, it } from "vitest";
import {
  applyDiff,
  escalationSummary,
  lineRefs,
  nextHintLevel,
  retryRows,
  sanitizeDiff,
  tutorCommand,
  tutorUserPrompt,
  TUTOR_CONTEXT_LIMITS,
} from "./ai-tutor-contract";
import { LearningPathError } from "./learning-path-contract";

const code = "function sum(a, b) {\n  const total = a - b;\n  return total;\n}";

describe("hint ladder (STATE-MACHINES §13)", () => {
  it("climbs 1 → 2 → 3 on code lessons", () => {
    expect(nextHintLevel(0, true)).toBe(1);
    expect(nextHintLevel(2, true)).toBe(3);
  });
  it("rejects a 4th hint and hints on non-code lessons", () => {
    expect(() => nextHintLevel(3, true)).toThrow(LearningPathError);
    expect(() => nextHintLevel(0, false)).toThrow(/chỉ có ở bài tập code/);
  });
});

describe("diff suggestion guard (G9: ≤ 3 lines, applied only on click)", () => {
  it("keeps a small insertion and records the line it goes before", () => {
    expect(
      sanitizeDiff({ at: 3, add: ["  console.log(total);"] }, code),
    ).toEqual({
      at: 3,
      add: ["  console.log(total);"],
      context: "  return total;",
      state: null,
    });
  });
  it("drops suggestions that are too long, empty or outside the code", () => {
    expect(sanitizeDiff({ at: 2, add: ["a", "b", "c", "d"] }, code)).toBeNull();
    expect(sanitizeDiff({ at: 2, add: ["   "] }, code)).toBeNull();
    expect(sanitizeDiff({ at: 9, add: ["x"] }, code)).toBeNull();
    expect(sanitizeDiff({ at: 1, add: ["x"] }, "")).toBeNull();
  });
  it("applies before the target line and the original is exactly restorable", () => {
    const applied = applyDiff(code, { at: 3, add: ["  console.log(total);"] });
    expect(applied.split("\n")[2]).toBe("  console.log(total);");
    expect(applied.split("\n")[3]).toBe("  return total;");
    expect(applied.replace("  console.log(total);\n", "")).toBe(code);
  });
});

describe("answer line references", () => {
  it("keeps distinct lines that exist in the learner's code, at most 5", () => {
    expect(
      lineRefs("Xem dòng 2, rồi dòng 2 và Dòng 3; dòng 40 không có", 4),
    ).toEqual([2, 3]);
    expect(
      lineRefs("dòng 1 dòng 2 dòng 3 dòng 4 dòng 5 dòng 6", 10),
    ).toHaveLength(5);
  });
});

describe("retry and escalation helpers", () => {
  const thread = [
    { id: 1, role: "user" as const, text: "Câu 1" },
    { id: 2, role: "ai" as const, text: "Trả lời" },
    { id: 3, role: "user" as const, text: "Câu 2" },
    { id: 4, role: "error" as const, text: "Câu 2" },
    { id: 5, role: "user" as const, text: "Câu 3" },
    { id: 6, role: "user" as const, text: "Câu 4" },
  ];
  it("'Thử lại' removes the error and the question it failed on", () => {
    expect(retryRows(thread, 4)).toEqual([3, 4]);
    expect(retryRows([{ id: 9, role: "error" }], 9)).toEqual([9]);
  });
  it("only an error row can be retried", () => {
    expect(() => retryRows(thread, 2)).toThrow(/thử lại/);
    expect(() => retryRows(thread, 99)).toThrow(LearningPathError);
  });
  it("the AI summary is the last 3 learner questions", () => {
    expect(escalationSummary(thread)).toBe("Câu 2 · Câu 3 · Câu 4");
  });
});

describe("commands", () => {
  it("escalation needs at least 10 characters", () => {
    const base = { type: "escalate", withSummary: true };
    expect(tutorCommand.safeParse({ ...base, text: "  ngắn  " }).success).toBe(
      false,
    );
    expect(
      tutorCommand.safeParse({ ...base, text: "Em chưa hiểu dòng 3" }).success,
    ).toBe(true);
  });
  it("rejects empty questions and unknown down-vote reasons", () => {
    expect(
      tutorCommand.safeParse({ type: "ask", question: "   " }).success,
    ).toBe(false);
    expect(
      tutorCommand.safeParse({
        type: "vote",
        messageId: 1,
        vote: "down",
        reason: "Khác",
      }).success,
    ).toBe(false);
  });
});

describe("prompt", () => {
  it("carries the screen's pre-context with numbered code, clipped to the shared limits", () => {
    const prompt = tutorUserPrompt({
      lesson: {
        title: "Hàm",
        chapterTitle: "Cơ bản",
        description: null,
        body: "Hàm nhận tham số.",
        materials: ["Video giới thiệu (video)"],
        isCode: true,
      },
      context: {
        task: "Bước 1/3: Gọi console.log",
        code: "console.lg('hi');",
        error: "Dòng 1: console.lg is not a function",
        selection: "x".repeat(TUTOR_CONTEXT_LIMITS.selection + 50),
      },
      history: [{ role: "user", text: "Lỗi gì vậy?" }],
      question: "Vì sao lỗi?",
    });
    expect(prompt).toContain(
      "Yêu cầu bài tập / bước hiện tại:\nBước 1/3: Gọi console.log",
    );
    expect(prompt).toContain("Tài liệu của bài: Video giới thiệu (video)");
    expect(prompt).toContain("1| console.lg('hi');");
    expect(prompt).toContain(
      "Lỗi khi chạy: Dòng 1: console.lg is not a function",
    );
    expect(prompt).toContain(`${"x".repeat(TUTOR_CONTEXT_LIMITS.selection)}…`);
    expect(prompt).not.toContain(
      "x".repeat(TUTOR_CONTEXT_LIMITS.selection + 1),
    );
    expect(prompt).toMatch(
      /Học viên: Lỗi gì vậy\?[\s\S]*Câu hỏi: Vì sao lỗi\?$/,
    );
  });
});
