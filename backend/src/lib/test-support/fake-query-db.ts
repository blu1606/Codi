// A stand-in for a Drizzle database in unit tests. Every awaited query chain (select/insert/update/delete ...)
// resolves to the next value in `results`, in order, so a test lists exactly what each query returns.
// `calls` records each chain (method names and arguments) for assertions on what was written.

export type FakeCall = { method: string; args: unknown[] }[];

export function createFakeDb(results: unknown[]) {
  const queue = [...results];
  const calls: FakeCall[] = [];

  const chain = (first: string, firstArgs: unknown[]) => {
    const steps: FakeCall = [{ method: first, args: firstArgs }];
    calls.push(steps);
    const proxy: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") {
          if (!queue.length) throw new Error(`fake db: no result queued for ${steps.map((s) => s.method).join(".")}`);
          const value = queue.shift();
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(value).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          steps.push({ method: String(prop), args });
          return proxy;
        };
      },
    });
    return proxy;
  };

  const db: any = {
    select: (...args: unknown[]) => chain("select", args),
    insert: (...args: unknown[]) => chain("insert", args),
    update: (...args: unknown[]) => chain("update", args),
    delete: (...args: unknown[]) => chain("delete", args),
    // Advisory locks return nothing useful; they do not consume a queued result.
    execute: async () => [],
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };

  /** Values passed to `.values(...)` or `.set(...)` across all chains, in call order. */
  const written = (method: "values" | "set") =>
    calls.flatMap((steps) => steps.filter((s) => s.method === method).map((s) => s.args[0] as any));

  return { db, calls, written, remaining: () => queue.length };
}
