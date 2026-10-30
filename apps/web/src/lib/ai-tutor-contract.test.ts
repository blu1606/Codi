import { describe, expect, it } from "vitest";
import {
  applyDiff,
  clip,
  escalationSummary,
  lineRefs,
  nextHintLevel,
  sanitizeDiff,
  tutorEscalation,
  tutorSystemPrompt,
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

describe("escalation", () => {
  it("the AI summary is the learner's last 3 questions", () => {
    expect(escalationSummary(["Câu 1", "Câu 2", "Câu 3", "Câu 4"])).toBe(
      "Câu 2 · Câu 3 · Câu 4",
    );
    expect(escalationSummary([])).toBe("");
  });
  it("needs at least 10 characters", () => {
    expect(
      tutorEscalation.safeParse({ text: "  ngắn  ", withSummary: true }).success,
    ).toBe(false);
    expect(
      tutorEscalation.safeParse({ text: "Em chưa hiểu dòng 3", withSummary: true })
        .success,
    ).toBe(true);
  });
});

const lesson = {
  title: "Hàm",
  chapterTitle: "Cơ bản",
  description: null,
  body: "Hàm nhận tham số.",
  materials: ["Video giới thiệu (video)"],
  isCode: true,
};

describe("system prompt", () => {
  it("carries the screen's pre-context with numbered code, clipped to the shared limits", () => {
    const prompt = tutorSystemPrompt({
      turn: { type: "ask", mode: "simple" },
      lesson,
      context: {
        task: "Bước 1/3: Gọi console.log",
        code: "console.lg('hi');",
        error: "Dòng 1: console.lg is not a function",
        selection: "x".repeat(TUTOR_CONTEXT_LIMITS.selection + 50),
      },
    });
    expect(prompt).toContain(
      "Yêu cầu bài tập / bước hiện tại:\nBước 1/3: Gọi console.log",
    );
    expect(prompt).toContain("Tài liệu của bài: Video giới thiệu (video)");
    expect(prompt).toContain("1| console.lg('hi');");
    expect(prompt).toContain(
      "Lỗi khi chạy: Dòng 1: console.lg is not a function",
    );
    expect(prompt).toContain(
      `${"x".repeat(TUTOR_CONTEXT_LIMITS.selection - 1)}…`,
    );
    expect(prompt).not.toContain("x".repeat(TUTOR_CONTEXT_LIMITS.selection));
  });
  it("never asks for a full solution, and cites tool sources instead of guessing", () => {
    const prompt = tutorSystemPrompt({ turn: { type: "ask", mode: "step" }, lesson, context: {} });
    expect(prompt).toMatch(/Không bao giờ viết sẵn lời giải/);
    expect(prompt).toMatch(/trích nguồn bằng link Markdown/);
    expect(prompt).toMatch(/không bịa/);
  });
  it("a hint step names its rung and only step 3 may suggest a change", () => {
    const step1 = tutorSystemPrompt({ turn: { type: "hint", level: 1 }, lesson, context: {} });
    const step3 = tutorSystemPrompt({ turn: { type: "hint", level: 3 }, lesson, context: {} });
    expect(step1).toContain("**Gợi ý 1/3 · Hướng nghĩ**");
    expect(step1).not.toContain("suggest_code_change");
    expect(step3).toContain("suggest_code_change");
  });
});

describe("clip", () => {
  it("never exceeds the limit, ellipsis included, so clipped payloads pass the schema", () => {
    const code = "a".repeat(TUTOR_CONTEXT_LIMITS.code + 500);
    const clipped = clip(code, TUTOR_CONTEXT_LIMITS.code);
    expect(clipped.truncated).toBe(true);
    expect(clipped.text).toHaveLength(TUTOR_CONTEXT_LIMITS.code);
    expect(
      tutorEscalation.safeParse({
        text: "Em chưa hiểu vì sao test sai",
        code: clipped.text,
        withSummary: false,
      }).success,
    ).toBe(true);
    expect(clip("ngắn", 10)).toEqual({ text: "ngắn", truncated: false });
  });
});
