"use client";

import { useState } from "react";
import { Plus, Ticket, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@codi-1/ui/components/button";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import type { AdminVoucherItem } from "@/lib/admin-vouchers-service";
import { VoucherSheetForm } from "./voucher-sheet-form";
import { toggleVoucherActiveAction } from "../actions";

export function VouchersTableClient({ vouchers }: { vouchers: AdminVoucherItem[] }) {
  const router = useRouter();

  // Create / Edit Sheet State
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<AdminVoucherItem | null>(null);

  // Toggle Confirm State (only when deactivating)
  const [deactivatingVoucher, setDeactivatingVoucher] = useState<AdminVoucherItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

  const handleOpenCreate = () => {
    setSelectedVoucher(null);
    setSheetOpen(true);
  };

  const handleOpenEdit = (v: AdminVoucherItem) => {
    setSelectedVoucher(v);
    setSheetOpen(true);
  };

  const handleSwitchChange = async (v: AdminVoucherItem, checked: boolean) => {
    if (!checked) {
      // Deactivating requires confirmation
      setDeactivatingVoucher(v);
    } else {
      // Activating is direct
      try {
        setTogglingId(v.id);
        await toggleVoucherActiveAction(v.id, true);
        toast.success(`Đã bật mã ${v.code}.`);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Không thể bật mã.");
      } finally {
        setTogglingId(null);
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {vouchers.length} mã giảm giá trong hệ thống
        </p>
        <Button onClick={handleOpenCreate} size="sm" className="gap-1.5 cursor-pointer">
          <Plus className="size-4" /> Tạo voucher
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">Giảm</th>
              <th className="px-4 py-3 font-medium">Đơn tối thiểu</th>
              <th className="px-4 py-3 font-medium">Đã dùng</th>
              <th className="px-4 py-3 font-medium">Hạn dùng</th>
              <th className="px-4 py-3 font-medium">Hoạt động</th>
              <th className="px-4 py-3 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vouchers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground space-y-2">
                  <Ticket className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="font-medium text-foreground">Chưa có voucher</p>
                  <p className="text-xs text-muted-foreground">
                    Tạo mã giảm giá đầu tiên để áp dụng cho đơn hàng mới.
                  </p>
                  <div className="pt-2">
                    <Button onClick={handleOpenCreate} size="sm" className="gap-1.5 cursor-pointer">
                      <Plus className="size-4" /> Tạo voucher
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              vouchers.map((v) => {
                const percentUsed =
                  v.usageLimit !== null ? Math.min(100, Math.round((v.usedCount / v.usageLimit) * 100)) : 0;
                return (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">{v.code}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      {v.type === "percent" ? `${v.value}%` : formatVnd(v.value)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {v.minOrderAmount > 0 ? formatVnd(v.minOrderAmount) : "Không yêu cầu"}
                    </td>
                    <td className="px-4 py-3 min-w-[150px]">
                      {v.usageLimit === null ? (
                        <span className="text-xs text-muted-foreground">
                          {v.usedCount.toLocaleString("vi-VN")} / Không giới hạn
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                v.isLimitReached ? "bg-destructive" : "bg-primary"
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs ${
                              v.isLimitReached ? "text-destructive font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {v.usedCount.toLocaleString("vi-VN")}/{v.usageLimit.toLocaleString("vi-VN")}
                            {v.isLimitReached && " · hết lượt"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {v.expiresAt ? (
                        <span className={v.isExpired ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {new Date(v.expiresAt).toLocaleDateString("vi-VN")}
                          {v.isExpired && " · đã hết hạn"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Không hết hạn</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={v.isActive}
                          disabled={togglingId === v.id}
                          onChange={(e) => handleSwitchChange(v, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        <span className="text-xs text-muted-foreground">
                          {v.isActive ? "Đang bật" : "Đã tắt"}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(v)}
                        className="h-8 text-xs cursor-pointer"
                      >
                        Sửa
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Sheet create / edit */}
      <VoucherSheetForm
        voucher={selectedVoucher}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* Deactivate Confirm Dialog */}
      {deactivatingVoucher && (
        <ConfirmDialog
          open={!!deactivatingVoucher}
          onOpenChange={(open) => !open && setDeactivatingVoucher(null)}
          title={`Tắt mã ${deactivatingVoucher.code}?`}
          consequence="Mã ngừng áp dụng ngay cho đơn hàng mới. Đơn đã tạo trước đó giữ nguyên giảm giá."
          reversible="Có thể bật lại bất cứ lúc nào."
          danger={true}
          confirmLabel="Tắt mã"
          onConfirm={async () => {
            await toggleVoucherActiveAction(deactivatingVoucher.id, false);
            toast.success(`Đã tắt mã ${deactivatingVoucher.code}.`);
            setDeactivatingVoucher(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
