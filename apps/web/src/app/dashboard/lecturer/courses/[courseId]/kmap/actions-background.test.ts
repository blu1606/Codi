import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: vi.fn(), identity: vi.fn(), editable: vi.fn(), lock: vi.fn(), enqueue: vi.fn(), assertNoActive: vi.fn(),
  select: vi.fn(), update: vi.fn(), transaction: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/knowledge-map-extraction", () => ({ knowledgeMapProducerEnabled: mocks.configured }));
vi.mock("@/lib/lecturer-auth", () => ({ readLecturerIdentity: mocks.identity, verifyLecturerSession: vi.fn() }));
vi.mock("../course-queries", () => ({ getEditableCourse: mocks.editable }));
vi.mock("@/lib/confirmed-knowledge-map", () => ({ lockKnowledgeMap: mocks.lock }));
vi.mock("@codi-1/db/ai-jobs", () => ({ enqueueAiJob: mocks.enqueue, assertNoActiveAiJob: mocks.assertNoActive, readLatestAiJob: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/services", () => ({ db: { transaction: mocks.transaction } }));
import { runKnowledgeMapAnalysis } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.identity.mockResolvedValue({ user: { id: "owner" } });
  mocks.editable.mockResolvedValue({ course: { id: "c1", knowledgeMapContentGeneration: 3 }, user: { id: "owner" } });
  mocks.select.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ id: "lesson" }]) }) }) });
  mocks.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
  mocks.enqueue.mockResolvedValue("job-id");
  mocks.transaction.mockImplementation((fn) => fn({ select: mocks.select, update: mocks.update }));
});
describe("enqueue knowledge map analysis", () => {
  it("queues the authorised owner and content generation in the same transaction as status", async () => {
    expect(await runKnowledgeMapAnalysis("c1")).toEqual({ success: true, jobId: "job-id" });
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), "c1", "write");
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), { type: "knowledge_map", userId: "owner", resourceId: "c1", payload: { generation: 3 } });
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("does not wait for or enqueue over an active locked job", async () => {
    mocks.assertNoActive.mockRejectedValue(new Error("active_job"));
    await expect(runKnowledgeMapAnalysis("c1")).rejects.toThrow("active_job");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("fails closed without the producer flag", async () => {
    mocks.configured.mockReturnValue(false);
    await expect(runKnowledgeMapAnalysis("c1")).rejects.toThrow("chưa khả dụng");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not enqueue when course ownership fails", async () => {
    mocks.editable.mockRejectedValue(new Error("not_owner"));
    await expect(runKnowledgeMapAnalysis("c1")).rejects.toThrow("not_owner");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
