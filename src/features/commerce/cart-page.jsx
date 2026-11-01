/**
 * S05 Cart '/cart' (real components/cart/cart-view.tsx) — line items with remove + 10 s undo (in-page countdown and
 * toast), voucher field ("Đang áp dụng…"), order summary, "Thanh toán". States: empty, items, voucher applied,
 * voucher invalid (blocks checkout with the voucher message), owned item auto-removed notice, pending order banner
 * with "Huỷ đơn này" / "Tiếp tục thanh toán", replace-order modal, checkout error.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Thumb } from '../../components/ui/primitives';
import { cancelOrder, cartSummary, checkVoucher, cm, createOrderFromCart, lecturerName, myPendingOrders, priceLabel, uid } from './commerce-lib';

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
  const [draft, setDraft] = useState('');
  const [voucherError, setVoucherError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [ownedNotice, setOwnedNotice] = useState([]);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [removed, setRemoved] = useState(null); // { id, title }
  const [undoLeft, setUndoLeft] = useState(0);

  // Auto-remove courses the learner already owns (e.g. bought elsewhere) and explain why.
  const ownedInCart = Codi.cart().filter((id) => Codi.isEnrolled(id));
  const ownedKey = ownedInCart.join(',');
  useEffect(() => {
    if (!ownedKey) return;
    const ids = ownedKey.split(',');
    setOwnedNotice(ids.map((id) => (Codi.course(id) || { title: id }).title));
    Codi.set(() => Codi.setCart(Codi.cart().filter((id) => !Codi.isEnrolled(id))));
  }, [ownedKey]);

  // Undo window: counts down from 10 s, then the in-page alert clears.
  useEffect(() => {
    if (!removed) return undefined;
    const t = setInterval(() => setUndoLeft((n) => {
      if (n <= 1) { setRemoved(null); return 0; }
      return n - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [removed]);

  const s = cartSummary();
  const courses = s.courses.filter((c) => !ownedInCart.includes(c.id));
  const pending = myPendingOrders()[0];

  const undo = (id) => {
    Codi.set(() => { if (!Codi.cart().includes(id)) Codi.setCart(Codi.cart().concat(id)); });
    setRemoved((r) => (r && r.id === id ? null : r)); setUndoLeft(0);
  };
  const remove = (c) => {
    Codi.set(() => Codi.setCart(Codi.cart().filter((x) => x !== c.id)));
    setRemoved({ id: c.id, title: c.title }); setUndoLeft(UNDO_SECONDS);
    Codi.ui.toast(`Đã xoá "${c.title}" khỏi giỏ hàng`, { duration: UNDO_SECONDS * 1000, action: { label: 'Hoàn tác', onClick: () => undo(c.id) } });
  };
  const applyVoucher = (e) => {
    e.preventDefault();
    const code = draft.trim().toUpperCase();
    if (!code) { setVoucherError('Nhập mã giảm giá trước khi bấm Áp dụng.'); return; }
    setApplying(true); setVoucherError(null);
    setTimeout(() => {
      setApplying(false);
      const r = checkVoucher(code, cartSummary().subtotal);
      if (r.error) { setVoucherError(r.error); return; }
      setDraft('');
      Codi.set(() => { cm().voucher[uid()] = r.voucher.code; });
    }, 400);
  };
  const removeVoucher = () => { setVoucherError(null); Codi.set(() => { cm().voucher[uid()] = null; }); };
  const cancelPending = (p) => {
    setCancelling(true); setError(null);
    setTimeout(() => {
      let ok = false;
      Codi.set((st) => { const o = st.db.orders.find((x) => x.id === p.id); ok = cancelOrder(o); });
      setCancelling(false);
      if (!ok) setError('Đơn hàng không tồn tại, đã hoàn tất thanh toán hoặc đã được huỷ trước đó.');
    }, 400);
  };

  const runCheckout = (replaceOrderId) => {
    setCreating(true); setError(null);
    setTimeout(() => {
      const r = createOrderFromCart({ replaceOrderId });
      setCreating(false);
      if (r.order) { Codi.ui.closeAll(); Codi.go('/checkout?order=' + r.order.id); return; }
      if (r.code === 'PENDING_ORDER_EXISTS') { openReplaceModal(r.pending); return; }
      Codi.ui.closeAll();
      setError(r.error || 'Không thể tạo đơn hàng.');
      Codi.rerender();
    }, 500);
  };
  const openReplaceModal = (p) => {
    Codi.ui.modal({
      title: 'Bạn còn một đơn hàng chưa thanh toán',
      body: (<>
        <p>Đơn <strong>{p.code}</strong> ({fmt.vnd(p.total)}) đang chờ thanh toán. Bạn muốn làm gì?</p>
        <p className="small muted">Tạo đơn mới sẽ huỷ đơn cũ. Nếu bạn đã chuyển khoản cho đơn cũ, hãy chọn tiếp tục đơn cũ.</p>
      </>),
      footer: (<>
        <button type="button" className="btn btn-ghost" data-close>Đóng</button>
        <Link className="btn btn-secondary" to={`/checkout?order=${p.id}`} data-close>Tiếp tục đơn cũ</Link>
        <ReplaceButton onConfirm={() => runCheckout(p.id)} />
      </>),
    });
  };
  const checkout = () => {
    setRemoved(null);
    const p = myPendingOrders()[0];
    if (p) openReplaceModal(p); else runCheckout(null);
  };

  const notices = (<>
    {error && <Alert type="danger" title="Lỗi" body={error} />}
    {pending && (
      <Alert type="warn" title={`Bạn có đơn hàng ${pending.code} đang chờ thanh toán`}
        body={`${pending.items.length} khoá học · ${fmt.vnd(pending.total)} · tạo lúc ${fmt.datetime(pending.createdAt)}`}
        actions={<>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cancelPending(pending)} disabled={cancelling} aria-busy={cancelling ? 'true' : undefined}>{cancelling ? 'Đang huỷ…' : 'Huỷ đơn này'}</button>
          <Link className="btn btn-primary btn-sm" to={`/checkout?order=${pending.id}`}>Tiếp tục thanh toán</Link>
        </>} />
    )}
    {ownedNotice.length > 0 && <Alert type="info" title="Đã bỏ khoá học bạn đã sở hữu khỏi giỏ" body={ownedNotice.join(', ')} />}
    {removed && !Codi.cart().includes(removed.id) && (
      <Alert type="info" title={`Đã xoá "${removed.title}" khỏi giỏ hàng`}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => undo(removed.id)}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác {undoLeft > 0 ? `(${undoLeft}s)` : ''}</button>} />
    )}
  </>);

  if (!courses.length) {
    return (
      <div className="page page-narrow stack-4">{notices}<h1>Giỏ hàng</h1>
        <div className="card">
          <Empty icon="book-open" title="Giỏ hàng của bạn đang trống" body="Thêm khoá học từ danh sách, hoặc nhờ AI Codi gợi ý khoá phù hợp với mục tiêu."
            actions={<><Link className="btn btn-primary" to="/courses">Khám phá khoá học</Link><Link className="btn btn-secondary" to="/ai"><Icon name="sparkles" /> Hỏi AI Codi</Link></>} />
        </div>
      </div>
    );
  }

  const verr = voucherError || (s.code && s.voucherInvalid);
  return (
    <div className="page stack-4">
      {notices}
      <h1>Giỏ hàng <span className="muted" style={{ fontWeight: 400 }}>({courses.length})</span></h1>
      <div className="layout-aside">
        <ul className="list stack-3">{courses.map((c) => (
          <li key={c.id} className="card"><div className="card-body compact row cm-cart-row">
            <Thumb course={c} small />
            <div className="od-fill stack-1"><Link className="strong" to={`/courses/${c.slug}`}>{c.title}</Link><span className="small muted">{lecturerName(c)} · {Codi.levelLabel(c.level)}</span></div>
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
                : <p className="field-help" id="voucher-err"><span className="strong">Chỉ để test:</span> thử WELCOME20 (đơn từ 500.000 ₫) hoặc SUMMER15 (đã hết hạn).</p>}
              {s.code && s.voucherInvalid && <button type="button" className="btn btn-link small" onClick={removeVoucher}>Bỏ mã giảm giá</button>}
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
