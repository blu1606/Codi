"use client";

// Data visualization primitives, not hand-drawn UI icons. All colours use graph/theme tokens.
type Props = {
  id: string; width: number; height: number;
  positions: Map<number, { x: number; y: number }>;
  edges: { from: number; to: number }[]; highlighted: Set<number>;
};
export function KnowledgeGraphLines({ id, width, height, positions, edges, highlighted }: Props) {
  return <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
    <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" /></marker></defs>
    {edges.map((edge) => {
      const from = positions.get(edge.from)!; const to = positions.get(edge.to)!;
      const active = highlighted.has(edge.from) && highlighted.has(edge.to);
      return <path key={`${edge.from}:${edge.to}`} d={`M${from.x + 232},${from.y + 54} C${from.x + 258},${from.y + 54} ${to.x - 24},${to.y + 54} ${to.x - 4},${to.y + 54}`} fill="none" strokeWidth={active ? 3 : 1.5} className={active ? "stroke-primary" : "stroke-border-strong"} markerEnd={`url(#${id}-arrow)`} />;
    })}
  </svg>;
}
export function KnowledgeGraphMinimap({ width, height, positions, edges, highlighted }: Omit<Props, "id">) {
  return <svg width="128" height="64" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {edges.map((e) => { const from = positions.get(e.from)!; const to = positions.get(e.to)!; return <line key={`${e.from}:${e.to}`} x1={from.x + 224} y1={from.y + 50} x2={to.x} y2={to.y + 50} className="stroke-primary" strokeWidth={6} />; })}
    {[...positions].map(([id, pos]) => <rect key={id} x={pos.x} y={pos.y} width={224} height={112} rx={12} className={highlighted.has(id) ? "fill-primary" : "fill-border-strong"} />)}
  </svg>;
}
