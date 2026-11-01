/**
 * S13b "Thống kê học tập" ('/insights/stats'), S13c "Bản đồ kiến thức của tôi" ('/insights/knowledge-map') and the
 * '/insights' hub. Ports real app/insights/stats/learner-stats-view.tsx + lib/learner-insights-service.ts and
 * components/knowledge-map(.tsx|-sections.tsx).
 *
 * Every number comes from stored data: db.learnerStudyDays (seconds, or seed minutes), the learning record
 * (state.learning, or db.learnerSeed before the learner opened the course), db.codeAttempts. Days are GMT+7 calendar
 * dates and weeks start on Monday. Study time is not split per course (said on the page).
 * The period ends on the later of db.analyticsAsOf (seed "as of" date) and the learner's latest study day.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { charts as ch } from '../../lib/charts';
import { Alert, Empty, Html, Icon, Mastery, esc, masteryLabel } from '../../components/ui/primitives';
import { currentLessonId, lockInfo } from './learning-store';
import { addDays, roundMinutes, secondsByDate, today } from './study-time';

const PASS = 70; // quiz pass threshold used across the learner flows (real PASS_PERCENT)
const MASTERED = 3;

const uid = () => Codi.state.currentUserId;
const prefs = () => Codi.ensure('learnerStatsPrefs', () => ({ period: '30', course: 'all', open: false, quiz: null, mapCourse: null }));
const setPref = (patch) => Codi.set(() => { Object.assign(prefs(), patch); });
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const weekStartOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const localDate = (iso) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const enrolledCourses = () => Codi.db().enrolments.filter((e) => e.userId === uid()).map((e) => Codi.course(e.courseId)).filter(Boolean);

// The learning record lives in state.learning once the learner opened the course; before that, read the seed.
function record(c) {
  const all = (Codi.state.learning || {})[uid()];
  if (all && all[c.id]) return all[c.id];
  const seed = Codi.db().learnerSeed; const s = seed && seed.userId === uid() && seed.courses && seed.courses[c.id];
  if (!s) return { mastery: {}, bkt: {}, quiz: {}, completed: [], completedAt: {}, diag: { status: 'none', answers: {} }, diagMastery: null, goal: null, order: [], skippable: [], pathStatus: 'none' };
  const quiz = {}; Object.keys(s.quizScores).forEach((lid) => { quiz[lid] = { submitted: true, score: s.quizScores[lid] }; });
  return {
    mastery: s.mastery, bkt: s.bkt || {}, quiz, completed: s.completed, completedAt: s.completedAt || {},
    diag: { status: s.diagnostic ? 'done' : 'none', answers: {} }, diagMastery: s.diagnosticMastery || null, goal: s.goal,
    order: [], skippable: [], pathStatus: s.pathStatus || 'ready', studied: s.studied || [],
  };
}
// Diagnostic counts: from the stored answers, else the seed summary.
function diagCounts(c, r) {
  const qs = (c.entryTest && c.entryTest.questions) || [];
  const answers = (r.diag && r.diag.answers) || {};
  if (qs.length && Object.keys(answers).length) {
    let right = 0; let wrong = 0; let unknown = 0;
    qs.forEach((q) => { const a = answers[q.id]; if (a === undefined || a === 'unknown') unknown++; else if (a === q.correctIndex) right++; else wrong++; });
    return { right, wrong, unknown };
  }
  const seed = Codi.db().learnerSeed; const s = seed && seed.userId === uid() && seed.courses && seed.courses[c.id];
  return s && s.diagnostic && s.diagnostic.right != null ? s.diagnostic : null;
}

function asOf() {
  const seedAsOf = Codi.db().analyticsAsOf || today();
  const studied = Array.from(secondsByDate(uid())).filter(([, s]) => s > 0).map(([d]) => d).sort();
  const latest = studied[studied.length - 1];
  return latest && latest > seedAsOf ? latest : seedAsOf;
}
// Real analyticsWindow: 7 days, calendar month to date, or 30 days; "kỳ trước" = same length before.
function windows() {
  const end = asOf(); const p = prefs().period;
  const len = p === '7' ? 7 : p === 'month' ? Number(end.slice(8, 10)) : 30;
  const start = addDays(end, -(len - 1));
  return { len, start, end, prevStart: addDays(start, -len), prevEnd: addDays(start, -1) };
}

function streakInfo(byDate, end) {
  const studied = new Set(Array.from(byDate).filter(([, s]) => s > 0).map(([d]) => d));
  let cur = 0; let day = studied.has(end) ? end : addDays(end, -1);
  while (studied.has(day)) { cur += 1; day = addDays(day, -1); }
  let best = 0; let run = 0; let prev = '';
  Array.from(studied).sort().forEach((d) => { run = prev && d === addDays(prev, 1) ? run + 1 : 1; best = Math.max(best, run); prev = d; });
  return { cur, best };
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

function Toolbar({ courses }) {
  const p = prefs();
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
export function StatsPage() {
  useCodi();
  const all = enrolledCourses();
  if (!all.length) {
    return <div className="page"><Empty icon="bar-chart" title="Chưa có số liệu học tập" body="Đăng ký một khóa học, số liệu sẽ xuất hiện sau buổi học đầu tiên." actions={<Link className="btn btn-primary" to="/courses">Khám phá khóa học</Link>} /></div>;
  }
  const p = prefs();
  if (p.course !== 'all' && !all.some((c) => c.id === p.course)) p.course = 'all';
  const courses = p.course === 'all' ? all : all.filter((c) => c.id === p.course);
  const w = windows();
  const byDate = secondsByDate(uid());
  const secondsBetween = (a, b) => Array.from(byDate).filter(([d]) => d >= a && d <= b).reduce((s, [, v]) => s + v, 0);
  const days = [];
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) days.push({ date: d, minutes: roundMinutes(byDate.get(d) || 0) });
  const studyMinutes = roundMinutes(secondsBetween(w.start, w.end));
  const prevMinutes = roundMinutes(secondsBetween(w.prevStart, w.prevEnd));
  const activeDays = days.filter((d) => d.minutes > 0).length;
  const completions = courses.flatMap((c) => { const r = record(c); return r.completed.map((lid) => (r.completedAt || {})[lid]).filter(Boolean).map(localDate); });
  const doneIn = (a, b) => completions.filter((d) => d >= a && d <= b).length;
  const concepts = courses.flatMap((c) => { const r = record(c); return (c.concepts || []).map((k) => ({ k, c, r, lv: r.mastery[k.id] || 0 })); })
    .sort((a, b) => b.lv - a.lv || a.k.name.localeCompare(b.k.name, 'vi'));
  const mastered = concepts.filter((x) => x.lv >= MASTERED).length;
  const goalRec = courses.map(record).find((r) => r.goal && r.goal.hours);
  const goalHours = goalRec ? goalRec.goal.hours : 5;
  const st = streakInfo(byDate, w.end);

  if (!studyMinutes && !doneIn(w.start, w.end) && !concepts.some((x) => x.lv > 0)) {
    return (
      <div className="page stack-4"><div className="page-header"><div><h1>Thống kê học tập</h1></div></div><Toolbar courses={all} />
        <Empty icon="bar-chart" title="Chưa có hoạt động trong khoảng này" body="Học một bài là biểu đồ bắt đầu có số liệu. Thử chọn khoảng thời gian dài hơn." actions={<Link className="btn btn-primary" to="/dashboard">Học bài đầu tiên để xem thống kê</Link>} /></div>
    );
  }

  // C1 — KPI row
  const spark = days.slice(-12).map((d) => d.minutes);
  const c1 = `<div class="viz-kpis">
    ${ch.kpi({ label: 'Giờ học trong kỳ', value: studyMinutes / 60, prev: prevMinutes / 60, format: (v) => Codi.fmt.num(Math.round(v * 10) / 10) + ' giờ', spark })}
    ${ch.kpi({ label: 'Chuỗi ngày học', value: st.cur, format: (v) => v + ' ngày', compare: false, note: `Dài nhất: ${st.best} ngày` })}
    ${ch.kpi({ label: 'Bài hoàn thành', value: doneIn(w.start, w.end), prev: doneIn(w.prevStart, w.prevEnd) })}
    ${ch.kpi({ label: 'Kỹ năng thành thạo', value: `${mastered}/${concepts.length}`, compare: false, note: 'Mức "Thành thạo" trở lên' })}
  </div>`;

  // C2 — minutes per day (Tuần) or hours per Monday-week (6 weeks), goal dashed
  const goalNote = goalRec ? null : 'Bạn chưa đặt mục tiêu, Codi tạm dùng 5 giờ/tuần (Giả định).';
  let c2;
  const weekday = (d) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${d}T00:00:00Z`).getUTCDay()];
  if (w.len === 7) {
    const items = days.map((d) => ({ label: `${weekday(d.date)} ${dm(d.date)}`, value: d.minutes }));
    c2 = { title: 'Phút học mỗi ngày', question: 'Mỗi ngày bạn học bao lâu so với mục tiêu?', body: ch.bars({ items, goal: Math.round((goalHours * 60) / 7), goalLabel: 'Mục tiêu/ngày', format: (v) => v + ' phút', capFormat: (v) => String(v), ariaLabel: 'Phút học mỗi ngày' }), table: { headers: ['Ngày', 'Phút'], rows: days.map((d) => [dm(d.date), String(d.minutes)]) }, note: goalNote };
  } else {
    const thisWeek = weekStartOf(w.end);
    const weeks = [];
    for (let i = 5; i >= 0; i--) { const ws = addDays(thisWeek, -7 * i); const we = addDays(ws, 6); weeks.push({ start: ws, minutes: roundMinutes(secondsBetween(ws, we < w.end ? we : w.end)) }); }
    const items = weeks.map((x) => ({ label: 'Tuần ' + dm(x.start), value: Math.round((x.minutes / 60) * 10) / 10 }));
    c2 = { title: 'Giờ học mỗi tuần', question: 'Bạn có đạt mục tiêu giờ học hằng tuần?', body: ch.bars({ items, goal: goalHours, goalLabel: goalRec ? 'Mục tiêu tuần' : 'Mục tiêu tuần (Giả định)', format: (v) => Codi.fmt.num(v) + ' giờ', capFormat: (v) => Codi.fmt.num(v), ariaLabel: 'Giờ học mỗi tuần' }), table: { headers: ['Tuần', 'Giờ học'], rows: items.map((i) => [i.label, Codi.fmt.num(i.value)]) }, note: [goalNote, 'Tuần gần nhất có thể chưa kết thúc.'].filter(Boolean).join(' ') };
  }

  // C3 — calendar: at least 28 days, studied days only
  const calFrom = addDays(w.end, -27) < w.start ? addDays(w.end, -27) : w.start;
  const calDays = Array.from(byDate).filter(([d, s]) => s > 0 && d >= calFrom && d <= w.end).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, s]) => ({ date, minutes: roundMinutes(s) }));
  const c3 = { title: 'Lịch học', question: `Chuỗi hiện tại: ${st.cur} ngày liên tiếp`, body: ch.calendar({ days: calDays.map((d) => ({ date: d.date, value: d.minutes })), today: w.end, unit: 'phút', ariaLabel: 'Lịch học theo ngày' }), table: { headers: ['Ngày', 'Phút'], rows: calDays.map((d) => [dm(d.date), String(d.minutes)]) } };

  // C4 — mastery per concept; dashed marker = level stored right after the entry test (hidden when skipped/missing)
  const allSkipped = courses.some((c) => record(c).diag.status === 'skipped') && courses.every((c) => record(c).diag.status !== 'done');
  const showName = p.course === 'all' && all.length > 1;
  const c4items = concepts.map((x) => {
    const base = x.r.diag.status === 'done' && x.r.diagMastery ? x.r.diagMastery[x.k.id] : null;
    return {
      label: showName ? `${x.k.name} · ${x.c.title}` : x.k.name, value: x.lv, max: 4, text: masteryLabel(x.lv),
      marker: base != null ? base : null, markerLabel: 'Lúc làm bài đầu vào', markerText: base != null ? masteryLabel(base) : '', tip: `Mức ${x.lv}/4`,
    };
  });
  const hasMarker = c4items.some((i) => i.marker != null);
  const c4 = {
    title: 'Mức thành thạo theo kỹ năng', question: 'Kỹ năng nào vững, kỹ năng nào cần ôn?', state: concepts.length ? 'ok' : 'empty', emptyText: 'Chưa có kỹ năng nào được ghi nhận.',
    body: ch.hbars({ items: c4items, emptyText: 'Chưa có kỹ năng nào được ghi nhận.', sort: false })
      + (hasMarker ? '<div class="viz-legend-inline" style="margin-top:8px"><span class="viz-marker-key" aria-hidden="true"></span> Vạch đứt: mức lúc làm bài kiểm tra đầu vào</div>' : ''),
    note: allSkipped ? 'Bạn đã bỏ qua bài kiểm tra đầu vào nên không có mốc so sánh. Có thể làm lại từ trang lộ trình.'
      : hasMarker ? 'Mốc đầu vào được suy ra từ kết quả bài kiểm tra đầu vào.' : 'Vạch mốc lúc làm bài đầu vào chưa khả dụng: hệ thống chưa lưu mức thành thạo theo từng thời điểm.',
    table: { headers: hasMarker ? ['Kỹ năng', 'Mức hiện tại', 'Lúc làm bài đầu vào'] : ['Kỹ năng', 'Mức hiện tại'], rows: c4items.map((i) => (hasMarker ? [i.label, i.text, i.marker != null ? i.markerText : '—'] : [i.label, i.text])) },
  };

  // C5 — latest quiz attempt per lesson (entry test excluded) and coding results, dashed pass threshold
  const scores = [];
  courses.forEach((c) => {
    const r = record(c); const order = c.chapters.flatMap((chp) => chp.lessons.map((l) => l.id));
    Object.keys(r.quiz || {}).filter((lid) => r.quiz[lid].submitted).sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((lid) => { const l = Codi.lesson(c, lid); scores.push({ label: l ? l.title : lid, kind: 'Quiz', y: Math.round(r.quiz[lid].score) }); });
    (Codi.db().codeAttempts || []).filter((a) => a.userId === uid() && a.courseId === c.id && a.submits).forEach((a) => { const l = Codi.lesson(c, a.lessonId); scores.push({ label: l ? l.title : a.lessonId, kind: 'Bài code', y: Math.round(a.bestScore || 0) }); });
  });
  const pts = scores.map((s, i) => ({ x: i, y: s.y, label: `#${i + 1}`, note: `${s.kind}: ${s.label}` }));
  const passRate = scores.length ? (scores.filter((s) => s.y >= PASS).length / scores.length) * 100 : 0;
  const c5 = {
    title: 'Điểm quiz & bài code theo thời gian', question: 'Điểm của bạn có ổn định trên ngưỡng đạt?', sample: scores.length,
    body: scores.length ? `<div class="viz-tiles" style="margin-bottom:12px">
        <div class="viz-tile"><span class="viz-tile-label">Trung bình</span><span class="viz-tile-value">${Math.round(scores.reduce((s, x) => s + x.y, 0) / scores.length)}%</span></div>
        <div class="viz-tile"><span class="viz-tile-label">Cao nhất</span><span class="viz-tile-value">${Math.max(...scores.map((s) => s.y))}%</span></div>
        <div class="viz-tile"><span class="viz-tile-label">Tỉ lệ đạt (≥ ${PASS}%)</span><span class="viz-tile-value">${Math.round(passRate)}%</span></div></div>
      ${ch.line({ series: [{ name: 'Điểm', points: pts }], threshold: { value: PASS, label: `Ngưỡng đạt ${PASS}%` }, yFormat: (v) => Math.round(v) + '%', ariaLabel: 'Điểm theo lượt làm' })}` : '',
    state: scores.length ? 'ok' : 'empty', emptyText: 'Bạn chưa nộp quiz hay bài code nào.',
    table: { headers: ['Lượt', 'Loại', 'Bài', 'Điểm'], rows: scores.map((s, i) => [`#${i + 1}`, s.kind, s.label, s.y + '%']) },
  };

  // C6 — one quiz at a time: Đúng / Sai / Chưa biết (stored answers; seed scores only give the totals)
  const quizzes = [];
  courses.forEach((c) => {
    const r = record(c);
    const dc = r.diag.status === 'done' ? diagCounts(c, r) : null;
    if (dc) quizzes.push({ id: c.id + ':diag', label: `Bài kiểm tra đầu vào · ${c.title}`, correct: dc.right, wrong: dc.wrong, unknown: dc.unknown });
    Object.keys(r.quiz || {}).filter((lid) => r.quiz[lid].submitted).forEach((lid) => {
      const l = Codi.lesson(c, lid); const q = r.quiz[lid];
      const qs = (q.questions && q.questions.length ? q.questions : l && l.quiz ? l.quiz.questions : []) || [];
      const answers = q.answers || {};
      let ok; const n = qs.length || 4;
      if (Object.keys(answers).length) { ok = qs.filter((x) => answers[x.id] === x.correctIndex).length; }
      else ok = Math.round((q.score / 100) * n);
      quizzes.push({ id: c.id + ':' + lid, label: l ? l.title : lid, correct: ok, wrong: n - ok, unknown: 0 });
    });
  });
  const sel = quizzes.find((q) => q.id === p.quiz) || quizzes[quizzes.length - 1];
  const c6 = {
    title: 'Kết quả một bài quiz', question: 'Bạn đúng, sai bao nhiêu câu ở bài đã chọn?',
    actions: quizzes.length > 1 ? `<label class="sr-only" for="li-quiz">Chọn bài quiz</label><select id="li-quiz" class="input" style="width:auto;max-width:220px;min-height:36px">${quizzes.map((q) => `<option value="${esc(q.id)}"${sel && q.id === sel.id ? ' selected' : ''}>${esc(q.label)}</option>`).join('')}</select>` : '',
    body: sel ? ch.donut({ ...sel }) : '', state: sel ? 'ok' : 'empty', emptyText: 'Chưa có bài quiz nào được nộp.',
    table: sel ? { headers: ['Kết quả', 'Số câu'], rows: [['Đúng', String(sel.correct)], ['Sai', String(sel.wrong)], ['Chưa biết', String(sel.unknown)]] } : null,
  };

  const onQuizChange = (el) => { if (el.id === 'li-quiz') setPref({ quiz: el.value }); };
  return (
    <div className="page stack-4">
      <div className="page-header"><div><h1>Thống kê học tập</h1><p className="muted">Bạn học đều đặn đến đâu và kỹ năng nào đang lên.</p></div><Link className="btn btn-secondary" to="/insights/knowledge-map"><Icon name="map" className="icon-sm" /> Bản đồ kiến thức</Link></div>
      <div className="stack-2"><Toolbar courses={all} />
      <p className="small muted">{dm(w.start)} – {dm(w.end)} · so với {dm(w.prevStart)} – {dm(w.prevEnd)}{p.course !== 'all' ? ' · Giờ học tính trên mọi khóa (thời gian học chưa tách theo khóa).' : ''}</p></div>
      {activeDays > 0 && activeDays < 3 && <p className="viz-warn"><span aria-hidden="true">▲</span> Mới có {activeDays} ngày học trong khoảng này — biểu đồ sẽ rõ hơn sau vài buổi học nữa.</p>}
      <Html html={ch.card({ title: 'Tóm tắt kỳ này', body: c1, wide: true })} style={{ display: 'contents' }} />
      <Html className="viz-grid-cards" html={ch.card({ ...c2 }) + ch.card({ ...c3 }) + ch.card({ wide: true, ...c4 })} />
      <div className="viz-section-head"><h2>Chi tiết thêm</h2>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={String(!!p.open)} onClick={() => setPref({ open: !prefs().open })}><Icon name={p.open ? 'chevron-down' : 'chevron-right'} className="icon-sm" /> {p.open ? 'Thu gọn' : 'Xem chi tiết (2 thẻ)'}</button></div>
      {p.open && (
        <div className="viz-grid-cards">
          <ChartHtml html={ch.card({ wide: true, ...c5 }) + ch.card({ wide: true, ...c6 })} onSelectChange={onQuizChange} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── S13c Bản đồ kiến thức ─────────────────────────
// Confirmed map: db.knowledgeMaps[courseId].status === 'confirmed' (lecturer confirmed concepts and prerequisites).
// A course without a knowledge-map record but with published concepts counts as confirmed (seed courses).
function mapOf(c) {
  const km = (Codi.db().knowledgeMaps || {})[c.id];
  const rejected = new Set(((km && km.concepts) || []).filter((k) => k.review === 'rejected').map((k) => k.id));
  const concepts = (c.concepts || []).filter((k) => !rejected.has(k.id));
  return { confirmed: km ? km.status === 'confirmed' : concepts.length > 0, concepts };
}
const ancestorsOf = (edges, id) => {
  const out = new Set();
  const visit = (n) => { if (out.has(n)) return; out.add(n); edges.filter((e) => e.to === n).forEach((e) => visit(e.from)); };
  if (id) visit(id);
  return out;
};

function ConceptDetails({ c, r, node }) {
  const st = (r.bkt || {})[node.id];
  return (
    <section className="card" aria-live="polite"><div className="card-body stack-3">
      <h2 className="ln-h">{node.label}</h2>
      <div className="row ln-gap-2"><Mastery level={node.mastery} />{node.recommended && <span className="small row ln-gap-1 text-accent"><Icon name="arrow-right" className="icon-sm" /> Bài học được gợi ý</span>}</div>
      <p className="small muted">{st && st.n ? `${st.n} bằng chứng · Xác suất BKT ${Math.round((st.p || 0) * 100)}%` : 'Chưa có bằng chứng học tập.'}</p>
      <h3 className="small strong">Bài học liên quan</h3>
      {!node.lessons.length && <p className="small muted">Chưa có bài được xuất bản cho khái niệm này.</p>}
      <ul className="list stack-2">{node.lessons.map((l) => (
        <li key={l.id} className="row-between ln-wrap ln-gap-2">
          <span className="small od-fill">{l.title}{l.locked && <span className="xsmall muted ln-block">Chưa đủ tiên quyết · nên học bài tiên quyết trước</span>}</span>
          <Link className={`btn btn-sm ${l.locked ? 'btn-secondary' : 'btn-primary'}`} to={`/learn/${c.id}/${l.id}`} aria-label={`Học bài này: ${l.title}`}>Học bài này <Icon name="arrow-right" className="icon-sm" /></Link>
        </li>
      ))}</ul>
    </div></section>
  );
}

/** Knowledge map of one course; embedded inside the course home tab, standalone on /insights/knowledge-map. */
export function KnowledgeMap({ initialCourseId, embedded }) {
  useCodi();
  const [selected, setSelected] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const all = enrolledCourses().filter((x) => (x.concepts || []).length);
  const p = prefs();
  const c = (embedded ? all.find((x) => x.id === initialCourseId) : all.find((x) => x.id === (p.mapCourse || initialCourseId))) || (embedded ? null : all[0]);
  useEffect(() => { setSelected(null); }, [c && c.id]);
  if (Codi.state.scenario.kmap === 'error') {
    const retry = () => { setRetrying(true); setTimeout(() => { setRetrying(false); Codi.rerender(); }, 900); };
    return <Alert type="danger" body="Không thể tải bản đồ." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying || undefined}>Thử lại</button>} />;
  }
  if (!c) {
    return (
      <div className="card"><Empty icon="map" title="Chưa có bản đồ kiến thức" body="Hãy đăng ký một khoá học để theo dõi các khái niệm của bạn." actions={<Link className="btn btn-secondary" to="/courses">Khám phá khóa học</Link>} /></div>
    );
  }
  const r = record(c);
  const { confirmed, concepts } = mapOf(c);
  const picker = !embedded && all.length > 1 && (
    <div className="viz-toolbar"><label className="sr-only" htmlFor="li-map">Khoá học</label>
      <select id="li-map" className="input" style={{ width: 'auto', minHeight: 40 }} value={c.id} onChange={(e) => setPref({ mapCourse: e.target.value })}>
        <option value="" disabled>Chọn khoá học</option>
        {all.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select></div>
  );
  if (!confirmed || !concepts.length) {
    return (
      <div className="stack-4">{picker}
        <div className="card"><Empty icon="map" title="Chưa có bản đồ kiến thức" body="Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết của khoá học." actions={<Link className="btn btn-secondary" to={`/learn/${c.id}`}>Về lộ trình</Link>} /></div>
      </div>
    );
  }
  const ids = new Set(concepts.map((k) => k.id));
  const edges = (c.prerequisites || []).filter((e) => ids.has(e.from) && ids.has(e.to));
  const lv = (id) => r.mastery[id] || 0;
  const pre = (id) => edges.filter((e) => e.to === id).map((e) => e.from);
  const curId = r.pathStatus !== 'none' ? currentLessonId(c, r) : null;
  const cur = curId ? Codi.lesson(c, curId) : null;
  const nodes = concepts.map((k) => ({
    id: k.id, label: k.name, mastery: lv(k.id), locked: lv(k.id) === 0 && pre(k.id).some((f) => lv(f) < 1),
    recommended: !!(cur && cur.conceptIds.includes(k.id)),
    lessons: Codi.lessons(c).filter((l) => l.conceptIds.includes(k.id)).map((l) => ({ id: l.id, title: l.title, locked: !r.completed.includes(l.id) && !!lockInfo(c, r, l) })),
  }));
  const node = nodes.find((n) => n.id === selected);
  const anc = ancestorsOf(edges, selected);
  const next = nodes.filter((n) => !n.locked && n.mastery < 3).sort((a, b) => a.mastery - b.mastery)[0];
  const lockedText = (n) => (n.locked ? 'Chưa đủ tiên quyết' : masteryLabel(n.mastery));
  const graphHtml = ch.graph({ nodes: nodes.map(({ id, label, mastery, locked }) => ({ id, label, mastery, locked })), edges, selected, highlightPath: selected ? Array.from(anc) : [], onSelectAction: 'km-select', ariaLabel: 'Sơ đồ khái niệm, cuộn để xem toàn bộ' })
    .replace(/Chưa mở khoá/g, 'Chưa đủ tiên quyết');
  const graphCard = ch.card({
    title: c.title, question: `${nodes.filter((n) => n.mastery >= 3).length}/${nodes.length} khái niệm đã thành thạo · ${nodes.filter((n) => n.locked).length} chưa đủ tiên quyết`,
    body: graphHtml, wide: true,
    table: { headers: ['Khái niệm', 'Mức thành thạo', 'Cần học trước'], rows: nodes.map((n) => [n.label + (n.recommended ? ' · Bài học được gợi ý' : ''), lockedText(n), pre(n.id).map((f) => (concepts.find((k) => k.id === f) || {}).name).join(', ') || '—']) },
  });
  const short = (n) => (n.locked ? 'Chưa đủ tiên quyết' : n.mastery === 0 ? 'Chưa học' : n.mastery < 3 ? 'Đang học' : 'Thành thạo');
  const barsCard = ch.card({ title: 'Theo mức thành thạo', body: ch.hbars({ items: nodes.slice().sort((a, b) => b.mastery - a.mastery).map((n) => ({ label: n.label, value: n.mastery, max: 4, text: short(n) })), sort: false }), wide: true });
  const onAction = (action, id) => { if (action === 'km-select') setSelected((s) => (s === id ? null : id)); };
  return (
    <div className="stack-4">
      {picker}
      {next && <p className="small row ln-gap-1" style={{ margin: 0 }}><Icon name="lightbulb" className="icon-sm" /> <span>Nên ôn tiếp: <strong>{next.label}</strong> ({masteryLabel(next.mastery)}).</span></p>}
      <ChartHtml html={graphCard} onAction={onAction} />
      {!node && <p className="xsmall muted" style={{ margin: 0 }}>Chọn một khái niệm để xem bằng chứng và bài học liên quan.</p>}
      {node && <ConceptDetails c={c} r={r} node={node} />}
      <Html html={barsCard} style={{ display: 'contents' }} />
    </div>
  );
}

export function KnowledgeMapPage({ query }) {
  useCodi();
  useEffect(() => { if (query && query.course && prefs().mapCourse !== query.course) setPref({ mapCourse: query.course }); }, [query && query.course]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page stack-4">
      <div className="page-header"><div><h1>Bản đồ kiến thức của tôi</h1><p className="muted">Mỗi ô là một khái niệm; mũi tên chỉ khái niệm cần học trước.</p></div><Link className="btn btn-secondary" to="/insights/stats"><Icon name="bar-chart" className="icon-sm" /> Thống kê học tập</Link></div>
      <KnowledgeMap initialCourseId={query && query.course} />
    </div>
  );
}

// ───────────────────────── /insights hub (mockup-only route, kept) ─────────────────────────
export function InsightsHubPage() {
  return (
    <div className="page stack-4">
      <div className="page-header"><div><h1>Thống kê & bản đồ kiến thức</h1><p className="muted">Xem nhịp học và mức thành thạo của bạn.</p></div></div>
      <div className="viz-grid-cards">
        <Link className="viz-card li-hub" to="/insights/stats"><span className="row ln-gap-2 ln-nowrap"><Icon name="bar-chart" className="text-accent" /><strong>Thống kê học tập</strong></span><span className="small muted">Giờ học, chuỗi ngày, điểm quiz và kỹ năng.</span></Link>
        <Link className="viz-card li-hub" to="/insights/knowledge-map"><span className="row ln-gap-2 ln-nowrap"><Icon name="map" className="text-accent" /><strong>Bản đồ kiến thức của tôi</strong></span><span className="small muted">Khái niệm nào đã vững, khái niệm nào chưa đủ tiên quyết.</span></Link>
      </div>
      <Link className="btn btn-ghost" style={{ width: 'fit-content' }} to="/progress">Điểm, bài tập và nhận xét: Tiến độ & kết quả</Link>
    </div>
  );
}

