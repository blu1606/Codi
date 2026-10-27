import { describe, expect, it } from "vitest";
import {
  aiChatPatch,
  aiChatRequest,
  aiChatStarters,
  aiChatTitle,
  groupAiChats,
  isCitationHref,
  matchesAiChat,
  messageText,
  type AiChatSummary,
} from "./ai-chat-contract";

const id = "7b0c5b0e-3b8f-4c2e-9a35-2f6f3c1d2e4a";
const question = (text: string, extra: object = {}) => ({
  id: "q1",
  role: "user",
  parts: [{ type: "text", text }],
  ...extra,
});

describe("turn request", () => {
  it("accepts a general question and a lesson question", () => {
    expect(
      aiChatRequest.safeParse({
        id,
        context: { kind: "general", label: "Trang chủ", href: "/" },
        message: question("Nên học khoá nào?"),
      }).success,
    ).toBe(true);
    expect(
      aiChatRequest.safeParse({
        id,
        context: { kind: "lesson", courseId: "js-co-ban", lessonId: id },
        message: question("Cho mình gợi ý", { metadata: { hint: true } }),
        lesson: { mode: "step", context: { code: "let x = 1;" } },
      }).success,
    ).toBe(true);
  });
  it("only the learner's own text reaches the model: no assistant or tool parts from the client", () => {
    expect(
      aiChatRequest.safeParse({
        id,
        context: { kind: "general", label: "Trang chủ", href: "/" },
        message: { ...question("x"), role: "assistant" },
      }).success,
    ).toBe(false);
    expect(
      aiChatRequest.safeParse({
        id,
        context: { kind: "general", label: "Trang chủ", href: "/" },
        message: { id: "q1", role: "user", parts: [{ type: "tool-search_courses", input: {} }] },
      }).success,
    ).toBe(false);
  });
  it("rejects a chat id that is not a uuid, an odd message id and an off-site context link", () => {
    const base = { context: { kind: "general", label: "Trang chủ", href: "/" }, message: question("x") };
    expect(aiChatRequest.safeParse({ ...base, id: "../etc" }).success).toBe(false);
    expect(
      aiChatRequest.safeParse({ ...base, id, message: { ...question("x"), id: "a b" } }).success,
    ).toBe(false);
    expect(
      aiChatRequest.safeParse({
        ...base,
        id,
        context: { kind: "general", label: "x", href: "https://evil.example" },
      }).success,
    ).toBe(false);
  });
  it("a down-vote reason must be one of the listed reasons", () => {
    expect(
      aiChatPatch.safeParse({ type: "vote", messageId: "m1", vote: "down", reason: "Khác" }).success,
    ).toBe(false);
    expect(
      aiChatPatch.safeParse({ type: "vote", messageId: "m1", vote: "down", reason: "Lộ lời giải" })
        .success,
    ).toBe(true);
  });
});

describe("chat titles and text", () => {
  it("is the first question on one line, cut at 80 characters", () => {
    expect(aiChatTitle("  Vì sao\n  lỗi   này? ")).toBe("Vì sao lỗi này?");
    const long = aiChatTitle("a".repeat(120));
    expect(long).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
  });
  it("reads only the text parts of a message", () => {
    expect(
      messageText({
        parts: [
          { type: "reasoning", text: "nghĩ" },
          { type: "text", text: "Xin " },
          { type: "text", text: "chào" },
        ],
      } as never),
    ).toBe("Xin chào");
  });
});

const chat = (title: string, updatedAt: string, contextLabel = "Trang chủ"): AiChatSummary => ({
  id: title,
  kind: "general",
  title,
  contextLabel,
  contextHref: "/",
  courseId: null,
  lessonId: null,
  updatedAt,
});

describe("history", () => {
  const now = new Date("2026-10-27T10:00:00Z"); // 17:00 in Bangkok
  it("groups by Bangkok calendar day: today, yesterday, last 7 days, then month", () => {
    const groups = groupAiChats(
      [
        chat("a", "2026-10-26T18:00:00Z"), // 01:00 on the 27th in Bangkok → today
        chat("b", "2026-10-26T10:00:00Z"),
        chat("c", "2026-10-23T10:00:00Z"),
        chat("d", "2026-09-02T10:00:00Z"),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Hôm nay", "Hôm qua", "7 ngày qua", "Tháng 9, 2026"]);
    expect(groups[0]!.chats.map((c) => c.id)).toEqual(["a"]);
  });
  it("search ignores case and Vietnamese accents, and matches the context too", () => {
    const item = chat("Giải thích vòng lặp", now.toISOString(), "Bài: Đệ quy");
    expect(matchesAiChat(item, "vong lap")).toBe(true);
    expect(matchesAiChat(item, "DE QUY")).toBe(true);
    expect(matchesAiChat(item, "mảng")).toBe(false);
    expect(matchesAiChat(item, "  ")).toBe(true);
  });
});

describe("citations and starters", () => {
  it("only lesson and course links become citation chips", () => {
    expect(isCitationHref("/learn/js/7b0c")).toBe(true);
    expect(isCitationHref("/courses/js-co-ban")).toBe(true);
    expect(isCitationHref("https://example.com/learn/x")).toBe(false);
    expect(isCitationHref("/admin")).toBe(false);
    expect(isCitationHref(undefined)).toBe(false);
  });
  it("starters follow the screen: lesson (code or not), signed-in learner, guest", () => {
    expect(aiChatStarters({ kind: "lesson", isCode: true, signedIn: true })[0]).toMatch(/code/);
    expect(aiChatStarters({ kind: "general", signedIn: true })[0]).toMatch(/nên học gì/);
    expect(aiChatStarters({ kind: "general", signedIn: false })[0]).toMatch(/mới bắt đầu/);
  });
});
