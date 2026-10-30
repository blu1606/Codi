// TODO(type): the checkout page keeps OrderDetails/BankDetails private (not exported),
// so these shapes mirror app/checkout/page.tsx and are typed structurally here.

export type DemoOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export interface DemoCheckoutOrder {
  id: number;
  code: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  receivedAmount: number;
  status: DemoOrderStatus;
  failReason: string | null;
  isBuyNow: boolean;
  paymentDeadline: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  voucherCode: string | null;
  items: { courseId: string; title: string; price: number; slug: string; thumbnail?: string | null }[];
}

export interface DemoBankDetails {
  bank: string;
  accountNumber: string;
  accountName: string;
}

const items = [
  { courseId: "c-react", title: "React từ cơ bản đến nâng cao", price: 1290000, slug: "react-co-ban-nang-cao", thumbnail: null },
  { courseId: "c-node", title: "Node.js & REST API thực chiến", price: 990000, slug: "nodejs-rest-api", thumbnail: null },
];

const bank: DemoBankDetails = { bank: "VCB", accountNumber: "0123456789", accountName: "CONG TY CODI" };

/** Order created minutes ago, still waiting for the bank transfer (S06 awaiting payment). */
export function pendingOrder(overrides: Partial<DemoCheckoutOrder> = {}): { order: DemoCheckoutOrder; bank: DemoBankDetails } {
  const now = Date.now();
  return {
    order: {
      id: 42,
      code: "CODI20261026-0042",
      subtotal: 2280000,
      discountAmount: 0,
      totalAmount: 2280000,
      receivedAmount: 0,
      status: "pending",
      failReason: null,
      isBuyNow: false,
      paymentDeadline: new Date(now + 14 * 60_000).toISOString(),
      createdAt: new Date(now - 60_000).toISOString(),
      paidAt: null,
      cancelledAt: null,
      voucherCode: null,
      items,
      ...overrides,
    },
    bank,
  };
}

/** Pending order that has received part of the amount (underpaid). */
export function underpaidOrder() {
  return pendingOrder({ receivedAmount: 1000000 });
}

/** Pending order whose deadline has already passed (triggers expiry on the first poll). */
export function expiredOrder() {
  return pendingOrder({ status: "failed", failReason: "expired", paymentDeadline: new Date(Date.now() - 60_000).toISOString() });
}

export function paidOrder() {
  return pendingOrder({ status: "paid", receivedAmount: 2280000, paidAt: new Date(Date.now() - 120_000).toISOString() });
}

export function cancelledOrder() {
  return pendingOrder({ status: "cancelled", cancelledAt: new Date(Date.now() - 120_000).toISOString() });
}

/** Body of GET /api/orders/:code for the success page; only paid orders are shown there. */
export function successOrder() {
  return { order: { id: 42, code: "CODI20261026-0042", totalAmount: 2280000, status: "paid" as const, paidAt: new Date(Date.now() - 120_000).toISOString(), items } };
}
