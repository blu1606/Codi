"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Ban, ShieldCheck, AlertTriangle, X } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { Textarea } from "@codi-1/ui/components/textarea";

import { toggleUserBan } from "../actions";

export default function BanToggle({
  userId,
  isBanned,
  banReason,
  isSelf,
}: {
  userId: string;
  isBanned: boolean;
  banReason?: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const handleUnban = () => {
    startTransition(async () => {
      try {
        await toggleUserBan(userId, false);
        toast.success("Da mo khoa tai khoan nguoi dung.");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Khong the mo khoa tai khoan.");
      }
    });
  };

  const handleBan = () => {
    startTransition(async () => {
      try {
        await toggleUserBan(userId, true, reason || undefined);
        toast.success("Da khoa tai khoan va thu hoi phien dang nhap.");
        setConfirming(false);
        setReason("");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Khong the khoa tai khoan.");
      }
    });
  };

  if (isSelf) {
    return <span className="text-xs text-muted-foreground italic">Tai khoan cua ban</span>;
  }

  if (isBanned) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
          <Ban className="h-3 w-3" />
          Da khoa
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleUnban}
          className="h-7 text-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
          {isPending ? "Dang mo..." : "Mo khoa"}
        </Button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2 w-64">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Xac nhan khoa TK?
          </span>
          <button
            type="button"
            onClick={() => { setConfirming(false); setReason(""); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <Textarea
          placeholder="Ly do khoa (tuy chon)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={handleBan}
            className="flex-1 h-7 text-xs"
          >
            {isPending ? "Dang khoa..." : "Xac nhan khoa"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setConfirming(false); setReason(""); }}
            className="h-7 text-xs"
          >
            Huy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
      onClick={() => setConfirming(true)}
    >
      <Ban className="h-3.5 w-3.5 mr-1" />
      Khoa TK
    </Button>
  );
}
