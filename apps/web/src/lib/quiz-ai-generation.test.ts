import { afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getLlmProvider: () => ({ getModel: () => ({ modelId: "test" }) }) }));
vi.mock("ai", () => ({
  generateText: m.generate,
  Output: { object: (value: unknown) => value },
  APICallError: { isInstance: () => false }, LoadAPIKeyError: { isInstance: () => false },
  LoadSettingError: { isInstance: () => false }, NoObjectGeneratedError: { isInstance: () => false },
  NoOutputGeneratedError: { isInstance: () => false }, TypeValidationError: { isInstance: () => false },
}));
import { generateQuizDraft } from "./quiz-ai-generation";
const input = { courseTitle: "Course", lessonTitle: "Lesson", count: 1, difficulty: "easy" as const, materialTitles: [], material: "text" };
afterEach(() => vi.restoreAllMocks());
describe("quiz AI timeout", () => {
  it.each([["foreground", 45_000], ["background", 180_000]] as const)("bounds %s generation to %i ms", async (mode, timeout) => {
    const signal = new AbortController().signal;
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    m.generate.mockResolvedValue({ output: { questions: [{ text: "Question", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "Reason" }] } });
    expect((await generateQuizDraft(input, mode)).success).toBe(true);
    expect(spy).toHaveBeenCalledWith(timeout);
    expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: signal, maxRetries: 0 }));
  });
  it("defaults existing callers to the foreground timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    m.generate.mockResolvedValue({ output: { questions: [{ text: "Question", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "Reason" }] } });
    await generateQuizDraft(input);
    expect(spy).toHaveBeenCalledWith(45_000);
  });
});
