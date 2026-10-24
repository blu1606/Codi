import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "@codi-1/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("./learning-path-service", () => ({
  loadLearningLessonAccess: access,
}));
import { createCodingService } from "./coding-service";
import { codingRunLeases } from "@codi-1/db/schema/coding-exercises";

const scope = {
  userId: "learner",
  courseId: "course",
  lessonId: "lesson",
  assessmentId: 1,
};
const sample = {
  id: 10,
  name: "sample",
  input: "solve(1)",
  expectedOutput: "2",
  isSample: true,
};
function fixture() {
  const state = {
    transactions: 0,
    claims: true,
    assessment: { id: 1, title: "Code", instructions: null, maxScore: 100 },
    exercise: {
      id: 2,
      language: "javascript",
      starterCode: "starter",
      hints: [],
      solutionCode: null,
      solutionVerifiedAt: null,
    },
    tests: [{ ...sample }],
    workspace: undefined as any,
    lease: undefined as any,
    submissions: [] as any[],
    results: [] as any[],
    selects: [] as any[],
    mutations: [] as any[],
  };
  const query = (kind: string, fields?: any) => {
    let table: any, values: any, conflict: any, condition: any;
    const q: any = {
      from(t: any) {
        table = t;
        return q;
      },
      values(v: any) {
        values = v;
        return q;
      },
      set(v: any) {
        values = v;
        return q;
      },
      where(v: any) {
        condition = v;
        return q;
      },
      orderBy() {
        return q;
      },
      limit() {
        return q;
      },
      for() {
        return q;
      },
      onConflictDoUpdate(v: any) {
        conflict = v;
        return q;
      },
      returning() {
        return q;
      },
      then(resolve: any, reject: any) {
        try {
          const name = getTableName(table);
          let rows: any[] = [];
          if (kind === "select") {
            state.selects.push({ name, fields });
            if (name === "assessments") rows = [state.assessment];
            if (name === "coding_exercises") rows = [state.exercise];
            if (name === "coding_test_cases") rows = state.tests;
            if (name === "coding_workspaces")
              rows = state.workspace ? [structuredClone(state.workspace)] : [];
            if (name === "coding_run_leases")
              rows = state.lease ? [{ ...state.lease }] : [];
            if (name === "coding_test_results") rows = state.results;
            if (name === "assessment_submissions") {
              if (fields?.runs)
                rows = [
                  {
                    runs: state.submissions.length,
                    submits: state.submissions.filter(
                      (s) => s.mode === "submit",
                    ).length,
                    failedSubmits: state.submissions.filter(
                      (s) => s.mode === "submit" && !s.isPassed,
                    ).length,
                    solutionFailedSubmits: state.submissions.filter(
                      (s) =>
                        s.mode === "submit" &&
                        !s.isPassed &&
                        s.codingRun?.solutionEligible,
                    ).length,
                    attempt: state.submissions.length,
                  },
                ];
              else if (fields?.isPassed)
                rows = state.submissions
                  .filter((s) => s.mode === "submit")
                  .slice(-1);
              else
                rows = state.submissions.filter(
                  (s) => s.id === state.workspace?.lastRunId,
                );
            }
          } else {
            state.mutations.push({ kind, name, condition, conflict });
            if (
              kind === "insert" &&
              name === "coding_run_leases" &&
              state.claims
            ) {
              state.lease = {
                ...values,
                runningUntil: new Date(Date.now() + 20000),
              };
              rows = [state.lease];
            }
            if (kind === "insert" && name === "coding_workspaces")
              state.workspace = state.workspace
                ? { ...state.workspace, ...conflict.set }
                : { solutionViewed: false, lastRunId: null, ...values };
            if (kind === "insert" && name === "assessment_submissions") {
              const saved = { ...values, id: state.submissions.length + 1 };
              state.submissions.push(saved);
              rows = [saved];
            }
            if (kind === "insert" && name === "coding_test_results")
              state.results = values;
            if (
              kind === "update" &&
              name === "coding_run_leases" &&
              state.lease
            )
              state.lease.runningUntil = new Date(0);
          }
          return Promise.resolve(rows).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
      table(t: any) {
        table = t;
        return q;
      },
    };
    return q;
  };
  const db = {
    select: (fields?: any) => query("select", fields),
    insert: (t: any) => query("insert").table(t),
    update: (t: any) => query("update").table(t),
    async transaction(fn: (tx: any) => Promise<any>) {
      state.transactions++;
      try {
        return await fn(db);
      } finally {
        state.transactions--;
      }
    },
  } as unknown as Database;
  return { db, state };
}
beforeEach(() => {
  access.mockReset().mockResolvedValue({ enrollment: { id: 3 } });
});
const result = {
  phase: "done" as const,
  durationMs: 1,
  logs: [],
  outcomes: [
    {
      id: 10,
      phase: "done" as const,
      actual: "2",
      error: null,
      line: null,
      durationMs: 1,
    },
  ],
};
describe("coding service transaction boundaries", () => {
  it("commits a lease/draft, runs with no transaction open, then rechecks access before recording", async () => {
    const { db, state } = fixture();
    const runner = vi.fn(async () => {
      expect(state.transactions).toBe(0);
      expect(state.lease.token).toBeTruthy();
      expect(state.workspace.draft).toBe("submitted");
      expect(state.submissions).toHaveLength(0);
      return result;
    });
    const view = await createCodingService(db, runner).execute(scope, {
      type: "submit",
      code: "submitted",
    });
    expect(view).toMatchObject({ passed: true, score: 100, submits: 1 });
    expect(access).toHaveBeenCalledTimes(3);
    expect(state.submissions).toHaveLength(1);
    expect(state.lease.runningUntil.getTime()).toBe(0);
    // The history is queried through aggregate/column projections, never SELECT *.
    expect(
      state.selects
        .filter((q) => q.name === "assessment_submissions")
        .every((q) => !!q.fields),
    ).toBe(true);
  });
  it("keeps the draft and prior grade when infrastructure fails; always releases the lease", async () => {
    const { db, state } = fixture();
    const service = createCodingService(db, async () => {
      throw new Error("watchdog");
    });
    await expect(
      service.execute(scope, { type: "submit", code: "new draft" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(state.workspace.draft).toBe("new draft");
    expect(state.submissions).toHaveLength(0);
    expect(state.lease.runningUntil.getTime()).toBe(0);
  });
  it("allows draft saves during execution and does not overwrite them on completion", async () => {
    const { db, state } = fixture();
    const service = createCodingService(db, async () => {
      await expect(
        service.execute(scope, { type: "draft", code: "newer edit" }),
      ).resolves.toEqual({ saved: true, code: "newer edit" });
      return result;
    });
    const view = await service.execute(scope, {
      type: "run",
      code: "submitted",
    });
    expect(view.code).toBe("newer edit");
    expect(state.submissions[0].answerText).toBe("submitted");
  });
  it.each(["reset"] as const)(
    "rejects %s while a worker is running",
    async (type) => {
      const { db, state } = fixture();
      state.lease = { runningUntil: new Date(Date.now() + 20000) };
      await expect(
        createCodingService(db).execute(scope, { type, confirmed: true }),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it.each([true, false])(
    "rejects shared busy/cooldown claims without spawning a worker (busy=%s)",
    async (busy) => {
      const { db, state } = fixture();
      state.claims = false;
      state.lease = {
        runningUntil: new Date(busy ? Date.now() + 20000 : 0),
      };
      const runner = vi.fn();
      await expect(
        createCodingService(db, runner).execute(scope, {
          type: "run",
          code: "",
        }),
      ).rejects.toMatchObject({ status: busy ? 409 : 429 });
      expect(runner).not.toHaveBeenCalled();
      const claim = state.mutations.find((m) => m.name === "coding_run_leases");
      const text = new PgDialect().sqlToQuery(claim.conflict.setWhere).sql;
      expect(text).toContain("interval '2 seconds'");
      expect(text).toContain('"running_until" <= clock_timestamp()');
    },
  );
  it.each(["revoked", "changed", "expired", "superseded"])(
    "does not persist stale results: %s",
    async (reason) => {
      const { db, state } = fixture();
      const service = createCodingService(db, async () => {
        if (reason === "revoked")
          access.mockRejectedValue(new Error("access revoked"));
        if (reason === "changed")
          state.tests = [{ ...sample, expectedOutput: "3" }];
        if (reason === "expired") state.lease.runningUntil = new Date(0);
        if (reason === "superseded") state.lease.token = "new-owner";
        return result;
      });
      await expect(
        service.execute(scope, { type: "submit", code: "submitted" }),
      ).rejects.toThrow();
      expect(state.submissions).toHaveLength(0);
      const release = state.mutations
        .filter((m) => m.kind === "update" && m.name === "coding_run_leases")
        .at(-1);
      const query = new PgDialect().sqlToQuery(release.condition);
      expect(query.sql).toContain('"token"');
      expect(query.params).toEqual([scope.userId, expect.any(String)]);
    },
  );
});
