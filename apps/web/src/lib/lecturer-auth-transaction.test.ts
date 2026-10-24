import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const boundary = vi.hoisted(() => ({ getSession: vi.fn(), requireRole: vi.fn(), globalSelect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/services", () => ({
  auth: { api: { getSession: boundary.getSession } }, db: { select: boundary.globalSelect },
}));
vi.mock("@codi-1/auth", () => ({ ROLE: { LECTURER: "LECTURER" }, requireRole: boundary.requireRole }));
import { readLecturerIdentity, verifyLecturerSession } from "./lecturer-auth";

beforeEach(() => {
  vi.resetAllMocks();
  boundary.getSession.mockResolvedValue({ user: { id: "lecturer" }, session: { id: "session-1" } });
});

describe("post-lock lecturer authorization", () => {
  function transaction(rows: unknown[]) {
    const where = vi.fn().mockResolvedValue(rows);
    const store: any = { select: vi.fn(() => ({ from: () => ({ where }) })) };
    return { store, where };
  }
  it("revalidates live session and role on the transaction connection without pooled auth queries", async () => {
    const identity = await readLecturerIdentity();
    const tx = transaction([{ id: "session-1" }]);
    expect(await verifyLecturerSession(tx.store, identity)).toEqual({ id: "lecturer" });
    expect(boundary.getSession).toHaveBeenCalledOnce();
    expect(boundary.globalSelect).not.toHaveBeenCalled();
    expect(boundary.requireRole).toHaveBeenCalledWith(tx.store, "lecturer", "LECTURER");
    const query = new PgDialect().sqlToQuery(tx.where.mock.calls[0]![0]);
    expect(query.sql).toContain('"session"."id" =');
    expect(query.sql).toContain('"session"."user_id" =');
    expect(query.sql).toContain('"session"."expires_at" >');
    expect(query.params.slice(0, 2)).toEqual(["session-1", "lecturer"]);
  });
  it("rejects a session revoked or expired while waiting without reaching course writes", async () => {
    const identity = await readLecturerIdentity();
    await expect(verifyLecturerSession(transaction([]).store, identity)).rejects.toThrow("Unauthorized");
    expect(boundary.requireRole).not.toHaveBeenCalled();
    expect(boundary.globalSelect).not.toHaveBeenCalled();
  });
  it("honors a role or ban rejection after lock acquisition", async () => {
    const identity = await readLecturerIdentity();
    boundary.requireRole.mockRejectedValue(new Error("Forbidden"));
    await expect(verifyLecturerSession(transaction([{ id: "session-1" }]).store, identity)).rejects.toThrow("Forbidden");
  });
});
