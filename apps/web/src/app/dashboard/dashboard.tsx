"use client";

import { Suspense, useState } from "react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  LogOut,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export type DashboardNavItem = { label: string; href?: string; disabled?: boolean };

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  LEARNER: "Học viên",
  LECTURER: "Giảng viên",
  ADMIN: "Quản trị viên",
};

function DashboardInner({
  session,
  roles = [],
  navItems = [],
}: {
  session: typeof authClient.$Infer.Session;
  roles?: string[];
  navItems?: DashboardNavItem[];
}) {
  const router = useRouter();
  const [resendingEmail, setResendingEmail] = useState(false);

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
            toast.success("Đã gửi mã OTP tới email! Vui lòng vào trang Hồ sơ để xác thực.");
            router.push("/profile");
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header Bar & Action Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Bàn làm việc</h1>
            <div className="flex gap-1.5">
              {roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold"
                >
                  {ROLE_DISPLAY_NAMES[r] || r}
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Không gian học tập & theo dõi tiến độ đào tạo cá nhân hóa Codi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!session.user.emailVerified && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendVerification}
              disabled={resendingEmail}
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {resendingEmail ? "Đang gửi..." : "Xác thực email"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/profile")}
            className="gap-1.5 cursor-pointer"
          >
            <User className="w-4 h-4 text-muted-foreground" />
            Hồ sơ cá nhân
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1.5 cursor-pointer">
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </Button>
        </div>
      </div>

      {/* OVERVIEW / BLANK DASHBOARD WORKSPACE */}
      <div className="space-y-6">
        {/* Welcome User Banner */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Không gian học tập Codi
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Chào mừng trở lại, {session.user.name || "Học viên"}! 👋
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Bạn đang đăng nhập bằng email <strong className="text-foreground">{session.user.email}</strong>. 
              Tài khoản của bạn đã được kết nối an toàn với hệ thống bài tập thực chiến và trợ lý AI 24/7.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="default"
              onClick={() => router.push("/ai")}
              className="gap-2 cursor-pointer shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              Tư vấn với AI Mentor
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/profile")}
              className="gap-2 cursor-pointer"
            >
              <User className="h-4 w-4" />
              Xem Hồ sơ (Profile)
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Khóa học đăng ký</CardTitle>
              <BookOpen className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-1">Chưa có khóa học nào đang học</p>
            </CardContent>
          </Card>

          <Card className="border border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Giờ học tích lũy</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0 giờ</div>
              <p className="text-xs text-muted-foreground mt-1">Sẽ bắt đầu tính khi vào bài học</p>
            </CardContent>
          </Card>

          <Card className="border border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trạng thái tài khoản</CardTitle>
              {session.user.emailVerified ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold flex items-center gap-1.5">
                {session.user.emailVerified ? (
                  <span className="text-primary font-semibold">Đã xác thực email</span>
                ) : (
                  <span className="text-destructive font-semibold">Chưa xác thực email</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {session.user.emailVerified
                  ? "Tài khoản bảo mật cao"
                  : "Nhấn xác thực để mở toàn bộ tính năng"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Blank State: Workspace Area */}
        <Card className="border border-dashed border-border/80">
          <CardContent className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <GraduationCap className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-lg font-bold">Bàn làm việc của bạn đang trống</h3>
              <p className="text-sm text-muted-foreground">
                Hiện bạn chưa ghi danh vào khoá học nào. Hãy khám phá danh mục khóa học hoặc nhờ trợ lý AI gợi ý lộ trình học tập cá nhân hóa.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={() => router.push("/ai")}
                variant="default"
                className="gap-2 cursor-pointer"
              >
                <Compass className="h-4 w-4" />
                Khám phá lộ trình cùng AI
              </Button>
              <Button
                onClick={() => router.push("/profile")}
                variant="outline"
                className="gap-2 cursor-pointer"
              >
                <User className="h-4 w-4" />
                Cập nhật Hồ sơ cá nhân
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Nav Items Section (Chức năng) */}
        {navItems && navItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Chức năng & Lối tắt</CardTitle>
              <CardDescription>Các khu vực học tập và quản lý của bạn</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-3">
                {navItems.map((item) =>
                  item.href && !item.disabled ? (
                    <li key={item.label}>
                      <Link
                        href={item.href as any}
                        className="flex items-center justify-between rounded-xl border border-border p-3 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-medium">{item.label}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3 text-sm"
                    >
                      <span className={item.disabled ? "text-muted-foreground" : "font-medium"}>
                        {item.label}
                      </span>
                      {item.disabled && (
                        <span className="text-xs rounded bg-muted px-2 py-0.5 text-muted-foreground">
                          Sắp ra mắt
                        </span>
                      )}
                    </li>
                  )
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Dashboard(props: {
  session: typeof authClient.$Infer.Session;
  roles?: string[];
  navItems?: DashboardNavItem[];
}) {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted-foreground">
          Đang tải Bàn làm việc...
        </div>
      }
    >
      <DashboardInner {...props} />
    </Suspense>
  );
}
