// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AITutorPanel } from "./ai-tutor-panel";
import { AskLecturerDialog } from "./ask-lecturer-dialog";
import { LessonQAPanel } from "./lesson-qa-panel";
import type { TutorThreadView } from "@/lib/tutor-contract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container.remove();
  vi.restoreAllMocks();
});

describe("AI Tutor Panel Component (S11a)", () => {
  it("renders empty state prompts and context chips when opened", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/tutor")) {
        return new Response(
          JSON.stringify({
            lessonId: "lesson-1",
            messages: [],
            hintLevel: 0,
            availablePrompts: [
              "Vì sao code của mình chưa chạy đúng?",
              "Giải thích lại yêu cầu của bài",
              "Lỗi hay gặp ở bài này là gì?",
            ],
          } satisfies TutorThreadView),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ conversation: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await act(async () => {
      root?.render(
        createElement(AITutorPanel, {
          open: true,
          onOpenChange: vi.fn(),
          courseId: "course-1",
          lessonId: "lesson-1",
          lessonTitle: "Biến và kiểu dữ liệu",
          isCodeLesson: true,
          docked: true,
        }),
      );
    });

    expect(container.textContent).toContain("AI trợ lý");
    expect(container.textContent).toContain("Bài: Biến và kiểu dữ liệu");
    expect(container.textContent).toContain("Code bạn đang viết");
    expect(container.textContent).toContain("Vì sao code của mình chưa chạy đúng?");
    expect(container.textContent).toContain("Gợi ý 1/3 · Hướng nghĩ");
  });

  it("renders messages with line reference buttons and diff proposal", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/tutor")) {
        return new Response(
          JSON.stringify({
            lessonId: "lesson-1",
            messages: [
              {
                id: "msg-1",
                role: "user",
                text: "Vì sao test 1 chưa đạt?",
                at: new Date().toISOString(),
              },
              {
                id: "msg-2",
                role: "ai",
                text: "Kiểm tra giá trị biến trước khi trả về.",
                lines: [3],
                diff: {
                  at: 3,
                  ctx: "return sum;",
                  add: "console.log('sum:', sum);",
                  state: null,
                  original: null,
                },
                at: new Date().toISOString(),
              },
            ],
            hintLevel: 1,
            availablePrompts: [],
          } satisfies TutorThreadView),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ conversation: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const onJumpToLine = vi.fn();
    const onApplyDiff = vi.fn();

    await act(async () => {
      root?.render(
        createElement(AITutorPanel, {
          open: true,
          onOpenChange: vi.fn(),
          courseId: "course-1",
          lessonId: "lesson-1",
          lessonTitle: "Tính tổng",
          isCodeLesson: true,
          docked: true,
          onJumpToLine,
          onApplyDiff,
        }),
      );
    });

    expect(container.textContent).toContain("Vì sao test 1 chưa đạt?");
    expect(container.textContent).toContain("Kiểm tra giá trị biến trước khi trả về.");
    expect(container.textContent).toContain("Xem dòng 3");
    expect(container.textContent).toContain("Đề xuất thêm 1 dòng · trước dòng 3");
    expect(container.textContent).toContain("Áp dụng");
    expect(container.textContent).toContain("Bỏ qua");

    // Click line reference button
    const lineBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Xem dòng 3"),
    );
    expect(lineBtn).toBeDefined();
    await act(async () => {
      lineBtn?.click();
    });
    expect(onJumpToLine).toHaveBeenCalledWith(3);

    // Click apply diff button
    const applyBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Áp dụng"),
    );
    expect(applyBtn).toBeDefined();
    await act(async () => {
      applyBtn?.click();
    });
    expect(onApplyDiff).toHaveBeenCalled();
  });
});

describe("Ask Lecturer Dialog Component (S11h)", () => {
  it("enforces validation on character length and pre-fills context", async () => {
    await act(async () => {
      root?.render(
        createElement(AskLecturerDialog, {
          open: true,
          onOpenChange: vi.fn(),
          courseId: "course-1",
          lessonId: "lesson-1",
          lecturerName: "Thầy Hưng",
          initialQuestion: "Ngắn",
          codeContext: "const a = 1;",
          failingTestContext: "test sum",
          aiSummaryContext: "AI gợi ý xem lại phép cộng",
        }),
      );
    });

    expect(document.body.textContent).toContain("Hỏi riêng giảng viên");
    expect(document.body.textContent).toContain("Chỉ bạn và Thầy Hưng xem được cuộc trao đổi này.");
    expect(document.body.textContent).toContain("Code hiện tại của bạn");
    expect(document.body.textContent).toContain("Test chưa đạt: test sum");
    expect(document.body.textContent).toContain("Tóm tắt trao đổi với AI trợ lý");

    // Submit button should be disabled for < 10 chars
    const submitBtn = Array.from(document.body.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Gửi cho giảng viên"),
    );
    expect(submitBtn?.hasAttribute("disabled")).toBe(true);
  });
});

describe("Lesson Q&A Panel Component (S11b)", () => {
  it("renders questions and replies with lecturer badge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          questions: [
            {
              id: 1,
              courseId: "course-1",
              lessonId: "lesson-1",
              userId: "u1",
              name: "Nguyễn Văn A",
              avatar: null,
              text: "Làm thế nào để xử lý số âm trong hàm này?",
              status: "answered",
              createdAt: new Date().toISOString(),
              replies: [
                {
                  id: 10,
                  userId: "lecturer-1",
                  name: "Thầy Hưng",
                  avatar: null,
                  isLecturer: true,
                  text: "Em có thể dùng Math.abs() hoặc điều kiện if (x < 0) nhé.",
                  at: new Date().toISOString(),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await act(async () => {
      root?.render(
        createElement(LessonQAPanel, {
          open: true,
          onOpenChange: vi.fn(),
          courseId: "course-1",
          lessonId: "lesson-1",
          lessonTitle: "Xử lý số học",
          docked: true,
        }),
      );
    });

    expect(container.textContent).toContain("Hỏi đáp");
    expect(container.textContent).toContain("Làm thế nào để xử lý số âm trong hàm này?");
    expect(container.textContent).toContain("Đã trả lời");
    expect(container.textContent).toContain("Thầy Hưng");
    expect(container.textContent).toContain("Giảng viên");
    expect(container.textContent).toContain("Em có thể dùng Math.abs()");
  });
});
