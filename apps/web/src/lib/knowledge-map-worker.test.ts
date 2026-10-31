import { beforeEach, describe, expect, it, vi } from "vitest";
import { courses, lessonSkills, skillPrerequisites, skills } from "@codi-1/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import type { AiJob } from "@codi-1/db/ai-jobs";

const { finish, lock, mapLock, activeRoles, enqueueLatest } = vi.hoisted(() => ({ finish: vi.fn(), lock: vi.fn(), mapLock: vi.fn(), activeRoles: vi.fn(), enqueueLatest: vi.fn() }));
vi.mock("@codi-1/auth", () => ({ ROLE: { LECTURER: "LECTURER" } }));
vi.mock("@codi-1/db/ai-jobs", () => ({
  AiJobLeaseError: class AiJobLeaseError extends Error {},
  lockAiJob: lock,
  finishAiJob: finish,
}));
vi.mock("./confirmed-knowledge-map", () => ({ lockKnowledgeMap: mapLock }));
vi.mock("./knowledge-map-jobs", () => ({ enqueueKnowledgeMapAnalysis: enqueueLatest }));
import { runKnowledgeMapJob } from "./knowledge-map-worker";
import type { ExtractedKnowledgeMap } from "./knowledge-map-extraction";

const job: AiJob = { id: "a", type: "knowledge_map", userId: "owner", resourceId: "course", payload: { generation: 2 }, leaseToken: "b" };
const output: ExtractedKnowledgeMap = { concepts: [{ name: "Existing", description: "ignored", lessons: ["L1"] }, { name: "New", description: "proposed", lessons: ["L1"] }], edges: [] };
function fixture() {
  const course = { instructorId: "owner", status: "published", knowledgeMapStatus: "analysing", knowledgeMapContentGeneration: 2 };
  const writes: { table: unknown; values: unknown }[] = [];
  const statements: SQL[] = [];
  const tx = {
    execute: async (statement: SQL) => { statements.push(statement); return { rows: await activeRoles() }; },
    select: () => ({ from: (table: unknown) => ({
      where: () => Promise.resolve(table === courses ? [course] : table === skills ? [{ id: 5, name: "Existing" }] : table === lessonSkills ? [{ skillId: 5, lessonId: "lesson" }] : []),
      innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([{ id: "lesson", title: "Title", body: null, description: null }]) }) }),
    }) }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      writes.push({ table, values });
      return { returning: () => Promise.resolve([{ id: 6 }]), onConflictDoNothing: () => Promise.resolve() };
    } }),
    update: (table: unknown) => ({ set: (values: unknown) => ({ where: () => { writes.push({ table, values }); return Promise.resolve(); } }) }),
  };
  const db = { transaction: (cb: (store: typeof tx) => Promise<unknown>) => cb(tx) } as unknown as Database;
  const generate = vi.fn(async () => ({ output, alias: new Map([["L1", "lesson"]]), model: "mock" }));
  return { db, course, writes, generate, statements };
}
beforeEach(() => {
  vi.clearAllMocks();
  activeRoles.mockResolvedValue(["LECTURER"]);
  enqueueLatest.mockResolvedValue({ queued: true, jobId: "next-job" });
  vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "true");
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
});
describe("knowledge map worker", () => {
  it("adds only suggestions, keeps existing reviews, and finishes under the lease", async () => {
    const f = fixture();
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.writes.filter((write) => write.table === skills)).toEqual([{ table: skills, values: expect.objectContaining({ name: "New", review: "suggested" }) }]);
    expect(f.writes.filter((write) => write.table === lessonSkills)).toEqual([
      { table: lessonSkills, values: [{ lessonId: "lesson", skillId: 6 }] },
    ]);
    expect(f.writes.some((write) => write.table === skillPrerequisites)).toBe(false);
    expect(f.writes.find((write) => write.table === courses)?.values).toEqual(expect.objectContaining({ knowledgeMapStatus: "ready", knowledgeMapAnalysisGeneration: 2 }));
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "completed");
    expect(lock).toHaveBeenCalledTimes(2);
    expect(new PgDialect().sqlToQuery(f.statements[0]!).sql).toMatch(/"banned" is not true/i);
  });
  it("proposes a new edge involving an existing concept without changing its review", async () => {
    const f = fixture();
    f.generate.mockResolvedValue({ output: { ...output, edges: [{ from: "Existing", to: "New" }] }, alias: new Map([["L1", "lesson"]]), model: "mock" });
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.writes.filter((write) => write.table === skillPrerequisites)).toEqual([
      { table: skillPrerequisites, values: { prerequisiteSkillId: 5, skillId: 6, source: "ai", review: "suggested" } },
    ]);
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "completed");
  });
  it("fails rather than change lesson links on an existing concept", async () => {
    const f = fixture();
    f.generate.mockResolvedValue({ output: { ...output, concepts: [{ ...output.concepts[0], lessons: ["L2"] }] }, alias: new Map([["L2", "other-lesson"]]), model: "mock" });
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "analysis_failed");
  });
  it("does not publish results after course content changed during generation", async () => {
    const f = fixture();
    f.generate.mockImplementation(async () => { f.course.knowledgeMapContentGeneration = 3; return { output, alias: new Map([["L1", "lesson"]]), model: "mock" }; });
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.writes.some((write) => [skills, lessonSkills, skillPrerequisites].includes(write.table as typeof skills))).toBe(false);
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "content_changed");
    expect(enqueueLatest).toHaveBeenCalledWith(expect.anything(), { courseId: "course", userId: "owner" });
  });
  it("queues the newest generation if an obsolete analysis fails", async () => {
    const f = fixture();
    f.generate.mockImplementation(async () => {
      f.course.knowledgeMapContentGeneration = 3;
      throw new Error("provider failed");
    });
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "analysis_failed");
    expect(enqueueLatest).toHaveBeenCalledWith(expect.anything(), { courseId: "course", userId: "owner" });
  });
  it("does not call AI after lecturer role is revoked", async () => {
    activeRoles.mockResolvedValue([]);
    const f = fixture();
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.generate).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "analysis_failed");
  });
  it("does not publish if lecturer role is revoked during generation", async () => {
    const f = fixture();
    activeRoles.mockResolvedValueOnce(["LECTURER"]).mockResolvedValueOnce([]);
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.generate).toHaveBeenCalledOnce();
    expect(f.writes.some((write) => [skills, lessonSkills, skillPrerequisites].includes(write.table as typeof skills))).toBe(false);
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "content_changed");
  });
  it("does not call AI when the operator has not enabled the worker", async () => {
    vi.stubEnv("AI_BACKGROUND_WORKER_ENABLED", "false");
    const f = fixture();
    await runKnowledgeMapJob(f.db, job, f.generate);
    expect(f.generate).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(expect.anything(), "a", "b", "failed", "analysis_failed");
  });
});
