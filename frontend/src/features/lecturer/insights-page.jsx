/**
 * Lecturer insights (S29b, '/teach/insights?period=7|30|90') on Codi's getLecturerInsightsData
 * (lib/revenue-analytics-service.ts): GMT+7 calendar windows ending today with an equally long previous window,
 * gross / discount / net of this lecturer's lines of paid or refunded orders, refunds, daily net buckets and a
 * course table sorted by net with its share of net.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { charts } from '../../lib/charts';
import { Empty, Html } from '../../components/ui/primitives';
import { shell, Loading, LoadError } from './teach-api';
import { act } from './teach-data';

const TZ = 7 * 3600000; // GMT+7
const PERIODS = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày']];
const vnd = (n) => Codi.fmt.vnd(Math.round(n || 0));
const dayKey = (t) => new Date(t + TZ).toISOString().slice(0, 10);
const dayLabel = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const dayLabelFull = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const win = (w) => [Date.parse(w.start), Date.parse(w.end)];

const rangeLabel = ([a, b]) => `${dayLabelFull(dayKey(a))} – ${dayLabelFull(dayKey(b - 1))}`;

export function InsightsPage({ query }) {
  useCodi();
  const period = PERIODS.some(([k]) => k === query.period) ? query.period : '30';
  const [st, setSt] = useState({ d: null, error: null, period: null });
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, error: null }));
    try { setSt({ d: await act('insights', 'getLecturerInsightsData', period), error: null, period }); } catch (error) { setSt((x) => ({ ...x, error })); }
  }, [period]);
  useEffect(() => { load(); }, [load]);
  const head = <div className="page-header"><div><h1>Doanh thu khoá học của tôi</h1><p className="muted">Theo dõi doanh thu và đơn hàng. Dữ liệu lọc theo khoá học bạn dạy.</p></div></div>;
  const note = (title, body) => <div className="card"><Empty icon="trending-up" title={title} body={body} /></div>;
  if (!st.d) return shell('/teach/insights', <>{head}{st.error ? <LoadError error={st.error} onRetry={load} /> : <Loading rows={4} />}</>);
  const raw = st.d;
  if (raw.state === 'no-courses') return shell('/teach/insights', <>{head}{note('Bạn chưa có khoá học nào', 'Tạo khoá học và xuất bản để bắt đầu bán.')}</>);
  if (raw.state !== 'ready') return shell('/teach/insights', <>{head}{note('Chưa có khoá học nào được xuất bản', 'Khi xuất bản khoá học, doanh thu sẽ hiển thị ở đây.')}</>);
  const d = { ...raw, window: win(raw.window), previousWindow: win(raw.previousWindow), courses: (raw.courses || []).filter((c) => c.net || c.paidOrders).sort((a, b) => b.net - a.net) };
  const t = d.totals; const p = d.previousTotals;
  const courseTotal = d.courses.reduce((s, c) => s + c.net, 0);
  const kpis = [
    { label: 'Doanh thu gộp', value: t.gross, prev: p.gross, format: vnd },
    { label: 'Doanh thu ròng', value: t.net, prev: p.net, format: vnd },
    { label: 'Đơn thanh toán', value: t.paidOrders, prev: p.paidOrders },
    { label: 'Tiền giảm giá', value: t.discount, prev: p.discount, format: vnd, deltaGood: 'down' },
    { label: 'Hoàn tiền', value: t.refunds, prev: p.refunds, format: vnd, deltaGood: 'down' },
  ];
  const line = charts.line({
    ariaLabel: 'Doanh thu ròng theo ngày', height: 200, yFormat: (v) => charts.fmt.compact(v),
    series: [
      { name: 'Kỳ này', points: d.daily.map((x) => ({ x: x.date, y: x.net, label: dayLabel(x.date) })) },
      { name: 'Kỳ trước', dashed: true, points: d.previousDaily.map((x) => ({ x: x.date, y: x.net, label: dayLabel(x.date) })) },
    ],
  });
  const revenueCard = charts.card({
    id: 's29b-revenue', title: 'Doanh thu theo thời gian', question: 'Doanh thu ròng theo ngày, so với kỳ trước', state: 'ok', body: line, wide: true,
    note: `Trung bình kỳ này: ${vnd(Math.round(t.net / Math.max(d.daily.length, 1)))}/ngày · Tổng: ${vnd(t.net)}`,
    table: { headers: ['Ngày', 'Ròng kỳ này', 'Ròng kỳ trước (cùng vị trí)'], rows: d.daily.map((x, i) => [dayLabelFull(x.date), vnd(x.net), d.previousDaily[i] ? vnd(d.previousDaily[i].net) : '—']) },
  });
  const pct = (n) => charts.fmt.pct(n, n && n < 10 ? 1 : 0);
  return shell('/teach/insights', <>
    {head}
    <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
      <nav className="row" style={{ gap: 8 }} aria-label="Khoảng thời gian">{PERIODS.map(([k, l]) => <Link key={k} className={`btn ${period === k ? 'btn-primary' : 'btn-secondary'}`} aria-current={period === k ? 'page' : undefined} to={`/teach/insights?period=${k}`}>{l}</Link>)}</nav>
      <span className="small muted">{rangeLabel(d.window)} (GMT+7) · so với {rangeLabel(d.previousWindow)}</span>
    </div>
    <div className="viz-kpis" style={{ marginBottom: 24 }}>{kpis.map((k) => <Html key={k.label} html={charts.kpi(k)} />)}</div>
    <Html html={revenueCard} />
    <section className="card" style={{ marginTop: 24 }} aria-labelledby="ins-courses-h">
      <div className="card-header"><div className="stack-1"><h2 className="tc-h" id="ins-courses-h">Doanh thu theo khoá học</h2><span className="xsmall muted">Khoá nào mang lại doanh thu trong kỳ?</span></div></div>
      {d.courses.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Bảng doanh thu theo khoá học"><table className="table"><caption className="sr-only">Doanh thu theo khoá học</caption>
        <thead><tr><th scope="col">Khoá học</th><th scope="col" className="num">Đơn</th><th scope="col" className="num">Gộp</th><th scope="col" className="num">Ròng</th><th scope="col" className="num">Tỉ lệ</th></tr></thead><tbody>
          {d.courses.map((r) => <tr key={r.courseId}><th scope="row" className="small">{r.title}</th><td className="num">{Codi.fmt.num(r.paidOrders)}</td><td className="num">{vnd(r.gross)}</td><td className="num">{vnd(r.net)}</td><td className="num">{pct(courseTotal ? (r.net / courseTotal) * 100 : 0)}</td></tr>)}
          <tr className="strong"><th scope="row">Tổng cộng</th><td className="num">{Codi.fmt.num(t.paidOrders)}</td><td className="num">{vnd(t.gross)}</td><td className="num">{vnd(courseTotal)}</td><td className="num">100%</td></tr>
        </tbody></table></div>
        : <div className="card-body"><p className="small muted">Không có khoá học nào có doanh thu trong kỳ này.</p></div>}
    </section>
  </>);
}
