import { describe, expect, it } from "vitest";
import type { Database } from "@codi-1/db";
import { generalTools, lessonTools } from "./ai-chat-service";
import type { TutorScope } from "./ai-tutor-service";

// The tool sets are gated before any query runs, so a database that throws proves nothing was read.
const db = new Proxy({}, {
  get: () => {
    throw new Error("no database access expected");
  },
}) as Database;
const scope: TutorScope = {
  userId: "u1",
  courseId: "js",
  lessonId: "7b0c5b0e-3b8f-4c2e-9a35-2f6f3c1d2e4a",
  enrollmentId: 1,
  lesson: {
    title: "Hàm",
    chapterTitle: null,
    description: null,
    body: null,
    materials: [],
    isCode: true,
  },
  instructorId: null,
  lecturerName: null,
};
const code = "function sum(a, b) {\n  const total = a - b;\n  return total;\n}";
const run = (tool: unknown, input: unknown) =>
  (tool as { execute: (input: unknown, options: unknown) => Promise<unknown> }).execute(input, {
    toolCallId: "t1",
    messages: [],
  });

describe("lesson tools (S11a)", () => {
  it("a suggested change exists only at hint step 3 with the learner's code (G9)", () => {
    expect(Object.keys(lessonTools(db, scope, { code, hintLevel: null }))).toEqual([
      "search_course_material",
      "get_my_progress",
    ]);
    expect(lessonTools(db, scope, { code, hintLevel: 2 })).not.toHaveProperty("suggest_code_change");
    expect(lessonTools(db, scope, { code: "", hintLevel: 3 })).not.toHaveProperty("suggest_code_change");
    expect(lessonTools(db, scope, { code, hintLevel: 3 })).toHaveProperty("suggest_code_change");
  });
  it("keeps a small insertion and refuses anything larger or off the code", async () => {
    const tools: Record<string, unknown> = lessonTools(db, scope, { code, hintLevel: 3 });
    expect(await run(tools.suggest_code_change, { at: 3, add: ["  console.log(total);"] })).toEqual({
      ok: true,
      diff: { at: 3, add: ["  console.log(total);"], context: "  return total;", state: null },
    });
    expect(await run(tools.suggest_code_change, { at: 99, add: ["x"] })).toMatchObject({ ok: false });
  });
  it("searching with no usable words returns nothing without querying", async () => {
    const tools = lessonTools(db, scope, { code, hintLevel: null });
    expect(await run(tools.search_course_material, { query: "?!" })).toEqual({ hits: [] });
  });
});

describe("general tools (S17)", () => {
  it("guests get the catalogue only; a signed-in learner also gets their own learning", () => {
    expect(Object.keys(generalTools(db, null))).toEqual(["search_courses", "compare_courses"]);
    expect(Object.keys(generalTools(db, "u1"))).toContain("get_my_learning");
  });
});
