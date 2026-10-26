"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { Sheet } from "@codi-1/ui/components/sheet";
import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";
import { cn } from "@codi-1/ui/lib/utils";
import LessonMarkdown from "@/components/lesson-markdown";
import {
  DOWN_REASONS,
  HINT_NAMES,
  type DownReason,
  type TutorContext,
  type TutorContextChip,
  type TutorDiff,
  type TutorMessage,
  type TutorThreadView,
} from "@/lib/tutor-contract";
import type { LearnerConversationView } from "@/lib/lesson-qa-contract";
import { AskLecturerDialog } from "./ask-lecturer-dialog";

export interface AITutorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  isCodeLesson?: boolean;
  context?: TutorContext;
  docked?: boolean;
  onApplyDiff?: (diff: TutorDiff) => void;
  onUndoDiff?: (diff: TutorDiff) => void;
  onRerun?: () => void;
  onJumpToLine?: (line: number) => void;
}

export function AITutorPanel({
  open,
  onOpenChange,
  courseId,
  lessonId,
  lessonTitle,
  isCodeLesson = false,
  context: initialContext,
  docked = false,
  onApplyDiff,
  onUndoDiff,
  onRerun,
  onJumpToLine,
}: AITutorPanelProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [conversation, setConversation] = useState<LearnerConversationView | null>(null);
  const [askLecturerOpen, setAskLecturerOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [removedChips, setRemovedChips] = useState<Record<string, boolean>>({});

  // Active context state merged from props and external triggers
  const [activeContext, setActiveContext] = useState<TutorContext>(
    initialContext || { isCodeLesson, lessonTitle },
  );

  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/tutor`;
  const convEndpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/conversations`;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load thread and lecturer conversation status
  const loadThread = async () => {
    try {
      const [tutorRes, convRes] = await Promise.all([
        fetch(endpoint),
        fetch(convEndpoint),
      ]);

      if (tutorRes.ok) {
        const data: TutorThreadView = await tutorRes.json();
        setMessages(data.messages || []);
        setHintLevel(data.hintLevel || 0);
        setPrompts(data.availablePrompts || []);
      }

      if (convRes.ok) {
        const convData = await convRes.json();
        setConversation(convData.conversation || null);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (open) {
      void loadThread();
    }
  }, [open, courseId, lessonId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  // Listen to external custom events
  useEffect(() => {
    const handleContextEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      onOpenChange(true);
      setActiveContext((prev) => ({
        ...prev,
        ...detail,
        isCodeLesson,
        lessonTitle,
      }));
      setRemovedChips({});
      if (detail.ask) {
        void handleSend(detail.ask);
      }
    };

    window.addEventListener("codi:tutor-open", handleContextEvent);
    window.addEventListener("codi:tutor-context", handleContextEvent);
    return () => {
      window.removeEventListener("codi:tutor-open", handleContextEvent);
      window.removeEventListener("codi:tutor-context", handleContextEvent);
    };
  }, [courseId, lessonId, isCodeLesson, lessonTitle]);

  // Compute context chips
  const chips: TutorContextChip[] = [
    { id: "lesson", label: `Bài: ${lessonTitle}`, fixed: true },
    isCodeLesson ? { id: "code", label: "Code bạn đang viết" } : null,
    activeContext.testName ? { id: "test", label: `Test chưa đạt: ${activeContext.testName}` } : null,
    activeContext.runError ? { id: "err", label: `Lỗi: ${activeContext.runError.slice(0, 30)}…` } : null,
    activeContext.selection ? { id: "sel", label: `Đoạn đã chọn · ${activeContext.selection.split("\n").length} dòng` } : null,
  ].filter((c): c is TutorContextChip => c !== null && !removedChips[c.id]);

  const handleChipRemove = (chipId: string) => {
    setRemovedChips((prev) => ({ ...prev, [chipId]: true }));
  };

  const handleSend = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || busy) return;

    setInputVal("");
    setBusy(true);

    const tempUserMsg: TutorMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ask",
          text,
          context: activeContext,
          removedChips: Object.keys(removedChips),
        }),
      });

      const data: TutorThreadView = await res.json();
      if (!res.ok) {
        throw new Error(data as unknown as string);
      }
      setMessages(data.messages);
      setHintLevel(data.hintLevel);
    } catch {
      const errorMsg: TutorMessage = {
        id: `err-${Date.now()}`,
        role: "error",
        text: "AI trợ lý tạm thời không khả dụng. Bạn vẫn học tiếp bình thường.",
        question: text,
        at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
    }
  };

  const handleHint = async () => {
    if (busy || hintLevel >= 3) return;
    setBusy(true);

    const nextLevel = hintLevel + 1;
    const tempUserMsg: TutorMessage = {
      id: `user-hint-${Date.now()}`,
      role: "user",
      text: `Cho mình gợi ý ${nextLevel}/3`,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "hint",
          level: nextLevel,
          context: activeContext,
        }),
      });

      const data: TutorThreadView = await res.json();
      if (!res.ok) throw new Error();
      setMessages(data.messages);
      setHintLevel(data.hintLevel);
    } catch {
      const errorMsg: TutorMessage = {
        id: `err-hint-${Date.now()}`,
        role: "error",
        text: "Chưa thể tải gợi ý lúc này. Vui lòng thử lại sau.",
        at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (messageId: string, vote: "up" | "down" | null, reason?: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, vote, reason: reason || null } : m,
      ),
    );

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "vote", messageId, vote, reason }),
      });
      if (vote === "up") toast.success("Cảm ơn phản hồi của bạn.");
      else if (reason) toast.success("Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.");
    } catch {
      // Non-blocking
    }
  };

  const handleClear = async () => {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clear" }),
      });
      setMessages([]);
      setHintLevel(0);
      toast.success("Đã xoá cuộc trò chuyện.");
    } catch {
      toast.error("Không thể xoá cuộc trò chuyện.");
    }
  };

  const handleStop = () => {
    setBusy(false);
    setMessages((prev) => {
      const next = [...prev];
      next.push({
        id: `stopped-${Date.now()}`,
        role: "ai",
        text: "Bạn đã dừng câu trả lời này.",
        stopped: true,
        at: new Date().toISOString(),
      });
      return next;
    });
  };

  const handleRetry = (question?: string) => {
    if (question) {
      setMessages((prev) => prev.filter((m) => m.role !== "error"));
      void handleSend(question);
    }
  };

  const handleDiffAction = (
    msgIndex: number,
    op: "apply" | "skip" | "undo",
    diff: TutorDiff,
  ) => {
    const updated = { ...diff };
    if (op === "apply") {
      updated.state = "applied";
      onApplyDiff?.(diff);
      window.dispatchEvent(
        new CustomEvent("codi:tutor-diff", { detail: { op: "apply", diff } }),
      );
      toast.success("Đã thêm 1 dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.");
    } else if (op === "skip") {
      updated.state = "skipped";
      toast("Đã bỏ qua đề xuất sửa code.");
    } else if (op === "undo") {
      updated.state = null;
      onUndoDiff?.(diff);
      window.dispatchEvent(
        new CustomEvent("codi:tutor-diff", { detail: { op: "undo", diff } }),
      );
      toast.success("Đã hoàn tác, code trở lại như trước.");
    }

    setMessages((prev) =>
      prev.map((m, idx) => (idx === msgIndex ? { ...m, diff: updated } : m)),
    );
  };

  const handleRerunTest = () => {
    onRerun?.();
    window.dispatchEvent(new CustomEvent("codi:tutor-rerun"));
    if (!docked) onOpenChange(false);
  };

  const handleLineClick = (line: number) => {
    onJumpToLine?.(line);
    window.dispatchEvent(
      new CustomEvent("codi:tutor-line", { detail: { line } }),
    );
    if (!docked) onOpenChange(false);
  };

  const lastUserQuestion = [...messages].reverse().find((m) => m.role === "user")?.text || "";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="AI trợ lý"
        description="Gợi ý phương pháp, không đưa lời giải sẵn"
        docked={docked}
        className="flex flex-col md:w-[440px]"
        footer={
          <div className="space-y-3">
            {isCodeLesson && (
              <div className="flex items-center justify-between border-b pb-2">
                {hintLevel < 3 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-primary font-medium"
                    disabled={busy}
                    onClick={handleHint}
                  >
                    <Lightbulb className="size-3.5" />
                    <span>
                      Gợi ý {hintLevel + 1}/3 · {HINT_NAMES[hintLevel]}
                    </span>
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Đã dùng hết 3 gợi ý. Cần thêm trợ giúp? Mở “⋯” › Hỏi riêng giảng viên.
                  </span>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend(inputVal);
              }}
              className="flex items-center gap-2"
            >
              <Input
                placeholder="Hỏi AI về bài học này…"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={busy}
                className="h-9 text-xs"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={busy || !inputVal.trim()}
                aria-label="Gửi câu hỏi"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        }
      >
        <div className="flex flex-col space-y-4">
          {/* Top Bar: Context Chips & Details Menu */}
          <div className="flex items-start justify-between gap-2 border-b pb-3">
            <ul className="flex flex-wrap items-center gap-1.5" aria-label="Ngữ cảnh gửi kèm câu hỏi">
              {chips.map((c) => (
                <li
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  <span className="max-w-[170px] truncate">{c.label}</span>
                  {!c.fixed && (
                    <button
                      type="button"
                      onClick={() => handleChipRemove(c.id)}
                      className="rounded hover:text-foreground"
                      aria-label={`Bỏ "${c.label}" khỏi ngữ cảnh`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="Thao tác khác"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setAskLecturerOpen(true)}>
                  <MessageCircle className="mr-2 size-4" />
                  Hỏi riêng giảng viên
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={!messages.length || busy}
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Xoá cuộc trò chuyện
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Private lecturer conversation status row */}
          {conversation && (
            <div className="rounded-lg border bg-muted/20 text-xs">
              <button
                type="button"
                onClick={() => setConvOpen(!convOpen)}
                className="flex w-full items-center justify-between p-2.5 text-left font-medium hover:bg-muted/30"
                aria-expanded={convOpen}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      conversation.hasLecturerReply ? "bg-success" : "bg-warning",
                    )}
                    aria-hidden="true"
                  />
                  <span>
                    Câu hỏi riêng cho giảng viên ·{" "}
                    {conversation.hasLecturerReply ? "Đã có trả lời" : "Đang chờ trả lời"}
                  </span>
                </div>
                {convOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
              {convOpen && (
                <div className="border-t p-2.5 text-muted-foreground">
                  {conversation.hasLecturerReply && conversation.lastMessageText ? (
                    <p className="line-clamp-3 text-foreground">{conversation.lastMessageText}</p>
                  ) : (
                    <p>Giảng viên thường trả lời trong 24 giờ. Bạn sẽ nhận thông báo khi có trả lời.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Conversation Log */}
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <p className="text-xs font-semibold text-foreground">
                  Hỏi về bài &ldquo;{lessonTitle}&rdquo;
                </p>
                <ul className="space-y-1.5">
                  {(prompts.length ? prompts : isCodeLesson ? [
                    "Vì sao code của mình chưa chạy đúng?",
                    "Giải thích lại yêu cầu của bài",
                    "Lỗi hay gặp ở bài này là gì?",
                  ] : [
                    "Tóm tắt ý chính của bài",
                    "Cho mình một ví dụ khác",
                    "Lỗi hay gặp ở bài này là gì?",
                  ]).map((t) => (
                    <li key={t}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSend(t)}
                        className="flex w-full items-center justify-between rounded-md border border-border/60 bg-card p-2 text-left text-xs font-medium text-foreground shadow-xs hover:border-primary/50 hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span>{t}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {isCodeLesson ? "AI chỉ ra hướng và chỗ cần xem, không viết sẵn lời giải. " : ""}
                  AI có thể trả lời sai, hãy đối chiếu với tài liệu bài học.
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id || i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg bg-primary px-3.5 py-2 text-xs text-primary-foreground">
                        {m.text}
                      </div>
                    </div>
                  );
                }

                if (m.role === "limit") {
                  return (
                    <Alert key={m.id || i} variant="destructive" className="border-warning/50 bg-warning-soft text-xs text-foreground">
                      <AlertTitle className="text-xs font-semibold text-warning">
                        Bạn đã hỏi quá nhiều trong thời gian ngắn
                      </AlertTitle>
                      <AlertDescription className="mt-1 space-y-2 text-xs">
                        <p>Thử lại sau ít phút, hoặc hỏi riêng giảng viên của khoá học.</p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setAskLecturerOpen(true)}
                        >
                          Hỏi giảng viên
                        </Button>
                      </AlertDescription>
                    </Alert>
                  );
                }

                if (m.role === "error") {
                  return (
                    <Alert key={m.id || i} variant="destructive" className="text-xs">
                      <AlertTitle className="text-xs font-semibold">
                        AI trợ lý tạm thời không khả dụng
                      </AlertTitle>
                      <AlertDescription className="mt-1 space-y-2 text-xs">
                        <p>Câu hỏi chưa được trả lời. Bạn vẫn học tiếp bình thường.</p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleRetry(m.question)}
                          >
                            <RotateCcw className="size-3" />
                            Thử lại
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setAskLecturerOpen(true)}
                          >
                            Hỏi giảng viên
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  );
                }

                // AI Response Turn
                const diff = m.diff;
                return (
                  <div key={m.id || i} className="space-y-2.5 rounded-lg border bg-card p-3.5 text-xs shadow-xs">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <LessonMarkdown>{m.text}</LessonMarkdown>
                    </div>

                    {m.stopped && (
                      <p className="text-[11px] text-muted-foreground italic">
                        Đã dừng câu trả lời.
                      </p>
                    )}

                    {/* Line reference links */}
                    {m.lines && m.lines.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.lines.map((n) => (
                          <Button
                            key={n}
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-6 gap-1 text-[11px] font-mono"
                            onClick={() => handleLineClick(n)}
                          >
                            <Code2 className="size-3" />
                            Xem dòng {n}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Code Diff Proposal (≤ 3 lines) */}
                    {diff && (
                      <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span>Đề xuất thêm 1 dòng · trước dòng {diff.at}</span>
                          {diff.state === "applied" ? (
                            <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-medium text-success-foreground">
                              Đã áp dụng
                            </span>
                          ) : diff.state === "skipped" ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Đã bỏ qua
                            </span>
                          ) : null}
                        </div>

                        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
                          <span className="text-success font-semibold">+ {diff.add}</span>
                          {"\n"}
                          <span className="text-muted-foreground">  {diff.ctx}</span>
                        </pre>

                        {diff.state !== "skipped" && (
                          <div className="flex items-center gap-2 pt-1">
                            {diff.state === "applied" ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={handleRerunTest}
                                >
                                  <Play className="size-3" />
                                  Chạy lại test
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => handleDiffAction(i, "undo", diff)}
                                >
                                  <RotateCcw className="size-3" />
                                  Hoàn tác
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleDiffAction(i, "apply", diff)}
                                >
                                  Áp dụng
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleDiffAction(i, "skip", diff)}
                                >
                                  Bỏ qua
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thumbs Feedback Row */}
                    <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => handleVote(m.id, m.vote === "up" ? null : "up")}
                        className={cn(
                          "rounded p-1 hover:text-foreground",
                          m.vote === "up" && "text-primary font-bold",
                        )}
                        aria-pressed={m.vote === "up"}
                        aria-label="Câu trả lời hữu ích"
                      >
                        <ThumbsUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVote(m.id, m.vote === "down" ? null : "down")}
                        className={cn(
                          "rounded p-1 hover:text-foreground",
                          m.vote === "down" && "text-destructive font-bold",
                        )}
                        aria-pressed={m.vote === "down"}
                        aria-label="Câu trả lời chưa tốt"
                      >
                        <ThumbsDown className="size-3.5" />
                      </button>

                      {m.vote === "down" && !m.reason && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px]">Chưa tốt ở điểm nào?</span>
                          {DOWN_REASONS.map((r: DownReason) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleVote(m.id, "down", r)}
                              className="rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] hover:bg-muted"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}

                      {m.reason && (
                        <span className="text-[10px] italic">Đã ghi nhận: {m.reason}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Thinking state with "Dừng" button */}
            {busy && (
              <div
                className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                aria-busy="true"
              >
                <div className="flex items-center gap-2">
                  <LoaderCircle className="size-3.5 animate-spin text-primary" />
                  <span>Codi đang suy nghĩ…</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={handleStop}
                >
                  <X className="size-3" />
                  Dừng
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </Sheet>

      {/* Ask Lecturer Escalation Dialog */}
      <AskLecturerDialog
        open={askLecturerOpen}
        onOpenChange={setAskLecturerOpen}
        courseId={courseId}
        lessonId={lessonId}
        lecturerName={conversation?.lecturerName || "Giảng viên"}
        initialQuestion={lastUserQuestion}
        codeContext={activeContext.code}
        failingTestContext={activeContext.testName}
        aiSummaryContext={messages
          .filter((m) => m.role === "user")
          .slice(-3)
          .map((m) => m.text)
          .join(" · ")}
        onSent={() => void loadThread()}
      />

      {/* Clear conversation confirm dialog */}
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Xoá cuộc trò chuyện của bài này?"
        consequence="Các câu hỏi và câu trả lời của AI trợ lý trong bài học này sẽ bị xoá."
        reversible="Thao tác này không thể hoàn tác. Cuộc trò chuyện ở các bài khác giữ nguyên."
        confirmLabel="Xoá cuộc trò chuyện"
        danger
        onConfirm={handleClear}
      />
    </>
  );
}
