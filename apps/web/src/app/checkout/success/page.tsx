"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Receipt } from "lucide-react";
import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
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
  totalAmount: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  paidAt: string | null;
  items: OrderItem[];
}

function formatVnd(amount: number): string {
  return Number(amount || 0).toLocaleString("vi-VN") + " ₫";
}

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function CheckoutSuccessPage({
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

  useEffect(() => {
    if (isSessionLoading) return;
    if (!session?.user) {
      const redirectUrl = orderParam ? `/checkout/success?order=${encodeURIComponent(orderParam)}` : "/courses";
      router.push(`/login?next=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!orderParam) {
      setLoading(false);
      return;
    }

    fetch(`/api/orders/${encodeURIComponent(orderParam)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.order && data.order.status === "paid") {
          setOrder(data.order);
        } else {
          setOrder(null);
        }
      })
      .catch(() => {
        setOrder(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session?.user, isSessionLoading, orderParam, router]);

  if (isSessionLoading || loading) {
    return (
      <LoadingRegion label="Đang tải kết quả thanh toán…" className="container mx-auto max-w-2xl space-y-6 px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </LoadingRegion>
    );
  }

  if (!order || order.status !== "paid" || order.items.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>Chưa có xác nhận thanh toán cho đơn này</EmptyTitle>
            <EmptyDescription>
              Đơn hàng chưa hoàn tất thanh toán hoặc không tồn tại.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/profile?tab=transactions" />} nativeButton={false}>
              Xem giao dịch
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const firstCourse = order.items[0];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12 space-y-8">
      {/* Success banner */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-9 stroke-[2.5]" />
        </div>
        <h1 className="text-3xl tracking-tight">Thanh toán thành công!</h1>
        <p className="text-muted-foreground text-sm">
          Đơn <span className="font-mono font-semibold text-foreground">{order.code}</span> · {formatVnd(order.totalAmount)} · {formatDatetime(order.paidAt)}
        </p>
      </div>

      {/* Owned courses card */}
      <Card className="border-border">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Bạn đã sở hữu khóa học</h2>
          <ul className="divide-y divide-border">
            {order.items.map((c) => (
              <li key={c.courseId} className="flex items-center justify-between py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative size-12 shrink-0 rounded-md overflow-hidden bg-muted border border-border">
                    {c.thumbnail ? (
                      <Image
                        src={c.thumbnail}
                        alt={c.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-xs font-bold text-muted-foreground bg-primary/10">
                        CODI
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-sm leading-snug truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">Khóa học tại Codi</p>
                  </div>
                </div>

                {order.items.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    render={<Link href={`/learn/${encodeURIComponent(c.courseId)}/onboarding`} />}
                    nativeButton={false}
                  >
                    Bắt đầu
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Primary CTA and Secondary links (NO auto-redirect, Rule S07) */}
      <div className="space-y-4 pt-2">
        <Button
          size="lg"
          className="w-full text-base font-medium py-6"
          render={<Link href={`/learn/${encodeURIComponent(firstCourse.courseId)}/onboarding`} />}
          nativeButton={false}
        >
          Bắt đầu học
        </Button>

        <div className="flex items-center justify-center gap-6 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Về bàn làm việc
          </Link>
          <span className="text-border">·</span>
          <Link
            href="/profile?tab=transactions"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Xem biên lai trong Giao dịch
          </Link>
        </div>
      </div>
    </div>
  );
}
