import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import type { assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { resultView } from "./learner-overview-contract";
import { frameGradingFeedback, learnerVisibleFeedback, splitGradingFeedback } from "./grading-feedback-frame";
import { parseFeedbackAndHistory, serializeFeedbackAndHistory } from "./grading-service";

const access = vi.hoisted(() => vi.fn());
vi.mock("./learning-path-service", () => ({ loadLearningLessonAccess: access }));
import { createAssessmentService, type FileStore } from "./assessment-service";

const visible = "Nhận xét: đúng hướng, sửa x --> y.";
const history = [{ oldScore: 4, newScore: 8, feedback: "PRIVATE_OLD_FEEDBACK", reason: "PRIVATE_REASON", at: "2026-10-24", gradedBy: "PRIVATE_LECTURER_ID" }];
// Wire fixtures follow the frozen grading writer a9e5a756; no model/provider/DB is involved.
const payload = { feedback: visible, history, rubricScores: { logic: 8 } };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
const cases: Array<[string, string | null, string | null]> = [
  ["plain unicode text", visible, visible],
  ["null", null, null],
  ["empty feedback with metadata", `\n\n<!--grading_record_v2:${b64({ ...payload, feedback: "" })}-->`, ""],
  ["plain whitespace", "  learner-facing text  ", "  learner-facing text  "],
  ["v2", `${visible}\n\n<!--grading_record_v2:${b64(payload)}-->`, visible],
  ["legacy Base64", `${visible}\n\n<!--grading_meta_b64:${b64({ history, rubricScores: { logic: 8 } })}-->`, visible],
  ["legacy JSON with terminator", `${visible}\n\n<!--grading_history:${JSON.stringify([{ ...history[0], reason: "PRIVATE_REASON x --> y" }])}-->`, visible],
  ["malformed v2", `${visible}\n\n<!--grading_record_v2:PRIVATE_CORRUPTED_PAYLOAD`, visible],
  ["malformed legacy JSON", `${visible}\n\n<!--grading_history:{PRIVATE_REASON`, visible],
  ["malformed legacy Base64", `${visible}\n\n<!--grading_meta_b64:PRIVATE_REASON-->`, visible],
  ["metadata only", "<!--grading_history:{PRIVATE_REASON", ""],
  ["literal marker before real suffix", `Explain <!--grading_history:example--> literally.\n\n<!--grading_record_v2:${b64({ ...payload, feedback: "Explain <!--grading_history:example--> literally." })}-->`, "Explain <!--grading_history:example--> literally."],
  ["mismatched encoded visible text", `${visible}\n\n<!--grading_record_v2:${b64({ ...payload, feedback: "PRIVATE_PAYLOAD_TEXT" })}-->`, visible],
];
const assessment = { id: 101, courseId: "course", lessonId: "lesson", type: "assignment" as const,
  title: "Assignment", instructions: "Solve", maxScore: 10, passingScore: 70,
  submissionFormat: "text", maxFileSizeMb: 5, rubric: null, dueDays: null };
const submission = (feedback: string | null) => ({ id: 1, assessmentId: 101, enrollmentId: 1, attempt: 1,
  status: "graded", score: 8, quizPercent: null, isPassed: true, submittedAt: new Date("2026-10-24"),
  gradedAt: new Date("2026-10-24"), feedback, answerText: "solution", fileName: null, fileUrl: null,
  linkUrl: null, assignmentDraft: null }) as typeof assessmentSubmissions.$inferSelect;

beforeEach(() => {
  access.mockResolvedValue({ enrollment: { id: 1 } });
});

it("shares the frozen writer's canonical framing without exposing payload through the learner adapter", () => {
  const text = "Literal <!--grading_meta_b64:example--> and x --> y\n\n<!--grading_record_v2:example-->";
  const encoded = b64({ feedback: text, history });
  const framed = frameGradingFeedback(text, encoded);
  expect(framed).toBe(`${text}\n\n<!--grading_record_v2:${encoded}-->`);
  expect(splitGradingFeedback(framed)).toEqual({ format: "record", canonical: true, closed: true, feedback: text, payload: encoded });
  expect(learnerVisibleFeedback(framed)).toBe(text);
  expect(learnerVisibleFeedback(undefined)).toBeNull();
});

async function assessmentDto(feedback: string | null) {
  const store = {
    select: () => {
      let rows: unknown[] = [];
      const query = {
        from(table: Parameters<typeof getTableName>[0]) {
          rows = getTableName(table) === "assessments" ? [assessment] : [submission(feedback)];
          return query;
        },
        where: () => query,
        orderBy: () => query,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  };
  const db = { ...store, transaction: (callback: (value: typeof store) => unknown) => callback(store) };
  const files: FileStore = { presign: vi.fn(), head: vi.fn(), copy: vi.fn(), delete: vi.fn(), get: vi.fn() };
  return createAssessmentService(db as unknown as Database, files).get({
    userId: "learner", courseId: "course", lessonId: "lesson", assessmentId: 101,
  });
}

describe.each(cases)("learner feedback: %s", (_name, raw, expected) => {
  it("redacts internals at the actual assessment service DTO, preserving legitimate score", async () => {
    const dto = await assessmentDto(raw);
    expect(dto.submission?.feedback).toBe(expected);
    expect(dto.submission?.rubricScores).toEqual(parseFeedbackAndHistory(raw).rubricScores);
    expect(dto.submission?.score).toBe(8);
    expect(dto.submission?.isPassed).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("PRIVATE_");
    expect(dto.submission).not.toHaveProperty("history");
  });
  it("redacts internals at the actual overview DTO, preserving score and percentage", () => {
    const dto = resultView(assessment, submission(raw));
    expect(dto.feedback).toBe(expected);
    expect(dto.score).toBe(8);
    expect(dto.percent).toBe(80);
    expect(JSON.stringify(dto)).not.toContain("PRIVATE_");
    expect(dto).not.toHaveProperty("rubricScores");
  });
});

it.each([visible, "", "Literal <!--grading_history:example--> and -->\n\n<!--grading_record_v2:example-->"])(
  "round trips actual writer records while both learner DTOs omit internal history: %s", async text => {
    const raw = serializeFeedbackAndHistory(text, history, { logic: 8 });
    expect(parseFeedbackAndHistory(raw, true)).toEqual({ feedback: text, history, rubricScores: { logic: 8 } });
    const dto = await assessmentDto(raw);
    const overview = resultView(assessment, submission(raw));
    expect(dto.submission?.feedback).toBe(text);
    expect(dto.submission?.rubricScores).toEqual({ logic: 8 });
    expect(overview.feedback).toBe(text);
    expect(dto.submission?.score).toBe(8);
    expect(overview.percent).toBe(80);
    expect(JSON.stringify([dto, overview])).not.toContain("PRIVATE_");
  },
);

it.each([
  `${visible}\n\n<!--grading_record_v2:PRIVATE_BROKEN`,
  `${visible}\n\n<!--grading_record_v2:${b64({ ...payload, feedback: "PRIVATE_MISMATCH" })}-->`,
  `${visible}\n\n<!--grading_meta_b64:${b64({ history })}!-->`,
  `${visible}\n\n<!--grading_history:{PRIVATE_BROKEN-->`,
])("refuses corrupt history for mutations while actual learner DTOs never leak it: %s", async raw => {
  expect(() => parseFeedbackAndHistory(raw, true)).toThrow();
  const dto = await assessmentDto(raw);
  const overview = resultView(assessment, submission(raw));
  expect(dto.submission?.feedback).toBe(visible);
  expect(overview.feedback).toBe(visible);
  expect(JSON.stringify([dto, overview])).not.toContain("PRIVATE_");
  expect(dto.submission?.score).toBe(8);
});
