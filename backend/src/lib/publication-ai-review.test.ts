import { describe, expect, it } from "vitest";
import { buildReviewLessons, toProposals } from "./publication-ai-review";
import { rulePrecheck, validateReviewTarget, type CourseDataForReview } from "./publication-service";

const course: CourseDataForReview = {
  id: "c1", title: "JS", description: "ngắn", chapters: [{
    id: "ch1", title: "Chương 1", lessons: [
      { id: "l1", title: "Biến", type: "reading", body: "let và const khai báo biến có phạm vi khối.",
        quiz: { questions: [
          { id: 11, text: "let có phạm vi gì?", options: ["khối", "hàm", "toàn cục", "không"], correctIndex: 0, explanation: "" },
          { id: 12, text: "const gán lại được không?", options: ["có", "không"], correctIndex: 0, explanation: "x" },
        ] } },
      { id: "l2", title: "Không chữ", type: "video", body: "", materials: [{ id: 1, type: "video", url: "u", title: "v" }],
        quiz: { questions: [{ id: 21, text: "?", options: ["a", "b", "c", "d"], correctIndex: 1 }] } },
    ],
  }],
  entryTest: { questions: [] },
};

describe("buildReviewLessons", () => {
  it("keeps lessons that have both a quiz and text, with aliases, and counts the rest as skipped", () => {
    const { lessons, skipped } = buildReviewLessons(course);
    expect(lessons.map((l) => l.key)).toEqual(["L1"]);
    expect(lessons[0]!.questions.map((q) => q.key)).toEqual(["L1Q1", "L1Q2"]);
    expect(skipped).toBe(1);
  });
  it("respects the text budget", () => {
    const long = { ...course, chapters: [{ ...course.chapters[0]!, lessons: [{ ...course.chapters[0]!.lessons[0]!, body: "a".repeat(5000) }] }] };
    expect(buildReviewLessons(long, 1000).lessons[0]!.text.length).toBeLessThanOrEqual(1000);
  });
});

describe("toProposals", () => {
  it("maps question and quiz aliases to flag targets the review accepts and drops unknown ones", () => {
    const { lessons } = buildReviewLessons(course);
    const proposals = toProposals(lessons, [
      { question: "L1Q2", severity: "must", comment: "Đáp án đúng phải là 'không' theo bài." },
      { question: "L1", severity: "should", comment: "Quiz chưa hỏi về const." },
      { question: "L9Q1", severity: "should", comment: "Không tồn tại trong khoá." },
      { question: "L1Q2", severity: "must", comment: "Đáp án đúng phải là 'không' theo bài." },
    ]);
    expect(proposals).toHaveLength(2);
    expect(proposals[0]!.target).toEqual({ type: "question", lessonId: "l1", itemId: "12", label: "Câu 2: const gán lại được không?" });
    expect(proposals[1]!.target).toMatchObject({ type: "quiz", lessonId: "l1" });
    for (const p of proposals) expect(validateReviewTarget(course, { type: p.target.type, lessonId: p.target.lessonId, itemId: p.target.itemId == null ? null : String(p.target.itemId) })).toBeNull();
  });

  it("keeps a proposal with a long comment (clipped) and an alias with spaces around it", () => {
    const { lessons } = buildReviewLessons(course);
    const long = "Đáp án đúng chưa khớp với bài. ".repeat(20);
    const proposals = toProposals(lessons, [
      { question: " l1q2 ", severity: "must", comment: long },
      { question: "L1Q2", severity: "should", comment: "   " },
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.target).toMatchObject({ type: "question", itemId: "12" });
    expect(proposals[0]!.comment.length).toBeLessThanOrEqual(400);
  });
});

describe("rulePrecheck", () => {
  it("proposes flags whose targets addReviewFlag accepts", () => {
    const flags = rulePrecheck(course);
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      expect(validateReviewTarget(course, { type: f.target.type, lessonId: f.target.lessonId ?? null, itemId: f.target.itemId == null ? null : String(f.target.itemId) }), f.target.label).toBeNull();
    }
    expect(flags.some((f) => f.target.type === "entry" && f.severity === "must")).toBe(true);
  });
});
