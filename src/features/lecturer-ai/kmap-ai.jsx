/**
 * Knowledge-map AI for lecturers: simulated analysis plus the real graph rules.
 * Graph helpers are ported from the real app's lib/knowledge-map-runner.ts; the analysis follows the mockup
 * (docs/mockup/js/lecturer.js runAnalysis) because the real runKnowledgeMapAnalysis is disabled in its trial build
 * and the product owner kept the simulation working.
 *
 * Map shape: Codi.db().knowledgeMaps[courseId] = { status: empty|analysing|ready|confirmed|failed|stale, updatedAt,
 *   generatedAt?, concepts[{ id, name, lessonIds[], review: suggested|accepted|edited|declined }],
 *   edges[{ from, to, review }] }   (an edge means "from must be learned before to").
 *
 * Installs on Codi.lecturerAI:
 *   runKnowledgeMapAnalysis(courseId) → Promise<{ ok: true, map } | { ok: false, error }>
 *       status → 'analysing' at once, then 'ready' with AI suggestions (or 'failed') after ~2.5 s.
 *       Scenario Codi.state.scenario.kmap: 'fail' → failed; 'cycle' → adds one loop-closing suggested edge.
 *       Re-analysis (stale / failed / ready) re-suggests the existing concepts and drops lessons that no longer exist.
 *       Notifies the lecturer: "Bản đồ kiến thức đã sẵn sàng".
 *   kmapGraph: { findCycle(conceptIds, edges), reaches(from, to, edges), computeAcceptAllPlan(conceptIds,
 *       suggestedEdges, keptEdges), activeEdges(map), mapCycle(map), topoSortLessons(concepts, edges, lessons) }
 *   acceptAllPlan(map) → { acceptedConcepts[], acceptedEdges[], skippedEdges[] }   (D10 preview, pure)
 *   acceptAll(courseId) → Promise<{ ok, acceptedConcepts, acceptedEdges, skippedEdges }>
 *       opens the real "Chấp nhận tất cả đề xuất?" confirm, then applies the plan; loop-closing edges stay suggested.
 */
import { Codi } from '../../lib/codi';

const ANALYSIS_MS = 2500;
const LOCKED = 'Khoá học đang chờ duyệt — nội dung chỉ đọc.';
const NOT_FOUND = 'Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const lessonsOf = (c) => (c.chapters || []).flatMap((ch) => ch.lessons || []);

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

// ───────────────────────── actions ─────────────────────────
function ensureMap(db, c) {
  if (!db.knowledgeMaps) db.knowledgeMaps = {};
  if (!db.knowledgeMaps[c.id]) db.knowledgeMaps[c.id] = { status: lessonsOf(c).length ? 'ready' : 'empty', updatedAt: new Date().toISOString(), concepts: [], edges: [] };
  return db.knowledgeMaps[c.id];
}
const conceptName = (title) => String(title || '').replace(/^Bài \d+[:.]\s*/i, '').trim() || String(title || '');

// One in-flight analysis per course; a second call while analysing returns the same promise.
const inflight = new Map();

export function runKnowledgeMapAnalysis(courseId) {
  if (inflight.has(courseId)) return inflight.get(courseId);
  const c = Codi.course(courseId);
  if (!c) return Promise.resolve({ ok: false, error: NOT_FOUND });
  if (c.status === 'pending') return Promise.resolve({ ok: false, error: LOCKED });
  if (!lessonsOf(c).length) return Promise.resolve({ ok: false, error: 'Chưa có nội dung để phân tích' });

  Codi.set((s) => { const m = ensureMap(s.db, c); m.status = 'analysing'; m.updatedAt = new Date().toISOString(); });
  const job = (async () => {
    try {
      await sleep(ANALYSIS_MS);
      const course = Codi.course(courseId);
      if (!course) return { ok: false, error: NOT_FOUND };
      const sc = Codi.state.scenario && Codi.state.scenario.kmap;
      if (sc === 'fail') {
        Codi.set((s) => { const m = ensureMap(s.db, course); m.status = 'failed'; m.updatedAt = new Date().toISOString(); });
        return { ok: false, error: 'Phân tích bản đồ kiến thức thất bại' };
      }
      let snapshot = null;
      Codi.set((s) => {
        const m = ensureMap(s.db, course);
        const lessons = lessonsOf(course); const exists = new Set(lessons.map((l) => l.id));
        if (!m.concepts.length) {
          // New course: one suggested concept per lesson, chained in authored order.
          m.concepts = lessons.map((l) => ({ id: 'k-' + l.id, name: conceptName(l.title), lessonIds: [l.id], review: 'suggested' }));
          m.edges = m.concepts.slice(1).map((k, i) => ({ from: m.concepts[i].id, to: k.id, review: 'suggested' }));
        } else {
          // Re-analysis: every concept and edge is suggested again; links to deleted lessons are dropped,
          // and lessons that no concept covers get their own suggestion.
          m.concepts.forEach((k) => { k.review = 'suggested'; k.lessonIds = (k.lessonIds || []).filter((lid) => exists.has(lid)); });
          m.edges.forEach((e) => { e.review = 'suggested'; });
          const covered = new Set(m.concepts.flatMap((k) => k.lessonIds));
          lessons.filter((l) => !covered.has(l.id)).forEach((l) => {
            if (!m.concepts.some((k) => k.id === 'k-' + l.id)) m.concepts.push({ id: 'k-' + l.id, name: conceptName(l.title), lessonIds: [l.id], review: 'suggested' });
          });
        }
        if (sc === 'cycle' && m.concepts.length > 1) {
          const from = m.concepts[m.concepts.length - 1].id; const to = m.concepts[0].id;
          if (!m.edges.some((e) => e.from === from && e.to === to)) m.edges.push({ from, to, review: 'suggested' });
        }
        m.status = 'ready'; m.updatedAt = new Date().toISOString(); m.generatedAt = m.updatedAt;
        snapshot = JSON.parse(JSON.stringify(m));
      });
      Codi.notify(Codi.state.currentUserId, { title: 'Bản đồ kiến thức đã sẵn sàng', body: `${course.title}: ${snapshot.concepts.length} khái niệm cần bạn xem lại.`, link: `/teach/courses/${courseId}/kmap` });
      return { ok: true, map: snapshot };
    } catch (e) {
      console.error('[lecturerAI.runKnowledgeMapAnalysis]', e);
      try { Codi.set((s) => { const course = Codi.course(courseId); if (course) ensureMap(s.db, course).status = 'failed'; }); } catch { /* store unavailable */ }
      return { ok: false, error: 'Phân tích bản đồ kiến thức thất bại' };
    } finally {
      inflight.delete(courseId);
    }
  })();
  inflight.set(courseId, job);
  return job;
}

export async function acceptAll(courseId) {
  const c = Codi.course(courseId);
  const none = { ok: false, acceptedConcepts: [], acceptedEdges: [], skippedEdges: [] };
  if (!c) return none;
  if (c.status === 'pending') { Codi.ui.toast(LOCKED, { type: 'danger' }); return none; }
  const m0 = (Codi.db().knowledgeMaps || {})[courseId];
  if (!m0) return none;
  const preview = acceptAllPlan(m0);
  const body = (
    <span className="stack-1" style={{ display: 'grid' }}>
      <span><strong>{preview.acceptedConcepts.length}</strong> khái niệm</span>
      <span><strong>{preview.acceptedEdges.length}</strong> quan hệ tiên quyết an toàn</span>
      {preview.skippedEdges.length > 0 ? <span className="text-danger"><strong>{preview.skippedEdges.length}</strong> quan hệ bị bỏ qua vì sẽ tạo vòng lặp (vẫn giữ trạng thái chờ để bạn quyết định riêng)</span> : null}
    </span>
  );
  const r = await Codi.ui.confirm({
    title: 'Chấp nhận tất cả đề xuất?', body,
    consequence: "Các đề xuất sẽ được đánh dấu 'Đã chấp nhận'. Bản đồ chỉ có hiệu lực khi bạn bấm xác nhận.",
    reversible: 'Có thể đổi từng mục sau nếu muốn.', confirmLabel: 'Chấp nhận tất cả',
  });
  if (!r.ok) return none;
  let plan = preview;
  try {
    Codi.set((s) => {
      const m = s.db.knowledgeMaps[courseId];
      plan = acceptAllPlan(m); // recompute on the current map, like the server does
      const concepts = new Set(plan.acceptedConcepts);
      m.concepts.forEach((k) => { if (concepts.has(k.id)) k.review = 'accepted'; });
      plan.acceptedEdges.forEach((p) => { const e = m.edges.find((x) => x.from === p.from && x.to === p.to); if (e) e.review = 'accepted'; });
      if (m.status === 'confirmed') m.status = 'ready';
      m.updatedAt = new Date().toISOString();
    });
  } catch (e) {
    console.error('[lecturerAI.acceptAll]', e);
    Codi.ui.toast('Lỗi khi chấp nhận tất cả.', { type: 'danger' });
    return none;
  }
  const total = plan.acceptedConcepts.length + plan.acceptedEdges.length;
  if (plan.skippedEdges.length) Codi.ui.toast(`Đã chấp nhận ${total} đề xuất. Có ${plan.skippedEdges.length} quan hệ tạo vòng lặp cần bạn xử lý riêng.`, { type: 'info' });
  else Codi.ui.toast(`Đã chấp nhận ${total} đề xuất. Kiểm tra lại rồi xác nhận bản đồ.`, { type: 'success' });
  return { ok: true, ...plan };
}

Object.assign(Codi, {
  lecturerAI: {
    ...(Codi.lecturerAI || {}),
    runKnowledgeMapAnalysis, acceptAllPlan, acceptAll,
    kmapGraph: { findCycle, reaches, computeAcceptAllPlan, activeEdges, mapCycle, topoSortLessons },
  },
});
