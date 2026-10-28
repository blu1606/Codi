import { Worker } from "node:worker_threads";

const maxWorkers = 4;
let activeWorkers = 0;

// The worker only hosts the WebAssembly interpreter. Learner code never executes in Node.
export function runJavaScript(input) {
  if (
    typeof input.code !== "string" ||
    input.code.length > 65536 ||
    !input.tests.length ||
    input.tests.length > 100
  )
    return Promise.reject(new Error("Invalid sandbox input"));
  const timeoutMs = Math.min(3000, Math.max(25, input.timeoutMs ?? 3000));
  if (activeWorkers >= maxWorkers)
    return Promise.reject(new Error("Sandbox busy"));
  activeWorkers++;
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./worker.mjs", import.meta.url), {
        // Samples always precede hidden tests so hidden timeouts cannot affect public outcomes.
        workerData: {
          ...input,
          tests: [...input.tests].sort(
            (a, b) => Number(b.isSample) - Number(a.isSample),
          ),
          timeoutMs,
        },
        execArgv: [],
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      });
    } catch (err) {
      console.error("[coding-runner] Worker initialization failed:", err);
      activeWorkers--;
      reject(new Error("Sandbox unavailable"));
      return;
    }
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Keep the slot until the worker has actually stopped.
      void worker.terminate().catch(() => {});
      if (error) {
        console.error("[coding-runner] Sandbox execution failed:", error);
        reject(new Error("Sandbox unavailable"));
      } else resolve(result);
    };
    // Cold initialization and wall-clock watchdog failures are infrastructure errors,
    // never graded submissions. Only QuickJS guest interrupts produce graded timeouts.
    const initTimeoutMs = process.env.NODE_ENV === "test" ? 10000 : 25000;
    let timer = setTimeout(
      () => finish(new Error("Sandbox initialization timeout")),
      initTimeoutMs,
    );
    worker.on("message", (message) => {
      if (message.type === "ready") {
        clearTimeout(timer);
        timer = setTimeout(
          () => finish(new Error("Sandbox watchdog timeout")),
          timeoutMs + 1500,
        );
        worker.postMessage({ type: "start" });
      } else if (message.type === "result") finish(null, message.result);
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", () => {
      activeWorkers--;
      if (!settled) finish(new Error("Worker exited"));
    });
  });
}
