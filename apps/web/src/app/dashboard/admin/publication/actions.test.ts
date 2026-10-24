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

import { addReviewFlag, applyAutoCriteria, approvePublication, deleteReviewFlag, getAdminCourseReview, getAdminPublicationQueue,
  rejectPublication, requestChanges, saveCriterionVerdict, updateFlagStatus } from "./actions";

describe("publication decisions", () => {
  it("publishes and attributes price, notifying only after commit", async () => {
    await expect(approvePublication("c-1", 10, 599000)).resolves.toEqual({ success: true });
    const { state, events } = boundary.current;
    expect(state.courses[0]).toMatchObject({ status: "published", price: 599000, priceUpdatedBy: "actor-1" });
    expect(state.course_publication_requests[0]).toMatchObject({ status: "approved", approvedPrice: 599000 });
    expect(state.notifications).toHaveLength(1);
    expect(events).toContain("course-lock");
    expect(events).toContain("request-lock");
    expect(events.indexOf("commit")).toBeLessThan(events.indexOf("write:notifications"));
    expect(events.indexOf("course-lock")).toBeLessThan(events.indexOf("read:session"));
    expect(events.indexOf("course-lock")).toBeLessThan(events.indexOf("request-lock"));
  });
  it.each(["course_publication_requests", "courses"])("rolls back a zero-row %s claim without notification or refresh", async table => {
    boundary.current.failClaim(table);
    await expect(approvePublication("c-1", 10, 1000)).rejects.toThrow("Trạng thái đã thay đổi");
    expect(boundary.current.state.courses[0].status).toBe("pending");
    expect(boundary.current.state.course_publication_requests[0].status).toBe("in_review");
    expect(boundary.current.state.notifications).toEqual([]);
    expect(boundary.current.events).toContain("rollback");
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it.each([-1, NaN, Infinity, 1.5, 2147483648])("rejects invalid price %s", async price => {
    await expect(approvePublication("c-1", 10, price)).rejects.toThrow("Giá bán");
    expect(boundary.current.events).toEqual([]);
  });
  it.each(["approve", "request", "reject"])("rejects stale %s on the latest pending round", async action => {
    boundary.current.state.course_publication_requests.unshift({ id: 9, courseId: "c-1", round: 0, status: "in_review" });
    const run = action === "approve" ? approvePublication("c-1", 9, 1000)
      : action === "request" ? requestChanges("c-1", 9, "Please revise") : rejectPublication("c-1", 9, "Not suitable");
    await expect(run).rejects.toThrow("vòng mới nhất");
    expect(boundary.current.state.notifications).toEqual([]);
    expect(boundary.current.events.filter((event: string) => event.startsWith("write:"))).toEqual([]);
  });
  it("rejects mismatched request/course, concluded request and nonpending course", async () => {
    await expect(approvePublication("c-1", 99, 0)).rejects.toThrow("vòng mới nhất");
    boundary.current.state.course_publication_requests[0].status = "approved";
    await expect(approvePublication("c-1", 10, 0)).rejects.toThrow("kết luận");
    boundary.current.state.course_publication_requests[0].status = "in_review";
    boundary.current.state.courses[0].status = "published";
    await expect(approvePublication("c-1", 10, 0)).rejects.toThrow("pending");
  });
  it.each(["unmarked", "fix", "must"])("blocks approval with %s criteria/flags", async kind => {
    if (kind === "unmarked") boundary.current.state.publication_review_criteria.pop();
    if (kind === "fix") boundary.current.state.publication_review_criteria[0].status = "fix";
    if (kind === "must") boundary.current.state.publication_review_flags.push({ id: 1, requestId: 10, severity: "must", status: "fixed" });
    await expect(approvePublication("c-1", 10, 0)).rejects.toThrow("Chưa đủ điều kiện duyệt");
  });
  it("requires a fix or open flag for request changes, and a reason for both return decisions", async () => {
    await expect(requestChanges("c-1", 10, "Revise")).rejects.toThrow("Chưa có tiêu chí");
    await expect(requestChanges("c-1", 10, "")).rejects.toThrow("lời nhắn");
    await expect(rejectPublication("c-1", 10, "")).rejects.toThrow("lý do");
    boundary.current.state.publication_review_criteria[0].status = "fix";
    await requestChanges("c-1", 10, "Please revise");
    expect(boundary.current.state.courses[0].status).toBe("rejected");
    expect(boundary.current.state.course_publication_requests[0]).toMatchObject({ status: "changes_requested", reviewNote: "Please revise" });
  });
  it("rejects with reason and sends a committed notification", async () => {
    await rejectPublication("c-1", 10, "Not suitable");
    expect(boundary.current.state.course_publication_requests[0]).toMatchObject({ status: "rejected", reviewNote: "Not suitable" });
    expect(boundary.current.state.notifications).toHaveLength(1);
  });
  it("rechecks session and role inside the locked transaction", async () => {
    boundary.current.state.session = [];
    await expect(approvePublication("c-1", 10, 0)).rejects.toThrow("Unauthorized");
    expect(boundary.current.state.notifications).toEqual([]);
    boundary.current = createPublicationTestStore();
    boundary.role.mockRejectedValue(new Error("Forbidden"));
    await expect(approvePublication("c-1", 10, 0)).rejects.toThrow("Forbidden");
    expect(boundary.current.state.notifications).toEqual([]);
  });
  it("authenticates locator-based mutations before reading private references", async () => {
    boundary.session.mockResolvedValue(null);
    await expect(saveCriterionVerdict(10, "info", "pass")).rejects.toThrow("Unauthorized");
    await expect(updateFlagStatus(1, "closed")).rejects.toThrow("Unauthorized");
    expect(boundary.current.events).toEqual([]);
  });
  it("keeps a committed decision committed if postcommit notification delivery fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.current.store.insert = () => { throw new Error("Delivery unavailable"); };
    try {
      await expect(approvePublication("c-1", 10, 0)).resolves.toEqual({ success: true });
      expect(boundary.current.state.courses[0].status).toBe("published");
      expect(error).toHaveBeenCalledWith("Publication committed; notification delivery failed.");
    } finally { error.mockRestore(); }
  });
});

describe("review mutations share the course fence", () => {
  it("retains queue counts, latest requests and open flag projection without writes", async () => {
    const course = boundary.current.state.courses[0];
    boundary.current.state.courses = ["pending", "pending", "rejected", "published", "published", "published", "hidden", "hidden"]
      .map((status, i) => ({ ...course, id: i ? `c-${i + 1}` : "c-1", status, updatedAt: new Date() }));
    boundary.current.state.publication_review_flags = [{ id: 1, requestId: 10, status: "open" }];
    const queue = await getAdminPublicationQueue("pending");
    expect(queue.counts).toEqual({ pending: 2, changes: 1, approved: 5 });
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0]).toMatchObject({ id: "c-1", round: 1, openFlagsCount: 1 });
    expect(boundary.current.events.filter((e: string) => e.startsWith("write:"))).toEqual([]);
  });
  it("saves/unmarks criteria, applies suggestions without overriding a manual verdict", async () => {
    await saveCriterionVerdict(10, "info", "fix", "Too short");
    await saveCriterionVerdict(10, "quiz", null);
    await applyAutoCriteria(10, "c-1");
    expect(boundary.current.state.publication_review_criteria.find((r: any) => r.criterionId === "info").status).toBe("fix");
    expect(boundary.current.state.publication_review_criteria.find((r: any) => r.criterionId === "quiz").status).toBe("na");
    expect(boundary.current.events.filter((event: string) => event === "course-lock")).toHaveLength(3);
  });
  it("validates flags, closes/reopens and deletes within the active round", async () => {
    await expect(addReviewFlag("c-1", 10, { targetType: "lesson", targetLabel: "Lesson", comment: "short", severity: "must" })).rejects.toThrow("10 ký tự");
    const result = await addReviewFlag("c-1", 10, { targetType: "lesson", lessonId: "lesson-1", targetLabel: "Lesson", comment: "Please repair the material", severity: "must" });
    await updateFlagStatus(result.flagId, "closed");
    expect(boundary.current.state.publication_review_flags[0].status).toBe("closed");
    await updateFlagStatus(result.flagId, "open");
    await deleteReviewFlag(result.flagId);
    expect(boundary.current.state.publication_review_flags).toEqual([]);
    expect(boundary.current.events.filter((event: string) => event === "course-lock")).toHaveLength(4);
  });
  it.each(["criterion", "auto", "add", "status", "delete"])("rejects concluded-round %s before writing", async mutation => {
    boundary.current.state.course_publication_requests[0].status = "approved";
    boundary.current.state.publication_review_flags = [{ id: 1, requestId: 10, status: "open" }];
    const run = mutation === "criterion" ? saveCriterionVerdict(10, "info", "pass")
      : mutation === "auto" ? applyAutoCriteria(10, "c-1")
        : mutation === "add" ? addReviewFlag("c-1", 10, { targetType: "course", targetLabel: "Course", comment: "Please revise this", severity: "must" })
          : mutation === "status" ? updateFlagStatus(1, "closed") : deleteReviewFlag(1);
    await expect(run).rejects.toThrow("kết luận");
    expect(boundary.current.events.filter((event: string) => event.startsWith("write:"))).toEqual([]);
  });
  it("does not manufacture a round when loading review detail", async () => {
    boundary.current.state.course_publication_requests = [];
    await expect(getAdminCourseReview("c-1")).rejects.toThrow("chưa có yêu cầu");
    expect(boundary.current.events.filter((event: string) => event.startsWith("write:"))).toEqual([]);
  });
  it("serializes a mandatory flag before approval and rereads the committed blocker", async () => {
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const locked = new Promise<void>(done => { entered = done; });
    boundary.role.mockImplementationOnce(async () => { entered(); await gate; });
    const flag = addReviewFlag("c-1", 10, { targetType: "course", targetLabel: "Course", severity: "must", comment: "Mandatory repair before publish" }).then(
      value => ({ value, error: null }), error => ({ value: null, error }),
    );
    await locked;
    const approval = approvePublication("c-1", 10, 1000).then(
      value => ({ value, error: null }), error => ({ value: null, error }),
    );
    try {
      await boundary.current.whenCourseReads(2);
      await new Promise<void>(done => setImmediate(done));
      expect(boundary.current.events).not.toContain("read:publication_review_criteria");
    } finally { release(); }
    expect((await flag).error).toBeNull();
    expect((await approval).error?.message).toContain("Chưa đủ điều kiện duyệt");
    expect(boundary.current.state.courses[0].status).toBe("pending");
    expect(boundary.current.state.notifications).toEqual([]);
    expect(boundary.current.events.filter((e: string) => e === "course-lock")).toHaveLength(2);
  });
  it("a competing decision rereads the concluded round and never notifies a losing transition", async () => {
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const locked = new Promise<void>(done => { entered = done; });
    boundary.role.mockImplementationOnce(async () => { entered(); await gate; });
    const winner = rejectPublication("c-1", 10, "Not suitable"); await locked;
    const loser = expect(approvePublication("c-1", 10, 1000)).rejects.toThrow("kết luận");
    release(); await winner; await loser;
    expect(boundary.current.state.courses[0].status).toBe("rejected");
    expect(boundary.current.state.notifications).toHaveLength(1);
  });
});
