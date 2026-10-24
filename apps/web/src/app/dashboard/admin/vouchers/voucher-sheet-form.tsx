"use client";

import { useState, useEffect } from "react";
import { LoaderCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Sheet } from "@codi-1/ui/components/sheet";
import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import type { AdminVoucherItem, VoucherFormData } from "@/lib/admin-vouchers-service";
import { createVoucherAction, updateVoucherAction } from "../actions";

export function VoucherSheetForm({
  voucher,
  open,
  onOpenChange,
}: {
  voucher: AdminVoucherItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEditing = !!voucher;

  // Form State
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [minMode, setMinMode] = useState<"none" | "set">("none");
  const [minOrder, setMinOrder] = useState("");
  const [limitMode, setLimitMode] = useState<"none" | "set">("none");
  const [usageLimit, setUsageLimit] = useState("");
  const [expMode, setExpMode] = useState<"none" | "set">("none");
  const [expiresAt, setExpiresAt] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (voucher) {
      setCode(voucher.code);
      setType(voucher.type);
      setValue(String(voucher.value));
      setMinMode(voucher.minOrderAmount > 0 ? "set" : "none");
      setMinOrder(voucher.minOrderAmount > 0 ? String(voucher.minOrderAmount) : "");
      setLimitMode(voucher.usageLimit !== null ? "set" : "none");
      setUsageLimit(voucher.usageLimit !== null ? String(voucher.usageLimit) : "");
      setExpMode(voucher.expiresAt ? "set" : "none");
      setExpiresAt(voucher.expiresAt ? voucher.expiresAt.split("T")[0]! : "");
    } else {
      setCode("");
      setType("percent");
      setValue("");
      setMinMode("none");
      setMinOrder("");
      setLimitMode("none");
      setUsageLimit("");
      setExpMode("none");
      setExpiresAt("");
    }
    setErrors({});
  }, [voucher, open]);

  const validate = () => {
    const err: Record<string, string> = {};
    const upperCode = code.trim().toUpperCase();

    if (!isEditing) {
      if (!/^[A-Z0-9]{4,20}$/.test(upperCode)) {
        err.code = "Mã gồm 4–20 ký tự chữ in hoa hoặc số.";
      }
    }

    const valClean = value.replace(/[.\s,]/g, "");
    if (!/^\d+$/.test(valClean) || Number(valClean) <= 0) {
      err.value = "Nhập số lớn hơn 0.";
    } else if (type === "percent" && Number(valClean) > 100) {
      err.value = "Phần trăm tối đa là 100.";
    }

    if (minMode === "set") {
      const minClean = minOrder.replace(/[.\s,]/g, "");
      if (!/^\d+$/.test(minClean) || Number(minClean) <= 0) {
        err.minOrder = "Nhập giá trị đơn tối thiểu hợp lệ.";
      }
    }

    if (limitMode === "set") {
      const limitClean = usageLimit.replace(/[.\s,]/g, "");
      if (!/^\d+$/.test(limitClean) || Number(limitClean) < 1) {
        err.usageLimit = "Số lượt phải từ 1 trở lên.";
      }
    }

    if (expMode === "set") {
      if (!expiresAt) {
        err.expiresAt = "Chọn một ngày từ hôm nay trở đi.";
      } else {
        const expDate = new Date(expiresAt);
        expDate.setHours(23, 59, 59, 999);
        if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
          err.expiresAt = "Chọn một ngày từ hôm nay trở đi.";
        }
      }
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: VoucherFormData = {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value.replace(/[.\s,]/g, "")),
        minOrderAmount: minMode === "set" ? Number(minOrder.replace(/[.\s,]/g, "")) : 0,
        usageLimit: limitMode === "set" ? Number(usageLimit.replace(/[.\s,]/g, "")) : null,
        expiresAt: expMode === "set" ? expiresAt : null,
      };

      if (isEditing) {
        await updateVoucherAction(voucher.id, payload);
        toast.success(`Đã lưu thay đổi cho voucher ${voucher.code}.`);
      } else {
        await createVoucherAction(payload);
        toast.success(`Đã tạo voucher ${payload.code}.`);
      }

      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu voucher.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? `Sửa voucher ${voucher.code}` : "Tạo voucher"}
      description="Mã giảm giá áp dụng khi thanh toán toàn giỏ hàng."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="cursor-pointer"
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="cursor-pointer gap-1.5"
          >
            {submitting && <LoaderCircle className="size-4 animate-spin" />}
            {isEditing ? "Lưu thay đổi" : "Tạo voucher"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-5 py-1">
        {/* Code Input */}
        <div className="space-y-1.5">
          <label htmlFor="vf-code" className="text-sm font-medium">
            Mã voucher <span className="text-destructive">*</span>
          </label>
          <Input
            id="vf-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setErrors((prev) => ({ ...prev, code: "" }));
            }}
            readOnly={isEditing}
            disabled={submitting}
            placeholder="Ví dụ: CODI2026"
            className="font-mono uppercase"
          />
          <p className="text-xs text-muted-foreground">
            {isEditing ? "Không thể đổi mã sau khi tạo." : "4–20 ký tự, chữ in hoa và chữ số."}
          </p>
          {errors.code && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3.5" /> {errors.code}
            </p>
          )}
        </div>

        {/* Discount Type Radio */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Loại giảm giá</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="percent"
                checked={type === "percent"}
                onChange={() => setType("percent")}
                disabled={submitting}
                className="size-4"
              />
              Phần trăm (%)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="amount"
                checked={type === "amount"}
                onChange={() => setType("amount")}
                disabled={submitting}
                className="size-4"
              />
              Số tiền (VND)
            </label>
          </div>
        </div>

        {/* Discount Value */}
        <div className="space-y-1.5">
          <label htmlFor="vf-value" className="text-sm font-medium">
            {type === "percent" ? "Mức giảm (%)" : "Số tiền giảm (VND)"}{" "}
            <span className="text-destructive">*</span>
          </label>
          <Input
            id="vf-value"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setErrors((prev) => ({ ...prev, value: "" }));
            }}
            disabled={submitting}
            placeholder={type === "percent" ? "Ví dụ: 20" : "Ví dụ: 100000"}
          />
          {errors.value && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3.5" /> {errors.value}
            </p>
          )}
        </div>

        {/* Min Order Condition */}
        <div className="space-y-2 border-t border-border pt-3">
          <span className="text-sm font-medium">Đơn tối thiểu</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="minMode"
                value="none"
                checked={minMode === "none"}
                onChange={() => setMinMode("none")}
                disabled={submitting}
                className="size-4"
              />
              Không yêu cầu
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="minMode"
                value="set"
                checked={minMode === "set"}
                onChange={() => setMinMode("set")}
                disabled={submitting}
                className="size-4"
              />
              Từ số tiền
            </label>
          </div>

          {minMode === "set" && (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="vf-min" className="text-xs font-medium text-muted-foreground">
                Giá trị đơn tối thiểu (VND)
              </label>
              <Input
                id="vf-min"
                inputMode="numeric"
                value={minOrder}
                onChange={(e) => {
                  setMinOrder(e.target.value);
                  setErrors((prev) => ({ ...prev, minOrder: "" }));
                }}
                disabled={submitting}
                placeholder="Ví dụ: 500000"
              />
              {errors.minOrder && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> {errors.minOrder}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Usage Limit Condition */}
        <div className="space-y-2 border-t border-border pt-3">
          <span className="text-sm font-medium">Giới hạn lượt dùng</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="limitMode"
                value="none"
                checked={limitMode === "none"}
                onChange={() => setLimitMode("none")}
                disabled={submitting}
                className="size-4"
              />
              Không giới hạn
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="limitMode"
                value="set"
                checked={limitMode === "set"}
                onChange={() => setLimitMode("set")}
                disabled={submitting}
                className="size-4"
              />
              Giới hạn N lượt
            </label>
          </div>

          {limitMode === "set" && (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="vf-limit" className="text-xs font-medium text-muted-foreground">
                Số lượt tối đa
              </label>
              <Input
                id="vf-limit"
                inputMode="numeric"
                value={usageLimit}
                onChange={(e) => {
                  setUsageLimit(e.target.value);
                  setErrors((prev) => ({ ...prev, usageLimit: "" }));
                }}
                disabled={submitting}
                placeholder="Ví dụ: 100"
              />
              {errors.usageLimit && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> {errors.usageLimit}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Expiry Condition */}
        <div className="space-y-2 border-t border-border pt-3">
          <span className="text-sm font-medium">Hạn dùng</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="expMode"
                value="none"
                checked={expMode === "none"}
                onChange={() => setExpMode("none")}
                disabled={submitting}
                className="size-4"
              />
              Không hết hạn
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="expMode"
                value="set"
                checked={expMode === "set"}
                onChange={() => setExpMode("set")}
                disabled={submitting}
                className="size-4"
              />
              Đến ngày cụ thể
            </label>
          </div>

          {expMode === "set" && (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="vf-exp" className="text-xs font-medium text-muted-foreground">
                Ngày hết hạn
              </label>
              <Input
                id="vf-exp"
                type="date"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  setErrors((prev) => ({ ...prev, expiresAt: "" }));
                }}
                disabled={submitting}
              />
              {errors.expiresAt && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> {errors.expiresAt}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Scope info */}
        <div className="rounded-lg border border-border p-3 bg-muted/20 text-xs text-muted-foreground space-y-1">
          <span className="font-medium text-foreground">Phạm vi áp dụng</span>
          <p>Áp dụng cho toàn bộ đơn hàng (cả giỏ hàng), 1 voucher / đơn (theo Quyết định PO 14/10).</p>
        </div>
      </form>
    </Sheet>
  );
}
