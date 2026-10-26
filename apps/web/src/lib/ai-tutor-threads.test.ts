import { describe, expect, it } from "vitest";
import {
  assembleTutorThreads,
  firstNameOf,
  groupTutorThreads,
  tutorStarters,
  tutorThreadTitle,
  type TutorThreadSummary,
} from "./ai-tutor-contract";

const thread = (
  lessonId: string,
  lastAt: string,
  firstQuestion = `Câu hỏi ${lessonId}`,
): TutorThreadSummary => ({
  lessonId,
  lessonTitle: `Bài ${lessonId}`,
  firstQuestion,
  lastAt,
  messageCount: 2,
});

describe("tutor thread grouping (Asia/Bangkok calendar)", () => {
  // 2026-10-26 08:00 in Bangkok is 01:00 UTC on the same day.
  const now = new Date("2026-10-26T01:00:00.000Z");

  it("groups by Bangkok day: Hôm nay, Hôm qua, then the month", () => {
    const groups = groupTutorThreads(
      [
        thread("a", "2026-10-26T00:30:00.000Z"), // 07:30 Bangkok today
        thread("b", "2026-10-25T16:30:00.000Z"), // 23:30 Bangkok yesterday
        thread("c", "2026-10-25T16:00:00.000Z"), // 23:00 Bangkok yesterday
        thread("d", "2026-10-02T03:00:00.000Z"),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Hôm nay",
      "Hôm qua",
      "Tháng 10, 2026",
    ]);
    expect(groups[0]!.threads.map((t) => t.lessonId)).toEqual(["a"]);
    expect(groups[1]!.threads.map((t) => t.lessonId)).toEqual(["b", "c"]);
  });

  it("puts a UTC timestamp that is already the next Bangkok day into that day", () => {
    // 2026-10-25T18:00Z is 2026-10-26 01:00 in Bangkok: today, not yesterday.
    const groups = groupTutorThreads([thread("x", "2026-10-25T18:00:00.000Z")], now);
    expect(groups.map((g) => g.label)).toEqual(["Hôm nay"]);
  });

  it("files a thread under the Bangkok month, not the UTC month", () => {
    // 2026-09-30 20:00 UTC is 2026-10-01 03:00 in Bangkok.
    const groups = groupTutorThreads(
      [thread("n", "2026-09-30T20:00:00.000Z"), thread("o", "2026-09-01T05:00:00.000Z")],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Tháng 10, 2026", "Tháng 9, 2026"]);
    expect(groups.map((g) => g.threads.length)).toEqual([1, 1]);
  });
});

describe("tutor thread helpers", () => {
  it("titles a thread by its first question, collapsed and cut", () => {
    expect(tutorThreadTitle("  Vì sao\n  code   lỗi? ")).toBe("Vì sao code lỗi?");
    const long = "a".repeat(120);
    const title = tutorThreadTitle(long);
    expect(title.length).toBe(80);
    expect(title.endsWith("…")).toBe(true);
  });

  it("takes the given name from the last word of a Vietnamese name", () => {
    expect(firstNameOf("Nguyễn Minh Anh")).toBe("Anh");
    expect(firstNameOf("  Trần  ")).toBe("Trần");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it("offers code starters for code lessons and general starters otherwise", () => {
    expect(tutorStarters(true)).toContain("Vì sao code của mình chưa chạy đúng?");
    expect(tutorStarters(false)).toContain("Tóm tắt ý chính của bài");
    expect(tutorStarters(false)).toHaveLength(3);
  });

  it("assembles threads from aggregates, the first question and titles, newest first", () => {
    const threads = assembleTutorThreads(
      [
        { lessonId: "old", lastAt: new Date("2026-10-01T00:00:00.000Z"), messageCount: 2 },
        { lessonId: "new", lastAt: new Date("2026-10-20T00:00:00.000Z"), messageCount: 6 },
        { lessonId: "gone", lastAt: new Date("2026-10-22T00:00:00.000Z"), messageCount: 2 },
      ],
      [
        { lessonId: "old", body: "Câu cũ" },
        { lessonId: "new", body: "Câu mới" },
      ],
      [
        { id: "old", title: "Bài cũ" },
        { id: "new", title: "Bài mới" },
      ],
    );
    expect(threads.map((t) => t.lessonId)).toEqual(["new", "old"]);
    expect(threads[0]).toEqual({
      lessonId: "new",
      lessonTitle: "Bài mới",
      firstQuestion: "Câu mới",
      lastAt: "2026-10-20T00:00:00.000Z",
      messageCount: 6,
    });
  });
});
