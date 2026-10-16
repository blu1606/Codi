"use client";

import { useId, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from "@codi-1/ui/components/dialog";
import { cn } from "@codi-1/ui/lib/utils";

export function Sheet({ open, onOpenChange, title, description, docked = false, children, footer, className }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string;
  docked?: boolean; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  const id = useId();
  const close = <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Đóng bảng"><X aria-hidden="true" /></Button>;
  const body = <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>;
  const bottom = footer ? <div className="border-t p-5">{footer}</div> : null;
  if (docked) return open ? <aside aria-labelledby={id} className={cn("flex min-h-0 w-full flex-col border-l bg-card text-card-foreground md:w-96", className)}>
    <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 id={id} className="text-lg font-semibold">{title}</h2>{description && <p className="text-sm text-muted-foreground">{description}</p>}</div>{close}</div>
    {body}{bottom}
  </aside> : null;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup className={cn("fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col bg-card text-card-foreground shadow-pop outline-none sm:max-w-md", className)}>
        <div className="flex items-start justify-between gap-3 border-b p-4"><div className="space-y-1"><DialogTitle>{title}</DialogTitle><DialogDescription>{description ?? "Bảng nội dung bổ sung"}</DialogDescription></div>{close}</div>
        {body}{bottom}
      </DialogPrimitive.Popup>
    </DialogPortal>
  </Dialog>;
}
