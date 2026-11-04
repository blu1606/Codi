/**
 * Knowledge Map Runner & DAG Graph Utilities (STATE-MACHINES.md §18, PRODUCT.md S24)
 * Pure algorithmic functions for cycle detection, layer positioning, accept-all planning,
 * and topological sorting of lessons.
 */

export interface KnowledgeGraphEdge {
  from: number;
  to: number;
  review?: "suggested" | "accepted" | "edited" | "declined";
}

export interface KnowledgeGraphConcept {
  id: number;
  name: string;
  review?: "suggested" | "accepted" | "edited" | "declined";
  lessonIds?: string[];
}

/**
 * Cycle detection using DFS with 3-color state tracking (0: unvisited, 1: visiting, 2: visited).
 * Returns the cycle path as an array of IDs [A, B, ..., A] or null if acyclic.
 */
export function findCycle(
  conceptIds: number[],
  edges: { from: number; to: number }[]
): number[] | null {
  const nodeSet = new Set(conceptIds);
  const adj = new Map<number, number[]>();

  for (const cid of conceptIds) {
    adj.set(cid, []);
  }

  for (const e of edges) {
    if (nodeSet.has(e.from) && nodeSet.has(e.to)) {
      adj.get(e.from)!.push(e.to);
    }
  }

  const state = new Map<number, number>(); // 0: unvisited, 1: visiting, 2: visited
  const stack: number[] = [];

  function dfs(curr: number): number[] | null {
    state.set(curr, 1);
    stack.push(curr);

    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      const s = state.get(next) || 0;
      if (s === 1) {
        // Cycle detected: extract from start of cycle in stack to current
        const cycleStartIndex = stack.indexOf(next);
        return stack.slice(cycleStartIndex).concat(next);
      }
      if (s === 0) {
        const cycle = dfs(next);
        if (cycle) return cycle;
      }
    }

    state.set(curr, 2);
    stack.pop();
    return null;
  }

  for (const cid of conceptIds) {
    if ((state.get(cid) || 0) === 0) {
      const cycle = dfs(cid);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Computes layered DAG columns using Kahn's algorithm.
 * Cycle-safe: If a cycle exists, the remaining nodes are placed into a final layer
 * so the graph never throws and the lecturer can see the full map and cycle.
 */
export function computeLecturerGraphLayers(
  nodeIds: number[],
  edges: { from: number; to: number }[]
): number[][] {
  const remaining = new Set(nodeIds);
  const layers: number[][] = [];

  while (remaining.size > 0) {
    const layer = [...remaining].filter(
      (id) => !edges.some((e) => e.to === id && remaining.has(e.from))
    );

    if (layer.length === 0) {
      // Remaining nodes form a cycle or deadlock
      layers.push([...remaining]);
      break;
    }

    layers.push(layer);
    layer.forEach((id) => remaining.delete(id));
  }

  return layers;
}

/**
 * Checks if 'from' can reach 'to' via existing directed edges.
 */
export function reaches(
  from: number,
  to: number,
  edges: { from: number; to: number }[]
): boolean {
  const seen = new Set<number>();
  const stack = [from];

  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === to) return true;
    if (seen.has(curr)) continue;
    seen.add(curr);

    for (const e of edges) {
      if (e.from === curr) {
        stack.push(e.to);
      }
    }
  }

  return false;
}

/**
 * Pure function implementing Decision 10 (D10, STATE-MACHINES §18):
 * - Accepts all suggested concepts.
 * - Accepts suggested edges UNLESS an edge would close a loop
 *   (i.e. 'to' can already reach 'from' through accepted/edited edges).
 * - Loop-closing edges stay 'suggested' (skipped).
 */
export function computeAcceptAllPlan(
  suggestedConceptIds: number[],
  suggestedEdges: { from: number; to: number }[],
  keptEdges: { from: number; to: number }[]
): {
  acceptedConcepts: number[];
  acceptedEdges: { from: number; to: number }[];
  skippedEdges: { from: number; to: number }[];
} {
  const activeEdges = [...keptEdges];
  const acceptedEdges: { from: number; to: number }[] = [];
  const skippedEdges: { from: number; to: number }[] = [];

  for (const edge of suggestedEdges) {
    // If target can already reach source, adding edge creates a cycle!
    if (reaches(edge.to, edge.from, activeEdges)) {
      skippedEdges.push(edge);
    } else {
      acceptedEdges.push(edge);
      activeEdges.push(edge);
    }
  }

  return {
    acceptedConcepts: [...suggestedConceptIds],
    acceptedEdges,
    skippedEdges,
  };
}

/**
 * Computes topological lesson ordering according to prerequisite concept hierarchy.
 * Returns null if the active concept graph contains a cycle.
 */
export function topoSortLessons(
  concepts: { id: number; review?: string; lessonIds?: string[] }[],
  edges: { from: number; to: number; review?: string }[],
  allLessons: { id: string; title: string }[]
): { id: string; title: string }[] | null {
  const liveConcepts = concepts.filter((c) => c.review !== "declined");
  const liveConceptIds = new Set(liveConcepts.map((c) => c.id));

  const activeEdges = edges.filter(
    (e) =>
      e.review !== "declined" &&
      liveConceptIds.has(e.from) &&
      liveConceptIds.has(e.to)
  );

  const cycle = findCycle(
    [...liveConceptIds],
    activeEdges
  );

  if (cycle) {
    return null;
  }

  // Calculate in-degree for active concepts
  const inDegree = new Map<number, number>();
  for (const c of liveConcepts) {
    inDegree.set(c.id, 0);
  }
  for (const e of activeEdges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sortedConceptIds: number[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    sortedConceptIds.push(curr);

    for (const e of activeEdges) {
      if (e.from === curr) {
        const nextDeg = (inDegree.get(e.to) || 0) - 1;
        inDegree.set(e.to, nextDeg);
        if (nextDeg === 0) {
          queue.push(e.to);
        }
      }
    }
  }

  const seenLessonIds = new Set<string>();
  const sortedLessons: { id: string; title: string }[] = [];
  const lessonMap = new Map(allLessons.map((l) => [l.id, l]));

  for (const cid of sortedConceptIds) {
    const concept = liveConcepts.find((c) => c.id === cid);
    if (!concept || !concept.lessonIds) continue;
    for (const lid of concept.lessonIds) {
      if (!seenLessonIds.has(lid) && lessonMap.has(lid)) {
        seenLessonIds.add(lid);
        sortedLessons.push(lessonMap.get(lid)!);
      }
    }
  }

  // Append remaining lessons not linked to any concept in their authored order
  for (const l of allLessons) {
    if (!seenLessonIds.has(l.id)) {
      seenLessonIds.add(l.id);
      sortedLessons.push(l);
    }
  }

  return sortedLessons;
}
