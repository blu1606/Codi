/**
 * S34 "Đơn hàng & giao dịch" — port of the real orders page (orders-table-client, order-detail-drawer,
 * order-export-modal, admin-orders-service): summary tiles, filters, quick toggles "Cần đối soát (n)" /
 * "Quá 24 giờ (n)" / "Xoá bộ lọc" / "Xuất CSV", transactions table, detail drawer with reconciliation warning,
 * timeline and admin cancel of pending orders.
 *
 * Data: getAdminOrdersExportAction(filter) (the list behind Codi's orders page, filtered on the server),
 * getAdminOrderDetailAction(id | code), cancelAdminOrderAction(id, reason).
 * Query: range=7|30|90|all, status, q, overdue=1, reconciliation=1, id=<orderId | CODIxxxxx> (opens the drawer).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, Alert, Empty, OrderStatus, orderStatusLabel, SpinnerBlock } from '../../components/ui/primitives';
import { AdminShell, Loaded, confirmImpact } from './admin-shell';
import { useAction, adminAction, attempt } from './admin-data';

const { fmt } = Codi;
const RANGES = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Tất cả']];
const STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];
const vnd = (n) => fmt.vnd(Number(n) || 0);

/** Page query → AdminOrdersFilter of the backend. */
const filterOf = (q) => ({
  range: ['7', '30', '90', 'all'].includes(q.range) ? q.range : '30',
  status: STATUSES.includes(q.status) ? q.status : 'all',
  q: (q.q || '').trim(),
  overdueOnly: q.overdue === '1' || q.overdue === true,
  reconciliationOnly: q.reconciliation === '1' || q.reconciliation === true,
});

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
  const ok = await attempt(() => adminAction('cancelAdminOrderAction', o.id, r.reason), `Đã huỷ đơn hàng ${o.code}.`);
  if (ok) handle.close();
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
  const res = useAction('dashboard/admin', 'getAdminOrderDetailAction', [id]);
  const o = res.data;
  if (res.loading && !o) return <div className="sheet-body"><SpinnerBlock text="Đang tải đơn hàng…" /></div>;
  if (res.error && !o) return <div className="sheet-body"><Alert type="danger" title="Không tải được đơn hàng" body={res.error.message} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => res.reload()}>Thử lại</button>} /></div>;
  if (!o) return <div className="sheet-body"><p className="small muted">Không tìm thấy đơn hàng.</p></div>;
  const items = o.items || [];
  const events = (o.timeline || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first, like the real drawer
  const flagged = !!o.needsReconciliation;
  return (
    <>
      <div className="sheet-body stack-4">
        <p className="small muted" style={{ margin: 0 }}>Chi tiết đơn hàng {o.code} và lịch sử giao dịch</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <OrderStatus status={o.status} />
          {o.isOverdue && <span className="badge badge-danger"><Icon name="clock" />Quá hạn (&gt;24h)</span>}
          {flagged && <span className="badge badge-warn"><Icon name="alert-triangle" />Cần đối soát</span>}
        </div>
        {flagged && (
          <Alert type="warn" title="Lưu ý đối soát ngân hàng (D2/D3)"
            body="Đơn hàng này được gắn cờ đối soát thủ công (có thể do chuyển khoản thừa tiền, thiếu tiền khi hết hạn, hoặc chuyển khoản muộn sau khi đã sở hữu khoá học). Vui lòng kiểm tra sao kê ngân hàng VietQR trước khi xử lý hoàn tiền ngoài hệ thống." />
        )}
        <div className="panel stack-1"><span className="xsmall muted">Người mua</span><strong className="small">{o.buyerName}</strong><span className="small muted">{o.buyerEmail}</span></div>
        <div className="stack-2"><span className="xsmall muted">Khoá học đã đặt ({items.length})</span>
          <ul className="list">{items.map((i) => (
            <li key={i.id} className="list-row" style={{ paddingInline: 0 }}><span className="list-main small">{i.courseTitle}</span><span className="small od-nowrap muted">{vnd(i.unitPrice)}</span></li>
          ))}</ul>
          {o.voucherCode && <div className="row-between small"><span className="muted">Voucher {o.voucherCode}</span><span className="text-success">−{vnd(o.discountAmount)}</span></div>}
          <div className="row-between strong ad-order-total"><span>Tổng tiền</span><span>{vnd(o.totalAmount)}</span></div>
          {o.receivedAmount > 0 && o.status === 'pending' && <div className="row-between small text-warn"><span>Đã nhận thực tế</span><span>{vnd(o.receivedAmount)}</span></div>}
        </div>
        <div className="stack-1"><span className="xsmall muted">Nội dung chuyển khoản (VietQR)</span>
          <div className="copy-row is-emphasis"><div className="copy-main"><span className="copy-value">{o.content || o.code}</span></div><CopyTransfer text={o.content || o.code} /></div></div>
        <div className="stack-1"><span className="xsmall muted">Phương thức</span><span className="small">{o.method || 'Chuyển khoản ngân hàng'}</span></div>
        {['cancelled', 'failed'].includes(o.status) && o.failReason && <div className="stack-1"><span className="xsmall muted">{o.status === 'cancelled' ? 'Lý do huỷ' : 'Lý do thất bại'}</span><span className="small">{o.failReason}</span></div>}
        <div className="stack-2"><span className="xsmall muted">Lịch sử trạng thái</span>
          {events.length
            ? <ol className="ad-timeline">{events.map((t) => <li key={t.id}><span className="small">{t.label}</span><span className="xsmall muted">{fmt.datetime(t.createdAt)}</span></li>)}</ol>
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

/** Opens the order drawer; idOrCode is the numeric id or the CODIxxxxx code. */
export function openOrder(idOrCode, code) {
  if (idOrCode === undefined || idOrCode === null || idOrCode === '') return;
  const label = code || (/^CODI/i.test(String(idOrCode)) ? String(idOrCode).toUpperCase() : null);
  Codi.ui.closeAll();
  Codi.ui.sheet({ title: label ? 'Đơn ' + label : 'Chi tiết đơn hàng', raw: true, body: (h) => <OrderDrawer id={/^\d+$/.test(String(idOrCode)) ? Number(idOrCode) : String(idOrCode)} handle={h} /> });
}

// ───────────────────────── CSV export ─────────────────────────
const COLS = [['code', 'Mã giao dịch'], ['buyer', 'Người mua'], ['email', 'Email'], ['courses', 'Khoá học'], ['voucher', 'Voucher'], ['discount', 'Giảm giá'], ['total', 'Tổng tiền'], ['status', 'Trạng thái'], ['createdAt', 'Ngày tạo'], ['paidAt', 'Ngày thanh toán']];
const cellOf = {
  code: (o) => o.code, buyer: (o) => o.buyerName, email: (o) => o.buyerEmail, courses: (o) => o.coursesText, voucher: (o) => o.voucherCode || '',
  discount: (o) => o.discountAmount || 0, total: (o) => o.totalAmount, status: (o) => orderStatusLabel(o.status), createdAt: (o) => o.createdAt, paidAt: (o) => o.paidAt || '',
};

function ExportDialog({ handle, query }) {
  const [range, setRange] = useState(filterOf(query).range);
  const [applyFilter, setApplyFilter] = useState(true);
  const [columns, setColumns] = useState(() => Object.fromEntries(COLS.map(([k]) => [k, true])));
  // Time range always comes from the dialog; status / search / toggles come from the page only when applied.
  const expFilter = applyFilter ? { ...filterOf(query), range } : { ...filterOf({}), range };
  const res = useAction('dashboard/admin', 'getAdminOrdersExportAction', [expFilter]);
  const list = res.data || [];
  const cols = COLS.filter(([k]) => columns[k]).map(([k]) => k);
  const status = filterOf(query).status;
  const doExport = () => {
    if (!cols.length) { Codi.ui.toast('Chọn ít nhất một cột để xuất.', { type: 'warn' }); return; }
    if (!res.data) { Codi.ui.toast('Không thể xuất dữ liệu do lỗi truy vấn. Vui lòng thử lại.', { type: 'danger' }); return; }
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
          <div className="ad-export-summary" aria-busy={res.loading}><span className="small muted">{res.error ? res.error.message : res.loading && !res.data ? 'Đang đếm đơn…' : `${fmt.num(list.length)} đơn · ${fmt.num(cols.length)} cột · ${vnd(list.reduce((s, o) => s + (o.totalAmount || 0), 0))} tổng tiền`}</span></div>
        </form>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={res.loading} onClick={doExport}>Xuất CSV</button>
      </div>
    </>
  );
}

// ───────────────────────── page ─────────────────────────
function OrdersTable({ list, anyFilter }) {
  if (!list.length) {
    return <div className="card"><Empty icon="receipt" title="Không có đơn hàng phù hợp" body="Thử mở rộng khoảng thời gian hoặc bỏ bớt các điều kiện lọc." actions={anyFilter ? <Link className="btn btn-secondary" to="/admin/orders">Xoá bộ lọc</Link> : null} /></div>;
  }
  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>Mã giao dịch</th><th>Người mua</th><th>Khoá học</th><th>Ngày tạo</th><th className="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
      {list.map((o) => (
        <tr key={o.id} className="is-clickable" tabIndex={0} onClick={() => openOrder(o.id, o.code)} onKeyDown={(e) => { if (e.key === 'Enter') openOrder(o.id, o.code); }}>
          <td className="mono">{o.code}</td>
          <td><div className="stack-1"><span className="small">{o.buyerName}</span><span className="xsmall muted">{o.buyerEmail}</span></div></td>
          <td className="small ad-courses-cell" title={o.coursesText}>{o.coursesText}</td>
          <td className="od-nowrap small">{fmt.datetime(o.createdAt)}</td>
          <td className="num od-nowrap">{vnd(o.totalAmount)}</td>
          <td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}><OrderStatus status={o.status} />{o.isOverdue && <span className="badge badge-danger">Quá hạn</span>}{o.needsReconciliation && <span className="badge badge-warn">Đối soát</span>}</div></td>
        </tr>
      ))}
    </tbody></table></div>
  );
}

export function OrdersPage({ query: q }) {
  const f = filterOf(q);
  const res = useAction('dashboard/admin', 'getAdminOrdersExportAction', [f]);
  const list = res.data || [];
  const overdue = f.overdueOnly; const recon = f.reconciliationOnly;
  const paid = list.filter((o) => o.status === 'paid');
  const overdueCount = list.filter((o) => o.isOverdue).length;
  const reconCount = list.filter((o) => o.needsReconciliation).length;
  const anyFilter = f.status !== 'all' || f.range !== '30' || !!f.q || overdue || recon;
  useEffect(() => { if (q.id) openOrder(q.id); }, [q.id]);

  const goWith = (patch) => {
    const nq = { range: '30', status: 'all', ...Codi.query(), ...patch };
    delete nq.id;
    Object.keys(nq).forEach((k) => { if (nq[k] === '' || nq[k] == null) delete nq[k]; });
    Codi.go('/admin/orders?' + new URLSearchParams(nq).toString());
  };
  const onSearch = (e) => { e.preventDefault(); goWith({ q: String(new FormData(e.currentTarget).get('q') || '').trim() }); };
  const exportCsv = () => Codi.ui.modal({ size: 'md', title: 'Xuất CSV', raw: true, body: (h) => <ExportDialog handle={h} query={Codi.query()} /> });
  const tile = (v) => (res.data ? v : '…');

  return (
    <AdminShell active="/admin/orders">
      <div className="page-header"><div><h1>Đơn hàng & giao dịch</h1><p className="muted">Thanh toán chuyển khoản VietQR, xác nhận tự động theo nội dung chuyển khoản.</p></div></div>
      <div className="grid-4" style={{ marginBottom: 16 }} aria-busy={res.loading}>
        <div className="stat-tile"><span className="stat-value">{tile(list.length)}</span><span className="stat-label">Đơn trong bộ lọc</span></div>
        <div className="stat-tile"><span className="stat-value text-success">{tile(paid.length)}</span><span className="stat-label">Đã thanh toán</span></div>
        <div className="stat-tile"><span className="stat-value text-warn">{tile(list.filter((o) => o.status === 'pending').length)}</span><span className="stat-label">Chờ thanh toán</span>{overdueCount > 0 && <span className="stat-meta text-danger"><Icon name="clock" className="icon-sm" /> {overdueCount} quá hạn</span>}</div>
        <div className="stat-tile"><span className="stat-value od-nowrap">{tile(vnd(paid.reduce((s, o) => s + (o.totalAmount || 0), 0)))}</span><span className="stat-label">Doanh thu</span></div>
      </div>
      <div className="ad-filters ad-filters-orders">
        <div className="field"><span className="field-label">Thời gian</span>
          <div className="segmented" role="group" aria-label="Khoảng thời gian">
            {RANGES.map(([k, l]) => <button key={k} type="button" aria-pressed={f.range === k} onClick={() => goWith({ range: k })}>{l}</button>)}
          </div></div>
        <div className="field"><label htmlFor="o-status">Trạng thái</label>
          <select id="o-status" value={f.status} onChange={(e) => goWith({ status: e.target.value })}>
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
      <div style={{ marginTop: 12 }}><Loaded res={res} text="Đang tải đơn hàng…">{(rows) => <OrdersTable list={rows} anyFilter={anyFilter} />}</Loaded></div>
    </AdminShell>
  );
}
