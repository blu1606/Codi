import { describe, expect, it } from "vitest";
import { runJavaScript } from "@codi-1/coding-runner";
import {
  canonical,
  codingCommand,
  gradeCoding,
  requireCodingTests,
  requireSolution,
} from "./coding-contract";

const tests = [
  {
    id: 1,
    name: "mẫu",
    input: "sumEven([1,2,3,4])",
    expectedOutput: "6",
    isSample: true,
  },
  {
    id: 2,
    name: "ẩn",
    input: "sumEven([-4,-3,-2])",
    expectedOutput: "-6",
    isSample: false,
  },
];
describe("JavaScript WebAssembly sandbox", () => {
  it("executes real JavaScript and excludes hidden console", async () => {
    const result = await runJavaScript({
      code: "function sumEven(xs) { console.log(xs); return xs.filter(x => x % 2 === 0).reduce((a,b) => a+b,0); }",
      tests,
    });
    expect(result.phase).toBe("done");
    expect(gradeCoding(tests, result, 100)).toMatchObject({
      score: 100,
      isPassed: true,
    });
    expect(result.logs.join(" ")).toContain("[1,2,3,4]");
    expect(result.logs.join(" ")).not.toContain("-4");
  });
  it("reports syntax errors", async () => {
    const r = await runJavaScript({ code: "function sumEven( {", tests });
    expect(r.phase).toBe("syntax");
    expect(gradeCoding(tests, r, 100).isPassed).toBe(false);
  });
  it("reports runtime errors with a source line", async () => {
    const r = await runJavaScript({
      code: "function sumEven(xs) {\n throw new Error('test error');\n}",
      tests,
    });
    expect(r.phase).toBe("runtime");
    expect(r.outcomes[0]?.line).toBe(2);
  });
  it("preserves the original error when its stack cannot be serialized", async () => {
    const r = await runJavaScript({
      code: "function sumEven() { const e = new Error('original error'); e.stack = 'x'.repeat(5000); throw e; }",
      tests,
    });
    expect(r.outcomes[0]?.error).toContain("original error");
  });
  it("explicitly rejects unsupported Promise results", async () => {
    const r = await runJavaScript({
      code: "async function sumEven() { return 6; }",
      tests,
    });
    expect(r.outcomes[0]?.phase).toBe("runtime");
    expect(r.outcomes[0]?.error).toContain("Async/Promise");
    expect(r.outcomes[0]?.actual).toBeNull();
  });
  it("runs samples before hidden tests so a hidden timeout cannot contaminate sample results", async () => {
    const r = await runJavaScript({
      code: "",
      timeoutMs: 200,
      tests: [
        { id: 2, input: "while(true) {}", isSample: false },
        { id: 1, input: "42", isSample: true },
      ],
    });
    expect(r.outcomes[0]).toMatchObject({ id: 1, phase: "done", actual: "42" });
    expect(r.outcomes[1]).toMatchObject({ id: 2, phase: "timeout" });
  });
  it("interrupts an infinite loop and accounts for every test", async () => {
    const r = await runJavaScript({
      code: "while(true) {}",
      tests,
      timeoutMs: 50,
    });
    expect(r.phase).toBe("timeout");
    expect(r.outcomes).toHaveLength(2);
    expect(r.outcomes.every((o) => o.phase === "timeout")).toBe(true);
  });
  it("does not expose host Node, filesystem, network or environment", async () => {
    const r = await runJavaScript({
      code: "",
      tests: [
        {
          id: 1,
          input:
            "[typeof process, typeof require, typeof fetch, typeof global, typeof WebAssembly]",
          isSample: true,
        },
      ],
    });
    expect(r.outcomes[0]?.actual).toBe(
      '["undefined","undefined","undefined","undefined","undefined"]',
    );
  });
  it("isolates globals between tests", async () => {
    const r = await runJavaScript({
      code: "let count = 0;",
      tests: [1, 2].map((id) => ({ id, input: "++count", isSample: true })),
    });
    expect(r.outcomes.map((o) => o.actual)).toEqual(["1", "1"]);
  });
  it("canonicalizes object keys and nested arrays", async () => {
    const obj = { z: [3, 1], a: { Z: 1, a: true } };
    const r = await runJavaScript({
      code: "",
      tests: [{ id: 1, input: "({z:[3,1],a:{a:true,Z:1}})", isSample: true }],
    });
    expect(r.outcomes[0]?.actual).toBe(canonical(obj));
  });
  it("bounds console and return values", async () => {
    const r = await runJavaScript({
      code: "for(let i=0;i<100;i++) console.log(i)",
      tests: [{ id: 1, input: "'a'.repeat(5000)", isSample: true }],
    });
    expect(r.logs).toHaveLength(30);
    expect(r.outcomes[0]?.phase).toBe("runtime");
  });
});
describe("coding guards and automatic grading", () => {
  it("grades the share of tests, including hidden failures", () => {
    const r = {
      phase: "done" as const,
      durationMs: 1,
      logs: [],
      outcomes: [
        { id: 1, actual: "6", phase: "done" as const, error: null, line: null },
        { id: 2, actual: "0", phase: "done" as const, error: null, line: null },
      ],
    };
    expect(gradeCoding(tests, r, 10)).toMatchObject({
      score: 5,
      percent: 50,
      isPassed: false,
    });
  });
  it("rejects invalid test configuration", () => {
    expect(() => requireCodingTests([])).toThrow();
    expect(() =>
      requireCodingTests(tests.filter((t) => !t.isSample)),
    ).toThrow();
    expect(() =>
      requireCodingTests([{ ...tests[0]!, expectedOutput: "bad json" }]),
    ).toThrow();
  });
  it("requires confirmation for reset/solution and bounds submitted source", () => {
    expect(codingCommand.safeParse({ type: "reset" }).success).toBe(false);
    expect(
      codingCommand.safeParse({ type: "solution", confirmed: false }).success,
    ).toBe(false);
    expect(
      codingCommand.safeParse({ type: "submit", code: "x".repeat(65537) })
        .success,
    ).toBe(false);
    expect(
      codingCommand.safeParse({ type: "run", code: "", score: 100 }).success,
    ).toBe(false);
  });
  it("locks unverified solutions until pass or three failed submits", () => {
    expect(() => requireSolution(false, 2, true)).toThrow();
    expect(() => requireSolution(true, 0, false)).toThrow();
    expect(() => requireSolution(false, 3, true)).not.toThrow();
    expect(() => requireSolution(true, 0, true)).not.toThrow();
  });
});
