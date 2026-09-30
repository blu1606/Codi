"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Ban, ShieldCheck } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@codi-1/ui/components/dialog";
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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(banReason ?? "");

  const handleUnban = () => {
    startTransition(async () => {
      try {
        await toggleUserBan(userId, false);
        toast.success("Đã mở khóa tài khoản người dùng.");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Không thể mở khóa tài khoản.");
      }
    });
  };

  const handleBan = () => {
    startTransition(async () => {
      try {
        await toggleUserBan(userId, true, reason || undefined);
        toast.success("Đã khóa tài khoản và thu hồi phiên đăng nhập.");
        setOpen(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Không thể khóa tài khoản.");
      }
    });
  };

  if (isSelf) {
    return (
      <span className="text-xs text-muted-foreground italic">Tài khoản của bạn</span>
    );
  }

  if (isBanned) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <Ban className="h-3 w-3" />
          Đã khóa
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleUnban}
          className="h-7 text-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
          {isPending ? "Đang mở..." : "Mở khóa"}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={isPending}
        >
          <Ban className="h-3.5 w-3.5 mr-1" />
          Khóa TK
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận khóa tài khoản</DialogTitle>
          <DialogDescription>
            Hành động này sẽ khóa tài khoản và thu hồi toàn bộ phiên đăng nhập của người dùng ngay lập tức.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Lý do khóa (tùy chọn)</label>
          <Textarea
            placeholder="Ví dụ: Vi phạm nội quy, hành vi gian lận..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={handleBan} disabled={isPending}>
            {isPending ? "Đang khóa..." : "Xác nhận khóa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
