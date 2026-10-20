// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  knowledgeGraphLayout,
  KNOWLEDGE_NODE,
} from "@codi-1/ui/lib/knowledge-graph-layout";
import {
  graphLayers,
  type KnowledgeMapView,
} from "@/lib/learning-path-contract";
import KnowledgeMap from "./knowledge-map";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(KnowledgeMap)));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
function fixture(): KnowledgeMapView {
  return {
    courses: [{ id: "owned", title: "JavaScript" }],
    courseId: "owned",
    title: "JavaScript",
    confirmed: true,
    nodes: [
      {
        id: 1,
        name: "Biến",
        level: 4,
        locked: false,
        recommended: false,
        probability: 0.95,
        evidenceCount: 4,
        lessons: [],
      },
      {
        id: 2,
        name: "Hàm",
        level: 1,
        locked: false,
        recommended: true,
        probability: 0.3,
        evidenceCount: 2,
        lessons: [{ id: "function", title: "Bài Hàm", locked: false }],
      },
      {
        id: 3,
        name: "Lỗi",
        level: 0,
        locked: true,
        recommended: false,
        probability: null,
        evidenceCount: 0,
        lessons: [{ id: "error", title: "Bài Lỗi", locked: true }],
      },
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
  };
}
const concept = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label^="${name}:"]`)!;

describe("mockup knowledge map layout", () => {
  it("centres each row, preserves prerequisites and leaves the mockup gaps between nodes", () => {
    const edges = [
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
    ];
    const graph = knowledgeGraphLayout(graphLayers([1, 2, 3, 4, 5], edges));
    const at = (id: number) => graph.positions.get(id)!;
    expect(graph.width).toBe(360);
    expect(graph.height).toBe(440);
    expect(at(1).x + KNOWLEDGE_NODE.width / 2).toBe(graph.width / 2);
    expect(at(4).x).toBe(at(1).x);
    expect(at(3).x - at(2).x - KNOWLEDGE_NODE.width).toBe(24);
    for (const edge of edges)
      expect(
        at(edge.to).y - at(edge.from).y - KNOWLEDGE_NODE.height,
      ).toBeGreaterThanOrEqual(56);
    expect(knowledgeGraphLayout([]).width).toBe(320);
  });
  it("keeps the graph visible when expanding the table, highlights prerequisites and clears the selected panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(fixture())));
    await render();
    expect(document.querySelector("select")).toBeNull();
    expect(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Thống kê học tập"),
      )?.disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain("Nên ôn tiếp: Hàm");
    expect(
      document.querySelectorAll('[aria-label="Mức thành thạo"] li'),
    ).toHaveLength(5);
    const graph = document.querySelector('[aria-label^="Sơ đồ khái niệm"]')!;
    expect(concept("Biến").style.width).toBe("152px");
    expect(concept("Biến").style.height).toBe("60px");
    expect(graph.querySelector('path[fill="none"]')!.getAttribute("d")).toBe(
      "M160 76 C160 104, 160 104, 160 130",
    );
    expect(
      graph.querySelector('path[fill="none"]')!.getAttribute("class"),
    ).toBe("stroke-viz-axis");
    expect(
      graph.querySelector('path[fill="none"]')!.getAttribute("marker-end"),
    ).toMatch(/-base\)$/);
    await act(async () => concept("Hàm").click());
    expect(concept("Hàm").getAttribute("aria-pressed")).toBe("true");
    expect(graph.querySelectorAll("path.stroke-viz-1")).toHaveLength(1);
    expect(document.body.textContent).toContain("Bài học liên quan");
    await act(async () => concept("Hàm").click());
    expect(document.body.textContent).not.toContain("Bài học liên quan");
    const toggle = document.querySelector<HTMLButtonElement>(
      '[aria-label="Xem dạng danh sách"]',
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("tbody")?.children).toHaveLength(3);
    expect(graph.isConnected).toBe(true);
    await act(async () => concept("Lỗi").click());
    expect(document.querySelector('a[href="/learn/owned/error"]')).toBeNull();
    expect(document.body.textContent).toContain("Bài Lỗi · Bị khoá");
    expect(
      document
        .querySelector('[role="meter"][aria-label="Lỗi"]')
        ?.getAttribute("aria-valuetext"),
    ).toBe("Chưa mở khoá");
  });
  it("shows all-unlearned evidence honestly and never recommends a locked concept", async () => {
    const data = fixture();
    data.nodes = data.nodes.map((n) => ({
      ...n,
      level: 0,
      probability: null,
      evidenceCount: 0,
    }));
    data.nodes[0]!.locked = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    await render();
    expect(document.body.textContent).toContain("0/3 khái niệm đã thành thạo");
    expect(document.body.textContent).toContain("Nên ôn tiếp: Hàm (Chưa học)");
    await act(async () => concept("Hàm").click());
    expect(document.body.textContent).toContain("Chưa có bằng chứng học tập.");
    expect(
      document
        .querySelector('[role="meter"][aria-label="Hàm"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("0");
  });
  it("offers retry after an HTTP error and renders the recovered map", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Không thể tải bản đồ." }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json(fixture()));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(document.body.textContent).toContain("Không thể tải bản đồ.");
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Thử lại")!
        .click(),
    );
    expect(document.body.textContent).not.toContain("Không thể tải bản đồ.");
    expect(concept("Biến")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("switches courses without retaining the previous selection or leaking an unconfirmed graph", async () => {
    const data = fixture();
    data.courses.push({ id: "pending", title: "Chưa xác nhận" });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(
        Response.json({
          ...data,
          courseId: "pending",
          title: "Chưa xác nhận",
          confirmed: false,
          nodes: [],
          edges: [],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await render();
    await act(async () => concept("Hàm").click());
    const select = document.querySelector("select")!;
    await act(async () => {
      select.value = "pending";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(fetcher.mock.calls[1]![0]).toBe(
      "/api/insights/knowledge-map?course=pending",
    );
    expect(document.body.textContent).toContain("Chưa có bản đồ kiến thức");
    expect(document.body.textContent).not.toContain("Bài học liên quan");
    expect(
      document.querySelector('[aria-label^="Sơ đồ khái niệm"]'),
    ).toBeNull();
  });
});
