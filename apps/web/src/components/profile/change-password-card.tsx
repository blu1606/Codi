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
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export default function ChangePasswordCard() {
  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value, formApi }) => {
      if (value.newPassword !== value.confirmPassword) {
        toast.error("Mật khẩu mới và mật khẩu xác nhận không khớp!");
        return;
      }

      await authClient.changePassword(
        {
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
          revokeOtherSessions: true,
        },
        {
          onSuccess: () => {
            toast.success("Đổi mật khẩu thành công! Các phiên đăng nhập khác đã được đăng xuất.");
            formApi.reset();
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Đổi mật khẩu thất bại. Vui lòng kiểm tra mật khẩu hiện tại.");
          },
        }
      );
    },
    validators: {
      onSubmit: z
        .object({
          currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
          newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
          confirmPassword: z.string().min(8, "Vui lòng nhập lại mật khẩu mới"),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: "Mật khẩu xác nhận không khớp",
          path: ["confirmPassword"],
        }),
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Đổi mật khẩu</CardTitle>
        </div>
        <CardDescription>Cập nhật mật khẩu bảo mật cho tài khoản của bạn.</CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="max-w-md space-y-4"
        >
          <div>
            <form.Field name="currentPassword">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Mật khẩu hiện tại</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    placeholder="••••••••"
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
            <form.Field name="newPassword">
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

          <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {({ canSubmit, isSubmitting }) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Đang lưu thay đổi..." : "Cập nhật mật khẩu"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
