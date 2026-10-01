"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { authClient } from "@/lib/auth-client";

export default function EnrollButton({ courseTitle }: { courseTitle: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const handleEnroll = () => {
    if (session?.user) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  };

  return (
    <Button className="w-full" size="lg" onClick={handleEnroll}>
      {session?.user ? "Vào học ngay" : "Đăng ký học ngay"}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );
}
