"use client";

import { Button } from "@codi-1/ui/components/button";
import { Clock, RefreshCw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (otp: string) => void;
  onResend?: () => Promise<void> | void;
  disabled?: boolean;
  expiresInSeconds?: number;
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
  onResend,
  disabled = false,
  expiresInSeconds = 120, // 2 minutes default
}: OtpInputProps) {
  const [timeLeft, setTimeLeft] = useState(expiresInSeconds);
  const [isResending, setIsResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Array of digits from value
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  // Countdown timer effect
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  const handleChange = (index: number, char: string) => {
    const clean = char.replace(/\D/g, "");
    if (!clean) {
      // Empty/Delete
      const nextDigits = [...digits];
      nextDigits[index] = "";
      onChange(nextDigits.join(""));
      return;
    }

    // Handle paste multiple digits
    if (clean.length > 1) {
      const pasted = clean.slice(0, length);
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, length - 1);
      inputsRef.current[nextIndex]?.focus();
      return;
    }

    // Single digit input
    const nextDigits = [...digits];
    nextDigits[index] = clean[0];
    onChange(nextDigits.join(""));

    // Move to next input
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextIndex = Math.min(pastedData.length, length - 1);
      inputsRef.current[nextIndex]?.focus();
    }
  };

  const handleResendClick = async () => {
    if (!onResend || isResending) return;
    try {
      setIsResending(true);
      await onResend();
      setTimeLeft(expiresInSeconds);
      onChange("");
      inputsRef.current[0]?.focus();
    } finally {
      setIsResending(false);
    }
  };

  const isExpired = timeLeft === 0;

  return (
    <div className="space-y-4">
      {/* 6 Digit Input Slots */}
      <div className="flex justify-center items-center gap-2 sm:gap-3">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputsRef.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={digit}
            disabled={disabled || isExpired}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold font-mono rounded-lg border border-border bg-card text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
        ))}
      </div>

      {/* Countdown Timer & Resend Controls */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-1.5 font-medium">
          <Clock className={`w-3.5 h-3.5 ${isExpired ? "text-destructive" : "text-primary"}`} />
          {isExpired ? (
            <span className="text-destructive font-semibold">Mã OTP đã hết hạn (2 phút)</span>
          ) : (
            <span>
              Mã còn hiệu lực trong: <strong className="text-foreground font-mono">{formatTime(timeLeft)}</strong>
            </span>
          )}
        </div>

        {onResend && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResendClick}
            disabled={isResending || !isExpired && timeLeft > expiresInSeconds - 30}
            className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isResending ? "animate-spin" : ""}`} />
            {isResending ? "Đang gửi..." : "Gửi lại mã"}
          </Button>
        )}
      </div>
    </div>
  );
}
