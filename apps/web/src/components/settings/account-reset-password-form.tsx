"use client";

import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { passwordRecoveryError } from "@/lib/password-recovery-error";

export default function AccountResetPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    async function checkVerification() {
      try {
        const result = await authClient.$fetch<{ email: string }>("/account/password/reset-status", { method: "GET" });
        if (!active) return;
        if (result.error) {
          setError(passwordRecoveryError(result.error, "Không thể kiểm tra xác thực. Vui lòng thử lại từ phần Cài đặt."));
        } else if (result.data) {
          setEmail(result.data.email);
        }
      } catch {
        if (active) setError("Không thể kết nối. Vui lòng thử lại từ phần Cài đặt.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void checkVerification();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !email) return;
    setError(null);
    if (password.length < 8 || password.length > 128) {
      setError("Mật khẩu mới phải có từ 8 đến 128 ký tự.");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const result = await authClient.$fetch("/account/password/reset", { method: "POST", body: { newPassword: password } });
      if (result.error) {
        const failure = result.error as typeof result.error & { code?: string };
        setError(passwordRecoveryError(failure, "Không thể đặt lại mật khẩu. Vui lòng thử lại."));
        if (["INVALID_RESET_GRANT", "INVALID_TOKEN"].includes(failure.code ?? "") || failure.status === 401) setEmail(null);
        return;
      }
      authClient.$store.notify("$sessionSignal");
      toast.success("Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.");
      router.replace("/login");
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Đặt mật khẩu mới</CardTitle>
        <CardDescription className="break-all">
          {loading ? "Đang kiểm tra xác thực…" : email ? `Email đã được xác thực: ${email}` : "Vui lòng xác thực email trong phần Cài đặt trước khi đặt mật khẩu mới."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {!loading && (email ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Mật khẩu mới</Label>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required autoFocus disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Xác nhận mật khẩu mới</Label>
              <Input id="confirm-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</Button>
            <p className="text-xs text-muted-foreground">Sau khi đổi mật khẩu, bạn sẽ được đăng xuất khỏi các thiết bị.</p>
          </form>
        ) : <Button render={<Link href="/settings" />} nativeButton={false} className="w-full">Quay lại Cài đặt</Button>)}
      </CardContent>
    </Card>
  );
}
