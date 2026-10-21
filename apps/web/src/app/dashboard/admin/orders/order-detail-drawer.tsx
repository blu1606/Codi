"use client";

import { useState } from "react";
import { Copy, Check, Clock, AlertTriangle, XCircle, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Sheet } from "@codi-1/ui/components/sheet";
import { Button } from "@codi-1/ui/components/button";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import type { AdminOrderDetail } from "@/lib/admin-orders-service";
import { cancelAdminOrderAction } from "../actions";

export function OrderDetailDrawer({
  order,
  open,
  onOpenChange,
}: {
  order: AdminOrderDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  if (!order) return null;

  const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

  const handleCopy = () => {
    navigator.clipboard.writeText(order.content);
    setCopied(true);
    toast.success("Đã sao chép nội dung chuyển khoản.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Đơn ${order.code}`}
        description="Chi tiết đơn hàng và lịch sử giao dịch"
        footer={
          order.status === "pending" ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCancelDialogOpen(true)}
                className="cursor-pointer gap-1.5"
              >
                <XCircle className="size-4" /> Huỷ đơn hàng
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="cursor-pointer">
                Đóng
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="cursor-pointer">
                Đóng
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-6">
          {/* Status header */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge kind="order" status={order.status} />
            {order.isOverdue && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive-soft text-destructive">
                <Clock className="size-3" /> Quá hạn (&gt;24h)
              </span>
            )}
            {order.needsReconciliation && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-soft text-warning">
                <AlertTriangle className="size-3" /> Cần đối soát
              </span>
            )}
          </div>

          {order.needsReconciliation && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning space-y-1">
              <span className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" /> Lưu ý đối soát ngân hàng (D2/D3)
              </span>
              <p>
                Đơn hàng này được gắn cờ đối soát thủ công (có thể do chuyển khoản thừa tiền, thiếu tiền khi hết hạn, hoặc chuyển khoản muộn sau khi đã sở hữu khoá học). Vui lòng kiểm tra sao kê ngân hàng VietQR trước khi xử lý hoàn tiền ngoài hệ thống.
              </p>
            </div>
          )}

          {/* Buyer details */}
          <div className="space-y-1 rounded-lg border border-border p-3 bg-muted/20">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Người mua
            </span>
            <p className="text-sm font-semibold text-foreground">{order.buyerName}</p>
            <p className="text-xs text-muted-foreground">{order.buyerEmail}</p>
          </div>

          {/* Items & Amount breakdown */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Khoá học đã đặt ({order.items.length})
            </span>
            <ul className="divide-y divide-border border rounded-lg overflow-hidden">
              {order.items.map((item) => (
                <li key={item.id} className="p-3 flex items-center justify-between text-sm bg-card">
                  <span className="font-medium line-clamp-1 mr-2">{item.courseTitle}</span>
                  <span className="whitespace-nowrap text-muted-foreground">{formatVnd(item.unitPrice)}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-1.5 pt-2 text-sm">
              {order.voucherCode && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Voucher {order.voucherCode}</span>
                  <span className="text-success font-medium">−{formatVnd(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-border pt-2">
                <span>Tổng tiền</span>
                <span className="text-foreground">{formatVnd(order.totalAmount)}</span>
              </div>
              {order.receivedAmount > 0 && order.status === "pending" && (
                <div className="flex justify-between text-xs text-warning font-medium">
                  <span>Đã nhận thực tế</span>
                  <span>{formatVnd(order.receivedAmount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Transfer note & copy */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nội dung chuyển khoản (VietQR)
            </span>
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <span className="font-mono font-bold text-primary tracking-wider">{order.content}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5 h-8 text-xs cursor-pointer border-primary/20"
              >
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                {copied ? "Đã chép" : "Sao chép"}
              </Button>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Phương thức
            </span>
            <p className="text-sm font-medium">{order.method}</p>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lịch sử trạng thái
            </span>
            {order.timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có sự kiện nào.</p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4 py-1">
                {order.timeline.map((event) => (
                  <li key={event.id} className="ml-4 space-y-0.5">
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background bg-primary" />
                    <p className="text-sm font-medium text-foreground">{event.label}</p>
                    <time className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString("vi-VN")}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Sheet>

      {/* Cancel Order Confirm Dialog */}
      {cancelDialogOpen && (
        <ConfirmDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          title={`Huỷ đơn hàng ${order.code}?`}
          consequence="Đơn hàng sẽ chuyển sang trạng thái đã huỷ. Học viên sẽ nhận được thông báo huỷ đơn."
          reversible="Hành động này không thể hoàn tác."
          requireReason={true}
          danger={true}
          confirmLabel="Huỷ đơn hàng"
          onConfirm={async (reason) => {
            await cancelAdminOrderAction(order.id, reason);
            toast.success(`Đã huỷ đơn hàng ${order.code}.`);
            setCancelDialogOpen(false);
            onOpenChange(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
