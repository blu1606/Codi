import * as wt from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const maxWorkers = 4;
let activeWorkers = 0;

// Production budget for one runner call. Cold worker startup on dev can exceed 10s (issue #250).
// Every run lease in apps/web must outlast the whole call plus the database work that follows it,
// so the lease is derived from these values instead of being maintained separately.
const productionInitTimeoutMs = 25000;
const maxExecutionMs = 3000;
const watchdogMarginMs = 1500;
export const RUN_FINALIZATION_MARGIN_MS = 5000;
export const RUN_LEASE_MS =
  productionInitTimeoutMs +
  maxExecutionMs +
  watchdogMarginMs +
  RUN_FINALIZATION_MARGIN_MS;

function findWorkerFilePath() {
  try {
    const filename = fileURLToPath(import.meta.url);
    const p = path.join(path.dirname(filename), "worker.mjs");
    if (fs.existsSync(p)) return p;
  } catch {}

  let cur = process.cwd();
  while (cur && cur !== path.dirname(cur)) {
    const candidate = path.join(cur, "packages/coding-runner/worker.mjs");
    if (fs.existsSync(candidate)) return candidate;
    cur = path.dirname(cur);
  }

  return path.resolve(process.cwd(), "packages/coding-runner/worker.mjs");
}

const workerFilePath = findWorkerFilePath();

function createWorkerThread(filePath, options) {
  // Use Reflect.construct to prevent Next.js / Turbopack bundler from hijacking new Worker
  const WorkerClass = wt.Worker;
  return Reflect.construct(WorkerClass, [filePath, options]);
}

// The worker only hosts the WebAssembly interpreter. Learner code never executes in Node.
export function runJavaScript(input) {
  if (
    typeof input.code !== "string" ||
    input.code.length > 65536 ||
    !input.tests.length ||
    input.tests.length > 100
  )
    return Promise.reject(new Error("Invalid sandbox input"));
  const timeoutMs = Math.min(
    maxExecutionMs,
    Math.max(25, input.timeoutMs ?? maxExecutionMs),
  );
  if (activeWorkers >= maxWorkers)
    return Promise.reject(new Error("Sandbox busy"));
  activeWorkers++;
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = createWorkerThread(workerFilePath, {
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
    const initTimeoutMs =
      process.env.NODE_ENV === "test" ? 10000 : productionInitTimeoutMs;
    let timer = setTimeout(
      () => finish(new Error("Sandbox initialization timeout")),
      initTimeoutMs,
    );
    worker.on("message", (message) => {
      if (message.type === "ready") {
        clearTimeout(timer);
        timer = setTimeout(
          () => finish(new Error("Sandbox watchdog timeout")),
          timeoutMs + watchdogMarginMs,
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
