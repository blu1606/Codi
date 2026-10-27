"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  History,
  List,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { Sheet } from "@codi-1/ui/components/sheet";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  applySnippetPlaceholders,
  computeRubricTotal,
  getCriterionName,
  getCriterionMaxScore,
  formatDateTime,
  formatRelativeTime,
  type GradingHistoryEntry,
  type RubricCriterion,
} from "@/lib/grading-service";
import type { FeedbackSnippetItem } from "../snippets/actions";
import {
  gradeSubmission,
  type GradingQueueResult,
  type SubmissionListItemDto,
} from "./actions";

interface GradingQueueClientProps {
  data: GradingQueueResult;
  snippets: FeedbackSnippetItem[];
}

export function GradingQueueClient({ data, snippets }: GradingQueueClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const {
    counts,
    submissions,
    selectedSubmission,
    courses,
    currentStatus,
    selectedCourseId,
    selectedAssignmentId,
    selectedDate,
    assignments,
  } = data;
  const nextPendingId = selectedSubmission?.nextPendingId ?? null;

  // Local form state for selected submission
  const [scoreInput, setScoreInput] = useState<string>("");
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [feedbackInput, setFeedbackInput] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const formView = useRef({ id: 0, token: "", dirty: false, revision: 0 });

  // Modals
  const [snippetPickerOpen, setSnippetPickerOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<"stay" | "next">("stay");

  // Reset form when selected submission changes
  useEffect(() => {
    if (selectedSubmission) {
      if (formView.current.id === selectedSubmission.id && formView.current.dirty) return;
      formView.current = { id: selectedSubmission.id, token: selectedSubmission.viewToken, dirty: false, revision: 0 };
      setScoreInput(
        selectedSubmission.score !== null && selectedSubmission.score !== undefined
          ? String(selectedSubmission.score)
          : ""
      );
      setRubricScores(selectedSubmission.rubricScores || {});
      setFeedbackInput(selectedSubmission.feedback || "");
      setFormError(null);

    } else {
      formView.current = { id: 0, token: "", dirty: false, revision: 0 };
      setScoreInput("");
      setRubricScores({});
      setFeedbackInput("");
      setFormError(null);

    }
  }, [selectedSubmission?.id, selectedSubmission?.viewToken]);

  // Compute live score from rubric if available
  const rubricList: RubricCriterion[] = selectedSubmission?.rubric || [];
  const hasRubric = rubricList.length > 0;
  const rubricCalc = hasRubric && selectedSubmission
    ? computeRubricTotal(rubricList, rubricScores)
    : null;

  const currentComputedScore = hasRubric
    ? rubricCalc?.total ?? 0
    : parseFloat(scoreInput.replace(",", "."));

  // Navigation helpers with preserved filter state
  const navigateWithFilters = (overrides: {
    status?: "pending" | "graded";
    course?: string;
    assignment?: string;
    date?: string;
    submissionId?: number | null;
  }) => {
    startTransition(() => {
      const sp = new URLSearchParams();
      const st = overrides.status ?? currentStatus;
      const c = overrides.course !== undefined ? overrides.course : selectedCourseId;
      const a = overrides.assignment !== undefined ? overrides.assignment : (selectedAssignmentId || "all");
      const d = overrides.date !== undefined ? overrides.date : (selectedDate || "all");
      const subId = overrides.submissionId !== undefined ? overrides.submissionId : selectedSubmission?.id;

      sp.set("status", st);
      if (c && c !== "all") sp.set("course", c);
      if (a && a !== "all") sp.set("assignment", a);
      if (d && d !== "all") sp.set("date", d);
      if (subId) sp.set("submissionId", String(subId));

      router.push(`/dashboard/lecturer/grading?${sp.toString()}` as any);
    });
  };

  const handleTabChange = (status: "pending" | "graded") => {
    navigateWithFilters({ status, submissionId: null });
  };

  const handleCourseFilterChange = (courseId: string) => {
    navigateWithFilters({ course: courseId, assignment: "all", submissionId: null });
  };

  const handleAssignmentFilterChange = (assignmentId: string) => {
    navigateWithFilters({ assignment: assignmentId, submissionId: null });
  };

  const handleDateFilterChange = (date: string) => {
    navigateWithFilters({ date, submissionId: null });
  };

  const handleSelectSubmission = (subId: number) => {
    navigateWithFilters({ submissionId: subId });
  };

  // Insert snippet template
  const handleInsertSnippet = (snippet: FeedbackSnippetItem) => {
    if (!selectedSubmission) return;
    const studentName = selectedSubmission.studentName;
    const scoreVal = isNaN(currentComputedScore) ? "—" : currentComputedScore;
    const resolvedText = applySnippetPlaceholders(snippet.body, {
      studentName,
      score: scoreVal,
    });

    formView.current.dirty = true;
    formView.current.revision++;
    setFeedbackInput((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n${resolvedText}` : resolvedText;
    });

    setSnippetPickerOpen(false);
    toast.success(`Đã chèn mẫu "${snippet.title}"`);
  };

  // Grade save logic
  const handleSaveGrade = async (action: "stay" | "next") => {
    if (!selectedSubmission) return;
    setFormError(null);

    let finalScore: number;
    let finalRubricScores: Record<string, number> | undefined;

    if (hasRubric) {
      if (!rubricCalc?.isValid) {
        const firstErr = Object.values(rubricCalc?.errors || {})[0];
        setFormError(firstErr || "Vui lòng chấm đủ tất cả các tiêu chí theo rubric.");
        return;
      }
      finalScore = rubricCalc.total;
      finalRubricScores = rubricScores;
    } else {
      const raw = scoreInput.replace(",", ".").trim();
      const num = parseFloat(raw);
      if (raw === "" || isNaN(num) || num < 0 || num > selectedSubmission.maxScore) {
        setFormError(`Nhập điểm hợp lệ từ 0 đến ${selectedSubmission.maxScore}.`);
        return;
      }
      finalScore = Math.round(num * 10) / 10;
    }

    // Check if score changed on already graded submission
    const wasGraded = selectedSubmission.status === "graded";
    const scoreChanged = wasGraded && selectedSubmission.score !== finalScore;

    if (scoreChanged) {
      // Require reason dialog
      setPendingSaveAction(action);
      setConfirmEditOpen(true);
      return;
    }

    // Direct save without reason
    await executeGradeSubmission({
      score: finalScore,
      rubricScores: finalRubricScores,
      feedback: feedbackInput,
      action,
    });
  };

  const executeGradeSubmission = async (params: {
    score: number;
    rubricScores?: Record<string, number>;
    feedback: string;
    reason?: string;
    action: "stay" | "next";
  }) => {
    if (!selectedSubmission) return;
    setIsSaving(true);
    setFormError(null);

    const savedRevision = formView.current.revision;
    const savedId = selectedSubmission.id;
    try {
      const res = await gradeSubmission({
        viewToken: formView.current.token,
        submissionId: selectedSubmission.id,
        score: params.score,
        rubricScores: params.rubricScores,
        feedback: params.feedback,
        reason: params.reason,
        courseFilter: selectedCourseId,
        assignmentFilter: selectedAssignmentId,
        dateFilter: selectedDate,
      });

      if (!res.success) {
        setFormError(res.error || "Không thể lưu điểm bài tập.");
        return;
      }

      if (formView.current.id !== savedId) return;
      if (formView.current.revision !== savedRevision) {
        toast.success("Đã lưu bản trước đó. Các chỉnh sửa mới vẫn chưa được lưu.");
        return;
      }
      formView.current.dirty = false;
      router.refresh();
      toast.success("Đã lưu điểm và gửi thông báo cho học viên.");

      if (params.action === "next" && res.nextPendingId) {
        navigateWithFilters({ status: "pending", submissionId: res.nextPendingId });
      } else {
        navigateWithFilters({ status: "graded", submissionId: selectedSubmission.id });
      }
    } catch {
      setFormError("Có lỗi xảy ra khi lưu điểm.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chấm bài</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chấm từng bài; học viên nhận thông báo ngay khi có điểm.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={"/dashboard/lecturer/snippets" as any}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted transition-colors shadow-xs"
          >
            <FileText className="size-4 text-muted-foreground" />
            Mẫu nhận xét
          </Link>
        </div>
      </div>

      {/* Tabs & Course Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        {/* Status Tabs */}
        <div className="inline-flex items-center gap-2 p-1 rounded-lg bg-muted/60">
          <button
            type="button"
            onClick={() => handleTabChange("pending")}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all",
              currentStatus === "pending"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Chờ chấm</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-xs font-semibold",
                currentStatus === "pending"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {counts.pending}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("graded")}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all",
              currentStatus === "graded"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Đã chấm</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-xs font-semibold",
                currentStatus === "graded"
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {counts.graded}
            </span>
          </button>
        </div>

        {/* Filters: Course, Assignment, Date */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Course Filter Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="course-filter-select" className="sr-only">
              Lọc theo khoá học
            </label>
            <select
              id="course-filter-select"
              value={selectedCourseId}
              onChange={(e) => handleCourseFilterChange(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Tất cả khoá học</option>
              {courses.map((c: { id: string; title: string }) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Assignment Filter Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="assignment-filter-select" className="sr-only">
              Lọc theo bài tập
            </label>
            <select
              id="assignment-filter-select"
              value={selectedAssignmentId || "all"}
              onChange={(e) => handleAssignmentFilterChange(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Tất cả bài tập</option>
              {(assignments || [])
                .filter((a: any) => selectedCourseId === "all" || a.courseId === selectedCourseId)
                .map((a: any) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.title}
                  </option>
                ))}
            </select>
          </div>

          {/* Date Filter Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="date-filter-select" className="sr-only">
              Lọc theo ngày nộp
            </label>
            <select
              id="date-filter-select"
              value={selectedDate || "all"}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Tất cả ngày nộp</option>
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày qua</option>
              <option value="30days">30 ngày qua</option>
            </select>
          </div>
        </div>
      </div>

      {/* Split view: List left, Detail right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Submissions list (4 cols) */}
        <div className="lg:col-span-4 space-y-2">
          {submissions.length === 0 ? (
            <Card className="border border-border/80">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Không có bài nào trong danh sách.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {submissions.map((sub: SubmissionListItemDto) => {
                const isSelected = selectedSubmission?.id === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSelectSubmission(sub.id)}
                    className={cn(
                      "w-full text-left p-3.5 rounded-lg border transition-all text-sm block relative",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border/80 bg-card hover:bg-muted/40 hover:border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="font-semibold text-foreground truncate">
                        {sub.studentName}
                      </strong>
                      {sub.status === "graded" && sub.score !== null ? (
                        <span className="shrink-0 px-2 py-0.5 rounded text-xs font-semibold bg-success-soft text-success">
                          {String(sub.score).replace(".", ",")}/{sub.maxScore}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(sub.submittedAt)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {sub.lessonTitle || "Bài tập"} · {sub.courseTitle}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Split detail (8 cols) */}
        <div className="lg:col-span-8">
          {!selectedSubmission ? (
            <Card className="border border-border/80">
              <CardContent className="p-16">
                <Empty>
                  <EmptyMedia>
                    <div className="p-4 rounded-full bg-muted text-muted-foreground">
                      <ClipboardCheck className="size-10" />
                    </div>
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>
                      {currentStatus === "pending"
                        ? "Không có bài nào chờ chấm"
                        : "Chưa có bài đã chấm"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {currentStatus === "pending"
                        ? "Bạn đã chấm hết các bài nộp. Bài làm mới của học viên sẽ xuất hiện tại đây."
                        : "Các bài sau khi chấm điểm sẽ được lưu trữ tại tab này."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Submission details & instructions (7 cols) */}
              <div className="md:col-span-7 space-y-4">
                <Card className="border border-border/80">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <div className="text-xs text-muted-foreground">
                      {selectedSubmission.courseTitle}
                    </div>
                    <CardTitle className="text-lg font-bold">
                      {selectedSubmission.lessonTitle || "Bài tập"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Nộp lúc {formatDateTime(selectedSubmission.submittedAt)}
                    </p>
                  </CardHeader>
                  <CardContent className="p-5 space-y-5">
                    {/* Yêu cầu bài tập */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Yêu cầu bài tập
                      </span>
                      <div className="p-3.5 rounded-lg bg-muted/40 text-sm leading-relaxed text-foreground whitespace-pre-line border border-border/60">
                        {selectedSubmission.instructions || "Không có nội dung yêu cầu cụ thể."}
                      </div>
                    </div>

                    {/* Bài nộp của học viên */}
                    <div className="space-y-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Nội dung bài nộp
                      </span>

                      {/* File đính kèm */}
                      {selectedSubmission.fileName ? (
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="size-4 text-primary shrink-0" />
                            <span className="text-sm font-mono truncate text-foreground">
                              {selectedSubmission.fileName}
                            </span>
                          </div>
                          {selectedSubmission.fileUrl ? (
                            <a
                              href={selectedSubmission.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors shrink-0"
                            >
                              <Download className="size-3.5" />
                              Tải về
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                toast.info(
                                  `Bản thử nghiệm: tệp "${selectedSubmission.fileName}" không có nội dung thật.`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors shrink-0"
                            >
                              <Download className="size-3.5" />
                              Tải về
                            </button>
                          )}
                        </div>
                      ) : null}

                      {/* Link dự án */}
                      {selectedSubmission.linkUrl ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                          <ExternalLink className="size-4 text-primary shrink-0" />
                          <a
                            href={selectedSubmission.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-primary hover:underline truncate"
                          >
                            {selectedSubmission.linkUrl}
                          </a>
                        </div>
                      ) : null}

                      {/* Câu trả lời tự luận nếu có */}
                      {selectedSubmission.answerText ? (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">
                            Nội dung tự luận:
                          </span>
                          <div className="p-3 rounded-lg bg-muted/20 border border-border/60 text-sm text-foreground whitespace-pre-line">
                            {selectedSubmission.answerText}
                          </div>
                        </div>
                      ) : null}

                      {/* Trạng thái nếu không có bài nộp nào */}
                      {!selectedSubmission.fileName &&
                        !selectedSubmission.linkUrl &&
                        !selectedSubmission.answerText && (
                          <p className="text-sm text-muted-foreground">
                            Không có tệp hay liên kết đính kèm.
                          </p>
                        )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Grading decision panel (5 cols) */}
              <div className="md:col-span-5 space-y-4">
                <Card className="border border-border/80">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {selectedSubmission.studentAvatar ? (
                          <img
                            src={selectedSubmission.studentAvatar}
                            alt=""
                            className="size-9 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {(selectedSubmission.studentName || "H")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate text-foreground">
                            {selectedSubmission.studentName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {selectedSubmission.studentEmail}
                          </div>
                        </div>
                      </div>
                      <StatusBadge
                        kind="submission"
                        status={selectedSubmission.status}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 space-y-5">
                    {/* Error Banner */}
                    {formError && (
                      <Alert variant="destructive" className="py-2.5 text-xs">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{formError}</span>
                      </Alert>
                    )}

                    {/* Rubric OR Direct Score */}
                    {hasRubric ? (
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-foreground">
                          Chấm theo thang điểm Rubric <span className="text-destructive">*</span>
                        </Label>

                        <div className="space-y-3">
                          {rubricList.map((crit: RubricCriterion) => {
                            const val = rubricScores[crit.id];
                            return (
                              <div
                                key={crit.id}
                                className="p-3 rounded-lg border border-border/70 bg-card space-y-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">
                                      {getCriterionName(crit)}
                                    </div>
                                    {crit.desc && (
                                      <div className="text-xs text-muted-foreground">
                                        {crit.desc}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={getCriterionMaxScore(crit)}
                                      step={0.5}
                                      value={val !== undefined ? val : ""}
                                      onChange={(e) => {
                                        formView.current.dirty = true;
                                        formView.current.revision++;
                                        const raw = e.target.value;
                                        setRubricScores((prev) => ({
                                          ...prev,
                                          [crit.id]: raw === "" ? NaN : parseFloat(raw),
                                        }));
                                      }}
                                      className="w-16 h-8 text-center text-sm font-mono font-medium"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      / {getCriterionMaxScore(crit)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Live Total */}
                        <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">
                            Tổng điểm:{" "}
                            <span className="font-mono text-sm text-primary">
                              {String(rubricCalc?.total ?? 0).replace(".", ",")}/
                              {selectedSubmission.maxScore}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Ngưỡng đạt: {selectedSubmission.passingScore}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="single-score-input" className="text-sm font-semibold">
                            Điểm (0–{selectedSubmission.maxScore}){" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            Ngưỡng đạt:{" "}
                            {Math.round(
                              ((selectedSubmission.passingScore || 50) / 100) *
                                selectedSubmission.maxScore *
                                10
                            ) / 10}
                            /{selectedSubmission.maxScore}
                          </span>
                        </div>
                        <Input
                          id="single-score-input"
                          type="number"
                          min={0}
                          max={selectedSubmission.maxScore}
                          step={0.5}
                          value={scoreInput}
                          onChange={(e) => { formView.current.dirty = true; formView.current.revision++; setScoreInput(e.target.value); }}
                          placeholder="Ví dụ: 8.5"
                          className="h-10 text-base font-mono font-medium"
                        />
                      </div>
                    )}

                    {/* AI gợi ý điểm: chưa có backend (issue #232). Hiện trạng thái thật, không giả kết quả. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" disabled className="gap-1.5">
                        <Sparkles className="size-3.5" />
                        AI gợi ý điểm và nhận xét
                      </Button>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Sắp có</span>
                    </div>
                    <p role="status" className="text-sm text-muted-foreground">AI chấm bài chưa khả dụng. Vui lòng chấm bài thủ công theo thang điểm.</p>

                    {/* Feedback Textarea + Snippet trigger */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="feedback-input" className="text-sm font-semibold">
                          Nhận xét cho học viên
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSnippetPickerOpen(true)}
                          className="h-7 px-2 text-xs text-primary gap-1 hover:bg-primary/10"
                        >
                          <List className="size-3.5" />
                          Mẫu nhận xét
                        </Button>
                      </div>
                      <Textarea
                        id="feedback-input"
                        value={feedbackInput}
                        onChange={(e) => { formView.current.dirty = true; formView.current.revision++; setFeedbackInput(e.target.value); }}
                        placeholder="Điểm làm tốt, điểm cần cải thiện, gợi ý bước tiếp theo..."
                        rows={6}
                        className="text-sm leading-relaxed"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Bấm <span className="font-semibold text-foreground">"Mẫu nhận xét"</span> để chèn mẫu có sẵn kèm tên và điểm số.
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      {/* Main Save Button */}
                      <Button
                        type="button"
                        onClick={() => handleSaveGrade("stay")}
                        disabled={isSaving}
                        className="w-full font-semibold shadow-xs"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="size-4 animate-spin mr-2" />
                            Đang lưu điểm...
                          </>
                        ) : selectedSubmission.status === "graded" ? (
                          "Cập nhật điểm"
                        ) : (
                          "Lưu điểm"
                        )}
                      </Button>

                      {/* Next Pending Actions */}
                      {nextPendingId ? (
                        <div className="space-y-1.5 pt-1">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleSaveGrade("next")}
                            disabled={isSaving}
                            className="w-full gap-2"
                          >
                            Lưu và chấm bài tiếp theo
                            <ArrowRight className="size-3.5" />
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleSelectSubmission(nextPendingId)}
                            className="w-full text-center py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Bỏ qua, sang bài tiếp theo →
                          </button>
                        </div>
                      ) : (
                        <p className="text-center text-[11px] text-muted-foreground pt-1">
                          Đây là bài chờ chấm cuối cùng.
                        </p>
                      )}

                      {/* History button if graded & has history */}
                      {selectedSubmission.status === "graded" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistorySheetOpen(true)}
                          className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5 mt-2"
                        >
                          <History className="size-3.5" />
                          Xem lịch sử điểm ({selectedSubmission.history?.length || 0} lần sửa)
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snippet Picker Dialog */}
      <Dialog open={snippetPickerOpen} onOpenChange={setSnippetPickerOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Mẫu nhận xét</DialogTitle>
            <DialogDescription>
              Chọn mẫu để chèn vào nhận xét. Các biến tên và điểm số sẽ được tự động điền.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            {snippets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground space-y-3">
                <p>Chưa có mẫu nhận xét nào.</p>
                <Link
                  href={"/dashboard/lecturer/snippets" as any}
                  className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                >
                  Tạo mẫu ngay trong trang quản lý mẫu
                  <ChevronRight className="size-3" />
                </Link>
              </div>
            ) : (
              snippets.map((snip: FeedbackSnippetItem) => (
                <div
                  key={snip.id}
                  className="p-3 rounded-lg border border-border bg-card space-y-2 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm font-semibold text-foreground">
                      {snip.title}
                    </strong>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleInsertSnippet(snip)}
                      className="h-7 text-xs font-medium shrink-0"
                    >
                      Chèn
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed line-clamp-3">
                    {snip.body}
                  </p>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="flex sm:justify-between items-center border-t border-border pt-3">
            <Link
              href={"/dashboard/lecturer/snippets" as any}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              Quản lý danh sách mẫu →
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSnippetPickerOpen(false)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grade History Sheet */}
      <Sheet
        open={historySheetOpen}
        onOpenChange={setHistorySheetOpen}
        title="Lịch sử chỉnh sửa điểm"
        description={`Bài nộp của ${selectedSubmission?.studentName || "học viên"}`}
      >
        <div className="space-y-4 py-2">
          {(!selectedSubmission?.history || selectedSubmission.history.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Không có lần chỉnh sửa nào trước đó.
            </p>
          ) : (
            selectedSubmission.history.map((item: GradingHistoryEntry, idx: number) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span>Lần sửa {selectedSubmission.history.length - idx}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(item.at)}
                  </span>
                </div>
                <div className="text-sm">
                  Điểm cũ: <strong className="font-mono">{String(item.oldScore).replace(".", ",")}</strong>
                  {" → "}
                  Điểm mới: <strong className="font-mono text-primary">{String(item.newScore).replace(".", ",")}</strong>
                </div>
                {item.reason && (
                  <p className="text-muted-foreground italic">
                    Lý do: "{item.reason}"
                  </p>
                )}
                {item.feedback && (
                  <p className="text-muted-foreground line-clamp-2">
                    Nhận xét: {item.feedback}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </Sheet>

      {/* Confirm Reason Dialog on Score Modification */}
      <ConfirmDialog
        open={confirmEditOpen}
        onOpenChange={setConfirmEditOpen}
        title="Sửa điểm bài đã chấm"
        consequence="Học viên sẽ nhận thông báo điểm bài tập đã được cập nhật."
        reversible="Lịch sử chỉnh sửa điểm sẽ được lưu lại."
        requireReason={true}
        confirmLabel="Cập nhật điểm"
        onConfirm={async (reason) => {
          let finalScore: number;
          let finalRubricScores: Record<string, number> | undefined;

          if (hasRubric) {
            finalScore = rubricCalc?.total ?? 0;
            finalRubricScores = rubricScores;
          } else {
            finalScore = parseFloat(scoreInput.replace(",", "."));
          }

          await executeGradeSubmission({
            score: finalScore,
            rubricScores: finalRubricScores,
            feedback: feedbackInput,
            reason,
            action: pendingSaveAction,
          });
        }}
      >
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Bạn đang sửa điểm từ{" "}
            <strong className="text-foreground">
              {String(selectedSubmission?.score).replace(".", ",")}
            </strong>{" "}
            thành{" "}
            <strong className="text-primary">
              {String(currentComputedScore).replace(".", ",")}
            </strong>
            .
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
