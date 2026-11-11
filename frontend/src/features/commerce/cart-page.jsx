/**
 * S05 Cart '/cart' (real components/cart/cart-view.tsx) — line items with remove + 10 s undo (in-page countdown and
 * toast), voucher field ("Đang áp dụng…"), order summary, "Thanh toán". States: loading, load error, empty, items,
 * voucher applied, voucher invalid (blocks checkout with the voucher message), owned item auto-removed notice,
 * pending order banner with "Huỷ đơn này" / "Tiếp tục thanh toán", replace-order modal, checkout error.
 * Data: GET/POST/DELETE /api/student/cart, POST /api/vouchers/validate, POST /api/orders/checkout, /api/orders/cancel.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Thumb } from '../../components/ui/primitives';
import { priceLabel } from './commerce-lib';
import { cartChanged, checkoutCart, getVoucher, levelLabel, setVoucher } from './commerce-api';

const fmt = Codi.fmt;
const UNDO_SECONDS = 10;

function ReplaceButton({ onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn-danger" disabled={busy} aria-busy={busy ? 'true' : undefined} onClick={() => { setBusy(true); onConfirm(); }}>
      {busy ? 'Đang xử lý…' : 'Huỷ đơn cũ, tạo đơn mới'}
    </button>
  );
}

export default function CartPage() {
  useCodi();
  const [voucher, setVoucherState] = useState(getVoucher);
  const cart = useApi('/api/student/cart' + (voucher ? '?voucher=' + encodeURIComponent(voucher) : ''));
  const [draft, setDraft] = useState('');
  const [voucherError, setVoucherError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [removed, setRemoved] = useState(null); // { id, title }
  const [undoLeft, setUndoLeft] = useState(0);

  const s = cart.data;
  useEffect(() => { if (s) cartChanged(s.count); }, [s]);

  // Undo window: counts down from 10 s, then the in-page alert clears.
  useEffect(() => {
    if (!removed) return undefined;
    const t = setInterval(() => setUndoLeft((n) => {
      if (n <= 1) { setRemoved(null); return 0; }
      return n - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [removed]);

  if (!s) {
    if (cart.error) {
      return (
        <div className="page page-narrow stack-4"><h1>Giỏ hàng</h1>
          <div className="card"><Empty icon="alert-circle" title="Không tải được giỏ hàng" body={<span role="alert">{cart.error.message}</span>}
            actions={<button type="button" className="btn btn-secondary" onClick={() => cart.reload()}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} /></div>
        </div>
      );
    }
    return (
      <div className="page stack-4" aria-busy="true">
        <h1>Giỏ hàng</h1>
        <div className="layout-aside">
          <div className="stack-3">{[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>
          <div className="skeleton" style={{ height: 280 }} />
        </div>
        <p className="sr-only" role="status">Đang tải giỏ hàng…</p>
      </div>
    );
  }

  const courses = s.items;
  const pending = s.pendingOrder;
  const ownedNotice = s.removedOwnedTitles || [];

  const changeVoucher = (code) => { setVoucher(code); setVoucherState(code); };
  const undo = async (id) => {
    setRemoved((r) => (r && r.id === id ? null : r)); setUndoLeft(0);
    try { await api.post('/api/student/cart', { courseId: id }); } catch (e) { Codi.ui.toast(e.message, { type: 'danger' }); }
    cart.reload(); cartChanged();
  };
  const remove = async (c) => {
    try {
      await api.del('/api/student/cart', { courseId: c.id });
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
      return;
    }
    setRemoved({ id: c.id, title: c.title }); setUndoLeft(UNDO_SECONDS);
    cart.setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== c.id) } : d));
    cart.reload(); cartChanged();
    // The in-page notice above the list carries the undo (with its countdown); no second toast for the same action.
  };
  const applyVoucher = async (e) => {
    e.preventDefault();
    const code = draft.trim().toUpperCase();
    if (!code) { setVoucherError('Nhập mã giảm giá trước khi bấm Áp dụng.'); return; }
    setApplying(true); setVoucherError(null);
    try {
      const r = await api.post('/api/vouchers/validate', { code });
      setDraft('');
      changeVoucher(r.voucher.code);
    } catch (err) {
      setVoucherError(err.message);
    } finally {
      setApplying(false);
    }
  };
  const removeVoucher = () => { setVoucherError(null); changeVoucher(''); };
  const cancelPending = async (p) => {
    setCancelling(true); setError(null);
    try {
      await api.post('/api/orders/cancel', { orderId: p.id });
      Codi.ui.toast('Đã huỷ đơn hàng. Khoá học đã quay lại giỏ hàng.', { type: 'success' });
    } catch (e) {
      setError(e.message || 'Đơn hàng không tồn tại, đã hoàn tất thanh toán hoặc đã được huỷ trước đó.');
    } finally {
      setCancelling(false);
      cart.reload(); cartChanged();
    }
  };

  const runCheckout = async (replaceOrderId) => {
    setCreating(true); setError(null);
    try {
      const r = await checkoutCart({ total: s.total, replaceOrderId });
      Codi.ui.closeAll();
      setVoucherState('');
      Codi.go((r.totalAmount === 0 ? '/checkout/success?order=' : '/checkout?order=') + encodeURIComponent(r.orderCode));
    } catch (e) {
      if (e.body && e.body.code === 'PENDING_ORDER_EXISTS') {
        const fresh = await cart.reload();
        if (fresh && fresh.pendingOrder) { openReplaceModal(fresh.pendingOrder); return; }
      }
      Codi.ui.closeAll();
      setError(e.message || 'Không thể tạo đơn hàng.');
      cart.reload();
    } finally {
      setCreating(false);
    }
  };
  const openReplaceModal = (p) => {
    Codi.ui.modal({
      title: 'Bạn còn một đơn hàng chưa thanh toán',
      body: (<>
        <p>Đơn <strong>{p.code}</strong> ({fmt.vnd(p.totalAmount)}) đang chờ thanh toán. Bạn muốn làm gì?</p>
        <p className="small muted">Tạo đơn mới sẽ huỷ đơn cũ. Nếu bạn đã chuyển khoản cho đơn cũ, hãy chọn tiếp tục đơn cũ.</p>
      </>),
      footer: (<>
        <button type="button" className="btn btn-ghost" data-close>Đóng</button>
        <Link className="btn btn-secondary" to={`/checkout?order=${p.code}`} data-close>Tiếp tục đơn cũ</Link>
        <ReplaceButton onConfirm={() => runCheckout(p.id)} />
      </>),
    });
  };
  const checkout = () => {
    setRemoved(null);
    if (pending) openReplaceModal(pending); else runCheckout(null);
  };

  const notices = (<>
    {error && <Alert type="danger" title="Lỗi" body={error} />}
    {pending && (
      <Alert type="warn" title={`Bạn có đơn hàng ${pending.code} đang chờ thanh toán`}
        body={`${pending.itemCount} khoá học · ${fmt.vnd(pending.totalAmount)} · tạo lúc ${fmt.datetime(pending.createdAt)}`}
        actions={<>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cancelPending(pending)} disabled={cancelling} aria-busy={cancelling ? 'true' : undefined}>{cancelling ? 'Đang huỷ…' : 'Huỷ đơn này'}</button>
          <Link className="btn btn-primary btn-sm" to={`/checkout?order=${pending.code}`}>Tiếp tục thanh toán</Link>
        </>} />
    )}
    {ownedNotice.length > 0 && <Alert type="info" title="Đã bỏ khoá học bạn đã sở hữu khỏi giỏ" body={ownedNotice.join(', ')} />}
    {removed && !courses.some((c) => c.id === removed.id) && (
      <Alert type="info" title={`Đã xoá "${removed.title}" khỏi giỏ hàng`}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => undo(removed.id)}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác {undoLeft > 0 ? `(${undoLeft}s)` : ''}</button>} />
    )}
  </>);

  if (!courses.length) {
    return (
      <div className="page page-narrow stack-4"><h1>Giỏ hàng</h1>{notices}
        <div className="card">
          <Empty icon="book-open" title="Giỏ hàng của bạn đang trống" body="Thêm khoá học từ danh sách, hoặc nhờ AI Codi gợi ý khoá phù hợp với mục tiêu."
            actions={<><Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link><Link className="btn btn-secondary" to="/ai"><Icon name="sparkles" /> Hỏi AI Codi</Link></>} />
        </div>
      </div>
    );
  }

  const verr = voucherError || (voucher && s.voucherError);
  return (
    <div className="page stack-4">
      <h1>Giỏ hàng <span className="muted" style={{ fontWeight: 400 }}>({courses.length})</span></h1>
      {notices}
      <div className="layout-aside">
        <ul className="list stack-3">{courses.map((c) => (
          <li key={c.id} className="card"><div className="card-body compact row cm-cart-row">
            <Thumb course={c} small />
            <div className="od-fill stack-1"><Link className="strong" to={`/courses/${c.slug}`}>{c.title}</Link><span className="small muted">{c.lecturerName} · {levelLabel(c.level)}</span></div>
            <span className="price">{priceLabel(c)}</span>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => remove(c)} aria-label={`Xoá ${c.title} khỏi giỏ`}><Icon name="x" /></button>
          </div></li>
        ))}</ul>
        <aside><div className="card"><div className="card-body stack-4">
          <h2 className="h-card">Tóm tắt đơn hàng</h2>
          {s.voucher ? (
            <div className="stack-1">
              <span className="small strong">Mã giảm giá</span>
              <div className="row-between">
                <span className="chip"><Icon name="ticket" className="icon-sm" /> {s.voucher.code}<button type="button" onClick={removeVoucher} aria-label="Bỏ mã giảm giá"><Icon name="x" className="icon-sm" /></button></span>
                <span className="small text-success">Đã áp dụng</span>
              </div>
            </div>
          ) : (
            <form className={`field ${verr ? 'is-invalid' : ''}`} onSubmit={applyVoucher} noValidate>
              <label htmlFor="voucher">Mã giảm giá</label>
              <div className="input-group">
                <input id="voucher" name="code" className="input" value={draft} placeholder="Mã giảm giá" onChange={(e) => { setDraft(e.target.value); if (voucherError) setVoucherError(null); }} autoComplete="off" aria-describedby="voucher-err" aria-invalid={verr ? 'true' : undefined} style={{ textTransform: 'uppercase' }} />
                <button className="btn btn-secondary" type="submit" disabled={applying} aria-busy={applying ? 'true' : undefined}>{applying ? 'Đang áp dụng…' : 'Áp dụng'}</button>
              </div>
              {verr
                ? <p className="field-error" id="voucher-err" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{verr}</span></p>
                : <p className="field-help" id="voucher-err"><span className="strong">Chỉ để test:</span> thử WELCOME20 (đơn từ 500.000 ₫) hoặc SUMMER15 (đã ngừng áp dụng).</p>}
              {voucher && s.voucherError && <button type="button" className="btn btn-link small" onClick={removeVoucher}>Bỏ mã giảm giá</button>}
            </form>
          )}
          <dl className="cm-sum">
            <div><dt>Tạm tính</dt><dd>{fmt.vnd(s.subtotal)}</dd></div>
            <div><dt>Giảm giá</dt><dd className={s.discount ? 'text-success' : ''}>{s.discount ? '−' + fmt.vnd(s.discount) : fmt.vnd(0)}</dd></div>
            <div className="cm-sum-total"><dt>Tổng cộng</dt><dd>{fmt.vnd(s.total)}</dd></div>
          </dl>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={checkout} disabled={creating} aria-busy={creating ? 'true' : undefined}>{creating ? 'Đang tạo đơn…' : 'Thanh toán'}</button>
          <Link className="btn btn-ghost btn-block" to="/courses">Tiếp tục xem khoá học</Link>
          <p className="xsmall muted">Thanh toán bằng chuyển khoản ngân hàng (VietQR). Khoá học được mở ngay khi Codi nhận được tiền.</p>
        </div></div></aside>
      </div>
    </div>
  );
}
