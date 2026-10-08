"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { authClient } from "@/lib/auth-client";
import type { Course } from "@/lib/data/courses";

export default function EnrollButton({ course }: { course: Course }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const handleEnroll = () => {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    router.push(`/courses/${course.id}/checkout` as any);
  };

  return (
    <Button className="w-full" size="lg" onClick={handleEnroll}>
      {session?.user ? "Thanh toán" : "Đăng nhập để thanh toán"}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );
}