// S24 knowledge map tab: status banners, concept / edge review (accept · rename · decline · restore), accept-all
// with loop skip (D10), cycle detection, graph view with zoom + chapter filter + side panel, default learning order
// preview, confirmation with a confirmed snapshot. Copy follows the real knowledge-map-client.tsx.
// Data and writes: Codi's kmap actions (getKnowledgeMapData, reviewKnowledgeMapItem, renameKnowledgeMapConcept,
// addKnowledgeMapEdge, acceptAllKnowledgeMap, confirmKnowledgeMap). Analysis comes from the lecturer-ai feature
// (Codi.lecturerAI.runKnowledgeMapAnalysis, a simulation stored by the backend); without it the tab shows the real
// trial state ("Phân tích AI chưa khả dụng").
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { charts } from '../../lib/charts';
import { Alert, Empty, Html, Icon, SpinnerBlock } from '../../components/ui/primitives';
import { ls, locked, findLesson, FieldError, Loading, LoadError } from './teach-api';
import { rerender, useView } from './view-store';
import { act, reloadCourse } from './teach-data';

const { fmt } = Codi;
const toast = (msg, o) => Codi.ui.toast(msg, o);
const lessonOf = (c, id) => { const f = findLesson(c, id); return f ? f.l : null; };

/** Map shape the tab renders, from getKnowledgeMapData. Concept/edge ids are the backend skill ids. */
const toMap = (d) => ({
  status: d.course.knowledgeMapStatus, updatedAt: d.course.knowledgeMapGeneratedAt,
  confirmationUnavailable: !!d.course.confirmationUnavailable, requiresReconfirmation: !!d.course.requiresReconfirmation,
  concepts: d.concepts.map((k) => ({ id: k.id, name: k.name, review: k.review, lessonIds: k.lessonIds || [] })),
  edges: d.edges.map((e) => ({ from: e.from, to: e.to, review: e.review })),
  cycle: d.cycle, defaultOrder: d.defaultOrder,
});
const liveIds = (m) => new Set(m.concepts.filter((k) => k.review !== 'declined').map((k) => k.id));
const activeEdges = (m) => { const live = liveIds(m); return m.edges.filter((e) => e.review !== 'declined' && live.has(e.from) && live.has(e.to)); };
const kept = (e) => e.review === 'accepted' || e.review === 'edited';

export function findCycle(m) {
  const adj = {}; activeEdges(m).forEach((e) => { (adj[e.from] = adj[e.from] || []).push(e.to); });
  const state = {}; const stack = [];
  const dfs = (n) => {
    state[n] = 1; stack.push(n);
    for (const x of adj[n] || []) {
      if (state[x] === 1) return stack.slice(stack.indexOf(x)).concat(x);
      if (!state[x]) { const r = dfs(x); if (r) return r; }
    }
    state[n] = 2; stack.pop(); return null;
  };
  for (const k of m.concepts) if (!state[k.id]) { const r = dfs(k.id); if (r) return r; }
  return null;
}
/** Is `to` reachable from `from` over the given edges? */
function reaches(from, to, edges) {
  const seen = new Set([from]); const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n === to) return true;
    edges.forEach((e) => { if (e.from === n && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); } });
  }
  return false;
}
/** Real computeAcceptAllPlan (lib/knowledge-map-runner.ts): accept suggestions, skip edges that would close a loop. */
export function acceptAllPlan(m) {
  const active = m.edges.filter(kept).map((e) => ({ from: e.from, to: e.to }));
  const acceptedEdges = []; const skippedEdges = [];
  m.edges.filter((e) => e.review === 'suggested').forEach((e) => {
    if (reaches(e.to, e.from, active)) skippedEdges.push(e);
    else { acceptedEdges.push(e); active.push({ from: e.from, to: e.to }); }
  });
  return { acceptedConcepts: m.concepts.filter((k) => k.review === 'suggested'), acceptedEdges, skippedEdges };
}
function topoLessons(c, m) {
  const concepts = m.concepts.filter((k) => k.review !== 'declined');
  const indeg = {}; concepts.forEach((k) => { indeg[k.id] = 0; });
  const edges = activeEdges(m); edges.forEach((e) => { indeg[e.to] = (indeg[e.to] || 0) + 1; });
  const queue = concepts.filter((k) => !indeg[k.id]).map((k) => k.id); const out = [];
  while (queue.length) { const n = queue.shift(); out.push(n); edges.filter((e) => e.from === n).forEach((e) => { indeg[e.to] -= 1; if (!indeg[e.to]) queue.push(e.to); }); }
  const seen = new Set(); const lessons = [];
  out.forEach((cid) => { const k = m.concepts.find((x) => x.id === cid); (k.lessonIds || []).forEach((lid) => { if (!seen.has(lid)) { seen.add(lid); const l = lessonOf(c, lid); if (l) lessons.push(l); } }); });
  ls(c).forEach((l) => { if (!seen.has(l.id)) lessons.push(l); });
  return lessons;
}
const cname = (m, id) => (m.concepts.find((k) => k.id === id) || { name: id }).name;
const REVIEW = { suggested: ['Đề xuất', 'badge-warn'], accepted: ['Đã chấp nhận', 'badge-success'], edited: ['Đã sửa', 'badge-info'], declined: ['Đã bỏ', 'badge-neutral'] };
const reviewOf = (r) => REVIEW[r] || REVIEW.suggested;
const ZOOM_MIN = 0.6; const ZOOM_MAX = 1.4; const ZOOM_STEP = 0.15;

let kmapView = 'graph'; // 'graph' or 'list'
let kmapSelectedNode = null;
let kmapZoom = 1;
let kmapChapter = 'all';

const analyser = () => (Codi.lecturerAI && typeof Codi.lecturerAI.runKnowledgeMapAnalysis === 'function' ? Codi.lecturerAI.runKnowledgeMapAnalysis : null);

/** Loads the course map; reload() after every write (the backend owns the review states). */
function useKmapData(courseId) {
  const [st, setSt] = useState({ m: null, loading: true, error: null });
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, loading: true, error: null }));
    try { const d = await act('kmap', 'getKnowledgeMapData', courseId); setSt({ m: toMap(d), loading: false, error: null }); }
    catch (error) { setSt({ m: null, loading: false, error }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load };
}

function RenameBody({ handle, initial, onSave }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(null);
  const save = () => { const name = v.trim(); if (!name) { setErr('Tên khái niệm không được để trống.'); return; } onSave(name); handle.close(); };
  return (
    <>
      <div className="dialog-body"><div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="km-rename">Tên khái niệm kiến thức</label>
        <input id="km-rename" value={v} autoFocus placeholder="Nhập tên khái niệm..." onChange={(e) => { setV(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /><FieldError>{err}</FieldError></div></div>
      <div className="dialog-footer"><button type="button" className="btn btn-secondary" onClick={() => handle.close()}>Huỷ</button><button type="button" className="btn btn-primary" onClick={save}>Lưu thay đổi</button></div>
    </>
  );
}

export function KmapTab({ c }) {
  useView();
  const km = useKmapData(c.id);
  if (!km.m) return km.error ? <LoadError error={km.error} onRetry={km.reload} /> : <Loading rows={4} label="Đang tải bản đồ kiến thức…" />;
  return <KmapBody c={c} m={km.m} reload={km.reload} />;
}

function KmapBody({ c, m: stored, reload }) {
  const ro = locked(c);
  const [busy, setBusy] = useState(null); // 'analysing' | 'failed' while/after a run in this view
  const m = busy ? { ...stored, status: busy } : stored;
  /** Runs a kmap write, then refreshes the map and the course readiness. */
  const save = async (run, okMessage) => {
    try {
      const r = await run();
      if (r && r.success === false) { toast(r.error || 'Không thể lưu thay đổi.', { type: 'danger' }); return null; }
      if (okMessage) toast(okMessage, { type: 'success' });
      return r;
    } catch (e) {
      toast((e && e.message) || 'Không thể lưu thay đổi.', { type: 'danger' });
      return null;
    } finally {
      await reload(); reloadCourse(c.id);
    }
  };
  const run = analyser();
  const analyse = async () => {
    if (!run || busy === 'analysing') return;
    setBusy('analysing');
    const r = await run(c.id);
    if (r && r.ok === false) { setBusy('failed'); if (r.error) toast(r.error, { type: 'danger' }); return; }
    await reload(); reloadCourse(c.id);
    setBusy(null);
    toast('Bản đồ kiến thức đã sẵn sàng. Xem lại các đề xuất rồi xác nhận.', { type: 'success' });
  };
  const trialNotice = !run && (
    <Alert type="info" title="Phân tích AI chưa khả dụng" body="Bản thử nghiệm không gọi dịch vụ AI và không tạo bản đồ mới. Nguồn AI và thời điểm tạo đã lưu trước đây chưa được xác minh, không phải bằng chứng đã trích xuất nội dung. Bạn vẫn có thể xem lại, sửa và xác nhận bản đồ hiện có nếu đủ điều kiện. Khi chưa có bản đồ hợp lệ, khoá học chưa thể đáp ứng điều kiện bản đồ để xuất bản." />
  );
  const retryBtn = run && !ro
    ? <button type="button" className="btn btn-secondary btn-sm" onClick={analyse}><Icon name="refresh" className="icon-sm" /> Thử lại</button>
    : <span className="row" style={{ gap: 6 }}><button type="button" className="btn btn-secondary btn-sm" disabled><Icon name="refresh" className="icon-sm" /> Thử lại</button><span className="badge badge-neutral">Sắp có</span></span>;

  if (m.status === 'empty') return <div className="stack-4">{trialNotice}<div className="card"><Empty icon="map" title="Chưa có nội dung để phân tích" body="Thêm ít nhất một bài học, sau đó Codi sẽ đề xuất các khái niệm và quan hệ học trước." actions={<Link className="btn btn-primary" to={`/teach/courses/${c.id}/content`}><Icon name="book-open" /> Thêm nội dung</Link>} /></div></div>;
  if (m.status === 'analysing') {
    return run
      ? <div className="card"><div className="card-body stack-3" role="status"><p className="row strong"><Icon name="loader" /> Đang phân tích nội dung…</p><p className="small muted">AI đang trích xuất khái niệm từ {ls(c).length} bài học. Bạn sẽ nhận thông báo khi xong; có thể rời trang.</p><SpinnerBlock text="Đang trích xuất khái niệm" /></div></div>
      : <div className="stack-4">{trialNotice}<Alert type="warn" title="Trạng thái phân tích cũ chưa được xác minh" body="Không có tác vụ AI đang chạy hoặc chức năng thử lại trong bản thử nghiệm." /></div>;
  }
  if (m.status === 'failed') return <div className="stack-4">{trialNotice}<Alert type="danger" title="Phân tích bản đồ kiến thức thất bại" body="Dịch vụ AI không phản hồi. Nội dung khoá học không bị ảnh hưởng." actions={retryBtn} /></div>;
  if (!m.concepts.length) {
    return (
      <div className="stack-4">{trialNotice}
        {run ? <div className="card"><Empty icon="sparkles" title="Chưa phân tích bản đồ kiến thức" body={'Codi sẽ đọc nội dung các bài học và đề xuất khái niệm cùng quan hệ "cần học trước". Bạn xem lại và xác nhận trước khi dùng.'} actions={ro ? null : <button type="button" className="btn btn-primary" onClick={analyse}><Icon name="sparkles" /> Phân tích nội dung</button>} /></div>
          : <Alert type="warn" title="Chưa có bản đồ để xác nhận" body="Bản đồ mới hoặc trống chưa thể tạo hoặc xác nhận trong bản thử nghiệm. Thêm bài học không tự động tạo khái niệm hay quan hệ." />}
      </div>
    );
  }

  const G = Codi.lecturerAI && Codi.lecturerAI.kmapGraph;
  const cycle = G && G.mapCycle ? G.mapCycle(m) : findCycle(m);
  const pending = m.concepts.filter((k) => k.review === 'suggested').length + m.edges.filter((e) => e.review === 'suggested').length;
  const accepted = m.concepts.filter((k) => kept(k)).length + m.edges.filter(kept).length;
  const live = m.concepts.filter((k) => k.review !== 'declined');
  const staleBlocked = m.status === 'stale' || m.confirmationUnavailable;
  const canConfirm = !ro && !cycle && !pending && live.length > 0 && m.status === 'ready' && ls(c).length > 0 && !m.confirmationUnavailable;
  const needsReconfirm = m.requiresReconfirmation && m.status === 'ready';

  const isConcept = (item) => item.name !== undefined;
  const setReview = (item, v) => save(() => act('kmap', 'reviewKnowledgeMapItem', c.id, isConcept(item) ? 'concept' : 'edge',
    isConcept(item) ? { skillId: item.id, review: v } : { fromSkillId: item.from, toSkillId: item.to, review: v }));
  const acceptAll = async () => {
    const plan = acceptAllPlan(m);
    const r = await Codi.ui.confirm({
      title: 'Chấp nhận tất cả đề xuất?',
      body: <span className="stack-1" style={{ display: 'grid' }}>
        <span><Icon name="check" className="icon-sm text-success" /> <strong>{plan.acceptedConcepts.length}</strong> khái niệm</span>
        <span><Icon name="check" className="icon-sm text-success" /> <strong>{plan.acceptedEdges.length}</strong> quan hệ tiên quyết an toàn</span>
        {plan.skippedEdges.length > 0 && <span className="text-danger"><Icon name="alert-triangle" className="icon-sm" /> <strong>{plan.skippedEdges.length}</strong> quan hệ bị bỏ qua vì sẽ tạo vòng lặp (vẫn giữ trạng thái chờ để bạn quyết định riêng)</span>}
      </span>,
      consequence: "Các đề xuất sẽ được đánh dấu 'Đã chấp nhận'. Bản đồ chỉ có hiệu lực khi bạn bấm xác nhận.",
      reversible: 'Có thể đổi từng mục sau nếu muốn.', confirmLabel: 'Chấp nhận tất cả',
    });
    if (!r.ok) return;
    // the server recomputes the plan on the current map
    const res = await save(() => act('kmap', 'acceptAllKnowledgeMap', c.id));
    if (!res) return;
    const total = (res.acceptedConceptsCount || 0) + (res.acceptedEdgesCount || 0);
    toast(res.skippedEdgesCount ? `Đã chấp nhận ${total} đề xuất. Có ${res.skippedEdgesCount} quan hệ tạo vòng lặp cần bạn xử lý riêng.` : `Đã chấp nhận ${total} đề xuất. Kiểm tra lại rồi xác nhận bản đồ.`, { type: res.skippedEdgesCount ? 'info' : 'success' });
  };
  const rename = (k) => Codi.ui.modal({
    title: 'Đổi tên khái niệm', raw: true,
    body: (h) => <RenameBody handle={h} initial={k.name} onSave={(name) => save(() => act('kmap', 'renameKnowledgeMapConcept', c.id, k.id, name), 'Đã đổi tên khái niệm.')} />,
  });
  const addEdge = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); const from = Number(fd.get('from')); const to = Number(fd.get('to'));
    if (from === to) { toast('Một khái niệm không thể cần học trước chính nó.', { type: 'danger' }); return; }
    if (m.edges.some((x) => x.from === from && x.to === to && x.review !== 'declined')) { toast('Quan hệ này đã có.', { type: 'warn' }); return; }
    save(() => act('kmap', 'addKnowledgeMapEdge', c.id, from, to), 'Đã thêm quan hệ tiên quyết.');
  };
  const confirmMap = () => {
    if (!canConfirm || (G && G.mapCycle ? G.mapCycle(m) : findCycle(m))) return;
    save(() => act('kmap', 'confirmKnowledgeMap', c.id), 'Đã xác nhận bản đồ kiến thức.');
  };
  const setView = (v) => { kmapView = v; rerender(); };
  const selectNode = (id) => { kmapSelectedNode = id || null; rerender(); };
  const onGraphClick = (e) => { const b = e.target.closest('[data-action="tc-kmap-select-node"]'); if (b) selectNode(b.getAttribute('data-id')); };
  const zoom = (d) => { kmapZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((kmapZoom + d) * 100) / 100)); rerender(); };

  let statusLine;
  if (m.status === 'confirmed') statusLine = <Alert type="success" title="Bản đồ kiến thức đã được xác nhận" body={`Bản đồ đang hoạt động chính thức. Lộ trình cá nhân hoá của học viên sẽ sử dụng thứ tự khái niệm này.${m.updatedAt ? ` Cập nhật ${fmt.datetime(m.updatedAt)}.` : ''}`} />;
  else if (staleBlocked) {
    statusLine = run
      ? <Alert type="warn" title="Nội dung đã thay đổi sau khi xác nhận" body="Bản đồ có thể không còn khớp với bài học. Hãy phân tích lại và xác nhận." actions={ro ? null : <button type="button" className="btn btn-secondary btn-sm" onClick={analyse}><Icon name="refresh" className="icon-sm" /> Phân tích lại</button>} />
      : <Alert type="warn" title="Nội dung đã thay đổi — chưa thể xác nhận lại" body="Bản thử nghiệm chưa hỗ trợ phân tích hoặc kiểm tra lại bản đồ sau khi nội dung thay đổi. Bản phát hành đã xác nhận trước đó và dữ liệu học viên được giữ nguyên; chỉnh sửa bản nháp không bỏ qua điều kiện xác nhận hay xuất bản." />;
  } else if (pending) statusLine = <Alert type="accent" title={accepted ? `Đang duyệt dở dang (Partially accepted) — ${accepted} mục đã duyệt, còn ${pending} mục chờ xem lại` : `Sẵn sàng xem lại (Ready for review) — còn ${pending} mục chờ xem lại (nguồn chưa được xác minh)`} body={'Chấp nhận, sửa hoặc bỏ từng khái niệm và quan hệ "cần học trước". Bản đồ chỉ được dùng sau khi bạn xác nhận.'} />;
  else if (!cycle) statusLine = <Alert type="info" title="Đã xem lại mọi đề xuất" body={'Tất cả khái niệm và quan hệ đã được kiểm tra. Hãy bấm "Xác nhận bản đồ kiến thức" bên dưới để áp dụng.'} />;

  const confirmHint = cycle ? 'Cần giải quyết vòng lặp trước khi có thể xác nhận bản đồ.'
    : pending ? `Còn ${pending} đề xuất chưa duyệt. Chấp nhận hoặc bỏ các mục để hoàn tất.`
      : staleBlocked ? (run ? 'Nội dung đã thay đổi; hãy phân tích lại trước khi xác nhận.' : 'Nội dung đã thay đổi; bản thử nghiệm chưa hỗ trợ xác nhận lại.')
        : m.status === 'confirmed' ? 'Bản đồ đã được xác nhận và đang có hiệu lực.'
          : !live.length ? 'Chưa có bản đồ để xác nhận; chức năng tạo bản đồ chưa khả dụng.'
            : m.status !== 'ready' ? 'Trạng thái bản đồ hiện tại chưa cho phép xác nhận.'
              : 'Tất cả đề xuất đã được xem xét xong. Sẵn sàng xác nhận!';

  const actBtns = (kind, item) => (ro ? null : (
    <div className="tc-row-actions">
      {!kept(item) && item.review !== 'declined' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReview(item, 'accepted')}><Icon name="check" className="icon-sm" /> Chấp nhận</button>}
      {kind === 'concept' && item.review !== 'declined' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => rename(item)}><Icon name="pencil" className="icon-sm" /> Đổi tên</button>}
      {item.review !== 'declined' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(item, 'declined')}><Icon name="x-circle" className="icon-sm" /> {kind === 'concept' ? 'Bỏ khái niệm này' : 'Bỏ'}</button>
        : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(item, 'suggested')}><Icon name="rotate-ccw" className="icon-sm" /> Khôi phục</button>}
    </div>
  ));

  // chapter filter: concepts linked to a lesson of the chosen chapter
  const chapters = c.chapters;
  const chapterOf = new Map(chapters.flatMap((ch) => ch.lessons.map((l) => [l.id, ch.id])));
  const inChapter = (k) => kmapChapter === 'all' || (k.lessonIds || []).some((lid) => chapterOf.get(lid) === kmapChapter);
  const shown = live.filter(inChapter); const shownIds = new Set(shown.map((k) => k.id));
  const graphNodes = shown.map((k) => ({ id: k.id, label: k.name }));
  const graphEdges = activeEdges(m).filter((e) => shownIds.has(e.from) && shownIds.has(e.to)).map((e) => ({ from: e.from, to: e.to }));
  const selectedConcept = kmapSelectedNode ? m.concepts.find((k) => String(k.id) === String(kmapSelectedNode)) : null;
  const nodePanel = (
    <aside className="tc-kmap-panel card">
      {selectedConcept ? <>
        <div className="card-header"><div className="stack-1"><span className="xsmall muted">Chi tiết khái niệm</span><h3 className="small strong">{selectedConcept.name}</h3></div><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Đóng" onClick={() => selectNode('')}><Icon name="x" className="icon-sm" /></button></div>
        <div className="card-body stack-3">
          <div className="stack-1"><span className="xsmall muted">Trạng thái</span><span className={`badge ${reviewOf(selectedConcept.review)[1]}`} style={{ justifySelf: 'start' }}>{reviewOf(selectedConcept.review)[0]}</span></div>
          <div className="stack-1"><span className="xsmall muted">Bài học liên quan ({(selectedConcept.lessonIds || []).length})</span><ul className="list">{(selectedConcept.lessonIds || []).map((lid) => { const l = lessonOf(c, lid); return <li key={lid} className="small">{l ? l.title : ''}</li>; })}</ul></div>
          {actBtns('concept', selectedConcept)}
        </div>
      </> : <div className="card-body stack-1"><h3 className="small strong">Chưa chọn khái niệm</h3><p className="xsmall muted">Nhấp vào bất kỳ nút nào trên sơ đồ để xem thông tin chi tiết, bài học liên quan và chỉnh sửa.</p></div>}
    </aside>
  );
  const order = cycle ? null : (G && G.topoSortLessons ? G.topoSortLessons(m.concepts, m.edges, ls(c)) : topoLessons(c, m)) || [];

  return (
    <div className="stack-4">
      {trialNotice}
      {needsReconfirm && <Alert type="info" title="Cần xác nhận lại để áp dụng cho học viên" body="Bản đồ đã thay đổi sau lần xác nhận trước. Hãy kiểm tra và xác nhận lại; dữ liệu thành thạo và tiến độ hiện có không bị đặt lại." />}
      {statusLine}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!ro && pending > 0 && <button type="button" className="btn btn-secondary" onClick={acceptAll}><Icon name="check" className="icon-sm" /> Chấp nhận tất cả ({pending})</button>}
        {!ro && run && !staleBlocked && <button type="button" className="btn btn-ghost" onClick={analyse}><Icon name="refresh" className="icon-sm" /> Phân tích lại</button>}
        <div className="field" style={{ minWidth: 200 }}><label className="sr-only" htmlFor="km-ch">Lọc theo chương</label><select id="km-ch" value={kmapChapter} onChange={(e) => { kmapChapter = e.target.value; rerender(); }}><option value="all">Tất cả các chương</option>{chapters.map((ch, i) => <option key={ch.id} value={ch.id}>Chương {i + 1}: {ch.title}</option>)}</select></div>
        <span style={{ marginLeft: 'auto' }} />
        <div className="segmented" role="group" aria-label="Kiểu hiển thị">
          <button type="button" aria-pressed={kmapView === 'graph'} onClick={() => setView('graph')}>Dạng sơ đồ</button>
          <button type="button" aria-pressed={kmapView === 'list'} onClick={() => setView('list')}>Danh sách</button></div>
      </div>
      {cycle && <Alert type="danger" title={'Phát hiện vòng lặp phụ thuộc: ' + cycle.map((id) => cname(m, id)).join(' → ')} body="Đồ thị học tập không thể có chu trình tuần hoàn. Hãy bỏ hoặc sửa ít nhất một quan hệ để phá vòng lặp trước khi xác nhận bản đồ." />}
      {kmapView === 'graph' ? (
        <div className="tc-kmap-split">
          <div className="card tc-kmap-graph">
            <div className="card-header"><span className="small muted">{shown.length} khái niệm</span>
              <div className="row" style={{ gap: 4 }} role="group" aria-label="Thu phóng sơ đồ">
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => zoom(-ZOOM_STEP)} disabled={kmapZoom <= ZOOM_MIN} aria-label="Thu nhỏ"><Icon name="minus" className="icon-sm" /></button>
                <span className="xsmall muted tc-zoom-val">{Math.round(kmapZoom * 100)}%</span>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => zoom(ZOOM_STEP)} disabled={kmapZoom >= ZOOM_MAX} aria-label="Phóng to"><Icon name="plus" className="icon-sm" /></button></div></div>
            <div className="tc-kmap-viewport" onClick={onGraphClick}>
              {shown.length ? <div className="tc-kmap-canvas" style={{ transform: `scale(${kmapZoom})` }}><Html html={charts.graph({ nodes: graphNodes, edges: graphEdges, cycle: cycle || [], selected: kmapSelectedNode, onSelectAction: 'tc-kmap-select-node' })} /></div>
                : <p className="small muted" style={{ padding: 16 }}>Chương này chưa có khái niệm nào.</p>}
            </div>
          </div>
          {nodePanel}
        </div>
      ) : <>
        <section className="card"><div className="card-header"><h2 className="tc-h">Khái niệm ({live.length})</h2></div>
          <ul className="list">{m.concepts.filter(inChapter).map((k) => (
            <li key={k.id} className={`list-row ${k.review === 'declined' ? 'tc-declined' : ''}`}>
              <div className="list-main"><span className="row" style={{ gap: 8 }}><strong className="small">{k.name}</strong><span className={`badge ${reviewOf(k.review)[1]}`}>{reviewOf(k.review)[0]}</span></span>
                <span className="xsmall muted">Bài học: {(k.lessonIds || []).map((lid) => (lessonOf(c, lid) || {}).title).filter(Boolean).join(', ') || 'chưa gắn bài học'}</span></div>
              {actBtns('concept', k)}</li>
          ))}</ul></section>
        <section className="card"><div className="card-header"><h2 className="tc-h">Quan hệ &quot;cần học trước&quot; ({activeEdges(m).length})</h2></div>
          <ul className="list">{m.edges.map((e, i) => (
            <li key={e.from + '>' + e.to + i} className={`list-row ${e.review === 'declined' ? 'tc-declined' : ''}`}><div className="list-main"><span className="small"><strong>{cname(m, e.from)}</strong> cần học trước <strong>{cname(m, e.to)}</strong></span><span className={`badge ${reviewOf(e.review)[1]}`} style={{ justifySelf: 'start' }}>{reviewOf(e.review)[0]}</span></div>{actBtns('edge', e)}</li>
          ))}
            {!m.edges.length && <li className="list-row small muted">Chưa có quan hệ nào.</li>}</ul>
          {ro || live.length < 2 ? null : (
            <form className="card-footer" onSubmit={addEdge} style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }} key={live.map((k) => k.id).join('|')}>
              <label className="sr-only" htmlFor="edge-from">Khái niệm học trước</label><select id="edge-from" name="from" className="select" style={{ maxWidth: 220 }} defaultValue={live[0].id}>{live.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              <span className="small">cần học trước</span>
              <label className="sr-only" htmlFor="edge-to">Khái niệm học sau</label><select id="edge-to" name="to" className="select" style={{ maxWidth: 220 }} defaultValue={live[1].id}>{live.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              <button className="btn btn-secondary" type="submit"><Icon name="plus" className="icon-sm" /> Thêm quan hệ</button></form>
          )}
        </section>
        <section className="card"><div className="card-header"><h2 className="tc-h">Xem trước thứ tự học mặc định</h2></div><div className="card-body">
          {cycle ? <p className="small text-danger">Không thể tính toán thứ tự học khi sơ đồ vẫn còn vòng lặp.</p>
            : order.length ? <ol className="tc-order">{order.map((l) => <li key={l.id} className="small">{l.title}</li>)}</ol>
              : <p className="small muted">Chưa có bài học nào để sắp xếp.</p>}</div></section>
      </>}
      {!ro && m.status !== 'empty' && m.status !== 'analysing' && (
        <div className="card"><div className="card-body row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="stack-1"><strong className="small">Xác nhận bản đồ kiến thức</strong><span className="xsmall muted" role="status">{confirmHint}</span></div>
          <button type="button" className="btn btn-primary btn-lg" disabled={!canConfirm} onClick={confirmMap}><Icon name="check-circle" /> Xác nhận bản đồ kiến thức</button>
        </div></div>
      )}
    </div>
  );
}
