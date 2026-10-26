"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Edit2,
  MessageCircle,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { Label } from "@codi-1/ui/components/label";
import { Sheet } from "@codi-1/ui/components/sheet";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { formatDate, validateReviewReply } from "@/lib/qa-reviews-service";
import {
  deleteCourseReviewReply,
  replyToCourseReview,
  type LecturerReviewsDataDto,
  type ReviewItemDto,
} from "./actions";

interface ReviewsClientProps {
  initialData: LecturerReviewsDataDto;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 text-warning"
      aria-label={`${rating} trên 5 sao`}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            "size-4",
            s <= rating
              ? "fill-warning text-warning"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export function ReviewsClient({ initialData }: ReviewsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { filter, counts, reviews } = initialData;

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewItemDto | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [reviewToDeleteReply, setReviewToDeleteReply] =
    useState<ReviewItemDto | null>(null);

  const handleFilterChange = (nextFilter: "all" | "unreplied") => {
    startTransition(() => {
      const sp = new URLSearchParams();
      if (nextFilter === "unreplied") {
        sp.set("filter", "unreplied");
      }
      router.push(`/dashboard/lecturer/reviews?${sp.toString()}` as any);
    });
  };

  const handleOpenReplySheet = (review: ReviewItemDto) => {
    setEditingReview(review);
    setReplyInput(review.lecturerReply || "");
    setReplyError(null);
    setSheetOpen(true);
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReview) return;

    setReplyError(null);
    const validation = validateReviewReply(replyInput);
    if (!validation.isValid) {
      setReplyError(validation.error || "Nội dung phản hồi không hợp lệ.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await replyToCourseReview({
        reviewId: editingReview.id,
        replyText: replyInput,
      });

      if (!res.success) {
        setReplyError(res.error || "Không thể lưu phản hồi.");
        return;
      }

      setSheetOpen(false);
      toast.success("Đã đăng phản hồi công khai.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setReplyError("Có lỗi xảy ra khi lưu phản hồi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReplyConfirm = async () => {
    if (!reviewToDeleteReply) return;
    try {
      const res = await deleteCourseReviewReply({
        reviewId: reviewToDeleteReply.id,
      });

      if (!res.success) {
        toast.error(res.error || "Không thể xoá phản hồi.");
        return;
      }

      toast.success("Đã xoá phản hồi.");
      setReviewToDeleteReply(null);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Có lỗi xảy ra khi xoá phản hồi.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header bar */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Đánh giá</h1>
        <p className="text-sm text-muted-foreground">
          Phản hồi của bạn hiển thị công khai dưới đánh giá trên trang khoá học.
        </p>
      </div>

      {/* Segmented Filter */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60">
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all",
            filter === "all"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Tất cả ({counts.all})</span>
        </button>

        <button
          type="button"
          onClick={() => handleFilterChange("unreplied")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all",
            filter === "unreplied"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Chưa phản hồi ({counts.unreplied})</span>
        </button>
      </div>

      {/* Reviews List or Empty State */}
      {reviews.length === 0 ? (
        <Card className="border border-border/80">
          <CardContent className="p-16">
            <Empty>
              <EmptyMedia>
                <div className="p-4 rounded-full bg-muted text-muted-foreground">
                  <Star className="size-10 text-warning" />
                </div>
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {filter === "unreplied"
                    ? "Bạn đã phản hồi mọi đánh giá"
                    : "Chưa có đánh giá nào"}
                </EmptyTitle>
                <EmptyDescription>
                  {filter === "unreplied"
                    ? "Không còn đánh giá nào đang chờ phản hồi từ bạn."
                    : "Đánh giá từ học viên đã mua khoá học sẽ xuất hiện tại đây."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r: ReviewItemDto) => (
            <Card key={r.id} className="border border-border/80 shadow-xs">
              <CardContent className="p-5 space-y-4">
                {/* User + Rating + Date row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {r.learnerAvatar ? (
                      <img
                        src={r.learnerAvatar}
                        alt=""
                        className="size-8 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {r.learnerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <strong className="text-sm font-semibold text-foreground">
                        {r.learnerName}
                      </strong>
                      <div className="text-xs text-muted-foreground">
                        {r.courseTitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StarRating rating={r.rating} />
                    <span className="text-xs text-muted-foreground">
                      · {formatDate(r.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Review Body */}
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {r.text || (
                    <span className="italic text-muted-foreground">
                      Không có nhận xét, chỉ chấm sao.
                    </span>
                  )}
                </p>

                {/* Lecturer Reply Panel or Action */}
                {r.lecturerReply ? (
                  <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-semibold text-foreground">
                          Phản hồi của bạn
                        </strong>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-success-soft text-success">
                          Đã phản hồi
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.repliedAt)}
                      </span>
                    </div>

                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                      {r.lecturerReply}
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenReplySheet(r)}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        <Edit2 className="size-3" />
                        Sửa
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setReviewToDeleteReply(r)}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1"
                      >
                        <Trash2 className="size-3" />
                        Xoá phản hồi
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenReplySheet(r)}
                      className="gap-1.5 text-xs shadow-xs"
                    >
                      <MessageCircle className="size-3.5" />
                      Phản hồi
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reply Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={
          editingReview?.lecturerReply ? "Sửa phản hồi" : "Phản hồi đánh giá"
        }
        description={`Đánh giá từ ${editingReview?.learnerName || "học viên"}`}
      >
        {editingReview && (
          <form onSubmit={handleSaveReply} className="space-y-5">
            {/* Review summary preview */}
            <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {editingReview.learnerName}
                </span>
                <StarRating rating={editingReview.rating} />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {editingReview.text || "Không có nhận xét."}
              </p>
            </div>

            {replyError && (
              <Alert variant="destructive" className="py-2 text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{replyError}</span>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="review-reply-textarea" className="text-sm font-semibold">
                Phản hồi công khai
              </Label>
              <Textarea
                id="review-reply-textarea"
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="Cảm ơn học viên và giải đáp góp ý..."
                rows={5}
                required
                className="text-sm leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                Ngắn gọn, cảm ơn và giải đáp góp ý (nếu có).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSheetOpen(false)}
                disabled={isSubmitting}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Đang đăng..." : "Đăng phản hồi"}
              </Button>
            </div>
          </form>
        )}
      </Sheet>

      {/* Delete Reply Confirm Dialog */}
      <ConfirmDialog
        open={!!reviewToDeleteReply}
        onOpenChange={(open) => {
          if (!open) setReviewToDeleteReply(null);
        }}
        title="Xoá phản hồi?"
        consequence="Phản hồi công khai sẽ bị gỡ khỏi trang khoá học. Đánh giá của học viên vẫn giữ nguyên."
        reversible="Bạn có thể viết phản hồi mới bất cứ lúc nào."
        danger={true}
        confirmLabel="Xoá phản hồi"
        onConfirm={handleDeleteReplyConfirm}
      />
    </div>
  );
}
