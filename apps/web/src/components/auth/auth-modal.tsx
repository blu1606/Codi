"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { authClient } from "@/lib/auth-client";
import GitHubSignInButton from "../github-button";
import GoogleSignInButton from "../google-button";
import OtpInput from "../otp-input";
import { toast } from "sonner";

const REMEMBER_EMAIL_KEY = "codi_remember_email";

export interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intentReason?: string;
  courseTitle?: string;
  onSuccess: () => void;
}

export default function AuthModal({
  open,
  onOpenChange,
  intentReason,
  courseTitle,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "otp">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // OTP state
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeactivated, setIsDeactivated] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setIsDeactivated(false);
      try {
        const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch {
        // Ignore localStorage error
      }
    }
  }, [open]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    setLoading(true);
    setError(null);
    setIsDeactivated(false);

    try {
      await authClient.signIn.email(
        { email, password },
        {
          onSuccess: () => {
            try {
              if (rememberMe) {
                localStorage.setItem(REMEMBER_EMAIL_KEY, email);
              } else {
                localStorage.removeItem(REMEMBER_EMAIL_KEY);
              }
            } catch {
              // Ignore
            }
            try {
              authClient.$store.notify("$sessionSignal");
            } catch {
              // Ignore if store not available
            }
            toast.success("Đăng nhập thành công!");
            onSuccess();
          },
          onError: (ctx) => {
            const msg = ctx.error.message || "Email hoặc mật khẩu không chính xác.";
            const lower = msg.toLowerCase();
            if (lower.includes("banned") || lower.includes("vô hiệu") || lower.includes("deactivat")) {
              setIsDeactivated(true);
              setError("Tài khoản của bạn đã bị vô hiệu hoá. Vui lòng liên hệ ban quản trị để được hỗ trợ.");
            } else {
              setError(msg);
            }
          },
        }
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Vui lòng điền đầy đủ họ tên, email và mật khẩu.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authClient.signUp.email(
        { email, password, name },
        {
          onSuccess: () => {
            toast.success("Đăng ký thành công! Mã OTP xác thực 6 số đã được gửi đến email.");
            setMode("otp");
            setCountdown(60);
          },
          onError: (ctx) => {
            setError(ctx.error.message || "Đăng ký thất bại. Vui lòng thử lại.");
          },
        }
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể tạo tài khoản.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Vui lòng nhập đủ 6 chữ số OTP.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authClient.emailOtp.verifyEmail(
        { email, otp },
        {
          onSuccess: () => {
            try {
              authClient.$store.notify("$sessionSignal");
            } catch {
              // Ignore if store not available
            }
            toast.success("Xác thực email thành công!");
            onSuccess();
          },
          onError: (ctx) => {
            setError(ctx.error.message || "Mã OTP không chính xác hoặc đã hết hạn.");
          },
        }
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Xác thực OTP thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    try {
      await authClient.emailOtp.sendVerificationOtp(
        { email, type: "email-verification" },
        {
          onSuccess: () => {
            toast.success("Đã gửi lại mã OTP mới vào hộp thư của bạn.");
            setCountdown(60);
          },
          onError: (ctx) => {
            setError(ctx.error.message || "Không thể gửi lại mã OTP.");
          },
        }
      );
    } catch {
      setError("Không thể gửi lại mã OTP. Vui lòng thử lại sau.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
        <DialogHeader className="space-y-1.5 pb-2 text-left">
          <DialogTitle className="text-xl font-bold tracking-tight">
            {mode === "signin"
              ? "Đăng nhập"
              : mode === "signup"
              ? "Tạo tài khoản"
              : "Nhập mã xác thực"}
          </DialogTitle>
        </DialogHeader>

        {/* Course Context Card (Flow L2, S03) */}
        {courseTitle && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground">
            <span className="text-muted-foreground block mb-0.5">
              {mode === "signin" ? "Đăng nhập để tiếp tục" : "Tạo tài khoản để tiếp tục"}
            </span>
            <strong className="text-sm font-semibold text-foreground line-clamp-1">
              {courseTitle}
            </strong>
            {intentReason && (
              <p className="text-muted-foreground mt-1.5 leading-relaxed">
                {intentReason}
              </p>
            )}
          </div>
        )}

        {/* Deactivated Account Alert */}
        {isDeactivated && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive space-y-1"
          >
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Tài khoản đã bị vô hiệu hoá</span>
            </div>
            <p>
              Tài khoản của bạn hiện đang bị vô hiệu hoá. Vui lòng liên hệ ban quản trị tại{" "}
              <strong className="underline">support@codi.vn</strong> để được giải quyết.
            </p>
          </div>
        )}

        {/* Standard Error Alert */}
        {error && !isDeactivated && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MODE 1: SIGN IN */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="auth-modal-email">Email</Label>
              <Input
                id="auth-modal-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="auth-modal-password">Mật khẩu</Label>
                <Link
                  href="/forgot-password"
                  className="text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="auth-modal-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="auth-modal-remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                disabled={loading}
              />
              <Label htmlFor="auth-modal-remember" className="text-xs text-muted-foreground font-normal cursor-pointer">
                Ghi nhớ đăng nhập
              </Label>
            </div>

            <Button type="submit" disabled={loading} className="w-full cursor-pointer">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng nhập…
                </>
              ) : (
                "Đăng nhập"
              )}
            </Button>

            <div className="relative my-3 text-center text-xs">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative bg-card px-2 text-muted-foreground">
                Hoặc tiếp tục với
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <GitHubSignInButton />
              <GoogleSignInButton />
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Chưa có tài khoản?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setIsDeactivated(false);
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                Đăng ký ngay
              </button>
            </p>
          </form>
        )}

        {/* MODE 2: SIGN UP */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="auth-modal-name">Họ và tên</Label>
              <Input
                id="auth-modal-name"
                type="text"
                placeholder="Nguyễn Văn A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-modal-signup-email">Email</Label>
              <Input
                id="auth-modal-signup-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-modal-signup-password">Mật khẩu (tối thiểu 8 ký tự)</Label>
              <div className="relative">
                <Input
                  id="auth-modal-signup-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full cursor-pointer">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tạo tài khoản…
                </>
              ) : (
                "Tạo tài khoản"
              )}
            </Button>

            <div className="relative my-3 text-center text-xs">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative bg-card px-2 text-muted-foreground">
                Hoặc tiếp tục với
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <GitHubSignInButton />
              <GoogleSignInButton />
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Đã có tài khoản?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setIsDeactivated(false);
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                Đăng nhập
              </button>
            </p>
          </form>
        )}

        {/* MODE 3: OTP VERIFICATION */}
        {mode === "otp" && (
          <div className="space-y-5 pt-1 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Mã xác thực gồm 6 chữ số đã được gửi đến:</p>
              <div className="flex items-center justify-center gap-1.5 font-medium text-foreground">
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-primary hover:underline"
                >
                  (Sửa)
                </button>
              </div>
            </div>

            <div className="flex justify-center py-2">
              <OtpInput length={6} value={otp} onChange={setOtp} />
            </div>

            <Button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xác thực…
                </>
              ) : (
                "Xác nhận OTP"
              )}
            </Button>

            <div className="text-xs text-muted-foreground">
              {countdown > 0 ? (
                <span>Gửi lại mã sau {countdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="font-medium text-primary hover:underline cursor-pointer"
                >
                  Gửi lại mã OTP
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
