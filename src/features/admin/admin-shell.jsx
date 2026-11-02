/**
 * Shared pieces of the admin console: the workspace shell (left nav), order helpers and a confirm dialog that
 * accepts a rich body and an acknowledgement checkbox (the shared Codi.ui.confirm renders body inside <p> and has
 * no consent gate, which the deactivate-user dialog needs — PRODUCT S31 / STATE-MACHINES §21).
 */
import { useState } from 'react';
import { Codi } from '../../lib/codi';
import { Workspace, Alert, Icon } from '../../components/ui/primitives';
import { isOverdue } from './admin-metrics';

export const DAY = 86400000;
export const db = () => Codi.db();
export const me = () => Codi.currentUser();
/** Re-render (and sync) after an in-place mutation of Codi.db(). */
export const persist = (render) => Codi.set(() => {}, { render: render !== false });

export { isOverdue };
export const courseTitles = (o) => (o.items || []).map((i) => (Codi.course(i.courseId) || { title: '(đã xoá)' }).title).join(', ');
export const buyer = (o) => Codi.user(o.userId) || { name: 'Người dùng đã xoá', email: '' };
/** Non-negative integer from "1.290.000", "990000 ₫" … or null. */
export const parsePrice = (s) => { const t = String(s || '').replace(/[.\s₫,]/g, ''); return /^\d+$/.test(t) ? Number(t) : null; };

export function AdminShell({ active, children }) {
  const pending = db().courses.filter((c) => c.status === 'pending').length;
  const items = [
    { section: 'Quản trị', href: '/admin', label: 'Tổng quan', icon: 'layout-dashboard' },
    { section: 'Khóa học', href: '/admin/publication', label: 'Duyệt xuất bản', icon: 'clipboard-check', count: pending, match: /^\/admin\/publication/ },
    { section: 'Khóa học', href: '/admin/courses', label: 'Khóa học đã xuất bản', icon: 'book-open' },
    { section: 'Vận hành', href: '/admin/users', label: 'Người dùng', icon: 'users' },
    { section: 'Vận hành', href: '/admin/orders', label: 'Đơn hàng & giao dịch', icon: 'receipt' },
    { section: 'Vận hành', href: '/admin/vouchers', label: 'Voucher', icon: 'ticket' },
    { section: 'Phân tích', href: '/admin/insights', label: 'Quan sát hệ thống', icon: 'bar-chart', match: /^\/admin\/insights/ }, // mockup names 'activity', which is not in the icon set
    { section: 'Phân tích', href: '/admin/finance', label: 'Tài chính', icon: 'trending-up', match: /^\/admin\/finance/ },
  ];
  return <Workspace label="Quản trị" active={active} items={items}>{children}</Workspace>;
}

function ConfirmImpactBody({ o, handle, resolve }) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [consent, setConsent] = useState(false);
  const rev = o.reversible === undefined ? null : o.reversible === true ? 'Có thể hoàn tác sau.' : o.reversible === false ? 'Không thể hoàn tác.' : o.reversible;
  const ok = () => {
    if (o.requireReason && reason.trim().length < (o.minReason || 1)) { setReasonError(true); return; }
    resolve({ ok: true, reason: reason.trim() });
    handle.close();
  };
  return (
    <>
      <div className="dialog-body">
        {o.body}
        {o.consequence && <Alert type={o.danger ? 'danger' : 'warn'} title="Điều gì sẽ xảy ra" body={o.consequence} />}
        {rev && <p className="small muted"><Icon name={o.reversible === false ? 'alert-circle' : 'rotate-ccw'} className="icon-sm" /> {rev}</p>}
        {o.requireReason && (
          <div className={`field ${reasonError ? 'is-invalid' : ''}`}>
            <label htmlFor="confirm-reason">{o.reasonLabel || 'Lý do'} <span className="req">*</span></label>
            <textarea id="confirm-reason" rows={3} placeholder={o.reasonPlaceholder || ''} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(false); }} autoFocus />
            {reasonError && <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{o.reasonError || 'Vui lòng nhập lý do.'}</span></p>}
          </div>
        )}
        {o.requireConsent && (
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {o.requireConsent}</label>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={() => handle.close()}>{o.cancelLabel || 'Huỷ'}</button>
        <button type="button" className={`btn ${o.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!!o.requireConsent && !consent} onClick={ok}>
          {o.confirmLabel || 'Xác nhận'}
        </button>
      </div>
    </>
  );
}

/**
 * Like Codi.ui.confirm, plus: body may be any React node (rendered as-is), requireConsent: label of a checkbox that
 * must be ticked before the confirm button enables, minReason: minimum trimmed reason length (default 1) with
 * reasonError as its message. Resolves { ok, reason }.
 */
export function confirmImpact(o) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    Codi.ui.modal({
      title: o.title || 'Xác nhận',
      raw: true,
      body: (handle) => <ConfirmImpactBody o={o} handle={handle} resolve={finish} />,
      onClose: () => finish({ ok: false }),
    });
  });
}
