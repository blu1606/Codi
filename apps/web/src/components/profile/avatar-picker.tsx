"use client";

import { Button } from "@codi-1/ui/components/button";
import { Camera, Check, CloudUpload, Loader2, Minus, Plus, Sparkles, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PRESET_DEFAULT_AVATARS } from "@/lib/avatar-presets";

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
  const [cropSource, setCropSource] = useState<{ file: File; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0 });

  const defaultAvatar =
    currentAvatar ||
    `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(userName || "Codi")}`;

  const uploadAvatar = async (file: File) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tải ảnh thất bại");

      onAvatarUpdated(data.imageUrl);
      toast.success("Đã tải ảnh lên Cloudflare R2 thành công!");
    } catch (err: any) {
      toast.error(err.message || "Không thể tải ảnh đại diện lên R2.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    setCropSource({ file, url: URL.createObjectURL(file) });
    setZoom(1);
    setCropPosition({ x: 0, y: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCropper = () => {
    if (cropSource) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);
  };

  const confirmCrop = async () => {
    if (!cropSource) return;
    const image = new window.Image();
    image.src = cropSource.url;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Không thể đọc ảnh")); });

    const outputSize = 512;
    const cropSize = cropFrameRef.current?.clientWidth || 320;
    const scale = Math.max(cropSize / image.naturalWidth, cropSize / image.naturalHeight) * zoom;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, ((cropSize - image.naturalWidth * scale) / 2 + cropPosition.x) * (outputSize / cropSize), ((cropSize - image.naturalHeight * scale) / 2 + cropPosition.y) * (outputSize / cropSize), image.naturalWidth * scale * (outputSize / cropSize), image.naturalHeight * scale * (outputSize / cropSize));

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      closeCropper();
      await uploadAvatar(new File([blob], cropSource.file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    dragRef.current = { active: true, x: event.clientX - cropPosition.x, y: event.clientY - cropPosition.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragRef.current.active) return;
    setCropPosition(clampPosition(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y));
  };

  const handlePointerUp = () => { dragRef.current.active = false; };

  const clampPosition = (x: number, y: number, nextZoom = zoom) => {
    const frameSize = cropFrameRef.current?.clientWidth || 320;
    if (!imageNaturalSize.width || !imageNaturalSize.height) return { x, y };
    const baseScale = Math.max(frameSize / imageNaturalSize.width, frameSize / imageNaturalSize.height);
    const renderedWidth = imageNaturalSize.width * baseScale * nextZoom;
    const renderedHeight = imageNaturalSize.height * baseScale * nextZoom;
    const maxX = Math.max(0, (renderedWidth - frameSize) / 2);
    const maxY = Math.max(0, (renderedHeight - frameSize) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const handleZoomChange = (value: number) => {
    setZoom(value);
    setCropPosition(clampPosition(cropPosition.x, cropPosition.y, value));
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

  useEffect(() => {
    if (!cropSource) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCropper();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cropSource]);

  const handleKeyDownCrop = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 25 : 10;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowUp") dy = step;
    else if (event.key === "ArrowDown") dy = -step;
    else if (event.key === "ArrowLeft") dx = step;
    else if (event.key === "ArrowRight") dx = -step;
    else return;

    event.preventDefault();
    setCropPosition((prev) => clampPosition(prev.x + dx, prev.y + dy));
  };

  return (
    <div className="space-y-4">
      {cropSource && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cropper-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCropper();
          }}
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="cropper-dialog-title" className="text-lg font-semibold">
                Chỉnh sửa hình ảnh
              </h2>
              <button
                type="button"
                onClick={closeCropper}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              ref={cropFrameRef}
              tabIndex={0}
              role="region"
              aria-label="Khung điều chỉnh vị trí ảnh. Dùng các phím mũi tên để dịch chuyển ảnh."
              onKeyDown={handleKeyDownCrop}
              className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <img
                src={cropSource.url}
                alt="Xem trước ảnh đại diện"
                draggable={false}
                onLoad={(event) =>
                  setImageNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute inset-0 h-full w-full cursor-grab select-none object-cover active:cursor-grabbing"
                style={{
                  transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${zoom})`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-full border-4 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Minus className="h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Phóng to ảnh"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) =>
                    handleZoomChange(Number(event.target.value))
                  }
                  className="flex-1 accent-primary"
                />
                <Plus className="h-4 w-4 text-muted-foreground" />
                <ZoomIn className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                <span>Dịch chuyển:</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setCropPosition((p) => clampPosition(p.x, p.y + 15))
                    }
                    aria-label="Dịch lên"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setCropPosition((p) => clampPosition(p.x, p.y - 15))
                    }
                    aria-label="Dịch xuống"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setCropPosition((p) => clampPosition(p.x + 15, p.y))
                    }
                    aria-label="Dịch sang trái"
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setCropPosition((p) => clampPosition(p.x - 15, p.y))
                    }
                    aria-label="Dịch sang phải"
                  >
                    →
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCropPosition({ x: 0, y: 0 })}
                  >
                    Căn giữa
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Kéo chuột hoặc chọn khung và dùng phím mũi tên (↑ ↓ ← →) để dịch ảnh
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeCropper}>
                Huỷ bỏ
              </Button>
              <Button type="button" onClick={confirmCrop} disabled={uploading}>
                Cắt và tải lên
              </Button>
            </div>
          </div>
        </div>
      )}

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
