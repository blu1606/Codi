"use client";

// Data visualization primitives, not hand-drawn UI icons. All colours use graph/theme tokens.
type Props = {
  id: string; width: number; height: number;
  positions: Map<number, { x: number; y: number }>;
  edges: { from: number; to: number }[]; highlighted: Set<number>;
  cycleEdges?: Set<string>;
};
export function KnowledgeGraphLines({ id, width, height, positions, edges, highlighted, cycleEdges }: Props) {
  return <svg width={width} height={height} className="absolute inset-0 pointer-events-none" aria-hidden="true">
    <defs>
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
      </marker>
      <marker id={`${id}-arrow-destructive`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-destructive" />
      </marker>
    </defs>
    {edges.map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return null;
      const isCycle = cycleEdges?.has(`${edge.from}:${edge.to}`);
      const active = highlighted.has(edge.from) && highlighted.has(edge.to);
      return (
        <path
          key={`${edge.from}:${edge.to}`}
          d={`M${from.x + 232},${from.y + 64} C${from.x + 258},${from.y + 64} ${to.x - 24},${to.y + 64} ${to.x - 4},${to.y + 64}`}
          fill="none"
          strokeWidth={isCycle ? 3 : active ? 3 : 1.5}
          className={isCycle ? "stroke-destructive" : active ? "stroke-primary" : "stroke-border-strong"}
          markerEnd={`url(#${id}-${isCycle ? "arrow-destructive" : "arrow"})`}
        />
      );
    })}
  </svg>;
}
export function KnowledgeGraphMinimap({ width, height, positions, edges, highlighted, cycleEdges }: Omit<Props, "id">) {
  return <svg width="128" height="64" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {edges.map((e) => {
      const from = positions.get(e.from);
      const to = positions.get(e.to);
      if (!from || !to) return null;
      const isCycle = cycleEdges?.has(`${e.from}:${e.to}`);
      return (
        <line
          key={`${e.from}:${e.to}`}
          x1={from.x + 224}
          y1={from.y + 64}
          x2={to.x}
          y2={to.y + 64}
          className={isCycle ? "stroke-destructive" : "stroke-primary"}
          strokeWidth={6}
        />
      );
    })}
    {[...positions].map(([id, pos]) => (
      <rect
        key={id}
        x={pos.x}
        y={pos.y}
        width={224}
        height={128}
        rx={12}
        className={highlighted.has(id) ? "fill-primary" : "fill-border-strong"}
      />
    ))}
  </svg>;
}
