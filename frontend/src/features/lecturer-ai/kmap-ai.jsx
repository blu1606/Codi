/**
 * Knowledge-map graph rules for lecturers, ported from the real app's lib/knowledge-map-runner.ts, and the start of
 * the real background analysis. The map itself (concepts, edges, review states, confirmation) lives in the backend
 * kmap actions used by lecturer/kmap-tab.jsx. Analysis is Codi's runKnowledgeMapAnalysis server action: it queues a
 * knowledge_map AI job (run by the in-process worker) and sets the map to 'analysing'; the tab polls
 * getKnowledgeMapData until the status changes. Saving course content also queues an analysis on the server.
 *
 * Map shape: { status, concepts[{ id, name, lessonIds[], review: suggested|accepted|edited|declined }],
 *   edges[{ from, to, review }] }   (an edge means "from must be learned before to").
 *
 * Installs on Codi.lecturerAI:
 *   runKnowledgeMapAnalysis(courseId) → Promise<{ ok: true, jobId } | { ok: false, code, error }>
 *       code: 'active_job' | 'daily_limit' | 'store_failed' when the job queue refused, null otherwise.
 *   kmapGraph: { findCycle(conceptIds, edges), reaches(from, to, edges), computeAcceptAllPlan(conceptIds,
 *       suggestedEdges, keptEdges), activeEdges(map), mapCycle(map), topoSortLessons(concepts, edges, lessons) }
 *   acceptAllPlan(map) → { acceptedConcepts[], acceptedEdges[], skippedEdges[] }   (D10 preview, pure)
 */
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';

const KMAP_MODULE = 'dashboard/lecturer/courses/courseId/kmap';
// The backend's AiJobEnqueueError reaches the browser as "AI job enqueue failed: <code>".
const QUEUE_ERRORS = {
  active_job: 'Một lượt phân tích bản đồ kiến thức đang chạy. Chờ lượt này xong rồi xem kết quả.',
  daily_limit: 'Bạn đã dùng hết lượt phân tích AI trong hôm nay. Bản đồ hiện có không thay đổi; hãy thử lại vào ngày mai.',
  store_failed: 'Chưa xếp được lượt phân tích. Nội dung và bản đồ không bị ảnh hưởng; vui lòng thử lại.',
};
const inflight = new Map();

/** Queues a real analysis for the course (one request at a time per course). */
export function runKnowledgeMapAnalysis(courseId) {
  if (inflight.has(courseId)) return inflight.get(courseId);
  const job = (async () => {
    try {
      const r = await api.action(KMAP_MODULE, 'runKnowledgeMapAnalysis', courseId);
      return { ok: true, jobId: (r && r.jobId) || null };
    } catch (e) {
      const message = (e && typeof e.message === 'string' && e.message) || '';
      const m = /AI job enqueue failed: (\w+)/.exec(message);
      const code = m ? m[1] : null;
      return { ok: false, code, error: code ? QUEUE_ERRORS[code] || QUEUE_ERRORS.store_failed : message || 'Không thể bắt đầu phân tích.' };
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
