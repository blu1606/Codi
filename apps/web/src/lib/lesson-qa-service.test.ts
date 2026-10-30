import { describe, expect, it, vi } from "vitest";
import {
  escalateToLecturer,
  postLearnerConversationReply,
  postLessonQuestion,
  validateQuestionText,
} from "./lesson-qa-service";

describe("Lesson Q&A & Lecturer Conversations Service", () => {
  it("validates question text with minimum 10 characters", () => {
    expect(validateQuestionText("").valid).toBe(false);
    expect(validateQuestionText("ngắn").valid).toBe(false);
    expect(validateQuestionText("123456789").valid).toBe(false);
    expect(validateQuestionText("1234567890").valid).toBe(true);
    expect(
      validateQuestionText("Vì sao bài tập này lại sai test 2?").valid,
    ).toBe(true);
  });

  it("rejects questions longer than 5000 characters", () => {
    const long = "a".repeat(5001);
    const res = validateQuestionText(long);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("5000 ký tự");
  });

  it("throws error when posting question with less than 10 characters", async () => {
    const fakeStore = {} as any;
    await expect(
      postLessonQuestion(fakeStore, "user-1", "course-1", "lesson-1", "quá ngắn"),
    ).rejects.toThrow("Câu hỏi cần ít nhất 10 ký tự");
  });

  it("escalates to lecturer with ai_context and notifies lecturer", async () => {
    const convId = 101;
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              id: convId,
              courseId: "course-1",
              lessonId: "lesson-1",
              learnerId: "user-1",
              lecturerId: "lecturer-1",
              status: "open",
              fromAi: true,
              aiContext: { code: "console.log(1);" },
              createdAt: new Date(),
            },
          ]);
        }),
      }),
    });

    const mockSelect = vi.fn().mockImplementation((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "course-1",
              title: "Khóa học TypeScript",
              lecturerId: "lecturer-1",
            },
          ]),
        }),
      }),
    }));

    const fakeStore = {
      select: mockSelect,
      insert: mockInsert,
    } as any;

    const res = await escalateToLecturer(
      fakeStore,
      "user-1",
      "course-1",
      "lesson-1",
      {
        text: "Thầy ơi giải thích giúp em test 2 chưa đạt với ạ.",
        withCode: true,
        code: "console.log(1);",
        withAi: true,
        aiSummary: "Đã thử gợi ý 1 và 2",
      },
    );

    expect(res).toBeDefined();
    expect(res.id).toBe(convId);
    expect(res.status).toBe("open");
    expect(res.fromAi).toBe(true);
    expect(res.aiContext?.code).toBe("console.log(1);");
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0]?.text).toContain("Thầy ơi giải thích giúp em");
  });

  it("guards against posting replies when conversation is resolved (D9 guard)", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 99,
              learnerId: "user-1",
              lecturerId: "lecturer-1",
              status: "resolved", // Already resolved by lecturer!
              courseId: "course-1",
              lessonId: "lesson-1",
            },
          ]),
        }),
      }),
    });

    const fakeStore = { select: mockSelect } as any;

    await expect(
      postLearnerConversationReply(
        fakeStore,
        "user-1",
        99,
        "Em vẫn còn câu hỏi muốn hỏi thêm ạ.",
      ),
    ).rejects.toThrow("Cuộc trao đổi đã được giải quyết");
  });
});
