"use client";

import { Button } from "@codi-1/ui/components/button";
import { Camera, Check, CloudUpload, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PRESET_DEFAULT_AVATARS } from "@/lib/storage";

interface AvatarPickerProps {
  currentAvatar: string | null;
  userName: string;
  onAvatarUpdated: (newUrl: string) => void;
}

export default function AvatarPicker({
  currentAvatar,
  userName,
  onAvatarUpdated,
}: AvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const defaultAvatar =
    currentAvatar ||
    `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(userName || "Codi")}`;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Tải ảnh thất bại");
      }

      onAvatarUpdated(data.imageUrl);
      toast.success("Đã tải ảnh lên Cloudflare R2 thành công!");
    } catch (err: any) {
      toast.error(err.message || "Không thể tải ảnh đại diện lên R2.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSelectPreset = async (presetUrl: string, id: string) => {
    try {
      setSelectedPreset(id);
      setUploading(true);

      const res = await fetch("/api/user/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu avatar mặc định lên R2");
      }

      onAvatarUpdated(data.imageUrl);
      toast.success("Đã lưu ảnh đại diện mặc định lên Cloudflare R2!");
    } catch (err: any) {
      toast.error(err.message || "Lỗi cập nhật ảnh");
    } finally {
      setUploading(false);
      setSelectedPreset(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Avatar Display & Upload Trigger */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center shadow-sm">
            <Image
              src={defaultAvatar}
              alt={userName || "User Avatar"}
              width={80}
              height={80}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 bg-foreground/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-background cursor-pointer disabled:cursor-not-allowed"
            title="Đổi ảnh đại diện"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4 text-primary" />
              )}
              Tải ảnh lên R2
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Hỗ trợ PNG, JPG, WebP tối đa 5MB. Lưu trữ an toàn trên Cloudflare R2.
          </p>
        </div>
      </div>

      {/* Preset Default Avatars */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Hoặc chọn từ bộ Avatar mặc định Codi:</span>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {PRESET_DEFAULT_AVATARS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.url, preset.id)}
                disabled={uploading}
                title={preset.name}
                className="relative group p-1 rounded-xl border border-border hover:border-primary transition-all duration-150 aspect-square flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <Image
                  src={preset.url}
                  alt={preset.name}
                  width={44}
                  height={44}
                  className="w-full h-full object-contain rounded-lg"
                  unoptimized
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-lg">
                    <Check className="w-4 h-4 text-primary font-bold" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
