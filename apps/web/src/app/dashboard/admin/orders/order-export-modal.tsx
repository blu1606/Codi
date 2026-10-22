"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import { Button } from "@codi-1/ui/components/button";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import type { AdminOrderSummaryItem } from "@/lib/admin-orders-service";

const COLUMN_DEFS = [
  { id: "code", label: "Mã giao dịch" },
  { id: "buyer", label: "Người mua" },
  { id: "email", label: "Email" },
  { id: "courses", label: "Khoá học" },
  { id: "voucher", label: "Voucher" },
  { id: "discount", label: "Giảm giá" },
  { id: "total", label: "Tổng tiền" },
  { id: "status", label: "Trạng thái" },
  { id: "createdAt", label: "Ngày tạo" },
  { id: "paidAt", label: "Ngày thanh toán" },
] as const;

export function OrderExportModal({
  open,
  onOpenChange,
  orders: fallbackOrders,
  currentStatus,
  currentFilter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: AdminOrderSummaryItem[];
  currentStatus: string;
  currentFilter?: {
    status?: string;
    q?: string;
    overdue?: boolean;
    reconciliation?: boolean;
  };
}) {
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");
  const [applyFilter, setApplyFilter] = useState(true);
  const [exportData, setExportData] = useState<AdminOrderSummaryItem[] | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [columns, setColumns] = useState<Record<string, boolean>>({
    code: true,
    buyer: true,
    email: true,
    courses: true,
    voucher: true,
    discount: true,
    total: true,
    status: true,
    createdAt: true,
    paidAt: true,
  });

  // Query actual orders according to export range and filter preset
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingData(true);
    setLoadError(null);

    import("../actions").then(({ getAdminOrdersExportAction }) => {
      // Khi applyFilter = true: áp dụng đầy đủ bộ lọc hiện tại (status, q, overdue, reconciliation)
      // Khi applyFilter = false: mockup admin.js giữ nguyên query tìm kiếm/status hiện tại nhưng chỉ thay đổi range
      // Tuy nhiên theo mockup note, khi không chọn "Áp dụng bộ lọc hiện tại", người dùng muốn xuất toàn bộ trạng thái của kỳ đó
      const queryFilter = {
        range,
        status: applyFilter ? ((currentFilter?.status || currentStatus) as any) : "all",
        q: applyFilter ? (currentFilter?.q || "") : (currentFilter?.q || ""),
        overdueOnly: applyFilter ? !!currentFilter?.overdue : false,
        reconciliationOnly: applyFilter ? !!currentFilter?.reconciliation : false,
      };

      getAdminOrdersExportAction(queryFilter)
        .then((fetchedOrders) => {
          if (!cancelled) {
            setExportData(fetchedOrders);
            setLoadError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setExportData(null);
            setLoadError(err?.message || "Không thể tải dữ liệu xuất đơn hàng.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingData(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [open, range, applyFilter, currentStatus, currentFilter, reloadKey]);

  const filteredList = exportData ?? [];

  const selectedColCount = Object.values(columns).filter(Boolean).length;
  const totalRevenue = filteredList.reduce((sum, o) => sum + (o.status === "paid" ? o.totalAmount : 0), 0);

  const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

  const formatVnDateTime = (dateVal: string | Date | null | undefined) => {
    if (!dateVal) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(dateVal));
  };

  const handleExport = () => {
    if (loadingData) {
      toast.error("Dữ liệu đang được tải, vui lòng đợi trong giây lát.");
      return;
    }

    if (loadError || exportData === null) {
      toast.error("Không thể xuất dữ liệu do lỗi truy vấn. Vui lòng thử lại.");
      return;
    }

    if (selectedColCount === 0) {
      toast.error("Vui lòng chọn ít nhất một cột.");
      return;
    }

    const headerMap: Record<string, string> = {
      code: "Mã giao dịch",
      buyer: "Người mua",
      email: "Email",
      courses: "Khoá học",
      voucher: "Voucher",
      discount: "Giảm giá",
      total: "Tổng tiền",
      status: "Trạng thái",
      createdAt: "Ngày tạo",
      paidAt: "Ngày thanh toán",
    };

    const activeCols = COLUMN_DEFS.filter((c) => columns[c.id]).map((c) => c.id);

    const getStatusLabel = (s: string) => {
      switch (s) {
        case "pending":
          return "Chờ thanh toán";
        case "paid":
          return "Đã thanh toán";
        case "failed":
          return "Thất bại";
        case "cancelled":
          return "Đã huỷ";
        case "refunded":
          return "Hoàn tiền";
        default:
          return s;
      }
    };

    const esc = (v: any) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;

    const rows: string[][] = [
      activeCols.map((c) => headerMap[c] || c),
      ...filteredList.map((o) => {
        const rowData: Record<string, any> = {
          code: o.code,
          buyer: o.buyerName,
          email: o.buyerEmail,
          courses: o.coursesText,
          voucher: o.voucherCode || "",
          discount: o.discountAmount,
          total: o.totalAmount,
          status: getStatusLabel(o.status),
          createdAt: formatVnDateTime(o.createdAt),
          paidAt: formatVnDateTime(o.paidAt),
        };
        return activeCols.map((c) => rowData[c]);
      }),
    ];

    // UTF-8 BOM for Excel Vietnamese compatibility
    const csvContent = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `codi-don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    onOpenChange(false);
    toast.success(`Đã xuất ${filteredList.length} đơn hàng (${selectedColCount} cột) ra CSV.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xuất CSV</DialogTitle>
          <DialogDescription>
            Tải danh sách đơn hàng định dạng CSV (tương thích Microsoft Excel, UTF-8 BOM).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preset range */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Khoảng thời gian</span>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border p-1 bg-muted/30 text-xs">
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
                  onClick={() => setRange(val)}
                  className={`py-1.5 rounded-md font-medium transition-colors ${
                    range === val ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Múi giờ: GMT+7 (Hà Nội)</p>
          </div>

          {/* Apply current filter */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="exp-filter"
              checked={applyFilter}
              onCheckedChange={(checked) => setApplyFilter(!!checked)}
            />
            <label htmlFor="exp-filter" className="text-xs cursor-pointer select-none">
              Áp dụng bộ lọc hiện tại (trạng thái: {currentStatus === "all" ? "Tất cả" : currentStatus})
            </label>
          </div>

          {/* Column selector */}
          <div className="space-y-2 pt-1">
            <span className="text-sm font-medium">
              Chọn cột xuất ({selectedColCount}/{COLUMN_DEFS.length})
            </span>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 bg-card text-xs">
              {COLUMN_DEFS.map((col) => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.id}`}
                    checked={!!columns[col.id]}
                    onCheckedChange={(checked) =>
                      setColumns((prev) => ({ ...prev, [col.id]: !!checked }))
                    }
                  />
                  <label htmlFor={`col-${col.id}`} className="cursor-pointer select-none">
                    {col.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Live summary / loading / error */}
          {loadingData ? (
            <div className="rounded-lg bg-muted/50 p-2.5 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <span className="inline-block size-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Đang tải dữ liệu kỳ xuất ({range === "all" ? "Tất cả" : `${range} ngày`})...</span>
            </div>
          ) : loadError ? (
            <div className="rounded-lg bg-destructive-soft border border-destructive/20 p-2.5 text-center text-xs text-destructive flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="font-semibold underline hover:opacity-80 cursor-pointer shrink-0"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-2.5 text-center text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{filteredList.length}</span> đơn ·{" "}
              <span className="font-medium text-foreground">{selectedColCount}</span> cột ·{" "}
              <span className="font-medium text-foreground">{formatVnd(totalRevenue)}</span> tổng tiền
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Huỷ
          </Button>
          <Button
            onClick={handleExport}
            disabled={loadingData || !!loadError || exportData === null}
            className="cursor-pointer gap-1.5"
          >
            <Download className="size-4" /> Xuất CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
