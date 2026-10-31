import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { AiJob } from "@codi-1/db/ai-jobs";

const m = vi.hoisted(() => ({ requireRole: vi.fn(), generate: vi.fn(), select: vi.fn(), insert: vi.fn(), transaction: vi.fn(), lock: vi.fn(), finish: vi.fn(), execute: vi.fn() }));
vi.mock("@codi-1/auth", () => ({ ROLE: { LECTURER: "LECTURER" }, requireRole: m.requireRole }));
vi.mock("@codi-1/db/ai-jobs", () => ({ lockAiJob: m.lock, finishAiJob: m.finish }));
vi.mock("@/services", () => ({ db: { select: m.select, transaction: m.transaction } }));
vi.mock("@/lib/quiz-ai-generation", () => ({ AI_QUIZ_MAX_MATERIAL_CHARS: 12000, generateQuizDraft: m.generate }));
import { processQuizJob } from "./quiz-ai-worker";

const payload = { courseId: "course", lessonId: "entry", count: 2, difficulty: "medium", sourceText: "nội dung" };
const job: AiJob = { id: "job", type: "quiz_generation", userId: "owner", resourceId: "course/entry", payload, leaseToken: "lease" };
const course = { id: "course", title: "Course", instructorId: "owner", status: "draft", knowledgeMapContentGeneration: 4 };
const questions = [{ text: "Q", options: ["A", "B", "C", "D"], correctIndex: 0, aiGenerated: true, aiReviewed: false }];
const selectCourse = (row: typeof course | null) => ({ from: () => ({ where: () => ({ limit: async () => row ? [row] : [], for: async () => row ? [row] : [] }) }) });
beforeEach(() => {
  vi.resetAllMocks();
  m.requireRole.mockResolvedValue(undefined);
  m.execute.mockResolvedValue({ rows: [{ id: "owner" }] });
  m.generate.mockResolvedValue({ success: true, questions });
  m.select.mockReturnValue(selectCourse(course));
  m.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  m.transaction.mockImplementation((fn) => fn({ select: m.select, insert: m.insert, execute: m.execute }));
});
describe("background quiz worker", () => {
  it("publishes pending draft and completes under same fenced transaction", async () => {
    await processQuizJob(job);
    expect(m.generate).toHaveBeenCalledWith(expect.anything(), "background");
    expect(m.requireRole).toHaveBeenCalledTimes(1);
    expect(m.execute).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(m.execute.mock.calls[0]![0] as SQL).sql).toMatch(/"banned" is not true/i);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), "job", "lease");
    expect(m.insert).toHaveBeenCalledOnce();
    expect(m.finish).toHaveBeenCalledWith(expect.anything(), "job", "lease", "completed");
  });
  it("rejects non-owner course before any AI call", async () => {
    m.select.mockReturnValueOnce(selectCourse(null));
    await expect(processQuizJob(job)).rejects.toThrow("not_authorized");
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("rejects a revoked role before AI or after AI before publication", async () => {
    m.requireRole.mockRejectedValueOnce(new Error("forbidden"));
    await expect(processQuizJob(job)).rejects.toThrow("forbidden");
    expect(m.generate).not.toHaveBeenCalled();
    m.requireRole.mockResolvedValueOnce(undefined);
    m.execute.mockResolvedValueOnce({ rows: [] });
    await expect(processQuizJob(job)).rejects.toThrow("not_authorized");
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects content changed while generation runs", async () => {
    m.select.mockReturnValueOnce(selectCourse(course)).mockReturnValueOnce(selectCourse({ ...course, knowledgeMapContentGeneration: 5 }));
    await expect(processQuizJob(job)).rejects.toThrow("content_changed");
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("never publishes if lease fencing fails", async () => {
    m.lock.mockRejectedValue(new Error("lost_lease"));
    await expect(processQuizJob(job)).rejects.toThrow("lost_lease");
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("rejects invalid input before AI", async () => {
    await expect(processQuizJob({ ...job, payload: { ...payload, count: 11 } })).rejects.toThrow();
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("rejects missing text and does not call AI", async () => {
    await expect(processQuizJob({ ...job, payload: { ...payload, sourceText: "  " } })).rejects.toThrow("no_material");
    expect(m.generate).not.toHaveBeenCalled();
  });
});
