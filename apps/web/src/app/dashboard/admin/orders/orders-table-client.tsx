"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Search,
  AlertTriangle,
  Clock,
  Filter,
  X,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import type { AdminOrderSummaryItem, AdminOrderDetail } from "@/lib/admin-orders-service";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { OrderExportModal } from "./order-export-modal";
import { getAdminOrderDetailAction } from "../actions";

export function OrdersTableClient({
  orders,
  stats,
  initialFilter,
}: {
  orders: AdminOrderSummaryItem[];
  stats: {
    total: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    reconciliationCount: number;
    totalRevenue: number;
  };
  initialFilter: {
    range: string;
    status: string;
    q: string;
    overdue: boolean;
    reconciliation: boolean;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search input
  const [searchTerm, setSearchTerm] = useState(initialFilter.q);

  // Drawer detail state
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

  // Update URL filter
  const updateFilter = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === "" || (key === "range" && val === "30") || (key === "status" && val === "all")) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    router.push(`/dashboard/admin/orders?${params.toString()}` as any);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter({ q: searchTerm.trim() || null });
  };

  const handleRowClick = async (o: AdminOrderSummaryItem) => {
    try {
      setLoadingDetail(true);
      const detail = await getAdminOrderDetailAction(o.id);
      if (detail) {
        setSelectedOrder(detail);
        setDrawerOpen(true);
      }
    } catch {
      // fallback to basic
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <>
      {/* 4 Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <span className="text-2xl font-bold tracking-tight text-foreground">{stats.total}</span>
          <span className="block text-xs font-medium text-muted-foreground">Đơn trong bộ lọc</span>
        </div>
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <span className="text-2xl font-bold tracking-tight text-success">{stats.paidCount}</span>
          <span className="block text-xs font-medium text-muted-foreground">Đã thanh toán</span>
        </div>
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-warning">{stats.pendingCount}</span>
            {stats.overdueCount > 0 && (
              <span className="text-xs text-destructive font-medium flex items-center gap-0.5">
                <Clock className="size-3" /> {stats.overdueCount} quá hạn
              </span>
            )}
          </div>
          <span className="block text-xs font-medium text-muted-foreground">Chờ thanh toán</span>
        </div>
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <span className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap">
            {formatVnd(stats.totalRevenue)}
          </span>
          <span className="block text-xs font-medium text-muted-foreground">Doanh thu</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-border p-4 bg-card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Time range segmented */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Thời gian</span>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border p-1 bg-muted/40 text-xs">
              {(
                [
                  ["7", "7 ngày"],
                  ["30", "30 ngày"],
                  ["90", "90 ngày"],
                  ["all", "Tất cả"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateFilter({ range: val })}
                  className={`py-1.5 rounded-md font-medium transition-colors ${
                    initialFilter.range === val
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Status select */}
          <div className="space-y-1.5">
            <label htmlFor="order-status-select" className="text-xs font-medium text-muted-foreground">
              Trạng thái
            </label>
            <select
              id="order-status-select"
              value={initialFilter.status}
              onChange={(e) => updateFilter({ status: e.target.value })}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chờ thanh toán</option>
              <option value="paid">Đã thanh toán</option>
              <option value="failed">Thất bại</option>
              <option value="cancelled">Đã huỷ</option>
              <option value="refunded">Hoàn tiền</option>
            </select>
          </div>

          {/* Payment Method (Disabled as VietQR is sole method) */}
          <div className="space-y-1.5">
            <label htmlFor="order-method-select" className="text-xs font-medium text-muted-foreground">
              Phương thức
            </label>
            <select
              id="order-method-select"
              disabled
              className="w-full h-9 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground cursor-not-allowed"
            >
              <option>Chuyển khoản VietQR</option>
            </select>
          </div>

          {/* Search box */}
          <form onSubmit={handleSearchSubmit} className="space-y-1.5">
            <label htmlFor="order-search-input" className="text-xs font-medium text-muted-foreground">
              Mã đơn hoặc email
            </label>
            <div className="flex gap-2">
              <Input
                id="order-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã hoặc người mua..."
                className="h-9 text-sm"
              />
              <Button type="submit" variant="secondary" size="sm" className="h-9 px-3 cursor-pointer">
                <Search className="size-4" />
                <span className="sr-only">Tìm</span>
              </Button>
            </div>
          </form>
        </div>

        {/* Quick Toggles: Overdue & Reconciliation */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button
            variant={initialFilter.reconciliation ? "default" : "outline"}
            size="sm"
            onClick={() =>
              updateFilter({ reconciliation: initialFilter.reconciliation ? null : "1" })
            }
            className="h-7 text-xs gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="size-3.5" />
            Cần đối soát ({stats.reconciliationCount})
          </Button>

          <Button
            variant={initialFilter.overdue ? "default" : "outline"}
            size="sm"
            onClick={() => updateFilter({ overdue: initialFilter.overdue ? null : "1" })}
            className="h-7 text-xs gap-1.5 cursor-pointer"
          >
            <Clock className="size-3.5" />
            Quá 24 giờ ({stats.overdueCount})
          </Button>

          {(initialFilter.status !== "all" ||
            initialFilter.range !== "30" ||
            initialFilter.q ||
            initialFilter.overdue ||
            initialFilter.reconciliation) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                router.push("/dashboard/admin/orders" as any);
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
            >
              <X className="size-3" /> Xoá bộ lọc
            </Button>
          )}

          <div className="ml-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportModalOpen(true)}
              className="h-8 text-xs cursor-pointer gap-1.5"
            >
              <Download className="size-3.5" /> Xuất CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Mã giao dịch</th>
              <th className="px-4 py-3 font-medium">Người mua</th>
              <th className="px-4 py-3 font-medium">Khoá học</th>
              <th className="px-4 py-3 font-medium">Ngày tạo</th>
              <th className="px-4 py-3 font-medium text-right">Số tiền</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground space-y-2">
                  <Receipt className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="font-medium text-foreground">Không có đơn hàng phù hợp</p>
                  <p className="text-xs text-muted-foreground">
                    Thử mở rộng khoảng thời gian hoặc bỏ bớt các điều kiện lọc.
                  </p>
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => handleRowClick(o)}
                  className="hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{o.code}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{o.buyerName}</p>
                      <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[260px] truncate text-muted-foreground" title={o.coursesText}>
                    {o.coursesText}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatVnd(o.totalAmount)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge kind="order" status={o.status} />
                      {o.isOverdue && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-destructive-soft text-destructive">
                          Quá hạn
                        </span>
                      )}
                      {o.needsReconciliation && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                          Đối soát
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer Detail */}
      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      {/* Export CSV Modal */}
      <OrderExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        orders={orders}
        initialRange={initialFilter.range}
        currentStatus={initialFilter.status}
        currentFilter={{
          status: initialFilter.status,
          q: searchTerm.trim(),
          overdue: initialFilter.overdue,
          reconciliation: initialFilter.reconciliation,
        }}
      />
    </>
  );
}
