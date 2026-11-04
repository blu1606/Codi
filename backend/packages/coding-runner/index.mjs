import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const maxWorkers = 4;
let activeWorkers = 0;

// Production budget for one runner call. A cold sandbox process (Node start + WebAssembly load) can be slow on a busy
// host, so initialization has its own budget. Every run lease must outlast the whole call plus the database work that
// follows it, so the lease is derived from these values instead of being maintained separately.
const productionInitTimeoutMs = 25000;
const maxExecutionMs = 3000;
const watchdogMarginMs = 1500;
export const RUN_FINALIZATION_MARGIN_MS = 5000;
export const RUN_LEASE_MS =
  productionInitTimeoutMs +
  maxExecutionMs +
  watchdogMarginMs +
  RUN_FINALIZATION_MARGIN_MS;

// The result line is bounded by the worker (30 logs x 4 KiB, 100 outcomes x 6 KiB); more output means misbehaviour.
const maxStdoutBytes = 2 * 1024 * 1024;
const maxStderrBytes = 8 * 1024;
const sandboxHeapMb = 128;

function findWorkerFilePath() {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.mjs");
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

/** The node_modules directory that holds quickjs-emscripten and its WebAssembly variants (the sandbox may read it). */
function findQuickJsModulesDir() {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.resolve("quickjs-emscripten")));
    while (path.basename(dir) !== "node_modules") {
      const up = path.dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
    return dir;
  } catch {
    return null;
  }
}

const workerFilePath = findWorkerFilePath();
const quickJsModulesDir = findQuickJsModulesDir();
const permissionFlag = process.allowedNodeEnvironmentFlags.has("--permission")
  ? "--permission"
  : "--experimental-permission";

function sandboxArgs() {
  const readable = [path.dirname(workerFilePath), quickJsModulesDir].filter(Boolean);
  return [
    `--max-old-space-size=${sandboxHeapMb}`,
    "--max-semi-space-size=16",
    permissionFlag,
    ...readable.map((dir) => `--allow-fs-read=${dir}`),
    "--disable-warning=ExperimentalWarning",
    workerFilePath,
  ];
}

// No secrets reach the sandbox: it starts from an empty environment (Windows needs SystemRoot to start a process).
function sandboxEnv() {
  return process.platform === "win32" && process.env.SystemRoot
    ? { SystemRoot: process.env.SystemRoot }
    : {};
}

/**
 * Runs learner JavaScript (or TypeScript, after type erasure) against the given tests in a separate, short-lived
 * Node process that hosts the QuickJS WebAssembly interpreter. Learner code never executes in the API process or in
 * Node itself. Rejects with an infrastructure error (never a graded result) when the sandbox cannot start, crashes,
 * exceeds its output cap or misses the wall-clock watchdog.
 */
export function runJavaScript(input) {
  if (
    typeof input.code !== "string" ||
    input.code.length > 65536 ||
    !Array.isArray(input.tests) ||
    !input.tests.length ||
    input.tests.length > 100 ||
    (input.language !== undefined &&
      input.language !== "javascript" &&
      input.language !== "typescript")
  )
    return Promise.reject(new Error("Invalid sandbox input"));
  const timeoutMs = Math.min(
    maxExecutionMs,
    Math.max(25, input.timeoutMs ?? maxExecutionMs),
  );
  if (activeWorkers >= maxWorkers)
    return Promise.reject(new Error("Sandbox busy"));
  activeWorkers++;
  // Samples always precede hidden tests so hidden timeouts cannot affect public outcomes.
  const payload = JSON.stringify({
    code: input.code,
    language: input.language ?? "javascript",
    tests: [...input.tests]
      .sort((a, b) => Number(b.isSample) - Number(a.isSample))
      .map((t) => ({ id: t.id, input: t.input ?? null, isSample: !!t.isSample })),
    timeoutMs,
  });
  return execute(payload, timeoutMs).finally(() => {
    activeWorkers--;
  });
}

async function execute(payload, timeoutMs) {
  let workDir;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), "codi-run-"));
  } catch (err) {
    console.error("[coding-runner] Sandbox directory failed:", err);
    throw new Error("Sandbox unavailable");
  }
  try {
    return await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(process.execPath, sandboxArgs(), {
          cwd: workDir,
          env: sandboxEnv(),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          shell: false,
        });
      } catch (err) {
        console.error("[coding-runner] Sandbox start failed:", err);
        reject(new Error("Sandbox unavailable"));
        return;
      }
      let settled = false;
      let stdout = "";
      let stdoutBytes = 0;
      let stderr = "";
      let result = null;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        if (error) {
          console.error(
            "[coding-runner] Sandbox execution failed:",
            error.message,
            stderr ? `stderr: ${stderr.slice(0, 2000)}` : "",
          );
          reject(new Error("Sandbox unavailable"));
        } else resolve(result);
      };
      // Cold start and wall-clock watchdog failures are infrastructure errors, never graded submissions.
      // Only QuickJS guest interrupts produce graded timeouts.
      const initTimeoutMs =
        process.env.NODE_ENV === "test" ? 10000 : productionInitTimeoutMs;
      let timer = setTimeout(
        () => finish(new Error("Sandbox initialization timeout")),
        initTimeoutMs,
      );
      const onLine = (line) => {
        if (!line.trim()) return;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(new Error("Sandbox protocol error"));
          return;
        }
        if (message.type === "ready") {
          clearTimeout(timer);
          timer = setTimeout(
            () => finish(new Error("Sandbox watchdog timeout")),
            timeoutMs + watchdogMarginMs,
          );
        } else if (message.type === "result" && message.result) {
          result = message.result;
          finish(null);
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes > maxStdoutBytes) {
          finish(new Error("Sandbox output limit exceeded"));
          return;
        }
        stdout += chunk;
        let nl;
        while (!settled && (nl = stdout.indexOf("\n")) >= 0) {
          const line = stdout.slice(0, nl);
          stdout = stdout.slice(nl + 1);
          onLine(line);
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < maxStderrBytes) stderr += chunk.slice(0, maxStderrBytes - stderr.length);
      });
      child.once("error", (err) => finish(err));
      child.once("exit", (code, signal) => {
        if (!settled) finish(new Error(`Sandbox exited (${signal || code}) without a result`));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(payload);
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
