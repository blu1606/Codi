"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@codi-1/ui/components/sheet";
import { Button } from "@codi-1/ui/components/button";
import { Textarea } from "@codi-1/ui/components/textarea";
import { AlertCircle, LoaderCircle, MessageCircle } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import type { LessonQuestion } from "@/lib/lesson-qa-contract";
import { formatRelativeTime } from "@/lib/qa-reviews-service";

export interface LessonQAPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  currentUserId?: string;
  docked?: boolean;
}

export function LessonQAPanel({
  open,
  onOpenChange,
  courseId,
  lessonId,
  lessonTitle,
  currentUserId,
  docked = false,
}: LessonQAPanelProps) {
  const [questions, setQuestions] = useState<LessonQuestion[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/discussions`;

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        setQuestions(json.questions || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadQuestions();
    }
  }, [open, courseId, lessonId]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setFormError("Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.");
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi câu hỏi.");
      }
      setText("");
      toast.success(
        "Đã gửi câu hỏi. Bạn sẽ nhận thông báo khi giảng viên trả lời.",
      );
      setQuestions((prev) => [data, ...prev]);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gửi câu hỏi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Hỏi đáp"
      description={`Câu hỏi về bài "${lessonTitle}"`}
      docked={docked}
      className="md:w-[420px]"
    >
      <div className="space-y-6">
        <form onSubmit={handlePost} className="space-y-2 rounded-lg border bg-muted/20 p-4">
          <label htmlFor="qa-input-text" className="text-sm font-semibold">
            Câu hỏi của bạn về bài &ldquo;{lessonTitle}&rdquo;
          </label>
          <Textarea
            id="qa-input-text"
            rows={3}
            placeholder="Mô tả chỗ bạn chưa hiểu, kèm đoạn mã nếu có..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (formError) setFormError(null);
            }}
            disabled={submitting}
            className={formError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {formError ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{formError}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Giảng viên và học viên cùng khoá đều xem được câu hỏi.
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || text.trim().length < 10}
            className="w-full sm:w-auto"
          >
            {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
            Gửi câu hỏi
          </Button>
        </form>

        <div className="space-y-4">
          {loading && !questions.length ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <LoaderCircle className="mr-2 size-5 animate-spin" />
              Đang tải danh sách câu hỏi...
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <MessageCircle className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Hãy là người đầu tiên đặt câu hỏi</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Câu hỏi về bài học này sẽ hiển thị ở đây.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {questions.map((q) => {
                const isMine = currentUserId && q.userId === currentUserId;
                const isAnswered = q.status === "answered";
                return (
                  <li
                    key={q.id}
                    className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase">
                          {q.name.slice(0, 1)}
                        </span>
                        <div>
                          <strong className="text-xs">
                            {q.name}
                            {isMine && " (bạn)"}
                          </strong>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {formatRelativeTime(q.createdAt)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          isAnswered
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning",
                        )}
                      >
                        {isAnswered
                          ? "Đã trả lời"
                          : "Đang chờ giảng viên trả lời"}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed break-words whitespace-pre-wrap">
                      {q.text}
                    </p>

                    {q.replies && q.replies.length > 0 && (
                      <div className="space-y-2 border-t pt-2">
                        {q.replies.map((rp) => (
                          <div
                            key={rp.id}
                            className={cn(
                              "space-y-1 rounded-md p-2.5 text-xs",
                              rp.isLecturer
                                ? "border border-primary/20 bg-primary-soft/30"
                                : "bg-muted/40",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold">{rp.name}</span>
                                {rp.isLecturer && (
                                  <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                                    Giảng viên
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {formatRelativeTime(rp.at)}
                              </span>
                            </div>
                            <p className="leading-relaxed break-words whitespace-pre-wrap">
                              {rp.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
