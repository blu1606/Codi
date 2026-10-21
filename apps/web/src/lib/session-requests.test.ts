import { beforeEach, describe, expect, it, vi } from "vitest";
import * as requests from "./session-requests";

function deferred() {
  let resolve!: (value: { error: unknown }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ error: unknown }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let serial = 0;
let sessionId: string;
beforeEach(() => { sessionId = `logout-${++serial}`; });

describe("session logout ownership", () => {
  for (const failure of ["http", "network"] as const) {
    for (const order of ["failure-first", "success-first", "both-fail"] as const) {
      it(`retains other logout ownership with ${failure} failure, ${order}`, async () => {
        const first = deferred();
        const second = deferred();
        const firstResult = requests.endSession(sessionId, () => first.promise);
        const secondResult = requests.endSession(sessionId, () => second.promise);
        const error = new Error("offline");
        const httpResult = { error: { status: 500 } };
        const observedFailure = failure === "network"
          ? expect(firstResult).rejects.toBe(error)
          : expect(firstResult).resolves.toBe(httpResult);
        const fail = () => failure === "network" ? first.reject(error) : first.resolve(httpResult);

        expect(requests.canRequestForSession(sessionId)).toBe(false);
        if (order === "success-first") {
          second.resolve({ error: null });
          await secondResult;
        }
        fail();
        await observedFailure;
        expect(requests.canRequestForSession(sessionId)).toBe(false);
        if (order !== "success-first") {
          second.resolve({ error: order === "both-fail" ? { status: 500 } : null });
          await secondResult;
        }
        expect(requests.canRequestForSession(sessionId)).toBe(order === "both-fail");
        if (order === "both-fail") {
          await requests.endSession(sessionId, async () => ({ error: null }));
          expect(requests.canRequestForSession(sessionId)).toBe(false);
        }
        expect(requests.canRequestForSession(`${sessionId}-new-login`)).toBe(true);
      });
    }
  }

  it("does not release a successful session on a later failed attempt", async () => {
    await requests.endSession(sessionId, async () => ({ error: null }));
    await requests.endSession(sessionId, async () => ({ error: { status: 500 } }));
    await expect(requests.endSession(sessionId, () => { throw new Error("sync failure"); })).rejects.toThrow("sync failure");
    expect(requests.canRequestForSession(sessionId)).toBe(false);
  });

  it("releases only the failed session and notifies subscribers before sign-out", async () => {
    const other = deferred();
    const otherResult = requests.endSession("other-user", () => other.promise);
    const listener = vi.fn();
    const unsubscribe = requests.subscribeToSessionRequests(listener);
    try {
      const result = { error: { status: 500 } };
      expect(await requests.endSession(sessionId, async () => {
        expect(listener).toHaveBeenCalledTimes(1);
        expect(requests.canRequestForSession(sessionId)).toBe(false);
        return result;
      })).toBe(result);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(requests.canRequestForSession(sessionId)).toBe(true);
      expect(requests.canRequestForSession("other-user")).toBe(false);
    } finally {
      unsubscribe();
      other.resolve({ error: null });
      await otherResult;
    }
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
