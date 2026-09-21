"use client";

import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import OtpInput from "@/components/otp-input";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [resetting, setResetting] = useState(false);

  // Step 1: Request OTP Form
  const requestForm = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.emailOtp.sendVerificationOtp(
        {
          email: value.email,
          type: "forget-password",
        },
        {
          onSuccess: () => {
            setSubmittedEmail(value.email);
            toast.success("Mã OTP gồm 6 chữ số đã được gửi tới email của bạn!");
          },
          onError: (ctx: { error?: { message?: string } }) => {
            toast.error(ctx.error?.message || "Không thể gửi mã OTP lúc này. Vui lòng thử lại.");
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Vui lòng nhập địa chỉ email hợp lệ"),
      }),
    },
  });

  // Step 2: Reset Password Form (with OTP)
  const resetForm = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (!submittedEmail) return;
      if (otp.length !== 6) {
        toast.error("Vui lòng nhập đủ 6 chữ số mã OTP");
        return;
      }
      if (value.password !== value.confirmPassword) {
        toast.error("Mật khẩu xác nhận không khớp!");
        return;
      }

      try {
        setResetting(true);
        await authClient.emailOtp.resetPassword(
          {
            email: submittedEmail,
            otp,
            password: value.password,
          },
          {
            onSuccess: () => {
              toast.success("Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...");
              setTimeout(() => {
                router.push("/login");
              }, 1200);
            },
            onError: (ctx: { error?: { message?: string } }) => {
              toast.error(ctx.error?.message || "Mã OTP không hợp lệ hoặc đã hết hạn 2 phút.");
            },
          }
        );
      } finally {
        setResetting(false);
      }
    },
    validators: {
      onSubmit: z
        .object({
          password: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
          confirmPassword: z.string().min(8, "Vui lòng xác nhận mật khẩu mới"),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Mật khẩu xác nhận không khớp",
          path: ["confirmPassword"],
        }),
    },
  });

  const handleResendOtp = async () => {
    if (!submittedEmail) return;
    await authClient.emailOtp.sendVerificationOtp(
      {
        email: submittedEmail,
        type: "forget-password",
      },
      {
        onSuccess: () => {
          toast.success("Đã gửi mã OTP mới! Vui lòng kiểm tra email.");
        },
        onError: (ctx: { error?: { message?: string } }) => {
          toast.error(ctx.error?.message || "Không thể gửi lại mã OTP lúc này.");
        },
      }
    );
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {submittedEmail ? (
          // Step 2: Enter OTP & New Password
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                <KeyRound className="w-6 h-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Đặt lại mật khẩu</CardTitle>
              <CardDescription className="text-xs/relaxed">
                Nhập mã OTP gồm 6 chữ số đã gửi tới <strong>{submittedEmail}</strong> (hiệu lực 2 phút) và tạo mật khẩu mới.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* OTP Input with 2m countdown */}
              <div>
                <Label className="text-xs text-muted-foreground block mb-2 text-center">
                  Mã xác thực OTP
                </Label>
                <OtpInput
                  length={6}
                  value={otp}
                  onChange={setOtp}
                  onResend={handleResendOtp}
                  expiresInSeconds={120}
                  disabled={resetting}
                />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  resetForm.handleSubmit();
                }}
                className="space-y-4 pt-2 border-t border-border"
              >
                <div>
                  <resetForm.Field name="password">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={field.name}>Mật khẩu mới</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="password"
                          placeholder="Ít nhất 8 ký tự"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        {field.state.meta.errors.map((error) => (
                          <p key={error?.message} className="text-xs text-destructive">
                            {error?.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </resetForm.Field>
                </div>

                <div>
                  <resetForm.Field name="confirmPassword">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={field.name}>Xác nhận mật khẩu mới</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="password"
                          placeholder="Nhập lại mật khẩu mới"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        {field.state.meta.errors.map((error) => (
                          <p key={error?.message} className="text-xs text-destructive">
                            {error?.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </resetForm.Field>
                </div>

                <resetForm.Subscribe
                  selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
                >
                  {({ canSubmit, isSubmitting }) => (
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!canSubmit || isSubmitting || resetting || otp.length !== 6}
                    >
                      {isSubmitting || resetting ? "Đang cập nhật..." : "Cập nhật mật khẩu mới"}
                    </Button>
                  )}
                </resetForm.Subscribe>
              </form>

              <div className="text-center text-xs text-muted-foreground">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setSubmittedEmail(null)}
                  className="p-0 text-xs text-primary font-semibold hover:underline"
                >
                  ← Đổi địa chỉ email khác
                </Button>
              </div>
            </CardContent>
          </>
        ) : (
          // Step 1: Enter Email
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                <Mail className="w-6 h-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Quên mật khẩu?</CardTitle>
              <CardDescription>
                Nhập email của bạn để nhận mã OTP 6 chữ số khôi phục mật khẩu.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  requestForm.handleSubmit();
                }}
                className="space-y-4"
              >
                <div>
                  <requestForm.Field name="email">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={field.name}>Email tài khoản</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="email"
                          placeholder="name@example.com"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        {field.state.meta.errors.map((error) => (
                          <p key={error?.message} className="text-xs text-destructive">
                            {error?.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </requestForm.Field>
                </div>

                <requestForm.Subscribe
                  selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
                >
                  {({ canSubmit, isSubmitting }) => (
                    <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                      {isSubmitting ? "Đang gửi mã OTP..." : "Nhận mã OTP qua Email"}
                    </Button>
                  )}
                </requestForm.Subscribe>
              </form>

              <div className="mt-6 text-center text-xs text-muted-foreground">
                <Link href={"/login" as any} className="text-primary hover:underline">
                  ← Quay lại trang Đăng nhập
                </Link>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
