"use client";

import { useEffect, useRef, useState } from "react";
import { PublicationPreviewClient } from "./publication-preview-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  HelpCircle,
  Info,
  ListTree,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Input } from "@codi-1/ui/components/input";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  aiPrecheck,
  CRITERIA,
  FLAG_STATUS,
  ROUND_STATUS,
  SEVERITY,
  type ReviewCriterionId,
  type ReviewCriterionStatus,
  type ReviewFlagDto,
  type ReviewFlagSeverity,
} from "@/lib/publication-service";
import {
  addReviewFlag,
  applyAutoCriteria,
  approvePublication,
  deleteReviewFlag,
  rejectPublication,
  requestChanges,
  saveCriterionVerdict,
  updateFlagStatus,
  type AdminCourseReviewDetailDto,
  type AdminPublicationQueueDto,
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

interface PublicationReviewClientProps {
  queue: AdminPublicationQueueDto;
  selectedCourseId?: string;
  detail: AdminCourseReviewDetailDto | null;
}

export function PublicationReviewClient({
  queue,
  selectedCourseId,
  detail,
}: PublicationReviewClientProps) {
  const router = useRouter();

  // Active view tab inside course detail: 'criteria' | 'content' | 'flags' | 'history'
  const [activeView, setActiveView] = useState<"criteria" | "content" | "flags" | "history">("criteria");

  // Selected lesson inside content tab
  const [selectedLessonId, setSelectedLessonId] = useState<string>("entry");

  // Price draft for decision
  const [priceInput, setPriceInput] = useState<string>(
    detail?.course?.proposedPrice !== undefined && detail?.course?.proposedPrice !== null
      ? String(detail.course.proposedPrice)
      : String(detail?.course?.price || "0")
  );
  const [priceError, setPriceError] = useState<string | null>(null);

  // Criteria note draft
  const [criteriaNotes, setCriteriaNotes] = useState<Record<string, string>>(() => {
    const notes: Record<string, string> = {};
    if (detail?.round?.criteria) {
      for (const [k, v] of Object.entries(detail.round.criteria)) {
        notes[k] = v.note || "";
      }
    }
    return notes;
  });

  // Action loading states
  const [isApplyingAuto, setIsApplyingAuto] = useState(false);
  const [savingCriterionId, setSavingCriterionId] = useState<string | null>(null);

  // Flag dialog state
  const [flagModalTarget, setFlagModalTarget] = useState<{
    targetType: string;
    lessonId?: string | null;
    targetLabel: string;
  } | null>(null);
  const [flagSeverity, setFlagSeverity] = useState<ReviewFlagSeverity>("must");
  const [flagComment, setFlagComment] = useState("");
  const [flagError, setFlagError] = useState<string | null>(null);
  const [isAddingFlag, setIsAddingFlag] = useState(false);

  // AI precheck runner state
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ target: any; severity: ReviewFlagSeverity; comment: string; done?: boolean }> | null
  >(null);
  const [isRunningAi, setIsRunningAi] = useState(false);

  // Decision modals state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // S32b Student preview modal state
  const [showStudentPreview, setShowStudentPreview] = useState(false);

  // Track course/round identity to reset draft state when queue selection changes (Finding 4)
  const currentIdentity = `${detail?.course?.id ?? ""}:${detail?.round?.id ?? ""}`;
  const lastIdentityRef = useRef<string>(currentIdentity);

  useEffect(() => {
    if (lastIdentityRef.current !== currentIdentity) {
      lastIdentityRef.current = currentIdentity;
      // Reset price draft
      setPriceInput(
        detail?.course?.proposedPrice !== undefined && detail?.course?.proposedPrice !== null
          ? String(detail.course.proposedPrice)
          : String(detail?.course?.price || "0")
      );
      setPriceError(null);

      // Reset criteria notes
      const notes: Record<string, string> = {};
      if (detail?.round?.criteria) {
        for (const [k, v] of Object.entries(detail.round.criteria)) {
          notes[k] = v.note || "";
        }
      }
      setCriteriaNotes(notes);

      // Reset AI precheck runner
      setAiSuggestions(null);
      setIsRunningAi(false);

      // Reset flag modal
      setFlagModalTarget(null);
      setFlagComment("");
      setFlagError(null);
      setIsAddingFlag(false);

      // Reset decision modals
      setShowApproveModal(false);
      setIsApproving(false);
      setApproveError(null);
      setShowRequestModal(false);
      setRequestReason("");
      setIsRequesting(false);
      setRequestError(null);
      setShowRejectModal(false);
      setRejectReason("");
      setIsRejecting(false);
      setRejectError(null);

      // Reset selections
      setSelectedLessonId("entry");
      setActiveView("criteria");
      setShowStudentPreview(false);
    }
  }, [
    currentIdentity,
    detail?.course?.proposedPrice,
    detail?.course?.price,
    detail?.round?.criteria,
  ]);

  const isReadOnly = detail?.round?.status !== "in_review";

  // Handle Criterion Status Click
  const handleToggleCriterion = async (
    criterionId: ReviewCriterionId,
    newStatus: ReviewCriterionStatus
  ) => {
    if (!detail || isReadOnly) return;
    const currentStatus = detail.round.criteria[criterionId]?.status;
    const finalStatus = currentStatus === newStatus ? null : newStatus;

    setSavingCriterionId(criterionId);
    try {
      await saveCriterionVerdict(
        detail.round.id,
        criterionId,
        finalStatus,
        criteriaNotes[criterionId] || null
      );
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi lưu tiêu chí.");
    } finally {
      setSavingCriterionId(null);
    }
  };

  // Handle Criterion Note Blur
  const handleCriterionNoteBlur = async (criterionId: ReviewCriterionId) => {
    if (!detail || isReadOnly) return;
    const currentStatus = detail.round.criteria[criterionId]?.status || null;
    const note = criteriaNotes[criterionId];

    try {
      await saveCriterionVerdict(detail.round.id, criterionId, currentStatus, note);
    } catch {
      // silent
    }
  };

  // Handle Apply Auto Criteria
  const handleApplyAuto = async () => {
    if (!detail || isReadOnly) return;
    setIsApplyingAuto(true);
    try {
      await applyAutoCriteria(detail.round.id, detail.course.id);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi điền tự động.");
    } finally {
      setIsApplyingAuto(false);
    }
  };

  // Open Flag Modal
  const handleOpenFlagModal = (target: {
    targetType: string;
    lessonId?: string | null;
    targetLabel: string;
  }) => {
    setFlagModalTarget(target);
    setFlagSeverity("must");
    setFlagComment("");
    setFlagError(null);
  };

  // Save Flag
  const handleSaveFlag = async () => {
    if (!detail || !flagModalTarget) return;
    if (flagComment.trim().length < 10) {
      setFlagError("Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.");
      return;
    }

    setIsAddingFlag(true);
    setFlagError(null);
    try {
      await addReviewFlag(detail.course.id, detail.round.id, {
        targetType: flagModalTarget.targetType,
        lessonId: flagModalTarget.lessonId,
        targetLabel: flagModalTarget.targetLabel,
        severity: flagSeverity,
        comment: flagComment.trim(),
        source: "admin",
      });
      setFlagModalTarget(null);
      router.refresh();
    } catch (err: any) {
      setFlagError(err.message || "Lỗi khi gắn cờ.");
    } finally {
      setIsAddingFlag(false);
    }
  };

  // Update Flag Status (Open <-> Closed)
  const handleToggleFlagStatus = async (flagId: number, currentStatus: string) => {
    if (isReadOnly) return;
    const newStatus = currentStatus === "closed" ? "open" : "closed";
    try {
      await updateFlagStatus(flagId, newStatus as any);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi cập nhật cờ.");
    }
  };

  // Delete Flag
  const handleDeleteFlag = async (flagId: number) => {
    if (isReadOnly) return;
    if (!confirm("Bạn có chắc chắn muốn xoá cờ này?")) return;
    try {
      await deleteReviewFlag(flagId);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi xoá cờ.");
    }
  };

  // AI Pre-check Runner
  const handleRunAiPrecheck = () => {
    if (!detail) return;
    setIsRunningAi(true);
    setTimeout(() => {
      const suggestions = aiPrecheck(detail.course);
      // Filter out duplicates with existing flags
      const existing = new Set(detail.round.flags.map((f) => `${f.targetLabel}|${f.comment}`));
      const fresh = suggestions.filter((s) => !existing.has(`${s.target.label}|${s.comment}`));
      setAiSuggestions(fresh.map((s) => ({ ...s, done: false })));
      setIsRunningAi(false);
    }, 600);
  };

  // Accept AI Suggestion
  const handleAcceptAiSuggestion = async (index: number) => {
    if (!detail || !aiSuggestions) return;
    const item = aiSuggestions[index];
    if (!item) return;

    try {
      await addReviewFlag(detail.course.id, detail.round.id, {
        targetType: item.target.type,
        lessonId: item.target.lessonId,
        targetLabel: item.target.label,
        severity: item.severity,
        comment: item.comment,
        source: "ai",
      });
      const updated = [...aiSuggestions];
      updated[index] = { ...item, done: true };
      setAiSuggestions(updated);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Lỗi khi thêm cờ từ AI.");
    }
  };

  // Approve Decision
  const handleApprove = async () => {
    if (!detail) return;
    const parsedPrice = Number(priceInput.replace(/[^\d]/g, ""));
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setApproveError("Giá bán phải là số nguyên không âm (VND).");
      return;
    }

    setIsApproving(true);
    setApproveError(null);
    try {
      await approvePublication(detail.course.id, detail.round.id, parsedPrice);
      setShowApproveModal(false);
      router.push(`/dashboard/admin/publication?tab=approved&id=${detail.course.id}` as any);
      router.refresh();
    } catch (err: any) {
      setApproveError(err.message || "Lỗi khi phê duyệt.");
    } finally {
      setIsApproving(false);
    }
  };

  // Request Changes Decision
  const handleRequestChanges = async () => {
    if (!detail) return;
    if (requestReason.trim().length < 5) {
      setRequestError("Vui lòng nhập lời nhắn chung cho giảng viên (ít nhất 5 ký tự).");
      return;
    }

    setIsRequesting(true);
    setRequestError(null);
    try {
      await requestChanges(detail.course.id, detail.round.id, requestReason.trim());
      setShowRequestModal(false);
      router.push(`/dashboard/admin/publication?tab=changes&id=${detail.course.id}` as any);
      router.refresh();
    } catch (err: any) {
      setRequestError(err.message || "Lỗi khi gửi yêu cầu sửa.");
    } finally {
      setIsRequesting(false);
    }
  };

  // Reject Decision
  const handleReject = async () => {
    if (!detail) return;
    if (rejectReason.trim().length < 5) {
      setRejectError("Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).");
      return;
    }

    setIsRejecting(true);
    setRejectError(null);
    try {
      await rejectPublication(detail.course.id, detail.round.id, rejectReason.trim());
      setShowRejectModal(false);
      router.push(`/dashboard/admin/publication?tab=changes&id=${detail.course.id}` as any);
      router.refresh();
    } catch (err: any) {
      setRejectError(err.message || "Lỗi khi từ chối.");
    } finally {
      setIsRejecting(false);
    }
  };

  // Flattened lessons list for content viewer
  const allLessons = detail?.course?.chapters.flatMap((ch) => ch.lessons || []) || [];
  const currentSelectedLesson =
    selectedLessonId === "entry"
      ? "entry"
      : allLessons.find((l) => l.id === selectedLessonId) || allLessons[0];

  const markedCriteriaCount = detail
    ? CRITERIA.filter((k) => !!detail.round.criteria[k.id]?.status).length
    : 0;

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          HEADER & QUEUE TABS (S32)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Duyệt xuất bản</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chấm từng tiêu chí, xem trước nội dung học viên, gắn cờ chỗ cần sửa rồi kết luận phê duyệt.
          </p>
        </div>
      </div>

      {/* Tabs Filter Queue */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Link
          href={"/dashboard/admin/publication?tab=pending" as any}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            queue.tab === "pending"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          <span>Chờ duyệt</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold ${
              queue.tab === "pending"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {queue.counts.pending}
          </span>
        </Link>

        <Link
          href={"/dashboard/admin/publication?tab=changes" as any}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            queue.tab === "changes"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          <span>Cần sửa / từ chối</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold ${
              queue.tab === "changes"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {queue.counts.changes}
          </span>
        </Link>

        <Link
          href={"/dashboard/admin/publication?tab=approved" as any}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            queue.tab === "approved"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          <span>Đã duyệt</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold ${
              queue.tab === "approved"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {queue.counts.approved}
          </span>
        </Link>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SPLIT VIEW LAYOUT: DANH SÁCH BÊN TRÁI & CHI TIẾT BÊN PHẢI
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI: DANH SÁCH KHOÁ HỌC TRONG HÀNG ĐỢI (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Danh sách khoá học ({queue.items.length})
          </p>

          {queue.items.length === 0 ? (
            <Card className="border border-dashed border-border/80">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                Không có khoá học nào trong hàng đợi này.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {queue.items.map((item) => {
                const isSelected = item.id === (detail?.course?.id || selectedCourseId);

                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/admin/publication?tab=${queue.tab}&id=${item.id}` as any}
                    className={`block p-4 rounded-xl border text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                        : "border-border/70 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground line-clamp-2 leading-snug">
                        {item.title}
                      </p>
                      {item.openFlagsCount > 0 && (
                        <Badge className="bg-warning/10 text-warning border-warning/20 shrink-0 text-xs font-semibold">
                          <Flag className="size-3 mr-0.5" />
                          {item.openFlagsCount}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.instructorName}
                      </span>
                      <span>·</span>
                      <span>Vòng {item.round}</span>
                      <span>·</span>
                      <span>{new Date(item.submittedAt).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* CỘT PHẢI: CHI TIẾT KIỂM DUYỆT (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {!detail ? (
            <Card className="border border-dashed border-border/80">
              <CardContent className="p-12 text-center text-muted-foreground">
                <ListTree className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-base font-medium text-foreground">Chưa chọn khoá học</p>
                <p className="text-xs mt-1">Chọn một khoá học từ danh sách bên trái để tiến hành kiểm duyệt.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Card tiêu đề và thông tin chung khoá học */}
              <Card className="border border-border/80 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs font-normal border-border bg-muted text-muted-foreground">
                          Vòng {detail.round.round}
                        </Badge>
                        <Badge
                          className={
                            detail.round.status === "in_review"
                              ? "bg-warning/10 text-warning border-warning/20 font-semibold"
                              : detail.round.status === "approved"
                                ? "bg-success/10 text-success border-success/20 font-semibold"
                                : "bg-destructive/10 text-destructive border-destructive/20 font-semibold"
                          }
                        >
                          {ROUND_STATUS[detail.round.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {detail.course.category} · {detail.course.level}
                        </span>
                      </div>
                      <CardTitle className="text-xl leading-snug">{detail.course.title}</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Giảng viên: <strong className="text-foreground">{detail.instructor?.name || "Giảng viên"}</strong> ({detail.instructor?.email})
                        {" · "}Gửi lúc: {new Date(detail.round.requestedAt).toLocaleString("vi-VN")}
                      </CardDescription>
                    </div>

                    <div className="shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-2 cursor-pointer shadow-sm text-xs"
                        onClick={() => setShowStudentPreview(true)}
                      >
                        <Eye className="size-3.5 text-primary" />
                        Xem trước nội dung
                      </Button>
                    </div>
                  </div>

                  {/* Banner cảnh báo nếu giảng viên đã sửa cờ */}
                  {detail.round.flags.some((f) => f.carried && f.status === "fixed") && (
                    <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-primary/5 text-xs text-primary flex items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>
                        Giảng viên đã sửa{" "}
                        <strong>
                          {detail.round.flags.filter((f) => f.carried && f.status === "fixed").length} cờ
                        </strong>{" "}
                        của vòng trước. Vui lòng kiểm tra lại nội dung rồi bấm &quot;Đóng cờ&quot; ở thẻ Cờ.
                      </span>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* Tabs chuyển đổi giữa: Tiêu chí, Nội dung, Cờ, Lịch sử */}
                  <div className="flex items-center gap-1 border-b border-border/50 pb-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveView("criteria")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        activeView === "criteria"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      Tiêu chí ({markedCriteriaCount}/{CRITERIA.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView("content")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        activeView === "content"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      Nội dung bài học
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView("flags")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeView === "flags"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <span>Cờ góp ý</span>
                      {detail.round.flags.filter((f) => f.status !== "closed").length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-xs bg-warning/15 text-warning font-bold">
                          {detail.round.flags.filter((f) => f.status !== "closed").length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView("history")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        activeView === "history"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      Lịch sử vòng duyệt ({detail.roundsHistory.length})
                    </button>
                  </div>

                  {/* ─────────────────────────────────────────────────────────
                      TAB VIEW 1: TIÊU CHÍ (CRITERIA)
                      ───────────────────────────────────────────────────────── */}
                  {activeView === "criteria" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          {markedCriteriaCount}/{CRITERIA.length} tiêu chí đã chấm
                        </span>

                        {!isReadOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isApplyingAuto}
                            onClick={handleApplyAuto}
                            className="gap-1.5 h-8 text-xs cursor-pointer"
                          >
                            <Sparkles className="size-3.5 text-primary" />
                            {isApplyingAuto ? "Đang điền..." : "Điền theo gợi ý tự động"}
                          </Button>
                        )}
                      </div>

                      <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden bg-card">
                        {CRITERIA.map((crit) => {
                          const current = detail.round.criteria[crit.id] || { status: null, note: "" };
                          const auto = detail.autoCriteria[crit.id];

                          return (
                            <div key={crit.id} className="p-4 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="font-semibold text-sm text-foreground">{crit.label}</p>
                                  <p className="text-xs text-muted-foreground leading-relaxed">{crit.help}</p>

                                  {/* Auto criteria suggestion */}
                                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium pt-0.5">
                                    <Sparkles className="size-3 shrink-0" />
                                    <span>
                                      Gợi ý:{" "}
                                      <strong>
                                        {auto.status === "pass"
                                          ? "Đạt"
                                          : auto.status === "fix"
                                            ? "Cần sửa"
                                            : auto.status === "na"
                                              ? "Không áp dụng"
                                              : "Người duyệt tự xác nhận"}
                                      </strong>{" "}
                                      — {auto.why}
                                    </span>
                                  </div>
                                </div>

                                {/* Segmented control Đạt / Cần sửa / Không áp dụng */}
                                <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-muted/20 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isReadOnly || savingCriterionId === crit.id}
                                    onClick={() => handleToggleCriterion(crit.id, "pass")}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                      current.status === "pass"
                                        ? "bg-success text-success-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    Đạt
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isReadOnly || savingCriterionId === crit.id}
                                    onClick={() => handleToggleCriterion(crit.id, "fix")}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                      current.status === "fix"
                                        ? "bg-destructive text-destructive-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    Cần sửa
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isReadOnly || savingCriterionId === crit.id}
                                    onClick={() => handleToggleCriterion(crit.id, "na")}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                      current.status === "na"
                                        ? "bg-muted-foreground text-card shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    K.Áp dụng
                                  </button>
                                </div>
                              </div>

                              {/* Note Input */}
                              <Input
                                placeholder={
                                  current.status === "fix"
                                    ? "Ghi rõ cần sửa gì (bắt buộc)"
                                    : "Ghi chú cho tiêu chí này (không bắt buộc)"
                                }
                                value={criteriaNotes[crit.id] || ""}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  setCriteriaNotes({ ...criteriaNotes, [crit.id]: e.target.value })
                                }
                                onBlur={() => handleCriterionNoteBlur(crit.id)}
                                className="text-xs h-9"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────
                      TAB VIEW 2: NỘI DUNG BÀI HỌC (CONTENT)
                      ───────────────────────────────────────────────────────── */}
                  {activeView === "content" && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Outline syllabus bên trái (4 cols) */}
                      <div className="md:col-span-4 border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40 bg-card">
                        <button
                          type="button"
                          onClick={() => setSelectedLessonId("entry")}
                          className={`w-full p-3 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                            selectedLessonId === "entry"
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted/30 text-foreground"
                          }`}
                        >
                          <span>Bài kiểm tra đầu vào</span>
                          <Badge className="bg-muted text-muted-foreground text-[10px]">
                            {detail.course.entryTest?.questions?.length || 0} câu
                          </Badge>
                        </button>

                        {detail.course.chapters.map((ch) => (
                          <div key={ch.id} className="p-2 space-y-1">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-2 py-1">
                              {ch.title}
                            </p>
                            <div className="space-y-0.5">
                              {ch.lessons.map((l) => {
                                const isSel = selectedLessonId === l.id;
                                const lessonFlags = detail.round.flags.filter(
                                  (f) => f.target?.lessonId === l.id && f.status !== "closed"
                                );

                                return (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => setSelectedLessonId(l.id)}
                                    className={`w-full p-2 rounded-lg text-left text-xs transition-colors flex items-center justify-between cursor-pointer ${
                                      isSel
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "hover:bg-muted/40 text-foreground"
                                    }`}
                                  >
                                    <span className="truncate pr-1">{l.title}</span>
                                    {lessonFlags.length > 0 && (
                                      <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                          isSel
                                            ? "bg-primary-foreground/20 text-primary-foreground"
                                            : "bg-warning/20 text-warning"
                                        }`}
                                      >
                                        {lessonFlags.length}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Lesson Preview bên phải (8 cols) */}
                      <div className="md:col-span-8 p-4 rounded-xl border border-border/60 bg-card space-y-5">
                        {currentSelectedLesson === "entry" ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border/40 pb-3">
                              <div>
                                <h3 className="font-semibold text-sm text-foreground">Bài kiểm tra đầu vào</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {detail.course.entryTest?.questions?.length || 0} câu hỏi trắc nghiệm
                                </p>
                              </div>

                              {!isReadOnly && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1.5"
                                  onClick={() =>
                                    handleOpenFlagModal({
                                      targetType: "course",
                                      targetLabel: "Bài kiểm tra đầu vào",
                                    })
                                  }
                                >
                                  <Flag className="size-3.5 text-warning" />
                                  Gắn cờ
                                </Button>
                              )}
                            </div>

                            <div className="space-y-4">
                              {(detail.course.entryTest?.questions || []).map((q, idx) => (
                                <div key={q.id || idx} className="p-3.5 rounded-xl border border-border/60 bg-muted/10 text-xs space-y-2.5">
                                  <div className="flex items-start justify-between gap-2 font-medium text-foreground">
                                    <span className="font-semibold text-foreground leading-snug">
                                      Câu {idx + 1}: {q.text}
                                    </span>
                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenFlagModal({
                                            targetType: "question",
                                            lessonId: null,
                                            targetLabel: `Câu ${idx + 1}: ${q.text.slice(0, 30)}`,
                                          })
                                        }
                                        className="text-muted-foreground hover:text-warning shrink-0 p-1"
                                        title="Gắn cờ câu hỏi này"
                                      >
                                        <Flag className="size-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {/* AI metadata */}
                                  {q.aiGenerated == null && <p className="text-2xs text-muted-foreground">Nguồn AI / trạng thái duyệt: chưa có dữ liệu.</p>}
                                  {q.aiGenerated && (
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs px-1.5 py-0 h-4 gap-1">
                                        <Sparkles className="size-2.5" />
                                        AI tạo
                                      </Badge>
                                      {q.aiReviewed ? (
                                        <span className="text-2xs text-muted-foreground font-medium">✓ GV đã duyệt</span>
                                      ) : (
                                        <span className="text-2xs text-warning font-semibold">⚠ GV chưa duyệt</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Real quiz options */}
                                  {q.options && q.options.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {q.options.map((opt, optIdx) => {
                                        const isCorrect = q.correctIndex === optIdx;
                                        const letter = String.fromCharCode(65 + optIdx);
                                        return (
                                          <div
                                            key={optIdx}
                                            className={`flex items-start justify-between gap-2 p-2 rounded-lg text-xs transition-colors ${
                                              isCorrect
                                                ? "bg-success/10 border border-success/30 text-foreground font-medium"
                                                : "bg-background/80 border border-border/50 text-muted-foreground"
                                            }`}
                                          >
                                            <div className="flex items-start gap-2">
                                              <span
                                                className={`inline-flex items-center justify-center size-5 rounded-full text-2xs font-semibold shrink-0 mt-0.5 ${
                                                  isCorrect
                                                    ? "bg-success text-success-foreground"
                                                    : "bg-muted text-muted-foreground"
                                                }`}
                                              >
                                                {letter}
                                              </span>
                                              <span className="leading-snug">{opt}</span>
                                            </div>
                                            {isCorrect && (
                                              <Badge className="bg-success/20 text-success border-success/30 text-2xs px-1.5 py-0 h-4 shrink-0 font-medium">
                                                Đáp án đúng
                                              </Badge>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-destructive font-medium">Chưa có phương án trả lời.</p>
                                  )}

                                  {q.explanation && (
                                    <div className="p-2 rounded bg-muted/20 border border-border/40 text-muted-foreground">
                                      <strong className="text-foreground">Giải thích:</strong> {q.explanation}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : currentSelectedLesson ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border/40 pb-3">
                              <div>
                                <h3 className="font-semibold text-sm text-foreground">
                                  {currentSelectedLesson.title}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Loại: <span className="uppercase font-mono">{currentSelectedLesson.type}</span>
                                </p>
                              </div>

                              {!isReadOnly && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1.5"
                                  onClick={() =>
                                    handleOpenFlagModal({
                                      targetType: "lesson",
                                      lessonId: currentSelectedLesson.id,
                                      targetLabel: `Bài: ${currentSelectedLesson.title}`,
                                    })
                                  }
                                >
                                  <Flag className="size-3.5 text-warning" />
                                  Gắn cờ bài này
                                </Button>
                              )}
                            </div>

                            {/* Materials / File */}
                            {["video", "pdf", "slide"].includes(currentSelectedLesson.type) && (
                              <div className="p-3 rounded-lg border border-border/50 bg-muted/10 text-xs space-y-1">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                  <FileText className="size-3.5 text-primary" />
                                  Tệp tài liệu:
                                </span>
                                {currentSelectedLesson.materials && currentSelectedLesson.materials.length > 0 ? (
                                  <ul className="list-disc pl-5 text-muted-foreground">
                                    {currentSelectedLesson.materials.map((m, mi) => (
                                      <li key={mi}>{m.title || m.fileName || m.url || "Tài liệu đính kèm"}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-destructive font-medium">Chưa có tệp tài liệu nào được đính kèm.</p>
                                )}
                              </div>
                            )}

                            {/* Reading content */}
                            {currentSelectedLesson.body && (
                              <div className="space-y-1 text-xs">
                                <span className="font-semibold text-foreground">Nội dung bài đọc:</span>
                                <p className="text-muted-foreground p-3 rounded-lg border border-border/40 bg-muted/10 whitespace-pre-wrap">
                                  {currentSelectedLesson.body}
                                </p>
                              </div>
                            )}

                            {/* Quiz if any */}
                            {currentSelectedLesson.quiz && (
                              <div className="space-y-2 text-xs">
                                <span className="font-semibold text-foreground">
                                  Quiz bài học ({currentSelectedLesson.quiz.questions.length} câu - đạt {currentSelectedLesson.quiz.passingScore}%):
                                </span>
                                <div className="space-y-2">
                                  {currentSelectedLesson.quiz.questions.map((q, qi) => (
                                    <div key={qi} className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-2">
                                      <div className="flex items-start justify-between gap-2 font-medium text-foreground">
                                        <span className="font-semibold text-foreground leading-snug">
                                          Câu {qi + 1}: {q.text}
                                        </span>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleOpenFlagModal({
                                                targetType: "question",
                                                lessonId: currentSelectedLesson.id,
                                                targetLabel: `Quiz bài "${currentSelectedLesson.title}" - Câu ${qi + 1}`,
                                              })
                                            }
                                            className="text-muted-foreground hover:text-warning shrink-0 p-1"
                                            title="Gắn cờ câu hỏi này"
                                          >
                                            <Flag className="size-3.5" />
                                          </button>
                                        )}
                                      </div>

                                      {/* AI metadata */}
                                  {q.aiGenerated == null && <p className="text-2xs text-muted-foreground">Nguồn AI / trạng thái duyệt: chưa có dữ liệu.</p>}
                                      {q.aiGenerated && (
                                        <div className="flex items-center gap-2">
                                          <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs px-1.5 py-0 h-4 gap-1">
                                            <Sparkles className="size-2.5" />
                                            AI tạo
                                          </Badge>
                                          {q.aiReviewed ? (
                                            <span className="text-2xs text-muted-foreground font-medium">✓ GV đã duyệt</span>
                                          ) : (
                                            <span className="text-2xs text-warning font-semibold">⚠ GV chưa duyệt</span>
                                          )}
                                        </div>
                                      )}

                                      {/* Real quiz options */}
                                      {q.options && q.options.length > 0 ? (
                                        <div className="space-y-1.5">
                                          {q.options.map((opt, optIdx) => {
                                            const isCorrect = q.correctIndex === optIdx;
                                            const letter = String.fromCharCode(65 + optIdx);
                                            return (
                                              <div
                                                key={optIdx}
                                                className={`flex items-start justify-between gap-2 p-2 rounded-lg text-xs transition-colors ${
                                                  isCorrect
                                                    ? "bg-success/10 border border-success/30 text-foreground font-medium"
                                                    : "bg-background/80 border border-border/50 text-muted-foreground"
                                                }`}
                                              >
                                                <div className="flex items-start gap-2">
                                                  <span
                                                    className={`inline-flex items-center justify-center size-5 rounded-full text-2xs font-semibold shrink-0 mt-0.5 ${
                                                      isCorrect
                                                        ? "bg-success text-success-foreground"
                                                        : "bg-muted text-muted-foreground"
                                                    }`}
                                                  >
                                                    {letter}
                                                  </span>
                                                  <span className="leading-snug">{opt}</span>
                                                </div>
                                                {isCorrect && (
                                                  <Badge className="bg-success/20 text-success border-success/30 text-2xs px-1.5 py-0 h-4 shrink-0 font-medium">
                                                    Đáp án đúng
                                                  </Badge>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="text-destructive font-medium">Chưa có phương án trả lời.</p>
                                      )}

                                      {q.explanation && (
                                        <div className="p-2 rounded bg-muted/20 border border-border/40 text-muted-foreground">
                                          <strong className="text-foreground">Giải thích:</strong> {q.explanation}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Code challenge if any */}
                            {currentSelectedLesson.code && (
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-foreground">Bài code thực hành:</span>
                                  {currentSelectedLesson.code.solutionCheck?.ok ? (
                                    <Badge className="bg-success/10 text-success border-success/20">
                                      Lời giải đạt {currentSelectedLesson.code.solutionCheck.passed}/{currentSelectedLesson.code.solutionCheck.total}
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                                      Lời giải chưa chạy đạt
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-muted-foreground">
                                  {currentSelectedLesson.code.tests.length} test cases ({currentSelectedLesson.code.tests.filter((t) => t.hidden).length} test ẩn).
                                </p>
                              </div>
                            )}

                            {/* Assignment if any */}
                            {currentSelectedLesson.assignment && (
                              <div className="space-y-2 text-xs">
                                <span className="font-semibold text-foreground">Bài tập tự luận:</span>
                                <p className="text-muted-foreground p-2.5 rounded border border-border/40 bg-muted/10">
                                  {currentSelectedLesson.assignment.instructions}
                                </p>
                                <span className="text-muted-foreground">
                                  Thang chấm điểm: {currentSelectedLesson.assignment.rubric?.length || 0} tiêu chí.
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────
                      TAB VIEW 3: CỜ GÓP Ý (FLAGS & AI PRECHECK)
                      ───────────────────────────────────────────────────────── */}
                  {activeView === "flags" && (
                    <div className="space-y-6">
                      {/* AI Pre-check Box */}
                      {!isReadOnly && (
                        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                                <Sparkles className="size-4" />
                                Rà soát bằng AI
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                AI quét toàn bộ khoá học theo các quy chuẩn kiểm duyệt và đề xuất cờ. Bạn chọn thêm hoặc bỏ qua từng cờ.
                              </p>
                            </div>

                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isRunningAi}
                              onClick={handleRunAiPrecheck}
                              className="h-8 text-xs shrink-0 cursor-pointer"
                            >
                              {isRunningAi ? "Đang quét..." : "Chạy rà soát AI"}
                            </Button>
                          </div>

                          {aiSuggestions && (
                            <div className="pt-2 border-t border-primary/20 space-y-2">
                              <p className="text-xs font-semibold text-foreground">
                                AI đề xuất {aiSuggestions.filter((x) => !x.done).length} cờ chưa xử lý:
                              </p>
                              {aiSuggestions.filter((x) => !x.done).length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Không có đề xuất cờ mới nào.</p>
                              ) : (
                                aiSuggestions.map((sug, si) =>
                                  sug.done ? null : (
                                    <div
                                      key={si}
                                      className="p-3 rounded-lg border border-border/60 bg-card text-xs space-y-1.5 flex items-start justify-between gap-3"
                                    >
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <Badge
                                            className={
                                              sug.severity === "must"
                                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                                : "bg-warning/10 text-warning border-warning/20"
                                            }
                                          >
                                            {SEVERITY[sug.severity]}
                                          </Badge>
                                          <span className="font-semibold text-foreground">{sug.target.label}</span>
                                        </div>
                                        <p className="text-muted-foreground mt-1">{sug.comment}</p>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => handleAcceptAiSuggestion(si)}
                                        >
                                          Thêm cờ
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs text-muted-foreground"
                                          onClick={() => {
                                            const u = [...aiSuggestions];
                                            u[si] = { ...sug, done: true };
                                            setAiSuggestions(u);
                                          }}
                                        >
                                          Bỏ qua
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Danh sách cờ hiện có */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Danh sách cờ trong vòng này ({detail.round.flags.length})
                        </p>

                        {detail.round.flags.length === 0 ? (
                          <div className="p-8 text-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                            Chưa có cờ nào. Bạn có thể gắn cờ từ tab &quot;Nội dung&quot; hoặc chạy &quot;Rà soát bằng AI&quot;.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {detail.round.flags.map((flag) => {
                              const isClosed = flag.status === "closed";
                              const isFixed = flag.status === "fixed";

                              return (
                                <div
                                  key={flag.id}
                                  className={`p-4 rounded-xl border text-sm space-y-2.5 transition-colors ${
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
                                            ? "bg-success/10 text-success border-success/20 font-semibold"
                                            : isFixed
                                              ? "bg-primary/10 text-primary border-primary/20 font-semibold"
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
                                        <Badge className="bg-muted text-muted-foreground border-border text-xs">
                                          Từ vòng trước
                                        </Badge>
                                      )}
                                    </div>

                                    <span className="text-xs text-muted-foreground font-mono">
                                      {flag.targetLabel}
                                    </span>
                                  </div>

                                  <p className="text-foreground text-xs leading-relaxed">{flag.comment}</p>

                                  {flag.lecturerReply && (
                                    <div className="p-2.5 rounded bg-muted/40 border border-border/40 text-xs space-y-1">
                                      <span className="font-semibold text-primary flex items-center gap-1">
                                        <Check className="size-3" />
                                        Giảng viên phản hồi:
                                      </span>
                                      <p className="text-muted-foreground">{flag.lecturerReply}</p>
                                    </div>
                                  )}

                                  {!isReadOnly && (
                                    <div className="pt-1 flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleToggleFlagStatus(Number(flag.id), flag.status)}
                                        className="h-7 text-xs"
                                      >
                                        {isClosed ? (
                                          <>
                                            <RotateCcw className="size-3 mr-1" />
                                            Mở lại cờ
                                          </>
                                        ) : (
                                          <>
                                            <Check className="size-3 mr-1 text-success" />
                                            Đóng cờ
                                          </>
                                        )}
                                      </Button>

                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteFlag(Number(flag.id))}
                                        className="h-7 text-xs text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="size-3 mr-1" />
                                        Xoá
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────
                      TAB VIEW 4: LỊCH SỬ CÁC VÒNG DUYỆT (HISTORY)
                      ───────────────────────────────────────────────────────── */}
                  {activeView === "history" && (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Lịch sử kiểm duyệt qua các vòng
                      </p>

                      <div className="space-y-3">
                        {detail.roundsHistory.map((item) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl border border-border/60 bg-card space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-foreground">
                                Vòng {item.round} · {ROUND_STATUS[item.status as keyof typeof ROUND_STATUS] || item.status}
                              </span>
                              <span className="text-muted-foreground">
                                Gửi: {new Date(item.requestedAt).toLocaleDateString("vi-VN")}
                                {item.reviewedAt ? ` · Kết luận: ${new Date(item.reviewedAt).toLocaleDateString("vi-VN")}` : ""}
                              </span>
                            </div>
                            <p className="text-muted-foreground">
                              {item.flagsCount} cờ ({item.closedFlagsCount} đã đóng)
                            </p>
                            {item.note && (
                              <p className="p-2 rounded bg-muted/40 border border-border/40 text-foreground font-medium mt-1">
                                Lời nhắn: {item.note}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ─────────────────────────────────────────────────────────
                  DECISION CARD: KẾT LUẬN VÒNG DUYỆT (CHỈ HIỂN THỊ KHI PENDING)
                  ───────────────────────────────────────────────────────── */}
              {!isReadOnly && (
                <Card className="border border-border/80 shadow-md">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <CardTitle className="text-base">Kết luận vòng {detail.round.round}</CardTitle>
                    <CardDescription className="text-xs">
                      Xác nhận giá bán và đưa ra quyết định duyệt, yêu cầu sửa hoặc từ chối khoá học.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4">
                    {/* Nhập giá bán */}
                    <div className="space-y-1.5 max-w-[320px]">
                      <label className="text-xs font-semibold text-foreground">
                        Giá bán (VND) <span className="text-destructive">*</span>
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="10000"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        placeholder="Nhập 0 cho khoá học miễn phí"
                        className="text-sm"
                      />
                      <span className="text-xs text-muted-foreground block">
                        Giảng viên đề xuất:{" "}
                        <strong className="text-foreground">
                          {detail.course.proposedPrice !== undefined && detail.course.proposedPrice !== null
                            ? `${detail.course.proposedPrice.toLocaleString("vi-VN")} đ`
                            : "chưa đề xuất"}
                        </strong>
                        . Nhập 0 cho khoá miễn phí.
                      </span>
                    </div>

                    {/* Kiểm tra điều kiện canApprove */}
                    {detail.blockingReasons.length > 0 ? (
                      <div className="p-3.5 rounded-lg border border-warning/30 bg-warning/5 text-xs text-warning space-y-1.5">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="size-4" />
                          Chưa thể duyệt khoá học vì còn:
                        </p>
                        <ul className="list-disc pl-5 space-y-0.5 text-foreground">
                          {detail.blockingReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-success/30 bg-success/5 text-xs text-success flex items-center gap-2">
                        <CheckCircle2 className="size-4" />
                        <span>Khoá học đã đủ mọi điều kiện để duyệt và xuất bản ngay.</span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="p-4 border-t border-border/50 bg-muted/20 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      disabled={detail.blockingReasons.length > 0}
                      onClick={() => setShowApproveModal(true)}
                      className="cursor-pointer shadow-sm gap-1.5"
                    >
                      <Check className="size-4" />
                      Duyệt và xuất bản
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowRequestModal(true)}
                      className="cursor-pointer gap-1.5"
                    >
                      <RotateCcw className="size-4 text-warning" />
                      Yêu cầu sửa
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRejectModal(true)}
                      className="cursor-pointer gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      <X className="size-4" />
                      Từ chối
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL GẮN CỜ (rv-flag)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!flagModalTarget} onOpenChange={(open) => !open && setFlagModalTarget(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Flag className="size-4 text-warning" />
              Gắn cờ góp ý
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Vị trí: <strong className="text-foreground">{flagModalTarget?.targetLabel}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4 text-xs">
            {/* Mức độ */}
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground block">Mức độ</span>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="severity"
                    value="must"
                    checked={flagSeverity === "must"}
                    onChange={() => setFlagSeverity("must")}
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="text-foreground">Bắt buộc sửa</strong>
                    <p className="text-muted-foreground">Chặn việc phê duyệt khoá học cho đến khi được sửa.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="severity"
                    value="should"
                    checked={flagSeverity === "should"}
                    onChange={() => setFlagSeverity("should")}
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="text-foreground">Nên sửa</strong>
                    <p className="text-muted-foreground">Góp ý cải thiện chất lượng, không chặn xuất bản.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Nhận xét */}
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                Nhận xét cho giảng viên <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Mô tả cụ thể vấn đề và cách sửa mong muốn..."
                value={flagComment}
                onChange={(e) => setFlagComment(e.target.value)}
                disabled={isAddingFlag}
                className="text-xs"
              />
              <span className="text-muted-foreground">Ít nhất 10 ký tự.</span>
              {flagError && <p className="text-destructive font-medium">{flagError}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" disabled={isAddingFlag} onClick={() => setFlagModalTarget(null)}>
              Huỷ
            </Button>
            <Button disabled={isAddingFlag} onClick={handleSaveFlag} className="gap-1.5">
              {isAddingFlag ? "Đang lưu..." : "Xác nhận gắn cờ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL DUYỆT VÀ XUẤT BẢN (rv-approve)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              Duyệt và xuất bản khoá học?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Khoá học: <strong className="text-foreground">{detail?.course.title}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2 text-xs text-foreground">
            <p>
              Giá bán chính thức:{" "}
              <strong className="text-foreground">
                {Number(priceInput) > 0 ? `${Number(priceInput).toLocaleString("vi-VN")} đ` : "Miễn phí"}
              </strong>
            </p>
            <p className="text-muted-foreground">
              Khoá học sẽ xuất hiện ngay trong danh mục khoá học công khai và học viên có thể mua học với giá này. Giảng viên sẽ nhận được thông báo chúc mừng.
            </p>
            {approveError && <p className="text-destructive font-medium pt-1">{approveError}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" disabled={isApproving} onClick={() => setShowApproveModal(false)}>
              Huỷ
            </Button>
            <Button disabled={isApproving} onClick={handleApprove} className="gap-1.5">
              {isApproving ? "Đang xuất bản..." : "Duyệt và xuất bản"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL YÊU CẦU SỬA (rv-request)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <RotateCcw className="size-4 text-warning" />
              Yêu cầu sửa nội dung?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Khoá học &quot;{detail?.course.title}&quot; sẽ chuyển sang trạng thái <strong>Bị từ chối</strong> (Yêu cầu sửa).
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs">
            <p className="text-muted-foreground">
              Giảng viên sẽ thấy tất cả các tiêu chí cần sửa và danh sách cờ góp ý để tiến hành chỉnh sửa rồi gửi lại thành vòng duyệt tiếp theo.
            </p>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                Lời nhắn chung cho giảng viên <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Ví dụ: Nội dung rất tốt, cần bổ sung tài liệu bài 3 và sửa lại đáp án quiz..."
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                disabled={isRequesting}
                className="text-xs"
              />
              <span className="text-muted-foreground">Ít nhất 5 ký tự.</span>
              {requestError && <p className="text-destructive font-medium">{requestError}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" disabled={isRequesting} onClick={() => setShowRequestModal(false)}>
              Huỷ
            </Button>
            <Button disabled={isRequesting} onClick={handleRequestChanges} className="gap-1.5">
              {isRequesting ? "Đang gửi..." : "Gửi yêu cầu sửa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL TỪ CHỐI (rv-reject)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <X className="size-4 text-destructive" />
              Từ chối xuất bản khoá học?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dùng khi khoá học không phù hợp chính sách hoặc chất lượng chung chưa đạt.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs">
            <p className="text-muted-foreground">
              Khoá học sẽ chuyển sang trạng thái <strong>Bị từ chối</strong> và không được mở bán. Giảng viên vẫn có thể xem lý do và sửa đổi lớn để gửi lại.
            </p>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                Lý do từ chối <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Ví dụ: Khoá học không đạt tiêu chuẩn chuyên môn hoặc vi phạm bản quyền nội dung..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={isRejecting}
                className="text-xs"
              />
              <span className="text-muted-foreground">Ít nhất 5 ký tự.</span>
              {rejectError && <p className="text-destructive font-medium">{rejectError}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" disabled={isRejecting} onClick={() => setShowRejectModal(false)}>
              Huỷ
            </Button>
            <Button
              variant="outline"
              disabled={isRejecting}
              onClick={handleReject}
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {isRejecting ? "Đang xử lý..." : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL XEM TRƯỚC NHƯ HỌC VIÊN (S32b preview as learner)
          ───────────────────────────────────────────────────────────── */}
      {showStudentPreview && detail && <PublicationPreviewClient course={detail.course} onClose={() => setShowStudentPreview(false)} />}
    </div>
  );
}
