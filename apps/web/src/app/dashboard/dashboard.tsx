"use client";

import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import OtpInput from "@/components/otp-input";
import ChangePasswordCard from "@/components/profile/change-password-card";
import ProfileCard from "@/components/profile/profile-card";
import { authClient } from "@/lib/auth-client";

export type DashboardNavItem = { label: string; href?: string; disabled?: boolean };

export default function Dashboard({
  session,
  roles = [],
  navItems,
}: {
  session: typeof authClient.$Infer.Session;
  roles?: string[];
  navItems?: DashboardNavItem[];
}) {
  const router = useRouter();
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [dashboardOtp, setDashboardOtp] = useState("");
  const [verifyingDashboardOtp, setVerifyingDashboardOtp] = useState(false);

  const handleResendVerification = async () => {
    try {
      setResendingEmail(true);
      await authClient.emailOtp.sendVerificationOtp(
        {
          email: session.user.email,
          type: "email-verification",
        },
        {
          onSuccess: () => {
            setShowOtpModal(true);
            toast.success("Đã gửi mã OTP 6 số tới email! Mã có hiệu lực 2 phút.");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Không thể gửi mã OTP lúc này.");
          },
        }
      );
    } finally {
      setResendingEmail(false);
    }
  };

  const handleVerifyDashboardOtp = async () => {
    if (dashboardOtp.length !== 6) {
      toast.error("Vui lòng nhập đủ 6 chữ số OTP");
      return;
    }
    try {
      setVerifyingDashboardOtp(true);
      await authClient.emailOtp.verifyEmail(
        {
          email: session.user.email,
          otp: dashboardOtp,
        },
        {
          onSuccess: () => {
            toast.success("Xác thực email thành công!");
            setShowOtpModal(false);
            router.refresh();
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Mã OTP không hợp lệ hoặc đã hết hạn.");
          },
        }
      );
    } finally {
      setVerifyingDashboardOtp(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          toast.success("Đã đăng xuất tài khoản.");
        },
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trung tâm tài khoản Codi</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý hồ sơ cá nhân, ảnh đại diện R2 và bảo mật tài khoản.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!session.user.emailVerified && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendVerification}
              disabled={resendingEmail}
            >
              {resendingEmail ? "Đang gửi..." : "Xác thực email"}
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </Button>
        </div>
      </div>

      {/* Profile Card (Xem & Edit Profile, Đổi ảnh đại diện R2) */}
      <ProfileCard user={session.user} roles={roles} />

      {navItems && navItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chức năng</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {navItems.map((item) =>
                item.href && !item.disabled ? (
                  <li key={item.label}>
                    <Link
                      href={item.href as any}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ) : (
                  <li
                    key={item.label}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className={item.disabled ? "text-muted-foreground" : ""}>{item.label}</span>
                    {item.disabled && (
                      <span className="text-xs text-muted-foreground">Sắp ra mắt</span>
                    )}
                  </li>
                )
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* OTP Verification Card for unverified user */}
      {showOtpModal && !session.user.emailVerified && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Nhập mã OTP xác thực Email</CardTitle>
            <CardDescription>
              Mã OTP 6 chữ số đã được gửi tới <strong>{session.user.email}</strong>. Vui lòng nhập mã trong vòng 2 phút.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <OtpInput
              length={6}
              value={dashboardOtp}
              onChange={setDashboardOtp}
              onResend={handleResendVerification}
              expiresInSeconds={120}
              disabled={verifyingDashboardOtp}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleVerifyDashboardOtp}
                disabled={dashboardOtp.length !== 6 || verifyingDashboardOtp}
                className="flex-1"
              >
                {verifyingDashboardOtp ? "Đang xác thực..." : "Xác thực ngay"}
              </Button>
              <Button variant="outline" onClick={() => setShowOtpModal(false)}>
                Đóng
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change Password Card */}
      <ChangePasswordCard />
    </div>
  );
}
