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
import { useRef, useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { passwordRecoveryError } from "@/lib/password-recovery-error";
import PasswordRecoveryForm from "@/components/settings/password-recovery-form";

export default function ChangePasswordCard({ onBusyChange }: { onBusyChange?: (busy: boolean) => void } = {}) {
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const sendingRef = useRef(false);

  async function startRecovery() {
    if (sendingRef.current || form.state.isSubmitting) return;
    sendingRef.current = true;
    setSending(true);
    onBusyChange?.(true);
    setRecoveryError("");
    try {
      const result = await authClient.$fetch<{ email: string }>("/account/password/request-reset", { method: "POST", body: {} });
      if (result.error || !result.data) {
        setRecoveryError(passwordRecoveryError(result.error ?? {}, "Không thể gửi mã xác thực. Vui lòng thử lại sau."));
        return;
      }
      setRecoveryEmail(result.data.email);
    } catch {
      setRecoveryError("Không thể gửi mã xác thực. Vui lòng thử lại sau.");
    } finally {
      sendingRef.current = false;
      setSending(false);
      onBusyChange?.(false);
    }
  }
  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value, formApi }) => {
      if (sendingRef.current) return;
      if (value.newPassword !== value.confirmPassword) {
        toast.error("Mật khẩu mới và mật khẩu xác nhận không khớp!");
        return;
      }

      onBusyChange?.(true);
      try {
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
      } finally {
        onBusyChange?.(false);
      }
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

  if (recoveryEmail) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Xác thực email</CardTitle><CardDescription>Khôi phục mật khẩu bằng email đang liên kết với tài khoản.</CardDescription></CardHeader>
        <CardContent><PasswordRecoveryForm email={recoveryEmail} onBusyChange={onBusyChange} onBack={() => setRecoveryEmail(null)} /></CardContent>
      </Card>
    );
  }

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
              <Button type="submit" disabled={!canSubmit || isSubmitting || sending}>
                {isSubmitting ? "Đang lưu thay đổi..." : "Cập nhật mật khẩu"}
              </Button>
            )}
          </form.Subscribe>
        </form>
        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Không nhớ mật khẩu hiện tại? Nhận mã xác thực qua email đang liên kết với tài khoản để đặt mật khẩu mới.</p>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => <Button type="button" variant="link" disabled={sending || isSubmitting} onClick={() => void startRecovery()} className="h-auto p-0 text-sm">{sending ? "Đang gửi mã..." : "Quên mật khẩu hiện tại?"}</Button>}
          </form.Subscribe>
          {recoveryError && <p role="alert" className="text-sm text-destructive">{recoveryError}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
