import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateText: vi.fn(), getModel: vi.fn(() => ({ modelId: "test-model" })) }));
vi.mock("@/lib/ai", () => ({ getLlmProvider: () => ({ getModel: mocks.getModel }) }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: (...args: unknown[]) => mocks.generateText(...args),
}));

import { generateAiGradingDraft } from "./ai-grading-draft";

describe("AI grading draft", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getModel.mockReturnValue({ modelId: "test-model" }); });

  it("sums rubric suggestions and keeps them as an unsaved draft", async () => {
    mocks.generateText.mockResolvedValue({ output: {
      scores: { correctness: 7.5, clarity: 1 }, feedback: "Em đã giải quyết đúng phần chính; hãy bổ sung kiểm tra đầu vào.",
    } });

    const result = await generateAiGradingDraft({
      instructions: "Viết hàm sắp xếp.", answerText: "function sort(values) { return values.slice().sort(); }", maxScore: 10,
      rubric: [
        { id: "correctness", name: "Đúng yêu cầu", points: 8 },
        { id: "clarity", name: "Rõ ràng", points: 2 },
      ],
    });

    expect(result).toEqual({ success: true, suggestedScore: 8.5, rubricScores: { correctness: 7.5, clarity: 1 },
      feedback: "Em đã giải quyết đúng phần chính; hãy bổ sung kiểm tra đầu vào." });
    expect(mocks.generateText).toHaveBeenCalledOnce();
    const call = mocks.generateText.mock.calls[0]![0] as { system: string; prompt: string; maxRetries: number; maxOutputTokens: number };
    expect(call.system).toContain("không đáng tin");
    expect(JSON.parse(call.prompt).answer).toBe("function sort(values) { return values.slice().sort(); }");
    expect(call).toMatchObject({ maxRetries: 0, maxOutputTokens: 1500 });
  });

  it("supports a single score when no rubric exists", async () => {
    mocks.generateText.mockResolvedValue({ output: { score: 7.5, feedback: "Bài làm đáp ứng phần lớn yêu cầu." } });
    await expect(generateAiGradingDraft({ instructions: null, answerText: "const answer = 42;", rubric: null, maxScore: 10 }))
      .resolves.toEqual({ success: true, suggestedScore: 7.5, feedback: "Bài làm đáp ứng phần lớn yêu cầu." });
  });

  it("rejects textless submissions and invalid score bands before calling the provider", async () => {
    await expect(generateAiGradingDraft({ instructions: null, answerText: " ", rubric: null, maxScore: 10 }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining("dạng văn bản") });
    await expect(generateAiGradingDraft({ instructions: null, answerText: "answer", rubric: null, maxScore: 0 }))
      .resolves.toMatchObject({ success: false });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects a rubric total that exceeds the assignment maximum", async () => {
    mocks.generateText.mockResolvedValue({ output: { scores: { a: 7, b: 5 }, feedback: "Cần sửa thêm." } });
    await expect(generateAiGradingDraft({ instructions: null, answerText: "answer", maxScore: 10,
      rubric: [{ id: "a", points: 10 }, { id: "b", points: 10 }] }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining("vượt quá") });
  });
});
