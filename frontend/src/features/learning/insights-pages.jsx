/**
 * S13b "Thống kê học tập" and S13c "Bản đồ kiến thức", the "Thống kê" and "Bản đồ kiến thức" tabs of "Kết quả học tập"
 * ('/progress?tab=stats|map'), plus the redirects from the old '/insights*' URLs. Ports real
 * app/insights/stats/learner-stats-view.tsx and components/knowledge-map(.tsx|-sections.tsx).
 * Data: GET /api/insights/stats?period=&course= (every number is computed on the server from stored study days,
 * submissions and mastery) and GET /api/insights/knowledge-map?course=. Days are GMT+7 calendar dates and weeks start
 * on Monday. Study time is not split per course (said on the page). Filters last for the browser session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { charts as ch } from '../../lib/charts';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Html, Icon, Mastery, SpinnerBlock, esc, masteryLabel } from '../../components/ui/primitives';
import { errorText } from './learning-store';

const PASS = 70; // quiz pass threshold used across the learner flows (real PASS_PERCENT)
const DAY = 86400000;
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const localDate = (iso) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);

// Filters kept in memory for this session (period, course, details open, selected quiz, map course).
const prefsMem = { period: '30', course: 'all', open: false, quiz: null, mapCourse: null };
function usePrefs() {
  const [p, setP] = useState(() => ({ ...prefsMem }));
  const setPref = useCallback((patch) => { Object.assign(prefsMem, patch); setP({ ...prefsMem }); }, []);
  return [p, setPref];
}

/** Chart HTML with native listeners: elements inside an HTML string are invisible to React's handlers. */
function ChartHtml({ html, onSelectChange, onAction, className, style }) {
  const ref = useRef(null);
  const handlers = useRef({ onSelectChange, onAction });
  handlers.current = { onSelectChange, onAction };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const change = (e) => { if (handlers.current.onSelectChange && e.target && e.target.tagName === 'SELECT') handlers.current.onSelectChange(e.target); };
    const click = (e) => { const t = e.target.closest && e.target.closest('[data-action]'); if (t && handlers.current.onAction) handlers.current.onAction(t.getAttribute('data-action'), t.getAttribute('data-id')); };
    el.addEventListener('change', change);
    el.addEventListener('click', click);
    return () => { el.removeEventListener('change', change); el.removeEventListener('click', click); };
  }, []);
  return <div ref={ref} className={className} style={style || { display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Toolbar({ courses, p, setPref }) {
  return (
    <div className="viz-toolbar" role="group" aria-label="Bộ lọc thống kê">
      <div className="viz-seg-ctrl" role="group" aria-label="Khoảng thời gian">{[['7', 'Tuần'], ['month', 'Tháng'], ['30', '30 ngày']].map(([v, l]) => (
        <button key={v} type="button" aria-pressed={String(p.period === v)} onClick={() => setPref({ period: v })}>{l}</button>
      ))}</div>
      <label className="sr-only" htmlFor="li-course">Khóa học</label>
      <select id="li-course" className="input" style={{ width: 'auto', minHeight: 40 }} value={p.course} onChange={(e) => setPref({ course: e.target.value, quiz: null })}>
        <option value="all">Tất cả khóa học</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </div>
  );
}

// ───────────────────────── S13b ─────────────────────────
/** Study statistics, shown as the "Thống kê" tab of "Kết quả học tập" (/progress?tab=stats). */
export function StatsPanel() {
  const [p, setPref] = usePrefs();
  const url = `/api/insights/stats?period=${encodeURIComponent(p.period)}&course=${encodeURIComponent(p.course)}`;
  const { data: d, loading, error, reload } = useApi(url);
  if (!d) {
    if (error) return <Alert type="danger" title="Chưa tải được thống kê" body={errorText(error, 'Không thể tải số liệu học tập.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />;
    return <SpinnerBlock text="Đang tải thống kê…" />;
  }
  const all = d.courses || [];
  if (!all.length) {
    return <div className="card"><Empty icon="bar-chart" title="Chưa có số liệu học tập" body="Đăng ký một khóa học, số liệu sẽ xuất hiện sau buổi học đầu tiên." actions={<Link className="btn btn-primary" to="/courses">Khám phá khóa học</Link>} /></div>;
  }
  // Window: [start, end) instants of Vietnam calendar days → inclusive local dates; "kỳ trước" = same length before.
  const start = localDate(d.window.start); const end = addDays(localDate(d.window.end), -1);
  const len = d.days.length || 1;
  const w = { len, start, end, prevStart: addDays(start, -len), prevEnd: addDays(start, -1) };
  const goalHours = (d.weeklyGoalMinutes || 300) / 60;
  const skills = d.skills.items.slice().sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'vi'));
  const activeDays = d.days.filter((x) => x.minutes > 0).length;

  if (!d.studyMinutes && !d.completedLessons && !skills.some((x) => x.level > 0)) {
    return (
      <div className="stack-4"><Toolbar courses={all} p={p} setPref={setPref} />
        <div className="card"><Empty icon="bar-chart" title="Chưa có hoạt động trong khoảng này" body="Học một bài là biểu đồ bắt đầu có số liệu. Thử chọn khoảng thời gian dài hơn." actions={<Link className="btn btn-primary" to="/dashboard">Học bài đầu tiên để xem thống kê</Link>} /></div></div>
    );
  }

  // C1 — KPI row
  const spark = d.days.slice(-12).map((x) => x.minutes);
  const c1 = `<div class="viz-kpis">
    ${ch.kpi({ label: 'Giờ học trong kỳ', value: d.studyMinutes / 60, prev: d.previousStudyMinutes / 60, format: (v) => Codi.fmt.num(Math.round(v * 10) / 10) + ' giờ', spark })}
    ${ch.kpi({ label: 'Chuỗi ngày học', value: d.streak.current, format: (v) => v + ' ngày', compare: false, note: `Dài nhất: ${d.streak.best} ngày` })}
    ${ch.kpi({ label: 'Bài hoàn thành', value: d.completedLessons, prev: d.previousCompletedLessons })}
    ${ch.kpi({ label: 'Kỹ năng thành thạo', value: `${d.skills.mastered}/${d.skills.total}`, compare: false, note: 'Mức "Thành thạo" trở lên' })}
  </div>`;

  // C2 — minutes per day (Tuần) or hours per Monday-week, goal dashed
  const goalNote = d.weeklyGoalSet ? null : 'Bạn chưa đặt mục tiêu, Codi tạm dùng 5 giờ/tuần (mặc định).';
  let c2;
  const weekday = (x) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${x}T00:00:00Z`).getUTCDay()];
  if (p.period === '7') {
    const items = d.days.map((x) => ({ label: `${weekday(x.date)} ${dm(x.date)}`, value: x.minutes }));
    c2 = { title: 'Phút học mỗi ngày', question: 'Mỗi ngày bạn học bao lâu so với mục tiêu?', body: ch.bars({ items, goal: Math.round((goalHours * 60) / 7), goalLabel: 'Mục tiêu/ngày', format: (v) => v + ' phút', capFormat: (v) => String(v), ariaLabel: 'Phút học mỗi ngày' }), table: { headers: ['Ngày', 'Phút'], rows: d.days.map((x) => [dm(x.date), String(x.minutes)]) }, note: goalNote };
  } else {
    const items = d.weeks.slice(-6).map((x) => ({ label: 'Tuần ' + dm(x.weekStart), value: Math.round((x.minutes / 60) * 10) / 10 }));
    c2 = { title: 'Giờ học mỗi tuần', question: 'Bạn có đạt mục tiêu giờ học hằng tuần?', body: ch.bars({ items, goal: goalHours, goalLabel: d.weeklyGoalSet ? 'Mục tiêu tuần' : 'Mục tiêu tuần (mặc định)', format: (v) => Codi.fmt.num(v) + ' giờ', capFormat: (v) => Codi.fmt.num(v), ariaLabel: 'Giờ học mỗi tuần' }), table: { headers: ['Tuần', 'Giờ học'], rows: items.map((i) => [i.label, Codi.fmt.num(i.value)]) }, note: [goalNote, 'Tuần gần nhất có thể chưa kết thúc.'].filter(Boolean).join(' ') };
  }

  // C3 — calendar: studied days only
  const calDays = (d.calendar || []).filter((x) => x.minutes > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const c3 = { title: 'Lịch học', question: `Chuỗi hiện tại: ${d.streak.current} ngày liên tiếp`, body: ch.calendar({ days: calDays.map((x) => ({ date: x.date, value: x.minutes })), today: w.end, unit: 'phút', ariaLabel: 'Lịch học theo ngày' }), table: { headers: ['Ngày', 'Phút'], rows: calDays.map((x) => [dm(x.date), String(x.minutes)]) } };

  // C4 — mastery per concept (the backend keeps no per-moment history, so there is no entry-test marker)
  const showName = p.course === 'all' && all.length > 1;
  const c4items = skills.map((x) => ({ label: showName ? `${x.name} · ${x.courseTitle}` : x.name, value: x.level, max: 4, text: masteryLabel(x.level), tip: `Mức ${x.level}/4` }));
  const c4 = {
    title: 'Mức thành thạo theo kỹ năng', question: 'Kỹ năng nào vững, kỹ năng nào cần ôn?', state: skills.length ? 'ok' : 'empty', emptyText: 'Chưa có kỹ năng nào được ghi nhận.',
    body: ch.hbars({ items: c4items, emptyText: 'Chưa có kỹ năng nào được ghi nhận.', sort: false }),
    note: d.diagnosticSkipped ? 'Bạn đã bỏ qua bài kiểm tra đầu vào nên không có mốc so sánh. Có thể làm lại từ trang lộ trình.'
      : 'Vạch mốc lúc làm bài đầu vào chưa khả dụng: hệ thống chưa lưu mức thành thạo theo từng thời điểm.',
    table: { headers: ['Kỹ năng', 'Mức hiện tại'], rows: c4items.map((i) => [i.label, i.text]) },
  };

  // C5 — latest quiz attempt per lesson and coding results, dashed pass threshold
  const scores = d.scores || [];
  const pts = scores.map((s, i) => ({ x: i, y: s.percent, label: `#${i + 1}`, note: `${s.kind}: ${s.label}` }));
  const passRate = scores.length ? (scores.filter((s) => s.percent >= PASS).length / scores.length) * 100 : 0;
  const c5 = {
    title: 'Điểm quiz & bài code theo thời gian', question: 'Điểm của bạn có ổn định trên ngưỡng đạt?', sample: scores.length,
    body: scores.length ? `<div class="viz-tiles" style="margin-bottom:12px">
        <div class="viz-tile"><span class="viz-tile-label">Trung bình</span><span class="viz-tile-value">${Math.round(scores.reduce((s, x) => s + x.percent, 0) / scores.length)}%</span></div>
        <div class="viz-tile"><span class="viz-tile-label">Cao nhất</span><span class="viz-tile-value">${Math.max(...scores.map((s) => s.percent))}%</span></div>
        <div class="viz-tile"><span class="viz-tile-label">Tỉ lệ đạt (≥ ${PASS}%)</span><span class="viz-tile-value">${Math.round(passRate)}%</span></div></div>
      ${ch.line({ series: [{ name: 'Điểm', points: pts }], threshold: { value: PASS, label: `Ngưỡng đạt ${PASS}%` }, yFormat: (v) => Math.round(v) + '%', ariaLabel: 'Điểm theo lượt làm' })}` : '',
    state: scores.length ? 'ok' : 'empty', emptyText: 'Bạn chưa nộp quiz hay bài code nào.',
    table: { headers: ['Lượt', 'Loại', 'Bài', 'Điểm'], rows: scores.map((s, i) => [`#${i + 1}`, s.kind, s.label, s.percent + '%']) },
  };

  // C6 — one quiz at a time: Đúng / Sai / Chưa biết
  const quizzes = d.quizzes || [];
  const sel = quizzes.find((q) => q.id === p.quiz) || quizzes[quizzes.length - 1];
  const c6 = {
    title: 'Kết quả một bài quiz', question: 'Bạn đúng, sai bao nhiêu câu ở bài đã chọn?',
    actions: quizzes.length > 1 ? `<label class="sr-only" for="li-quiz">Chọn bài quiz</label><select id="li-quiz" class="input" style="width:auto;max-width:220px;min-height:36px">${quizzes.map((q) => `<option value="${esc(q.id)}"${sel && q.id === sel.id ? ' selected' : ''}>${esc(q.label)}</option>`).join('')}</select>` : '',
    body: sel ? ch.donut({ ...sel }) : '', state: sel ? 'ok' : 'empty', emptyText: 'Chưa có bài quiz nào được nộp.',
    table: sel ? { headers: ['Kết quả', 'Số câu'], rows: [['Đúng', String(sel.correct)], ['Sai', String(sel.wrong)], ['Chưa biết', String(sel.unknown)]] } : null,
  };

  const onQuizChange = (el) => { if (el.id === 'li-quiz') setPref({ quiz: el.value }); };
  return (
    <div className="stack-4">
      <div className="stack-2"><Toolbar courses={all} p={p} setPref={setPref} />
      <p className="small muted">{dm(w.start)} – {dm(w.end)} · so với {dm(w.prevStart)} – {dm(w.prevEnd)}{p.course !== 'all' ? ' · Giờ học tính trên mọi khóa (thời gian học chưa tách theo khóa).' : ''}{loading ? ' · Đang cập nhật…' : ''}</p></div>
      {error && <Alert type="danger" body={errorText(error, 'Không thể tải số liệu học tập.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Thử lại</button>} />}
      {activeDays > 0 && activeDays < 3 && <p className="viz-warn"><span aria-hidden="true">▲</span> Mới có {activeDays} ngày học trong khoảng này — biểu đồ sẽ rõ hơn sau vài buổi học nữa.</p>}
      <Html html={ch.card({ title: 'Tóm tắt kỳ này', body: c1, wide: true })} style={{ display: 'contents' }} />
      <Html className="viz-grid-cards" html={ch.card({ ...c2 }) + ch.card({ ...c3 }) + ch.card({ wide: true, ...c4 })} />
      <div className="viz-section-head"><h2>Chi tiết thêm</h2>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={String(!!p.open)} onClick={() => setPref({ open: !p.open })}><Icon name={p.open ? 'chevron-down' : 'chevron-right'} className="icon-sm" /> {p.open ? 'Thu gọn' : 'Xem chi tiết (2 thẻ)'}</button></div>
      {p.open && (
        <div className="viz-grid-cards">
          <ChartHtml html={ch.card({ wide: true, ...c5 }) + ch.card({ wide: true, ...c6 })} onSelectChange={onQuizChange} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── S13c Bản đồ kiến thức ─────────────────────────
const ancestorsOf = (edges, id) => {
  const out = new Set();
  const visit = (n) => { if (out.has(n)) return; out.add(n); edges.filter((e) => e.to === n).forEach((e) => visit(e.from)); };
  if (id != null) visit(id);
  return out;
};

function ConceptDetails({ courseId, node }) {
  return (
    <section className="card" aria-live="polite"><div className="card-body stack-3">
      <h2 className="ln-h">{node.label}</h2>
      <div className="row ln-gap-2"><Mastery level={node.mastery} />{node.recommended && <span className="small row ln-gap-1 text-accent"><Icon name="arrow-right" className="icon-sm" /> Bài học được gợi ý</span>}</div>
      <p className="small muted">{node.evidence ? `${node.evidence} bằng chứng · Xác suất BKT ${Math.round((node.p || 0) * 100)}%` : 'Chưa có bằng chứng học tập.'}</p>
      <h3 className="small strong">Bài học liên quan</h3>
      {!node.lessons.length && <p className="small muted">Chưa có bài được xuất bản cho khái niệm này.</p>}
      <ul className="list stack-2">{node.lessons.map((l) => (
        <li key={l.id} className="row-between ln-wrap ln-gap-2">
          <span className="small od-fill">{l.title}{l.locked && <span className="xsmall muted ln-block">Chưa đủ tiên quyết · nên học bài tiên quyết trước</span>}</span>
          <Link className={`btn btn-sm ${l.locked ? 'btn-secondary' : 'btn-primary'}`} to={`/learn/${courseId}/${l.id}`} aria-label={`Học bài này: ${l.title}`}>Học bài này <Icon name="arrow-right" className="icon-sm" /></Link>
        </li>
      ))}</ul>
    </div></section>
  );
}

/**
 * Knowledge map of one course (GET /api/insights/knowledge-map?course=…). With `onCourseChange` the caller owns the
 * course (the "Bản đồ kiến thức" tab keeps it in the URL); otherwise the picker remembers it for the session.
 */
export function KnowledgeMap({ initialCourseId, embedded, onCourseChange }) {
  const [p, setPref] = usePrefs();
  const [selected, setSelected] = useState(null);
  const wanted = embedded || onCourseChange ? initialCourseId : (p.mapCourse || initialCourseId);
  const { data: km, loading, error, reload } = useApi(`/api/insights/knowledge-map${wanted ? `?course=${encodeURIComponent(wanted)}` : ''}`);
  useEffect(() => { setSelected(null); }, [km && km.courseId]);
  if (!km) {
    if (error) return <Alert type="danger" body={errorText(error, 'Không thể tải bản đồ.')} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading} aria-busy={loading || undefined}>Thử lại</button>} />;
    return <SpinnerBlock text="Đang tải bản đồ kiến thức…" />;
  }
  const all = km.courses || [];
  const courseId = km.courseId;
  if (!courseId) {
    return (
      <div className="card"><Empty icon="map" title="Chưa có bản đồ kiến thức" body="Hãy đăng ký một khoá học để theo dõi các khái niệm của bạn." actions={<Link className="btn btn-secondary" to="/courses">Khám phá khóa học</Link>} /></div>
    );
  }
  const picker = !embedded && all.length > 1 && (
    <div className="viz-toolbar"><label className="sr-only" htmlFor="li-map">Khoá học</label>
      <select id="li-map" className="input" style={{ width: 'auto', maxWidth: '100%', minHeight: 40 }} value={courseId} onChange={(e) => (onCourseChange ? onCourseChange(e.target.value) : setPref({ mapCourse: e.target.value }))}>
        <option value="" disabled>Chọn khoá học</option>
        {all.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select></div>
  );
  if (!km.confirmed || !km.nodes.length) {
    return (
      <div className="stack-4">{picker}
        <div className="card"><Empty icon="map" title="Chưa có bản đồ kiến thức" body="Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết của khoá học." actions={<Link className="btn btn-secondary" to={`/learn/${courseId}`}>Về lộ trình</Link>} /></div>
      </div>
    );
  }
  const edges = km.edges;
  const nodes = km.nodes.map((n) => ({ id: n.id, label: n.name, mastery: n.level, locked: n.locked, recommended: n.recommended, lessons: n.lessons, p: n.probability, evidence: n.evidenceCount }));
  const pre = (id) => edges.filter((e) => e.to === id).map((e) => e.from);
  const node = nodes.find((n) => n.id === selected);
  const anc = ancestorsOf(edges, selected);
  const next = nodes.filter((n) => !n.locked && n.mastery < 3).sort((a, b) => a.mastery - b.mastery)[0];
  const lockedText = (n) => (n.locked ? 'Chưa đủ tiên quyết' : masteryLabel(n.mastery));
  const graphHtml = ch.graph({ nodes: nodes.map(({ id, label, mastery, locked }) => ({ id, label, mastery, locked })), edges, selected, highlightPath: selected != null ? Array.from(anc) : [], onSelectAction: 'km-select', ariaLabel: 'Sơ đồ khái niệm, cuộn để xem toàn bộ' })
    .replace(/Chưa mở khoá/g, 'Chưa đủ tiên quyết');
  const graphCard = ch.card({
    title: km.title, question: `${nodes.filter((n) => n.mastery >= 3).length}/${nodes.length} khái niệm đã thành thạo · ${nodes.filter((n) => n.locked).length} chưa đủ tiên quyết`,
    body: graphHtml, wide: true,
    table: { headers: ['Khái niệm', 'Mức thành thạo', 'Cần học trước'], rows: nodes.map((n) => [n.label + (n.recommended ? ' · Bài học được gợi ý' : ''), lockedText(n), pre(n.id).map((f) => (nodes.find((k) => k.id === f) || {}).label).join(', ') || '—']) },
  });
  const short = (n) => (n.locked ? 'Chưa đủ tiên quyết' : n.mastery === 0 ? 'Chưa học' : n.mastery < 3 ? 'Đang học' : 'Thành thạo');
  const barsCard = ch.card({ title: 'Theo mức thành thạo', body: ch.hbars({ items: nodes.slice().sort((a, b) => b.mastery - a.mastery).map((n) => ({ label: n.label, value: n.mastery, max: 4, text: short(n) })), sort: false }), wide: true });
  // Graph node ids come back from the HTML as strings.
  const onAction = (action, id) => { if (action === 'km-select') { const n = Number(id); setSelected((s) => (s === n ? null : n)); } };
  return (
    <div className="stack-4">
      {picker}
      {next && <p className="small row ln-gap-1" style={{ margin: 0 }}><Icon name="lightbulb" className="icon-sm" /> <span>Nên ôn tiếp: <strong>{next.label}</strong> ({masteryLabel(next.mastery)}).</span></p>}
      <ChartHtml html={graphCard} onAction={onAction} />
      {!node && <p className="xsmall muted" style={{ margin: 0 }}>Chọn một khái niệm để xem bằng chứng và bài học liên quan.</p>}
      {node && <ConceptDetails courseId={courseId} node={node} />}
      <Html html={barsCard} style={{ display: 'contents' }} />
    </div>
  );
}

/**
 * The old /insights, /insights/stats and /insights/knowledge-map pages now live as tabs of "Kết quả học tập";
 * links to them land on the matching tab (a ?course= on the map is kept).
 */
export function InsightsRedirect({ query, tab }) {
  const q = new URLSearchParams({ tab });
  if (tab === 'map' && query && query.course) q.set('course', query.course);
  return <Navigate to={`/progress?${q.toString()}`} replace />;
}

