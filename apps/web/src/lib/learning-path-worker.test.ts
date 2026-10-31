import { describe, expect, it, vi } from "vitest";
import type { Database } from "@codi-1/db";
import { runLearningPathWorkerOnce } from "./learning-path-worker";
import { LearningPathError } from "./learning-path-contract";

function fixture(rows: { id: string; userId: string; courseId: string; enrollmentId: number }[]) {
  const builder = {
    from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn().mockResolvedValue(rows),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  const locked = { from: vi.fn(), where: vi.fn(), for: vi.fn().mockResolvedValue([{ id: 1 }]) };
  locked.from.mockReturnValue(locked); locked.where.mockReturnValue(locked);
  const update = { set: vi.fn(), where: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: "j1" }]) };
  update.set.mockReturnValue(update); update.where.mockReturnValue(update);
  const tx = { select: vi.fn().mockReturnValue(locked), update: vi.fn().mockReturnValue(update) };
  const db = { select: vi.fn().mockReturnValue(builder), transaction: vi.fn(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)) } as unknown as Pick<Database, "select" | "transaction">;
  return { db, builder, tx };
}

describe("learning-path worker poll", () => {
  it("does nothing when no job is eligible", async () => {
    const { db } = fixture([]);
    const service = { runPending: vi.fn() };
    expect(await runLearningPathWorkerOnce(db, service)).toBe(false);
    expect(service.runPending).not.toHaveBeenCalled();
  });
  it("passes the observed id to the locked service claim", async () => {
    const { db, builder } = fixture([{ id: "j1", userId: "u1", courseId: "c1", enrollmentId: 1 }]);
    const service = { runPending: vi.fn().mockResolvedValue(undefined) };
    expect(await runLearningPathWorkerOnce(db, service)).toBe(true);
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(service.runPending).toHaveBeenCalledExactlyOnceWith("u1", "c1", { observedJobId: "j1" });
  });
  it("propagates infrastructure failure for the runner to back off", async () => {
    const { db } = fixture([{ id: "j1", userId: "u1", courseId: "c1", enrollmentId: 1 }]);
    const service = { runPending: vi.fn().mockRejectedValue(new Error("db unavailable")) };
    await expect(runLearningPathWorkerOnce(db, service)).rejects.toThrow("db unavailable");
  });
  it("finishes a permanently inaccessible job under enrollment lock", async () => {
    const { db, tx } = fixture([{ id: "j1", userId: "u1", courseId: "c1", enrollmentId: 1 }]);
    const service = { runPending: vi.fn().mockRejectedValue(new LearningPathError("revoked", 403)) };
    expect(await runLearningPathWorkerOnce(db, service)).toBe(true);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});
