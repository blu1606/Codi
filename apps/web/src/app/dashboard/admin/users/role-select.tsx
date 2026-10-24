"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import type { RoleId } from "@codi-1/auth";

import { updateUserRole } from "../actions";

const ROLE_OPTIONS: { value: RoleId; label: string }[] = [
  { value: "LEARNER", label: "Learner" },
  { value: "LECTURER", label: "Lecturer" },
  { value: "ADMIN", label: "Admin" },
];

const ROLE_DESCRIPTIONS: Record<RoleId, string> = {
  LEARNER: "chỉ học và mua khoá học",
  LECTURER: "tạo và quản lý khoá học của mình, chấm bài",
  ADMIN: "toàn quyền quản trị (người dùng, giá, đơn hàng)",
};

export default function RoleSelect({
  userId,
  currentRoleId,
  userName = "người dùng",
  disabled = false,
}: {
  userId: string;
  currentRoleId: RoleId;
  userName?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<RoleId>(currentRoleId);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleOpenConfirm = () => {
    if (selected === currentRoleId) return;
    setShowConfirm(true);
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setSelected(currentRoleId);
  };

  const handleConfirmChange = () => {
    startTransition(async () => {
      try {
        await updateUserRole(userId, selected);
        toast.success("Đã cập nhật vai trò người dùng.");
        setShowConfirm(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Không thể cập nhật vai trò.");
        setSelected(currentRoleId);
        setShowConfirm(false);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as RoleId)}
          disabled={disabled || isPending}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || isPending || selected === currentRoleId}
          onClick={handleOpenConfirm}
        >
          {isPending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>

      <Dialog open={showConfirm} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi vai trò của {userName}?</DialogTitle>
            <DialogDescription>
              {currentRoleId} → {selected}. Người dùng sẽ {ROLE_DESCRIPTIONS[selected] || selected}. Thay đổi có hiệu lực ở lần tải trang tiếp theo của họ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleCancel}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleConfirmChange}
            >
              {isPending ? "Đang cập nhật..." : "Đổi vai trò"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

