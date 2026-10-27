import { APICallError, LoadAPIKeyError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getLlmProvider: vi.fn(),
  getEditableCourse: vi.fn(),
  requireCourseLesson: vi.fn(),
  selectRows: vi.fn(),
  values: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@/lib/ai", () => ({ getLlmProvider: mocks.getLlmProvider }));
vi.mock("./course-queries", () => ({
  getEditableCourse: mocks.getEditableCourse,
  requireCourseLesson: mocks.requireCourseLesson,
  getCourseLesson: vi.fn(),
  getOwnedCourse: vi.fn(),
  requireCourseChapter: vi.fn(),
  withCourseContentWrite: vi.fn(),
  markKnowledgeMapStaleIfPublished: vi.fn(),
}));
vi.mock("@/services", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(mocks.selectRows()) }) }),
    insert: mocks.insert,
  },
}));
vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: vi.fn(),
  readLecturerIdentity: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { generateAiQuizQuestions } from "./actions";

const courseId = "course-own";
const lessonId = "22222222-2222-4222-8222-222222222202";

const validQuestion = {
  text: "Props là gì trong React?",
  options: ["Trạng thái nội bộ", "Dữ liệu truyền từ cha", "Hàm xử lý sự kiện", "Biến toàn cục"],
  correctIndex: 1,
  explanation: "Props được truyền từ component cha xuống con.",
};

const lessonRow = {
  id: lessonId,
  title: "Bài 2: Props và state",
  description: "Mô tả bài học",
  body: "Props là dữ liệu bất biến truyền từ cha xuống con.",
};

function outputWith(questions: unknown[]) {
  return { output: { questions } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getLlmProvider.mockReturnValue({ id: "gemini", getModel: () => "fake-model" });
  mocks.getEditableCourse.mockResolvedValue({ course: { id: courseId, title: "React dự án" }, user: { id: "lecturer" } });
  mocks.requireCourseLesson.mockResolvedValue(lessonRow);
  mocks.selectRows.mockReturnValue([{ title: "Slide Props" }]);
  mocks.values.mockResolvedValue([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.generateText.mockResolvedValue(outputWith([validQuestion]));
});

describe("generateAiQuizQuestions", () => {
  it("returns unsaved AI drafts and records them as pending drafts", async () => {
    const result = await generateAiQuizQuestions(courseId, lessonId, 3, "easy");

    expect(result).toEqual({
      success: true,
      questions: [{ ...validQuestion, aiGenerated: true, aiReviewed: false }],
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        lecturerId: "lecturer",
        courseId,
        lessonId,
        kind: "quiz_questions",
        status: "pending",
        payload: expect.objectContaining({ difficulty: "easy" }),
      }),
    );
  });

  it("sends the course, lesson text, material titles and difficulty as data in the prompt", async () => {
    await generateAiQuizQuestions(courseId, lessonId, 5, "hard", { focus: "vòng đời" });

    const call = mocks.generateText.mock.calls[0]![0];
    const prompt = JSON.parse(call.prompt);
    expect(prompt).toMatchObject({
      course: "React dự án",
      lesson: "Bài 2: Props và state",
      count: 5,
      difficulty: expect.stringContaining("Khó"),
      focus: "vòng đời",
      materialTitles: ["Slide Props"],
      material: "Mô tả bài học\n\nProps là dữ liệu bất biến truyền từ cha xuống con.",
    });
    expect(call.system).toContain("tiếng Việt");
    expect(call.output).toBeDefined();
  });

  it("uses pasted source text instead of the lesson text when provided", async () => {
    await generateAiQuizQuestions(courseId, lessonId, 3, "medium", { sourceText: "  Nội dung dán vào  " });

    const prompt = JSON.parse(mocks.generateText.mock.calls[0]![0].prompt);
    expect(prompt.material).toBe("Nội dung dán vào");
  });

  it("clamps the question count to the 1 to 10 range", async () => {
    await generateAiQuizQuestions(courseId, lessonId, 99);

    expect(JSON.parse(mocks.generateText.mock.calls[0]![0].prompt).count).toBe(10);
  });

  it("works for the entry test without loading a lesson", async () => {
    const result = await generateAiQuizQuestions(courseId, "entry", 3, "medium", { sourceText: "Nội dung chung" });

    expect(result.success).toBe(true);
    expect(mocks.requireCourseLesson).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ lessonId: null }));
  });

  it("rejects model output that does not match the schema and writes no draft", async () => {
    mocks.generateText.mockResolvedValue(
      outputWith([{ ...validQuestion, options: ["a", "b", "c"] }]),
    );

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "invalid_output", retryable: true });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects output whose options repeat", async () => {
    mocks.generateText.mockResolvedValue(
      outputWith([{ ...validQuestion, options: ["a", "a", "b", "c"] }]),
    );

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "invalid_output" });
  });

  it("maps a rate limit from the provider to a retryable error", async () => {
    mocks.generateText.mockRejectedValue(
      new APICallError({ message: "Too many requests", url: "https://ai.test", requestBodyValues: {}, statusCode: 429 }),
    );

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "rate_limited", retryable: true });
    expect(result).toHaveProperty("message", expect.stringContaining("quá tải"));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("maps other provider failures to a retryable unavailable error", async () => {
    mocks.generateText.mockRejectedValue(
      new APICallError({ message: "Bad gateway", url: "https://ai.test", requestBodyValues: {}, statusCode: 502 }),
    );

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "unavailable", retryable: true });
  });

  it("maps a missing API key to a non-retryable configuration error", async () => {
    mocks.generateText.mockRejectedValue(new LoadAPIKeyError({ message: "missing key" }));

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "not_configured", retryable: false });
    expect(result).toHaveProperty("message", expect.stringContaining("Chưa cấu hình AI"));
  });

  it("reports an unknown AI provider as a configuration error without calling the model", async () => {
    mocks.getLlmProvider.mockImplementation(() => {
      throw new Error('Unknown AI_PROVIDER "x".');
    });

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "not_configured", retryable: false });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("asks for pasted text when the lesson has no readable content", async () => {
    mocks.requireCourseLesson.mockResolvedValue({ ...lessonRow, description: null, body: "   " });

    const result = await generateAiQuizQuestions(courseId, lessonId);

    expect(result).toMatchObject({ success: false, code: "no_material", retryable: false });
    expect(result).toHaveProperty("message", expect.stringContaining("dán nội dung"));
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stops before calling the model when the course is not editable by this lecturer", async () => {
    mocks.getEditableCourse.mockRejectedValue(new Error("Khoá học đang chờ duyệt — nội dung chỉ đọc."));

    await expect(generateAiQuizQuestions(courseId, lessonId)).rejects.toThrow("chờ duyệt");
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stops before calling the model when the lesson is outside the course", async () => {
    mocks.requireCourseLesson.mockRejectedValue(new Error("Không tìm thấy bài học trong khoá học này."));

    await expect(generateAiQuizQuestions(courseId, lessonId)).rejects.toThrow("Không tìm thấy bài học");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
