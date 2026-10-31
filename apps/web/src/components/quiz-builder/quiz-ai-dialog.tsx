"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Loader2, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
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
import { cn } from "@codi-1/ui/lib/utils";
import type {
  AiQuizDifficulty,
  AiQuizGenerationResult,
} from "@/app/dashboard/lecturer/courses/[courseId]/actions";
import {
  DEFAULT_MAX_QUIZ_OPTIONS,
  validateQuestionDraft,
} from "@/lib/quiz-ai-contract";
import type { QuizQuestionInput } from "@/app/dashboard/lecturer/courses/[courseId]/actions";

const MAX_PASTE_CHARS = 6000;
const MAX_FOCUS_CHARS = 200;
const COUNT_OPTIONS = [3, 5, 8] as const;
const DIFFICULTY_OPTIONS: Array<[AiQuizDifficulty, string]> = [
  ["easy", "Dễ"],
  ["medium", "Vừa"],
  ["hard", "Khó"],
];

export interface AiQuizRequest {
  count: number;
  difficulty: AiQuizDifficulty;
  sourceMode: "lesson" | "paste";
  sourceText: string;
  focus: string;
}

type ReviewState = "pending" | "accepted" | "discarded";

interface ReviewItem {
  key: number;
  question: QuizQuestionInput;
  state: ReviewState;
  editing: boolean;
}

type AiError = Extract<AiQuizGenerationResult, { success: false }>;

interface QuizAiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonTitle: string;
  maxOptions?: number;
  onGenerate: (request: AiQuizRequest, signal?: AbortSignal) => Promise<AiQuizGenerationResult>;
  onResume?: (signal: AbortSignal) => Promise<AiQuizGenerationResult | null>;
  onApply: (questions: QuizQuestionInput[], jobId?: string) => void;
}

const NETWORK_ERROR: AiError = {
  success: false,
  code: "unavailable",
  message: "Không kết nối được tới dịch vụ AI. Vui lòng thử lại.",
  retryable: true,
};

export function QuizAiDialog({
  open,
  onOpenChange,
  lessonTitle,
  maxOptions = DEFAULT_MAX_QUIZ_OPTIONS,
  onGenerate,
  onResume,
  onApply,
}: QuizAiDialogProps) {
  const [sourceMode, setSourceMode] = useState<AiQuizRequest["sourceMode"]>("lesson");
  const [sourceText, setSourceText] = useState("");
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<AiQuizDifficulty>("medium");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [draftJobId, setDraftJobId] = useState<string | undefined>();
  const [nextKey, setNextKey] = useState(1);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const sequence = useRef(0);
  const activeGeneration = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open || !onResume) return;
    const current = ++sequence.current;
    const controller = new AbortController();
    setIsGenerating(true);
    void onResume(controller.signal).then((result) => {
      if (sequence.current !== current || !result) return;
      if (result.success) {
        setDraftJobId(result.jobId);
        setItems(result.questions.map((question, key) => ({ key, question, state: "pending", editing: false })));
        setNextKey(result.questions.length);
      } else setError(result);
    }).catch(() => undefined).finally(() => { if (sequence.current === current) setIsGenerating(false); });
    return () => { controller.abort(); activeGeneration.current?.abort(); sequence.current++; };
  // Resume once per dialog opening, not on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const request: AiQuizRequest = { count, difficulty, sourceMode, sourceText, focus };

  const runGeneration = async () => {
    sequence.current++;
    activeGeneration.current?.abort();
    const controller = new AbortController();
    activeGeneration.current = controller;
    setIsGenerating(true);
    setError(null);
    setConfirmAllOpen(false);
    let result: AiQuizGenerationResult;
    try {
      result = await onGenerate(request, controller.signal);
    } catch {
      result = NETWORK_ERROR;
    } finally {
      if (activeGeneration.current === controller) activeGeneration.current = null;
      setIsGenerating(false);
    }

    if (controller.signal.aborted) return;
    if (!result.success) {
      setError(result);
      return;
    }
    setDraftJobId(result.jobId);
    let key = nextKey;
    setItems(
      result.questions.map((question) => ({
        key: key++,
        question,
        state: "pending",
        editing: false,
      })),
    );
    setNextKey(key);
  };

  const updateItem = (key: number, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev?.map((item) => (item.key === key ? { ...item, ...patch } : item)) ?? null);
  };

  const updateDraft = (key: number, patch: Partial<QuizQuestionInput>) => {
    setItems((prev) =>
      prev?.map((item) =>
        item.key === key ? { ...item, question: { ...item.question, ...patch } } : item,
      ) ?? null,
    );
  };

  const setOption = (key: number, optionIndex: number, value: string) => {
    setItems((prev) =>
      prev?.map((item) => {
        if (item.key !== key) return item;
        const options = [...item.question.options];
        options[optionIndex] = value;
        return { ...item, question: { ...item.question, options } };
      }) ?? null,
    );
  };

  const toggleAccept = (item: ReviewItem) => {
    if (item.state === "accepted") {
      updateItem(item.key, { state: "pending" });
      return;
    }
    // An invalid draft opens in edit mode, where its issue is shown under the fields.
    if (validateQuestionDraft(item.question, maxOptions).length > 0) {
      updateItem(item.key, { editing: true });
      return;
    }
    updateItem(item.key, { state: "accepted", editing: false });
  };

  const acceptAll = () => {
    setItems((prev) =>
      prev?.map((item) =>
        item.state === "discarded" || validateQuestionDraft(item.question, maxOptions).length > 0
          ? item
          : { ...item, state: "accepted", editing: false },
      ) ?? null,
    );
  };

  const isValid = (item: ReviewItem) => validateQuestionDraft(item.question, maxOptions).length === 0;
  const applicableItems = items?.filter((item) => item.state === "accepted" && isValid(item)) ?? [];
  const acceptedCount = applicableItems.length;
  const acceptableItems = items?.filter((item) => item.state === "pending" && isValid(item)) ?? [];

  const handleApply = () => {
    if (!items || acceptedCount === 0) return;
    onApply(applicableItems.map((item) => ({ ...item.question, aiGenerated: true, aiReviewed: true })), draftJobId);
    setItems(null);
    onOpenChange(false);
  };

  const showResults = items !== null && !isGenerating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Tạo câu hỏi bằng AI
          </DialogTitle>
          <DialogDescription>
            AI chỉ tạo bản nháp cho bài <strong>{lessonTitle}</strong>. Chỉ những câu bạn chấp nhận
            mới được thêm vào bài, và bạn vẫn cần lưu bài trắc nghiệm.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant={error.code === "no_material" ? "warning" : "destructive"}>

            <AlertTitle>{titleFor(error.code)}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{error.message}</p>
              <div className="flex flex-wrap gap-2">
                {error.code === "no_material" && (
                  <Button size="sm" variant="secondary" onClick={() => setSourceMode("paste")}>
                    Dán nội dung
                  </Button>
                )}
                {error.retryable && (
                  <Button size="sm" variant="secondary" onClick={runGeneration} disabled={isGenerating}>
                    Thử lại
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {isGenerating && (
          <div role="status" aria-busy="true" className="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/30 p-4 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>AI đang tạo {count} câu hỏi từ nội dung bài học…</span>
          </div>
        )}

        {!showResults && (
          <fieldset disabled={isGenerating} className="space-y-4">
            <legend className="text-xs font-semibold text-foreground">Nguồn nội dung</legend>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ai-quiz-source"
                  checked={sourceMode === "lesson"}
                  onChange={() => setSourceMode("lesson")}
                />
                Nội dung bài học
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ai-quiz-source"
                  checked={sourceMode === "paste"}
                  onChange={() => setSourceMode("paste")}
                />
                Dán nội dung
              </label>
            </div>
            {sourceMode === "lesson" ? (
              <p className="text-[11px] text-muted-foreground">
                AI đọc mô tả và nội dung đọc của bài học. Nếu bài chưa có nội dung đọc, hãy chọn
                &quot;Dán nội dung&quot;.
              </p>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="ai-quiz-paste" className="text-xs font-semibold text-foreground">
                  Nội dung để tạo câu hỏi
                </label>
                <Textarea
                  id="ai-quiz-paste"
                  rows={6}
                  maxLength={MAX_PASTE_CHARS}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Dán đoạn văn, slide hoặc ghi chú bài giảng..."
                  className="text-sm"
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {sourceText.length}/{MAX_PASTE_CHARS}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="ai-quiz-focus" className="text-xs font-semibold text-foreground">
                Trọng tâm (không bắt buộc)
              </label>
              <Input
                id="ai-quiz-focus"
                maxLength={MAX_FOCUS_CHARS}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Ví dụ: sự khác nhau giữa props và state"
                className="h-9 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Số câu
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs font-normal text-foreground"
                >
                  {COUNT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} câu
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Độ khó
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as AiQuizDifficulty)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs font-normal text-foreground"
                >
                  {DIFFICULTY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        )}

        {showResults && items && (
          <section className="space-y-3" aria-label="Kết quả AI">
            <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 bg-background px-1 py-2 text-xs">
              <span className="font-semibold text-foreground">
                {items.length} câu · {acceptedCount} đã chấp nhận
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmAllOpen(true)}
                  disabled={acceptableItems.length === 0}
                >
                  Chấp nhận tất cả
                </Button>
                <Button size="sm" variant="ghost" onClick={runGeneration} className="gap-1.5">
                  <RotateCcw className="size-3.5" />
                  Tạo lại
                </Button>
              </div>
            </div>

            {confirmAllOpen && (
              <div role="alert" className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  Chấp nhận {acceptableItems.length} câu?
                </p>
                <p className="text-muted-foreground">
                  Các câu sau sẽ được đánh dấu đã chấp nhận. Bạn vẫn có thể bỏ chấp nhận trước khi thêm vào bài.
                </p>
                <ol className="list-decimal space-y-0.5 pl-5 text-foreground">
                  {acceptableItems.map((item) => (
                    <li key={item.key} className="truncate">
                      {item.question.text}
                    </li>
                  ))}
                </ol>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmAllOpen(false)}>
                    Huỷ
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      acceptAll();
                      setConfirmAllOpen(false);
                    }}
                  >
                    Chấp nhận {acceptableItems.length} câu
                  </Button>
                </div>
              </div>
            )}

            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">AI chưa tạo được câu nào. Thử dán nội dung chi tiết hơn.</p>
            )}

            <ol className="space-y-2">
              {items.map((item, index) => (
                <ReviewCard
                  key={item.key}
                  index={index}
                  item={item}
                  maxOptions={maxOptions}
                  onToggleAccept={() => toggleAccept(item)}
                  onToggleEdit={() => updateItem(item.key, { editing: !item.editing })}
                  onDiscard={() => updateItem(item.key, { state: item.state === "discarded" ? "pending" : "discarded", editing: false })}
                  onTextChange={(text) => updateDraft(item.key, { text })}
                  onExplanationChange={(explanation) => updateDraft(item.key, { explanation })}
                  onOptionChange={(optionIndex, value) => setOption(item.key, optionIndex, value)}
                  onCorrectChange={(optionIndex) => updateDraft(item.key, { correctIndex: optionIndex })}
                />
              ))}
            </ol>
          </section>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {showResults ? (
            <Button onClick={handleApply} disabled={acceptedCount === 0} className="gap-1.5">
              <CheckCircle2 className="size-4" />
              Thêm {acceptedCount} câu đã chấp nhận
            </Button>
          ) : (
            <Button onClick={runGeneration} disabled={isGenerating || (sourceMode === "paste" && !sourceText.trim())} className="gap-1.5">
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isGenerating ? "Đang tạo…" : "Tạo câu hỏi"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function titleFor(code: AiError["code"]) {
  switch (code) {
    case "no_material":
      return "Chưa có nội dung để AI đọc";
    case "rate_limited":
      return "AI đang bận";
    case "not_configured":
      return "AI chưa sẵn sàng";
    case "invalid_output":
      return "AI chưa tạo đúng định dạng";
    default:
      return "AI chưa tạo được nội dung";
  }
}

interface ReviewCardProps {
  index: number;
  item: ReviewItem;
  maxOptions: number;
  onToggleAccept: () => void;
  onToggleEdit: () => void;
  onDiscard: () => void;
  onTextChange: (text: string) => void;
  onExplanationChange: (explanation: string) => void;
  onOptionChange: (optionIndex: number, value: string) => void;
  onCorrectChange: (optionIndex: number) => void;
}

const STATE_LABEL: Record<ReviewState, string> = {
  pending: "Chờ duyệt",
  accepted: "Đã chấp nhận",
  discarded: "Đã bỏ",
};


function ReviewCard({
  index,
  item,
  maxOptions,
  onToggleAccept,
  onToggleEdit,
  onDiscard,
  onTextChange,
  onExplanationChange,
  onOptionChange,
  onCorrectChange,
}: ReviewCardProps) {
  const { question, state, editing } = item;
  const issues = editing ? validateQuestionDraft(question, maxOptions) : [];
  const label = `Câu ${index + 1}`;

  return (
    <li
      className={cn(
        "space-y-2 rounded-lg border p-3 text-sm transition-colors",
        state === "accepted" ? "border-primary/60 bg-primary/5" : "border-border/80 bg-background",
        state === "discarded" && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-semibold",
              state === "accepted" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {STATE_LABEL[state]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {state === "pending" && (
            <>
              <Button size="sm" onClick={onToggleAccept}>
                Chấp nhận
              </Button>
              <Button size="sm" variant="outline" onClick={onToggleEdit}>
                {editing ? "Xong" : "Sửa"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDiscard} aria-label={`Bỏ ${label}`} className="gap-1">
                <Trash2 className="size-3.5" />
                Bỏ
              </Button>
            </>
          )}
          {state === "accepted" && (
            <>
              <Button size="sm" variant="outline" onClick={onToggleEdit}>
                {editing ? "Xong" : "Sửa"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onToggleAccept} aria-label={`Hoàn tác chấp nhận ${label}`} className="gap-1">
                <RotateCcw className="size-3.5" />
                Hoàn tác
              </Button>
            </>
          )}
          {state === "discarded" && (
            <Button size="sm" variant="ghost" onClick={onDiscard} aria-label={`Hoàn tác bỏ ${label}`} className="gap-1">
              <RotateCcw className="size-3.5" />
              Hoàn tác
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            aria-label={`Nội dung ${label}`}
            value={question.text}
            onChange={(e) => onTextChange(e.target.value)}
            className="field-sizing-content text-sm"
          />
          <div className="space-y-1">
            {question.options.map((option, optionIndex) => {
              const letter = String.fromCharCode(65 + optionIndex);
              return (
                <div
                  key={optionIndex}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-0.5",
                    question.correctIndex === optionIndex && "bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name={`ai-correct-${item.key}`}
                    aria-label={`Đáp án đúng ${letter}`}
                    checked={question.correctIndex === optionIndex}
                    onChange={() => onCorrectChange(optionIndex)}
                  />
                  <span className="w-4 text-xs font-semibold text-muted-foreground">{letter}.</span>
                  <Input
                    aria-label={`Phương án ${letter}`}
                    value={option}
                    onChange={(e) => onOptionChange(optionIndex, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              );
            })}
          </div>
          <Textarea
            rows={2}
            aria-label={`Giải thích ${label}`}
            value={question.explanation ?? ""}
            onChange={(e) => onExplanationChange(e.target.value)}
            placeholder="Giải thích đáp án..."
            className="field-sizing-content text-xs"
          />
          {issues.length > 0 && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {issues[0]}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-foreground">{question.text}</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
            {question.options.map((option, optionIndex) => {
              const isCorrect = optionIndex === question.correctIndex;
              return (
                <li
                  key={optionIndex}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-1.5 py-0.5",
                    isCorrect ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="w-4 shrink-0 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                  <span className="min-w-0 flex-1">{option}</span>
                  {isCorrect && <Check className="size-3 shrink-0 text-primary" aria-label="Đáp án đúng" />}
                </li>
              );
            })}
          </ul>
          {question.explanation && (
            <p className="truncate text-xs text-muted-foreground" title={question.explanation}>
              Giải thích: {question.explanation}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
