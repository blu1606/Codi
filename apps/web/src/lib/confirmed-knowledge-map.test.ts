import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { lockKnowledgeMap, readConfirmedKnowledgeMap } from "./confirmed-knowledge-map";
import type { ConfirmedKnowledgeMap } from "@codi-1/db/schema/confirmed-knowledge-map";

const publishedMap: ConfirmedKnowledgeMap = {
  version: 1, publicationId: "publication-1", publishedAt: "2026-10-24T00:00:00.000Z",
  contentGeneration: 0,
  skills: [101, 102].map((id) => ({ id, name: `Published ${id}`,
    bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 })),
  edges: [{ from: 101, to: 102 }],
  links: [{ lessonId: "lesson-1", skillId: 101 }, { lessonId: "lesson-2", skillId: 102 }],
};

describe("confirmed map reader and lock protocol", () => {
  it("does not infer a publication from legacy course status", () => {
    expect(readConfirmedKnowledgeMap({}, ["lesson-1"])).toBeNull();
  });
  it("intersects live lesson access without mutating the stored publication", () => {
    const stored = structuredClone(publishedMap);
    const read = readConfirmedKnowledgeMap({ confirmedKnowledgeMap: stored }, ["lesson-1"]);
    expect(read?.skills).toEqual(publishedMap.skills);
    expect(read?.links).toEqual([{ lessonId: "lesson-1", skillId: 101 }]);
    expect(read?.edges).toEqual(publishedMap.edges);
    expect(stored).toEqual(publishedMap);
  });
  it("uses one namespaced transaction key with exclusive authors and shared learners", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const store: any = { execute };
    await lockKnowledgeMap(store, "course-1", "write");
    await lockKnowledgeMap(store, "course-1", "read");
    const queries = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query));
    expect(queries[0].sql).toContain("pg_advisory_xact_lock(hashtextextended(");
    expect(queries[1].sql).toContain('for update');
    expect(queries[2].sql).toContain("pg_advisory_xact_lock_shared(hashtextextended(");
    expect(queries.map((query) => query.params)).toEqual([
      ["codi:confirmed-knowledge-map:course-1"], ["course-1"], ["codi:confirmed-knowledge-map:course-1"],
    ]);
  });
  it("awaits lock acquisition before caller work can run", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const afterLock = vi.fn();
    const work = lockKnowledgeMap({ execute: () => wait } as any, "course-1", "write").then(afterLock);
    await Promise.resolve();
    expect(afterLock).not.toHaveBeenCalled();
    release();
    await work;
    expect(afterLock).toHaveBeenCalledOnce();
  });
});
