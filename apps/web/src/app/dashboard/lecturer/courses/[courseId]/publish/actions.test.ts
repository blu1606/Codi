import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicationTestStore } from "@/lib/publication-test-store";
const boundary = vi.hoisted(() => ({ current: undefined as any, role: vi.fn(), session: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => boundary.refresh(...args) }));
vi.mock("@codi-1/auth", () => ({ ROLE: { ADMIN: "ADMIN", LECTURER: "LECTURER" },
  requireRole: (...args: unknown[]) => boundary.role(...args) }));
vi.mock("@/services", () => ({
  auth: { api: { getSession: () => boundary.session() } },
  db: Object.fromEntries(["select", "insert", "update", "delete", "transaction"].map(method => [
    method, (...args: unknown[]) => boundary.current.store[method](...args),
  ])),
}));
beforeEach(() => {
  vi.resetAllMocks(); boundary.current = createPublicationTestStore();
  boundary.session.mockResolvedValue({ user: { id: "actor-1" }, session: { id: "session-1" } });
  boundary.role.mockResolvedValue(undefined);
});

import { getPublicationData, markFlagFixed, reopenFlag, submitCourseForPublication } from "./actions";
describe("lecturer publication", () => {
  beforeEach(() => {
    boundary.current.state.courses[0].instructorId = "actor-1";
    boundary.current.state.courses[0].status = "rejected";
    boundary.current.state.course_publication_requests[0].status = "changes_requested";
    boundary.current.state.publication_review_flags = [{ id: 1, requestId: 10, status: "open", comment: "Repair", severity: "must",
      createdAt: new Date(), updatedAt: new Date() }];
  });
  it("marks and reopens the latest returned flag with an atomic request/status predicate", async () => {
    await markFlagFixed("c-1", 1, "Fixed the material");
    expect(boundary.current.state.publication_review_flags[0]).toMatchObject({ status: "fixed", lecturerReply: "Fixed the material" });
    await reopenFlag("c-1", 1);
    expect(boundary.current.state.publication_review_flags[0]).toMatchObject({ status: "open", lecturerReply: null });
    const mutation = boundary.current.predicates.find((p: any) => p.table === "publication_review_flags" && p.sql.includes('"request_id"'));
    expect(mutation.params).toEqual([1, 10, "open"]);
  });
  it("rejects cross-course and older-round flags without changing history", async () => {
    boundary.current.state.publication_review_flags[0].requestId = 9;
    await expect(markFlagFixed("c-1", 1, "Old history")).rejects.toThrow("Trạng thái");
    expect(boundary.current.state.publication_review_flags[0].status).toBe("open");
    boundary.current.state.courses[0].instructorId = "other";
    await expect(markFlagFixed("c-1", 1, "Other course")).rejects.toThrow("Không có quyền");
  });
  it.each(["pending", "published", "hidden", "draft"])("rejects flag response while course is %s", async status => {
    boundary.current.state.courses[0].status = status;
    await expect(markFlagFixed("c-1", 1, "Material fixed")).rejects.toThrow("vòng mới nhất");
    await expect(reopenFlag("c-1", 1)).rejects.toThrow("vòng mới nhất");
  });
  it("refuses closed or wrong-state flags and short replies", async () => {
    await expect(markFlagFixed("c-1", 1, "no")).rejects.toThrow("5 ký tự");
    await expect(reopenFlag("c-1", 1)).rejects.toThrow("Trạng thái");
    boundary.current.state.publication_review_flags[0].status = "closed";
    await expect(markFlagFixed("c-1", 1, "Material fixed")).rejects.toThrow("Trạng thái");
    await expect(reopenFlag("c-1", 1)).rejects.toThrow("Trạng thái");
  });
  it("submits a complete returned course, preserving prior flags and creating the next round", async () => {
    boundary.current.state.user_roles = [{ userId: "admin-1", roleId: "ADMIN", revokedAt: null }];
    boundary.current.state.user = [{ id: "admin-1", banned: false }];
    await submitCourseForPublication("c-1");
    expect(boundary.current.state.courses[0].status).toBe("pending");
    expect(boundary.current.state.course_publication_requests).toHaveLength(2);
    expect(boundary.current.state.course_publication_requests[1]).toMatchObject({ round: 2, status: "in_review" });
    expect(boundary.current.state.publication_review_flags).toHaveLength(2);
    expect(boundary.current.state.publication_review_flags[0].requestId).toBe(10);
    expect(boundary.current.state.publication_review_flags[1].carriedFromFlagId).toBe(1);
    expect(boundary.current.state.notifications).toHaveLength(1);
    expect(boundary.current.events.indexOf("commit")).toBeLessThan(boundary.current.events.indexOf("write:notifications"));
  });
  it("rolls back round/copies if the submit course claim loses", async () => {
    boundary.current.failClaim("courses");
    await expect(submitCourseForPublication("c-1")).rejects.toThrow("Trạng thái");
    expect(boundary.current.state.course_publication_requests).toHaveLength(1);
    expect(boundary.current.state.publication_review_flags).toHaveLength(1);
    expect(boundary.current.state.notifications).toEqual([]);
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("rejects a pending submission and incomplete readiness", async () => {
    boundary.current.state.courses[0].status = "pending";
    await expect(submitCourseForPublication("c-1")).rejects.toThrow("Không thể gửi");
    boundary.current.state.courses[0].status = "draft";
    boundary.current.state.quiz_questions = [];
    await expect(submitCourseForPublication("c-1")).rejects.toThrow("Chưa đủ điều kiện");
  });
  it("serializes duplicate submissions without opening two new rounds", async () => {
    const results = await Promise.allSettled([submitCourseForPublication("c-1"), submitCourseForPublication("c-1")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(boundary.current.state.course_publication_requests).toHaveLength(2);
  });
  it("loads latest results read-only and refuses an unowned course", async () => {
    const data = await getPublicationData("c-1");
    expect(data.isLocked).toBe(false); expect(data.round?.id).toBe(10);
    expect(boundary.current.events.filter((e: string) => e.startsWith("write:"))).toEqual([]);
    boundary.current.state.courses[0].instructorId = "other";
    await expect(getPublicationData("c-1")).rejects.toThrow("Không có quyền");
  });
});
