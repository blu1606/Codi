/**
 * Ownership-aware course CTAs (real components/courses/catalog-course-card.tsx, STATE-MACHINES §2 CTA mapping).
 * `own` is the ownership state from useOwnership(); gated actions run through Codi.requireAuth so they complete
 * after sign-in, and write to the backend (commerce-api.js).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { addToCart, enrollFree } from './commerce-api';

export { buyNow, enrollFree } from './commerce-api';

/** "Thêm vào giỏ": shows "Đang thêm…" while the backend adds it, then toasts "Xem giỏ hàng". */
export function AddToCartButton({ course, className, label = true }) {
  const [busy, setBusy] = useState(false);
  const onClick = () => {
    Codi.requireAuth(async () => {
      setBusy(true);
      try { await addToCart(course); } finally { setBusy(false); }
    }, { reason: 'Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động.', courseTitle: course.title });
  };
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy} aria-busy={busy ? 'true' : undefined}
      aria-label={label ? `Thêm vào giỏ: ${course.title}` : undefined}>
      <Icon name="cart" />{busy ? ' Đang thêm…' : ' Thêm vào giỏ'}
    </button>
  );
}

/**
 * Card CTA (real catalog-course-card ownership branches). `quiet` renders every branch as a secondary button, for
 * lists where many cards sit side by side and the card itself is the main target.
 */
export function CourseCta({ course: c, own, pendingOrderId, block, quiet }) {
  const b = block ? ' btn-block' : '';
  const main = quiet ? 'btn btn-secondary' : 'btn btn-primary';
  const role = Codi.role();
  if (!own) return <span className={'skeleton' + b} style={{ display: 'inline-block', minWidth: 132, height: 36 }} aria-hidden="true" />;
  if (own === 'owned') return <Link className={main + b} to={`/learn/${c.id}`} aria-label={quiet ? `Tiếp tục học: ${c.title}` : undefined}>Tiếp tục học</Link>;
  if (role === 'lecturer' || role === 'admin') return <Link className={'btn btn-secondary' + b} to={`/courses/${c.slug}`}>Xem chi tiết</Link>;
  if (own === 'pending-payment') {
    return <Link className={'btn btn-secondary' + b} to={pendingOrderId ? `/checkout?order=${pendingOrderId}` : '/cart'}><Icon name="clock" /> Chờ thanh toán</Link>;
  }
  if (own === 'in-cart') return <Link className={'btn btn-secondary' + b} to="/cart"><Icon name="check" /> {quiet ? 'Trong giỏ · Xem giỏ' : 'Đã trong giỏ hàng · Xem giỏ'}</Link>;
  if (c.price === 0) return <button type="button" className={main + b} onClick={() => enrollFree(c)} aria-label={`Đăng ký miễn phí: ${c.title}`}>Đăng ký miễn phí</button>;
  return <AddToCartButton course={c} className={main + b} />;
}
