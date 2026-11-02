// Commerce seed additions (additive only; never removes or renames existing fields).
// - orders: lifecycle fields of the order contract — received (amount received), expiresAt (createdAt + 30 min,
//   the real paymentDeadline), failReason, cancelledAt, cancelReason, isBuyNow, replacesOrderId — and a `type` and
//   `by` on every timeline entry ({ at, type, by, label, note? }; `label` stays for existing readers).
//   `needsReconciliation` is left to the admin patch.
// - vouchers: startsAt and maxDiscount (real validateVoucher start date and percent cap), null when not set.
patchSeed((db) => {
  const TTL_MS = 30 * 60 * 1000;
  // Timeline labels written by data.js → event type, and whether the learner (vs. system / admin) acted.
  const LABEL_TYPE = [
    [/^Đã tạo đơn/, 'created', 'user'],
    [/^Đã nhận tiền/, 'paid', null],
    [/^Đã hoàn tiền/, 'refunded', 'admin'],
    [/^Thanh toán thất bại/, 'failed', null],
    [/^Mã thanh toán hết hạn/, 'expired', null],
    [/^Người mua đã huỷ/, 'cancelled', 'user'],
  ];
  const admin = (db.users || []).find((u) => u.role === 'admin');

  (db.orders || []).forEach((o) => {
    const paidLike = o.status === 'paid' || o.status === 'refunded';
    if (o.received === undefined) o.received = paidLike ? o.total : 0;
    if (o.expiresAt === undefined) o.expiresAt = new Date(Date.parse(o.createdAt) + TTL_MS).toISOString();
    if (o.isBuyNow === undefined) o.isBuyNow = false;
    if (o.replacesOrderId === undefined) o.replacesOrderId = null;
    const tl = Array.isArray(o.timeline) ? o.timeline : (o.timeline = []);
    tl.forEach((e) => {
      if (e.type !== undefined) return;
      const hit = LABEL_TYPE.find(([re]) => re.test(e.label || ''));
      e.type = hit ? hit[1] : 'note';
      e.by = hit && hit[2] === 'user' ? o.userId : hit && hit[2] === 'admin' && admin ? admin.id : null;
    });
    if (o.failReason === undefined) {
      const failed = tl.find((e) => e.type === 'failed' || e.type === 'expired');
      o.failReason = o.status !== 'failed' ? null
        : failed && failed.type === 'expired' ? 'expired'
        : 'Sai nội dung chuyển khoản';
    }
    if (o.cancelledAt === undefined) {
      const c = o.status === 'cancelled' ? tl.find((e) => e.type === 'cancelled') : null;
      o.cancelledAt = o.status === 'cancelled' ? (c ? c.at : o.createdAt) : null;
    }
    if (o.cancelReason === undefined) o.cancelReason = o.status === 'cancelled' ? 'Người mua đã huỷ' : null;
  });

  (db.vouchers || []).forEach((v) => {
    if (v.startsAt === undefined) v.startsAt = null;
    if (v.maxDiscount === undefined) v.maxDiscount = null;
  });
});
