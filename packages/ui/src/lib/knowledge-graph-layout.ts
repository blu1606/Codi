// Geometry from docs/mockup/js/charts.js: charts.graph.
export const KNOWLEDGE_NODE = { width: 152, height: 60 } as const;
const GAP_X = 24;
const GAP_Y = 56;
const PADDING = 16;

export function knowledgeGraphLayout(layers: number[][]) {
  const width = Math.max(
    320,
    Math.max(0, ...layers.map((row) => row.length)) *
      (KNOWLEDGE_NODE.width + GAP_X) -
      GAP_X +
      PADDING * 2,
  );
  const height = Math.max(
    KNOWLEDGE_NODE.height + PADDING * 2,
    layers.length * (KNOWLEDGE_NODE.height + GAP_Y) - GAP_Y + PADDING * 2,
  );
  const positions = new Map(
    layers.flatMap((row, depth) => {
      const rowWidth = row.length * (KNOWLEDGE_NODE.width + GAP_X) - GAP_X;
      return row.map(
        (id, index) =>
          [
            id,
            {
              x:
                (width - rowWidth) / 2 + index * (KNOWLEDGE_NODE.width + GAP_X),
              y: PADDING + depth * (KNOWLEDGE_NODE.height + GAP_Y),
            },
          ] as const,
      );
    }),
  );
  return { width, height, positions };
}
