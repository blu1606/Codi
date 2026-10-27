import { VouchersTableClient } from "@/app/dashboard/admin/vouchers/vouchers-table-client";
import type { AdminVoucherItem } from "@/lib/admin-vouchers-service";
import type { Screen } from "../screen-types";

const base: AdminVoucherItem = {
  id: 1, code: "CODI10", description: "Giảm 10% cho mọi đơn", type: "percent", value: 10,
  minOrderAmount: 0, maxDiscountAmount: 200000, usageLimit: 100, usedCount: 12,
  startsAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-12-31T16:59:59.000Z",
  isActive: true, createdAt: "2026-10-01T00:00:00.000Z", isExpired: false, isLimitReached: false,
};

const vouchers: AdminVoucherItem[] = [
  base,
  { ...base, id: 2, code: "TET2027", description: "Ưu đãi Tết", type: "amount", value: 150000, maxDiscountAmount: null, usageLimit: 50, usedCount: 47 },
  { ...base, id: 3, code: "SUMMER26", description: null, isExpired: true, expiresAt: "2026-08-31T16:59:59.000Z" },
  { ...base, id: 4, code: "OLDCODE", isActive: false, usedCount: 0 },
  { ...base, id: 5, code: "FULL", usageLimit: 20, usedCount: 20, isLimitReached: true },
];

export const adminVouchersScreen: Screen = {
  id: "S35",
  title: "Voucher",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/vouchers",
  states: {
    default: {
      label: "Danh sách",
      route: { pathname: "/dashboard/admin/vouchers" },
      render: () => <VouchersTableClient vouchers={vouchers} />,
    },
    empty: {
      label: "Trống",
      route: { pathname: "/dashboard/admin/vouchers" },
      render: () => <VouchersTableClient vouchers={[]} />,
    },
    "toggle-error": {
      label: "Lỗi khi bật/tắt mã",
      route: { pathname: "/dashboard/admin/vouchers" },
      actions: { toggleVoucherActiveAction: { error: "Không thể cập nhật voucher. Vui lòng thử lại." } },
      render: () => <VouchersTableClient vouchers={vouchers} />,
    },
  },
};
