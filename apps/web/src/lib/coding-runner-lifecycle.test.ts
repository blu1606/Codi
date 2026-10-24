import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
const { workers, failConstruction } = vi.hoisted(() => ({
  workers: [] as any[],
  failConstruction: { value: false },
}));
vi.mock("node:worker_threads", () => ({
  Worker: class extends EventEmitter {
    postMessage = vi.fn();
    terminate = vi.fn(async () => {
      this.emit("exit", 0);
      return 0;
    });
    constructor(..._args: unknown[]) {
      super();
      if (failConstruction.value) throw new Error("cannot start worker");
      workers.push(this);
    }
  },
}));
import { runJavaScript } from "@codi-1/coding-runner";
const input = {
  code: "",
  tests: [{ id: 1, input: "1", isSample: true }],
  timeoutMs: 25,
};
afterEach(() => {
  workers.length = 0;
  failConstruction.value = false;
  vi.useRealTimers();
});
describe("sandbox lifecycle and admission", () => {
  it("rejects cold initialization timeout as unavailable rather than a failed test", async () => {
    vi.useFakeTimers();
    const p = runJavaScript(input);
    const rejected = expect(p).rejects.toThrow("Sandbox unavailable");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("starts the execution watchdog only after WASM is ready and never grades watchdog expiry", async () => {
    vi.useFakeTimers();
    const p = runJavaScript(input);
    const rejected = expect(p).rejects.toThrow("Sandbox unavailable");
    await vi.advanceTimersByTimeAsync(9000);
    workers[0].emit("message", { type: "ready" });
    expect(workers[0].postMessage).toHaveBeenCalledWith({ type: "start" });
    await vi.advanceTimersByTimeAsync(1525);
    await rejected;
  });
  it("accepts a guest timeout returned by the interpreter as a graded result", async () => {
    const p = runJavaScript(input);
    workers[0].emit("message", { type: "ready" });
    const result = { phase: "timeout", durationMs: 25, logs: [], outcomes: [] };
    workers[0].emit("message", { type: "result", result });
    await expect(p).resolves.toEqual(result);
  });
  it("admits at most four workers and frees slots when they exit", async () => {
    const pending = Array.from({ length: 4 }, () => runJavaScript(input));
    await expect(runJavaScript(input)).rejects.toThrow("Sandbox busy");
    for (const w of workers)
      w.emit("message", { type: "result", result: { phase: "done" } });
    await Promise.all(pending);
    const next = runJavaScript(input);
    workers
      .at(-1)
      .emit("message", { type: "result", result: { phase: "done" } });
    await expect(next).resolves.toMatchObject({ phase: "done" });
  });
  it("releases admission slots when construction or execution fails", async () => {
    failConstruction.value = true;
    for (let i = 0; i < 5; i++)
      await expect(runJavaScript(input)).rejects.toThrow("Sandbox unavailable");
    failConstruction.value = false;
    const p = runJavaScript(input);
    const rejected = expect(p).rejects.toThrow("Sandbox unavailable");
    workers[0].emit("error", new Error("WASM unavailable"));
    await rejected;
  });
});
