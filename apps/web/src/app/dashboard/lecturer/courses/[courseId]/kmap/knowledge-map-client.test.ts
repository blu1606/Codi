// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findCycle, topoSortLessons } from "@/lib/knowledge-map-runner";
import type { KnowledgeMapDataDto } from "./actions";
import { KnowledgeMapClient } from "./knowledge-map-client";

const boundary = vi.hoisted(() => ({
  refresh: vi.fn(),
  acceptAllKnowledgeMap: vi.fn(),
  addKnowledgeMapEdge: vi.fn(),
  confirmKnowledgeMap: vi.fn(),
  renameKnowledgeMapConcept: vi.fn(),
  reviewKnowledgeMapItem: vi.fn(),
  runKnowledgeMapAnalysis: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));
vi.mock("./actions", () => boundary);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: boundary.error } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
async function render(data: KnowledgeMapDataDto) {
  if (!root) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(createElement(KnowledgeMapClient, { initialData: data, courseId: "owned" }));
  });
}
const button = (label: string, scope: ParentNode = document) => {
  const result = [...scope.querySelectorAll("button")].find((el) => el.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
};
async function click(label: string, scope?: ParentNode) {
  await act(async () => button(label, scope).click());
}
const confirm = () => button("Xác nhận bản đồ kiến thức");
const hasCycle = () => document.body.textContent!.includes("Phát hiện vòng lặp phụ thuộc");
const order = () => [...document.querySelectorAll("ol li")].map((li) => li.textContent);
async function select(label: string, value: string) {
  const field = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function addEdge(from: string, to: string) {
  await select("Khái niệm học trước", from);
  await select("Khái niệm học sau", to);
  await act(async () => {
    button("Thêm quan hệ").closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
function edgeRow(from: string, to: string) {
  const start = [...document.querySelectorAll("strong")].find(
    (el) => el.textContent === from && el.parentElement?.querySelectorAll("strong")[1]?.textContent === to,
  );
  if (!start) throw new Error(`Missing edge: ${from} -> ${to}`);
  return start.parentElement!.parentElement!;
}
function snapshot(edges: KnowledgeMapDataDto["edges"] = []): KnowledgeMapDataDto {
  const concepts: KnowledgeMapDataDto["concepts"] = [1, 2].map((id) => ({
    id, name: id === 1 ? "Arrays" : "Trees", description: null,
    source: "ai", review: "accepted", lessonIds: [`lesson-${id}`],
  }));
  const lessons = [1, 2].map((id) => ({ id: `lesson-${id}`, title: `Lesson ${id}`, chapterId: `chapter-${id}` }));
  return {
    course: { id: "owned", title: "Structures", status: "draft", knowledgeMapStatus: "ready", knowledgeMapGeneratedAt: null },
    isLocked: false, concepts, edges, lessons,
    chapters: [1, 2].map((id) => ({ id: `chapter-${id}`, title: `Chapter ${id}` })),
    cycle: findCycle([1, 2], edges.filter((edge) => edge.review !== "declined")),
    defaultOrder: topoSortLessons(concepts, edges, lessons),
  };
}
const edge = (from: number, to: number): KnowledgeMapDataDto["edges"][number] => ({ from, to, source: "lecturer", review: "accepted" });

beforeEach(() => {
  vi.resetAllMocks();
  boundary.acceptAllKnowledgeMap.mockResolvedValue({ success: true, acceptedConceptsCount: 2, acceptedEdgesCount: 0, skippedEdgesCount: 0 });
  boundary.runKnowledgeMapAnalysis.mockResolvedValue({ success: true, count: 2 });
  boundary.addKnowledgeMapEdge.mockResolvedValue({ success: true });
  boundary.reviewKnowledgeMapItem.mockResolvedValue({ success: true });
  boundary.renameKnowledgeMapConcept.mockResolvedValue({ success: true });
  boundary.confirmKnowledgeMap.mockResolvedValue({ success: true });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("knowledge map client saved graph state", () => {
  it("starts a background analysis only when configured", async () => {
    const data = snapshot();
    data.course.analysisAvailable = true;
    await render(data);
    await click("Phân tích bản đồ kiến thức");
    expect(boundary.runKnowledgeMapAnalysis).toHaveBeenCalledWith("owned");
    expect(document.body.textContent).toContain("Đang phân tích nội dung");
  });
  it("explains legacy reconfirmation and clears the notice only after confirmation succeeds", async () => {
    const legacy = snapshot();
    legacy.concepts = legacy.concepts.map((concept) => ({ ...concept, review: "accepted" }));
    legacy.course.requiresReconfirmation = true;
    await render(legacy);
    expect(document.body.textContent).toContain("Cần xác nhận lại để áp dụng cho học viên");
    expect(confirm().disabled).toBe(false);
    await click("Xác nhận bản đồ kiến thức");
    expect(boundary.confirmKnowledgeMap).toHaveBeenCalledWith("owned");
    expect(document.body.textContent).not.toContain("Cần xác nhận lại để áp dụng cho học viên");
  });
  it.each(["empty", "ready", "stale", "failed", "analysing"] as const)("discloses unavailable analysis for %s without an action", async (status) => {
    const data = snapshot();
    data.course.knowledgeMapStatus = status;
    data.concepts = [];
    await render(data);
    expect(document.body.textContent).toContain("Phân tích AI chưa khả dụng");
    expect(document.body.textContent).toContain("chưa thể tạo hoặc xác nhận");
    expect(document.body.textContent).toContain("chưa thể đáp ứng điều kiện bản đồ để xuất bản");
    expect([...document.querySelectorAll("button")].some((el) => /Phân tích lại|Thử lại/.test(el.textContent || ""))).toBe(false);
    expect(boundary.runKnowledgeMapAnalysis).not.toHaveBeenCalled();
    expect(boundary.confirmKnowledgeMap).not.toHaveBeenCalled();
  });

  it("keeps stale graph edits visible but blocks confirmation and recovery", async () => {
    const data = snapshot();
    data.course.knowledgeMapStatus = "stale";
    await render(data);
    expect(document.body.textContent).toContain("chưa thể xác nhận lại");
    expect(confirm().disabled).toBe(true);
    expect(boundary.runKnowledgeMapAnalysis).not.toHaveBeenCalled();
  });

  it("does not treat historical AI labels as verified extraction", async () => {
    await render(snapshot());
    expect(document.body.textContent).toContain("chưa được xác minh");
    expect(confirm().disabled).toBe(false);
  });

  it("keeps a ready but generation-ineligible graph blocked after manual edits", async () => {
    const data = snapshot();
    data.course.confirmationUnavailable = true;
    await render(data);
    await click("Danh sách");
    await addEdge("2", "1");
    expect(document.body.textContent).toContain("chưa thể xác nhận lại");
    expect(document.body.textContent).not.toContain("Sẵn sàng xác nhận!");
    expect(confirm().disabled).toBe(true);
    expect(boundary.confirmKnowledgeMap).not.toHaveBeenCalled();
  });

  it("does not offer first analysis while the course is pending review", async () => {
    const pending = snapshot();
    pending.concepts = [];
    pending.course.status = "pending";
    pending.isLocked = true;
    await render(pending);
    expect([...document.querySelectorAll("button")].some((el) => el.textContent?.trim() === "Phân tích lại")).toBe(false);
    expect(boundary.runKnowledgeMapAnalysis).not.toHaveBeenCalled();
  });

  it("reflects the refreshed accept-all result without remounting the list view", async () => {
    const pending = snapshot();
    pending.concepts = pending.concepts.map((concept) => ({ ...concept, review: "suggested" }));
    await render(pending);
    await click("Danh sách");
    expect(confirm().disabled).toBe(true);
    await click("Chấp nhận tất cả (2)");
    await act(async () => {
      button("Chấp nhận tất cả").closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(boundary.acceptAllKnowledgeMap).toHaveBeenCalledWith("owned");
    expect(boundary.refresh).toHaveBeenCalledOnce();
    await render(snapshot());
    expect(document.body.textContent).not.toContain("Chấp nhận tất cả (2)");
    expect(confirm().disabled).toBe(false);
    expect(order()).toEqual(["Bài 1:Lesson 1", "Bài 2:Lesson 2"]);
  });

  it("clears cycle warnings and enables confirmation when an edge is declined", async () => {
    await render(snapshot([edge(1, 2), edge(2, 1)]));
    await click("Danh sách");
    expect(hasCycle()).toBe(true);
    expect(confirm().disabled).toBe(true);
    await click("Bỏ", edgeRow("Trees", "Arrays"));
    expect(boundary.reviewKnowledgeMapItem).toHaveBeenCalledWith("owned", "edge", { fromSkillId: 2, toSkillId: 1, review: "declined" });
    expect(hasCycle()).toBe(false);
    expect(confirm().disabled).toBe(false);
    expect(order()).toEqual(["Bài 1:Lesson 1", "Bài 2:Lesson 2"]);
  });

  it("restores the cycle guard when a declined edge is restored", async () => {
    await render(snapshot([edge(1, 2), { ...edge(2, 1), review: "declined" }]));
    await click("Danh sách");
    expect(hasCycle()).toBe(false);
    await click("Khôi phục", edgeRow("Trees", "Arrays"));
    expect(hasCycle()).toBe(true);
    expect(confirm().disabled).toBe(true);
    expect(order()).toEqual([]);
  });

  it("detects a cycle after successfully adding an edge before server refresh arrives", async () => {
    await render(snapshot([edge(1, 2)]));
    await click("Danh sách");
    await addEdge("2", "1");
    expect(boundary.addKnowledgeMapEdge).toHaveBeenCalledWith("owned", 2, 1);
    expect(hasCycle()).toBe(true);
    expect(confirm().disabled).toBe(true);
    expect(order()).toEqual([]);
  });

  it("reorders the lesson preview after a successful acyclic edge edit", async () => {
    await render(snapshot());
    await click("Danh sách");
    await addEdge("2", "1");
    expect(hasCycle()).toBe(false);
    expect(order()).toEqual(["Bài 1:Lesson 2", "Bài 2:Lesson 1"]);
    expect(confirm().disabled).toBe(false);
  });

  it("preserves an unsaved rename and edge selections while replacing saved server data", async () => {
    await render(snapshot());
    await click("Danh sách");
    await select("Khái niệm học trước", "2");
    await select("Khái niệm học sau", "1");
    await click("Sửa");
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Nhập tên khái niệm..."]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsaved name");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const fresh = snapshot();
    fresh.concepts[0]!.name = "Server name";
    await render(fresh);
    expect(document.body.textContent).toContain("Server name");
    expect(input.value).toBe("Unsaved name");
    await click("Huỷ", document.querySelector('[role="dialog"]')!);
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Khái niệm học trước"]')!.value).toBe("2");
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Khái niệm học sau"]')!.value).toBe("1");
    await click("Sửa");
    expect(document.querySelector<HTMLInputElement>('input[placeholder="Nhập tên khái niệm..."]')!.value).toBe("Server name");
    expect(boundary.renameKnowledgeMapConcept).not.toHaveBeenCalled();
  });

  it("honors fresh locked server data while preserving the current view", async () => {
    await render(snapshot());
    await click("Danh sách");
    await render({ ...snapshot(), isLocked: true });
    expect(document.querySelector('select[aria-label="Khái niệm học trước"]')).toBeNull();
    expect([...document.querySelectorAll("button")].some((el) => el.textContent?.trim() === "Xác nhận bản đồ kiến thức")).toBe(false);
    expect(order()).toHaveLength(2);
  });

  it("preserves graph selection, zoom and chapter filtering on refresh", async () => {
    await render(snapshot());
    await select("Lọc theo chương", "chapter-1");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="Phóng to"]')!.click();
      [...document.querySelectorAll("h4")].find((el) => el.textContent === "Arrays")!.parentElement!.click();
    });
    const fresh = snapshot();
    fresh.concepts[0]!.name = "Refreshed selected concept";
    await render(fresh);
    expect(button("115%")).toBeDefined();
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Lọc theo chương"]')!.value).toBe("chapter-1");
    const node = [...document.querySelectorAll("h4")].find((el) => el.textContent === "Refreshed selected concept")!.parentElement!;
    expect(node.classList.contains("ring-2")).toBe(true);
    expect(button("Sửa tên")).toBeDefined();
  });

  it("keeps successful local edits across rerenders with the same server snapshot", async () => {
    const initial = snapshot();
    await render(initial);
    await click("Danh sách");
    await addEdge("2", "1");
    await render(initial);
    expect(order()).toEqual(["Bài 1:Lesson 2", "Bài 2:Lesson 1"]);
    expect(edgeRow("Trees", "Arrays")).toBeDefined();
  });

  it("updates cycle and lesson order when a concept in a cycle is declined", async () => {
    await render(snapshot([edge(1, 2), edge(2, 1)]));
    await click("Danh sách");
    const name = [...document.querySelectorAll("span")].find((el) => el.textContent === "Arrays")!;
    await click("Bỏ", name.parentElement!.parentElement!.parentElement!);
    expect(boundary.reviewKnowledgeMapItem).toHaveBeenCalledWith("owned", "concept", { skillId: 1, review: "declined" });
    expect(hasCycle()).toBe(false);
    expect(order()).toEqual(["Bài 1:Lesson 2", "Bài 2:Lesson 1"]);
    expect(confirm().disabled).toBe(false);
  });

  it("does not change the saved graph after server rejection and still delegates confirmation", async () => {
    boundary.addKnowledgeMapEdge.mockRejectedValueOnce(new Error("Rejected edge"));
    boundary.confirmKnowledgeMap.mockRejectedValueOnce(new Error("Server validation"));
    await render(snapshot([edge(1, 2)]));
    await click("Danh sách");
    await addEdge("2", "1");
    expect(boundary.error).toHaveBeenCalledWith("Rejected edge");
    expect(hasCycle()).toBe(false);
    expect(order()).toEqual(["Bài 1:Lesson 1", "Bài 2:Lesson 2"]);
    expect(boundary.refresh).not.toHaveBeenCalled();
    await click("Xác nhận bản đồ kiến thức");
    expect(boundary.confirmKnowledgeMap).toHaveBeenCalledWith("owned");
    expect(boundary.error).toHaveBeenCalledWith("Server validation");
    expect(confirm().disabled).toBe(false);
  });
});
