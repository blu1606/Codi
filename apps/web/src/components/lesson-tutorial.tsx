"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  FileCode2,
  List,
  LoaderCircle,
  Play,
  RotateCcw,
  Terminal,
  WandSparkles,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { cn } from "@codi-1/ui/lib/utils";
import { toast } from "sonner";
import LessonMarkdown from "./lesson-markdown";
import { readLessonResponse } from "@/lib/lesson-player-http";
import type { TutorialCommand, TutorialView } from "@/lib/tutorial-contract";

function highlight(code: string) {
  return code
    .split(
      /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|throw|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g,
    )
    .map((part, i) => (
      <span
        key={i}
        className={
          part.startsWith("//") || part.startsWith("/*")
            ? "italic text-code-muted"
            : /^["'`]/.test(part)
              ? "text-code-string"
              : /^\d/.test(part)
                ? "text-code-number"
                : /^(const|let|var|function|return|if|else|for|while|throw|new|true|false|null|undefined)$/.test(
                      part,
                    )
                  ? "text-code-keyword"
                  : undefined
        }
      >
        {part}
      </span>
    ));
}

export default function LessonTutorial({
  endpoint,
  onChanged,
}: {
  endpoint: string;
  onChanged: () => unknown;
}) {
  const id = useId();
  const [data, setData] = useState<TutorialView | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toc, setToc] = useState(false);
  const [reset, setReset] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const painted = useRef<HTMLPreElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const current = useRef<TutorialView | null>(null);
  const value = useRef("");
  const persisted = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(false);
  const working = useRef(false);
  const escapeTab = useRef(false);
  const queue = useRef(Promise.resolve());
  const retry = useRef<(() => void) | null>(null);

  function apply(next: TutorialView) {
    current.current = next;
    value.current = next.code;
    persisted.current = next.code;
    setData(next);
    setCode(next.code);
    setSaving(false);
  }
  const load = useCallback(async () => {
    try {
      const next = await readLessonResponse<TutorialView>(
        await fetch(endpoint, { cache: "no-store" }),
        "Không thể tải hướng dẫn code.",
      );
      if (live.current) {
        apply(next);
        setError(null);
      }
    } catch (e) {
      if (live.current)
        setError(
          e instanceof Error ? e.message : "Không thể tải hướng dẫn code.",
        );
    }
  }, [endpoint]);
  const send = useCallback(
    (command: TutorialCommand) => {
      const job = queue.current.then(async () => {
        const body = JSON.stringify(command);
        return readLessonResponse<TutorialView | { saved: true; code: string }>(
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive:
              command.type === "draft" &&
              new TextEncoder().encode(body).length < 60000,
          }),
          "Không thể lưu hướng dẫn. Vui lòng thử lại.",
        );
      });
      queue.current = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
    [endpoint],
  );
  const saveDraft = useCallback(
    async (step: number, snapshot: string) => {
      await send({ type: "draft", step, code: snapshot });
      if (live.current && current.current?.current === step) {
        persisted.current = snapshot;
        if (value.current === snapshot) setSaving(false);
      }
    },
    [send],
  );
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (
        current.current &&
        !current.current.gated &&
        value.current !== persisted.current
      )
        void saveDraft(current.current.current, value.current).catch(() => {});
    };
  }, [load, saveDraft]);
  function change(next: string) {
    value.current = next;
    setCode(next);
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    const step = current.current!.current;
    const save = () =>
      void saveDraft(step, value.current).then(
        () => {
          if (live.current) setError(null);
        },
        (e) => {
          if (live.current) {
            setError(e.message);
            retry.current = save;
          }
        },
      );
    timer.current = setTimeout(save, 650);
  }
  async function perform(command: Exclude<TutorialCommand, { type: "draft" }>) {
    if (working.current || !current.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setReset(false);
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!current.current.gated && value.current !== persisted.current)
        await saveDraft(current.current.current, value.current);
      const wasDone = current.current.done;
      const next = (await send(command)) as TutorialView;
      if (!live.current) return;
      apply(next);
      if (command.type === "step") {
        setToc(false);
        requestAnimationFrame(() => title.current?.focus());
        if (next.done && !wasDone)
          toast.success("Bạn đã đi hết hướng dẫn. Có thể hoàn thành bài học.");
        await onChanged();
      }
    } catch (e) {
      if (live.current) {
        setError(e instanceof Error ? e.message : "Không thể thực hiện.");
        retry.current = () => void perform(command);
      }
    } finally {
      working.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function format() {
    if (working.current) return;
    const snapshot = value.current;
    const step = current.current?.current;
    try {
      const [prettier, babel, estree] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);
      const formatted = await prettier.format(snapshot, {
        parser: "babel",
        plugins: [babel.default, estree.default],
        tabWidth: 2,
      });
      if (
        live.current &&
        !working.current &&
        step === current.current?.current &&
        snapshot === value.current
      )
        change(formatted);
    } catch {
      setError("Chưa thể định dạng. Hãy sửa lỗi cú pháp trước.");
      retry.current = () => void format();
    }
  }
  const failure = error && (
    <Alert variant="destructive">
      <AlertTitle>Chưa thể thực hiện</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button
        className="mt-3"
        variant="outline"
        disabled={busy}
        onClick={() => (data ? retry.current?.() : void load())}
      >
        Thử lại
      </Button>
    </Alert>
  );
  if (!data)
    return (
      <Card>
        <CardContent className="py-6">
          {failure ?? (
            <p
              role="status"
              className="flex items-center gap-2 text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              Đang tải hướng dẫn code…
            </p>
          )}
        </CardContent>
      </Card>
    );
  const run = data.lastRun;
  const runCode = () =>
    void perform({ type: "run", step: data.current, code: value.current });
  return (
    <section
      aria-label="Hướng dẫn code"
      className="@container/tutorial min-w-0 space-y-4"
    >
      {failure}
      <div className="grid min-w-0 items-start gap-4 @[42rem]/tutorial:grid-cols-[minmax(17rem,1fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0 shadow-none">
          <CardContent className="space-y-5 p-4 @[48rem]/tutorial:p-5">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                disabled={busy}
                aria-expanded={toc}
                aria-controls={`${id}-toc`}
                onClick={() => setToc(!toc)}
              >
                <List className="size-4" />
                Mục lục
              </Button>
              <span
                role="status"
                className="whitespace-nowrap text-sm text-muted-foreground"
              >
                Bước {data.current + 1}/{data.steps.length}
              </span>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {data.steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 min-w-0 flex-1 rounded-full",
                    i === data.current
                      ? "bg-accent-border"
                      : data.visited.includes(i)
                        ? "bg-primary"
                        : "bg-muted",
                  )}
                />
              ))}
            </div>
            {toc ? (
              <ol
                id={`${id}-toc`}
                aria-label="Các bước hướng dẫn"
                className="space-y-1"
              >
                {data.steps.map((step, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-current={i === data.current ? "step" : undefined}
                      disabled={busy}
                      className={cn(
                        "flex min-h-11 w-full items-start gap-3 rounded-lg p-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        i === data.current &&
                          "bg-accent font-medium text-accent-foreground",
                      )}
                      onClick={() => void perform({ type: "step", step: i })}
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-muted-foreground">
                        {data.visited.includes(i) ? (
                          <>
                            <CheckCircle2 className="size-4 text-success" />
                            <span className="sr-only">Đã xem: </span>
                          </>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {step.title}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <article className="space-y-3">
                <h2
                  ref={title}
                  tabIndex={-1}
                  className="font-display text-2xl font-semibold outline-none"
                >
                  {data.title}
                </h2>
                {data.gated ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTitle>Bạn chắc muốn xem lời giải?</AlertTitle>
                      <AlertDescription>
                        Hãy thử tự làm các bước thực hành trước — tự tìm ra cách
                        sửa giúp bạn nhớ lâu hơn.
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform({
                          type: "solution",
                          step: data.current,
                          confirmed: true,
                        })
                      }
                    >
                      Hiện lời giải
                    </Button>
                  </div>
                ) : (
                  <LessonMarkdown>{data.body ?? ""}</LessonMarkdown>
                )}
              </article>
            )}
            <div className="flex flex-col items-start gap-3 border-t pt-4">
              <Button
                variant="ghost"
                className="-ml-2"
                disabled={busy || data.current === 0}
                onClick={() =>
                  void perform({ type: "step", step: data.current - 1 })
                }
              >
                <ArrowLeft className="size-4" />
                Bước trước
              </Button>
              {data.current < data.steps.length - 1 ? (
                <Button
                  className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-left"
                  disabled={busy}
                  onClick={() =>
                    void perform({ type: "step", step: data.current + 1 })
                  }
                >
                  Tiếp: {data.steps[data.current + 1]!.title}
                  <ArrowRight className="size-4 shrink-0" />
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" />
                  Đã đi hết hướng dẫn
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {data.gated ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg bg-code-background p-6 text-center text-code-muted">
              <EyeOff className="size-8" />
              <p>Code lời giải đang được ẩn.</p>
              <p className="text-sm">
                Chọn “Hiện lời giải” khi bạn đã sẵn sàng.
              </p>
            </div>
          ) : (
            <>
              {!data.available && (
                <Alert>
                  <AlertTitle>Sandbox chưa sẵn sàng</AlertTitle>
                  <AlertDescription>
                    Bạn vẫn có thể đọc hướng dẫn và lưu nháp.
                  </AlertDescription>
                </Alert>
              )}
              <div className="overflow-hidden rounded-lg bg-code-background text-code-foreground">
                <div className="flex items-center justify-between gap-3 bg-code-bar px-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-mono">
                    <FileCode2 className="size-4 shrink-0 text-code-muted" />
                    <span className="truncate">{data.fileName}</span>
                  </span>
                  <span className="text-xs text-code-muted">
                    {data.language === "javascript"
                      ? "JavaScript"
                      : data.language === "python"
                        ? "Python"
                        : data.language}
                  </span>
                </div>
                <div className="flex min-w-0">
                  <div
                    ref={gutter}
                    aria-hidden="true"
                    className="max-h-96 w-11 shrink-0 overflow-hidden border-r border-code-bar py-3 pr-2 text-right font-mono text-sm leading-6 text-code-muted"
                  >
                    {Array.from(
                      { length: Math.max(12, code.split("\n").length) },
                      (_, i) => (
                        <div
                          key={i}
                          className={
                            run?.line === i + 1
                              ? "bg-code-bar text-code-error"
                              : undefined
                          }
                        >
                          {i + 1}
                        </div>
                      ),
                    )}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <pre
                      ref={painted}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-sm leading-6 [tab-size:2]"
                    >
                      {highlight(code)}
                      {"\n"}
                    </pre>
                    <textarea
                      ref={editor}
                      aria-label="Code hướng dẫn"
                      aria-describedby={`${id}-keys`}
                      value={code}
                      maxLength={65536}
                      disabled={busy}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      wrap="off"
                      className="relative block min-h-72 w-full min-w-0 resize-y overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-transparent caret-code-foreground outline-none [tab-size:2] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onChange={(e) => change(e.target.value)}
                      onScroll={(e) => {
                        if (painted.current) {
                          painted.current.scrollTop = e.currentTarget.scrollTop;
                          painted.current.scrollLeft =
                            e.currentTarget.scrollLeft;
                        }
                        if (gutter.current)
                          gutter.current.scrollTop = e.currentTarget.scrollTop;
                      }}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          if (data.available && !working.current) runCode();
                        } else if (
                          e.shiftKey &&
                          e.altKey &&
                          e.key.toLowerCase() === "f"
                        ) {
                          e.preventDefault();
                          void format();
                        } else if (e.key === "Escape") escapeTab.current = true;
                        else if (
                          e.key === "Tab" &&
                          !e.shiftKey &&
                          !escapeTab.current
                        ) {
                          e.preventDefault();
                          const node = e.currentTarget,
                            start = node.selectionStart;
                          change(
                            code.slice(0, start) +
                              "  " +
                              code.slice(node.selectionEnd),
                          );
                          requestAnimationFrame(() =>
                            node.setSelectionRange(start + 2, start + 2),
                          );
                        } else if (e.key === "Tab") escapeTab.current = false;
                      }}
                    />
                  </div>
                </div>
                <p
                  id={`${id}-keys`}
                  className="px-3 pb-3 text-xs leading-relaxed text-code-muted"
                >
                  Tab: thụt lề · Ctrl/⌘ + Enter: chạy · Esc rồi Tab: rời trình
                  soạn
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busy || !data.available} onClick={runCode}>
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Chạy
                  <kbd className="ml-1 rounded border border-current/20 px-1 text-xs opacity-75">
                    Ctrl/⌘ ↵
                  </kbd>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || !data.available}
                  onClick={format}
                  aria-label="Định dạng code"
                  title="Định dạng code (Shift+Alt+F)"
                >
                  <WandSparkles className="size-4" />
                  Định dạng
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setReset(true)}
                  aria-label="Khôi phục code ban đầu"
                >
                  <RotateCcw className="size-4" />
                  Đặt lại
                </Button>
                <span role="status" className="text-xs text-muted-foreground">
                  {saving ? "Chưa lưu nháp" : "Đã lưu nháp"}
                </span>
              </div>
              <section
                aria-label="Console"
                className="overflow-hidden rounded-lg bg-code-background text-code-foreground"
              >
                <h3 className="flex items-center gap-2 bg-code-bar px-3 py-2.5 text-sm font-medium">
                  <Terminal className="size-4 text-code-muted" />
                  Console
                </h3>
                <div
                  role="log"
                  aria-live="polite"
                  aria-busy={busy}
                  className="max-h-72 space-y-2 overflow-auto p-4 font-mono text-sm"
                >
                  {busy ? (
                    <p className="text-code-muted">Đang chạy…</p>
                  ) : run ? (
                    <>
                      {run.logs.map((line, i) => (
                        <pre
                          key={i}
                          className="whitespace-pre-wrap break-words"
                        >
                          {line}
                        </pre>
                      ))}
                      {run.error && (
                        <p className="whitespace-pre-wrap break-words text-code-error">
                          {run.phase === "timeout"
                            ? "Quá thời gian"
                            : run.phase === "syntax"
                              ? "Lỗi cú pháp"
                              : "Lỗi khi chạy"}
                          {run.line ? ` · Dòng ${run.line}` : ""}: {run.error}
                        </p>
                      )}
                      {run.phase === "done" && !run.logs.length && (
                        <p className="text-code-muted">
                          Code đã chạy xong, không có nội dung in ra Console.
                        </p>
                      )}
                      {run.outcomes.map((o, i) => (
                        <div
                          key={i}
                          className="space-y-1 border-t border-code-bar pt-2"
                        >
                          <p
                            className={
                              o.passed ? "text-code-string" : "text-code-error"
                            }
                          >
                            {o.passed ? "✓ Đạt" : "✕ Chưa đạt"} · {o.name}
                          </p>
                          {!o.passed && (
                            <p className="break-words text-code-muted">
                              Mong đợi: {o.expected} · Nhận được:{" "}
                              {o.actual ?? "Không có kết quả"}
                            </p>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="font-sans text-code-muted">
                      Bấm <strong className="text-code-foreground">Chạy</strong>{" "}
                      để xem kết quả ở đây.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <Dialog open={reset} onOpenChange={setReset}>
        <DialogContent>
          <DialogTitle>Khôi phục code ban đầu?</DialogTitle>
          <DialogDescription>
            Code bạn đang viết ở bước này sẽ được thay bằng code khởi đầu. Các
            bước khác vẫn được giữ.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReset(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() =>
                void perform({
                  type: "reset",
                  step: data.current,
                  confirmed: true,
                })
              }
            >
              Khôi phục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
