// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodingBuilderClient } from "./coding-builder-client";

const actions = vi.hoisted(() => ({
  saveCodingExercise: vi.fn(), verifySolutionCode: vi.fn(), generateAiCodingTestCases: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
const existing = { id: 501, name: "Existing", call: "f(1)", expected: 1, expectedText: "1", isSample: true };
const suggested = { id: "draft-new", name: "New", call: "f(2)", expected: 2, expectedText: "2", isSample: true };
async function mount(tests = [existing]) {
  await act(async () => root.render(createElement(CodingBuilderClient, {
    courseId: "course", lessonId: "lesson",
    initialData: {
      course: { title: "Course" }, lesson: { title: "Lesson" }, isLocked: false,
      exercise: {
        title: "Identity", language: "javascript", instructions: ["Return input"],
        starterCode: "", solutionCode: "function f(x) { return x; }", hints: [], tests,
      },
    },
  })));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
async function edit(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  actions.saveCodingExercise.mockResolvedValue({ success: true, verifiedAt: new Date(), testIds: [501, 1000] });
  actions.generateAiCodingTestCases.mockResolvedValue({ success: true, tests: [suggested] });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("coding builder saved test identity", () => {
  it("uses canonical IDs on a same-page second save after adding a test", async () => {
    await mount();
    await click("Test case (1)");
    await click("Gợi ý test biên");
    await click("Lưu bài code");
    await click("Đề bài");
    await edit(document.querySelector("input")!, "Title only");
    await click("Lưu bài code");
    expect(actions.saveCodingExercise.mock.calls[1][2].tests.map((t: { id: number }) => t.id)).toEqual([501, 1000]);
  });

  it("reconciles a new exercise without requiring navigation or remount", async () => {
    actions.saveCodingExercise.mockResolvedValue({ success: true, testIds: [1000] });
    await mount([{ ...existing, id: 1 }]);
    await click("Lưu bài code");
    await click("Lưu bài code");
    expect(actions.saveCodingExercise.mock.calls[1][2].tests[0].id).toBe(1000);
  });

  it("merges IDs while retaining edits made during save and the dirty warning", async () => {
    const pending = Promise.withResolvers<{ success: boolean; testIds: number[] }>();
    actions.saveCodingExercise.mockReturnValueOnce(pending.promise);
    await mount();
    await click("Test case (1)");
    await click("Gợi ý test biên");
    await click("Lưu bài code");
    const input = [...document.querySelectorAll("input")].find((el) => el.value === "New")!;
    await edit(input, "Edited during save");
    await act(async () => pending.resolve({ success: true, testIds: [501, 1000] }));
    expect(input.value).toBe("Edited during save");
    expect(document.body.textContent).toContain("Bạn có thay đổi chưa lưu");
    await click("Lưu bài code");
    expect(actions.saveCodingExercise.mock.calls[1][2].tests[1]).toMatchObject({ id: 1000, name: "Edited during save" });
  });

  it("does not restore a removed test or assign a saved ID to a newly added draft", async () => {
    const pending = Promise.withResolvers<{ success: boolean; testIds: number[] }>();
    actions.saveCodingExercise.mockReturnValueOnce(pending.promise);
    await mount();
    await click("Test case (1)");
    await click("Gợi ý test biên");
    await click("Lưu bài code");
    const input = [...document.querySelectorAll("input")].find((el) => el.value === "New")!;
    const remove = input.closest('[data-slot="card"]')!.querySelector<HTMLButtonElement>('button[type="button"]:not([role="checkbox"])')!;
    await act(async () => remove.click());
    await click("Thêm test");
    await act(async () => pending.resolve({ success: true, testIds: [501, 1000] }));
    await click("Lưu bài code");
    const tests = actions.saveCodingExercise.mock.calls[1][2].tests;
    expect(tests).toHaveLength(2);
    expect(tests[0].id).toBe(501);
    expect(tests[1].id).toMatch(/^draft-/);
    expect(tests[1].id).not.toBe(1000);
  });
});
