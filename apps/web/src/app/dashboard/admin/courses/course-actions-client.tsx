"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Star } from "lucide-react";

import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import type { AdminCourseItem } from "@/lib/admin-courses-service";
import { hideCourseAction, unhideCourseAction, updateCoursePriceAction } from "../actions";

export function CourseActionsClient({ courses }: { courses: AdminCourseItem[] }) {
  const router = useRouter();

  // State for Hide Confirm Dialog
  const [hidingCourse, setHidingCourse] = useState<AdminCourseItem | null>(null);

  // State for Unhide Confirm Dialog
  const [unhidingCourse, setUnhidingCourse] = useState<AdminCourseItem | null>(null);

  // State for Price Change Modal
  const [pricingCourse, setPricingCourse] = useState<AdminCourseItem | null>(null);
  const [newPriceInput, setNewPriceInput] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricePending, setPricePending] = useState(false);

  const formatVnd = (n: number) => (n === 0 ? "Miễn phí" : `${n.toLocaleString("vi-VN")} ₫`);

  const handleOpenPriceModal = (c: AdminCourseItem) => {
    setPricingCourse(c);
    setNewPriceInput(String(c.price));
    setPriceError(null);
  };

  const handleSavePrice = async () => {
    if (!pricingCourse) return;
    const cleanStr = newPriceInput.replace(/[.\s,]/g, "");
    if (!/^\d+$/.test(cleanStr)) {
      setPriceError("Giá phải là số nguyên không âm.");
      return;
    }
    const val = Number(cleanStr);
    if (val === pricingCourse.price) {
      setPriceError("Giá mới đang trùng giá hiện tại.");
      return;
    }

    try {
      setPricePending(true);
      setPriceError(null);
      await updateCoursePriceAction(pricingCourse.id, val);
      toast.success("Đã cập nhật giá.");
      setPricingCourse(null);
      router.refresh();
    } catch (err: any) {
      setPriceError(err?.message || "Không thể cập nhật giá.");
    } finally {
      setPricePending(false);
    }
  };

  const parsedEnteredPrice = () => {
    const cleanStr = newPriceInput.replace(/[.\s,]/g, "");
    if (!/^\d+$/.test(cleanStr)) return null;
    return Number(cleanStr);
  };

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Khoá học</th>
              <th className="px-4 py-3 font-medium">Giảng viên</th>
              <th className="px-4 py-3 font-medium text-right">Giá</th>
              <th className="px-4 py-3 font-medium text-right">Học viên</th>
              <th className="px-4 py-3 font-medium">Đánh giá</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {courses.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  Chưa có khoá học nào đã xuất bản.
                </td>
              </tr>
            ) : (
              courses.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={`/courses/${c.slug}`}
                      className="text-foreground hover:text-primary transition-colors hover:underline"
                    >
                      {c.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.instructorName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatVnd(c.price)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.learnersCount.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        {c.rating.toFixed(1)}
                        <Star className="size-3.5 fill-star text-star" />
                        <span className="text-xs text-muted-foreground">({c.reviewCount})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <StatusBadge kind="course" status={c.status} />
                      {c.status === "hidden" && c.hiddenReason && (
                        <p className="text-xs text-muted-foreground max-w-[220px] line-clamp-2">
                          {c.hiddenReason}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {c.status === "published" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHidingCourse(c)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          Ẩn khóa học
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUnhidingCourse(c)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          Hiện lại
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPriceModal(c)}
                        className="h-8 text-xs cursor-pointer"
                      >
                        Đổi giá
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Hide Course Dialog */}
      {hidingCourse && (
        <ConfirmDialog
          open={!!hidingCourse}
          onOpenChange={(open) => !open && setHidingCourse(null)}
          title={`Ẩn "${hidingCourse.title}"?`}
          consequence={`Học viên mới sẽ không tìm thấy và không mua được khoá học. ${hidingCourse.learnersCount} học viên đã mua vẫn tiếp tục học bình thường. Giảng viên nhận thông báo kèm lý do.`}
          reversible="Có thể hiện lại bất cứ lúc nào."
          requireReason={true}
          danger={true}
          confirmLabel="Ẩn khoá học"
          onConfirm={async (reason) => {
            await hideCourseAction(hidingCourse.id, reason);
            toast.success("Đã ẩn khoá học.");
            setHidingCourse(null);
            router.refresh();
          }}
        />
      )}

      {/* Unhide Course Dialog */}
      {unhidingCourse && (
        <ConfirmDialog
          open={!!unhidingCourse}
          onOpenChange={(open) => !open && setUnhidingCourse(null)}
          title={`Hiện lại "${unhidingCourse.title}"?`}
          consequence="Khoá học xuất hiện lại trong danh sách và mở bán."
          reversible="Có thể ẩn lại bất cứ lúc nào."
          confirmLabel="Hiện lại"
          onConfirm={async () => {
            await unhideCourseAction(unhidingCourse.id);
            toast.success("Khoá học đã mở bán trở lại.");
            setUnhidingCourse(null);
            router.refresh();
          }}
        />
      )}

      {/* Price Modal */}
      {pricingCourse && (
        <Dialog open={!!pricingCourse} onOpenChange={(open) => !open && !pricePending && setPricingCourse(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Đổi giá &quot;{pricingCourse.title}&quot;</DialogTitle>
              <DialogDescription>
                Giá mới áp dụng cho đơn hàng mới; đơn đang chờ thanh toán giữ giá cũ. Giảng viên nhận thông báo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm">
                Giá hiện tại: <strong className="font-semibold">{formatVnd(pricingCourse.price)}</strong>
              </p>

              <div className="space-y-1.5">
                <label htmlFor="admin-price-input" className="text-sm font-medium">
                  Giá mới (VND) <span className="text-destructive">*</span>
                </label>
                <Input
                  id="admin-price-input"
                  inputMode="numeric"
                  value={newPriceInput}
                  onChange={(e) => {
                    setNewPriceInput(e.target.value);
                    setPriceError(null);
                  }}
                  disabled={pricePending}
                  placeholder="Ví dụ: 990000"
                />
                <p className="text-xs text-muted-foreground">
                  {parsedEnteredPrice() !== null
                    ? `= ${formatVnd(parsedEnteredPrice()!)}`
                    : "Nhập số nguyên không âm (0 là miễn phí)"}
                </p>
                {priceError && <p className="text-xs text-destructive">{priceError}</p>}
              </div>

              <Alert>
                <AlertTitle className="text-xs font-semibold">Điều gì sẽ xảy ra</AlertTitle>
                <AlertDescription className="text-xs">
                  Giá mới áp dụng cho đơn hàng mới; đơn đang chờ thanh toán giữ giá cũ. Giảng viên nhận thông báo tự động.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setPricingCourse(null)}
                disabled={pricePending}
                className="cursor-pointer"
              >
                Huỷ
              </Button>
              <Button
                variant="default"
                onClick={handleSavePrice}
                disabled={pricePending}
                className="cursor-pointer gap-1.5"
              >
                {pricePending && <LoaderCircle className="size-4 animate-spin" />}
                Lưu giá mới
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
