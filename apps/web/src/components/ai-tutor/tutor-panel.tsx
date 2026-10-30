"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import LessonMarkdown from "@/components/lesson-markdown";
import {
  applyDiff,
  clip,
  HINT_NAMES,
  TUTOR_CONTEXT_LIMITS,
  TUTOR_DOWN_REASONS,
  TUTOR_HINT_MAX,
  TUTOR_MODE_LABELS,
  TUTOR_MODES,
  TUTOR_STOPPED_TEXT,
  tutorStarters,
  type TutorCommand,
  type TutorContext,
  type TutorMessage,
  type TutorMode,
  type TutorTurnCommand,
  type TutorView,
} from "@/lib/ai-tutor-contract";
import type { TutorCodeBridge, TutorOpenRequest } from "./tutor-bridge";
import TutorEscalateDialog, {
  type EscalateValues,
} from "./tutor-escalate-dialog";

type Busy = false | "thinking" | "streaming";
type Chip = { id: string; label: string; fixed?: boolean };
const short = (value: string) =>
  value.length > 60 ? `${value.slice(0, 57)}…` : value;

/**
 * The AI trợ lý thread. `sidebar` is the docked panel (Sheet on narrow screens) inside a lesson;
 * `page` is the full Tutor page, which renders the same thread without the sheet chrome.
 */
export default function TutorPanel({
  endpoint,
  request,
  code,
  codeVersion,
  docked,
  onClose,
  variant = "sidebar",
  expandHref,
  placeholder = "Hỏi trợ lý về bài học…",
  onTurnSettled,
  onPickLesson,
}: {
  endpoint: string;
  request: (TutorOpenRequest & { id: number }) | null;
  code: RefObject<TutorCodeBridge | null>;
  codeVersion: number;
  docked: boolean;
  onClose: () => void;
  variant?: "sidebar" | "page";
  /** Opens the same thread on the full Tutor page (sidebar only). */
  expandHref?: Route;
  placeholder?: string;
  /** Called after each answered, stopped or failed turn so the page can refresh its thread list. */
  onTurnSettled?: () => void;
  /** Lets the composer's + menu switch to another lesson's thread (page only). */
  onPickLesson?: () => void;
}) {
  const [view, setView] = useState<TutorView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(false);
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [stopped, setStopped] = useState<{
    question: string | null;
    text: string;
  } | null>(null);
  const [failure, setFailure] = useState<TutorTurnCommand | null>(null);
  const [ctx, setCtx] = useState<{ selection?: string; testId?: number }>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TutorMode>("simple");
  const [question, setQuestion] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  const [convOpen, setConvOpen] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const originals = useRef(new Map<number, string>());
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const handled = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setView(body);
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Chưa tải được AI trợ lý.",
      );
    } finally {
      setStopped(null);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
    return () => abort.current?.abort();
  }, [refresh]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [view, pending, streamText, busy, stopped]);

  // The context the learner sees as chips is exactly what is sent with the question.
  const bridge = code.current;
  void codeVersion;
  const failingAll = bridge ? bridge.failingTest(ctx.testId) : null;
  const runErrorAll = bridge ? bridge.runError() : null;
  const taskAll = bridge ? bridge.task() : null;
  const codeText = bridge ? bridge.getCode() : "";
  const failing = removed.has("test") ? null : failingAll;
  const runError = removed.has("err") ? null : runErrorAll;
  const task = removed.has("task") ? null : taskAll;
  const allChips: Chip[] = [
    { id: "lesson", label: `Bài: ${view?.lessonTitle ?? "…"}`, fixed: true },
    taskAll && { id: "task", label: `Yêu cầu: ${short(taskAll.label)}` },
    bridge && {
      id: "code",
      label: `Code bạn đang viết${codeText.length > TUTOR_CONTEXT_LIMITS.code ? " · đã rút gọn" : ""}`,
    },
    failingAll && { id: "test", label: `Test chưa đạt: ${failingAll.name}` },
    runErrorAll && { id: "err", label: `Lỗi: ${short(runErrorAll)}` },
    ctx.selection && {
      id: "sel",
      label: `Đoạn đã chọn · ${ctx.selection.split("\n").length} dòng${ctx.selection.length > TUTOR_CONTEXT_LIMITS.selection ? " · đã rút gọn" : ""}`,
    },
  ].filter((chip): chip is Chip => !!chip);
  const chips = allChips.filter((chip) => !removed.has(chip.id));
  const addable = allChips.filter((chip) => removed.has(chip.id));

  function context(): TutorContext {
    const value: TutorContext = {};
    if (task) value.task = clip(task.text, TUTOR_CONTEXT_LIMITS.task).text;
    if (ctx.selection && !removed.has("sel"))
      value.selection = clip(
        ctx.selection,
        TUTOR_CONTEXT_LIMITS.selection,
      ).text;
    if (bridge && !removed.has("code"))
      value.code = clip(bridge.getCode(), TUTOR_CONTEXT_LIMITS.code).text;
    if (failing) {
      // Sample tests may be far longer than the context limit; send the same clipped text the model reads.
      const cut = (text: string) => clip(text, TUTOR_CONTEXT_LIMITS.test).text;
      value.failingTest = {
        name: failing.name.slice(0, 200),
        input: failing.input === null ? null : cut(failing.input),
        expected: cut(failing.expected),
        actual: failing.actual === null ? null : cut(failing.actual),
      };
    }
    if (runError) value.error = clip(runError, TUTOR_CONTEXT_LIMITS.error).text;
    return value;
  }

  async function post(command: TutorCommand, signal?: AbortSignal) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal,
    });
  }
  async function readView(response: Response) {
    const body = await response.json().catch(() => null);
    if (body?.view) setView(body.view);
    else if (response.ok && body) setView(body);
    if (!response.ok && !body?.view)
      throw new Error(body?.error ?? "Không thể cập nhật AI trợ lý.");
  }
  async function command(next: TutorCommand) {
    try {
      await readView(await post(next));
      return true;
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Không thể cập nhật AI trợ lý.",
      );
      return false;
    }
  }

  // idle → thinking → (streaming →) answered | stopped | error | rate limited.
  async function turn(next: TutorTurnCommand, shown: string) {
    if (busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setStopped(null);
    setPending(shown);
    setStreamText("");
    setBusy("thinking");
    try {
      const response = await post(next, controller.signal);
      if (response.status === 409) {
        // Another tab is mid-turn on this lesson: not an AI failure, just show the thread as it is.
        const body = await response.json().catch(() => null);
        toast(body?.error ?? "AI trợ lý đang trả lời câu hỏi trước.");
        await refresh();
      } else if (
        response.headers.get("content-type")?.startsWith("text/plain")
      ) {
        setBusy("streaming");
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setStreamText(text);
        }
        await refresh();
      } else await readView(response);
    } catch {
      if (!controller.signal.aborted) setFailure(next);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
        setPending(null);
        setStreamText("");
      }
      onTurnSettled?.();
    }
  }
  function ask(text: string, retryOf?: number) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestion("");
    void turn(
      {
        type: "ask",
        question: trimmed,
        mode,
        context: context(),
        ...(retryOf ? { retryOf } : {}),
      },
      trimmed,
    );
  }
  function hint() {
    if (!view) return;
    void turn(
      { type: "hint", context: context() },
      `Cho mình gợi ý ${view.hintLevel + 1}/${TUTOR_HINT_MAX}`,
    );
  }
  function stop() {
    const controller = abort.current;
    if (!controller) return;
    abort.current = null;
    controller.abort();
    setStopped({ question: pending, text: streamText || TUTOR_STOPPED_TEXT });
    setBusy(false);
    setPending(null);
    setStreamText("");
    // The server saves the stopped turn once it sees the abort; pick up its canonical row.
    window.setTimeout(() => void refresh(), 900);
  }

  // A contextual entry point (selection toolbar, failed test, console error) adds context and may ask right away.
  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id;
    setCtx((previous) => ({
      selection: request.selection ?? previous.selection,
      testId: request.testId ?? previous.testId,
    }));
    setRemoved(new Set());
    if (request.ask) setQueued(request.ask);
    else if (docked) window.setTimeout(() => input.current?.focus(), 50);
  }, [request, docked]);
  // Sent on the render after the new context is in state, once the thread has loaded and no turn is running.
  useEffect(() => {
    if (!queued || !view || busy) return;
    setQueued(null);
    ask(queued);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, view, busy]);

  function line(n: number) {
    if (!bridge) {
      toast("Mở phần code của bài để xem dòng này.");
      return;
    }
    if (!docked) onClose();
    bridge.selectLine(n);
  }
  async function diff(message: TutorMessage, op: "apply" | "undo" | "skip") {
    if (op === "skip") {
      await command({ type: "diff", messageId: message.id, state: "skipped" });
      return;
    }
    if (!bridge || !message.diff) {
      toast("Mở phần code của bài để áp dụng đề xuất.");
      return;
    }
    if (op === "apply") {
      const original = bridge.getCode();
      bridge.setCode(applyDiff(original, message.diff));
      originals.current.set(message.id, original);
      if (
        await command({ type: "diff", messageId: message.id, state: "applied" })
      )
        toast.success(
          `Đã thêm ${message.diff.add.length} dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.`,
        );
    } else {
      const original = originals.current.get(message.id);
      if (original === undefined) {
        toast("Không còn bản code trước khi áp dụng để hoàn tác.");
        return;
      }
      bridge.setCode(original);
      originals.current.delete(message.id);
      if (await command({ type: "diff", messageId: message.id, state: null }))
        toast("Đã hoàn tác, code trở lại như trước.");
    }
  }
  async function vote(message: TutorMessage, value: "up" | "down") {
    const next = message.vote === value ? null : value;
    if (
      (await command({ type: "vote", messageId: message.id, vote: next })) &&
      next === "up"
    )
      toast("Cảm ơn phản hồi của bạn.");
  }
  async function reason(
    message: TutorMessage,
    value: (typeof TUTOR_DOWN_REASONS)[number],
  ) {
    if (
      await command({
        type: "vote",
        messageId: message.id,
        vote: "down",
        reason: value,
      })
    )
      toast("Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.");
  }
  async function escalate(values: EscalateValues) {
    const response = await post({
      type: "escalate",
      text: values.text,
      withSummary: values.withSummary,
      ...(values.withCode && bridge
        ? { code: clip(bridge.getCode(), TUTOR_CONTEXT_LIMITS.code).text }
        : {}),
      ...(values.withTest && failing ? { failingTest: failing.name } : {}),
    });
    await readView(response);
    toast.success(
      "Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.",
    );
  }

  const messages = view?.messages ?? [];
  const isCode = !!view?.isCode;
  const level = view?.hintLevel ?? 0;
  const lastQuestion =
    [...messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const starters = tutorStarters(isCode);
  const escalateButton = (variant: "outline" | "ghost" = "outline") => (
    <Button variant={variant} size="sm" onClick={() => setEscalating(true)}>
      <MessageCircle className="size-4" />
      Hỏi giảng viên
    </Button>
  );

  const composer = (
    <div className="space-y-3">
      {isCode && (
        <div className="flex flex-wrap items-center gap-2">
          {level < TUTOR_HINT_MAX ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy || !view}
              onClick={hint}
            >
              <Lightbulb className="size-4" />
              Gợi ý {level + 1}/{TUTOR_HINT_MAX} · {HINT_NAMES[level]}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Đã dùng hết 3 gợi ý. Cần thêm trợ giúp? Hỏi riêng giảng viên.
            </p>
          )}
          {level > 0 && (
            <span className="text-xs text-muted-foreground">
              Đã dùng {level}/{TUTOR_HINT_MAX} gợi ý
            </span>
          )}
          {level >= TUTOR_HINT_MAX && escalateButton("ghost")}
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Cách trả lời"
        className="flex flex-wrap gap-1.5"
      >
        {TUTOR_MODES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs transition-colors",
              mode === value
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {TUTOR_MODE_LABELS[value]}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Thêm ngữ cảnh"
              />
            }
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addable.map((chip) => (
              <DropdownMenuItem
                key={chip.id}
                onClick={() =>
                  setRemoved((previous) => {
                    const next = new Set(previous);
                    next.delete(chip.id);
                    return next;
                  })
                }
              >
                {chip.label}
              </DropdownMenuItem>
            ))}
            {onPickLesson && (
              <DropdownMenuItem onClick={onPickLesson}>
                Chọn bài khác…
              </DropdownMenuItem>
            )}
            {!addable.length && !onPickLesson && (
              <DropdownMenuItem disabled>
                Không có ngữ cảnh nào để thêm
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="sr-only" htmlFor="tutor-question">
          Câu hỏi cho AI trợ lý
        </label>
        <input
          ref={input}
          id="tutor-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          autoComplete="off"
          disabled={!!busy || !view}
          placeholder={placeholder}
          className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11"
          disabled={!!busy || !view || !question.trim()}
          aria-label="Gửi câu hỏi"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );

  const body = (
    <>
      <div className="space-y-4">
        {/* Context chips and the open-full-page link stay visible while the thread scrolls (sidebar only). */}
        <div
          className={cn(
            "flex items-start gap-2",
            variant === "sidebar" &&
              "sticky -top-5 z-10 -mx-5 -mt-5 border-b bg-card px-5 pb-3 pt-5",
          )}
        >
          <ul
            aria-label="Ngữ cảnh gửi kèm câu hỏi"
            className="flex min-w-0 flex-1 flex-wrap gap-1.5"
          >
            {chips.map((chip) => (
              <li
                key={chip.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
              >
                <span className="truncate">{chip.label}</span>
                {!chip.fixed && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-background"
                    aria-label={`Bỏ “${chip.label}” khỏi ngữ cảnh`}
                    onClick={() =>
                      setRemoved((previous) => new Set(previous).add(chip.id))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {expandHref && (
            <Link
              href={expandHref}
              aria-label="Mở trang Tutor"
              title="Mở trang Tutor"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Maximize2 className="size-4" />
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Thêm thao tác"
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEscalating(true)}>
                <MessageCircle className="size-4" />
                Hỏi riêng giảng viên
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!messages.length || !!busy}
                onClick={() => setClearing(true)}
              >
                <Trash2 className="size-4" />
                Xoá cuộc trò chuyện
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {view?.conversation && (
          <div className="rounded-lg border">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm"
              aria-expanded={convOpen}
              onClick={() => setConvOpen((open) => !open)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  view.conversation.replied || view.conversation.resolved
                    ? "bg-success"
                    : "bg-warning",
                )}
              />
              <span className="flex-1">
                Câu hỏi riêng cho giảng viên ·{" "}
                {view.conversation.resolved
                  ? "Đã giải quyết"
                  : view.conversation.replied
                    ? "Đã có trả lời"
                    : "Đang chờ trả lời"}
              </span>
              {convOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            {convOpen && (
              <p className="border-t px-3 py-2 text-sm text-muted-foreground">
                {view.conversation.lastReply ??
                  "Bạn sẽ nhận thông báo khi giảng viên trả lời."}
              </p>
            )}
          </div>
        )}

        {loadError && !view && (
          <Alert variant="destructive">
            <AlertTitle>Chưa tải được AI trợ lý</AlertTitle>
            <AlertDescription>
              {loadError}
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!view && !loadError && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Đang tải AI trợ lý…
          </p>
        )}

        {view && !messages.length && !pending && !stopped && (
          <div className="space-y-3">
            <p className="font-medium">Hỏi về bài “{view.lessonTitle}”</p>
            <ul className="space-y-2">
              {starters.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => ask(text)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm hover:bg-muted"
                  >
                    {text}
                    <ArrowRight className="size-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {isCode
                ? "AI chỉ ra hướng và chỗ cần xem, không viết sẵn lời giải. "
                : ""}
              AI có thể trả lời sai, hãy đối chiếu với tài liệu bài học.
            </p>
          </div>
        )}

        <div className="space-y-4" aria-live="polite">
          {messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              busy={!!busy}
              codeOpen={!!bridge}
              onLine={line}
              onDiff={(op) => void diff(message, op)}
              onRerun={() => {
                if (!docked) onClose();
                bridge?.runTests();
              }}
              hasOriginal={originals.current.has(message.id)}
              onVote={(value) => void vote(message, value)}
              onReason={(value) => void reason(message, value)}
              onRetry={() => ask(message.text, message.id)}
              escalate={escalateButton}
            />
          ))}
          {(pending ?? stopped?.question) && (
            <p className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {pending ?? stopped?.question}
            </p>
          )}
          {busy === "thinking" && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              aria-busy="true"
            >
              <LoaderCircle className="size-4 animate-spin" />
              <span>Codi đang suy nghĩ…</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={stop}
              >
                <X className="size-4" />
                Dừng
              </Button>
            </div>
          )}
          {busy === "streaming" && (
            <div className="space-y-2 text-sm" aria-busy="true">
              <LessonMarkdown>{streamText}</LessonMarkdown>
              <Button variant="ghost" size="sm" onClick={stop}>
                <X className="size-4" />
                Dừng
              </Button>
            </div>
          )}
          {stopped && (
            <div className="space-y-1 text-sm">
              <LessonMarkdown>{stopped.text}</LessonMarkdown>
              <p className="text-xs text-muted-foreground">
                Đã dừng câu trả lời.
              </p>
            </div>
          )}
          {failure && (
            <Alert variant="destructive">
              <AlertTitle>AI trợ lý tạm thời không khả dụng</AlertTitle>
              <AlertDescription>
                Câu hỏi chưa được gửi. Bạn vẫn học tiếp bình thường.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void turn(
                        failure,
                        failure.type === "ask"
                          ? failure.question
                          : "Cho mình gợi ý tiếp theo",
                      )
                    }
                  >
                    <RotateCcw className="size-4" />
                    Thử lại
                  </Button>
                  {escalateButton("ghost")}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <div ref={end} />
        </div>
      </div>

      <TutorEscalateDialog
        open={escalating}
        onOpenChange={setEscalating}
        lecturerName={view?.lecturerName ?? null}
        defaultText={lastQuestion}
        hasCode={!!bridge}
        failingTest={failing?.name ?? null}
        send={escalate}
      />
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Xoá cuộc trò chuyện của bài này?"
        consequence="Các câu hỏi và câu trả lời của AI trợ lý trong bài học này sẽ bị xoá. Cuộc trò chuyện ở các bài khác giữ nguyên."
        reversible="Không thể hoàn tác."
        danger
        confirmLabel="Xoá cuộc trò chuyện"
        onConfirm={async () => {
          await readView(await post({ type: "clear" }));
          originals.current.clear();
          toast("Đã xoá cuộc trò chuyện.");
        }}
      />
    </>
  );
  if (variant === "page")
    return (
      <section
        aria-label="Trò chuyện với Tutor"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-3xl">{body}</div>
        </div>
        <div className="border-t bg-background px-4 py-3 md:px-8">
          <div className="mx-auto max-w-3xl">{composer}</div>
        </div>
      </section>
    );
  return (
    <Sheet
      open
      docked={docked}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Trợ lý AI"
      description={
        docked ? undefined : `Hỏi về bài “${view?.lessonTitle ?? ""}”`
      }
      className={
        docked ? "sticky top-16 h-[calc(100svh-4rem)] self-start" : undefined
      }
      footer={composer}
    >
      {body}
    </Sheet>
  );
}

function MessageView({
  message,
  busy,
  codeOpen,
  onLine,
  onDiff,
  onRerun,
  hasOriginal,
  onVote,
  onReason,
  onRetry,
  escalate,
}: {
  message: TutorMessage;
  busy: boolean;
  /** False outside a code lesson: line jumps and code changes need the editor. */
  codeOpen: boolean;
  onLine: (line: number) => void;
  onDiff: (op: "apply" | "undo" | "skip") => void;
  onRerun: () => void;
  hasOriginal: boolean;
  onVote: (value: "up" | "down") => void;
  onReason: (value: (typeof TUTOR_DOWN_REASONS)[number]) => void;
  onRetry: () => void;
  escalate: (variant?: "outline" | "ghost") => ReactNode;
}) {
  if (message.role === "user")
    return (
      <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {message.text}
      </p>
    );
  if (message.role === "limit")
    return (
      <Alert variant="warning">
        <AlertTitle>Bạn đã hỏi quá nhiều trong thời gian ngắn</AlertTitle>
        <AlertDescription>
          Thử lại sau ít phút, hoặc hỏi riêng giảng viên.
          <div className="mt-3">{escalate()}</div>
        </AlertDescription>
      </Alert>
    );
  if (message.role === "error")
    return (
      <Alert variant="destructive">
        <AlertTitle>AI trợ lý tạm thời không khả dụng</AlertTitle>
        <AlertDescription>
          Câu hỏi chưa được trả lời. Bạn vẫn học tiếp bình thường.
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onRetry}
            >
              <RotateCcw className="size-4" />
              Thử lại
            </Button>
            {escalate("ghost")}
          </div>
        </AlertDescription>
      </Alert>
    );
  const diff = message.diff;
  return (
    <div className="space-y-2 text-sm">
      <LessonMarkdown>{message.text}</LessonMarkdown>
      {message.stopped && (
        <p className="text-xs text-muted-foreground">Đã dừng câu trả lời.</p>
      )}
      {codeOpen && message.lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.lines.map((n) => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              onClick={() => onLine(n)}
            >
              <Code2 className="size-4" />
              Xem dòng {n}
            </Button>
          ))}
        </div>
      )}
      {codeOpen && diff && (
        <div
          role="group"
          aria-label={`Đề xuất thay đổi${diff.state === "applied" ? " (đã áp dụng)" : ""}`}
          className="space-y-2 rounded-lg border p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Đề xuất thêm {diff.add.length} dòng · trước dòng {diff.at}
            </span>
            {diff.state === "applied" && (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">
                Đã áp dụng
              </span>
            )}
            {diff.state === "skipped" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Đã bỏ qua
              </span>
            )}
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
            {diff.add.map((added) => (
              <span key={added} className="block text-success">
                + {added}
              </span>
            ))}
            <span className="block text-muted-foreground"> {diff.context}</span>
          </pre>
          {diff.state !== "skipped" && (
            <div className="flex flex-wrap gap-2">
              {diff.state === "applied" ? (
                <>
                  <Button size="sm" onClick={onRerun}>
                    <Play className="size-4" />
                    Chạy lại test
                  </Button>
                  {hasOriginal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDiff("undo")}
                    >
                      <RotateCcw className="size-4" />
                      Hoàn tác
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => onDiff("apply")}>
                    Áp dụng
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDiff("skip")}
                  >
                    Bỏ qua
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button
          type="button"
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Sao chép câu trả lời"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.text);
              toast("Đã sao chép câu trả lời.");
            } catch {
              toast("Hãy chọn và sao chép nội dung câu trả lời.");
            }
          }}
        >
          <Copy className="size-4" />
        </button>
        <button
          type="button"
          aria-pressed={message.vote === "up"}
          aria-label="Hữu ích"
          onClick={() => onVote("up")}
          className={cn(
            "rounded p-1.5 hover:bg-muted",
            message.vote === "up" && "bg-accent text-primary",
          )}
        >
          <ThumbsUp className="size-4" />
        </button>
        <button
          type="button"
          aria-pressed={message.vote === "down"}
          aria-label="Không hữu ích"
          onClick={() => onVote("down")}
          className={cn(
            "rounded p-1.5 hover:bg-muted",
            message.vote === "down" && "bg-destructive-soft text-destructive",
          )}
        >
          <ThumbsDown className="size-4" />
        </button>
        {message.vote === "down" && !message.reason && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>Chưa tốt ở điểm nào?</span>
            {TUTOR_DOWN_REASONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onReason(value)}
                className="min-h-8 rounded-full border px-2.5 hover:bg-accent"
              >
                {value}
              </button>
            ))}
          </span>
        )}
        {message.reason && <span>Đã ghi nhận: {message.reason}</span>}
        {message.vote === "down" && (
          <span className="ml-1">{escalate("ghost")}</span>
        )}
      </div>
    </div>
  );
}
