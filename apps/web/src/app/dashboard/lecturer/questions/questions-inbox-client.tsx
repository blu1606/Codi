"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Inbox,

  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { Label } from "@codi-1/ui/components/label";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  formatRelativeTime,
  getConversationMessageRoleLabel,
  validateReplyText,
} from "@/lib/qa-reviews-service";
import {
  reopenConversation,
  replyToPrivateConversation,
  replyToPublicQuestion,
  resolveConversation,
  type ConversationDetailDto,
  type ConversationListItemDto,
  type LecturerQuestionsDataDto,
  type QuestionDetailDto,
  type QuestionListItemDto,
} from "./actions";

interface QuestionsInboxClientProps {
  initialData: LecturerQuestionsDataDto;
}

function inboxTabClass(active: boolean) {
  return cn(
    "-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
    active
      ? "border-primary text-primary"
      : "border-transparent text-muted-foreground hover:text-foreground"
  );
}

export function QuestionsInboxClient({
  initialData,
}: QuestionsInboxClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const {
    view,
    status,
    counts,
    questions,
    conversations,
    selectedQuestion,
    selectedConversation,
  } = initialData;

  // Local state for reply forms
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Navigation handlers
  const handleSwitchView = (nextView: "questions" | "conversations") => {
    setReplyText("");
    setReplyError(null);
    startTransition(() => {
      const sp = new URLSearchParams();
      sp.set("view", nextView);
      if (nextView === "questions") {
        sp.set("status", status);
      }
      router.push(`/dashboard/lecturer/questions?${sp.toString()}` as any);
    });
  };

  const handleSwitchStatus = (nextStatus: "unanswered" | "answered") => {
    setReplyText("");
    setReplyError(null);
    startTransition(() => {
      const sp = new URLSearchParams();
      sp.set("view", "questions");
      sp.set("status", nextStatus);
      router.push(`/dashboard/lecturer/questions?${sp.toString()}` as any);
    });
  };

  const handleSelectItem = (id: number) => {
    setReplyText("");
    setReplyError(null);
    startTransition(() => {
      const sp = new URLSearchParams();
      sp.set("view", view);
      if (view === "questions") {
        sp.set("status", status);
      }
      sp.set("id", String(id));
      router.push(`/dashboard/lecturer/questions?${sp.toString()}` as any);
    });
  };

  // Reply handlers
  const handleSendPublicReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion) return;

    setReplyError(null);
    const validation = validateReplyText(replyText);
    if (!validation.isValid) {
      setReplyError(validation.error || "Câu trả lời không hợp lệ.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await replyToPublicQuestion({
        questionId: selectedQuestion.id,
        text: replyText,
      });

      if (!res.success) {
        setReplyError(res.error || "Không thể gửi câu trả lời.");
        return;
      }

      setReplyText("");
      toast.success("Đã gửi câu trả lời công khai và thông báo cho học viên.");

      startTransition(() => {
        const sp = new URLSearchParams();
        sp.set("view", "questions");
        sp.set("status", "answered");
        sp.set("id", String(selectedQuestion.id));
        router.push(`/dashboard/lecturer/questions?${sp.toString()}` as any);
      });
    } catch {
      setReplyError("Có lỗi xảy ra khi gửi câu trả lời.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendPrivateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation) return;

    setReplyError(null);
    const validation = validateReplyText(replyText);
    if (!validation.isValid) {
      setReplyError(validation.error || "Câu trả lời không hợp lệ.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await replyToPrivateConversation({
        conversationId: selectedConversation.id,
        text: replyText,
      });

      if (!res.success) {
        setReplyError(res.error || "Không thể gửi câu trả lời.");
        return;
      }

      setReplyText("");
      toast.success("Đã gửi câu trả lời và thông báo cho học viên.");

      startTransition(() => {
        const sp = new URLSearchParams();
        sp.set("view", "conversations");
        sp.set("id", String(selectedConversation.id));
        router.push(`/dashboard/lecturer/questions?${sp.toString()}` as any);
      });
    } catch {
      setReplyError("Có lỗi xảy ra khi gửi câu trả lời.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveConversation = async () => {
    if (!selectedConversation) return;
    setIsSubmitting(true);
    try {
      const res = await resolveConversation({
        conversationId: selectedConversation.id,
      });

      if (!res.success) {
        toast.error(res.error || "Không thể đánh dấu đã giải quyết.");
        return;
      }

      toast.success("Đã đánh dấu cuộc hội thoại đã giải quyết.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Có lỗi xảy ra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenConversation = async () => {
    if (!selectedConversation) return;
    setIsSubmitting(true);
    try {
      const res = await reopenConversation({
        conversationId: selectedConversation.id,
      });

      if (!res.success) {
        toast.error(res.error || "Không thể mở lại cuộc hội thoại.");
        return;
      }

      toast.success("Đã mở lại cuộc hội thoại.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Có lỗi xảy ra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hỏi đáp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === "conversations"
              ? "Cuộc hội thoại chuyển tiếp từ AI trợ lý."
              : "Câu hỏi của học viên theo từng bài học."}
          </p>
        </div>
      </div>

      {/* Tabs gạch chân (mockup .tabs): trạng thái câu hỏi, hoặc một tab cho hội thoại AI */}
      <div className="flex items-center gap-1 border-b border-border">
        {view === "questions" ? (
          <>
            <button
              type="button"
              onClick={() => handleSwitchStatus("unanswered")}
              className={inboxTabClass(status === "unanswered")}
            >
              Chưa trả lời ({counts.unanswered})
            </button>
            <button
              type="button"
              onClick={() => handleSwitchStatus("answered")}
              className={inboxTabClass(status === "answered")}
            >
              Đã trả lời ({counts.answered})
            </button>
          </>
        ) : (
          <button type="button" className={inboxTabClass(true)}>
            Từ AI trợ lý ({counts.aiConversations})
          </button>
        )}
      </div>

      {/* Chọn nguồn: câu hỏi của học viên hoặc hội thoại AI */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-pressed={view === "questions"}
          onClick={() => handleSwitchView("questions")}
          className={cn(view === "questions" && "bg-muted text-foreground")}
        >
          Câu hỏi từ học viên ({counts.unanswered + counts.answered})
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={view === "conversations"}
          onClick={() => handleSwitchView("conversations")}
          className={cn(view === "conversations" && "bg-muted text-foreground")}
        >
          Cuộc hội thoại AI ({counts.aiConversations})
        </Button>
      </div>

      {/* Split-view: Left List, Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: List (4 cols) */}
        <div className="lg:col-span-4 space-y-2">
          {view === "questions" ? (
            questions.length === 0 ? (
              <Card className="border border-border/80">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Không có câu hỏi.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {questions.map((q: QuestionListItemDto) => {
                  const isSelected = selectedQuestion?.id === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelectItem(q.id)}
                      className={cn(
                        "w-full text-left p-3.5 rounded-lg border transition-all text-sm block relative",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "border-border/80 bg-card hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="text-xs text-muted-foreground truncate">
                        {q.courseTitle} › {q.lessonTitle}
                      </div>
                      <p className="mt-1 font-semibold text-foreground line-clamp-2 leading-snug">
                        {q.body}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{q.authorName}</span>
                        <span className="shrink-0">
                          {formatRelativeTime(q.createdAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : conversations.length === 0 ? (
            <Card className="border border-border/80">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Không có cuộc hội thoại.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {conversations.map((c: ConversationListItemDto) => {
                const isSelected = selectedConversation?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectItem(c.id)}
                    className={cn(
                      "w-full text-left p-3.5 rounded-lg border transition-all text-sm block relative",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border/80 bg-card hover:bg-muted/40 hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">
                        {c.courseTitle}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold",
                          c.status === "resolved"
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                        )}
                      >
                        {c.status === "resolved" ? "Đã giải quyết" : "Đang mở"}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-foreground line-clamp-2 leading-snug">
                      {c.aiContext?.summary || "Cuộc trao đổi riêng với giảng viên"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{c.learnerName}</span>
                      <span className="shrink-0">
                        {formatRelativeTime(c.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detail (8 cols) */}
        <div className="lg:col-span-8">
          {view === "questions" ? (
            !selectedQuestion ? (
              <Card className="border border-border/80">
                <CardContent className="p-16">
                  <Empty>
                    <EmptyMedia>
                      <div className="p-4 rounded-full bg-muted text-muted-foreground">
                        <Inbox className="size-10" />
                      </div>
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>
                        {status === "unanswered"
                          ? "Không còn câu hỏi chưa trả lời"
                          : "Chưa có câu hỏi đã trả lời"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {status === "unanswered"
                          ? "Bạn đã trả lời hết các câu hỏi của học viên."
                          : "Các câu hỏi đã được phản hồi sẽ xuất hiện tại đây."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-border/80">
                <CardHeader className="pb-4 border-b border-border/60">
                  <div className="text-xs text-muted-foreground">
                    {selectedQuestion.courseTitle} › {selectedQuestion.lessonTitle}
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      {selectedQuestion.authorAvatar ? (
                        <img
                          src={selectedQuestion.authorAvatar}
                          alt=""
                          className="size-9 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {selectedQuestion.authorName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {selectedQuestion.authorName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelativeTime(selectedQuestion.createdAt)}
                        </div>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-semibold shrink-0",
                        selectedQuestion.status === "answered"
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning"
                      )}
                    >
                      {selectedQuestion.status === "answered"
                        ? "Đã trả lời"
                        : "Chưa trả lời"}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Question text */}
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/60 text-sm leading-relaxed text-foreground whitespace-pre-line">
                    {selectedQuestion.body}
                  </div>

                  {/* Replies Thread */}
                  {selectedQuestion.replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Phản hồi ({selectedQuestion.replies.length})
                      </span>
                      <div className="space-y-3">
                        {selectedQuestion.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className={cn(
                              "p-4 rounded-lg border text-sm space-y-1.5",
                              reply.isLecturer
                                ? "bg-primary/5 border-primary/30"
                                : "bg-card border-border"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <strong className="text-xs font-semibold text-foreground">
                                  {reply.authorName}
                                </strong>
                                {reply.isLecturer && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary text-primary-foreground">
                                    Giảng viên
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(reply.createdAt)}
                              </span>
                            </div>
                            <p className="leading-relaxed whitespace-pre-line text-foreground">
                              {reply.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reply Form */}
                  <form onSubmit={handleSendPublicReply} className="space-y-3 pt-2 border-t border-border">
                    <Label htmlFor="public-reply-input" className="text-sm font-semibold">
                      Trả lời {selectedQuestion.authorName}
                    </Label>

                    {replyError && (
                      <Alert variant="destructive" className="py-2 text-xs">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{replyError}</span>
                      </Alert>
                    )}

                    <Textarea
                      id="public-reply-input"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Nhập câu trả lời để giải đáp thắc mắc cho học viên..."
                      rows={4}
                      className="text-sm leading-relaxed"
                    />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Câu trả lời sẽ hiển thị công khai trong phần thảo luận của bài học này.
                      </span>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="gap-2 shrink-0 shadow-xs"
                      >
                        <Send className="size-3.5" />
                        {isSubmitting ? "Đang gửi..." : "Gửi trả lời"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )
          ) : !selectedConversation ? (
            <Card className="border border-border/80">
              <CardContent className="p-16">
                <Empty>
                  <EmptyMedia>
                    <div className="p-4 rounded-full bg-muted text-muted-foreground">
                      <Bot className="size-10" />
                    </div>
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Không có cuộc hội thoại nào từ AI</EmptyTitle>
                    <EmptyDescription>
                      Khi học viên chuyển tiếp câu hỏi từ AI trợ lý đến giảng viên, cuộc trò chuyện sẽ hiện ở đây.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-border/80">
              <CardHeader className="pb-4 border-b border-border/60">
                <div className="text-xs text-muted-foreground">
                  {selectedConversation.courseTitle} › {selectedConversation.lessonTitle}
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    {selectedConversation.learnerAvatar ? (
                      <img
                        src={selectedConversation.learnerAvatar}
                        alt=""
                        className="size-9 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {selectedConversation.learnerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedConversation.learnerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(selectedConversation.createdAt)}
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold shrink-0",
                      selectedConversation.status === "resolved"
                        ? "bg-success-soft text-success"
                        : "bg-warning-soft text-warning"
                    )}
                  >
                    {selectedConversation.status === "resolved"
                      ? "Đã giải quyết"
                      : "Đang mở"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* AI Context Box if available */}
                {selectedConversation.aiContext && (
                  <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Bot className="size-3.5 text-primary" />
                      Ngữ cảnh từ AI trợ lý
                    </span>

                    {selectedConversation.aiContext.summary && (
                      <p className="text-xs text-foreground leading-relaxed">
                        {selectedConversation.aiContext.summary}
                      </p>
                    )}

                    {selectedConversation.aiContext.code && (
                      <div className="p-2.5 rounded bg-muted/80 text-xs font-mono overflow-x-auto max-h-40 border border-border/50 text-foreground">
                        <pre>{selectedConversation.aiContext.code}</pre>
                      </div>
                    )}

                    {selectedConversation.aiContext.failingTest && (
                      <div className="text-xs text-destructive">
                        <strong>Test không đạt: </strong>
                        {selectedConversation.aiContext.failingTest}
                      </div>
                    )}
                  </div>
                )}

                {/* Messages Thread */}
                <div className="space-y-3 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tin nhắn trao đổi ({selectedConversation.messages.length})
                  </span>
                  <div className="space-y-3">
                    {selectedConversation.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "p-4 rounded-lg border text-sm space-y-1.5",
                          msg.isLecturer
                            ? "bg-primary/5 border-primary/30 ml-6"
                            : "bg-card border-border mr-6"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <strong className="text-xs font-semibold text-foreground">
                              {msg.authorName}
                            </strong>
                            {msg.authorId !== selectedConversation.learnerId && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary text-primary-foreground">
                                {getConversationMessageRoleLabel(msg, selectedConversation.learnerId)}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-line text-foreground">
                          {msg.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reply Form & Resolve / Reopen Controls (STATE-MACHINES §14.2) */}
                {selectedConversation.status === "resolved" ? (
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="p-4 rounded-lg bg-muted/40 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <CheckCircle2 className="size-4 text-success shrink-0" />
                        <span>
                          Cuộc hội thoại này đã được đánh dấu giải quyết. Không thể gửi thêm tin nhắn trừ khi mở lại.
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReopenConversation}
                        disabled={isSubmitting}
                        className="gap-1.5 text-xs shrink-0"
                      >
                        <RotateCcw className="size-3.5" />
                        Mở lại cuộc hội thoại
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendPrivateReply} className="space-y-3 pt-2 border-t border-border">
                    <Label htmlFor="private-reply-input" className="text-sm font-semibold">
                      Trả lời {selectedConversation.learnerName}
                    </Label>

                    {replyError && (
                      <Alert variant="destructive" className="py-2 text-xs">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{replyError}</span>
                      </Alert>
                    )}

                    <Textarea
                      id="private-reply-input"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Nhập câu trả lời riêng cho học viên..."
                      rows={4}
                      className="text-sm leading-relaxed"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="gap-2 shadow-xs"
                      >
                        <Send className="size-3.5" />
                        {isSubmitting ? "Đang gửi..." : "Gửi trả lời"}
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleResolveConversation}
                        disabled={isSubmitting}
                        className="gap-1.5 text-xs"
                      >
                        <CheckCircle2 className="size-3.5 text-success" />
                        Đánh dấu đã giải quyết
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
