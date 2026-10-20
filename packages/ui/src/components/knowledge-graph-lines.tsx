"use client";

import { KNOWLEDGE_NODE } from "@codi-1/ui/lib/knowledge-graph-layout";

// Data visualization primitives, not hand-drawn UI icons. All colours use graph/theme tokens.
type Props = {
  id: string;
  width: number;
  height: number;
  positions: Map<number, { x: number; y: number }>;
  edges: { from: number; to: number }[];
  highlighted: Set<number>;
};
export function KnowledgeGraphLines({
  id,
  width,
  height,
  positions,
  edges,
  highlighted,
}: Props) {
  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-0"
      aria-hidden="true"
    >
      <defs>
        {["base", "path"].map((kind) => (
          <marker
            key={kind}
            id={`${id}-${kind}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className={kind === "path" ? "fill-viz-1" : "fill-viz-axis"}
            />
          </marker>
        ))}
      </defs>
      {edges.map((edge) => {
        const from = positions.get(edge.from)!;
        const to = positions.get(edge.to)!;
        const active = highlighted.has(edge.from) && highlighted.has(edge.to);
        const x1 = from.x + KNOWLEDGE_NODE.width / 2;
        const y1 = from.y + KNOWLEDGE_NODE.height;
        const x2 = to.x + KNOWLEDGE_NODE.width / 2;
        return (
          <path
            key={`${edge.from}:${edge.to}`}
            d={`M${x1} ${y1} C${x1} ${y1 + 28}, ${x2} ${to.y - 28}, ${x2} ${to.y - 2}`}
            fill="none"
            strokeWidth={active ? 2 : 1.5}
            className={active ? "stroke-viz-1" : "stroke-viz-axis"}
            markerEnd={`url(#${id}-${active ? "path" : "base"})`}
          />
        );
      })}
    </svg>
  );
}
