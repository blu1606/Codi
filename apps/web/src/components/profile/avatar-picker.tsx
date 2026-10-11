"use client";

import { Button } from "@codi-1/ui/components/button";
import { Camera, Check, CloudUpload, Loader2, Minus, Plus, Sparkles, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PRESET_DEFAULT_AVATARS } from "@/lib/avatar-presets";

export type AvatarSelection =
  | { kind: "file"; file: File }
  | { kind: "preset"; url: string };

interface AvatarPickerProps {
  currentAvatar: string | null;
  userName: string;
  onAvatarSelected: (selection: AvatarSelection) => void;
  disabled?: boolean;
}

export default function AvatarPicker({
  currentAvatar,
  userName,
  onAvatarSelected,
  disabled = false,
}: AvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [cropSource, setCropSource] = useState<{ file: File; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const cropUrlRef = useRef<string | null>(null);
  const busy = disabled || processing;

  useEffect(() => () => {
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    cropUrlRef.current = null;
  }, []);

  const defaultAvatar =
    currentAvatar ||
    `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(userName || "Codi")}`;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (busy) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    lastActiveElementRef.current = document.activeElement as HTMLElement | null;
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    cropUrlRef.current = URL.createObjectURL(file);
    setCropSource({ file, url: cropUrlRef.current });
    setZoom(1);
    setCropPosition({ x: 0, y: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCropper = () => {
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    cropUrlRef.current = null;
    setCropSource(null);
    setTimeout(() => {
      if (lastActiveElementRef.current) {
        lastActiveElementRef.current.focus();
      } else {
        triggerButtonRef.current?.focus();
      }
    }, 50);
  };

  const confirmCrop = async () => {
    if (!cropSource || busy) return;
    setProcessing(true);
    try {
      const image = new window.Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Không thể đọc ảnh"));
        image.src = cropSource.url;
      });
      if (cropUrlRef.current !== cropSource.url) return;

      const outputSize = 512;
      const cropSize = cropFrameRef.current?.clientWidth || 320;
      const scale = Math.max(cropSize / image.naturalWidth, cropSize / image.naturalHeight) * zoom;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không thể xử lý ảnh");
      context.drawImage(image, ((cropSize - image.naturalWidth * scale) / 2 + cropPosition.x) * (outputSize / cropSize), ((cropSize - image.naturalHeight * scale) / 2 + cropPosition.y) * (outputSize / cropSize), image.naturalWidth * scale * (outputSize / cropSize), image.naturalHeight * scale * (outputSize / cropSize));

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (cropUrlRef.current !== cropSource.url) return;
      if (!blob) throw new Error("Không thể xử lý ảnh");
      onAvatarSelected({
        kind: "file",
        file: new File([blob], cropSource.file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }),
      });
      closeCropper();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể xử lý ảnh");
    } finally {
      setProcessing(false);
    }
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

  const handleSelectPreset = (presetUrl: string) => {
    if (!busy) onAvatarSelected({ kind: "preset", url: presetUrl });
  };

  useEffect(() => {
    if (!cropSource) return;

    // Set initial focus to cropFrameRef for keyboard arrow panning
    const timer = setTimeout(() => {
      cropFrameRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCropper();
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return;
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
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
          <div
            ref={dialogRef}
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="cropper-dialog-title" className="text-lg font-semibold">
                Chỉnh sửa hình ảnh
              </h2>
              <button
                type="button"
                onClick={closeCropper}
                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Đóng (Escape)"
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

              <div className="flex flex-col gap-2 pt-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Dịch chuyển:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center p-0 text-base font-bold"
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
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center p-0 text-base font-bold"
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
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center p-0 text-base font-bold"
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
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center p-0 text-base font-bold"
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
                    className="flex h-11 min-h-[44px] items-center justify-center px-3 text-xs font-medium"
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
              <Button type="button" onClick={confirmCrop} disabled={busy}>
                {processing ? "Đang xử lý…" : "Dùng ảnh này"}
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
            disabled={busy}
            className="absolute inset-0 bg-foreground/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-background cursor-pointer disabled:cursor-not-allowed"
            title="Đổi ảnh đại diện"
          >
            {busy ? (
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
              disabled={busy}
            />
            <Button
              ref={triggerButtonRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4 text-primary" />
              )}
              Chọn ảnh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Hỗ trợ PNG, JPG, WebP tối đa 5MB. Ảnh chỉ được lưu khi bấm Lưu thay đổi.
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
            const isSelected = currentAvatar === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.url)}
                disabled={busy}
                aria-pressed={isSelected}
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
