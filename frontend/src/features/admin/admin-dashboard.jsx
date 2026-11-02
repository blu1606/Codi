/**
 * S30 admin dashboard — port of the real admin-dashboard-view: four KPIs, "Cần xử lý" tiles (count + link),
 * analytics entry cards and the five most recent orders. KPIs come from admin-metrics, so "Doanh thu" and
 * "Đơn hàng" equal B1 "Doanh thu ròng" / "Đơn đã thanh toán" and the B4 total for the same 30-day window.
 */
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, OrderStatus } from '../../components/ui/primitives';
import { AdminShell, db, isOverdue, buyer } from './admin-shell';
import { dashboard, dayLabelFull } from './admin-metrics';
import { openOrder } from './admin-orders';

const { fmt } = Codi;

export function DashboardPage() {
  useCodi();
  const m = dashboard();
  const kpis = [
    ['Doanh thu', fmt.vnd(m.revenue), `${fmt.num(m.paidOrders)} đơn đã thanh toán`],
    ['Đơn hàng', fmt.num(m.orders), 'Mọi trạng thái'],
    ['Học viên mới', fmt.num(m.newLearners), 'Tài khoản đăng ký mới'],
    ['Khóa học đang bán', fmt.num(m.publishedCourses), 'Trạng thái Đã xuất bản'],
  ];
  const todo = [
    ['/admin/publication?tab=pending', m.pendingCourses, 'Khóa học chờ duyệt', 'Xem và duyệt yêu cầu xuất bản'],
    ['/admin/orders?status=pending&overdue=1&range=all', m.overdueOrders, 'Đơn chờ thanh toán quá hạn', 'Đơn chờ thanh toán từ 24 giờ trở lên, có thể cần đối soát'],
    ['/admin/vouchers?filter=expiring', m.nearLimitVouchers, 'Voucher sắp hết lượt', 'Đã dùng từ 90% số lượt'],
    ['/admin/users?status=inactive', m.inactiveUsers, 'Tài khoản bị vô hiệu hoá', 'Xem lý do hoặc kích hoạt lại'],
  ];
  const recent = db().orders.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const today = m.window.keys[m.window.keys.length - 1];
  return (
    <AdminShell active="/admin">
      <div className="page-header"><div><h1>Tổng quan</h1><p className="muted">30 ngày gần nhất · đến {dayLabelFull(today)}</p></div></div>
      <h2 className="section ad-section-title">Cần xử lý</h2>
      <div className="grid-4">{todo.map(([href, n, l, meta]) => (
        <Link key={href} className="stat-tile ad-todo" to={href}><span className="stat-value">{fmt.num(n)}</span><span className="stat-label">{l}</span><span className="stat-meta">{meta}</span><span className="stat-go">Mở danh sách <Icon name="arrow-right" className="icon-sm" /></span></Link>
      ))}</div>
      <h2 className="section ad-section-title">Số liệu 30 ngày</h2>
      <div className="grid-4">{kpis.map(([l, v, meta]) => <div key={l} className="stat-tile"><span className="stat-label">{l}</span><span className="stat-value od-nowrap">{v}</span><span className="stat-meta">{meta}</span></div>)}</div>
      <h2 className="section ad-section-title">Phân tích</h2>
      <div className="grid-2">
        <Link className="stat-tile ad-entry" to="/admin/insights"><div><h3>Quan sát hệ thống</h3><p className="small muted">Học viên có học, đăng ký, ghi danh, phễu kích hoạt và sức khỏe vận hành</p></div><div className="stat-value">{fmt.num(m.newLearners)}<span className="ad-entry-unit">học viên mới</span></div></Link>
        <Link className="stat-tile ad-entry" to="/admin/finance"><div><h3>Tài chính</h3><p className="small muted">Doanh thu, đơn hàng, thanh toán, hoàn tiền và đối soát</p></div><div className="stat-value od-nowrap">{fmt.vnd(m.revenue)}<span className="ad-entry-unit">doanh thu ròng 30 ngày</span></div></Link>
      </div>
      <div className="section-title section"><h2 style={{ fontSize: 'var(--text-lg)' }}>Đơn hàng gần đây</h2><Link to="/admin/orders">Xem tất cả</Link></div>
      {recent.length ? (
        <div className="table-wrap"><table className="table"><thead><tr><th>Mã</th><th>Người mua</th><th className="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
          {recent.map((o) => (
            <tr key={o.id} className="is-clickable" tabIndex={0} onClick={() => openOrder(o.id)} onKeyDown={(e) => { if (e.key === 'Enter') openOrder(o.id); }}>
              <td className="mono">{o.code}</td>
              <td><div className="stack-1"><span className="small">{buyer(o).name}</span><span className="xsmall muted">{buyer(o).email}</span></div></td>
              <td className="num od-nowrap">{fmt.vnd(o.total)}</td>
              <td><div className="row" style={{ gap: 4 }}><OrderStatus status={o.status} />{isOverdue(o) && <span className="badge badge-danger">Quá hạn</span>}</div></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : <div className="viz-empty">Chưa có đơn hàng nào trong hệ thống.</div>}
    </AdminShell>
  );
}
