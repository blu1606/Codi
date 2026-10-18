"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  RotateCcw,
  Sparkles,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@codi-1/ui/components/empty";
import { undoToast } from "@codi-1/ui/components/undo-toast";
import type { CartCourse, CartSummaryData } from "@/lib/cart-contract";
import { formatVnd } from "@/lib/cart-contract";

export function CartView() {
  const router = useRouter();
  const [data, setData] = useState<CartSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<CartCourse | null>(null);
  const [currentVoucherCode, setCurrentVoucherCode] = useState<string>("");

  const fetchCart = useCallback(async (codeToUse?: string) => {
    try {
      setLoading(true);
      setError(null);
      const url = codeToUse
        ? `/api/student/cart?voucher=${encodeURIComponent(codeToUse)}`
        : "/api/student/cart";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login?returnTo=/cart");
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Không thể tải giỏ hàng.");
      }
      const json: CartSummaryData = await res.json();
      setData(json);
      if (json.voucher) {
        setCurrentVoucherCode(json.voucher.code);
        setVoucherError(null);
      } else if (json.voucherError) {
        setVoucherError(json.voucherError);
      }
    } catch (err: any) {
      setError(err?.message || "Đã xảy ra lỗi khi tải giỏ hàng.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const handleApplyVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = voucherInput.trim().toUpperCase();
    if (!trimmed) {
      setVoucherError("Nhập mã giảm giá trước khi bấm Áp dụng.");
      return;
    }
    setApplyingVoucher(true);
    setVoucherError(null);

    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, subtotal: data?.subtotal || 0 }),
      });
      const resJson = await res.json();
      if (!res.ok) {
        setVoucherError(resJson.error || "Mã giảm giá không hợp lệ.");
        return;
      }
      setCurrentVoucherCode(trimmed);
      setVoucherInput("");
      await fetchCart(trimmed);
    } catch {
      setVoucherError("Lỗi kết nối khi kiểm tra mã giảm giá.");
    } finally {
      setApplyingVoucher(false);
    }
  };

  const handleRemoveVoucher = async () => {
    setCurrentVoucherCode("");
    setVoucherError(null);
    await fetchCart("");
  };

  const handleRemoveItem = async (course: CartCourse) => {
    try {
      const res = await fetch("/api/student/cart", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      if (!res.ok) throw new Error("Không thể xoá khóa học");
      setLastRemoved(course);
      await fetchCart(currentVoucherCode);

      undoToast(`Đã xoá "${course.title}" khỏi giỏ hàng`, async () => {
        await fetch("/api/student/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        });
        setLastRemoved(null);
        await fetchCart(currentVoucherCode);
      });
    } catch {
      setError("Không thể xóa khóa học. Vui lòng thử lại.");
    }
  };

  const handleUndo = async () => {
    if (!lastRemoved) return;
    try {
      await fetch("/api/student/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: lastRemoved.id }),
      });
      setLastRemoved(null);
      await fetchCart(currentVoucherCode);
    } catch {
      setError("Không thể hoàn tác. Vui lòng thử lại.");
    }
  };

  const executeCheckout = async (replaceOrderId?: number) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherCode: currentVoucherCode || undefined,
          replaceOrderId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Không thể tạo đơn hàng.");
      }
      router.push(`/checkout?order=${json.orderId}` as any);
    } catch (err: any) {
      setError(err?.message || "Lỗi tạo đơn hàng.");
      setCheckoutLoading(false);
    }
  };

  const handleStartCheckout = () => {
    if (data?.pendingOrder) {
      setShowReplaceModal(true);
    } else {
      executeCheckout();
    }
  };

  if (loading && !data) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center p-8">
        <p className="text-muted-foreground animate-pulse">Đang tải giỏ hàng…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" onClick={() => fetchCart(currentVoucherCode)}>Thử lại</Button>
        </div>
      </div>
    );
  }

  const items = data?.items || [];
  const pendingOrder = data?.pendingOrder;
  const removedOwned = data?.removedOwnedTitles || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Pending order warning banner */}
      {pendingOrder && (
        <Alert variant="warning" className="mb-6">
          <div className="flex w-full flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <AlertTitle>Bạn có đơn hàng {pendingOrder.code} đang chờ thanh toán</AlertTitle>
              <AlertDescription>
                {pendingOrder.itemCount} khoá học · {formatVnd(pendingOrder.totalAmount)} · tạo lúc{" "}
                {new Date(pendingOrder.createdAt).toLocaleDateString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </AlertDescription>
            </div>
            <Link href={{ pathname: "/checkout", query: { order: pendingOrder.id } }}>
              <Button size="sm" className="whitespace-nowrap">Tiếp tục thanh toán</Button>
            </Link>
          </div>
        </Alert>
      )}

      {/* Auto-removed owned courses banner */}
      {removedOwned.length > 0 && (
        <Alert variant="info" className="mb-6">
          <AlertTitle>Đã bỏ khoá học bạn đã sở hữu khỏi giỏ</AlertTitle>
          <AlertDescription>{removedOwned.join(", ")}</AlertDescription>
        </Alert>
      )}

      {/* In-page Undo banner */}
      {lastRemoved && (
        <Alert variant="info" className="mb-6 flex items-center justify-between">
          <div>
            <AlertTitle>Đã xoá &quot;{lastRemoved.title}&quot; khỏi giỏ hàng</AlertTitle>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUndo} className="flex items-center gap-1.5">
            <RotateCcw className="size-4" />
            Hoàn tác
          </Button>
        </Alert>
      )}

      <h1 className="font-display mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        Giỏ hàng {items.length > 0 && <span className="text-muted-foreground font-normal">({items.length})</span>}
      </h1>

      {items.length === 0 ? (
        <Card className="p-8 sm:p-12">
          <CardContent className="p-0">
            <Empty>
              <EmptyMedia variant="icon">
                <BookOpen className="size-6 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Giỏ hàng của bạn đang trống</EmptyTitle>
                <EmptyDescription>
                  Thêm khoá học từ danh sách, hoặc nhờ AI Codi gợi ý khoá phù hợp với mục tiêu.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="mt-4 flex flex-row flex-wrap justify-center gap-3">
                <Link href={{ pathname: "/courses" }}>
                  <Button className="flex items-center gap-2">Khám phá khoá học</Button>
                </Link>
                <Link href={{ pathname: "/ai" }}>
                  <Button variant="secondary" className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Hỏi AI Codi
                  </Button>
                </Link>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Cart Item List */}
          <div className="lg:col-span-8">
            <ul className="space-y-4">
              {items.map((course) => (
                <li key={course.id}>
                  <Card className="overflow-hidden transition-shadow hover:shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                          {course.coverImageUrl ? (
                            <Image
                              src={course.coverImageUrl}
                              alt=""
                              fill
                              sizes="112px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <BookOpen className="size-8 stroke-[1.5]" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={{ pathname: `/courses/${course.slug}` }}
                            className="font-semibold text-foreground hover:text-primary hover:underline line-clamp-1"
                          >
                            {course.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {course.lecturerName} · {course.level}
                          </p>
                          <div className="font-semibold text-primary sm:hidden">
                            {formatVnd(course.price)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t pt-3 sm:border-0 sm:pt-0 sm:gap-6">
                        <span className="hidden text-base font-semibold text-primary sm:inline-block">
                          {formatVnd(course.price)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(course)}
                          aria-label={`Xoá ${course.title} khỏi giỏ`}
                          className="size-9 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>

          {/* Cart Summary & Voucher */}
          <div className="lg:col-span-4">
            <Card className="sticky top-20">
              <CardContent className="space-y-6 p-6">
                <h2 className="text-lg font-semibold tracking-tight">Tóm tắt đơn hàng</h2>

                {/* Voucher section */}
                <div className="space-y-2">
                  <label htmlFor="voucher-code" className="text-sm font-medium">
                    Mã giảm giá
                  </label>
                  {data?.voucher ? (
                    <div className="flex items-center justify-between rounded-md border border-accent-border bg-accent p-2.5 text-sm text-accent-foreground">
                      <div className="flex items-center gap-2">
                        <Ticket className="size-4 text-primary" />
                        <span className="font-semibold">{data.voucher.code}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-success">Đã áp dụng</span>
                        <button
                          type="button"
                          onClick={handleRemoveVoucher}
                          aria-label="Bỏ mã giảm giá"
                          className="rounded p-1 hover:bg-background/50"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyVoucher} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          id="voucher-code"
                          type="text"
                          value={voucherInput}
                          onChange={(e) => {
                            setVoucherInput(e.target.value);
                            if (voucherError) setVoucherError(null);
                          }}
                          placeholder="Mã giảm giá"
                          autoComplete="off"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm uppercase shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={applyingVoucher}
                          className="shrink-0"
                        >
                          {applyingVoucher ? "Đang áp dụng…" : "Áp dụng"}
                        </Button>
                      </div>
                      {voucherError ? (
                        <p className="flex items-center gap-1.5 text-xs text-destructive">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>{voucherError}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Thử WELCOME20 (đơn từ 500.000 ₫) hoặc SUMMER15 (đã hết hạn).
                        </p>
                      )}
                    </form>
                  )}
                </div>

                {/* Cost summary table */}
                <dl className="space-y-2.5 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tạm tính</dt>
                    <dd className="font-medium">{formatVnd(data?.subtotal || 0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Giảm giá</dt>
                    <dd className={data?.discount ? "font-semibold text-success" : "font-medium"}>
                      {data?.discount ? `−${formatVnd(data.discount)}` : formatVnd(0)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t pt-2.5 text-base font-bold">
                    <dt>Tổng cộng</dt>
                    <dd className="text-primary">{formatVnd(data?.total || 0)}</dd>
                  </div>
                </dl>

                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleStartCheckout}
                    disabled={checkoutLoading || items.length === 0}
                    className="w-full text-base font-semibold"
                    size="lg"
                  >
                    {checkoutLoading ? "Đang tạo đơn…" : "Thanh toán"}
                  </Button>
                  <Link href={{ pathname: "/courses" }} className="block">
                    <Button variant="ghost" className="w-full">
                      Tiếp tục xem khoá học
                    </Button>
                  </Link>
                </div>

                <p className="text-xs text-muted-foreground">
                  Thanh toán bằng chuyển khoản ngân hàng (VietQR). Khoá học được mở ngay khi Codi nhận được tiền.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Modal when a pending order already exists */}
      <Dialog open={showReplaceModal} onOpenChange={setShowReplaceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bạn còn một đơn hàng chưa thanh toán</DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-foreground">
              <p>
                Đơn <strong>{pendingOrder?.code}</strong> ({formatVnd(pendingOrder?.totalAmount || 0)}) đang chờ thanh toán. Bạn muốn làm gì?
              </p>
              <p className="text-xs text-muted-foreground">
                Tạo đơn mới sẽ huỷ đơn cũ. Nếu bạn đã chuyển khoản cho đơn cũ, hãy chọn tiếp tục đơn cũ.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setShowReplaceModal(false)}>
              Đóng
            </Button>
            {pendingOrder && (
              <Link href={{ pathname: "/checkout", query: { order: pendingOrder.id } }}>
                <Button variant="secondary">Tiếp tục đơn cũ</Button>
              </Link>
            )}
            <Button
              variant="default"
              onClick={() => {
                setShowReplaceModal(false);
                if (pendingOrder) {
                  executeCheckout(pendingOrder.id);
                }
              }}
            >
              Huỷ đơn cũ, tạo đơn mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
