"use client";

import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
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
  User,
  X,
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
    router.refresh();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Hồ sơ người dùng</CardTitle>
          </div>
          <Button
            variant={isEditing ? "ghost" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="gap-1.5"
          >
            {isEditing ? <><X className="w-4 h-4" /> Huỷ</> : <><Edit3 className="w-4 h-4 text-primary" /> Chỉnh sửa hồ sơ</>}
          </Button>
        </div>
        <CardDescription>
          Xem và quản lý thông tin tài khoản, ảnh đại diện lưu trữ trên Cloudflare R2.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        {isEditing ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Ảnh đại diện (Cloudflare R2)</Label>
              <AvatarPicker currentAvatar={avatarUrl} userName={name} onAvatarUpdated={handleAvatarUpdated} />
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-4 border-t border-border">
              <div className="space-y-2 max-w-md">
                <Label htmlFor="displayName">Họ và tên</Label>
                <Input
                  id="displayName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập họ và tên của bạn"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2 max-w-md">
                <Label htmlFor="displayEmail">Email đăng ký</Label>
                <Input id="displayEmail" value={user.email} disabled className="bg-muted text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Email là định danh tài khoản, không thể thay đổi trực tiếp.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Lưu thay đổi
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Huỷ</Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary/20 bg-muted shrink-0 shadow-sm">
              <Image src={defaultAvatar} alt={name || "Avatar"} width={96} height={96} className="w-full h-full object-cover" unoptimized />
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold tracking-tight">{name}</h3>
                {roles.map((roleId) => (
                  <span
                    key={roleId}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border"
                  >
                    {ROLE_LABEL[roleId] ?? roleId}
                  </span>
                ))}
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    <ShieldCheck className="w-3.5 h-3.5" /> Đã xác thực
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                    <AlertCircle className="w-3.5 h-3.5" /> Chưa xác thực
                  </span>
                )}
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <span>{user.email}</span>
                </div>
                {user.createdAt && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>Tham gia: {new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
