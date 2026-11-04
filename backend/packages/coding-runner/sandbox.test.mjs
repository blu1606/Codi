// Run (from backend/): node --test packages/coding-runner/sandbox.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { runJavaScript } from "./index.mjs";

const one = (input) => [{ id: 1, input, isSample: true }];

test("runs code and returns the test value and console output", async () => {
  const r = await runJavaScript({
    code: "function add(a, b) { return a + b }\nconsole.log('xin chao', 2)",
    tests: one("add(1, 2)"),
  });
  assert.equal(r.phase, "done");
  assert.equal(r.outcomes[0].actual, "3");
  assert.deepEqual(r.logs, ['"xin chao" 2']);
});

test("reports a syntax error as a graded syntax phase", async () => {
  const r = await runJavaScript({ code: "function (", tests: one("1") });
  assert.equal(r.phase, "syntax");
  assert.ok(r.outcomes[0].error);
});

test("reports a runtime error with its line", async () => {
  const r = await runJavaScript({ code: "const a = 1;\nnull.x;", tests: one(null) });
  assert.equal(r.phase, "runtime");
  assert.equal(r.outcomes[0].line, 2);
  assert.ok(!r.outcomes[0].error.startsWith('"'), "error message is plain text");
});

test("stops an endless loop at the execution limit", async () => {
  const started = Date.now();
  const r = await runJavaScript({ code: "while (true) {}", tests: one(null), timeoutMs: 500 });
  assert.equal(r.phase, "timeout");
  assert.ok(Date.now() - started < 10000);
});

test("learner code has no Node host APIs", async () => {
  const probe = await runJavaScript({
    code: "",
    tests: one("[typeof process, typeof require, typeof fetch, typeof setTimeout]"),
  });
  assert.equal(probe.phase, "done");
  assert.equal(probe.outcomes[0].actual, '["undefined","undefined","undefined","undefined"]');
});

test("runs TypeScript after erasing its types", async () => {
  const r = await runJavaScript({
    code: "const n: number = 2;\nfunction twice(x: number): number { return x * 2 }",
    language: "typescript",
    tests: one("twice(n)"),
  });
  assert.equal(r.phase, "done");
  assert.equal(r.outcomes[0].actual, "4");
});

test("rejects malformed input without starting a sandbox", async () => {
  await assert.rejects(runJavaScript({ code: 1, tests: one("1") }));
  await assert.rejects(runJavaScript({ code: "", tests: [] }));
  await assert.rejects(runJavaScript({ code: "", language: "python", tests: one("1") }));
});
