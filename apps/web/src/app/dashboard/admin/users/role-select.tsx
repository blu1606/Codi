"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@codi-1/ui/components/button";
import type { RoleId } from "@codi-1/auth";

import { updateUserRole } from "../actions";

const ROLE_OPTIONS: { value: RoleId; label: string }[] = [
  { value: "LEARNER", label: "Learner" },
  { value: "LECTURER", label: "Lecturer" },
  { value: "ADMIN", label: "Admin" },
];

export default function RoleSelect({
  userId,
  currentRoleId,
}: {
  userId: string;
  currentRoleId: RoleId;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<RoleId>(currentRoleId);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (selected === currentRoleId) return;
    startTransition(async () => {
      try {
        await updateUserRole(userId, selected);
        toast.success("Đã cập nhật vai trò người dùng.");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Không thể cập nhật vai trò.");
        setSelected(currentRoleId);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as RoleId)}
        disabled={isPending}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
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
        disabled={isPending || selected === currentRoleId}
        onClick={handleSave}
      >
        {isPending ? "Đang lưu..." : "Lưu"}
      </Button>
    </div>
  );
}
