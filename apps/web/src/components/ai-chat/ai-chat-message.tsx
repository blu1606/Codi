"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { getToolName, isToolUIPart } from "ai";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Code2,
  Copy,
  GraduationCap,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@codi-1/ui/components/button";
import { cn } from "@codi-1/ui/lib/utils";
import { formatVnd } from "@/lib/ai-advisor-contract";
import {
  AI_CHAT_TOOL_LABELS,
  isCitationHref,
  messageText,
  type AiChatMessage,
  type CompareOutput,
  type CourseCardOutput,
  type MaterialHit,
  type SuggestChangeOutput,
} from "@/lib/ai-chat-contract";
import { TUTOR_DOWN_REASONS, type TutorDiff } from "@/lib/ai-tutor-contract";

type Part = AiChatMessage["parts"][number];

// Internal links in an answer are citations: a chip that opens the lesson or course in place.
function AnswerLink({
  node: _node,
  href,
  children,
  className,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  if (isCitationHref(href))
    return (
      <Link
        href={href as Route}
        className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-accent px-1.5 py-0.5 align-baseline text-xs font-medium text-primary no-underline hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookOpen className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{children}</span>
      </Link>
    );
  return (
    <a
      {...props}
      href={href}
      className={cn("font-medium text-primary underline underline-offset-4", className)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
const components = { a: AnswerLink };
const rehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
].filter((plugin) => plugin !== undefined);
const noLinkModal = { enabled: false };

export function AnswerMarkdown({
  children,
  streaming,
}: {
  children: string;
  streaming: boolean;
}) {
  return (
    <Streamdown
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      skipHtml
      rehypePlugins={rehypePlugins}
      linkSafety={noLinkModal}
      components={components}
      className="min-w-0 break-words text-sm leading-7 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_[data-streamdown=code-block]]:min-w-0 [&_[data-streamdown=code-block]]:max-w-full"
    >
      {children}
    </Streamdown>
  );
}

/** What the model thought before answering, folded by default once it is done. */
function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim() && !live) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md hover:text-foreground"
        aria-expanded={open || live}
        onClick={() => setOpen((value) => !value)}
      >
        {live ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Brain className="size-3.5" aria-hidden="true" />
        )}
        {live ? "Tutor đang suy nghĩ…" : "Đã suy nghĩ"}
        {!live && (
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        )}
      </button>
      {(open || live) && text.trim() && (
        <p className="mt-1 whitespace-pre-wrap border-l-2 pl-3 leading-6">{text}</p>
      )}
    </div>
  );
}

const TOOL_ICONS: Record<string, typeof Search> = {
  search_course_material: Search,
  get_my_progress: GraduationCap,
  search_courses: Search,
  compare_courses: Search,
  get_my_learning: GraduationCap,
  suggest_code_change: Code2,
};

/** One tool step ("Đã tìm trong tài liệu của học phần"), expandable to show what was asked and found. */
function ToolStep({
  name,
  state,
  input,
  detail,
}: {
  name: string;
  state: string;
  input: unknown;
  detail: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = AI_CHAT_TOOL_LABELS[name] ?? {
    running: "Đang dùng công cụ…",
    done: "Đã dùng công cụ",
  };
  const running = state === "input-streaming" || state === "input-available";
  const failed = state === "output-error";
  const Icon = TOOL_ICONS[name] ?? Wrench;
  const query =
    input && typeof input === "object" && "query" in input && typeof input.query === "string"
      ? input.query
      : null;
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md text-left hover:text-foreground"
        aria-expanded={open}
        disabled={running}
        onClick={() => setOpen((value) => !value)}
      >
        {running ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : failed ? (
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">
          {failed ? "Công cụ chưa trả về kết quả" : running ? label.running : label.done}
          {query ? ` · “${query}”` : ""}
        </span>
        {!running && detail && (
          <ChevronDown
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        )}
      </button>
      {open && detail && <div className="mt-1 border-l-2 pl-3">{detail}</div>}
    </div>
  );
}

function Sources({ hits }: { hits: MaterialHit[] }) {
  if (!hits.length)
    return <p className="py-1">Không tìm thấy bài nào khớp trong học phần.</p>;
  return (
    <ul className="space-y-1.5 py-1">
      {hits.map((hit) => (
        <li key={hit.href}>
          <Link href={hit.href as Route} className="font-medium text-primary hover:underline">
            {hit.title}
          </Link>
          {hit.chapter && <span> · {hit.chapter}</span>}
          <p className="line-clamp-2">{hit.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}

function CourseCards({ courses }: { courses: CourseCardOutput[] }) {
  if (!courses.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={`/courses/${encodeURIComponent(course.slug)}` as Route}
            className="flex h-full flex-col gap-1.5 rounded-xl border bg-card p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/50"
          >
            <span className="font-medium leading-snug">{course.title}</span>
            <span className="text-xs text-muted-foreground">
              {course.level} · {course.lessonCount} bài
              {course.rating !== null && (
                <>
                  {" · "}
                  <Star className="inline size-3 -translate-y-px" aria-hidden="true" />{" "}
                  {course.rating.toFixed(1)}
                </>
              )}
            </span>
            <span className="mt-auto text-xs font-medium">
              {course.owned ? (
                <span className="text-success">Đã sở hữu</span>
              ) : course.price ? (
                formatVnd(course.price)
              ) : (
                "Miễn phí"
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CompareTable({ table }: { table: CompareOutput }) {
  if (table.rows.length < 2) return null;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]} className="border-t">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-2 font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="px-3 py-2">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type DiffActions = {
  /** False when the lesson's code editor is not on screen: line jumps and changes need it. */
  codeOpen: boolean;
  state: (toolCallId: string) => TutorDiff["state"];
  canUndo: (toolCallId: string) => boolean;
  apply: (toolCallId: string, diff: TutorDiff) => void;
  undo: (toolCallId: string) => void;
  skip: (toolCallId: string) => void;
  rerun: () => void;
};

/** G9: a ≤ 3-line suggestion, applied to the editor only when the learner presses "Áp dụng". */
function DiffBlock({
  id,
  diff,
  actions,
}: {
  id: string;
  diff: TutorDiff;
  actions: DiffActions;
}) {
  const state = actions.state(id);
  return (
    <div
      role="group"
      aria-label={`Đề xuất thay đổi${state === "applied" ? " (đã áp dụng)" : ""}`}
      className="space-y-2 rounded-xl border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          Đề xuất thêm {diff.add.length} dòng · trước dòng {diff.at}
        </span>
        {state === "applied" && (
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">Đã áp dụng</span>
        )}
        {state === "skipped" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Đã bỏ qua</span>
        )}
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
        {diff.add.map((added, i) => (
          <span key={i} className="block text-success">
            + {added}
          </span>
        ))}
        <span className="block text-muted-foreground"> {diff.context}</span>
      </pre>
      {!actions.codeOpen ? (
        <p className="text-xs text-muted-foreground">Mở bài code này để áp dụng đề xuất.</p>
      ) : state !== "skipped" ? (
        <div className="flex flex-wrap gap-2">
          {state === "applied" ? (
            <>
              <Button size="sm" onClick={actions.rerun}>
                <Play className="size-4" />
                Chạy lại test
              </Button>
              {actions.canUndo(id) && (
                <Button variant="ghost" size="sm" onClick={() => actions.undo(id)}>
                  <RotateCcw className="size-4" />
                  Hoàn tác
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => actions.apply(id, diff)}>
                Áp dụng
              </Button>
              <Button variant="ghost" size="sm" onClick={() => actions.skip(id)}>
                Bỏ qua
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ToolPart({ part, diff }: { part: Part; diff: DiffActions | null }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const output = part.state === "output-available" ? (part.output as unknown) : null;
  let detail: ReactNode = null;
  let block: ReactNode = null;
  if (output && name === "search_course_material")
    detail = <Sources hits={(output as { hits: MaterialHit[] }).hits} />;
  if (output && name === "search_courses")
    block = <CourseCards courses={(output as { courses: CourseCardOutput[] }).courses} />;
  if (output && name === "compare_courses") block = <CompareTable table={output as CompareOutput} />;
  if (output && name === "suggest_code_change" && diff) {
    const result = output as SuggestChangeOutput;
    if (result.ok) block = <DiffBlock id={part.toolCallId} diff={result.diff} actions={diff} />;
  }
  return (
    <>
      <ToolStep name={name} state={part.state} input={part.input} detail={detail} />
      {block}
    </>
  );
}

export type AnswerActions = {
  vote: ((value: "up" | "down") => void) | null;
  reason: (value: (typeof TUTOR_DOWN_REASONS)[number]) => void;
  /** "Hỏi giảng viên" next to a 👎 (lesson chats only). */
  escalate: ReactNode;
  /** "Xem dòng N" buttons for lines of the learner's code this answer mentions. */
  lines: number[];
  onLine: (line: number) => void;
};

export function AiChatMessageView({
  message,
  streaming,
  stopped,
  diff,
  actions,
}: {
  message: AiChatMessage;
  streaming: boolean;
  stopped: boolean;
  diff: DiffActions | null;
  actions: AnswerActions;
}) {
  if (message.role === "user") {
    const text = messageText(message);
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-foreground">
          {text}
        </p>
      </div>
    );
  }
  const text = messageText(message);
  const lastIndex = message.parts.length - 1;
  const meta = message.metadata ?? {};
  return (
    <div className="space-y-2" aria-busy={streaming}>
      {message.parts.map((part, i) => {
        if (part.type === "reasoning")
          return (
            <Reasoning
              key={i}
              text={part.text}
              live={streaming && part.state === "streaming"}
            />
          );
        if (part.type === "text")
          return part.text.trim() ? (
            <AnswerMarkdown key={i} streaming={streaming && i === lastIndex}>
              {part.text}
            </AnswerMarkdown>
          ) : null;
        if (isToolUIPart(part)) return <ToolPart key={i} part={part} diff={diff} />;
        return null;
      })}
      {(stopped || meta.stopped) && (
        <p className="text-xs text-muted-foreground">Đã dừng câu trả lời.</p>
      )}
      {!streaming && actions.lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.lines.map((n) => (
            <Button key={n} variant="outline" size="sm" onClick={() => actions.onLine(n)}>
              <Code2 className="size-4" />
              Xem dòng {n}
            </Button>
          ))}
        </div>
      )}
      {!streaming && text && (
        <div className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
          <CopyButton text={text} />
          {actions.vote && (
            <>
              <button
                type="button"
                aria-pressed={meta.vote === "up"}
                aria-label="Trả lời hữu ích"
                title="Trả lời hữu ích"
                onClick={() => actions.vote?.("up")}
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  meta.vote === "up" && "bg-accent text-primary",
                )}
              >
                <ThumbsUp className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={meta.vote === "down"}
                aria-label="Trả lời chưa đúng"
                title="Trả lời chưa đúng"
                onClick={() => actions.vote?.("down")}
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  meta.vote === "down" && "bg-destructive-soft text-destructive",
                )}
              >
                <ThumbsDown className="size-4" />
              </button>
              {meta.vote === "up" && (
                <span className="ml-1">Cảm ơn, Codi sẽ dùng góp ý này để cải thiện Tutor.</span>
              )}
            </>
          )}
          {meta.vote === "down" && !meta.voteReason && (
            <span className="flex flex-wrap items-center gap-1.5 pl-1">
              <span>Chưa tốt ở điểm nào?</span>
              {TUTOR_DOWN_REASONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => actions.reason(value)}
                  className="min-h-8 rounded-full border px-2.5 hover:bg-accent"
                >
                  {value}
                </button>
              ))}
            </span>
          )}
          {meta.voteReason && <span className="pl-1">Đã ghi nhận: {meta.voteReason}</span>}
          {meta.vote === "down" && actions.escalate}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md p-1.5 hover:bg-muted"
      aria-label={copied ? "Đã chép" : "Chép câu trả lời"}
      title={copied ? "Đã chép" : "Chép"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          toast("Hãy chọn và chép nội dung câu trả lời.");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}
