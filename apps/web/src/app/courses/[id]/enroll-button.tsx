"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { authClient } from "@/lib/auth-client";
import { Course } from "@/lib/data/courses";

export default function EnrollButton({ course }: { course: Course }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [isLoading, setIsLoading] = useState(false);

  const handleEnroll = async () => {
    if (!session?.user) {
      router.push("/login");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/payments/zalopay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: course.price,
          description: `Codi - Thanh toán khóa học: ${course.title}`,
          item: [{ id: course.id, title: course.title, price: course.price }],
          embed_data: { courseId: course.id, redirecturl: `${window.location.origin}/dashboard` },
          app_user: session?.user?.name || "CodiUser"
        })
      });
      
      const data = await res.json();
      if (data.order_url) {
        window.location.href = data.order_url;
      } else {
        alert("Lỗi khi tạo đơn hàng thanh toán");
      }
    } catch (e) {
      alert("Đã xảy ra lỗi hệ thống");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button className="w-full" size="lg" onClick={handleEnroll} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : null}
      {session?.user ? "Thanh toán" : "Đăng nhập để thanh toán"}
      {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
    </Button>
  );
}