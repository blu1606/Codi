"use client";

import { Button } from "@codi-1/ui/components/button";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import OtpInput from "@/components/otp-input";
import { authClient } from "@/lib/auth-client";
import { passwordRecoveryError } from "@/lib/password-recovery-error";

export default function PasswordRecoveryForm({ email, onBack, onBusyChange }: {
  email: string;
  onBack: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState(email);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  function setPending(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  }

  async function resend() {
    if (busyRef.current) return false;
    setPending(true);
    setError("");
    try {
      const result = await authClient.$fetch<{ email: string }>("/account/password/request-reset", { method: "POST", body: {} });
      if (result.error || !result.data) {
        setError(passwordRecoveryError(result.error ?? {}, "Không thể gửi mã xác thực. Vui lòng thử lại sau."));
        return false;
      }
      setDestination(result.data.email);
      return true;
    } catch {
      setError("Không thể gửi mã xác thực. Vui lòng thử lại sau.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !/^\d{6}$/.test(otp)) return;
    setPending(true);
    setError("");
    try {
      const result = await authClient.$fetch("/account/password/verify-reset", { method: "POST", body: { otp } });
      if (result.error) {
        setError(passwordRecoveryError(result.error, "Không thể xác thực mã. Vui lòng thử lại sau."));
        return;
      }
      router.push("/reset-password?source=account");
    } catch {
      setError("Không thể xác thực mã. Vui lòng thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      <p className="break-words text-sm text-muted-foreground">Nhập mã 6 số đã gửi đến <strong className="text-foreground">{destination}</strong> để tiếp tục đặt mật khẩu mới.</p>
      <OtpInput value={otp} onChange={setOtp} onResend={resend} disabled={busy} expiresInSeconds={120} autoFocus />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || otp.length !== 6} className="h-10 w-full rounded-lg text-sm">{busy ? "Đang xác thực..." : "Xác thực mã và tiếp tục"}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack} className="w-full rounded-lg">Quay lại đổi mật khẩu</Button>
    </form>
  );
}
