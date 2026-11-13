/**
 * Shared pieces of the admin console: the workspace shell (left nav), loading/error states and a confirm dialog that
 * accepts a rich body and an acknowledgement checkbox (the shared Codi.ui.confirm renders body inside <p> and has
 * no consent gate, which the deactivate-user dialog needs — PRODUCT S31 / STATE-MACHINES §21).
 */
import { useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Workspace, Alert, Icon, SpinnerBlock } from '../../components/ui/primitives';
import { usePendingCount } from './admin-data';

export const DAY = 86400000;
/** Signed-in admin id (backend session). */
export const meId = () => (Codi.session && Codi.session.user ? Codi.session.user.id : null);
/** Non-negative integer from "1.290.000", "990000 ₫" … or null. */
export const parsePrice = (s) => { const t = String(s || '').replace(/[.\s₫,]/g, ''); return /^\d+$/.test(t) ? Number(t) : null; };

/** Loading / error states shared by the admin screens: renders children(data) once loaded. */
export function Loaded({ res, text, children }) {
  if (res.error && !res.data) {
    return <Alert type="danger" title="Không tải được dữ liệu" body={res.error.message} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => res.reload()}>Thử lại</button>} />;
  }
  if (!res.data) return <SpinnerBlock text={text} />;
  return children(res.data);
}

export function AdminShell({ active, children }) {
  const pending = usePendingCount();
  const items = [
    { section: 'Quản trị', href: '/admin', label: 'Tổng quan', icon: 'layout-dashboard' },
    { section: 'Khoá học', href: '/admin/publication', label: 'Duyệt xuất bản', icon: 'clipboard-check', count: pending, match: /^\/admin\/publication/ },
    { section: 'Khoá học', href: '/admin/courses', label: 'Khoá học đã xuất bản', icon: 'book-open' },
    { section: 'Vận hành', href: '/admin/users', label: 'Người dùng', icon: 'users' },
    { section: 'Vận hành', href: '/admin/orders', label: 'Đơn hàng', icon: 'receipt' },
    { section: 'Vận hành', href: '/admin/vouchers', label: 'Voucher', icon: 'ticket' },
    { section: 'Vận hành', href: '/admin/certificates', label: 'Chứng chỉ', icon: 'graduation-cap' },
    { section: 'Phân tích', href: '/admin/insights', label: 'Quan sát hệ thống', icon: 'bar-chart', match: /^\/admin\/insights/ }, // mockup names 'activity', which is not in the icon set
    { section: 'Phân tích', href: '/admin/finance', label: 'Tài chính', icon: 'trending-up', match: /^\/admin\/finance/ },
  ];
  return <Workspace label="Quản trị" active={active} items={items}>{children}</Workspace>;
}

/**
 * Search field for admin lists: filters as you type (debounced) and also on Enter or "Tìm". `value` is the
 * committed query from the URL; the field re-syncs when it changes from outside (e.g. a filter chip clears it), but
 * not when it is just the trimmed echo of what is being typed, so a trailing space survives. `onSearch(q, { replace })`:
 * debounced commits ask for replace-navigation so typing does not stack history entries; Enter/"Tìm" pushes.
 */
export function SearchField({ id, label, placeholder, value, onSearch, delay = 300 }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const commit = useRef(onSearch);
  commit.current = onSearch;
  if (value !== synced) { setSynced(value); if (value !== text.trim()) setText(value); }
  useEffect(() => {
    if (text.trim() === value) return undefined;
    const t = setTimeout(() => commit.current(text.trim(), { replace: true }), delay);
    return () => clearTimeout(t);
  }, [text, value, delay]);
  const submit = (e) => { e.preventDefault(); commit.current(text.trim(), { replace: false }); };
  return (
    <form className="field" role="search" onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <div className="input-group">
        <input id={id} name="q" type="search" className="input" placeholder={placeholder} value={text} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-secondary" type="submit"><Icon name="search" className="icon-sm" /> Tìm</button>
      </div>
    </form>
  );
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
