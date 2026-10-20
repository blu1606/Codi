// @vitest-environment happy-dom
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as graph from "@codi-1/ui/components/knowledge-graph-lines";
import { LearnerKnowledgeGraphLines } from "@codi-1/ui/components/learner-knowledge-graph-lines";

// The horizontal consumer places columns 320px apart and rows 160px apart.
const positions = new Map([
  [1, { x: 40, y: 40 }],
  [2, { x: 360, y: 40 }],
  [3, { x: 360, y: 200 }],
]);
const props = {
  id: "horizontal",
  width: 1040,
  height: 500,
  positions,
  edges: [
    { from: 1, to: 2 },
    { from: 1, to: 3 },
  ],
  highlighted: new Set([1, 2]),
  cycleEdges: new Set(["1:3"]),
} satisfies ComponentProps<typeof graph.KnowledgeGraphLines>;

function lines(input = props) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(graph.KnowledgeGraphLines, input),
  );
  return host;
}

describe("horizontal knowledge graph compatibility", () => {
  it("keeps both shared exports available", () => {
    expect(graph.KnowledgeGraphLines).toBeTypeOf("function");
    expect(graph.KnowledgeGraphMinimap).toBeTypeOf("function");
  });

  it("supports callers without cycle edges and empty graphs", () => {
    const { cycleEdges: _cycleEdges, ...withoutCycles } = props;
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement(graph.KnowledgeGraphLines, withoutCycles),
    );
    expect(host.querySelectorAll("path.stroke-destructive")).toHaveLength(0);
    host.innerHTML = renderToStaticMarkup(
      createElement(graph.KnowledgeGraphMinimap, withoutCycles),
    );
    expect(host.querySelectorAll("line.stroke-primary")).toHaveLength(2);
    for (const component of [
      graph.KnowledgeGraphLines,
      graph.KnowledgeGraphMinimap,
    ]) {
      host.innerHTML = renderToStaticMarkup(
        createElement(component, {
          ...withoutCycles,
          positions: new Map(),
          edges: [],
          highlighted: new Set<number>(),
        }),
      );
      expect(
        host.querySelectorAll('path[fill="none"], line, rect'),
      ).toHaveLength(0);
    }
  });

  it("anchors edges to horizontal cards and preserves highlighted paths", () => {
    const host = lines();
    const edge = host.querySelector('path[fill="none"]')!;
    expect(edge.getAttribute("d")).toBe("M272,104 C298,104 336,104 356,104");
    expect(edge.getAttribute("class")).toBe("stroke-primary");
    expect(edge.getAttribute("stroke-width")).toBe("3");
    expect(edge.getAttribute("marker-end")).toBe("url(#horizontal-arrow)");
    expect(
      host.querySelector("svg")!.classList.contains("pointer-events-none"),
    ).toBe(true);
    const base = lines({ ...props, highlighted: new Set() }).querySelector(
      'path[fill="none"]',
    )!;
    expect(base.getAttribute("class")).toBe("stroke-border-strong");
    expect(base.getAttribute("stroke-width")).toBe("1.5");
  });

  it("gives cycle edges precedence over selected-path highlighting", () => {
    const host = lines({ ...props, highlighted: new Set([1, 2, 3]) });
    const cycle = host.querySelectorAll('path[fill="none"]')[1]!;
    expect(cycle.getAttribute("class")).toBe("stroke-destructive");
    expect(cycle.getAttribute("stroke-width")).toBe("3");
    expect(cycle.getAttribute("marker-end")).toBe(
      "url(#horizontal-arrow-destructive)",
    );
    expect(
      host
        .querySelector("marker#horizontal-arrow-destructive path")!
        .getAttribute("class"),
    ).toBe("fill-destructive");
  });

  it("skips edges with either endpoint missing without mutating the input", () => {
    const edges = [...props.edges, { from: 99, to: 2 }, { from: 1, to: 99 }];
    expect(
      lines({ ...props, edges }).querySelectorAll('path[fill="none"]'),
    ).toHaveLength(2);
    expect(edges).toHaveLength(4);
    expect(positions.size).toBe(3);
  });

  it("preserves minimap geometry, cycle styling and missing-endpoint handling", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement(graph.KnowledgeGraphMinimap, {
        ...props,
        edges: [...props.edges, { from: 99, to: 2 }, { from: 1, to: 99 }],
      }),
    );
    const svg = host.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("128");
    expect(svg.getAttribute("height")).toBe("64");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1040 500");
    const edges = host.querySelectorAll("line");
    expect(edges).toHaveLength(2);
    expect(edges[0]!.getAttribute("x1")).toBe("264");
    expect(edges[0]!.getAttribute("y1")).toBe("104");
    expect(edges[0]!.getAttribute("x2")).toBe("360");
    expect(edges[0]!.getAttribute("y2")).toBe("104");
    expect(edges[0]!.getAttribute("class")).toBe("stroke-primary");
    expect(edges[1]!.getAttribute("class")).toBe("stroke-destructive");
    const nodes = host.querySelectorAll("rect");
    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.getAttribute("width")).toBe("224");
    expect(nodes[0]!.getAttribute("height")).toBe("128");
    expect(nodes[0]!.getAttribute("class")).toBe("fill-primary");
    expect(nodes[2]!.getAttribute("class")).toBe("fill-border-strong");
  });
});

describe("learner knowledge graph edges", () => {
  it("skips missing endpoints while preserving top-down geometry and markers", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement(LearnerKnowledgeGraphLines, {
        id: "learner",
        width: 320,
        height: 208,
        positions: new Map([
          [1, { x: 84, y: 16 }],
          [2, { x: 84, y: 132 }],
        ]),
        edges: [
          { from: 1, to: 2 },
          { from: 99, to: 2 },
          { from: 1, to: 99 },
        ],
        highlighted: new Set([1, 2]),
      }),
    );
    const edges = host.querySelectorAll('path[fill="none"]');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.getAttribute("d")).toBe(
      "M160 76 C160 104, 160 104, 160 130",
    );
    expect(edges[0]!.getAttribute("class")).toBe("stroke-viz-1");
    expect(edges[0]!.getAttribute("stroke-width")).toBe("2");
    expect(edges[0]!.getAttribute("marker-end")).toBe("url(#learner-path)");
  });
});
