"use client";

import { useState, use, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Code } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";

import { SEED_COURSES } from "@/lib/data/courses";
import { authClient } from "@/lib/auth-client";

interface CheckoutPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const PAYMENT_METHODS = [
  { id: "vietqr", name: "Chuyển khoản / Ứng dụng ngân hàng", icon: "/codi.png", qr: "" },
];

export default function CheckoutPage({ params }: CheckoutPageProps) {
  const router = useRouter();
  const { slug } = use(params);
  
  const { data: session, isPending } = authClient.useSession();
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0]);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);

  const course = SEED_COURSES.find((c) => c.id === slug || c.slug === slug);

  useEffect(() => {
    if (session?.user && course && !transactionId) {
      // Create a pending transaction on the server
      fetch("/api/payments/create-transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: course.id,
          amount: course.price,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.transactionId) {
            setTransactionId(data.transactionId);
          }
        })
        .catch(console.error);
    }
  }, [session, course, transactionId]);

  useEffect(() => {
    if (!transactionId || isPaid) return;

    // Poll for payment status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/check-transaction/${transactionId}`);
        const data = await res.json();
        if (data.status === "paid") {
          setIsPaid(true);
          clearInterval(interval);
          // Optional: Add a small delay for user to see the success message before redirect
          setTimeout(() => {
            router.push("/dashboard");
          }, 3000);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [transactionId, isPaid, router]);


  if (isPending) return <div className="p-8 text-center">Đang tải...</div>;

  if (!session?.user) {
    router.push("/login");
    return null;
  }

  if (!course) {
    return <div className="p-8 text-center text-destructive">Không tìm thấy khóa học!</div>;
  }

  // Once we have a transactionId, generate the dynamic VietQR URL
  const transferMessage = transactionId || "DANG TAO MA...";
  const qrUrl = transactionId 
    ? `https://img.vietqr.io/image/MB-0352060805-compact.png?amount=${course.price}&addInfo=${encodeURIComponent(transferMessage)}`
    : "";

  if (isPaid) {
    return (
      <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center min-h-[60vh]">
        <CheckCircle2 className="w-24 h-24 text-primary mb-6" />
        <h1 className="text-3xl font-bold mb-4">Thanh toán thành công!</h1>
        <p className="text-muted-foreground mb-8">Bạn đã đăng ký khóa học {course.title}. Hệ thống đang chuyển hướng vào bảng điều khiển...</p>
        <Button render={<Link href="/dashboard" />} nativeButton={false}>
          Vào học ngay
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 min-h-[80vh]">
      <h1 className="text-2xl font-bold mb-8 text-center">Thanh toán khóa học</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* CỘT TRÁI: Thông tin khóa học và Chọn phương thức */}
        <div className="space-y-6 flex flex-col justify-start">
          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">Thông tin đơn hàng</h2>
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
                    {course.title.substring(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-lg leading-tight">{course.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{course.category}</p>
                    <p className="text-2xl font-bold text-primary mt-4">
                      {course.price.toLocaleString("vi-VN")}đ
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">Phương thức thanh toán</h2>
            <div className="grid grid-cols-1 gap-3">
              {PAYMENT_METHODS.map((method) => (
                <div
                  key={method.id}
                  onClick={() => setSelectedMethod(method)}
                  className={`flex items-center space-x-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedMethod.id === method.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-background overflow-hidden flex items-center justify-center shrink-0 shadow-sm border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={method.icon} alt={method.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="font-medium text-foreground">{method.name}</div>
                  {selectedMethod.id === method.id && (
                    <CheckCircle2 className="ml-auto h-5 w-5 text-primary" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: QR Code ở giữa, nút hủy góc dưới phải */}
        <div className="flex flex-col h-full">
          <Card className="shadow-sm flex-grow flex flex-col relative overflow-hidden">
            {/* Overlay loading state */}
            {!transactionId && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <p className="text-foreground font-medium">Đang khởi tạo mã thanh toán...</p>
              </div>
            )}

            <CardHeader className="text-center pb-2">
              <CardTitle>Quét mã thanh toán</CardTitle>
              <CardDescription>
                Mở ứng dụng <strong>Ngân Hàng</strong> để quét mã
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center flex-grow p-6 space-y-6">
              
              <div className="bg-white p-4 rounded-2xl border shadow-sm min-h-[250px] min-w-[250px] flex items-center justify-center">
                {qrUrl && (
                  <Image
                    src={qrUrl}
                    alt="Mã QR Thanh Toán"
                    width={250}
                    height={250}
                    className="rounded-lg object-contain"
                    unoptimized
                  />
                )}
              </div>

            </CardContent>
          </Card>

          <div className="mt-6 flex justify-end items-center gap-4">
            <Button variant="outline" render={<Link href={`/courses/${slug}`} />} nativeButton={false}>
              Hủy giao dịch
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
