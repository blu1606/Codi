"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  FileQuestion,
  HelpCircle,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { startQuizGeneration, readQuizGeneration } from "../../quiz-ai-actions";
import { QuizAiDialog, type AiQuizRequest } from "@/components/quiz-builder/quiz-ai-dialog";
import { DEFAULT_MAX_QUIZ_OPTIONS } from "@/lib/quiz-ai-contract";
import {
  type QuizQuestionInput,
  generateAiQuizQuestions,
  saveQuizData,
} from "../../actions";

interface QuizQuestionState extends QuizQuestionInput {
  id?: number;
  optionIds?: number[];
}

interface CourseLessonOption {
  id: string;
  title: string;
  chapterTitle: string;
}

interface QuizBuilderClientProps {
  courseId: string;
  lessonId: string;
  initialData: {
    course: any;
    lesson: any | null;
    isEntry: boolean;
    isLocked: boolean;
    passingScore: number;
    questions: QuizQuestionState[];
    allCourseLessons?: CourseLessonOption[];
  };
}

export function QuizBuilderClient({
  courseId,
  lessonId,
  initialData,
}: QuizBuilderClientProps) {
  const router = useRouter();
  const { course, lesson, isLocked, allCourseLessons = [] } = initialData;

  const isEntry = lessonId === "entry";

  // Trạng thái bài quiz
  const [passingScore, setPassingScore] = useState<number>(initialData.passingScore || 70);
  const [questions, setQuestions] = useState<QuizQuestionState[]>(
    initialData.questions && initialData.questions.length > 0
      ? initialData.questions
      : [
          {
            text: "",
            explanation: "",
            correctIndex: 0,
            options: ["", "", "", ""],
          },
        ]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [appliedAiJobIds, setAppliedAiJobIds] = useState<string[]>([]);

  // Thêm câu hỏi từ nhập hàng loạt hoặc AI vào cuối danh sách (chưa lưu)
  const appendQuestions = (added: QuizQuestionState[]) => {
    if (added.length === 0) return;
    setQuestions((prev) => [...prev, ...added]);
    setIsDirty(true);
  };

  const resumeAiGeneration = async (signal?: AbortSignal, jobId?: string) => {
    let result = await readQuizGeneration(courseId, lessonId, jobId);
    if (result.status === "none") return null;
    while (result.status === "queued" || result.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal?.aborted) return null;
      result = await readQuizGeneration(courseId, lessonId, result.jobId);
    }
    if (result.status === "completed") {
      if (appliedAiJobIds.includes(result.jobId)) return null;
      return { success: true as const, questions: result.questions, jobId: result.jobId };
    }
    return { success: false as const, code: "unavailable" as const, message: "Tạo câu hỏi chưa hoàn tất. Bạn có thể thử lại.", retryable: true };
  };

  const handleGenerateAi = async (request: AiQuizRequest, signal?: AbortSignal) => {
    const source = { sourceText: request.sourceMode === "paste" ? request.sourceText : undefined, focus: request.focus };
    const job = await startQuizGeneration(courseId, lessonId, request.count, request.difficulty, source);
    if (job.mode === "sync") return generateAiQuizQuestions(courseId, lessonId, request.count, request.difficulty, source);
    if (job.mode === "error") return { success: false as const, code: "unavailable" as const, message: job.message, retryable: false };
    return (await resumeAiGeneration(signal, job.id)) ?? { success: false as const, code: "unavailable" as const,
      message: "Chưa tìm thấy tác vụ. Vui lòng thử lại.", retryable: true };
  };

  const handleApplyAiQuestions = (aiQuestions: QuizQuestionInput[], jobId?: string) => {
    if (jobId && appliedAiJobIds.includes(jobId)) return;
    if (jobId) setAppliedAiJobIds((ids) => [...ids, jobId]);
    appendQuestions(aiQuestions);
    toast.success(`Đã thêm ${aiQuestions.length} câu AI tạo vào danh sách. Nhớ lưu bài trắc nghiệm.`);
  };

  // Thêm một câu hỏi mới rỗng
  const handleAddQuestion = () => {
    if (isLocked) return;
    setQuestions((prev) => [
      ...prev,
      {
        text: "",
        explanation: "",
        correctIndex: 0,
        options: ["", "", "", ""],
      },
    ]);
    setIsDirty(true);
  };

  // Xoá một câu hỏi
  const handleDeleteQuestion = (qIndex: number) => {
    if (isLocked) return;
    if (questions.length <= 1) {
      toast.error("Bài quiz cần có ít nhất 1 câu hỏi.");
      return;
    }
    setQuestions((prev) => prev.filter((_, idx) => idx !== qIndex));
    setIsDirty(true);
  };

  // Di chuyển câu hỏi lên / xuống
  const handleMoveQuestion = (qIndex: number, direction: -1 | 1) => {
    if (isLocked) return;
    const targetIndex = qIndex + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[qIndex];
      copy[qIndex] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
    setIsDirty(true);
  };

  // Thay đổi nội dung câu hỏi
  const handleQuestionTextChange = (qIndex: number, text: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIndex] = { ...copy[qIndex], text };
      return copy;
    });
    setIsDirty(true);
  };

  // Gắn bài học cho câu hỏi Diagnostic (Finding 8)
  const handleQuestionLessonChange = (qIndex: number, lessonIdValue: string | null) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIndex] = { ...copy[qIndex], lessonId: lessonIdValue };
      return copy;
    });
    setIsDirty(true);
  };

  // Thay đổi giải thích đáp án
  const handleExplanationChange = (qIndex: number, explanation: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIndex] = { ...copy[qIndex], explanation };
      return copy;
    });
    setIsDirty(true);
  };

  // Đánh dấu đáp án đúng
  const handleSelectCorrectOption = (qIndex: number, optIndex: number) => {
    if (isLocked) return;
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIndex] = { ...copy[qIndex], correctIndex: optIndex };
      return copy;
    });
    setIsDirty(true);
  };

  // Thay đổi nội dung lựa chọn
  const handleOptionTextChange = (qIndex: number, optIndex: number, text: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const newOpts = [...copy[qIndex].options];
      newOpts[optIndex] = text;
      copy[qIndex] = { ...copy[qIndex], options: newOpts };
      return copy;
    });
    setIsDirty(true);
  };

  // Thêm một lựa chọn mới vào câu hỏi
  const handleAddOption = (qIndex: number) => {
    if (isLocked) return;
    setQuestions((prev) => {
      const copy = [...prev];
      if (copy[qIndex].options.length >= 6) {
        toast.error("Mỗi câu hỏi tối đa 6 phương án lựa chọn.");
        return prev;
      }
      copy[qIndex] = {
        ...copy[qIndex],
        options: [...copy[qIndex].options, ""],
      };
      return copy;
    });
    setIsDirty(true);
  };

  // Xoá một lựa chọn khỏi câu hỏi
  const handleDeleteOption = (qIndex: number, optIndex: number) => {
    if (isLocked) return;
    setQuestions((prev) => {
      const copy = [...prev];
      if (copy[qIndex].options.length <= 2) {
        toast.error("Mỗi câu hỏi cần tối thiểu 2 phương án lựa chọn.");
        return prev;
      }
      const newOpts = copy[qIndex].options.filter((_, idx) => idx !== optIndex);
      const newOptIds = copy[qIndex].optionIds?.filter((_, idx) => idx !== optIndex);
      let newCorrect = copy[qIndex].correctIndex;
      if (newCorrect === optIndex) {
        newCorrect = 0;
      } else if (newCorrect > optIndex) {
        newCorrect -= 1;
      }
      copy[qIndex] = {
        ...copy[qIndex],
        options: newOpts,
        optionIds: newOptIds,
        correctIndex: newCorrect,
      };
      return copy;
    });
    setIsDirty(true);
  };

  // Lưu toàn bộ Quiz
  const handleSaveQuiz = async () => {
    if (isLocked) return;

    // Validate client-side
    if (passingScore < 1 || passingScore > 100) {
      toast.error("Điểm đạt phải nằm trong khoảng từ 1% đến 100%.");
      return;
    }

    if (questions.length === 0) {
      toast.error("Vui lòng thêm ít nhất một câu hỏi.");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text || !q.text.trim()) {
        toast.error(`Câu ${i + 1}: Vui lòng nhập nội dung câu hỏi.`);
        return;
      }
      const filledOptions = q.options.filter((o) => o && o.trim().length > 0);
      if (filledOptions.length < 2) {
        toast.error(`Câu ${i + 1}: Cần ít nhất 2 phương án trả lời có nội dung.`);
        return;
      }
      if (
        q.correctIndex === undefined ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length ||
        !q.options[q.correctIndex]?.trim()
      ) {
        toast.error(`Câu ${i + 1}: Vui lòng chọn một phương án có nội dung làm đáp án đúng.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      await saveQuizData(courseId, lessonId, {
        passingScore,
        isEntry,
        appliedAiJobIds,
        questions: questions.map((q) => ({
          id: q.id,
          text: q.text,
          explanation: q.explanation || undefined,
          correctIndex: q.correctIndex,
          options: q.options,
          optionIds: q.optionIds,
          lessonId: isEntry ? q.lessonId || null : undefined,
        })),
      });

      setIsDirty(false);
      setAppliedAiJobIds([]);
      toast.success(
        isEntry
          ? "Đã lưu Bài kiểm tra đầu vào thành công!"
          : "Đã lưu Quiz bài học thành công!"
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu bài trắc nghiệm.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          THANH ĐIỀU HƯỚNG VÀ HEADER
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
        <div className="space-y-1.5">
          <Link
            href={`/dashboard/lecturer/courses/${courseId}/content`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="size-3.5" />
            Quay lại khoá học: {course.title}
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              {isEntry ? "Bài kiểm tra đầu vào (Diagnostic Test)" : `Quiz: ${lesson?.title || "Bài học"}`}
            </h1>
            {isEntry ? (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-primary/10 text-primary border border-primary/20">
                Xếp lộ trình đầu vào
              </span>
            ) : (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-muted text-foreground border border-border">
                Quiz bài học
              </span>
            )}
            {isLocked && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-warning/10 text-warning border border-warning/20">
                Đang chờ duyệt — Chỉ đọc
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isEntry
              ? "Bài kiểm tra giúp hệ thống BKT phân tích kỹ năng và đề xuất lộ trình học thích ứng cho từng học viên."
              : "Kiểm tra kiến thức cốt lõi ngay sau khi học viên hoàn thành nội dung bài học."}
          </p>
        </div>

        {/* Nút lưu Quiz */}
        {!isLocked && (
          <div className="flex items-center gap-3 shrink-0">
            {isDirty && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="size-3.5 text-warning" />
                Có thay đổi chưa lưu
              </span>
            )}
            <Button
              onClick={handleSaveQuiz}
              disabled={isSaving}
              className="gap-2 cursor-pointer shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Lưu bài trắc nghiệm
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Thông báo chỉ đọc nếu đang chờ duyệt */}
      {isLocked && (
        <Alert variant="warning">
          <AlertTitle className="font-semibold">Khoá học đang chờ duyệt</AlertTitle>
          <AlertDescription>
            Bạn đang xem nội dung ở chế độ chỉ đọc. Để chỉnh sửa bài quiz, hãy đợi ban quản trị hoàn tất quá trình duyệt hoặc yêu cầu bổ sung.
          </AlertDescription>
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────
          BỐ CỤC CHÍNH: 2 CỘT (CÂU HỎI & THIẾT LẬP)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* CỘT TRÁI (2/3): DANH SÁCH CÂU HỎI */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileQuestion className="size-4 text-primary" />
              Danh sách câu hỏi ({questions.length} câu)
            </div>
            {!isLocked && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAiOpen(true)} className="gap-1.5 text-xs cursor-pointer">
                  <Sparkles className="size-3.5" />
                  Tạo câu hỏi bằng AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddQuestion}
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  Thêm câu hỏi
                </Button>
              </div>
            )}
          </div>

          {questions.map((q, qIndex) => (
            <Card
              key={qIndex}
              className="border border-border/80 shadow-xs transition-colors"
            >
              <CardHeader className="py-3 px-4 sm:px-6 bg-muted/30 border-b border-border/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">
                      Câu {qIndex + 1}
                    </span>
                  </div>

                  {!isLocked && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={qIndex === 0}
                        onClick={() => handleMoveQuestion(qIndex, -1)}
                        className="size-7 p-0 cursor-pointer"
                        title="Di chuyển lên"
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={qIndex === questions.length - 1}
                        onClick={() => handleMoveQuestion(qIndex, 1)}
                        className="size-7 p-0 cursor-pointer"
                        title="Di chuyển xuống"
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(qIndex)}
                        className="size-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                        title="Xoá câu hỏi"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-5">
                {/* Nội dung câu hỏi */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Nội dung câu hỏi <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    rows={2}
                    value={q.text}
                    disabled={isLocked}
                    onChange={(e) => handleQuestionTextChange(qIndex, e.target.value)}
                    placeholder="Nhập nội dung câu hỏi trắc nghiệm..."
                    className="text-sm"
                  />
                </div>

                {/* Gắn bài học tương ứng cho câu hỏi Diagnostic (Finding 8) */}
                {isEntry && (
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Bài học tương ứng (BKT liên kết kỹ năng)</span>
                    </label>
                    <select
                      value={q.lessonId || ""}
                      disabled={isLocked}
                      onChange={(e) => handleQuestionLessonChange(qIndex, e.target.value || null)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="">-- Chọn bài học để BKT đánh giá kỹ năng --</option>
                      {allCourseLessons.map((ls) => (
                        <option key={ls.id} value={ls.id}>
                          {ls.chapterTitle ? `[${ls.chapterTitle}] ` : ""}{ls.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      BKT đọc kỹ năng của bài học này để cập nhật mức độ thành thạo khi học viên làm bài kiểm tra đầu vào.
                    </p>
                  </div>
                )}

                {/* Danh sách lựa chọn trả lời */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Các phương án lựa chọn (Click chọn đáp án đúng)</span>
                      <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Đáp án đúng: Lựa chọn #{q.correctIndex + 1}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {q.options.map((optText, optIndex) => {
                      const isCorrect = q.correctIndex === optIndex;
                      return (
                        <div
                          key={optIndex}
                          className={cn(
                            "flex items-center gap-2.5 p-2 rounded-lg border transition-colors",
                            isCorrect
                              ? "border-primary/60 bg-primary/5"
                              : "border-border/80 bg-background"
                          )}
                        >
                          {/* Nút chọn đáp án đúng */}
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => handleSelectCorrectOption(qIndex, optIndex)}
                            className={cn(
                              "size-5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer",
                              isCorrect
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-input bg-transparent hover:border-primary/50"
                            )}
                            title={isCorrect ? "Đáp án đúng" : "Đánh dấu là đáp án đúng"}
                          >
                            {isCorrect && <Check className="size-3 stroke-[3]" />}
                          </button>

                          <span className="text-xs font-semibold text-muted-foreground shrink-0 w-5">
                            {String.fromCharCode(65 + optIndex)}.
                          </span>

                          {/* Nhập text lựa chọn */}
                          <Input
                            value={optText}
                            disabled={isLocked}
                            onChange={(e) =>
                              handleOptionTextChange(qIndex, optIndex, e.target.value)
                            }
                            placeholder={`Phương án ${String.fromCharCode(65 + optIndex)}...`}
                            className={cn(
                              "h-9 text-sm flex-1",
                              isCorrect && "font-medium"
                            )}
                          />

                          {/* Xoá lựa chọn */}
                          {!isLocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={q.options.length <= 2}
                              onClick={() => handleDeleteOption(qIndex, optIndex)}
                              className="size-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                              title="Xoá phương án này"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!isLocked && q.options.length < 6 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddOption(qIndex)}
                      className="text-xs text-primary hover:text-primary gap-1 cursor-pointer h-8 px-2"
                    >
                      <Plus className="size-3.5" />
                      Thêm phương án
                    </Button>
                  )}
                </div>

                {/* Giải thích đáp án */}
                <div className="space-y-1.5 pt-1 border-t border-border/40">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <HelpCircle className="size-3.5" />
                    <span>Giải thích đáp án (học viên sẽ thấy sau khi nộp bài)</span>
                  </label>
                  <Textarea
                    rows={2}
                    value={q.explanation || ""}
                    disabled={isLocked}
                    onChange={(e) => handleExplanationChange(qIndex, e.target.value)}
                    placeholder="Giải thích vì sao phương án này là đúng..."
                    className="text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          {!isLocked && (
            <Button
              variant="outline"
              onClick={handleAddQuestion}
              className="w-full py-6 border-dashed border-border/80 gap-2 cursor-pointer hover:bg-muted/30"
            >
              <Plus className="size-4" />
              Thêm câu hỏi mới
            </Button>
          )}
        </div>

        {/* CỘT PHẢI (1/3): THIẾT LẬP */}
        <div className="space-y-6">
          {/* Card: Thiết lập bài trắc nghiệm */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Thiết lập Quiz</CardTitle>
              <CardDescription className="text-xs">
                Cấu hình điều kiện vượt qua bài kiểm tra.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Điểm đạt % */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Điểm đạt tối thiểu (%)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={passingScore}
                    disabled={isLocked}
                    onChange={(e) => {
                      setPassingScore(Number(e.target.value) || 0);
                      setIsDirty(true);
                    }}
                    className="h-9 w-24 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">% câu trả lời đúng</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Học viên phải đạt từ mức điểm này trở lên để hoàn thành bài học.
                </p>
              </div>

              {/* Cảnh báo bài kiểm tra đầu vào cần >= 5 câu */}
              {isEntry && questions.length < 5 && (
                <Alert variant="warning" className="p-3">
                  <AlertCircle className="size-4 shrink-0" />
                  <div>
                    <AlertTitle className="text-xs font-semibold">Cần ít nhất 5 câu hỏi</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      Hiện có {questions.length} câu. Bài kiểm tra đầu vào cần tối thiểu 5 câu hỏi để đạt điều kiện xuất bản khoá học.
                    </AlertDescription>
                  </div>
                </Alert>
              )}

              {/* Tóm tắt số liệu */}
              <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Tổng số câu hỏi:</span>
                  <span className="font-semibold text-foreground">{questions.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {!isLocked && (
        <>
          <QuizAiDialog
            onResume={resumeAiGeneration}
            open={aiOpen}
            onOpenChange={setAiOpen}
            lessonTitle={isEntry ? "Bài kiểm tra đầu vào" : lesson?.title || "Bài học"}
            maxOptions={DEFAULT_MAX_QUIZ_OPTIONS}
            onGenerate={handleGenerateAi}
            onApply={handleApplyAiQuestions}
          />
        </>
      )}
    </div>
  );
}
