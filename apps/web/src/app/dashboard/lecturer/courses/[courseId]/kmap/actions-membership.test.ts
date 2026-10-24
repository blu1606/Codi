import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseChapters, courseLessons, courses, skillPrerequisites, skills } from "@codi-1/db";

const boundary = vi.hoisted(() => ({
  session: vi.fn(), role: vi.fn(), select: vi.fn(), update: vi.fn(),
  insert: vi.fn(), transaction: vi.fn(), refresh: vi.fn(), notify: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LECTURER: "LECTURER" }, requireRole: boundary.role,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: boundary.session } },
  db: {
    select: boundary.select, update: boundary.update, insert: boundary.insert,
    transaction: boundary.transaction,
  },
}));
vi.mock("@/lib/notification-service", () => ({
  createNotificationService: () => ({ notify: boundary.notify }),
}));

import {
  acceptAllKnowledgeMap, addKnowledgeMapEdge, reviewKnowledgeMapItem,
  runKnowledgeMapAnalysis,
} from "./actions";

describe("knowledge-map course membership", () => {
  const dialect = new PgDialect();
  let ownedIds: number[];
  let existingEdge: { prerequisiteSkillId: number; skillId: number; review: string } | null;
  let courseStatus: string;
  let mapStatus: string;
  let queries: Array<{ table: unknown; condition: SQL; transaction: boolean }>;
  let writes: Array<{ table: unknown; values: unknown; condition?: SQL; transaction: boolean }>;
  let inTransaction: boolean;

  beforeEach(() => {
    vi.resetAllMocks();
    ownedIds = [101, 102];
    existingEdge = null;
    courseStatus = "draft";
    mapStatus = "ready";
    queries = [];
    writes = [];
    inTransaction = false;
    boundary.session.mockResolvedValue({ user: { id: "lecturer-1" } });
    boundary.role.mockResolvedValue(undefined);
    boundary.select.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          queries.push({ table, condition, transaction: inTransaction });
          const rows = table === courses
            ? [{ id: "c-1", instructorId: "lecturer-1", status: courseStatus, knowledgeMapStatus: mapStatus }]
            : table === skills ? ownedIds.map((id) => ({ id, review: "suggested" }))
            : table === skillPrerequisites ? (existingEdge ? [existingEdge] : [])
            : table === courseChapters ? [{ id: "ch-1" }]
            : table === courseLessons ? [{ id: "ls-1", title: "Bài 1", position: 0 }]
            : [];
          return Object.assign(Promise.resolve(rows), {
            orderBy: () => Promise.resolve(rows),
            for: () => Promise.resolve(rows),
          });
        },
      }),
    }));
    boundary.update.mockImplementation((table: unknown) => ({
      set: (values: unknown) => ({ where: async (condition: SQL) => {
        writes.push({ table, values, condition, transaction: inTransaction });
        return [];
      } }),
    }));
    boundary.insert.mockImplementation((table: unknown) => ({ values: async (values: unknown) => {
      writes.push({ table, values, transaction: inTransaction });
      return [];
    } }));
    boundary.transaction.mockImplementation(async (callback) => {
      inTransaction = true;
      try {
        return await callback({ select: boundary.select, update: boundary.update, insert: boundary.insert,
          execute: vi.fn(), transaction: boundary.transaction });
      } finally {
        inTransaction = false;
      }
    });
  });

  function expectMembershipRead() {
    const query = queries.find((q) => q.table === skills)!;
    expect(query).toBeDefined();
    const compiled = dialect.sqlToQuery(query.condition);
    expect(compiled.sql).toBe('(("skills"."course_id" = $1) and ("skills"."id" in ($2, $3)))');
    expect(compiled.params).toEqual(["c-1", 101, 102]);
    expect(query.transaction).toBe(true);
  }

  for (const [label, matchingIds] of [
    ["both foreign", []], ["foreign target", [101]],
    ["foreign source", [102]], ["missing", []],
  ] as const) {
    it.each(["add", "restore", "accept", "decline"] as const)(
      `rejects ${label} endpoints before any %s mutation`, async (operation) => {
        ownedIds = [...matchingIds];
        mapStatus = "confirmed";
        existingEdge = { prerequisiteSkillId: 101, skillId: 102, review: operation === "restore" ? "declined" : "suggested" };
        if (operation === "add") existingEdge = null;
        const action = operation === "add" || operation === "restore"
          ? addKnowledgeMapEdge("c-1", 101, 102)
          : reviewKnowledgeMapItem("c-1", "edge", {
              fromSkillId: 101, toSkillId: 102, review: operation === "accept" ? "accepted" : "declined",
            });
        await expect(action).rejects.toThrow("Khái niệm không thuộc khoá học này.");
        expectMembershipRead();
        expect(writes).toEqual([]);
        expect(boundary.refresh).not.toHaveBeenCalled();
      },
    );
  }

  it.each(["add", "restore", "accept", "decline", "edit"] as const)(
    "preserves same-course %s and checks membership in the mutation transaction", async (operation) => {
      mapStatus = "confirmed";
      existingEdge = operation === "add" ? null
        : { prerequisiteSkillId: 101, skillId: 102,
            review: operation === "restore" ? "declined" : operation === "accept" ? "suggested" : "accepted" };
      const review = operation === "decline" ? "declined" : operation === "edit" ? "edited" : "accepted";
      const result = operation === "add" || operation === "restore"
        ? await addKnowledgeMapEdge("c-1", 101, 102)
        : await reviewKnowledgeMapItem("c-1", "edge", { fromSkillId: 101, toSkillId: 102, review });
      expect(result).toEqual({ success: true });
      expectMembershipRead();
      const edgeWrites = writes.filter((w) => w.table === skillPrerequisites);
      expect(edgeWrites).toHaveLength(1);
      expect(edgeWrites[0].values).toEqual(operation === "add"
        ? { prerequisiteSkillId: 101, skillId: 102, source: "lecturer", review: "accepted" }
        : { review });
      expect(edgeWrites[0].transaction).toBe(true);
      if (edgeWrites[0].condition) {
        expect(dialect.sqlToQuery(edgeWrites[0].condition).params).toEqual([101, 102]);
      }
      expect(writes.find((w) => w.table === courses)?.values).toEqual({ knowledgeMapStatus: "ready" });
    },
  );

  it.each(["add", "review"] as const)("still rejects a pending course for %s", async (operation) => {
    courseStatus = "pending";
    const action = operation === "add" ? addKnowledgeMapEdge("c-1", 101, 102)
      : reviewKnowledgeMapItem("c-1", "edge", { fromSkillId: 101, toSkillId: 102, review: "accepted" });
    await expect(action).rejects.toThrow("Khoá học đang chờ duyệt");
    expect(writes).toEqual([]);
  });

  it.each([undefined, 0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed edge endpoint %s before changing a confirmed course", async (fromSkillId) => {
      mapStatus = "confirmed";
      await expect(reviewKnowledgeMapItem("c-1", "edge", {
        fromSkillId, toSkillId: 102, review: "declined",
      })).rejects.toThrow("Khái niệm không thuộc khoá học này.");
      expect(writes).toEqual([]);
      expect(boundary.refresh).not.toHaveBeenCalled();
    },
  );

  it("scopes both endpoints when resetting existing edges for reanalysis", async () => {
    await runKnowledgeMapAnalysis("c-1");
    const update = writes.find((w) => w.table === skillPrerequisites)!;
    const query = dialect.sqlToQuery(update.condition!);
    expect(query.sql).toBe('(("skill_prerequisites"."skill_id" in ($1, $2)) and ("skill_prerequisites"."prerequisite_skill_id" in ($3, $4)))');
    expect(query.params).toEqual([101, 102, 101, 102]);
  });

  it("scopes both endpoints when loading edges for accept-all", async () => {
    await acceptAllKnowledgeMap("c-1");
    const read = queries.find((q) => q.table === skillPrerequisites)!;
    const query = dialect.sqlToQuery(read.condition);
    expect(query.sql).toBe('(("skill_prerequisites"."skill_id" in ($1, $2)) and ("skill_prerequisites"."prerequisite_skill_id" in ($3, $4)))');
    expect(query.params).toEqual([101, 102, 101, 102]);
  });
});

// Session transport is a boundary here; transactional revalidation has its own tests.
vi.mock("@/lib/lecturer-auth", () => ({
  readLecturerIdentity: async () => {
    const identity = await boundary.session();
    if (!identity?.user) throw new Error("Unauthorized");
    return identity;
  },
  verifyLecturerSession: async (_store: unknown, identity?: any) => {
    const authenticated = identity ?? await boundary.session();
    if (!authenticated?.user) throw new Error("Unauthorized");
    await boundary.role();
    return authenticated.user;
  },
}));
