"use client";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";

import OtpInput from "@/components/otp-input";
import { authClient } from "@/lib/auth-client";

function getErrorMessage(error: { code?: string; status?: number }, sending: boolean) {
  const messages: Record<string, string> = {
    INVALID_EMAIL: "Địa chỉ email không hợp lệ.",
    EMAIL_UNAVAILABLE: "Email này đã được liên kết với một tài khoản khác. Vui lòng sử dụng email khác.",
    INVALID_OTP: "Mã xác thực không đúng. Vui lòng kiểm tra lại.",
    OTP_EXPIRED: "Mã xác thực đã hết hạn. Vui lòng gửi lại mã.",
    TOO_MANY_ATTEMPTS: "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.",
    SESSION_NOT_FRESH: "Vui lòng đăng nhập lại trước khi đổi email.",
  };
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 401) return "Vui lòng đăng nhập lại trước khi đổi email.";
  if (error.status === 429) return "Bạn thao tác quá nhanh. Vui lòng chờ một phút rồi thử lại.";
  return sending ? "Không thể gửi mã xác thực. Vui lòng thử lại sau." : "Không thể cập nhật email. Vui lòng kiểm tra mã hoặc thử lại sau.";
}

export default function ChangeEmailForm({ currentEmail, onSuccess, onBusyChange }: {
  currentEmail: string;
  onSuccess: (email: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [draftEmail, setDraftEmail] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  function setPending(pending: boolean) {
    busyRef.current = pending;
    setBusy(pending);
    onBusyChange(pending);
  }

  async function sendCode() {
    if (busyRef.current) return false;
    const newEmail = destination ?? draftEmail.trim().toLowerCase();
    if (!z.email().safeParse(newEmail).success) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
      return false;
    }
    if (newEmail === currentEmail.toLowerCase()) {
      setError("Email mới phải khác email hiện tại.");
      return false;
    }
    setPending(true);
    setError("");
    try {
      const result = await authClient.emailOtp.requestEmailChange({ newEmail });
      if (result.error) {
        setError(getErrorMessage(result.error, true));
        return false;
      }
      setDestination(newEmail);
      setOtp("");
      return true;
    } catch {
      setError("Không thể gửi mã xác thực. Vui lòng thử lại sau.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!destination) {
      await sendCode();
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Vui lòng nhập đủ 6 chữ số xác thực.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await authClient.emailOtp.changeEmail({ newEmail: destination, otp });
      if (result.error) {
        setError(getErrorMessage(result.error, false));
        return;
      }
      authClient.$store.notify("$sessionSignal");
      onSuccess(destination);
    } catch {
      setError("Không thể cập nhật email. Vui lòng thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      {destination ? (
        <>
          <p className="break-words text-sm text-muted-foreground">Kiểm tra hộp thư <strong className="text-foreground">{destination}</strong> và nhập mã xác thực gồm 6 chữ số.</p>
          <OtpInput value={otp} onChange={setOtp} onResend={sendCode} disabled={busy} expiresInSeconds={120} autoFocus />
          <button type="button" disabled={busy} onClick={() => { setDestination(null); setOtp(""); setError(""); }} className="rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">Nhập email khác</button>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="settings-new-email">Email mới</Label>
          <Input id="settings-new-email" type="email" autoComplete="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} placeholder="Nhập email mới của bạn" required disabled={busy} aria-invalid={!!error} aria-describedby={error ? "change-email-error" : undefined} className="h-10 rounded-lg" />
          <p className="text-xs text-muted-foreground">Email hiện tại giữ nguyên cho đến khi bạn xác thực email mới thành công.</p>
        </div>
      )}
      {error && <p id="change-email-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || (destination ? otp.length !== 6 : !draftEmail.trim())} className="h-10 w-full rounded-lg text-sm">
        {busy ? "Đang xử lý..." : destination ? "Xác nhận và cập nhật email" : "Gửi mã xác thực"}
      </Button>
    </form>
  );
}
