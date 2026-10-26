"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  CRITERIA,
  FLAG_STATUS,
  SEVERITY,
  targetHref,
  type ReviewCriterionId,
  type ReviewFlagDto,
} from "@/lib/publication-service";
import {
  markFlagFixed,
  reopenFlag,
  submitCourseForPublication,
  type PublicationDataDto,
} from "./actions";

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${className}`}
    >
      {children}
    </span>
  );
}

interface PublishTabClientProps {
  courseId: string;
  data: PublicationDataDto;
}

export function PublishTabClient({ courseId, data }: PublishTabClientProps) {
  const router = useRouter();
  const { course, readiness, round, isLocked } = data;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Flag fixing dialog state
  const [fixingFlag, setFixingFlag] = useState<ReviewFlagDto | null>(null);
  const [flagReply, setFlagReply] = useState("");
  const [flagReplyError, setFlagReplyError] = useState<string | null>(null);
  const [isFixingFlag, setIsFixingFlag] = useState(false);

  // Reopen flag loading state
  const [reopeningFlagId, setReopeningFlagId] = useState<number | null>(null);

  const canSubmit = ["draft", "rejected"].includes(course.status);
  const passedItemsCount = readiness.items.filter((i) => i.ok).length;
  const totalItemsCount = readiness.items.length;

  const openFlags = round?.flags.filter((f) => f.status === "open") || [];
  const hasOpenMustFlags = openFlags.some((f) => f.severity === "must");

  // Handle Lecturer Submit Course
  const handleSubmitCourse = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitCourseForPublication(courseId);
      setShowConfirmModal(false);
      router.refresh();
    } catch (err: any) {
      setSubmitError(err.message || "Đã xảy ra lỗi khi gửi yêu cầu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Fix Flag Dialog
  const handleOpenFixDialog = (flag: ReviewFlagDto) => {
    setFixingFlag(flag);
    setFlagReply(flag.lecturerReply || "");
    setFlagReplyError(null);
  };

  // Submit Fix Flag
  const handleSubmitFlagFix = async () => {
    if (!fixingFlag || !fixingFlag.id) return;
    if (flagReply.trim().length < 5) {
      setFlagReplyError("Vui lòng mô tả bạn đã sửa gì (ít nhất 5 ký tự).");
      return;
    }

    setIsFixingFlag(true);
    setFlagReplyError(null);
    try {
      await markFlagFixed(courseId, Number(fixingFlag.id), flagReply);
      setFixingFlag(null);
      setFlagReply("");
      router.refresh();
    } catch (err: any) {
      setFlagReplyError(err.message || "Lỗi khi lưu phản hồi.");
    } finally {
      setIsFixingFlag(false);
    }
  };

  // Handle Reopen Flag
  const handleReopenFlag = async (flagId: number) => {
    setReopeningFlagId(flagId);
    try {
      await reopenFlag(courseId, flagId);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi bỏ đánh dấu.");
    } finally {
      setReopeningFlagId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          1. BANNER TRẠNG THÁI KHOÁ HỌC (S25)
          ───────────────────────────────────────────────────────────── */}
      {course.status === "draft" && (
        <Card className="border border-border/70 bg-muted/30">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-full p-1.5 bg-primary/10 text-primary mt-0.5">
              <Clock className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Bản nháp</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hoàn thành danh sách điều kiện bên dưới rồi gửi yêu cầu xuất bản để quản trị viên phê duyệt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {course.status === "pending" && (
        <Card className="border border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-full p-1.5 bg-warning/10 text-warning mt-0.5">
              <Clock className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-warning">Chờ duyệt</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đã gửi yêu cầu xuất bản. Trong thời gian này, nội dung khoá học ở chế độ chỉ đọc.
                Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {course.status === "rejected" && (
        <Card
          className={`border ${
            course.reviewOutcome === "changes"
              ? "border-warning/40 bg-warning/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <div
              className={`rounded-full p-1.5 mt-0.5 ${
                course.reviewOutcome === "changes"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <AlertTriangle className="size-4" />
            </div>
            <div className="space-y-1">
              <p
                className={`font-semibold text-sm ${
                  course.reviewOutcome === "changes" ? "text-warning" : "text-destructive"
                }`}
              >
                {course.reviewOutcome === "changes"
                  ? "Quản trị viên yêu cầu sửa"
                  : "Khoá học bị từ chối"}
              </p>
              {course.rejectReason && (
                <p className="text-xs text-foreground font-medium bg-background/60 p-2.5 rounded-md border border-border/50">
                  {course.rejectReason}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {course.reviewOutcome === "changes"
                  ? "Sửa theo các góp ý chi tiết bên dưới, đánh dấu đã sửa rồi bấm 'Sửa và gửi lại'."
                  : "Khoá học chưa đạt tiêu chuẩn. Bạn có thể sửa đổi nội dung rồi gửi lại thành vòng duyệt mới."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {course.status === "published" && (
        <Card className="border border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-full p-1.5 bg-success/10 text-success mt-0.5">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-success">Đã xuất bản</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Khoá học đang được bán trên hệ thống với giá:{" "}
                <strong className="text-foreground">
                  {course.price > 0 ? `${course.price.toLocaleString("vi-VN")} đ` : "Miễn phí"}
                </strong>{" "}
                (do quản trị viên xác nhận).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {course.status === "hidden" && (
        <Card className="border border-warning/40 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-full p-1.5 bg-warning/10 text-warning mt-0.5">
              <AlertCircle className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-warning">Khoá học đã ẩn</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lý do ẩn: <strong className="text-foreground">{course.hiddenReason || "Chưa nêu"}</strong>.
                Học viên đã mua vẫn tiếp tục học được; học viên mới không thể mua khoá học này.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. KẾT QUẢ DUYỆT CỦA VÒNG GẦN NHẤT (reviewBlock)
          ───────────────────────────────────────────────────────────── */}
      {round && (
        <Card className="border border-border/80">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <span>Kết quả kiểm duyệt lần {round.round}</span>
                  <Badge className="text-xs font-normal border-border bg-muted text-muted-foreground">
                    {round.status === "in_review"
                      ? "Đang duyệt"
                      : round.status === "changes_requested"
                        ? "Yêu cầu sửa"
                        : round.status === "approved"
                          ? "Đã duyệt"
                          : "Từ chối"}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {round.reviewedAt
                    ? `Kết luận lúc ${new Date(round.reviewedAt).toLocaleString("vi-VN")}`
                    : `Gửi duyệt lúc ${new Date(round.requestedAt).toLocaleString("vi-VN")}`}
                  {round.reviewNote ? ` · Lời nhắn: ${round.reviewNote}` : ""}
                </CardDescription>
              </div>

              {openFlags.length > 0 ? (
                <Badge className="bg-warning/10 text-warning border-warning/20">
                  {openFlags.length} góp ý cần xử lý
                </Badge>
              ) : round.flags.length > 0 ? (
                <Badge className="bg-success/10 text-success border-success/20">
                  Đã xử lý tất cả góp ý
                </Badge>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-6">
            {/* Danh sách 7 tiêu chí */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Kết quả theo tiêu chí
              </p>
              <div className="grid grid-cols-1 divide-y divide-border/40 rounded-lg border border-border/60 overflow-hidden bg-card">
                {CRITERIA.map((crit) => {
                  const item = round.criteria[crit.id];
                  const status = item?.status;

                  return (
                    <div
                      key={crit.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{crit.label}</p>
                        {item?.note && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">Ghi chú:</span>
                            {item.note}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {status === "pass" && (
                          <Badge className="bg-success/10 text-success border-success/20">
                            Đạt
                          </Badge>
                        )}
                        {status === "fix" && (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                            Cần sửa
                          </Badge>
                        )}
                        {status === "na" && (
                          <Badge className="bg-muted text-muted-foreground border-border">
                            Không áp dụng
                          </Badge>
                        )}
                        {!status && (
                          <Badge className="bg-muted text-muted-foreground border-border">
                            Chưa chấm
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Danh sách cờ góp ý chi tiết */}
            {round.flags.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Góp ý chi tiết ({round.flags.length})
                </p>
                <div className="space-y-3">
                  {round.flags.map((flag) => {
                    const isClosed = flag.status === "closed";
                    const isFixed = flag.status === "fixed";
                    const isOpen = flag.status === "open";

                    return (
                      <div
                        key={flag.id}
                        className={`p-4 rounded-lg border text-sm space-y-2.5 transition-colors ${
                          isClosed
                            ? "border-border/40 bg-muted/10 opacity-75"
                            : isFixed
                              ? "border-primary/30 bg-primary/5"
                              : "border-border bg-card shadow-sm"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              className={
                                flag.severity === "must"
                                  ? "bg-destructive/10 text-destructive border-destructive/20 font-semibold"
                                  : "bg-warning/10 text-warning border-warning/20"
                              }
                            >
                              {SEVERITY[flag.severity]}
                            </Badge>

                            <Badge
                              className={
                                isClosed
                                  ? "bg-success/10 text-success border-success/20"
                                  : isFixed
                                    ? "bg-primary/10 text-primary border-primary/20"
                                    : "bg-muted text-muted-foreground border-border"
                              }
                            >
                              {FLAG_STATUS[flag.status]}
                            </Badge>

                            {flag.source === "ai" && (
                              <Badge className="bg-primary/5 text-primary border-primary/20 text-xs">
                                <Sparkles className="size-3 mr-1" />
                                AI đề xuất
                              </Badge>
                            )}

                            {flag.carried && (
                              <Badge className="bg-muted text-muted-foreground text-xs border-border">
                                Vòng trước
                              </Badge>
                            )}
                          </div>

                          <span className="text-xs text-muted-foreground font-mono">
                            {flag.targetLabel}
                          </span>
                        </div>

                        <p className="text-foreground leading-relaxed">{flag.comment}</p>

                        {/* Phản hồi của giảng viên */}
                        {flag.lecturerReply && (
                          <div className="p-2.5 rounded bg-muted/40 border border-border/40 text-xs text-foreground space-y-1">
                            <span className="font-semibold text-primary flex items-center gap-1">
                              <Check className="size-3" />
                              Bạn đã phản hồi:
                            </span>
                            <p className="text-muted-foreground">{flag.lecturerReply}</p>
                          </div>
                        )}

                        {/* Các nút hành động cho cờ */}
                        <div className="pt-1 flex flex-wrap items-center gap-2.5">
                          <Link
                            href={targetHref(courseId, flag.target || { type: "lesson", label: flag.targetLabel }) as any}
                            className={buttonVariants({
                              variant: "secondary",
                              size: "sm",
                              className: "h-8 text-xs font-normal",
                            })}
                          >
                            <ExternalLink className="size-3.5 mr-1.5" />
                            Mở để sửa
                          </Link>

                          {!isLocked && (
                            <>
                              {isOpen && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => handleOpenFixDialog(flag)}
                                >
                                  <Check className="size-3.5 mr-1.5 text-primary" />
                                  Đánh dấu đã sửa
                                </Button>
                              )}

                              {isFixed && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={reopeningFlagId === Number(flag.id)}
                                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleReopenFlag(Number(flag.id))}
                                >
                                  <RotateCcw className="size-3.5 mr-1.5" />
                                  Bỏ đánh dấu
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cảnh báo cờ bắt buộc sửa còn mở */}
            {hasOpenMustFlags && canSubmit && (
              <div className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-xs text-warning flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  Khoá học còn góp ý <strong>&quot;Bắt buộc sửa&quot;</strong> chưa được xử lý.
                  Vui lòng chỉnh sửa nội dung và đánh dấu đã sửa để đảm bảo khoá học được duyệt.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. ĐIỀU KIỆN XUẤT BẢN: thẻ yêu cầu (mockup publishTab / readiness)
          ───────────────────────────────────────────────────────────── */}
      <Card className="gap-0 border border-border/80 py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 px-5 py-4">
          <CardTitle className="text-base font-semibold">Điều kiện xuất bản</CardTitle>
          <span className="text-sm text-muted-foreground">
            {passedItemsCount}/{totalItemsCount} đạt
          </span>
        </CardHeader>

        <CardContent className="space-y-3 p-5">
          {readiness.items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3"
            >
              {item.ok ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <AlertCircle className="size-5 shrink-0 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.ok ? "Đã đạt" : item.hint}</p>
              </div>
              {item.ok ? (
                <Badge className="border-success/20 bg-success/10 font-medium text-success">Đạt</Badge>
              ) : (
                <Link
                  href={item.href as any}
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 text-xs" })}
                >
                  Sửa ngay
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canSubmit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!readiness.allOk || isSubmitting}
            className="cursor-pointer gap-2"
            onClick={() => setShowConfirmModal(true)}
          >
            <Send className="size-4" />
            {course.status === "rejected" ? "Sửa và gửi lại" : "Gửi yêu cầu xuất bản"}
          </Button>
          {!readiness.allOk && (
            <span className="text-sm text-muted-foreground">
              Hoàn thành {totalItemsCount - passedItemsCount} điều kiện còn thiếu để gửi.
            </span>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. DIALOG XÁC NHẬN GỬI DUYỆT (tc-submit)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Gửi yêu cầu xuất bản?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Khoá học &quot;{course.title}&quot; sẽ chuyển sang trạng thái <strong>Chờ duyệt</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 text-sm space-y-2 text-foreground">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trong lúc chờ duyệt, nội dung khoá học ở chế độ <strong>chỉ đọc</strong>. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán hoặc gửi góp ý.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sau khi có kết quả, bạn có thể chỉnh sửa như bình thường.
            </p>

            {submitError && (
              <p className="text-xs text-destructive font-medium p-2.5 rounded bg-destructive/10 border border-destructive/20 mt-2">
                {submitError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(false)}
            >
              Huỷ
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleSubmitCourse}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Clock className="size-4 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Gửi yêu cầu
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          5. DIALOG ĐÁNH DẤU CỜ ĐÃ SỬA (tc-flag-fixed)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!fixingFlag} onOpenChange={(open: boolean) => !open && setFixingFlag(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">Đánh dấu góp ý đã sửa?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Vị trí: <strong className="text-foreground">{fixingFlag?.targetLabel}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs space-y-1">
              <span className="font-semibold text-foreground">Góp ý từ người duyệt:</span>
              <p className="text-muted-foreground">{fixingFlag?.comment}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Bạn đã chỉnh sửa nội dung gì? <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Ví dụ: Đã đổi đáp án đúng thành 'A' và bổ sung giải thích chi tiết..."
                value={flagReply}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFlagReply(e.target.value)}
                disabled={isFixingFlag}
                className="text-sm"
              />
              <span className="text-xs text-muted-foreground">
                Ít nhất 5 ký tự để người duyệt nắm rõ nội dung đã sửa.
              </span>
              {flagReplyError && (
                <p className="text-xs text-destructive font-medium">{flagReplyError}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              disabled={isFixingFlag}
              onClick={() => setFixingFlag(null)}
            >
              Huỷ
            </Button>
            <Button
              disabled={isFixingFlag}
              onClick={handleSubmitFlagFix}
              className="gap-2"
            >
              {isFixingFlag ? "Đang lưu..." : "Xác nhận đã sửa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
