import { parentPort, workerData } from "node:worker_threads";
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const started = Date.now();
const deadline = started + workerData.timeoutMs;
const logs = [];
const outcomes = [];
let phase = "done";
for (const test of workerData.tests) {
  if (Date.now() >= deadline) {
    phase = "timeout";
    outcomes.push({
      id: test.id,
      actual: null,
      phase: "timeout",
      error: "Quá thời gian chạy (3 giây).",
      line: null,
    });
    continue;
  }
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const vm = runtime.newContext();
  // Capture intrinsics before user code can replace them. All traversal stays inside WASM,
  // with depth/size limits; never dump arbitrary guest objects into the host heap.
  const serializer = vm.unwrapResult(
    vm.evalCode(`(() => {
    const keys = Object.keys, stringify = JSON.stringify, str = String, create = Object.create;
    const sort = Function.prototype.call.bind(Array.prototype.sort);
    const array = Array.isArray, finite = Number.isFinite;
    function normalize(v, depth = 0) {
      if (depth > 12) throw new Error('Kết quả lồng quá sâu.');
      if (v === undefined) return '[undefined]';
      if (typeof v === 'function') return '[Function]';
      if (typeof v === 'bigint') return str(v) + 'n';
      if (typeof v === 'number' && !finite(v)) return str(v);
      if (v !== null && typeof v === 'object') {
        const ks = sort(keys(v));
        if (ks.length > 1000) throw new Error('Kết quả quá lớn.');
        const out = array(v) ? [] : create(null);
        for (const k of ks) out[k] = normalize(v[k], depth + 1);
        return out;
      }
      return v;
    }
    return v => {
      const result = stringify(normalize(v));
      if (result.length > 4096) throw new Error('Kết quả vượt quá 4096 ký tự.');
      return result;
    };
  })()`),
  );
  // Only learner execution is interruptible; interrupting trusted bootstrap can leave
  // no serializer available to report the result. The outer worker deadline covers it.
  runtime.setInterruptHandler(() => Date.now() >= deadline);
  function serialize(handle) {
    const result = vm.callFunction(serializer, vm.undefined, handle);
    if (result.error) {
      result.error.dispose();
      throw new Error("Không thể đọc kết quả hoặc kết quả quá lớn.");
    }
    return result.value.consume((h) => vm.getString(h));
  }
  const consoleHandle = vm.newObject();
  for (const name of ["log", "info", "warn", "error"]) {
    const fn = vm.newFunction(name, (...args) => {
      if (test.isSample && logs.length < 30) {
        try {
          logs.push(args.slice(0, 8).map(serialize).join(" ").slice(0, 4096));
        } catch {
          logs.push("[Không thể hiển thị dòng console]");
        }
      }
    });
    vm.setProp(consoleHandle, name, fn);
    fn.dispose();
  }
  vm.setProp(vm.global, "console", consoleHandle);
  consoleHandle.dispose();
  let actual = null,
    error = null,
    line = null,
    testPhase = "done";
  try {
    const evaluate = (code, filename, startup) => {
      const result = vm.evalCode(code, filename, { type: "global" });
      if (result.error) {
        testPhase = Date.now() >= deadline ? "timeout" : "runtime";
        if (testPhase === "timeout") {
          error = "Quá thời gian chạy (3 giây).";
          result.error.dispose();
          return null;
        }
        try {
          const name = vm
            .getProp(result.error, "name")
            .consume((h) => vm.getString(h));
          const message = vm.getProp(result.error, "message");
          try {
            error = serialize(message).slice(0, 2000);
          } finally {
            message.dispose();
          }
          if (startup && name === "SyntaxError") testPhase = "syntax";
          const stackHandle = vm.getProp(result.error, "stack");
          let stack;
          try {
            stack = serialize(stackHandle);
          } finally {
            stackHandle.dispose();
          }
          const match = /bai-lam\.js:(\d+)/.exec(stack);
          line = match ? Number(match[1]) : null;
        } catch {
          error = "Không thể chạy code hoặc vượt giới hạn bộ nhớ.";
        }
        result.error.dispose();
        return null;
      }
      return result.value;
    };
    const initialized = evaluate(workerData.code, "bai-lam.js", true);
    if (initialized) {
      initialized.dispose();
      const value = evaluate(test.input || "undefined", "test.js", false);
      if (value) {
        try {
          actual = serialize(value);
        } finally {
          value.dispose();
        }
      }
    }
  } catch {
    testPhase = Date.now() >= deadline ? "timeout" : "runtime";
    error = "Không thể đọc kết quả hoặc kết quả quá lớn.";
  } finally {
    serializer.dispose();
    vm.dispose();
    runtime.dispose();
  }
  if (testPhase !== "done" && phase === "done") phase = testPhase;
  outcomes.push({ id: test.id, actual, phase: testPhase, error, line });
}
parentPort.postMessage({
  phase,
  durationMs: Date.now() - started,
  logs,
  outcomes,
});
