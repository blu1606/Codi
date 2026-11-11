/**
 * S30 admin dashboard — port of the real admin-dashboard-view: "Cần xử lý" tiles (count + link), four 30-day KPIs,
 * analytics entry cards and the five most recent orders. Everything comes from getAdminDashboardData (the same
 * action Codi's dashboard page calls): revenue = paid orders by paidAt in the last 30 days.
 */
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, OrderStatus } from '../../components/ui/primitives';
import { AdminShell, Loaded } from './admin-shell';
import { useAction } from './admin-data';
import { dayKey, dayLabelFull } from './admin-metrics';
import { openOrder } from './admin-orders';

const { fmt } = Codi;

function Dashboard({ d }) {
  const k = d.kpis; const t = d.todo;
  const kpis = [
    ['Doanh thu', fmt.vnd(k.revenue30d), `${fmt.num(k.paidOrders30d)} đơn đã thanh toán`],
    ['Đơn hàng', fmt.num(k.allOrders30d), 'Mọi trạng thái'],
    ['Học viên mới', fmt.num(k.newLearners30d), 'Tài khoản đăng ký mới'],
    ['Khoá học đang bán', fmt.num(k.publishedCourses), 'Trạng thái Đã xuất bản'],
  ];
  const todo = [
    ['/admin/publication?tab=pending', t.pendingCoursesCount, 'Khoá học chờ duyệt', 'Xem và duyệt yêu cầu xuất bản'],
    ['/admin/orders?status=pending&overdue=1&range=all', t.overdueOrdersCount, 'Đơn chờ thanh toán quá hạn', 'Đơn chờ thanh toán từ 24 giờ trở lên, có thể cần đối soát'],
    ['/admin/vouchers?filter=expiring', t.expiringVouchersCount, 'Voucher sắp hết lượt', 'Đã dùng từ 90% số lượt'],
    ['/admin/users?status=inactive', t.inactiveUsersCount, 'Tài khoản bị vô hiệu hoá', 'Xem lý do hoặc kích hoạt lại'],
  ];
  const recent = d.recentOrders || [];
  return (
    <>
      <h2 className="section ad-section-title">Cần xử lý</h2>
      <div className="grid-4">{todo.map(([href, n, l, meta]) => (
        <Link key={href} className="stat-tile ad-todo" to={href}><span className="stat-value">{fmt.num(n)}</span><span className="stat-label">{l}</span><span className="stat-meta">{meta}</span><span className="stat-go">Mở danh sách <Icon name="arrow-right" className="icon-sm" /></span></Link>
      ))}</div>
      <h2 className="section ad-section-title">Số liệu 30 ngày</h2>
      <div className="grid-4">{kpis.map(([l, v, meta]) => <div key={l} className="stat-tile"><span className="stat-label">{l}</span><span className="stat-value od-nowrap">{v}</span><span className="stat-meta">{meta}</span></div>)}</div>
      <h2 className="section ad-section-title">Phân tích</h2>
      <div className="grid-2">
        <Link className="stat-tile ad-entry" to="/admin/insights"><div><h3>Quan sát hệ thống</h3><p className="small muted">Học viên có học, đăng ký, ghi danh, phễu kích hoạt và sức khỏe vận hành</p></div><div className="stat-value">{fmt.num(k.newLearners30d)}<span className="ad-entry-unit">học viên mới</span></div></Link>
        <Link className="stat-tile ad-entry" to="/admin/finance"><div><h3>Tài chính</h3><p className="small muted">Doanh thu, đơn hàng, thanh toán, hoàn tiền và đối soát</p></div><div className="stat-value od-nowrap">{fmt.vnd(k.revenue30d)}<span className="ad-entry-unit">doanh thu ròng 30 ngày</span></div></Link>
      </div>
      <div className="section-title section"><h2 style={{ fontSize: 'var(--text-lg)' }}>Đơn hàng gần đây</h2><Link to="/admin/orders">Xem tất cả</Link></div>
      {recent.length ? (
        <div className="table-wrap"><table className="table"><thead><tr><th>Mã</th><th>Người mua</th><th className="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
          {recent.map((o) => (
            <tr key={o.id} className="is-clickable" tabIndex={0} onClick={() => openOrder(o.id, o.code)} onKeyDown={(e) => { if (e.key === 'Enter') openOrder(o.id, o.code); }}>
              <td className="mono">{o.code}</td>
              <td><div className="stack-1"><span className="small">{o.buyerName}</span><span className="xsmall muted">{o.buyerEmail}</span></div></td>
              <td className="num od-nowrap">{fmt.vnd(o.totalAmount)}</td>
              <td><div className="row" style={{ gap: 4 }}><OrderStatus status={o.status} />{o.isOverdue && <span className="badge badge-danger">Quá hạn</span>}</div></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : <div className="viz-empty">Chưa có đơn hàng nào trong hệ thống.</div>}
    </>
  );
}

export function DashboardPage() {
  const res = useAction('dashboard/admin', 'getAdminDashboardData');
  return (
    <AdminShell active="/admin">
      <div className="page-header"><div><h1>Tổng quan</h1><p className="muted">30 ngày gần nhất · đến {dayLabelFull(dayKey(Date.now()))}</p></div></div>
      <Loaded res={res} text="Đang tải tổng quan…">{(d) => <Dashboard d={d} />}</Loaded>
    </AdminShell>
  );
}
