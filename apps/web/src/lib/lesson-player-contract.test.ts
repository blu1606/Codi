import { describe, expect, it } from "vitest";
import {
  lessonChecklist,
  lessonMaterialUrl,
  lessonPlayerCommand,
  recordPdfPage,
  requireLessonChecklist,
  videoPosition,
  videoStudied,
  type ChecklistAssessment,
  type ChecklistSubmission,
} from "./lesson-player-contract";

const assessment = (
  type: ChecklistAssessment["type"],
  id = 1,
): ChecklistAssessment => ({
  id,
  type,
  title: type,
  passingScore: 70,
  maxScore: 20,
});
const submission = (
  overrides: Partial<ChecklistSubmission> = {},
): ChecklistSubmission => ({
  assessmentId: 1,
  attempt: 1,
  mode: null,
  status: "graded",
  submittedAt: new Date(),
  score: 14,
  isPassed: true,
  ...overrides,
});

describe("lesson checklist and completion (D6/D7)", () => {
  it("requires study even without assessments", () => {
    expect(() =>
      requireLessonChecklist(lessonChecklist(false, [], [])),
    ).toThrow("Học nội dung");
    expect(() =>
      requireLessonChecklist(lessonChecklist(true, [], [])),
    ).not.toThrow();
  });
  it("cannot complete an empty checklist", () =>
    expect(() => requireLessonChecklist([])).toThrow());
  it("requires the latest quiz, even if an earlier attempt passed", () => {
    const result = lessonChecklist(
      true,
      [assessment("quiz")],
      [submission(), submission({ attempt: 2, score: 10, isPassed: false })],
    );
    expect(result[1]?.done).toBe(false);
    expect(() => requireLessonChecklist(result)).toThrow("Đạt quiz");
  });
  it("a draft retake invalidates the previous passing attempt", () =>
    expect(
      lessonChecklist(
        true,
        [assessment("quiz")],
        [
          submission(),
          submission({
            attempt: 2,
            status: "draft",
            submittedAt: null,
            score: null,
          }),
        ],
      )[1]?.done,
    ).toBe(false));
  it("computes percentage from maxScore and accepts the exact passing threshold", () => {
    expect(
      lessonChecklist(
        true,
        [assessment("quiz")],
        [submission({ isPassed: false })],
      )[1]?.done,
    ).toBe(true);
    expect(
      lessonChecklist(
        true,
        [assessment("quiz")],
        [submission({ score: 13.9 })],
      )[1]?.done,
    ).toBe(false);
  });
  it.each(["draft", "pending"] as const)(
    "an ungraded %s quiz does not pass",
    (status) =>
      expect(
        lessonChecklist(true, [assessment("quiz")], [submission({ status })])[1]
          ?.done,
      ).toBe(false),
  );
  it("code replaces the study item and accepts only a graded submit", () => {
    const result = lessonChecklist(
      false,
      [assessment("coding")],
      [submission({ mode: "submit" })],
    );
    expect(result.map((item) => item.key)).toEqual(["code"]);
    expect(() => requireLessonChecklist(result)).not.toThrow();
  });
  it("a run can never satisfy code completion or invalidate an actual passing submission", () => {
    expect(
      lessonChecklist(
        true,
        [assessment("coding")],
        [submission({ mode: "run" })],
      )[0]?.done,
    ).toBe(false);
    expect(
      lessonChecklist(
        false,
        [assessment("coding")],
        [
          submission({ mode: "submit" }),
          submission({ attempt: 2, mode: "run", isPassed: false }),
        ],
      )[0]?.done,
    ).toBe(true);
  });
  it("a newer failed code submission blocks a previous pass", () =>
    expect(
      lessonChecklist(
        true,
        [assessment("coding")],
        [
          submission({ mode: "submit" }),
          submission({ attempt: 2, mode: "submit", isPassed: false }),
        ],
      )[0]?.done,
    ).toBe(false));
  it.each(["pending", "graded"] as const)(
    "a %s assignment satisfies submission without requiring a passing grade",
    (status) => {
      expect(
        lessonChecklist(
          true,
          [assessment("assignment")],
          [submission({ status, isPassed: false, score: 0 })],
        )[1]?.done,
      ).toBe(true);
    },
  );
  it("an assignment draft never counts; later drafts do not erase a submission", () => {
    expect(
      lessonChecklist(
        true,
        [assessment("assignment")],
        [submission({ status: "draft", submittedAt: null })],
      )[1]?.done,
    ).toBe(false);
    expect(
      lessonChecklist(
        true,
        [assessment("assignment")],
        [
          submission({ status: "pending" }),
          submission({ attempt: 2, status: "draft", submittedAt: null }),
        ],
      )[1]?.done,
    ).toBe(true);
  });
  it("checks every published assessment and ignores foreign attempt identities", () => {
    const result = lessonChecklist(
      true,
      [
        assessment("quiz", 1),
        assessment("quiz", 2),
        assessment("assignment", 3),
      ],
      [submission(), submission({ assessmentId: 99 })],
    );
    expect(result.map((item) => item.key)).toEqual([
      "study",
      "quiz",
      "quiz",
      "assignment",
    ]);
    expect(result.filter((item) => !item.done)).toHaveLength(2);
  });
});

describe("material progress and input boundaries", () => {
  it("requires every PDF page, not simply visiting the last one", () => {
    const last = recordPdfPage(undefined, 3, 3);
    expect(last.studied).toBe(false);
    const first = recordPdfPage(last.progress, 1, 3);
    expect(first.studied).toBe(false);
    expect(recordPdfPage(first.progress, 2, 3).studied).toBe(true);
    expect(recordPdfPage(first.progress, 1, 3).progress.pages).toEqual([1, 3]);
  });
  it("resets stale page evidence when the PDF page count changes", () =>
    expect(recordPdfPage({ pageCount: 1, pages: [1] }, 2, 2).studied).toBe(
      false,
    ));
  it("rejects a nonexistent PDF page", () =>
    expect(() => recordPdfPage(undefined, 3, 2)).toThrow("không hợp lệ"));
  it.each([
    "javascript:alert(1)",
    "data:text/html,bad",
    "//evil.test/file",
    "/\\evil",
    "https://example.test/a\nb",
  ])("rejects executable/unsafe material URLs: %s", (value) =>
    expect(lessonMaterialUrl(value)).toBeNull(),
  );
  it.each(["https://example.test/lesson.pdf", "/dev/lesson-player/slides.pdf"])(
    "allows authored safe material URLs: %s",
    (value) => expect(lessonMaterialUrl(value)).toBe(value),
  );
  it.each([
    { type: "complete", studied: true },
    { type: "study", userId: "victim" },
    { type: "video", materialId: 1, seconds: -1, ended: true },
    { type: "pdf-page", materialId: 1, page: 0, pages: 3 },
    { type: "pdf-page", materialId: 1, page: 1, pages: 999999 },
  ])("rejects forged commands: %j", (input) =>
    expect(lessonPlayerCommand.safeParse(input).success).toBe(false),
  );
});

describe("video material duration", () => {
  it("clamps resume to material metadata", () =>
    expect(videoPosition(999, 5, false)).toBe(5));
  it("accepts native ended and resume without material metadata", () => {
    expect(videoPosition(5, null, true)).toBe(5);
    expect(videoPosition(42, null, false)).toBe(42);
  });
  it("guards against early ended when material duration is known", () =>
    expect(() => videoPosition(1, 5, true)).toThrow("chưa được xem đủ 90%"));
  it("counts a video as studied at exactly 90% of its duration", () => {
    expect(videoStudied(90, 100, false)).toBe(true);
    expect(videoStudied(89.9, 100, false)).toBe(false);
    expect(videoStudied(100, 100, false)).toBe(true);
  });
  it("accepts ended at or above 90% and rejects it below", () => {
    expect(videoPosition(90, 100, true)).toBe(90);
    expect(() => videoPosition(89, 100, true)).toThrow("90%");
  });
  it("uses the native ended event when duration metadata is missing", () => {
    expect(videoStudied(10, null, true)).toBe(true);
    expect(videoStudied(10, null, false)).toBe(false);
  });
});
