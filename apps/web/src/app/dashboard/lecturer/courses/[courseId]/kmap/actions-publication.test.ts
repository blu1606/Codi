import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { courses, courseChapters, courseLessons, enrollmentSkillMastery, lessonProgress, lessonSkills, skills, skillPrerequisites } from "@codi-1/db";

const boundary = vi.hoisted(() => ({ transaction: vi.fn(), session: vi.fn(), refresh: vi.fn() }));
vi.mock("@/services", () => ({ db: { transaction: boundary.transaction } }));
vi.mock("@/lib/lecturer-auth", () => ({ readLecturerIdentity: async () => ({ user: await (boundary.session)(), session: { id: "session-1" } }), verifyLecturerSession: boundary.session }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@/lib/notification-service", () => ({ createNotificationService: () => ({ notify: async () => {} }) }));
import { addKnowledgeMapEdge, confirmKnowledgeMap, renameKnowledgeMapConcept, runKnowledgeMapAnalysis } from "./actions";
import { renameLesson } from "../actions";

let course: any;
let concepts: any[];
let edges: any[];
let events: string[];
let writes: any[];
let gate: Promise<void> | undefined;
let tail: Promise<void>;
let transactionId: number;

beforeEach(() => {
  vi.resetAllMocks();
  course = { id: "course", instructorId: "lecturer", title: "Course", status: "published",
    knowledgeMapStatus: "ready", knowledgeMapContentGeneration: 0, knowledgeMapAnalysisGeneration: 0,
    confirmedKnowledgeMap: null };
  concepts = [101, 102].map((id) => ({ id, courseId: "course", name: `Concept ${id}`, review: "accepted",
    bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 }));
  edges = [{ prerequisiteSkillId: 101, skillId: 102, review: "accepted" }];
  writes = []; events = []; gate = undefined; tail = Promise.resolve(); transactionId = 0;
  boundary.session.mockResolvedValue({ id: "lecturer" });
  boundary.transaction.mockImplementation(async (callback) => {
    const id = ++transactionId;
    let unlock: (() => void) | undefined;
    const rows = (table: unknown) => table === courses ? [course] : table === skills ? concepts
      : table === skillPrerequisites ? edges : table === courseChapters ? [{ id: "chapter" }]
      : table === courseLessons ? [{ id: "lesson-1", title: "One", position: 0 }]
      : table === lessonSkills ? [{ lessonId: "lesson-1", skillId: 101 }] : [];
    const tx: any = {
      execute: async (sql: any) => {
        const query = new PgDialect().sqlToQuery(sql);
        if (query.sql.includes("pg_advisory_xact_lock(")) {
          const previous = tail;
          tail = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          events.push(`graph:${id}`);
          await gate;
        } else events.push(`course-lock:${id}`);
      },
      select: () => ({ from: (table: unknown) => {
        let condition: any;
        const q: any = { then: (resolve: any, reject: any) => {
          events.push(`read:${id}`);
          const compiled = condition && new PgDialect().sqlToQuery(condition);
          let selected = rows(table);
          if (table === courses && compiled?.sql.includes('"instructor_id"')) {
            selected = selected.filter((row) => compiled.params.includes(row.instructorId));
          }
          if (table === skillPrerequisites && compiled?.sql.includes('"prerequisite_skill_id" =')) {
            selected = selected.filter((row) => row.prerequisiteSkillId === compiled.params[0] && row.skillId === compiled.params[1]);
          }
          return Promise.resolve(selected.map((row: any) => ({ ...row }))).then(resolve, reject);
        } };
        q.where = (value: any) => { condition = value; return q; };
        for (const method of ["orderBy", "for", "innerJoin"]) q[method] = () => q;
        return q;
      } }),
      update: (table: unknown) => ({ set: (values: any) => ({ where: async () => {
        writes.push({ table, values });
        if (table === courses) Object.assign(course, values);
        // Rename/reanalysis tests address all concepts; publication must remain independent.
        if (table === skills) concepts.forEach((row) => Object.assign(row, values));
      } }) }),
      insert: (table: unknown) => ({ values: async (values: any) => {
        writes.push({ table, values });
        if (table === skillPrerequisites) edges.push(values);
      } }),
      transaction: (nested: any) => nested(tx),
    };
    try { return await callback(tx); } finally { unlock?.(); }
  });
});

describe("confirmed publication actions", () => {
  it("publishes canonical IDs once and preserves the payload through rename and reanalysis", async () => {
    await confirmKnowledgeMap("course");
    const publication = structuredClone(course.confirmedKnowledgeMap);
    expect(publication.skills.map((skill: any) => skill.id)).toEqual([101, 102]);
    expect(publication.contentGeneration).toBe(0);
    expect(events.slice(0, 3)).toEqual(["graph:1", "course-lock:1", "read:1"]);
    await renameKnowledgeMapConcept("course", 101, "Draft name");
    expect(course.knowledgeMapStatus).toBe("ready");
    expect(course.confirmedKnowledgeMap).toEqual(publication);
    await runKnowledgeMapAnalysis("course");
    expect(course.confirmedKnowledgeMap).toEqual(publication);
    expect(concepts.map((skill) => skill.id)).toEqual([101, 102]);
    expect(writes.filter((write) => write.table === enrollmentSkillMastery || write.table === lessonProgress)).toEqual([]);
  });
  it.each(["pending", "foreign-owner", "stale-generation"])("rechecks %s after waiting for the lock", async (change) => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const result = confirmKnowledgeMap("course");
    await Promise.resolve();
    if (change === "pending") course.status = "pending";
    if (change === "foreign-owner") {
      course.instructorId = "other-lecturer";
    }
    if (change === "stale-generation") course.knowledgeMapContentGeneration = 1;
    release();
    await expect(result).rejects.toThrow();
    expect(writes).toEqual([]);
  });
  it("a concurrent writer waits behind confirmation and cannot change the published graph", async () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const confirm = confirmKnowledgeMap("course");
    await Promise.resolve();
    const edit = renameKnowledgeMapConcept("course", 101, "Draft after confirmation");
    await Promise.resolve();
    expect(writes).toEqual([]);
    release();
    await Promise.all([confirm, edit]);
    expect(course.confirmedKnowledgeMap.skills[0].name).toBe("Concept 101");
    expect(course.knowledgeMapStatus).toBe("ready");
    expect(events.indexOf("read:2")).toBeGreaterThan(events.indexOf("read:1"));
  });
  it("refuses a cycle rather than publishing invalid endpoints", async () => {
    edges.push({ prerequisiteSkillId: 102, skillId: 101, review: "accepted" });
    await expect(confirmKnowledgeMap("course")).rejects.toThrow("vòng lặp");
    expect(course.confirmedKnowledgeMap).toBeNull();
  });
  it("confirmation waits for an edge writer and validates the graph after its commit", async () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const writer = addKnowledgeMapEdge("course", 102, 101);
    await Promise.resolve();
    const confirm = confirmKnowledgeMap("course");
    const rejected = expect(confirm).rejects.toThrow("vòng lặp");
    await Promise.resolve();
    expect(writes).toEqual([]);
    release();
    await writer;
    await rejected;
    expect(course.confirmedKnowledgeMap).toBeNull();
  });
  it("refuses graph edges touching a foreign canonical skill", async () => {
    edges.push({ prerequisiteSkillId: 999, skillId: 101, review: "accepted" });
    await expect(confirmKnowledgeMap("course")).rejects.toThrow("không thuộc");
    expect(course.confirmedKnowledgeMap).toBeNull();
  });
  it("reconfirmation replaces only the publication and preserves canonical IDs and learner records", async () => {
    await confirmKnowledgeMap("course");
    const first = structuredClone(course.confirmedKnowledgeMap);
    await renameKnowledgeMapConcept("course", 101, "Reviewed name");
    await confirmKnowledgeMap("course");
    expect(course.confirmedKnowledgeMap.publicationId).not.toBe(first.publicationId);
    expect(course.confirmedKnowledgeMap.skills.map((skill: any) => skill.id)).toEqual(first.skills.map((skill: any) => skill.id));
    expect(course.confirmedKnowledgeMap.skills[0].name).toBe("Reviewed name");
    expect(writes.filter((write) => write.table === enrollmentSkillMastery || write.table === lessonProgress)).toEqual([]);
  });
  it("confirmation waits for content invalidation rather than overwriting its new generation", async () => {
    course.knowledgeMapStatus = "confirmed";
    let release!: () => void;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const writer = renameLesson("course", "lesson-1", "Changed title");
    await Promise.resolve();
    const confirm = confirmKnowledgeMap("course");
    const rejected = expect(confirm).rejects.toThrow("phân tích lại");
    await Promise.resolve();
    release();
    await writer;
    await rejected;
    expect(course.knowledgeMapContentGeneration).toBe(1);
    expect(course.knowledgeMapStatus).toBe("stale");
    expect(course.confirmedKnowledgeMap).toBeNull();
  });
});
