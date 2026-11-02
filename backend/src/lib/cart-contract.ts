export interface CartCourse {
  id: string;
  title: string;
  slug: string;
  price: number;
  level: string;
  category: string;
  coverImageUrl: string | null;
  lecturerName: string;
}

export interface AppliedVoucher {
  code: string;
  type: "percent" | "amount";
  value: number;
  discount: number;
}

export interface PendingOrderBanner {
  id: number;
  code: string;
  itemCount: number;
  totalAmount: number;
  createdAt: string;
}

export interface CartSummaryData {
  items: CartCourse[];
  subtotal: number;
  discount: number;
  total: number;
  voucher: AppliedVoucher | null;
  voucherError?: string | null;
  removedOwnedTitles: string[];
  pendingOrder: PendingOrderBanner | null;
}

export type VoucherValidationResult =
  | { valid: true; voucher: AppliedVoucher }
  | { valid: false; error: string };

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}
