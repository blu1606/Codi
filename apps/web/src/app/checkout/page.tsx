"use client";

import { use, useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Receipt,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Stepper } from "@codi-1/ui/components/stepper";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { authClient } from "@/lib/auth-client";

interface OrderItem {
  courseId: string;
  title: string;
  price: number;
  slug: string;
  thumbnail?: string | null;
}

interface OrderDetails {
  id: number;
  code: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  receivedAmount: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  failReason: string | null;
  isBuyNow: boolean;
  paymentDeadline: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  voucherCode: string | null;
  items: OrderItem[];
}

interface BankDetails {
  bank: string;
  accountNumber: string;
  accountName: string;
}

const STEPPER_STEPS = ["Đã tạo đơn", "Đang chờ thanh toán", "Đã nhận tiền"] as const;

function formatVnd(amount: number): string {
  return Number(amount || 0).toLocaleString("vi-VN") + " ₫";
}

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const router = useRouter();
  const resolvedSearchParams = use(searchParams);
  const orderParam = resolvedSearchParams.order?.trim();

  const { data: session, isPending: isSessionLoading } = authClient.useSession();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Time & countdown
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // QR state
  const [qrFailed, setQrFailed] = useState(false);

  // Manual check button (D5: 30s cooldown, inline result, no modal)
  const [manualCooldown, setManualCooldown] = useState(0);
  const [manualCheckedAt, setManualCheckedAt] = useState<string | null>(null);
  const [manualChecking, setManualChecking] = useState(false);

  // Polling info
  const [lastCheckedAt, setLastCheckedAt] = useState<string>("");

  // Slow notice (shown after 15s)
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const mountTimeRef = useRef<number>(Date.now());

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // New code loading
  const [isCreatingNewCode, setIsCreatingNewCode] = useState(false);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fetch order data
  const fetchOrderData = async (orderIdOrCode: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderIdOrCode)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setOrder(null);
          return;
        }
        throw new Error("Không thể tải thông tin đơn hàng.");
      }
      const data = await res.json();
      setOrder(data.order);
      setBank(data.bank);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Lỗi tải thông tin đơn hàng.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load or create from cart if no order query
  useEffect(() => {
    if (isSessionLoading) return;
    if (!session?.user) {
      const redirectUrl = orderParam ? `/checkout?order=${encodeURIComponent(orderParam)}` : "/checkout";
      router.push(`/login?next=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!orderParam) {
      // Entry without order: check pending or create from cart
      fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.orderCode) {
            router.replace(`/checkout?order=${encodeURIComponent(json.orderCode)}`);
            return;
          }

          // If there is an existing pending order conflict, resolve it directly
          if (res.status === 409 && json.code === "PENDING_ORDER_EXISTS") {
            const match = json.error?.match(/CODI\d{5}/i);
            if (match) {
              router.replace(`/checkout?order=${encodeURIComponent(match[0].toUpperCase())}`);
              return;
            }
          }

          // Otherwise render typed creation error / payments unavailable state with retry/support
          const errorMsg = json.error || "Không thể tạo đơn hàng. Vui lòng thử lại sau.";
          setError(errorMsg);
          setLoading(false);
        })
        .catch((err) => {
          setError(err?.message || "Lỗi kết nối khi tạo đơn hàng.");
          setLoading(false);
        });
      return;
    }

    mountTimeRef.current = Date.now();
    fetchOrderData(orderParam);
  }, [session?.user, isSessionLoading, orderParam, router]);

  // Polling & countdown effect while pending
  useEffect(() => {
    if (!order || order.status !== "pending") return;

    // Tick every 1 second
    const interval = setInterval(async () => {
      // Check countdown
      const deadline = new Date(order.paymentDeadline).getTime();
      const now = Date.now();
      const left = deadline - now;
      setTimeLeftMs(left);

      // Slow notice after 15s
      if (now - mountTimeRef.current >= 15000) {
        setShowSlowNotice(true);
      }

      // Check if expired: notify server via manual-check to persist expiry in DB
      if (left <= 0) {
        try {
          const expireRes = await fetch(`/api/orders/${encodeURIComponent(order.code)}/manual-check`, {
            method: "POST",
          });
          if (expireRes.ok) {
            const expireData = await expireRes.json();
            if (expireData.status) {
              setOrder((prev) =>
                prev
                  ? {
                      ...prev,
                      status: expireData.status,
                      failReason: expireData.failReason || "expired",
                      receivedAmount: typeof expireData.receivedAmount === "number" ? expireData.receivedAmount : prev.receivedAmount,
                    }
                  : null,
              );
              return;
            }
          }
        } catch {
          // Fallback if offline
        }
        setOrder((prev) => (prev ? { ...prev, status: "failed", failReason: "expired" } : null));
        return;
      }

      // Poll status every 3 seconds
      if (Math.floor(now / 1000) % 3 === 0) {
        try {
          const checkRes = await fetch(`/api/orders/${encodeURIComponent(order.code)}/manual-check`, {
            method: "POST",
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData && checkData.status) {
              setLastCheckedAt(new Date().toLocaleTimeString("vi-VN"));

              if (checkData.status === "paid") {
                router.push(`/checkout/success?order=${order.id}` as import("next").Route);
                return;
              }

              if (checkData.status !== order.status || checkData.receivedAmount !== order.receivedAmount) {
                setOrder((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: checkData.status,
                        failReason: checkData.failReason,
                        receivedAmount: typeof checkData.receivedAmount === "number" ? checkData.receivedAmount : prev.receivedAmount,
                      }
                    : null,
                );
              }
            }
          }
        } catch {
          // Ignore transient polling network errors, keep polling available
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order, router]);

  // Cooldown countdown for "Tôi đã chuyển khoản"
  useEffect(() => {
    if (manualCooldown <= 0) return;
    const timer = setInterval(() => {
      setManualCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [manualCooldown]);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    toast.success(`Đã sao chép ${value}`);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleManualCheck = async () => {
    if (manualCooldown > 0 || manualChecking || !order) return;
    setManualChecking(true);
    setManualCooldown(30);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.code)}/manual-check`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Không thể kiểm tra giao dịch vào lúc này. Vui lòng thử lại sau.");
        return;
      }

      const data = await res.json();
      if (!data || !data.status) {
        toast.error("Không nhận được phản hồi trạng thái hợp lệ.");
        return;
      }

      setManualCheckedAt(new Date().toLocaleTimeString("vi-VN"));
      setLastCheckedAt(new Date().toLocaleTimeString("vi-VN"));

      if (data.status === "paid") {
        router.push(`/checkout/success?order=${order.id}` as import("next").Route);
        return;
      }

      if (data.status !== order.status || data.receivedAmount !== order.receivedAmount) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                status: data.status,
                failReason: data.failReason,
                receivedAmount: typeof data.receivedAmount === "number" ? data.receivedAmount : prev.receivedAmount,
              }
            : null,
        );
      }
    } catch {
    } finally {
      setManualChecking(false);
    }
  };

  const handleCreateNewCode = async () => {
    if (!order || isCreatingNewCode) return;
    setIsCreatingNewCode(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/new-code`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tạo mã mới.");
      }
      toast.success(`Đã tạo mã thanh toán mới ${data.orderCode}.`);
      router.push(`/checkout?order=${encodeURIComponent(data.orderCode)}`);
    } catch (err: any) {
      toast.error(err?.message || "Không thể tạo mã mới.");
    } finally {
      setIsCreatingNewCode(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!order || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, orderCode: order.code }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Không thể huỷ đơn hàng.");
      }
      toast.success("Đã huỷ giao dịch. Khoá học đã quay lại giỏ hàng.");
      router.push("/cart");
    } catch (err: any) {
      toast.error(err?.message || "Lỗi huỷ giao dịch.");
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  if (isSessionLoading || loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse text-base">Đang tải thông tin thanh toán…</p>
      </div>
    );
  }

  if (error || !order || (order.status === "pending" && !bank)) {
    const isPaymentUnavailable = error?.includes("không khả dụng") || error?.includes("cấu hình");
    const isCreateError = error?.includes("tạo đơn");
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 space-y-4">
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>
              {isPaymentUnavailable
                ? "Thanh toán tạm thời không khả dụng"
                : isCreateError
                ? "Lỗi tạo đơn hàng"
                : "Không tìm thấy đơn hàng"}
            </EmptyTitle>
            <EmptyDescription className="space-y-2">
              <p>{error || "Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."}</p>
              {orderParam && (
                <p className="text-xs">
                  Mã đơn: <span className="font-mono font-semibold text-foreground">{orderParam}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cần hỗ trợ? Email{" "}
                <a href="mailto:hotro@codi.vn" className="underline font-medium text-foreground">
                  hotro@codi.vn
                </a>
                {orderParam ? ` kèm mã giao dịch ${orderParam}` : ""}.
              </p>
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex flex-wrap gap-2 justify-center">
            <Button render={<Link href="/cart" />} nativeButton={false}>
              Về giỏ hàng
            </Button>
            <Button variant="outline" render={<Link href="/courses" />} nativeButton={false}>
              Xem khoá học
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  // Order summary block
  const remainingAmount = order.receivedAmount ? Math.max(0, order.totalAmount - order.receivedAmount) : order.totalAmount;
  const isUnderpaid = order.receivedAmount > 0 && order.receivedAmount < order.totalAmount;

  const orderSummaryCard = (
    <Card className="border-border">
      <CardContent className="p-6 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Thông tin đơn hàng</h2>
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.courseId} className="flex items-center justify-between py-3">
              <div className="space-y-0.5 pr-4">
                <p className="font-medium text-sm leading-snug">{item.title}</p>
                <p className="text-xs text-muted-foreground">Khóa học</p>
              </div>
              <span className="shrink-0 font-semibold text-sm">{formatVnd(item.price)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Tạm tính</span>
            <span>{formatVnd(order.subtotal)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>Giảm giá {order.voucherCode ? `(${order.voucherCode})` : ""}</span>
              <span>−{formatVnd(order.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
            <span>Tổng thanh toán</span>
            <span className="text-primary">{formatVnd(order.totalAmount)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground pt-2">
          Mã giao dịch (để đối soát): <span className="font-mono font-semibold text-foreground">{order.code}</span>
        </p>
      </CardContent>
    </Card>
  );

  // Paid state
  if (order.status === "paid") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Thanh toán khóa học</h1>
        <Alert variant="success">
          <AlertTitle>Đơn hàng đã được thanh toán</AlertTitle>
          <AlertDescription>
            Codi đã nhận đủ tiền lúc {formatDatetime(order.paidAt)}.
          </AlertDescription>
          <div className="pt-3">
            <Button size="sm" render={<Link href={`/checkout/success?order=${order.id}` as import("next").Route} />} nativeButton={false}>
              Xem kết quả và bắt đầu học
            </Button>
          </div>
        </Alert>
        {orderSummaryCard}
      </div>
    );
  }

  // Cancelled state
  if (order.status === "cancelled") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Thanh toán khóa học</h1>
        <Alert variant="info">
          <AlertTitle>Đơn hàng đã huỷ</AlertTitle>
          <AlertDescription className="space-y-1.5">
            <p>Các khoá học đã được đưa lại vào giỏ hàng của bạn.</p>
            <p className="text-xs">
              Mã giao dịch: <span className="font-mono font-semibold">{order.code}</span> · Cần hỗ trợ? Email{" "}
              <a href="mailto:hotro@codi.vn" className="underline font-medium">
                hotro@codi.vn
              </a>
              .
            </p>
          </AlertDescription>
          <div className="pt-3">
            <Button size="sm" render={<Link href="/cart" />} nativeButton={false}>
              Về giỏ hàng
            </Button>
          </div>
        </Alert>
        {orderSummaryCard}
      </div>
    );
  }

  // Failed / Expired state
  if (order.status === "failed") {
    const isExpired = order.failReason === "expired";
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Thanh toán khóa học</h1>
        <Alert variant="destructive">
          <AlertTitle>{isExpired ? "Mã thanh toán đã hết hạn" : "Thanh toán không thành công"}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Nếu bạn đã chuyển khoản sau thời điểm hết hạn, Codi sẽ đối soát thủ công và liên hệ qua email. Bạn có thể tạo mã mới để thanh toán lại.
            </p>
            <p className="text-xs">
              Cần hỗ trợ? Email <a href="mailto:hotro@codi.vn" className="underline font-medium">hotro@codi.vn</a> kèm mã giao dịch{" "}
              <span className="font-mono font-semibold">{order.code}</span>.
            </p>
          </AlertDescription>
          <div className="pt-4 flex flex-wrap gap-3">
            <Button size="sm" onClick={handleCreateNewCode} disabled={isCreatingNewCode}>
              {isCreatingNewCode ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="size-4 mr-1.5" />
              )}
              Tạo mã mới
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/cart" />} nativeButton={false}>
              Về giỏ hàng
            </Button>
          </div>
        </Alert>
        {orderSummaryCard}
      </div>
    );
  }

  // Pending view requires bank details
  if (!bank) {
    return null;
  }

  // Countdown display
  const minutes = Math.max(0, Math.floor(timeLeftMs / 60000));
  const seconds = Math.max(0, Math.floor((timeLeftMs % 60000) / 1000));
  const countdownFormatted = `${minutes}:${String(seconds).padStart(2, "0")}`;

  const qrImageUrl = `https://img.vietqr.io/image/${bank.bank}-${bank.accountNumber}-compact.png?amount=${remainingAmount}&addInfo=${encodeURIComponent(order.code)}`;

  const copyRow = (label: string, value: string, copyVal: string, isEmphasis = false) => {
    const isCopied = copiedKey === label;
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border ${
          isEmphasis ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card"
        }`}
      >
        <div className="space-y-0.5 pr-2">
          <span className="text-xs text-muted-foreground block">{label}</span>
          <span className={`text-sm font-semibold ${isEmphasis ? "text-primary text-base font-mono" : ""}`}>
            {value}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCopy(label, copyVal)}
          aria-label={`Sao chép ${label}`}
          className="shrink-0"
        >
          {isCopied ? <Check className="size-3.5 text-success mr-1" /> : <Copy className="size-3.5 mr-1" />}
          <span>{isCopied ? "Đã sao chép" : "Sao chép"}</span>
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Thanh toán khóa học</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo thông tin bên dưới.
        </p>
      </div>

      {/* Stepper tracker */}
      <Stepper steps={STEPPER_STEPS} current={1} />

      {/* Underpaid warning */}
      {isUnderpaid && (
        <Alert variant="warning">
          <AlertTitle>
            Đã nhận {formatVnd(order.receivedAmount)} / cần {formatVnd(order.totalAmount)}
          </AlertTitle>
          <AlertDescription>
            Hãy chuyển thêm <strong>{formatVnd(remainingAmount)}</strong> với cùng nội dung{" "}
            <span className="font-mono font-semibold">{order.code}</span>. Cần hỗ trợ? Email{" "}
            <a href="mailto:hotro@codi.vn" className="underline">
              hotro@codi.vn
            </a>{" "}
            kèm mã giao dịch.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: QR & Transfer details */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-border">
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {qrFailed ? "Chuyển khoản thủ công" : "Quét mã thanh toán"}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-warning-soft text-warning border border-warning/20">
                  <Clock className="size-3.5" />
                  Hết hạn sau {countdownFormatted}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sau thời gian này mã QR và nội dung chuyển khoản sẽ không còn hiệu lực.
              </p>

              {/* QR Image or Fallback */}
              {qrFailed ? (
                <Alert variant="destructive">
                  <AlertTitle>Không tải được mã QR</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      Hãy chuyển khoản thủ công bằng thông tin bên dưới, nội dung{" "}
                      <span className="font-mono font-semibold">{order.code}</span>. Cần hỗ trợ? Email{" "}
                      <a href="mailto:hotro@codi.vn" className="underline">
                        hotro@codi.vn
                      </a>
                      .
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQrFailed(false)}
                      className="mt-2"
                    >
                      <RefreshCw className="size-3.5 mr-1.5" /> Tải lại mã QR
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-xl border border-border space-y-2">
                  <div className="relative size-60 bg-card p-3 rounded-lg border border-border shadow-sm flex items-center justify-center">
                    <Image
                      src={qrImageUrl}
                      alt={`Mã VietQR cho nội dung ${order.code}`}
                      width={240}
                      height={240}
                      className="object-contain size-full"
                      onError={() => setQrFailed(true)}
                      unoptimized
                    />
                  </div>
                  <span className="text-xs text-muted-foreground text-center">
                    VietQR · {bank.bank} · Quét bằng mọi app ngân hàng
                  </span>
                </div>
              )}

              {/* Transfer fields */}
              <div className="space-y-3">
                {copyRow("Ngân hàng", bank.bank, bank.bank)}
                {copyRow("Số tài khoản", bank.accountNumber, bank.accountNumber)}
                {copyRow("Chủ tài khoản", bank.accountName, bank.accountName)}
                {copyRow("Số tiền", formatVnd(remainingAmount), String(remainingAmount))}
                {copyRow("Nội dung chuyển khoản", order.code, order.code, true)}
              </div>

              {/* Strict notice */}
              <Alert variant="warning">
                <AlertTitle>Nhập chính xác nội dung chuyển khoản</AlertTitle>
                <AlertDescription>
                  Nội dung phải là <strong className="font-mono">{order.code}</strong>. Sai nội dung thì hệ thống
                  không tự xác nhận được.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Order Summary & Actions */}
        <div className="lg:col-span-5 space-y-6">
          {orderSummaryCard}

          <Card className="border-border">
            <CardContent className="p-6 space-y-4">
              {/* Polling live indicator */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>
                  Đang kiểm tra thanh toán…{" "}
                  {lastCheckedAt && <span className="text-xs text-foreground">(lần gần nhất {lastCheckedAt})</span>}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Thường mất vài giây đến vài phút sau khi bạn chuyển. Bạn có thể rời trang — đơn hàng vẫn được lưu trong
                Giỏ hàng và Hồ sơ › Giao dịch.
              </p>

              {/* Manual check button with 30s cooldown */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleManualCheck}
                disabled={manualCooldown > 0 || manualChecking}
              >
                {manualChecking ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : null}
                {manualCooldown > 0
                  ? `Tôi đã chuyển khoản (${manualCooldown}s)`
                  : "Tôi đã chuyển khoản"}
              </Button>

              {/* Manual check inline result (D5: strictly under button, no modal) */}
              {manualCheckedAt && (
                <Alert variant="info" className="text-xs">
                  <AlertTitle className="text-xs">
                    Đã kiểm tra lúc {manualCheckedAt}: Codi chưa nhận được tiền
                  </AlertTitle>
                  <AlertDescription className="space-y-1.5 pt-1">
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Một số ngân hàng xử lý chậm — Codi vẫn tự kiểm tra tới khi mã hết hạn.</li>
                      <li>
                        Sau đó kế toán đối soát thủ công theo nội dung{" "}
                        <span className="font-mono font-semibold">{order.code}</span>, thường trong 2 giờ làm việc.
                      </li>
                      <li>
                        Khi xác nhận xong, khoá học mở ngay và bạn nhận được thông báo. Cần hỗ trợ:{" "}
                        <a href="mailto:hotro@codi.vn" className="underline">
                          hotro@codi.vn
                        </a>
                        .
                      </li>
                    </ol>
                  </AlertDescription>
                </Alert>
              )}

              {/* Slow or problem notice */}
              {(showSlowNotice || qrFailed) && (
                <p className="text-xs text-muted-foreground pt-1">
                  Cần hỗ trợ? Email{" "}
                  <a href="mailto:hotro@codi.vn" className="underline">
                    hotro@codi.vn
                  </a>{" "}
                  kèm mã giao dịch <span className="font-mono font-semibold text-foreground">{order.code}</span>.
                </p>
              )}

              {/* Cancel order button */}
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                Hủy giao dịch
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="Huỷ giao dịch này?"
        consequence={`Đơn ${order.code} sẽ bị huỷ và mã thanh toán không dùng được nữa. Các khoá học quay lại giỏ hàng. Nếu bạn đã chuyển khoản, đừng huỷ — hãy chờ hoặc liên hệ hotro@codi.vn.`}
        reversible="Bạn có thể tạo đơn mới từ giỏ hàng bất cứ lúc nào."
        confirmLabel="Huỷ giao dịch"
        danger
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
