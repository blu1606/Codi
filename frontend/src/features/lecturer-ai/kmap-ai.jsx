/**
 * Knowledge-map graph rules for lecturers, ported from the real app's lib/knowledge-map-runner.ts.
 * The map itself (concepts, edges, review states, confirmation) lives in the backend kmap actions used by
 * lecturer/kmap-tab.jsx. Codi's own runKnowledgeMapAnalysis is disabled, so the analysis is the product owner's
 * simulation, run and stored by POST /api/lecturer/courses/:courseId/kmap-analysis.
 *
 * Map shape: { status, concepts[{ id, name, lessonIds[], review: suggested|accepted|edited|declined }],
 *   edges[{ from, to, review }] }   (an edge means "from must be learned before to").
 *
 * Installs on Codi.lecturerAI:
 *   runKnowledgeMapAnalysis(courseId) → Promise<{ ok: true, concepts, added } | { ok: false, error }>
 *       every concept and edge is suggested again, each lesson without a concept gets one (chained in authored
 *       order); the map becomes 'ready' for the current content. Demo flag Codi.state.scenario.kmap === 'fail'
 *       fails client-side after the usual wait.
 *   kmapGraph: { findCycle(conceptIds, edges), reaches(from, to, edges), computeAcceptAllPlan(conceptIds,
 *       suggestedEdges, keptEdges), activeEdges(map), mapCycle(map), topoSortLessons(concepts, edges, lessons) }
 *   acceptAllPlan(map) → { acceptedConcepts[], acceptedEdges[], skippedEdges[] }   (D10 preview, pure)
 */
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const inflight = new Map();
export function runKnowledgeMapAnalysis(courseId) {
  if (inflight.has(courseId)) return inflight.get(courseId);
  const job = (async () => {
    try {
      await sleep(1500); // visible "Đang phân tích" state, like the mockup
      if (Codi.state.scenario && Codi.state.scenario.kmap === 'fail') return { ok: false, error: 'Phân tích bản đồ kiến thức thất bại' };
      const r = await api.post(`/api/lecturer/courses/${encodeURIComponent(courseId)}/kmap-analysis`, {});
      return { ok: true, concepts: r.concepts, added: r.added };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Phân tích bản đồ kiến thức thất bại' };
    } finally {
      inflight.delete(courseId);
    }
  })();
  inflight.set(courseId, job);
  return job;
}

// ───────────────────────── graph rules (real knowledge-map-runner.ts) ─────────────────────────
export function findCycle(conceptIds, edges) {
  const nodes = new Set(conceptIds);
  const adj = new Map(conceptIds.map((id) => [id, []]));
  edges.forEach((e) => { if (nodes.has(e.from) && nodes.has(e.to)) adj.get(e.from).push(e.to); });
  const state = new Map(); const stack = [];
  const dfs = (cur) => {
    state.set(cur, 1); stack.push(cur);
    for (const next of adj.get(cur) || []) {
      const s = state.get(next) || 0;
      if (s === 1) return stack.slice(stack.indexOf(next)).concat(next);
      if (s === 0) { const cyc = dfs(next); if (cyc) return cyc; }
    }
    state.set(cur, 2); stack.pop(); return null;
  };
  for (const id of conceptIds) if (!(state.get(id) || 0)) { const cyc = dfs(id); if (cyc) return cyc; }
  return null;
}

export function reaches(from, to, edges) {
  const seen = new Set(); const stack = [from];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    edges.forEach((e) => { if (e.from === cur) stack.push(e.to); });
  }
  return false;
}

/** D10: accept every suggested concept and every suggested edge that does not close a loop. */
export function computeAcceptAllPlan(suggestedConceptIds, suggestedEdges, keptEdges) {
  const active = keptEdges.slice(); const acceptedEdges = []; const skippedEdges = [];
  suggestedEdges.forEach((e) => {
    if (reaches(e.to, e.from, active)) skippedEdges.push(e);
    else { acceptedEdges.push(e); active.push(e); }
  });
  return { acceptedConcepts: suggestedConceptIds.slice(), acceptedEdges, skippedEdges };
}

/** Edges that count in the graph: not declined, both ends live (not declined). */
export function activeEdges(m) {
  const live = new Set(m.concepts.filter((k) => k.review !== 'declined').map((k) => k.id));
  return m.edges.filter((e) => e.review !== 'declined' && live.has(e.from) && live.has(e.to));
}
export const mapCycle = (m) => findCycle(m.concepts.filter((k) => k.review !== 'declined').map((k) => k.id), activeEdges(m));

export function topoSortLessons(concepts, edges, allLessons) {
  const live = concepts.filter((k) => k.review !== 'declined');
  const ids = new Set(live.map((k) => k.id));
  const act = edges.filter((e) => e.review !== 'declined' && ids.has(e.from) && ids.has(e.to));
  if (findCycle([...ids], act)) return null;
  const indeg = new Map(live.map((k) => [k.id, 0]));
  act.forEach((e) => indeg.set(e.to, (indeg.get(e.to) || 0) + 1));
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order = [];
  while (queue.length) {
    const cur = queue.shift(); order.push(cur);
    act.forEach((e) => { if (e.from === cur) { const d = indeg.get(e.to) - 1; indeg.set(e.to, d); if (d === 0) queue.push(e.to); } });
  }
  const byId = new Map(allLessons.map((l) => [l.id, l])); const seen = new Set(); const out = [];
  order.forEach((cid) => {
    const k = live.find((x) => x.id === cid);
    (k && k.lessonIds || []).forEach((lid) => { if (!seen.has(lid) && byId.has(lid)) { seen.add(lid); out.push(byId.get(lid)); } });
  });
  allLessons.forEach((l) => { if (!seen.has(l.id)) { seen.add(l.id); out.push(l); } });
  return out;
}

export function acceptAllPlan(m) {
  const pair = (e) => ({ from: e.from, to: e.to });
  return computeAcceptAllPlan(
    m.concepts.filter((k) => k.review === 'suggested').map((k) => k.id),
    m.edges.filter((e) => e.review === 'suggested').map(pair),
    m.edges.filter((e) => e.review === 'accepted' || e.review === 'edited').map(pair),
  );
}

Object.assign(Codi, {
  lecturerAI: {
    ...(Codi.lecturerAI || {}),
    runKnowledgeMapAnalysis, acceptAllPlan,
    kmapGraph: { findCycle, reaches, computeAcceptAllPlan, activeEdges, mapCycle, topoSortLessons },
  },
});
