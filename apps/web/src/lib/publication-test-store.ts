import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Offline query-boundary double, not a PostgreSQL implementation. Unsupported
// predicates fail loudly; SQL/lock assertions below are not live database proof.
type Row = Record<string, any>;
export function createPublicationTestStore() {
  const state: Record<string, Row[]> = {
    courses: [{ id: "c-1", title: "React", description: "A sufficiently detailed course description for review.",
      instructorId: "lecturer-1", status: "pending", price: 1000, proposedPrice: 2000, knowledgeMapStatus: "confirmed" }],
    session: [{ id: "session-1", userId: "actor-1", expiresAt: new Date("2099-01-01") }],
    course_publication_requests: [{ id: 10, courseId: "c-1", round: 1, status: "in_review", requestedBy: "lecturer-1", requestedAt: new Date() }],
    publication_review_criteria: ["info", "materials", "quiz", "entry", "code", "assignment", "rights"].map(criterionId => ({ requestId: 10, criterionId, status: "pass" })),
    publication_review_flags: [], notifications: [], course_details: [],
    course_chapters: [{ id: "ch-1", courseId: "c-1", title: "Chapter", position: 0 }],
    course_lessons: [{ id: "lesson-1", chapterId: "ch-1", title: "Lesson", body: "Real body", position: 0, durationSeconds: 100 }],
    lesson_materials: [],
    assessments: [{ id: 1, courseId: "c-1", isDiagnostic: true, type: "quiz", currentQuizRevision: 2 }],
    quiz_questions: [1, 2, 3, 4, 5].map(id => ({ id, assessmentId: 1, quizRevision: 2, text: `Question ${id}`, position: id })),
    quiz_options: [], coding_exercises: [], coding_test_cases: [], user_roles: [], user: [],
  };
  const events: string[] = [];
  const predicates: Array<{ table: string; sql: string; params: unknown[] }> = [];
  const dialect = new PgDialect();
  let tail = Promise.resolve();
  let failClaim: string | null = null;
  let courseReads = 0;
  const courseWaiters: Array<{ count: number; done: () => void }> = [];
  const value = (row: Row, table: string, column: string) =>
    row[table]?.[column.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  function matches(row: Row, condition?: SQL) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let residual = sql;
    let ok = true;
    residual = residual.replace(/"([^"]+)"\."([^"]+)" in \(([^)]+)\)/g, (_all, table, column, slots) => {
      const values = [...slots.matchAll(/\$(\d+)/g)].map((m: RegExpMatchArray) => params[Number(m[1]) - 1]);
      ok &&= values.includes(value(row, table, column)); return "true";
    });
    residual = residual.replace(/"([^"]+)"\."([^"]+)" = "([^"]+)"\."([^"]+)"/g, (_all, t, c, t2, c2) => {
      ok &&= value(row, t, c) === value(row, t2, c2); return "true";
    });
    residual = residual.replace(/"([^"]+)"\."([^"]+)" (=|>) \$(\d+)/g, (_all, table, column, operator, slot) => {
      const actual = value(row, table, column); const expected = params[Number(slot) - 1];
      ok &&= operator === "=" ? actual === expected
        : actual instanceof Date ? actual.getTime() > new Date(expected as string).getTime() : actual > (expected as any);
      return "true";
    });
    residual = residual.replace(/"([^"]+)"\."([^"]+)" is null/gi, (_all, table, column) => {
      ok &&= value(row, table, column) == null; return "true";
    });
    residual = residual.replace(/"([^"]+)"\."([^"]+)" <> 'closed'/g, (_all, table, column) => {
      ok &&= value(row, table, column) !== "closed"; return "true";
    });
    if (residual.replace(/true|and|[()\s]/g, "")) throw new Error(`Unsupported test predicate: ${sql}`);
    return ok;
  }
  function project(row: Row, selection?: Row) {
    if (!selection) return Object.values(row)[0];
    return Object.fromEntries(Object.entries(selection).map(([key, column]) => [key,
      column?.table ? value(row, getTableName(column.table), column.name) : undefined]));
  }
  function connection(transaction: boolean) {
    let local: Record<string, Row[]> | undefined;
    let release: (() => void) | undefined;
    const rows = () => local || state;
    const api = {
      select(selection?: Row) {
        let table: any; let where: SQL | undefined; let limit = Infinity; let descending = false; let lock = false;
        const joins: Array<{ table: any; condition: SQL; left?: boolean }> = [];
        const query: any = {
          from(t: any) { table = t; return query; },
          where(c: SQL) { where = c; predicates.push({ table: getTableName(table), ...dialect.sqlToQuery(c) }); return query; },
          innerJoin(t: any, condition: SQL) { joins.push({ table: t, condition }); return query; },
          leftJoin(t: any, condition: SQL) { joins.push({ table: t, condition, left: true }); return query; },
          orderBy(...order: SQL[]) { descending = order.some(o => dialect.sqlToQuery(o).sql.includes("desc")); return query; },
          limit(n: number) { limit = n; return query; },
          for(mode: string) { if (mode !== "update") throw new Error("Unexpected lock"); lock = true; return query; },
          async then(resolve: any, reject: any) {
            try {
              const name = getTableName(table);
              if (name === "courses") {
                courseReads++;
                courseWaiters.filter(waiter => waiter.count <= courseReads).forEach(waiter => waiter.done());
              }
              if (lock && name === "courses") {
                if (!transaction) throw new Error("Lock outside transaction");
                events.push("course-lock-wait");
                const before = tail; tail = new Promise<void>(done => { release = done; });
                await before; local = structuredClone(state); events.push("course-lock");
              } else if (lock) events.push("request-lock");
              events.push(`read:${name}`);
              let result = (rows()[name] || []).map(row => ({ [name]: row }));
              for (const join of joins) {
                const joined = getTableName(join.table);
                result = result.flatMap(row => {
                  const matching = (rows()[joined] || []).map(item => ({ ...row, [joined]: item }))
                    .filter(item => matches(item, join.condition));
                  return matching.length || !join.left ? matching : [{ ...row, [joined]: {} }];
                });
              }
              result = result.filter(row => matches(row, where));
              if (selection?.count && dialect.sqlToQuery(selection.count).sql === "count(*)") {
                resolve([{ count: result.length }]); return;
              }
              if (descending) result.sort((a, b) => (b[name].round || 0) - (a[name].round || 0));
              resolve(result.slice(0, limit).map(row => project(row, selection)));
            } catch (error) { reject(error); }
          },
        };
        return query;
      },
      update(table: any) {
        const name = getTableName(table);
        return { set: (changes: Row) => ({ where: (condition: SQL) => ({
          async returning() {
            events.push(`write:${name}`);
            predicates.push({ table: name, ...dialect.sqlToQuery(condition) });
            if (failClaim === name) return [];
            const changed = (rows()[name] || []).filter(row => matches({ [name]: row }, condition));
            changed.forEach(row => Object.assign(row, changes));
            return changed.map(row => ({ id: row.id }));
          },
        }) }) };
      },
      delete(table: any) {
        const name = getTableName(table);
        return { where: (condition: SQL) => {
          const run = () => {
            events.push(`write:${name}`);
            const removed = (rows()[name] || []).filter(row => matches({ [name]: row }, condition));
            rows()[name] = rows()[name].filter(row => !removed.includes(row));
            return removed;
          };
          return { returning: async () => run(), then: (resolve: any) => resolve(run()) };
        } };
      },
      insert(table: any) {
        const name = getTableName(table);
        return { values: (input: Row | Row[]) => {
          const run = () => {
            events.push(`write:${name}`);
            const inserted = (Array.isArray(input) ? input : [input]).map(item => ({
              id: (rows()[name] || []).length + 100, ...item,
            }));
            for (const item of inserted) {
              const existing = rows()[name]?.find(row => name === "publication_review_criteria" &&
                row.requestId === item.requestId && row.criterionId === item.criterionId);
              if (existing) Object.assign(existing, item);
              else (rows()[name] ||= []).push(item);
            }
            return inserted;
          };
          return { returning: async () => run(), then: (resolve: any) => resolve(run()),
            onConflictDoUpdate: async () => run(), onConflictDoNothing: async () => run() };
        } };
      },
    };
    return { api, commit() { if (local) Object.assign(state, local); events.push("commit"); release?.(); },
      rollback() { events.push("rollback"); release?.(); } };
  }
  const direct = connection(false).api;
  const store = { ...direct, async transaction(work: (tx: any) => Promise<any>) {
    const tx = connection(true);
    try { const result = await work(tx.api); tx.commit(); return result; }
    catch (error) { tx.rollback(); throw error; }
  } };
  return { state, store, events, predicates, failClaim: (table: string | null) => { failClaim = table; },
    whenCourseReads: (count: number) => courseReads >= count ? Promise.resolve()
      : new Promise<void>(done => { courseWaiters.push({ count, done }); }) };
}
