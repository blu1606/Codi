import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Evaluate only the real insert payload, never the scripts' DB/browser entrypoints.
function submissionRows(file: string, revision: number) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const payloads: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "values" &&
      ts.isCallExpression(node.expression.expression)
    ) {
      const insert = node.expression.expression;
      if (
        ts.isPropertyAccessExpression(insert.expression) &&
        insert.expression.name.text === "insert" &&
        insert.arguments[0]?.getText(source) === "assessmentSubmissions" &&
        node.arguments[0] &&
        ts.isArrayLiteralExpression(node.arguments[0])
      )
        payloads.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(payloads).toHaveLength(1);
  const f = {
    quizId: 10,
    assignmentId: 20,
    questions: [{ id: 100, quizRevision: revision }],
  };
  const before = structuredClone(f);
  const common = { enrollmentId: 1, status: "graded", attempt: 1 };
  const javascript = ts.transpileModule(
    `(${payloads[0]!.getText(source)})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const rows = runInNewContext(javascript, {
    f,
    submitted: common,
    common,
    coding: { codingId: 30 },
    otherEnrollment: { id: 2 },
  }) as { assessmentId: number; quizRevision?: number }[];
  expect(f).toEqual(before);
  return rows;
}

describe.each([
  ["./verify-learner-overview.ts", 2, 4],
  ["./verify-learner-overview-browser.ts", 1, 2],
] as const)("overview verifier revision payload: %s", (file, quizzes, others) => {
  it.each([7, 11])("pins every quiz to selected fixture revision %i", (revision) => {
    const rows = submissionRows(file, revision).filter(
      (row) => row.assessmentId === 10,
    );
    expect(rows).toHaveLength(quizzes);
    expect(rows.map((row) => row.quizRevision)).toEqual(
      Array(quizzes).fill(revision),
    );
  });

  it("leaves coding and assignment revision pins null by schema default", () => {
    const rows = submissionRows(file, 7).filter((row) => row.assessmentId !== 10);
    expect(rows).toHaveLength(others);
    expect(rows.every((row) => row.quizRevision == null)).toBe(true);
  });
});
