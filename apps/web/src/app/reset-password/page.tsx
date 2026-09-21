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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import Loader from "@/components/loader";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error("Mã token khôi phục không tồn tại hoặc đã hết hạn.");
        return;
      }

      if (value.password !== value.confirmPassword) {
        toast.error("Mật khẩu xác nhận không khớp!");
        return;
      }

      await authClient.resetPassword(
        {
          newPassword: value.password,
          token,
        },
        {
          onSuccess: () => {
            toast.success("Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...");
            setTimeout(() => {
              router.push("/login");
            }, 1500);
          },
          onError: (ctx) => {
            const err = ctx.error.message || "Không thể đặt lại mật khẩu. Token có thể đã hết hạn.";
            setErrorMsg(err);
            toast.error(err);
          },
        }
      );
    },
    validators: {
      onSubmit: z
        .object({
          password: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
          confirmPassword: z.string().min(8, "Vui lòng nhập lại mật khẩu"),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Mật khẩu xác nhận không khớp",
          path: ["confirmPassword"],
        }),
    },
  });

  if (!token) {
    return (
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl text-destructive">Liên kết không hợp lệ</CardTitle>
          <CardDescription>
            Không tìm thấy mã token đặt lại mật khẩu trong liên kết. Vui lòng kiểm tra lại liên kết trong email của bạn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={"/forgot-password" as any}>
            <Button className="w-full">Yêu cầu liên kết mới</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Đặt lại mật khẩu</CardTitle>
        <CardDescription>Tạo mật khẩu mới cho tài khoản của bạn</CardDescription>
      </CardHeader>

      <CardContent>
        {errorMsg && (
          <div className="p-3 mb-4 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <form.Field name="password">
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
            </form.Field>
          </div>

          <div>
            <form.Field name="confirmPassword">
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
            </form.Field>
          </div>

          <form.Subscribe
            selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Suspense fallback={<Loader />}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
