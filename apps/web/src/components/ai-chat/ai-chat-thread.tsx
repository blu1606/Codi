"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";
import { cn } from "@codi-1/ui/lib/utils";
import {
  AI_CHAT_GUEST_TURNS,
  AI_CHAT_QUESTION_MAX,
  aiChatStarters,
  messageText,
  type AiChatMessage,
  type AiChatSummary,
} from "@/lib/ai-chat-contract";
import {
  applyDiff,
  clip,
  HINT_NAMES,
  lineRefs,
  TUTOR_CONTEXT_LIMITS,
  TUTOR_HINT_MAX,
  TUTOR_MODE_LABELS,
  TUTOR_MODES,
  type TutorContext,
  type TutorDiff,
  type TutorLessonMeta,
  type TutorMode,
} from "@/lib/ai-tutor-contract";
import TutorEscalateDialog, {
  type EscalateValues,
} from "@/components/ai-tutor/tutor-escalate-dialog";
import {
  missingIntake,
  INTAKE_FIELDS,
  type IntakeField,
} from "@/lib/learner-intake-contract";
import { toChatContext, useAiChat } from "./ai-chat-provider";
import { AiChatMessageView, type DiffActions } from "./ai-chat-message";
import { AiDisclaimer } from "./ai-chat-chrome";
import {
  IntakeQuestion,
  IntakeSummary,
  useLearnerIntake,
  type IntakeAsking,
} from "./ai-chat-intake";

type Chip = { id: string; label: string; fixed?: boolean };
const short = (value: string) =>
  value.length > 60 ? `${value.slice(0, 57)}…` : value;
const RATE_LIMITED = "Bạn đã hỏi quá nhiều trong thời gian ngắn";
const UNAVAILABLE = "Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.";

/** What went wrong with a turn, from the route's JSON error body or the stream's error text. */
function turnError(error: Error | undefined) {
  if (!error) return null;
  const status = (error as { statusCode?: number }).statusCode;
  let message = error.message;
  try {
    message = (JSON.parse(error.message) as { error?: string }).error ?? message;
  } catch {
    /* stream errors are plain text */
  }
  if (status === 429 || message === RATE_LIMITED) return { kind: "limit" as const, message };
  if (status && status < 500 && status !== 408)
    return { kind: "rejected" as const, message };
  return { kind: "unavailable" as const, message: UNAVAILABLE };
}

/**
 * The conversation with the Tutor, shared by the floating panel and the full page.
 * STATE-MACHINES §13: idle → thinking → streaming → answered | stopped | error | rate limited.
 */
export default function AiChatThread({
  variant,
  chatId,
  initialMessages,
  chat,
  lesson,
  onLesson,
  header,
}: {
  variant: "panel" | "page";
  chatId: string;
  initialMessages: AiChatMessage[];
  /** The stored chat; null while this is a new conversation. */
  chat: AiChatSummary | null;
  lesson: TutorLessonMeta | null;
  onLesson: (meta: TutorLessonMeta) => void;
  /** Page variant: the bar above the thread. */
  header?: ReactNode;
}) {
  const ai = useAiChat();
  const { page, signedIn } = ai;
  const kind = chat?.kind ?? page.kind;
  // Code chips and editor actions only apply while the chat's lesson is the one on screen.
  const here = !!lesson && page.kind === "lesson" && page.lessonId === lesson.lessonId;
  const bridge = here ? ai.code.current : null;
  void ai.codeVersion;

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<TutorMode>("simple");
  const [ctx, setCtx] = useState<{ selection?: string; testId?: number }>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [stopped, setStopped] = useState<Set<string>>(new Set());
  const [escalating, setEscalating] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  // S17 intake: a question waits here while the Tutor asks what it does not know about the learner.
  const general = kind === "general" && signedIn;
  const intake = useLearnerIntake(general);
  const [skipped, setSkipped] = useState<IntakeField[]>([]);
  const [asking, setAsking] = useState<IntakeAsking | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const originals = useRef(new Map<string, string>());
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // The context the learner sees as chips is exactly what is sent with the question.
  const failingAll = bridge ? bridge.failingTest(ctx.testId) : null;
  const runErrorAll = bridge ? bridge.runError() : null;
  const taskAll = bridge ? bridge.task() : null;
  const codeText = bridge ? bridge.getCode() : "";
  const failing = removed.has("test") ? null : failingAll;
  const runError = removed.has("err") ? null : runErrorAll;
  const task = removed.has("task") ? null : taskAll;
  const allChips: Chip[] = here
    ? [
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
      ].filter((chip): chip is Chip => !!chip)
    : [];
  const chips = allChips.filter((chip) => !removed.has(chip.id));
  const addable = allChips.filter((chip) => removed.has(chip.id));

  function attached(): TutorContext {
    const value: TutorContext = {};
    if (task) value.task = clip(task.text, TUTOR_CONTEXT_LIMITS.task).text;
    if (ctx.selection && !removed.has("sel"))
      value.selection = clip(ctx.selection, TUTOR_CONTEXT_LIMITS.selection).text;
    if (bridge && !removed.has("code"))
      value.code = clip(bridge.getCode(), TUTOR_CONTEXT_LIMITS.code).text;
    if (failing) {
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

  // The transport reads the latest screen context at send time.
  const latest = useRef({ page, mode, attached, signedIn });
  latest.current = { page, mode, attached, signedIn };
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AiChatMessage>({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
          const { page, mode, attached, signedIn } = latest.current;
          const index = messages.findLastIndex((m) => m.role === "user");
          const question = messages[index]!;
          return {
            body: {
              id,
              context: toChatContext(page),
              message: {
                id: question.id,
                role: "user",
                parts: question.parts.filter((part) => part.type === "text"),
                ...(question.metadata?.hint ? { metadata: { hint: true } } : {}),
              },
              // Guests have no stored history: the recent turns travel with the question.
              ...(signedIn
                ? {}
                : {
                    history: messages
                      .slice(0, index)
                      .slice(-AI_CHAT_GUEST_TURNS)
                      .map((m) => ({
                        id: m.id,
                        role: m.role,
                        parts: [{ type: "text", text: messageText(m) }],
                      })),
                  }),
              ...(page.kind === "lesson"
                ? { lesson: { mode, context: attached() } }
                : {}),
              trigger,
              messageId,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } =
    useChat<AiChatMessage>({
      id: chatId,
      messages: initialMessages,
      transport,
      experimental_throttle: 40,
      onFinish: ({ message, isAbort, isError }) => {
        if (isAbort) setStopped((ids) => new Set(ids).add(message.id));
        if (isError) return;
        if (signedIn) {
          ai.markStored(chatId);
          void ai.refreshChats();
        }
        if (message.metadata?.hint && lesson) void refreshLesson();
      },
    });
  const busy = status === "submitted" || status === "streaming";
  const failure = status === "error" ? turnError(error) : null;
  const last = messages.at(-1);
  // A question saved before the page was left mid-turn, or whose answer failed: offer to ask again.
  const unanswered =
    status === "ready" && last?.role === "user" && initialMessages.at(-1)?.id === last.id;

  async function refreshLesson() {
    if (!lesson) return;
    const query = new URLSearchParams({ courseId: lesson.courseId, lessonId: lesson.lessonId });
    const response = await fetch(`/api/ai/lesson?${query}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) onLesson(await response.json());
  }

  function send(question: string) {
    stick.current = true;
    setInput("");
    clearError();
    void sendMessage({ text: question.slice(0, AI_CHAT_QUESTION_MAX) });
  }
  function ask(text: string) {
    const question = text.trim();
    if (!question || busy || intakeBusy) return;
    // Ask only what is missing, once; the question waits and is sent when the last answer or skip lands.
    const missing = general && intake.draft ? missingIntake(intake.draft, skipped) : [];
    if (missing.length) {
      setInput("");
      setAsking({ fields: missing, pending: question.slice(0, AI_CHAT_QUESTION_MAX) });
      return;
    }
    send(question);
  }
  async function answerIntake(value: string | number | null) {
    if (!asking || intakeBusy) return;
    const field = asking.fields[0]!;
    if (value !== null) {
      setIntakeBusy(true);
      const saved = await intake.save({ [field]: value });
      setIntakeBusy(false);
      if (!saved) return;
    } else setSkipped((list) => [...list, field]);
    const rest = asking.fields.slice(1);
    if (rest.length) {
      setAsking({ ...asking, fields: rest });
      return;
    }
    setAsking(null);
    if (asking.pending) send(asking.pending);
  }
  function hint() {
    if (!lesson || busy) return;
    const level = lesson.hintLevel + 1;
    stick.current = true;
    clearError();
    void sendMessage({
      text: `Cho mình gợi ý ${level}/${TUTOR_HINT_MAX} · ${HINT_NAMES[lesson.hintLevel]}`,
      metadata: { hint: level },
    });
  }

  // A contextual entry point (selection toolbar, failed test, console error) adds context and may ask right away.
  // Taken from the provider once, so a remount of this thread (panel reopened, another chat) never sends it again.
  useEffect(() => {
    const request = ai.takeRequest();
    if (!request) return;
    setCtx((previous) => ({
      selection: request.selection ?? previous.selection,
      testId: request.testId ?? previous.testId,
    }));
    setRemoved(new Set());
    if (request.ask) setQueued(request.ask);
    else window.setTimeout(() => textarea.current?.focus(), 50);
  }, [ai.request]);
  // Sent on the render after the new context is in state.
  useEffect(() => {
    if (!queued || busy) return;
    setQueued(null);
    ask(queued);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, busy]);

  // Follow the answer while it streams, unless the learner scrolled up to read.
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  async function patch(body: object) {
    const response = await fetch(`/api/ai/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Chưa lưu được, hãy thử lại.");
      return false;
    }
    return true;
  }
  function setMeta(id: string, change: (meta: NonNullable<AiChatMessage["metadata"]>) => object) {
    setMessages((list) =>
      list.map((m) => (m.id === id ? { ...m, metadata: { ...m.metadata, ...change(m.metadata ?? {}) } } : m)),
    );
  }
  async function vote(message: AiChatMessage, value: "up" | "down") {
    const next = message.metadata?.vote === value ? null : value;
    setMeta(message.id, () => ({ vote: next, voteReason: null }));
    await patch({ type: "vote", messageId: message.id, vote: next });
  }
  async function reason(message: AiChatMessage, value: string) {
    setMeta(message.id, () => ({ voteReason: value }));
    if (await patch({ type: "vote", messageId: message.id, vote: "down", reason: value }))
      toast("Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.");
  }
  function diffActions(message: AiChatMessage): DiffActions {
    const setState = async (toolCallId: string, state: TutorDiff["state"]) => {
      setMeta(message.id, (meta) => ({ diffs: { ...meta.diffs, [toolCallId]: state } }));
      return patch({ type: "diff", messageId: message.id, toolCallId, state });
    };
    return {
      codeOpen: !!bridge,
      state: (id) => message.metadata?.diffs?.[id] ?? null,
      canUndo: (id) => originals.current.has(id),
      apply: (id, diff) => {
        if (!bridge) return;
        const original = bridge.getCode();
        bridge.setCode(applyDiff(original, diff));
        originals.current.set(id, original);
        void setState(id, "applied");
        toast.success(`Đã thêm ${diff.add.length} dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.`);
      },
      undo: (id) => {
        const original = originals.current.get(id);
        if (!bridge || original === undefined) return;
        bridge.setCode(original);
        originals.current.delete(id);
        void setState(id, null);
        toast("Đã hoàn tác, code trở lại như trước.");
      },
      skip: (id) => void setState(id, "skipped"),
      rerun: () => {
        if (variant === "panel" && window.innerWidth < 768) ai.setOpen(false);
        bridge?.runTests();
      },
    };
  }
  async function escalate(values: EscalateValues) {
    if (!lesson) return;
    const response = await fetch("/api/ai/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: lesson.courseId,
        lessonId: lesson.lessonId,
        chatId: chat || messages.length ? chatId : null,
        escalation: {
          text: values.text,
          withSummary: values.withSummary,
          ...(values.withCode && bridge
            ? { code: clip(bridge.getCode(), TUTOR_CONTEXT_LIMITS.code).text }
            : {}),
          ...(values.withTest && failing ? { failingTest: failing.name } : {}),
        },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Chưa gửi được câu hỏi cho giảng viên.");
    onLesson(body);
    toast.success("Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.");
  }

  const canEscalate = kind === "lesson" && !!lesson && signedIn;
  const escalateButton = canEscalate ? (
    <Button variant="ghost" size="sm" onClick={() => setEscalating(true)}>
      <MessageCircle className="size-4" />
      Hỏi giảng viên
    </Button>
  ) : null;
  const lastQuestion =
    [...messages].reverse().find((m) => m.role === "user") ?? null;
  const starters = aiChatStarters({ kind, isCode: lesson?.isCode, signedIn });
  const isCode = !!lesson?.isCode && here;
  const level = lesson?.hintLevel ?? 0;
  const empty = !messages.length;

  const composer = (
    <div className="space-y-2">
      {general && intake.draft && (
        <IntakeSummary
          draft={intake.draft}
          onClear={(field) => void intake.save({ [field]: null })}
          onEdit={() => {
            setSkipped([]);
            setAsking({ fields: [...INTAKE_FIELDS], pending: null });
          }}
        />
      )}
      {asking && (
        <IntakeQuestion
          asking={asking}
          busy={intakeBusy}
          onAnswer={(value) => void answerIntake(value)}
          onSkip={() => void answerIntake(null)}
        />
      )}
      <form
        className="rounded-2xl border bg-background shadow-raised focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        {chips.length > 0 && (
          <ul aria-label="Ngữ cảnh gửi kèm câu hỏi" className="flex flex-wrap gap-1.5 px-3 pt-3">
            {chips.map((chip) => (
              <li
                key={chip.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
              >
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={`Bỏ “${chip.label}” khỏi ngữ cảnh`}
                  onClick={() => setRemoved((previous) => new Set(previous).add(chip.id))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-start gap-2 px-3 pt-1">
          <Sparkles className="mt-3 size-4 shrink-0 text-primary" aria-hidden="true" />
          <label className="sr-only" htmlFor={`tutor-input-${variant}`}>
            Câu hỏi cho Tutor
          </label>
          <textarea
            ref={textarea}
            id={`tutor-input-${variant}`}
            rows={1}
            value={input}
            maxLength={AI_CHAT_QUESTION_MAX}
            onChange={(event) => {
              setInput(event.target.value);
              const node = event.target;
              node.style.height = "auto";
              node.style.height = `${Math.min(node.scrollHeight, 176)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                ask(input);
              }
              if (event.key === "Escape" && variant === "panel") ai.setOpen(false);
            }}
            placeholder={
              empty
                ? kind === "lesson"
                  ? "Hỏi Tutor về bài này…"
                  : "Hỏi Tutor về trang này…"
                : "Hỏi tiếp Tutor"
            }
            className="max-h-44 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 px-2 pb-2">
          {(addable.length > 0 || canEscalate) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full"
                    aria-label="Thêm ngữ cảnh hoặc hỏi giảng viên"
                    title="Thêm"
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
                    Gửi kèm: {chip.label}
                  </DropdownMenuItem>
                ))}
                {canEscalate && (
                  <DropdownMenuItem onClick={() => setEscalating(true)}>
                    <MessageCircle className="size-4" />
                    Hỏi riêng giảng viên
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {kind === "lesson" && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex min-h-8 shrink-0 items-center whitespace-nowrap gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Cách trả lời: ${TUTOR_MODE_LABELS[mode]}`}
                  />
                }
              >
                {TUTOR_MODE_LABELS[mode]}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TUTOR_MODES.map((value) => (
                  <DropdownMenuItem key={value} onClick={() => setMode(value)}>
                    {mode === value ? <Check className="size-4" /> : <span className="size-4" />}
                    {TUTOR_MODE_LABELS[value]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isCode &&
            (level < TUTOR_HINT_MAX ? (
              <button
                type="button"
                disabled={busy}
                onClick={hint}
                title={`Gợi ý ${level + 1}/${TUTOR_HINT_MAX} · ${HINT_NAMES[level]}`}
                className="inline-flex min-h-8 min-w-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Lightbulb className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Gợi ý {level + 1}/{TUTOR_HINT_MAX} · {HINT_NAMES[level]}
                </span>
              </button>
            ) : (
              <span className="truncate px-2 text-xs text-muted-foreground" title="Cần thêm trợ giúp? Hỏi riêng giảng viên.">
                Đã dùng hết 3 gợi ý
              </span>
            ))}
          <span className="ml-auto" />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-9 shrink-0 rounded-full"
              aria-label="Dừng câu trả lời"
              title="Dừng"
              onClick={() => void stop()}
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={!input.trim()}
              aria-label="Gửi (Enter)"
              title="Gửi (Enter)"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </form>
      <AiDisclaimer signedIn={signedIn} />
    </div>
  );

  const thread = (
    <div className="space-y-5" aria-live="polite">
      {lesson?.conversation && kind === "lesson" && (
        <div className="rounded-xl border text-sm">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
            aria-expanded={convOpen}
            onClick={() => setConvOpen((value) => !value)}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                lesson.conversation.replied || lesson.conversation.resolved ? "bg-success" : "bg-warning",
              )}
            />
            <span className="flex-1">
              Đã hỏi giảng viên ·{" "}
              {lesson.conversation.resolved
                ? "Đã giải quyết"
                : lesson.conversation.replied
                  ? "Giảng viên đã trả lời"
                  : "Đang chờ"}
            </span>
            {convOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {convOpen && (
            <p className="whitespace-pre-wrap border-t px-3 py-2 text-muted-foreground">
              {lesson.conversation.lastReply ?? "Bạn sẽ nhận thông báo khi giảng viên trả lời."}
            </p>
          )}
        </div>
      )}
      {messages.map((message, i) => (
        <AiChatMessageView
          key={message.id}
          message={message}
          streaming={busy && i === messages.length - 1 && message.role === "assistant"}
          stopped={stopped.has(message.id)}
          diff={kind === "lesson" ? diffActions(message) : null}
          actions={{
            vote: signedIn ? (value) => void vote(message, value) : null,
            reason: (value) => void reason(message, value),
            escalate: escalateButton,
            lines: bridge ? lineRefs(messageText(message), codeText.split("\n").length) : [],
            onLine: (n) => {
              if (variant === "panel" && window.innerWidth < 768) ai.setOpen(false);
              bridge?.selectLine(n);
            },
          }}
        />
      ))}
      {status === "submitted" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" />
          {kind === "lesson"
            ? `Tutor đang đọc bài “${lesson?.lessonTitle ?? page.label}”…`
            : "Tutor đang tìm câu trả lời…"}
        </p>
      )}
      {unanswered && !failure && (
        <Alert>
          <AlertTitle>Câu hỏi này chưa có câu trả lời</AlertTitle>
          <AlertDescription>
            <Button className="mt-2" variant="outline" size="sm" onClick={() => void regenerate()}>
              <RotateCcw className="size-4" />
              Hỏi lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {failure?.kind === "limit" && (
        <Alert variant="warning">
          <AlertTitle>{RATE_LIMITED}</AlertTitle>
          <AlertDescription>
            Thử lại sau ít phút{canEscalate ? ", hoặc hỏi riêng giảng viên" : ""}.
            {escalateButton && <div className="mt-2">{escalateButton}</div>}
          </AlertDescription>
        </Alert>
      )}
      {failure && failure.kind !== "limit" && (
        <Alert variant={failure.kind === "rejected" ? "warning" : "destructive"}>
          <AlertTitle>{failure.message}</AlertTitle>
          <AlertDescription>
            {failure.kind === "unavailable" && "Bạn vẫn học tiếp bình thường."}
            <div className="mt-2 flex flex-wrap gap-2">
              {failure.kind === "unavailable" && (
                <Button variant="outline" size="sm" onClick={() => void regenerate()}>
                  <RotateCcw className="size-4" />
                  Thử lại
                </Button>
              )}
              {escalateButton}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  const starterList = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Bạn có thể hỏi</p>
      <ul className="flex flex-col gap-2">
        {starters.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => ask(text)}
              className="min-h-10 w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  const dialog = canEscalate && (
    <TutorEscalateDialog
      open={escalating}
      onOpenChange={setEscalating}
      lecturerName={lesson?.lecturerName ?? null}
      defaultText={lastQuestion ? messageText(lastQuestion) : ""}
      hasCode={!!bridge}
      failingTest={failing?.name ?? null}
      send={escalate}
    />
  );
  const onScroll = () => {
    const node = scroller.current;
    if (node) stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  };

  if (variant === "page")
    return (
      <section aria-label="Đoạn chat" className="flex min-h-0 flex-1 flex-col">
        {header}
        {empty ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 py-8">
            <div className="mx-auto w-full max-w-[47.5rem] space-y-5">
              <h1 className="text-center font-display text-2xl font-semibold">
                Hôm nay bạn muốn hỏi gì?
              </h1>
              {composer}
              <div className="flex flex-wrap justify-center gap-2">
                {starters.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => {
                      setInput(text);
                      textarea.current?.focus();
                    }}
                    className="min-h-9 rounded-full border px-3 text-sm transition-colors hover:bg-muted"
                  >
                    {text}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Tutor trả lời theo tài liệu của Codi, kèm nguồn để mở lại. Hỏi về một bài thì mở bài đó rồi bấm
                Tutor, Tutor sẽ biết bạn đang ở đâu.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto max-w-[47.5rem]">{thread}</div>
            </div>
            <div className="px-4 pb-4">
              <div className="mx-auto max-w-[47.5rem]">{composer}</div>
            </div>
          </>
        )}
        {dialog}
      </section>
    );
  return (
    <>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty && !busy ? starterList : thread}
      </div>
      <div className="border-t p-3">{composer}</div>
      {dialog}
    </>
  );
}
