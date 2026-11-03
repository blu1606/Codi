// Sandbox child process. index.mjs spawns it with an empty environment, a temp working directory, a V8 heap cap and
// Node's permission model (read access to this package and the QuickJS modules only; no writes, no child processes,
// no workers). Learner code never runs in Node: it is interpreted by QuickJS compiled to WebAssembly, which has no
// file, network, process or environment API. Protocol: one JSON input on stdin, then newline-delimited JSON on stdout
// ({type:"ready"} once QuickJS is loaded, then {type:"result", result}).
import * as nodeModule from "node:module";
import { getQuickJS } from "quickjs-emscripten";

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    // index.mjs caps code at 64 KiB and tests at 100; anything larger is not from the runner.
    if (size > 4 * 1024 * 1024) throw new Error("Sandbox input too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(message) {
  return new Promise((resolve) => process.stdout.write(`${JSON.stringify(message)}\n`, resolve));
}

/** TypeScript runs as JavaScript after its types are erased (positions stay the same, so line numbers still match). */
function sourceOf(input) {
  if (input.language !== "typescript") return { code: input.code, error: null };
  if (typeof nodeModule.stripTypeScriptTypes !== "function")
    return { code: null, error: "Máy chủ chưa hỗ trợ chạy TypeScript." };
  try {
    return { code: nodeModule.stripTypeScriptTypes(input.code, { mode: "strip" }), error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Không đọc được code TypeScript.";
    return { code: null, error: String(message).slice(0, 2000) };
  }
}

const input = await readInput();
const QuickJS = await getQuickJS();
await send({ type: "ready" });

const started = Date.now();
const deadline = started + input.timeoutMs;
const logs = [];
const outcomes = [];
let phase = "done";
let guestTimedOut = false;
const source = sourceOf(input);

for (const test of input.tests) {
  const testStarted = Date.now();
  if (source.error) {
    phase = "syntax";
    outcomes.push({ id: test.id, actual: null, phase: "syntax", error: source.error, line: null, durationMs: 0 });
    continue;
  }
  if (Date.now() >= deadline) {
    if (!guestTimedOut)
      throw new Error("Sandbox deadline reached outside guest execution");
    phase = "timeout";
    outcomes.push({
      id: test.id,
      actual: null,
      phase: "timeout",
      error: "Quá thời gian chạy (3 giây).",
      line: null,
      durationMs: 0,
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
    const PromiseType = Promise;
    function normalize(v, depth = 0) {
      if (depth > 12) throw new Error('Kết quả lồng quá sâu.');
      if (v === undefined) return '[undefined]';
      if (typeof v === 'function') return '[Function]';
      if (typeof v === 'bigint') return str(v) + 'n';
      if (typeof v === 'number' && !finite(v)) return str(v);
      if (v !== null && typeof v === 'object') {
        if (v instanceof PromiseType) throw new Error('Async/Promise chưa được hỗ trợ. Hãy dùng hàm đồng bộ.');
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
  // no serializer available to report the result. The parent's watchdog covers it.
  let interrupted = false;
  runtime.setInterruptHandler(() => {
    interrupted = Date.now() >= deadline;
    return interrupted;
  });
  function serialize(handle) {
    const result = vm.callFunction(serializer, vm.undefined, handle);
    if (result.error) {
      let message = "Không thể đọc kết quả hoặc kết quả quá lớn.";
      try {
        const prop = vm.getProp(result.error, "message");
        try {
          message = vm.getString(prop).slice(0, 2000);
        } finally {
          prop.dispose();
        }
      } catch {
      } finally {
        result.error.dispose();
      }
      throw new Error(message);
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
        testPhase = interrupted ? "timeout" : "runtime";
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
            // The message comes back as JSON; a string message is shown without its quotes.
            const text = serialize(message);
            let plain = text;
            try {
              const parsed = JSON.parse(text);
              if (typeof parsed === "string") plain = parsed;
            } catch {}
            error = plain.slice(0, 2000);
          } finally {
            message.dispose();
          }
          if (startup && name === "SyntaxError") testPhase = "syntax";
        } catch {
          error = "Không thể chạy code hoặc vượt giới hạn bộ nhớ.";
        }
        // A hostile/oversized stack must not overwrite the original error message.
        try {
          const stackHandle = vm.getProp(result.error, "stack");
          let stack;
          try {
            stack = serialize(stackHandle);
          } finally {
            stackHandle.dispose();
          }
          const match = /bai-lam\.js:(\d+)/.exec(stack);
          line = match ? Number(match[1]) : null;
        } catch {}
        result.error.dispose();
        return null;
      }
      return result.value;
    };
    const initialized = evaluate(source.code, "bai-lam.js", true);
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
  } catch (cause) {
    testPhase = interrupted ? "timeout" : "runtime";
    error =
      testPhase === "timeout"
        ? "Quá thời gian chạy (3 giây)."
        : cause instanceof Error
          ? cause.message
          : "Không thể đọc kết quả hoặc kết quả quá lớn.";
  } finally {
    serializer.dispose();
    vm.dispose();
    runtime.dispose();
  }
  if (testPhase !== "done" && phase === "done") phase = testPhase;
  if (interrupted) guestTimedOut = true;
  outcomes.push({
    id: test.id,
    actual,
    phase: testPhase,
    error,
    line,
    durationMs: Date.now() - testStarted,
  });
}
await send({
  type: "result",
  result: {
    phase,
    durationMs: Date.now() - started,
    logs,
    outcomes,
  },
});
process.exit(0);
