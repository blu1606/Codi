"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Ban, ShieldCheck, BookOpen, Receipt, Presentation } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";

import { getUserImpactCounts, toggleUserBan, type UserImpactCounts } from "../actions";

export default function BanToggle({
  userId,
  userName = "người dùng",
  userEmail = "",
  isBanned,
  banReason,
  isSelf,
}: {
  userId: string;
  userName?: string;
  userEmail?: string;
  isBanned: boolean;
  banReason?: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Deactivation dialog state
  const [deactOpen, setDeactOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [consented, setConsented] = useState(false);
  const [impactCounts, setImpactCounts] = useState<UserImpactCounts>({
    ownedCourses: 0,
    pendingOrders: 0,
    taughtCourses: 0,
  });
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Reactivation dialog state
  const [reactOpen, setReactOpen] = useState(false);

  const openDeactivationDialog = async () => {
    setReason("");
    setConsented(false);
    setDeactOpen(true);
    setLoadingImpact(true);
    try {
      const counts = await getUserImpactCounts(userId);
      setImpactCounts(counts);
    } catch {
      // Default fallback
      setImpactCounts({ ownedCourses: 0, pendingOrders: 0, taughtCourses: 0 });
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleDeactivate = () => {
    if (!reason.trim() || !consented) return;
    startTransition(async () => {
      try {
        await toggleUserBan(userId, true, reason.trim());
        toast.success(`Đã vô hiệu hoá ${userName}.`);
        setDeactOpen(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Không thể vô hiệu hoá tài khoản.");
      }
    });
  };

  const handleReactivate = () => {
    startTransition(async () => {
      try {
        await toggleUserBan(userId, false);
        toast.success(`Đã kích hoạt lại ${userName}.`);
        setReactOpen(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Không thể kích hoạt lại tài khoản.");
      }
    });
  };

  if (isSelf) {
    return <span className="text-xs text-muted-foreground italic">Tài khoản của bạn</span>;
  }

  if (isBanned) {
    return (
      <>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            <Ban className="h-3 w-3" />
            Đã vô hiệu hoá
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setReactOpen(true)}
            className="h-7 text-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            {isPending ? "Đang xử lý..." : "Kích hoạt lại"}
          </Button>
        </div>

        {/* Reactivation Dialog */}
        <Dialog open={reactOpen} onOpenChange={(open) => { if (!isPending) setReactOpen(open); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Kích hoạt lại {userName}?</DialogTitle>
              <DialogDescription>
                Người dùng đăng nhập lại được và truy cập toàn bộ dữ liệu cũ.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setReactOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleReactivate}
              >
                {isPending ? "Đang xử lý..." : "Kích hoạt lại"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const isConfirmDisabled = isPending || loadingImpact || !consented || !reason.trim();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={openDeactivationDialog}
      >
        <Ban className="h-3.5 w-3.5 mr-1" />
        Vô hiệu hoá
      </Button>

      {/* Deactivation Dialog */}
      <Dialog open={deactOpen} onOpenChange={(open) => { if (!isPending) setDeactOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vô hiệu hoá {userName}?</DialogTitle>
            <DialogDescription className="space-y-1">
              <span>
                Tài khoản bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập. Dữ liệu học tập và đơn hàng được giữ nguyên. Có thể kích hoạt lại bất cứ lúc nào.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}

            {/* Impact counts */}
            <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <BookOpen className="h-4 w-4 text-primary" />
                <span>
                  <strong>{impactCounts.ownedCourses}</strong> khoá học đang sở hữu
                </span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Receipt className="h-4 w-4 text-primary" />
                <span>
                  <strong>{impactCounts.pendingOrders}</strong> đơn hàng chờ thanh toán
                </span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Presentation className="h-4 w-4 text-primary" />
                <span>
                  Đang giảng dạy <strong>{impactCounts.taughtCourses}</strong> khoá học
                </span>
              </div>
            </div>

            {/* Required Reason */}
            <div className="space-y-1.5">
              <label htmlFor="deact-reason" className="text-xs font-semibold text-foreground">
                Lý do (chỉ quản trị viên xem được) <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="deact-reason"
                placeholder="Ví dụ: vi phạm điều khoản dịch vụ, spam..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={isPending}
                className="text-sm"
              />
            </div>

            {/* Acknowledgment Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="consent-check"
                checked={consented}
                onCheckedChange={(checked) => setConsented(!!checked)}
                disabled={isPending}
              />
              <label
                htmlFor="consent-check"
                className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
              >
                Tôi hiểu tác động
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setDeactOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isConfirmDisabled}
              onClick={handleDeactivate}
            >
              {isPending ? "Đang xử lý..." : "Vô hiệu hoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

