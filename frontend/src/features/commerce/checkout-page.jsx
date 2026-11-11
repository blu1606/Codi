/**
 * S06 Checkout '/checkout?order=…' (real app/checkout/page.tsx, VietQR bank transfer) and S07 success
 * '/checkout/success?order=…' (real app/checkout/success/page.tsx). `order` is the order code (or numeric id).
 * States: creating, create error / payments unavailable / order not found (with support line), awaiting payment
 * (QR + countdown + copy rows + tracker + live status line), qr-failed (text fallback), manual check (30 s cooldown,
 * inline result, D5), underpaid, slow notice, expired (incl. late payment honoured afterwards), failed, paid,
 * cancelled, refunded.
 *
 * Data: GET /api/orders/:id (polled every 3 s; the server expires overdue orders), POST /api/orders/checkout,
 * /api/orders/cancel, /api/orders/:id/manual-check, /api/orders/:id/new-code. The QR is SePay's VietQR image for
 * the order's bank details, amount due and transfer content; the SePay webhook marks the order paid and enrols the
 * learner server-side, and polling picks that up.
 *
 * Demo tools only (Codi.demoTools): the Alt+K scenario paymentOutcome asks the backend (POST
 * /api/dev/simulate-payment) to post a simulated SePay transfer to the real webhook. Outcomes: success | overpaid |
 * underpaid (transfer after 6 s), expired (deadline moved to now), late (expired, then a transfer 8 s later),
 * slow / qrfail (no transfer), unavailable (checkout refused before an order is created). Without demo tools
 * nothing is simulated and the page waits for the real transfer.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon, Stepper, Thumb, orderStatusLabel } from '../../components/ui/primitives';
import { SUPPORT_EMAIL, mmss } from './commerce-lib';
import { cartChanged, checkoutCart, sepayQrUrl, simulatePayment, toOrder } from './commerce-api';

const fmt = Codi.fmt;
const clock = (ms) => new Date(ms).toLocaleTimeString('vi-VN');
const Mail = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
const POLL_MS = 3000;
const TRANSFER_AFTER_MS = 6000;
const SLOW_NOTICE_MS = 15000;
const LATE_TRANSFER_MS = 8000;

const amountDue = (o) => Math.max(0, o.total - (o.received || 0));
const timeLeft = (o) => (o.paymentDeadline ? new Date(o.paymentDeadline).getTime() - Date.now() : 0);
const orderUrl = (key) => `/api/orders/${encodeURIComponent(key)}`;

// ───────────────────────── payment simulation (demo tools only) ─────────────────────────
// One simulated transfer per order code and outcome per page session (StrictMode remounts never send twice).
const simulated = new Set();
const SIM_OUTCOME = { success: 'paid', overpaid: 'overpaid', underpaid: 'underpaid' };

function runSimulation(order, onChange) {
  if (!Codi.demoTools) return; // real shop: only the SePay webhook pays the order
  const outcome = Codi.state.scenario.paymentOutcome;
  const key = `${order.code}:${outcome}`;
  if (simulated.has(key)) return;
  const send = (kind) => simulatePayment(order.code, kind).then(onChange)
    .catch((e) => Codi.ui.toast('Không mô phỏng được giao dịch ngân hàng: ' + e.message, { type: 'danger' }));
  if (SIM_OUTCOME[outcome]) {
    if (outcome === 'underpaid' && order.received > 0) return;
    simulated.add(key);
    send(SIM_OUTCOME[outcome]);
  } else if (outcome === 'expired' || outcome === 'late') {
    simulated.add(key);
    // The late transfer arrives after the page has shown the expired state; polling picks up the result.
    send('expire').then(() => { if (outcome === 'late') setTimeout(() => send('paid'), LATE_TRANSFER_MS); });
  }
  // 'qrfail', 'slow' and anything else: no transfer arrives; auto-check keeps running until expiry.
}

function CopyRow({ label, value, copyValue, emphasis }) {
  return (
    <div className={`copy-row ${emphasis ? 'is-emphasis' : ''}`}>
      <div className="copy-main"><span className="copy-label">{label}</span><span className="copy-value">{value}</span></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => Codi.ui.copy(copyValue, e.currentTarget)} aria-label={`Sao chép ${label}`}>
        <Icon name="copy" className="icon-sm" /><span data-copy-label>Sao chép</span>
      </button>
    </div>
  );
}

function OrderSummary({ order }) {
  const subtotal = order.subtotal;
  return (
    <div className="card"><div className="card-body stack-3">
      <h2 className="h-card">Thông tin đơn hàng</h2>
      <ul className="list">{order.items.map((i) => {
        return (
          <li key={i.courseId} className="list-row" style={{ paddingInline: 0 }}>
            <span className="list-main"><span>{i.title || i.courseId}</span><span className="xsmall muted">Khoá học</span></span>
            <span className="price od-nowrap">{fmt.vnd(i.price)}</span>
          </li>
        );
      })}</ul>
      <dl className="cm-sum">
        <div><dt>Tạm tính</dt><dd>{fmt.vnd(subtotal)}</dd></div>
        {order.discount > 0 && <div><dt>Giảm giá {order.voucherCode ? `(${order.voucherCode})` : ''}</dt><dd className="text-success">−{fmt.vnd(order.discount)}</dd></div>}
        <div className="cm-sum-total"><dt>Tổng thanh toán</dt><dd>{fmt.vnd(order.total)}</dd></div>
      </dl>
      <p className="xsmall muted">Mã giao dịch (để đối soát): <span className="mono">{order.code}</span></p>
    </div></div>
  );
}

/** Creation / unavailable / not-found states share one layout with the support line (real error branch). */
function CheckoutError({ type, message, orderParam }) {
  const title = type === 'unavailable' ? 'Thanh toán tạm thời không khả dụng' : type === 'create' ? 'Lỗi tạo đơn hàng' : 'Không tìm thấy đơn hàng';
  return (
    <div className="page page-narrow"><div className="card">
      <Empty icon="receipt" title={title}
        body={<span className="stack-2" style={{ display: 'grid' }}>
          <span>{message || 'Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn.'}</span>
          {orderParam && <span className="xsmall">Mã đơn: <span className="mono strong">{orderParam}</span></span>}
          <span className="xsmall muted">Cần hỗ trợ? Email <Mail />{orderParam ? ` kèm mã giao dịch ${orderParam}` : ''}.</span>
        </span>}
        actions={<><Link className="btn btn-primary" to="/cart">Về giỏ hàng</Link><Link className="btn btn-secondary" to="/courses">Xem khoá học</Link></>} />
    </div></div>
  );
}

/** Entry without an order: create one from the cart, or resume the pending order (409 PENDING_ORDER_EXISTS). */
function CreatingOrder() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const cart = await api.get('/api/student/cart');
        // Nothing to buy: resume the pending order if there is one, otherwise say so without a failing request.
        if (!cart.count) {
          if (cart.pendingOrder) navigate('/checkout?order=' + encodeURIComponent(cart.pendingOrder.code), { replace: true });
          else setErr({ type: 'create', message: 'Giỏ hàng của bạn đang trống' });
          return;
        }
        const r = await checkoutCart({ total: cart.total });
        navigate((r.totalAmount === 0 ? '/checkout/success?order=' : '/checkout?order=') + encodeURIComponent(r.orderCode), { replace: true });
      } catch (e) {
        if (e.body && e.body.code === 'PENDING_ORDER_EXISTS') {
          const cart = await api.get('/api/student/cart').catch(() => null);
          if (cart && cart.pendingOrder) { navigate('/checkout?order=' + cart.pendingOrder.code, { replace: true }); return; }
        }
        setErr({ type: e.status === 503 ? 'unavailable' : 'create', message: e.message });
      }
    })();
  }, [navigate]);
  if (err) return <CheckoutError {...err} />;
  return <CheckoutSkeleton label="Đang tạo đơn hàng…" />;
}

function CheckoutSkeleton({ label }) {
  return (
    <div className="page page-narrow stack-4" aria-busy="true">
      <div className="skeleton skeleton-line" style={{ width: '40%', height: 28 }} />
      <div className="skeleton" style={{ height: 220 }} />
      <p className="sr-only" role="status">{label}</p>
    </div>
  );
}

async function cancelCheckout(order) {
  const r = await Codi.ui.confirm({
    title: 'Huỷ giao dịch này?',
    consequence: `Đơn ${order.code} sẽ bị huỷ và mã thanh toán không dùng được nữa. Các khoá học quay lại giỏ hàng. Nếu bạn đã chuyển khoản, đừng huỷ — hãy chờ hoặc liên hệ ${SUPPORT_EMAIL}.`,
    reversible: 'Bạn có thể tạo đơn mới từ giỏ hàng bất cứ lúc nào.', confirmLabel: 'Huỷ giao dịch', cancelLabel: 'Giữ đơn hàng', danger: true,
  });
  if (!r.ok) return;
  try {
    await api.post('/api/orders/cancel', { orderCode: order.code });
  } catch (e) {
    Codi.ui.toast(e.message || 'Đơn hàng không tồn tại, đã hoàn tất thanh toán hoặc đã được huỷ trước đó.', { type: 'danger' });
    return;
  }
  cartChanged();
  Codi.ui.toast('Đã huỷ giao dịch. Khoá học đã quay lại giỏ hàng.', { type: 'success' });
  Codi.go('/cart');
}

/** Awaiting payment: QR + countdown, copy rows, tracker, live status line, manual check, cancel. */
function PendingCheckout({ order, bank, checkedAt, reload }) {
  const [, setTick] = useState(0);
  const [start] = useState(() => Date.now());
  const [qrFailed, setQrFailed] = useState(() => Codi.demoTools && Codi.state.scenario.paymentOutcome === 'qrfail');
  const [qrAttempt, setQrAttempt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [manualCheckedAt, setManualCheckedAt] = useState(null);

  // 1 s tick: countdown, cooldown and the slow notice. With demo tools the simulated transfer "arrives" after 6 s.
  useEffect(() => {
    const t = setInterval(() => { setTick((n) => n + 1); setCooldown((c) => (c > 0 ? c - 1 : 0)); }, 1000);
    const sim = Codi.demoTools ? setTimeout(() => runSimulation(order, reload), TRANSFER_AFTER_MS) : null;
    return () => { clearInterval(t); if (sim) clearTimeout(sim); };
  }, [order.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = timeLeft(order);
  useEffect(() => { if (left <= 0) reload(); }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const slow = Date.now() - start >= SLOW_NOTICE_MS;
  const due = amountDue(order);
  const underpaid = order.received > 0 && order.received < order.total;

  // "Tôi đã chuyển khoản" (D5): 30 s cooldown, one extra server check, result shown inline; auto-check keeps running.
  const iPaid = async () => {
    if (cooldown > 0 || checking) return;
    setCooldown(30); setChecking(true);
    try {
      const r = await api.post(`${orderUrl(order.code)}/manual-check`, {});
      setManualCheckedAt(r.checkedAt ? new Date(r.checkedAt).getTime() : Date.now());
      if (r.status !== 'pending') reload();
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
    } finally {
      setChecking(false);
    }
  };
  // A remount (new key) makes the browser request the image again after a failed load.
  const reloadQr = () => { setQrFailed(false); setQrAttempt((n) => n + 1); };
  const b = bank || {};
  const qrUrl = sepayQrUrl(bank, due, order.code);
  const showQr = !qrFailed && !!qrUrl;
  return (
    <div className="page stack-4">
      <div className="stack-1"><h1>Thanh toán khoá học</h1><p className="muted">Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo thông tin bên dưới.</p></div>
      <Stepper steps={['Đã tạo đơn', 'Đang chờ thanh toán', 'Đã nhận tiền']} current={1} />
      {underpaid && (
        <Alert type="warn" title={`Đã nhận ${fmt.vnd(order.received)} / cần ${fmt.vnd(order.total)}`}>
          Hãy chuyển thêm <strong>{fmt.vnd(due)}</strong> với cùng nội dung <span className="mono strong">{order.code}</span>. Cần hỗ trợ? Email <Mail /> kèm mã giao dịch.
        </Alert>
      )}
      <div className="layout-aside">
        <div className="stack-4">
          <div className="card"><div className="card-body stack-4">
            <div className="row-between">
              <h2 className="h-card">{showQr ? 'Quét mã thanh toán' : 'Chuyển khoản thủ công'}</h2>
              <span className="badge badge-warn od-nowrap"><Icon name="clock" />Hết hạn sau <span data-countdown aria-live="off">{mmss(left)}</span></span>
            </div>
            <p className="xsmall muted">Sau thời gian này mã QR và nội dung chuyển khoản sẽ không còn hiệu lực.</p>
            {showQr ? (
              <div className="cm-qr-wrap">
                <img key={qrAttempt} className="cm-qr" src={qrUrl} width="200" height="200" alt={`Mã VietQR chuyển ${fmt.vnd(due)} tới tài khoản ${b.accountNumber}, nội dung ${order.code}`} onError={() => setQrFailed(true)} />
                <span className="xsmall muted">VietQR · {b.bank}</span>
              </div>
            ) : (
              <Alert type="danger" title="Không tải được mã QR"
                actions={qrUrl ? <button type="button" className="btn btn-secondary btn-sm" onClick={reloadQr}><Icon name="refresh" className="icon-sm" /> Tải lại mã QR</button> : null}>
                Hãy chuyển khoản thủ công bằng thông tin bên dưới, nội dung <span className="mono strong">{order.code}</span>. Cần hỗ trợ? Email <Mail />.
              </Alert>
            )}
            <div>
              <CopyRow label="Ngân hàng" value={b.bank} copyValue={b.bank} />
              <CopyRow label="Số tài khoản" value={b.accountNumber} copyValue={b.accountNumber} />
              <CopyRow label="Chủ tài khoản" value={b.accountName} copyValue={b.accountName} />
              <CopyRow label="Số tiền" value={fmt.vnd(due)} copyValue={String(due)} />
              <CopyRow label="Nội dung chuyển khoản" value={order.code} copyValue={order.code} emphasis />
            </div>
            <Alert type="warn" title="Nhập chính xác nội dung chuyển khoản">
              Nội dung phải là <strong className="mono">{order.code}</strong>. Sai nội dung thì hệ thống không tự xác nhận được.
            </Alert>
          </div></div>
        </div>
        <aside className="stack-4">
          <OrderSummary order={order} />
          <div className="card"><div className="card-body stack-3">
            <p className="small muted cm-poll" role="status"><Icon name="loader" className="icon-sm cm-spin" /> <span>Đang kiểm tra thanh toán… <span className="xsmall" style={{ color: 'var(--fg)' }}>(lần gần nhất {clock(checkedAt)})</span></span></p>
            <p className="xsmall muted">Thường mất vài giây đến vài phút sau khi bạn chuyển. Bạn có thể rời trang — đơn hàng vẫn được lưu trong Giỏ hàng và Hồ sơ › Giao dịch.</p>
            <button type="button" className="btn btn-secondary btn-block" onClick={iPaid} disabled={checking || cooldown > 0} aria-busy={checking ? 'true' : undefined}>
              {checking && <Icon name="loader" className="icon-sm cm-spin" />}
              {cooldown > 0 ? `Tôi đã chuyển khoản (${cooldown}s)` : 'Tôi đã chuyển khoản'}
            </button>
            {manualCheckedAt && !checking && (
              <Alert type="info" title={`Đã kiểm tra lúc ${clock(manualCheckedAt)}: Codi chưa nhận được tiền`}>
                <ol className="stack-1 xsmall cm-steps-list">
                  <li>Một số ngân hàng xử lý chậm — Codi vẫn tự kiểm tra tới khi mã hết hạn.</li>
                  <li>Sau đó kế toán đối soát thủ công theo nội dung <span className="mono strong">{order.code}</span>, thường trong 2 giờ làm việc.</li>
                  <li>Khi xác nhận xong, khoá học mở ngay và bạn nhận được thông báo. Cần hỗ trợ: <Mail />.</li>
                </ol>
              </Alert>
            )}
            {(slow || !showQr) &&<p className="xsmall muted">Cần hỗ trợ? Email <Mail /> kèm mã giao dịch <span className="mono strong">{order.code}</span>.</p>}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => cancelCheckout(order)}>Hủy giao dịch</button>
          </div></div>
        </aside>
      </div>
    </div>
  );
}

function FailedCheckout({ order, summary }) {
  const [busy, setBusy] = useState(false);
  const newCode = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post(`${orderUrl(order.code)}/new-code`, {});
      Codi.ui.toast(`Đã tạo mã thanh toán mới ${r.orderCode}.`, { type: 'success' });
      Codi.go('/checkout?order=' + encodeURIComponent(r.orderCode));
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
      setBusy(false);
    }
  };
  return (
    <div className="page page-narrow stack-4"><h1>Thanh toán khoá học</h1>
      <Alert type="danger" title={order.failReason === 'expired' ? 'Mã thanh toán đã hết hạn' : 'Thanh toán không thành công'}
        actions={<>
          <button type="button" className="btn btn-primary btn-sm" onClick={newCode} disabled={busy} aria-busy={busy ? 'true' : undefined}><Icon name={busy ? 'loader' : 'refresh'} className={`icon-sm ${busy ? 'cm-spin' : ''}`} /> Tạo mã mới</button>
          <Link className="btn btn-secondary btn-sm" to="/cart">Về giỏ hàng</Link>
        </>}>
        <span className="stack-2" style={{ display: 'grid' }}>
          <span>Nếu bạn đã chuyển khoản sau thời điểm hết hạn, Codi sẽ đối soát thủ công và liên hệ qua email. Bạn có thể tạo mã mới để thanh toán lại.</span>
          <span className="xsmall">Cần hỗ trợ? Email <Mail /> kèm mã giao dịch <span className="mono strong">{order.code}</span>.</span>
        </span>
      </Alert>
      {summary}
    </div>
  );
}

export function CheckoutPage({ query: q }) {
  useCodi();
  const navigate = useNavigate();
  const res = useApi(q.order ? orderUrl(q.order) : null);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const order = res.data ? toOrder(res.data.order) : null;
  const status = order ? order.status : null;

  // Auto-check every 3 s while the order waits for money; a paid order goes to the success page.
  useEffect(() => {
    if (status !== 'pending') return undefined;
    const t = setInterval(() => { setCheckedAt(Date.now()); res.reload(); }, POLL_MS);
    return () => clearInterval(t);
  }, [status, res.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasPending = useRef(false);
  useEffect(() => {
    if (status === 'pending') wasPending.current = true;
    if (status === 'paid' && wasPending.current && order) {
      cartChanged();
      navigate('/checkout/success?order=' + encodeURIComponent(order.code), { replace: true });
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!q.order) return <CreatingOrder />;
  if (!order) {
    if (!res.error) return <CheckoutSkeleton label="Đang tải thông tin thanh toán…" />;
    if (res.error.status === 404 || res.error.status === 400) return <CheckoutError type="notfound" orderParam={q.order} />;
    if (res.error.status === 503) return <CheckoutError type="unavailable" message={res.error.message} orderParam={q.order} />;
    return (
      <div className="page page-narrow"><div className="card">
        <Empty icon="alert-circle" title="Không tải được đơn hàng" body={<span role="alert">{res.error.message}</span>}
          actions={<button type="button" className="btn btn-primary" onClick={() => res.reload()}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
      </div></div>
    );
  }
  const summary = <OrderSummary order={order} />;
  if (order.status === 'paid') {
    return (
      <div className="page page-narrow stack-4"><h1>Thanh toán khoá học</h1>
        <Alert type="success" title="Đơn hàng đã được thanh toán" body={`Codi đã nhận đủ tiền lúc ${fmt.datetime(order.paidAt)}.`}
          actions={<Link className="btn btn-primary btn-sm" to={`/checkout/success?order=${order.code}`}>Xem kết quả và bắt đầu học</Link>} />
        {summary}
      </div>
    );
  }
  if (order.status === 'cancelled') {
    return (
      <div className="page page-narrow stack-4"><h1>Thanh toán khoá học</h1>
        <Alert type="info" title="Đơn hàng đã huỷ" actions={<Link className="btn btn-primary btn-sm" to="/cart">Về giỏ hàng</Link>}>
          <span className="stack-1" style={{ display: 'grid' }}>
            <span>Các khoá học đã được đưa lại vào giỏ hàng của bạn.</span>
            <span className="xsmall">Mã giao dịch: <span className="mono strong">{order.code}</span> · Cần hỗ trợ? Email <Mail />.</span>
          </span>
        </Alert>
        {summary}
      </div>
    );
  }
  if (order.status === 'refunded') {
    return <div className="page page-narrow stack-4"><h1>Thanh toán khoá học</h1><Alert type="info" title={orderStatusLabel(order.status)} />{summary}</div>;
  }
  if (order.status === 'failed') return <FailedCheckout order={order} summary={summary} />;
  return <PendingCheckout key={order.code} order={order} bank={res.data.bank} checkedAt={checkedAt} reload={res.reload} />;
}

/** S07 Payment success — primary "Bắt đầu học" → onboarding; no forced redirect (G3). */
export function CheckoutSuccessPage({ query: q }) {
  useCodi();
  const res = useApi(q.order ? orderUrl(q.order) : null);
  useEffect(() => { if (res.data) cartChanged(); }, [res.data]);
  const order = res.data ? toOrder(res.data.order) : null;
  if (q.order && !order && !res.error) return <CheckoutSkeleton label="Đang tải kết quả thanh toán…" />;
  if (res.error && res.error.status !== 404 && res.error.status !== 400) {
    return (
      <div className="page page-narrow"><div className="card">
        <Empty icon="alert-circle" title="Không tải được đơn hàng" body={<span role="alert">{res.error.message}</span>}
          actions={<button type="button" className="btn btn-primary" onClick={() => res.reload()}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
      </div></div>
    );
  }
  const courses = order ? order.items.map((i) => ({ id: i.courseId, slug: i.slug, title: i.title })) : [];
  if (!order || order.status !== 'paid' || !courses.length) {
    return (
      <div className="page page-narrow"><div className="card">
        <Empty icon="receipt" title="Chưa có xác nhận thanh toán cho đơn này" body="Đơn hàng chưa hoàn tất thanh toán hoặc không tồn tại."
          actions={<Link className="btn btn-primary" to="/profile?tab=transactions">Xem giao dịch</Link>} />
      </div></div>
    );
  }
  return (
    <div className="page page-narrow stack-6">
      <div className="stack-2" style={{ textAlign: 'center' }}>
        <span className="cm-success-icon"><Icon name="check" /></span>
        <h1>Thanh toán thành công!</h1>
        <p className="muted">Đơn <span className="mono strong">{order.code}</span> · {fmt.vnd(order.total)} · {fmt.datetime(order.paidAt)}</p>
      </div>
      <div className="card"><div className="card-body stack-3"><h2 className="h-card">Bạn đã sở hữu khoá học</h2>
        <ul className="list">{courses.map((c) => (
          <li key={c.id} className="list-row" style={{ paddingInline: 0 }}>
            <Thumb course={c} small />
            <span className="list-main"><strong>{c.title}</strong><span className="small muted">Khoá học tại Codi</span></span>
            {courses.length > 1 && <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}/onboarding`}>Bắt đầu</Link>}
          </li>
        ))}</ul>
      </div></div>
      <div className="stack-2">
        <Link className="btn btn-primary btn-lg btn-block" to={`/learn/${courses[0].id}/onboarding`}>Bắt đầu học</Link>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-ghost" to="/dashboard">Về trang chủ</Link>
          <Link className="btn btn-ghost" to="/profile?tab=transactions">Xem biên lai trong Giao dịch</Link>
        </div>
      </div>
    </div>
  );
}
