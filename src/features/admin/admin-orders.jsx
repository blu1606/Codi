/**
 * S34 "Đơn hàng & giao dịch" — port of the real orders page (orders-table-client, order-detail-drawer,
 * order-export-modal, admin-orders-service): summary tiles, filters, quick toggles "Cần đối soát (n)" /
 * "Quá 24 giờ (n)" / "Xoá bộ lọc" / "Xuất CSV", transactions table, detail drawer with reconciliation warning,
 * timeline and admin cancel of pending orders.
 *
 * Query: range=7|30|90|all, status, q, overdue=1, reconciliation=1, id=<orderId> (opens the drawer).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Alert, Empty, OrderStatus, orderStatusLabel } from '../../components/ui/primitives';
import { AdminShell, DAY, db, me, isOverdue, buyer, courseTitles, confirmImpact } from './admin-shell';
import { needsReconciliation } from './admin-metrics';

const { fmt } = Codi;
const RANGES = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Tất cả']];
const STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];

// ───────────────────────── order helpers ─────────────────────────
const vnd = (n) => fmt.vnd(Number(n) || 0);
const itemsOf = (o) => (Array.isArray(o.items) ? o.items : []);
const received = (o) => Number(o.received ?? o.receivedAmount) || 0;

// Timeline events are { at, type, by, note? } (commerce contract; older rows may carry a label instead).
// The label comes from the type; unknown types fall back to label, note, then the raw type.
const EVENT_LABEL = {
  created: 'Đã tạo đơn',
  paid: 'Đã nhận tiền',
  partial_payment: 'Đã nhận một phần tiền',
  overpaid: 'Đã nhận tiền thừa',
  late_payment: 'Nhận tiền sau khi đơn hết hạn',
  expired: 'Đơn hết hạn thanh toán',
  failed: 'Thanh toán thất bại',
  cancelled: 'Người mua đã huỷ',
  replaced: 'Đã thay bằng đơn mới',
  refunded: 'Đã hoàn tiền',
};
export function eventLabel(t) {
  if (t.type === 'cancelled_by_admin') return `Quản trị viên huỷ đơn (${t.note || ''})`;
  const base = EVENT_LABEL[t.type];
  if (!base) return t.label || t.note || t.type || 'Cập nhật đơn hàng';
  return t.note ? `${base} (${t.note})` : base;
}
const timelineOf = (o) => (Array.isArray(o.timeline) ? o.timeline : [])
  .map((t, i) => ({ key: i, at: t.at || t.createdAt, label: eventLabel(t) }))
  .filter((t) => t.at)
  .sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first, like the real drawer

/**
 * Admin cancel of a pending order (real adminCancelOrder): reason required, only pending, sets cancelled +
 * cancelledAt + cancelReason, flags reconciliation when money was already received, writes the timeline event
 * and notifies the learner. Returns an error message or null.
 */
export function adminCancelOrder(orderId, reason) {
  const text = String(reason || '').trim();
  if (!text) return 'Lý do huỷ đơn hàng là bắt buộc.';
  const o = db().orders.find((x) => x.id === orderId);
  if (!o) return 'Không tìm thấy đơn hàng.';
  if (o.status !== 'pending') return `Chỉ có thể huỷ đơn đang chờ thanh toán (trạng thái hiện tại: ${orderStatusLabel(o.status)}).`;
  const now = new Date().toISOString();
  const admin = me();
  Codi.set(() => {
    o.status = 'cancelled';
    o.cancelledAt = now;
    o.cancelReason = text;
    o.updatedAt = now;
    if (received(o) > 0) o.needsReconciliation = true; // a partial receipt must be refunded outside the system; never clear a flag
    if (!Array.isArray(o.timeline)) o.timeline = [];
    o.timeline.push({ at: now, type: 'cancelled_by_admin', by: admin ? admin.id : null, note: text });
  });
  Codi.notify(o.userId, { title: `Đơn hàng ${o.code} đã bị huỷ`, body: `Đơn hàng ${o.code} đã được quản trị viên huỷ. Lý do: ${text}`, link: '/dashboard' });
  return null;
}

async function cancelFromDrawer(o, handle) {
  const r = await confirmImpact({
    title: `Huỷ đơn hàng ${o.code}?`,
    consequence: 'Đơn hàng sẽ chuyển sang trạng thái đã huỷ. Học viên sẽ nhận được thông báo huỷ đơn.',
    reversible: 'Hành động này không thể hoàn tác.',
    requireReason: true,
    reasonError: 'Lý do huỷ đơn hàng là bắt buộc.',
    danger: true,
    confirmLabel: 'Huỷ đơn hàng',
  });
  if (!r.ok) return;
  const err = adminCancelOrder(o.id, r.reason);
  if (err) { Codi.ui.toast(err, { type: 'danger' }); return; }
  handle.close();
  Codi.ui.toast(`Đã huỷ đơn hàng ${o.code}.`, { type: 'success' });
}

/** Range / status / search filter, plus the overdue and reconciliation toggles. */
export function filteredOrders(q) {
  const range = q.range || '30'; const status = q.status || 'all'; const term = (q.q || '').trim().toLowerCase();
  const since = range === 'all' ? 0 : Date.now() - (Number(range) || 30) * DAY;
  return db().orders.filter((o) => new Date(o.createdAt).getTime() >= since
    && (status === 'all' || o.status === status)
    && (!q.overdue || isOverdue(o))
    && (!q.reconciliation || needsReconciliation(o))
    && (!term || [o.code, buyer(o).name, buyer(o).email, courseTitles(o)].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ───────────────────────── drawer ─────────────────────────
function CopyTransfer({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const done = () => { setCopied(true); Codi.ui.toast('Đã sao chép nội dung chuyển khoản.', { type: 'success' }); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(String(text)).then(done, () => Codi.ui.copy(text));
    else { Codi.ui.copy(text); done(); }
  };
  return <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name={copied ? 'check' : 'copy'} className="icon-sm" />{copied ? 'Đã chép' : 'Sao chép'}</button>;
}

function OrderDrawer({ id, handle }) {
  useCodi();
  const o = db().orders.find((x) => x.id === id);
  if (!o) return <div className="sheet-body"><p className="small muted">Không tìm thấy đơn hàng.</p></div>;
  const b = buyer(o);
  const items = itemsOf(o);
  const events = timelineOf(o);
  const flagged = needsReconciliation(o);
  return (
    <>
      <div className="sheet-body stack-4">
        <p className="small muted" style={{ margin: 0 }}>Chi tiết đơn hàng và lịch sử giao dịch</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <OrderStatus status={o.status} />
          {isOverdue(o) && <span className="badge badge-danger"><Icon name="clock" />Quá hạn (&gt;24h)</span>}
          {flagged && <span className="badge badge-warn"><Icon name="alert-triangle" />Cần đối soát</span>}
        </div>
        {flagged && (
          <Alert type="warn" title="Lưu ý đối soát ngân hàng (D2/D3)"
            body="Đơn hàng này được gắn cờ đối soát thủ công (có thể do chuyển khoản thừa tiền, thiếu tiền khi hết hạn, hoặc chuyển khoản muộn sau khi đã sở hữu khóa học). Vui lòng kiểm tra sao kê ngân hàng VietQR trước khi xử lý hoàn tiền ngoài hệ thống." />
        )}
        <div className="panel stack-1"><span className="xsmall muted">Người mua</span><strong className="small">{b.name}</strong><span className="small muted">{b.email}</span></div>
        <div className="stack-2"><span className="xsmall muted">Khóa học đã đặt ({items.length})</span>
          <ul className="list">{items.map((i) => (
            <li key={i.courseId} className="list-row" style={{ paddingInline: 0 }}><span className="list-main small">{(Codi.course(i.courseId) || { title: i.courseTitle || '(đã xoá)' }).title}</span><span className="small od-nowrap muted">{vnd(i.price ?? i.unitPrice)}</span></li>
          ))}</ul>
          {o.voucherCode && <div className="row-between small"><span className="muted">Voucher {o.voucherCode}</span><span className="text-success">−{vnd(o.discount)}</span></div>}
          <div className="row-between strong ad-order-total"><span>Tổng tiền</span><span>{vnd(o.total)}</span></div>
          {received(o) > 0 && o.status === 'pending' && <div className="row-between small text-warn"><span>Đã nhận thực tế</span><span>{vnd(received(o))}</span></div>}
        </div>
        <div className="stack-1"><span className="xsmall muted">Nội dung chuyển khoản (VietQR)</span>
          <div className="copy-row is-emphasis"><div className="copy-main"><span className="copy-value">{o.content || o.code}</span></div><CopyTransfer text={o.content || o.code} /></div></div>
        <div className="stack-1"><span className="xsmall muted">Phương thức</span><span className="small">{o.method || 'Chuyển khoản ngân hàng'}</span></div>
        {o.status === 'cancelled' && o.cancelReason && <div className="stack-1"><span className="xsmall muted">Lý do huỷ</span><span className="small">{o.cancelReason}</span></div>}
        <div className="stack-2"><span className="xsmall muted">Lịch sử trạng thái</span>
          {events.length
            ? <ol className="ad-timeline">{events.map((t) => <li key={t.key}><span className="small">{t.label}</span><span className="xsmall muted">{fmt.datetime(t.at)}</span></li>)}</ol>
            : <p className="xsmall muted">Chưa có sự kiện nào.</p>}
        </div>
      </div>
      <div className="sheet-footer ad-drawer-footer">
        {o.status === 'pending' && <button type="button" className="btn btn-danger btn-sm" onClick={() => cancelFromDrawer(o, handle)}><Icon name="x-circle" className="icon-sm" /> Huỷ đơn hàng</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => handle.close()}>Đóng</button>
      </div>
    </>
  );
}

export function openOrder(id) {
  const o = db().orders.find((x) => x.id === id); if (!o) return;
  Codi.ui.closeAll();
  Codi.ui.sheet({ title: 'Đơn ' + o.code, raw: true, body: (h) => <OrderDrawer id={id} handle={h} /> });
}

// ───────────────────────── CSV export ─────────────────────────
const COLS = [['code', 'Mã giao dịch'], ['buyer', 'Người mua'], ['email', 'Email'], ['courses', 'Khóa học'], ['voucher', 'Voucher'], ['discount', 'Giảm giá'], ['total', 'Tổng tiền'], ['status', 'Trạng thái'], ['createdAt', 'Ngày tạo'], ['paidAt', 'Ngày thanh toán']];
const cellOf = {
  code: (o) => o.code, buyer: (o) => buyer(o).name, email: (o) => buyer(o).email, courses: (o) => courseTitles(o), voucher: (o) => o.voucherCode || '',
  discount: (o) => o.discount || 0, total: (o) => o.total, status: (o) => orderStatusLabel(o.status), createdAt: (o) => o.createdAt, paidAt: (o) => o.paidAt || '',
};

function ExportDialog({ handle, query }) {
  const [range, setRange] = useState(query.range || '30');
  const [applyFilter, setApplyFilter] = useState(true);
  const [columns, setColumns] = useState(() => Object.fromEntries(COLS.map(([k]) => [k, true])));
  // Time range always comes from the dialog; status / search / toggles come from the page only when applied.
  const expQ = applyFilter ? { ...query, range } : { range };
  const list = filteredOrders(expQ);
  const cols = COLS.filter(([k]) => columns[k]).map(([k]) => k);
  const status = query.status || 'all';
  const doExport = () => {
    if (!cols.length) { Codi.ui.toast('Chọn ít nhất một cột để xuất.', { type: 'warn' }); return; }
    try {
      const header = Object.fromEntries(COLS);
      const esc = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
      const rows = [cols.map((c) => header[c])].concat(list.map((o) => cols.map((c) => cellOf[c](o))));
      const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `codi-don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      Codi.ui.toast('Không thể xuất dữ liệu do lỗi truy vấn. Vui lòng thử lại.', { type: 'danger' });
      return;
    }
    handle.close(); Codi.ui.toast(`Đã xuất ${list.length} đơn hàng (${cols.length} cột) ra CSV.`, { type: 'success' });
  };
  return (
    <>
      <div className="dialog-body">
        <form className="stack-4" id="exp" onSubmit={(e) => { e.preventDefault(); doExport(); }}>
          <div className="stack-2">
            <h4 style={{ margin: 0 }}>Khoảng thời gian</h4>
            <div className="segmented" style={{ width: '100%' }} role="group">
              {RANGES.map(([k, l]) => <label key={k} style={{ flex: 1 }}><input type="radio" name="range" value={k} checked={range === k} onChange={() => setRange(k)} /> {l}</label>)}
            </div>
            <p className="xsmall muted">Múi giờ: GMT+7 (Hà Nội)</p>
          </div>
          <label className="check"><input type="checkbox" checked={applyFilter} onChange={(e) => setApplyFilter(e.target.checked)} /> Áp dụng bộ lọc hiện tại (trạng thái: {status === 'all' ? 'Tất cả' : orderStatusLabel(status)}, tìm kiếm)</label>
          <div className="stack-2">
            <h4 style={{ margin: 0 }}>Chọn cột xuất ({cols.length}/10)</h4>
            <div className="ad-export-cols">
              {COLS.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={!!columns[k]} onChange={(e) => setColumns({ ...columns, [k]: e.target.checked })} /> {l}</label>)}
            </div>
          </div>
          <div className="ad-export-summary"><span className="small muted">{fmt.num(list.length)} đơn · {fmt.num(cols.length)} cột · {vnd(list.reduce((s, o) => s + (o.total || 0), 0))} tổng tiền</span></div>
        </form>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" onClick={doExport}>Xuất CSV</button>
      </div>
    </>
  );
}

// ───────────────────────── page ─────────────────────────
export function OrdersPage({ query: q }) {
  useCodi();
  const range = q.range || '30'; const status = q.status || 'all';
  const overdue = q.overdue === '1'; const recon = q.reconciliation === '1';
  const list = filteredOrders({ ...q, overdue, reconciliation: recon });
  const paid = list.filter((o) => o.status === 'paid');
  const overdueCount = list.filter((o) => isOverdue(o)).length;
  const reconCount = list.filter(needsReconciliation).length;
  const anyFilter = status !== 'all' || range !== '30' || !!q.q || overdue || recon;
  useEffect(() => { if (q.id) openOrder(q.id); }, [q.id]);

  const goWith = (patch) => {
    const nq = { range: '30', status: 'all', ...Codi.query(), ...patch };
    delete nq.id;
    Object.keys(nq).forEach((k) => { if (nq[k] === '' || nq[k] == null) delete nq[k]; });
    Codi.go('/admin/orders?' + new URLSearchParams(nq).toString());
  };
  const onSearch = (e) => { e.preventDefault(); goWith({ q: String(new FormData(e.currentTarget).get('q') || '').trim() }); };
  const exportCsv = () => Codi.ui.modal({ size: 'md', title: 'Xuất CSV', raw: true, body: (h) => <ExportDialog handle={h} query={{ ...Codi.query(), overdue, reconciliation: recon }} /> });

  return (
    <AdminShell active="/admin/orders">
      <div className="page-header"><div><h1>Đơn hàng & giao dịch</h1><p className="muted">Thanh toán chuyển khoản VietQR, xác nhận tự động theo nội dung chuyển khoản.</p></div></div>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="stat-tile"><span className="stat-value">{list.length}</span><span className="stat-label">Đơn trong bộ lọc</span></div>
        <div className="stat-tile"><span className="stat-value text-success">{paid.length}</span><span className="stat-label">Đã thanh toán</span></div>
        <div className="stat-tile"><span className="stat-value text-warn">{list.filter((o) => o.status === 'pending').length}</span><span className="stat-label">Chờ thanh toán</span>{overdueCount > 0 && <span className="stat-meta text-danger"><Icon name="clock" className="icon-sm" /> {overdueCount} quá hạn</span>}</div>
        <div className="stat-tile"><span className="stat-value od-nowrap">{vnd(paid.reduce((s, o) => s + (o.total || 0), 0))}</span><span className="stat-label">Doanh thu</span></div>
      </div>
      <div className="ad-filters ad-filters-orders">
        <div className="field"><span className="field-label">Thời gian</span>
          <div className="segmented" role="group" aria-label="Khoảng thời gian">
            {RANGES.map(([k, l]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => goWith({ range: k })}>{l}</button>)}
          </div></div>
        <div className="field"><label htmlFor="o-status">Trạng thái</label>
          <select id="o-status" value={status} onChange={(e) => goWith({ status: e.target.value })}>
            <option value="all">Tất cả</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'refunded' ? 'Hoàn tiền' : orderStatusLabel(s)}</option>)}
          </select></div>
        <div className="field"><label htmlFor="o-method">Phương thức</label><select id="o-method" disabled><option>Chuyển khoản ngân hàng</option></select></div>
        <form className="field" onSubmit={onSearch}><label htmlFor="o-q">Mã đơn hoặc email</label>
          <div className="input-group"><input id="o-q" name="q" className="input" placeholder="Tìm mã hoặc người mua..." defaultValue={q.q || ''} key={q.q || ''} /><button className="btn btn-secondary" type="submit"><Icon name="search" className="icon-sm" /><span className="sr-only">Tìm</span></button></div></form>
      </div>
      {overdue && <div style={{ margin: '12px 0' }}><Alert type="warn" title="Đang lọc: đơn chờ thanh toán quá 24 giờ" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => goWith({ overdue: '' })}>Bỏ lọc quá hạn</button>} /></div>}
      <div className="ad-toggles" role="group" aria-label="Lọc nhanh">
        <button type="button" className={`btn btn-sm ${recon ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={recon} onClick={() => goWith({ reconciliation: recon ? '' : '1' })}><Icon name="alert-triangle" className="icon-sm" /> Cần đối soát ({reconCount})</button>
        <button type="button" className={`btn btn-sm ${overdue ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={overdue} onClick={() => goWith({ overdue: overdue ? '' : '1' })}><Icon name="clock" className="icon-sm" /> Quá 24 giờ ({overdueCount})</button>
        {anyFilter && <Link className="btn btn-ghost btn-sm" to="/admin/orders"><Icon name="x" className="icon-sm" /> Xoá bộ lọc</Link>}
        <button type="button" className="btn btn-secondary btn-sm ad-toggles-end" onClick={exportCsv}><Icon name="download" className="icon-sm" /> Xuất CSV</button>
      </div>
      {list.length ? (
        <div className="table-wrap" style={{ marginTop: 12 }}><table className="table"><thead><tr><th>Mã giao dịch</th><th>Người mua</th><th>Khóa học</th><th>Ngày tạo</th><th className="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
          {list.map((o) => (
            <tr key={o.id} className="is-clickable" tabIndex={0} onClick={() => openOrder(o.id)} onKeyDown={(e) => { if (e.key === 'Enter') openOrder(o.id); }}>
              <td className="mono">{o.code}</td>
              <td><div className="stack-1"><span className="small">{buyer(o).name}</span><span className="xsmall muted">{buyer(o).email}</span></div></td>
              <td className="small ad-courses-cell" title={courseTitles(o)}>{courseTitles(o)}</td>
              <td className="od-nowrap small">{fmt.datetime(o.createdAt)}</td>
              <td className="num od-nowrap">{vnd(o.total)}</td>
              <td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}><OrderStatus status={o.status} />{isOverdue(o) && <span className="badge badge-danger">Quá hạn</span>}{needsReconciliation(o) && <span className="badge badge-warn">Đối soát</span>}</div></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : (
        <div className="card" style={{ marginTop: 12 }}><Empty icon="receipt" title="Không có đơn hàng phù hợp" body="Thử mở rộng khoảng thời gian hoặc bỏ bớt các điều kiện lọc." actions={anyFilter ? <Link className="btn btn-secondary" to="/admin/orders">Xoá bộ lọc</Link> : null} /></div>
      )}
    </AdminShell>
  );
}

