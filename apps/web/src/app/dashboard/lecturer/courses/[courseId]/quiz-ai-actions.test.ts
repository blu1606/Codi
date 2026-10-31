import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { AiJobEnqueueError } from "@codi-1/db/ai-jobs";
const m = vi.hoisted(() => ({ editable: vi.fn(), lesson: vi.fn(), enqueue: vi.fn(), latest: vi.fn(), select: vi.fn() }));
vi.mock("./course-queries", () => ({ getEditableCourse: m.editable, requireCourseLesson: m.lesson }));
vi.mock("@codi-1/db/ai-jobs", async (importOriginal) => ({ ...await importOriginal<typeof import("@codi-1/db/ai-jobs")>(), enqueueAiJob: m.enqueue, readLatestAiJob: m.latest }));
vi.mock("@/services", () => ({ db: { select: m.select } }));
import { readQuizGeneration, startQuizGeneration } from "./quiz-ai-actions";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
  m.editable.mockResolvedValue({ user: { id: "owner" }, course: { id: "course" } });
  m.enqueue.mockResolvedValue("job-id");
});
describe("quiz background actions", () => {
  it("validates and queues an owned course job", async () => {
    expect(await startQuizGeneration("course", "entry", 2, "medium", { sourceText: "text" })).toEqual({ mode: "queued", id: "job-id" });
    expect(m.editable).toHaveBeenCalledWith("course");
    expect(m.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "quiz_generation", userId: "owner", resourceId: "course/entry" }));
  });
  it("rejects owner failure before enqueue", async () => {
    m.editable.mockRejectedValue(new Error("not_owner"));
    await expect(startQuizGeneration("course", "entry", 2, "medium", {})).rejects.toThrow("not_owner");
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("rejects invalid count and oversized input before enqueue", async () => {
    await expect(startQuizGeneration("course", "entry", 11, "medium", {})).rejects.toThrow();
    await expect(startQuizGeneration("course", "entry", 2, "medium", { sourceText: "x".repeat(6001) })).rejects.toThrow();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it.each([["daily_limit", "hết số lượt"], ["active_job", "đang chạy"]] as const)("maps %s safely", async (code, text) => {
    m.enqueue.mockRejectedValue(new AiJobEnqueueError(code));
    expect(await startQuizGeneration("course", "entry", 2, "medium", {})).toEqual({ mode: "error", message: expect.stringContaining(text) });
  });
  it("returns only the current owner's latest status", async () => {
    m.latest.mockResolvedValue({ id: "job-id", status: "running" });
    expect(await readQuizGeneration("course", "entry")).toEqual({ status: "running", jobId: "job-id" });
    expect(m.latest).toHaveBeenCalledWith(expect.anything(), { type: "quiz_generation", userId: "owner", resourceId: "course/entry" });
  });
  it("returns completed questions only from the owner's pending job draft", async () => {
    m.latest.mockResolvedValue({ id: "job-id", status: "completed" });
    let predicate: SQL | undefined;
    m.select.mockReturnValue({ from: () => ({ where: (where: SQL) => { predicate = where; return { orderBy: () => ({ limit: async () => [{ payload: { jobId: "job-id", questions: [{ text: "Q" }] } }] }) }; } }) });
    expect(await readQuizGeneration("course", "entry")).toEqual({ status: "completed", jobId: "job-id", questions: [{ text: "Q" }] });
    const query = new PgDialect().sqlToQuery(predicate!);
    expect(query.sql).toMatch(/"lecturer_id" =/);
    expect(query.sql).toMatch(/"course_id" =/);
    expect(query.sql).toMatch(/"status" =/);
    expect(query.params).toEqual(expect.arrayContaining(["owner", "course", "pending", "quiz_questions"]));
  });
  it("resumes a previous pending draft when the latest job failed", async () => {
    m.latest.mockResolvedValue({ id: "new-failed", status: "failed" });
    m.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ payload: { jobId: "old-pending", questions: [{ text: "Q" }] } }] }) }) }) });
    expect(await readQuizGeneration("course", "entry")).toEqual({ status: "completed", jobId: "old-pending", questions: [{ text: "Q" }] });
  });
  it("scopes explicit job lookup to owner, job type and course/lesson", async () => {
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let predicate: SQL | undefined;
    m.select.mockReturnValue({ from: () => ({ where: (where: SQL) => { predicate = where; return { limit: async () => [] }; } }) });
    expect(await readQuizGeneration("course", "entry", uuid)).toEqual({ status: "none" });
    const query = new PgDialect().sqlToQuery(predicate!);
    expect(query.params).toEqual(expect.arrayContaining([uuid, "owner", "quiz_generation", "course/entry"]));
    expect(m.latest).not.toHaveBeenCalled();
  });
  it("rejects invalid job IDs before querying the queue", async () => {
    expect(await readQuizGeneration("course", "entry", "bad-id")).toEqual({ status: "none" });
    expect(m.select).not.toHaveBeenCalled();
  });
  it("does not return a completed job whose pending draft is absent", async () => {
    m.latest.mockResolvedValue({ id: "job-id", status: "completed" });
    m.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) });
    expect(await readQuizGeneration("course", "entry")).toEqual({ status: "none" });
  });
  it("does not enqueue while background mode is disabled", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "false");
    expect(await startQuizGeneration("course", "entry", 2, "medium", {})).toEqual({ mode: "sync" });
    expect(m.enqueue).not.toHaveBeenCalled();
  });
});
