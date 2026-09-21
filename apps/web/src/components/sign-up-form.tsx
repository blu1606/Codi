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
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import GoogleSignInButton from "./google-button";
import Loader from "./loader";
import OtpInput from "./otp-input";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            setSignedUpEmail(value.email);
            toast.success("Đăng ký thành công! Mã OTP xác thực 6 số đã được gửi.");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText || "Đăng ký thất bại");
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Tên người dùng phải có ít nhất 2 ký tự"),
        email: z.email("Địa chỉ email không hợp lệ"),
        password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
      }),
    },
  });

  const handleVerifyOtp = async () => {
    if (!signedUpEmail) return;
    if (otp.length !== 6) {
      toast.error("Vui lòng nhập đủ 6 chữ số OTP");
      return;
    }

    try {
      setVerifying(true);
      await authClient.emailOtp.verifyEmail(
        {
          email: signedUpEmail,
          otp,
        },
        {
          onSuccess: () => {
            toast.success("Xác thực email thành công! Đang chuyển hướng vào hệ thống...");
            setTimeout(() => {
              router.push("/dashboard");
            }, 1000);
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Mã OTP không chính xác hoặc đã hết hạn 2 phút.");
          },
        }
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!signedUpEmail) return;
    await authClient.emailOtp.sendVerificationOtp(
      {
        email: signedUpEmail,
        type: "email-verification",
      },
      {
        onSuccess: () => {
          toast.success("Đã gửi mã OTP mới! Vui lòng kiểm tra email.");
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || "Không thể gửi lại mã OTP lúc này.");
        },
      }
    );
  };

  if (isPending) {
    return <Loader />;
  }

  // Step 2: OTP Verification Screen
  if (signedUpEmail) {
    return (
      <div className="mx-auto w-full mt-10 max-w-md p-4">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Xác thực tài khoản</CardTitle>
            <CardDescription className="text-xs/relaxed">
              Mã OTP gồm 6 chữ số đã được gửi tới email <strong>{signedUpEmail}</strong>. Mã có hiệu lực trong 2 phút.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <OtpInput
              length={6}
              value={otp}
              onChange={setOtp}
              onResend={handleResendOtp}
              expiresInSeconds={120}
              disabled={verifying}
            />

            <Button
              type="button"
              className="w-full"
              disabled={otp.length !== 6 || verifying}
              onClick={handleVerifyOtp}
            >
              {verifying ? "Đang xác thực..." : "Xác thực và hoàn tất"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              <span>Nhập nhầm email? </span>
              <Button
                variant="link"
                size="sm"
                onClick={() => setSignedUpEmail(null)}
                className="p-0 text-xs text-primary font-semibold hover:underline"
              >
                Đăng ký lại
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 1: Sign Up Form
  return (
    <div className="mx-auto w-full mt-10 max-w-md p-4">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Tạo tài khoản</CardTitle>
          <CardDescription>Đăng ký tài khoản Codi mới</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <GoogleSignInButton text="Đăng ký với Google" />

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Hoặc đăng ký bằng Email</span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <form.Field name="name">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Họ và tên</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder="Nguyễn Văn A"
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
              </form.Field>
            </div>

            <div>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Email</Label>
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
              </form.Field>
            </div>

            <div>
              <form.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Mật khẩu</Label>
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
              </form.Field>
            </div>

            <form.Subscribe
              selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "Đang tạo tài khoản..." : "Đăng ký tài khoản"}
                </Button>
              )}
            </form.Subscribe>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            <span>Đã có tài khoản? </span>
            <Button
              variant="link"
              onClick={onSwitchToSignIn}
              className="p-0 text-xs text-primary font-semibold hover:underline"
            >
              Đăng nhập
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
