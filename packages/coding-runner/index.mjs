import { Worker } from "node:worker_threads";

// The worker only hosts the WebAssembly interpreter. Learner code never executes in Node.
// A hard wall-clock deadline also covers engine initialization, native regexp and serialization.
export function runJavaScript(input) {
  if (
    typeof input.code !== "string" ||
    input.code.length > 65536 ||
    !input.tests.length ||
    input.tests.length > 100
  )
    return Promise.reject(new Error("Invalid sandbox input"));
  const timeoutMs = Math.min(3000, Math.max(25, input.timeoutMs ?? 3000));
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { ...input, timeoutMs },
      execArgv: [],
      env: {},
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 8,
        stackSizeMb: 2,
      },
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(new Error("Sandbox unavailable"));
      else resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish(null, {
          phase: "timeout",
          durationMs: Date.now() - started,
          logs: [],
          outcomes: input.tests.map((t) => ({
            id: t.id,
            actual: null,
            phase: "timeout",
            error: "Quá thời gian chạy (3 giây).",
            line: null,
          })),
        }),
      timeoutMs + 1500,
    );
    worker.once("message", (result) => finish(null, result));
    worker.once("error", (error) => finish(error));
    worker.once("exit", () => {
      if (!settled) finish(new Error("Worker exited"));
    });
  });
}
