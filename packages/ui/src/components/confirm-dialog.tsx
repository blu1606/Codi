"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Textarea } from "@codi-1/ui/components/textarea";
import { Alert } from "@codi-1/ui/components/alert";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  consequence: string;
  reversible: string;
  requireReason?: boolean;
  typeToConfirm?: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  // Unmount the form on close so reasons and typed confirmations never leak between actions.
  return props.open ? <ConfirmForm {...props} /> : null;
}

function ConfirmForm({ open, onOpenChange, title, children, consequence, reversible, requireReason, typeToConfirm, danger, confirmLabel = "Xác nhận", cancelLabel = "Huỷ", onConfirm }: ConfirmDialogProps) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const reasonError = requireReason && touched && !reason.trim();

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent showCloseButton={!pending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (submitting.current || (requireReason && !reason.trim()) || (typeToConfirm && typed !== typeToConfirm)) return;
        submitting.current = true;
        setPending(true); setError(null);
        try { await onConfirm(reason.trim()); onOpenChange(false); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thực hiện. Vui lòng thử lại."); }
        finally { submitting.current = false; setPending(false); }
      }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence} {reversible}</DialogDescription>
        </DialogHeader>
        {children}
        {requireReason && <div className="space-y-2">
          <label htmlFor={`${id}-reason`} className="text-sm font-medium">Lý do <span className="text-destructive">(bắt buộc)</span></label>
          <Textarea id={`${id}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} onBlur={() => setTouched(true)} maxLength={2000} disabled={pending} aria-invalid={!!reasonError} aria-describedby={reasonError ? `${id}-error` : undefined} />
          {reasonError && <p id={`${id}-error`} className="text-sm text-destructive">Vui lòng nhập lý do.</p>}
        </div>}
        {typeToConfirm && <div className="space-y-2">
          <label htmlFor={`${id}-typed`} className="block text-sm">Nhập <strong>{typeToConfirm}</strong> để xác nhận</label>
          <Input id={`${id}-typed`} value={typed} onChange={(event) => setTyped(event.target.value)} disabled={pending} autoComplete="off" />
        </div>}
        {error && <Alert variant="destructive">{error}</Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button type="submit" variant={danger ? "destructive" : "default"} className="min-w-32" disabled={pending || (!!requireReason && !reason.trim()) || (!!typeToConfirm && typed !== typeToConfirm)}>
            {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
