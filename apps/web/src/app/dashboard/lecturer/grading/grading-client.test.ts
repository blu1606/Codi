// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GradingQueueClient } from "./grading-queue-client";
import { SnippetsClient } from "../snippets/snippets-client";

const boundary = vi.hoisted(() => ({ save: vi.fn(), ai: vi.fn(), remove: vi.fn(), restore: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ gradeSubmission: boundary.save, getAiGradingDraft: boundary.ai }));
vi.mock("../snippets/actions", () => ({ deleteFeedbackSnippet: boundary.remove, restoreFeedbackSnippet: boundary.restore,
  createFeedbackSnippet: vi.fn(), updateFeedbackSnippet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: boundary.refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(boundary.toast, { success: vi.fn(), error: vi.fn() }) }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  boundary.save.mockResolvedValue({ success: true });
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });

const button = (text: string) => [...host.querySelectorAll("button")].find(el => el.textContent?.trim() === text)!;
const detail = (token: string, scores = { logic: 7 }) => ({ id: 10, viewToken: token, studentName: "Student",
  studentEmail: "student@example.test", courseId: "c1", courseTitle: "Course", lessonTitle: "Assignment",
  status: "graded", score: 7, maxScore: 10, feedback: "previous", history: [],
  rubric: [{ id: "logic", name: "Logic", points: 10 }], rubricScores: scores });
async function render(token: string, scores = { logic: 7 }) {
  const data: any = { courses: [], assignments: [], submissions: [], counts: { pending: 0, graded: 1 },
    currentStatus: "graded", selectedCourseId: "all", selectedAssignmentId: "all", selectedDate: "all", selectedSubmission: detail(token, scores) };
  await act(async () => root.render(createElement(GradingQueueClient, { data, snippets: [] })));
}

it("reopens persisted rubric and saves feedback without regrading; AI is unavailable", async () => {
  await render("view-a");
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("7");
  expect(host.textContent).toContain("AI chấm bài chưa khả dụng");
  expect(boundary.ai).not.toHaveBeenCalled();
  await act(async () => button("Cập nhật điểm").click());
  expect(boundary.save).toHaveBeenCalledWith(expect.objectContaining({ viewToken: "view-a", score: 7, rubricScores: { logic: 7 } }));
  expect(boundary.refresh).toHaveBeenCalled();
  await render("view-b", { logic: 8 });
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("8");
});

it("preserves dirty same-ID drafts and their viewed identity on server refresh", async () => {
  await render("view-a");
  const textarea = host.querySelector<HTMLTextAreaElement>("#feedback-input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "unsaved");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await render("view-b", { logic: 8 });
  expect(textarea.value).toBe("unsaved");
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("7");
  await act(async () => button("Cập nhật điểm").click());
  expect(boundary.save).toHaveBeenCalledWith(expect.objectContaining({ viewToken: "view-a", feedback: "unsaved" }));
});

it("deletes immediately and Undo restores the server-deleted snapshot, not stale client text", async () => {
  boundary.remove.mockResolvedValue({ success: true, deletedSnippet: { id: 2, title: "Latest", body: "new body" } });
  boundary.restore.mockResolvedValue({ success: true, snippet: { id: 3, title: "Latest", body: "new body", createdAt: "2026-10-24" } });
  await act(async () => root.render(createElement(SnippetsClient, { initialSnippets: [{ id: 2, title: "Stale", body: "old body", createdAt: "2026-10-20" }] })));
  await act(async () => button("Xoá").click());
  expect(boundary.remove).toHaveBeenCalledWith(2);
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(boundary.toast).toHaveBeenCalledWith('Đã xoá mẫu "Latest".', expect.anything());
  const options = boundary.toast.mock.calls[0]![1];
  await act(async () => options.action.onClick());
  expect(boundary.restore).toHaveBeenCalledWith({ title: "Latest", body: "new body" });
  expect(host.textContent).toContain("new body");
});
