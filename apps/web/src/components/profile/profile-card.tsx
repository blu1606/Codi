"use client";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import {
  AlertCircle,
  Calendar,
  Check,
  Edit3,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import AvatarPicker from "./avatar-picker";

const ROLE_LABEL: Record<string, string> = {
  LEARNER: "Learner",
  LECTURER: "Lecturer",
  ADMIN: "Admin",
};

interface ProfileCardProps {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt?: Date | string;
  };
  roles?: string[];
}

export default function ProfileCard({ user, roles = [] }: ProfileCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.image || null);
  const [saving, setSaving] = useState(false);

  const defaultAvatar =
    avatarUrl ||
    `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(name || "Codi")}`;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Họ và tên không được để trống");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể cập nhật hồ sơ");

      window.dispatchEvent(
        new CustomEvent("profile-name-updated", {
          detail: { name: name.trim(), userId: user.id },
        })
      );
      toast.success("Cập nhật thông tin hồ sơ thành công!");
      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi cập nhật hồ sơ");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdated = (newUrl: string) => {
    setAvatarUrl(newUrl);
    window.dispatchEvent(new CustomEvent("profile-avatar-updated", {
      detail: { userId: user.id, imageUrl: newUrl },
    }));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-6 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Chỉnh sửa hồ sơ</h2>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Ảnh đại diện (Cloudflare R2)
            </Label>
            <AvatarPicker
              currentAvatar={avatarUrl}
              userName={name}
              onAvatarUpdated={handleAvatarUpdated}
            />
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="space-y-4 border-t border-border pt-4"
          >
            <div className="max-w-md space-y-2">
              <Label htmlFor="displayName">Họ và tên</Label>
              <Input
                id="displayName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập họ và tên của bạn"
                disabled={saving}
              />
            </div>

            <div className="max-w-md space-y-2">
              <Label htmlFor="displayEmail">Email đăng ký</Label>
              <Input
                id="displayEmail"
                value={user.email}
                disabled
                className="bg-muted text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email là định danh tài khoản, không thể thay đổi trực tiếp.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Lưu thay đổi
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
              >
                Huỷ
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-full border border-border bg-muted shadow-sm">
            <Image
              src={defaultAvatar}
              alt={name || "Avatar"}
              fill
              sizes="320px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-semibold tracking-tight">{name}</h3>
              {roles.map((roleId) => (
                <span
                  key={roleId}
                  className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                >
                  {ROLE_LABEL[roleId] ?? roleId}
                </span>
              ))}
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Đã xác thực
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5" /> Chưa xác thực
                </span>
              )}
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span>{user.email}</span>
              </div>
              {user.createdAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>
                    Tham gia:{" "}
                    {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="w-full gap-1.5"
            >
              <Edit3 className="h-4 w-4" /> Chỉnh sửa hồ sơ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
