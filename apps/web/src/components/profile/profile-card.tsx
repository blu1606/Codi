"use client";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import {
  AlertCircle,
  Check,
  Edit3,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(user.image || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBio(window.localStorage.getItem(`codi:profile-bio:${user.id}`) ?? "");
  }, [user.id]);

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

      window.localStorage.setItem(`codi:profile-bio:${user.id}`, bio.trim());
      window.dispatchEvent(new CustomEvent("profile-name-updated", { detail: { name: name.trim() } }));
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
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-6 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Edit profile</h2>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Ảnh đại diện (Cloudflare R2)</Label>
            <AvatarPicker currentAvatar={avatarUrl} userName={name} onAvatarUpdated={handleAvatarUpdated} />
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-border pt-4">
            <div className="max-w-md space-y-2">
              <Label htmlFor="displayName">Họ và tên</Label>
              <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập họ và tên của bạn" disabled={saving} />
            </div>
            <div className="max-w-md space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Viết vài điều về bạn..."
                disabled={saving}
                className="min-h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Lưu thay đổi
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Huỷ</Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-full border border-border bg-muted shadow-sm">
            <Image src={defaultAvatar} alt={name || "Avatar"} fill sizes="320px" className="object-cover" unoptimized />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-semibold tracking-tight">{name}</h3>
              {roles.map((roleId) => <span key={roleId} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{ROLE_LABEL[roleId] ?? roleId}</span>)}
              {user.emailVerified ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Đã xác thực</span> : <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> Chưa xác thực</span>}
            </div>
            {bio.trim() && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{bio}</p>}
            <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full gap-1.5">
              <Edit3 className="h-4 w-4" /> Edit profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
