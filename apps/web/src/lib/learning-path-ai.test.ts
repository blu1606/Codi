import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PathInput } from "./learning-path-contract";
import { generateLearningPath } from "./learning-path-ai";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./ai", () => ({
  getLlmProvider: () => ({
    getModel: () =>
      createGoogleGenerativeAI({
        apiKey: "unit-test-only",
        fetch: transport.fetch,
      })("gemini-2.5-flash"),
  }),
}));
const lessonId = "00000000-0000-4000-8000-000000000001";
const input: PathInput = {
  goal: "project",
  hours: 5,
  level: "new",
  concepts: [],
  edges: [],
  previous: [],
  lessons: [
    {
      id: lessonId,
      title: "Bài học",
      chapterId: "chapter",
      chapterTitle: "Chương",
      durationSeconds: 600,
      skillIds: [],
      progress: "not_started",
      studied: false,
    },
  ],
};
function respond(id = lessonId) {
  transport.fetch.mockResolvedValue(
    Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  rationale: "Phù hợp mục tiêu",
                  lessons: [
                    { lessonId: id, reason: "Cần học", isSkippable: false },
                  ],
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      },
    }),
  );
}
beforeEach(() => transport.fetch.mockReset());
describe("Gemini structured path output through the installed provider adapter", () => {
  it("sends supported array bounds without UUID format and validates the returned path", async () => {
    respond();
    const result = await generateLearningPath(
      input,
      new AbortController().signal,
    );
    expect(result.proposal.lessons[0]?.lessonId).toBe(lessonId);
    const request = JSON.parse(transport.fetch.mock.calls[0]![1].body);
    const schema = request.generationConfig.responseJsonSchema;
    expect(schema.properties.lessons).not.toHaveProperty("maxItems");
    expect(
      schema.properties.lessons.items.properties.lessonId,
    ).not.toHaveProperty("format");
    expect(schema.properties.rationale).not.toHaveProperty("maxLength");
    expect(
      schema.properties.lessons.items.properties.reason,
    ).not.toHaveProperty("minLength");
    expect(result).toMatchObject({
      model: "gemini-2.5-flash",
      promptTokens: 10,
      completionTokens: 20,
    });
  });
  it("sends short lesson aliases instead of UUIDs and maps them back", async () => {
    respond("L1");
    const result = await generateLearningPath(
      input,
      new AbortController().signal,
    );
    expect(result.proposal.lessons[0]?.lessonId).toBe(lessonId);
    const request = transport.fetch.mock.calls[0]![1].body as string;
    expect(request).not.toContain(lessonId);
  });
  it("still rejects non-UUID IDs after provider output validation", async () => {
    respond("not-a-uuid");
    await expect(
      generateLearningPath(input, new AbortController().signal),
    ).rejects.toThrow();
  });
});
