"use client";

import { useState } from "react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import OtpInput from "@/components/otp-input";
import { authClient } from "@/lib/auth-client";

export default function EmailVerificationCard({
  email,
  emailVerified,
}: {
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  if (emailVerified) {
    return null;
  }

  const handleSendOtp = async () => {
    try {
      setResending(true);
      await authClient.emailOtp.sendVerificationOtp(
        {
          email,
          type: "email-verification",
        },
        {
          onSuccess: () => {
            setShowOtp(true);
            toast.success("Mã OTP gồm 6 chữ số đã được gửi tới email của bạn!");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Không thể gửi mã OTP lúc này.");
          },
        }
      );
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error("Vui lòng nhập đủ 6 chữ số OTP");
      return;
    }
    try {
      setVerifying(true);
      await authClient.emailOtp.verifyEmail(
        {
          email,
          otp,
        },
        {
          onSuccess: () => {
            toast.success("Xác thực email thành công!");
            setShowOtp(false);
            router.refresh();
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Mã OTP không hợp lệ hoặc đã hết hạn.");
          },
        }
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <CardTitle className="text-base font-semibold">Tài khoản chưa xác thực email</CardTitle>
        </div>
        <CardDescription>
          Xác thực địa chỉ email <strong>{email}</strong> để bảo vệ tài khoản và mở khóa đầy đủ tính năng.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showOtp ? (
          <Button
            onClick={handleSendOtp}
            disabled={resending}
            size="sm"
            className="cursor-pointer"
          >
            {resending ? "Đang gửi mã..." : "Gửi mã OTP xác thực"}
          </Button>
        ) : (
          <div className="max-w-md space-y-4 pt-2">
            <OtpInput
              length={6}
              value={otp}
              onChange={setOtp}
              onResend={handleSendOtp}
              expiresInSeconds={120}
              disabled={verifying}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || verifying}
                size="sm"
                className="cursor-pointer"
              >
                {verifying ? "Đang xác thực..." : "Xác nhận OTP"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOtp(false)}
                className="cursor-pointer"
              >
                Thu gọn
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
