"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  Code2,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
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
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import { highlightCode } from "./code-highlight";
import type { CodingCommand, CodingView } from "@/lib/coding-contract";

export default function LessonCoding({
  endpoint,
  onChanged,
}: {
  endpoint: string;
  onChanged: () => unknown;
}) {
  const id = useId();
  const [data, setData] = useState<CodingView | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "solution" | null>(null);
  const [tab, setTab] = useState<"tests" | "console">("tests");
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");
  const [help, setHelp] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const painted = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const value = useRef("");
  const persisted = useRef("");
  const live = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef(Promise.resolve());
  const tabEscape = useRef(false);
  const executing = useRef(false);

  const send = useCallback(
    (command: CodingCommand) => {
      const snapshot = value.current;
      const job = queue.current.then(async () => {
        const body = JSON.stringify(command);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive:
            command.type === "draft" &&
            new TextEncoder().encode(body).length < 60000,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ?? "Không thể lưu bài làm. Vui lòng thử lại.",
          );
        if (command.type === "draft") {
          persisted.current = result.code;
          return null;
        }
        const next = result as CodingView;
        persisted.current = next.code;
        if (live.current) {
          setData(next);
          if (command.type === "reset" || value.current === snapshot) {
            value.current = next.code;
            setCode(next.code);
          }
        }
        return next;
      });
      queue.current = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
    [endpoint],
  );
  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const next = await response.json();
      if (!response.ok)
        throw new Error(next.error ?? "Không thể tải bài tập code.");
      if (live.current) {
        setData(next);
        setCode(next.code);
        value.current = next.code;
        persisted.current = next.code;
      }
    } catch (e) {
      if (live.current)
        setError(
          e instanceof Error ? e.message : "Không thể tải bài tập code.",
        );
    }
  }, [endpoint]);
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (value.current !== persisted.current)
        void send({ type: "draft", code: value.current }).catch(() => {});
    };
  }, [load, send]);
  function change(next: string) {
    value.current = next;
    setCode(next);
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void send({ type: "draft", code: value.current }).then(
        () => {
          if (live.current) {
            setSaving(false);
            setError(null);
          }
        },
        (e) => {
          if (live.current) {
            setSaving(false);
            setError(e.message);
          }
        },
      );
    }, 650);
  }
  async function execute(type: "run" | "submit" | "reset" | "solution") {
    if (executing.current) return;
    executing.current = true;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    setSaving(false);
    setError(null);
    setConfirm(null);
    try {
      if (type === "run" || type === "submit")
        await send({ type: "draft", code: value.current });
      const next = await send(
        type === "reset" || type === "solution"
          ? { type, confirmed: true }
          : { type, code: value.current },
      );
      if (!next) return;
      if (type === "submit") {
        if (next.passed && !data?.passed)
          toast.success(
            "Bạn đã đạt tất cả test! Giờ có thể hoàn thành bài học.",
          );
        await onChanged();
      }
      if (type === "run" || type === "submit")
        setTab(next.lastRun?.phase === "done" ? "tests" : "console");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sandbox chưa sẵn sàng. Vui lòng thử lại.",
      );
    } finally {
      executing.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function format() {
    if (busy) return;
    const snapshot = value.current;
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
      if (value.current === snapshot && !executing.current) change(formatted);
      setError(null);
    } catch {
      setError("Chưa thể định dạng. Hãy sửa lỗi cú pháp trước.");
    }
  }
  function explain(testId?: number) {
    const test = data?.tests.find((t) => t.id === testId);
    const outcome = data?.lastRun?.outcomes.find((t) => t.id === testId);
    const context = test
      ? `Đầu vào: ${test.input}\nKết quả mong đợi: ${test.expectedOutput}\nKết quả thực tế: ${outcome?.error ?? outcome?.actual}`
      : `Trạng thái: ${data?.lastRun?.phase}\n${data?.lastRun?.outcomes.find((o) => o.error)?.error ?? "Code chạy quá thời gian."}`;
    const prompt = `Hãy giúp tôi hiểu lỗi bằng gợi ý, đừng đưa lời giải đầy đủ.\n${context}\n\nCode hiện tại:\n${value.current}`;
    setHelp(prompt);
    window.dispatchEvent(
      new CustomEvent("codi:tutor-context", {
        detail: { assessmentId: data?.id, prompt },
      }),
    );
  }
  const run = data?.lastRun;
  const phaseLabel =
    run?.phase === "syntax"
      ? "Lỗi cú pháp"
      : run?.phase === "runtime"
        ? "Lỗi khi chạy"
        : run?.phase === "timeout"
          ? "Quá thời gian"
          : run
            ? `Đạt ${run.passed}/${run.total} test${run.mode === "run" ? " mẫu" : ""}`
            : "Chưa chạy";
  if (!data)
    return (
      <Card>
        <CardContent className="py-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error}{" "}
                <Button variant="outline" onClick={load}>
                  Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <p role="status" className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Đang tải bài tập
              code…
            </p>
          )}
        </CardContent>
      </Card>
    );
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="@container/coding min-w-0 space-y-4"
    >
      <header className="space-y-3 border-b pb-5">
        <div className="space-y-2">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Code2 className="size-5 text-primary" />
            {data.title}
          </h2>
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                data.passed
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {data.passed && !busy && (
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
              )}
              {busy
                ? "Đang chạy…"
                : data.passed
                  ? `Đã đạt tất cả test${data.solutionViewed ? " · đã xem lời giải" : ""}`
                  : phaseLabel}
            </span>
            <span className="text-muted-foreground">
              Đã nộp {data.submits} lần
            </span>
            {data.score !== null && (
              <span className="text-muted-foreground">
                Điểm lần nộp gần nhất:{" "}
                <strong className="font-semibold tabular-nums text-foreground">
                  {data.score}
                </strong>
              </span>
            )}
          </div>
        </div>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể thực hiện</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => execute("run")}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!data.available && (
        <Alert>
          <AlertTitle>Sandbox chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            Dịch vụ chạy {data.language} chưa sẵn sàng. Bạn vẫn có thể đọc yêu
            cầu và lưu nháp.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 items-start gap-4 @[42rem]/coding:grid-cols-[minmax(17rem,1fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 space-y-5 rounded-lg border bg-card p-4 @[42rem]/coding:sticky @[42rem]/coding:top-20 @[42rem]/coding:row-span-2">
          <h3 className="font-semibold">Yêu cầu</h3>
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:font-medium marker:text-muted-foreground">
            {(data.instructions ?? "Hoàn thành hàm để đạt tất cả kiểm thử.")
              .split(/\n+/)
              .filter(Boolean)
              .map((step, i) => (
                <li key={i} className="whitespace-pre-wrap break-words">
                  {step.replace(/^\d+[.)]\s*/, "")}
                </li>
              ))}
          </ol>
          <div className="space-y-3 border-t pt-5">
            <h3 className="font-semibold">Bí rồi? Xem gợi ý</h3>
            {data.hints.map((hint, i) => (
              <details
                key={i}
                className="border-b pb-3 text-sm last:border-b-0"
              >
                <summary className="cursor-pointer font-medium">
                  Gợi ý {i + 1}
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{hint}</p>
              </details>
            ))}
            {data.lockedHints > 0 && (
              <p className="text-sm text-muted-foreground">
                Còn {data.lockedHints} gợi ý mở dần sau mỗi lần nộp chưa đạt.
              </p>
            )}
          </div>
          <details className="border-t pt-4 text-sm">
            <summary className="cursor-pointer font-medium">Lời giải</summary>
            <div className="mt-3 space-y-3">
              {data.solution ? (
                <>
                  <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                    {data.solution}
                  </pre>
                  <p>
                    Bạn vẫn cần tự nộp code đạt tất cả test để hoàn thành bài.
                  </p>
                </>
              ) : data.solutionAvailable ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm("solution")}
                >
                  Xem lời giải
                </Button>
              ) : (
                <p className="text-muted-foreground">
                  Lời giải mở khi bạn đạt tất cả test hoặc sau 3 lần nộp chạy
                  xong nhưng chưa đạt.
                </p>
              )}
            </div>
          </details>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-lg bg-code-background text-code-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-code-bar px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono">
                  {data.language === "python" ? "main.py" : "main.js"}
                </span>
                <span role="status" className="text-xs text-code-muted">
                  {saving ? "Đang lưu nháp…" : "Đã lưu nháp"}
                </span>
              </div>
              <div className="flex items-center gap-1 text-code-muted [&_button]:text-code-foreground [&_button:hover]:bg-code-background [&_button:hover]:text-code-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || !data.available}
                  onClick={format}
                  title="Định dạng code (Shift+Alt+F)"
                  aria-label="Định dạng code"
                >
                  <WandSparkles aria-hidden="true" className="size-4" />
                  <span className="hidden @[32rem]/coding:inline">
                    Định dạng code
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirm("reset")}
                  title="Khôi phục code ban đầu"
                  aria-label="Đặt lại"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  <span className="hidden @[32rem]/coding:inline">Đặt lại</span>
                </Button>
              </div>
            </div>
            <div className="flex min-w-0">
              <div
                ref={gutter}
                aria-hidden="true"
                className="max-h-96 w-11 shrink-0 overflow-hidden border-r border-code-bar px-2 py-3 text-right font-mono text-sm leading-6 text-code-muted"
              >
                {Array.from(
                  { length: Math.max(12, code.split("\n").length) },
                  (_, i) => (
                    <div
                      key={i}
                      className={
                        run?.outcomes.some((o) => o.line === i + 1)
                          ? "bg-code-bar font-bold text-code-error"
                          : ""
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
                  {highlightCode(code)}
                  {"\n"}
                </pre>
                <textarea
                  ref={editor}
                  value={code}
                  onChange={(e) => change(e.target.value)}
                  maxLength={65536}
                  disabled={busy}
                  aria-label="Code bài làm"
                  aria-describedby={`${id}-keys`}
                  spellCheck={false}
                  wrap="off"
                  className="relative block min-h-72 w-full min-w-0 resize-y overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-transparent caret-code-foreground outline-none [tab-size:2] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onScroll={(e) => {
                    if (painted.current) {
                      painted.current.scrollTop = e.currentTarget.scrollTop;
                      painted.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                    if (gutter.current)
                      gutter.current.scrollTop = e.currentTarget.scrollTop;
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      if (data.available) void execute("run");
                    } else if (
                      e.shiftKey &&
                      e.altKey &&
                      e.key.toLowerCase() === "f"
                    ) {
                      e.preventDefault();
                      void format();
                    } else if (e.key === "Escape") tabEscape.current = true;
                    else if (
                      e.key === "Tab" &&
                      !e.shiftKey &&
                      !tabEscape.current
                    ) {
                      e.preventDefault();
                      const node = e.currentTarget,
                        start = node.selectionStart,
                        end = node.selectionEnd;
                      change(code.slice(0, start) + "  " + code.slice(end));
                      requestAnimationFrame(() =>
                        node.setSelectionRange(start + 2, start + 2),
                      );
                    } else if (e.key === "Tab") tabEscape.current = false;
                  }}
                />
              </div>
            </div>
            <p
              id={`${id}-keys`}
              className="px-3 pb-3 text-xs leading-relaxed text-code-muted"
            >
              Tab: thụt lề · Ctrl/⌘ + Enter: chạy · Esc rồi Tab: rời trình soạn
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !data.available}
                aria-busy={busy}
                onClick={() => execute("run")}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Chạy <kbd className="rounded border px-1 text-xs">Ctrl/⌘ ↵</kbd>
              </Button>
              <Button
                disabled={busy || !data.available}
                onClick={() => execute("submit")}
              >
                Nộp bài
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.tests.length} test mẫu · Chấm toàn bộ khi nộp
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <p>Chỉ lần nộp gần nhất được tính.</p>
            <details>
              <summary className="cursor-pointer">Phím tắt</summary>
              <p className="pt-2">
                Tab: thụt lề · Esc rồi Tab: rời editor · Shift+Alt+F: định dạng
              </p>
            </details>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border @[42rem]/coding:col-start-2">
          <div
            className="flex flex-wrap gap-1 border-b bg-muted/20 px-3 py-2"
            role="tablist"
            aria-label="Đầu ra"
          >
            {(
              [
                ["tests", "Kết quả kiểm thử"],
                ["console", "Console"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                id={`${id}-${key}`}
                aria-controls={`${id}-output-${key}`}
                role="tab"
                aria-selected={tab === key}
                variant={tab === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-output-${tab}`}
            aria-labelledby={`${id}-${tab}`}
            className="min-w-0 space-y-4 p-4"
            aria-live="polite"
          >
            {busy ? (
              <p className="flex items-center gap-2 py-6 text-sm">
                <LoaderCircle className="size-4 animate-spin" />
                Đang chạy kiểm thử…
              </p>
            ) : tab === "console" ? (
              <>
                <p className="text-sm font-medium">
                  {phaseLabel}
                  {run ? ` · ${run.durationMs} ms` : ""}
                </p>
                {run?.phase === "timeout" && (
                  <p className="text-sm text-warning">
                    Code đã vượt giới hạn 3 giây. Kiểm tra điều kiện dừng của
                    vòng lặp.
                  </p>
                )}
                {run?.outcomes
                  .filter((o) => o.error)
                  .slice(0, 1)
                  .map((o) => (
                    <p
                      key={o.id}
                      className="break-words text-sm text-destructive"
                    >
                      {o.line ? `Dòng ${o.line}: ` : ""}
                      {o.error}
                    </p>
                  ))}
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">
                  {run?.logs.join("\n") || "Chưa có đầu ra console."}
                </pre>
                {run && run.phase !== "done" && (
                  <Button variant="outline" size="sm" onClick={() => explain()}>
                    <Sparkles className="size-4" />
                    Hỏi AI về lỗi này
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {run
                      ? `${run.passed}/${run.total} bài kiểm thử đạt`
                      : "Bấm Chạy để thử với test mẫu, hoặc Nộp bài để chấm toàn bộ."}
                  </p>
                  {run && (
                    <div
                      className="flex flex-wrap gap-1"
                      aria-label="Lọc kiểm thử"
                    >
                      {(
                        [
                          ["all", "Tất cả"],
                          ["pass", "Đạt"],
                          ["fail", "Chưa đạt"],
                        ] as const
                      ).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={filter === key ? "secondary" : "ghost"}
                          size="sm"
                          aria-pressed={filter === key}
                          onClick={() => setFilter(key)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border">
                  {data.tests
                    .filter(
                      (t) =>
                        filter === "all" ||
                        run?.outcomes.some(
                          (o) =>
                            o.id === t.id && o.passed === (filter === "pass"),
                        ),
                    )
                    .map((test) => {
                      const outcome = run?.outcomes.find(
                        (o) => o.id === test.id,
                      );
                      return (
                        <details
                          key={test.id}
                          className="group/test border-b text-sm last:border-b-0"
                        >
                          <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                            {outcome ? (
                              outcome.passed ? (
                                <CheckCircle2 className="size-4 shrink-0 text-success" />
                              ) : (
                                <XCircle className="size-4 shrink-0 text-destructive" />
                              )
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 break-words font-medium">
                              {test.name}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {outcome
                                ? outcome.passed
                                  ? "Đạt"
                                  : "Chưa đạt"
                                : "Chưa chạy"}
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              className="size-4 shrink-0 text-muted-foreground transition-transform group-open/test:rotate-180"
                            />
                          </summary>
                          <dl className="grid min-w-0 gap-3 px-4 pb-4 @[36rem]/coding:grid-cols-3">
                            {[
                              ["Đầu vào", test.input ?? ""],
                              ["Kết quả mong đợi", test.expectedOutput],
                              [
                                "Kết quả thực tế",
                                outcome?.error ??
                                  outcome?.actual ??
                                  "Chưa chạy",
                              ],
                            ].map(([label, text]) => (
                              <div key={label} className="min-w-0">
                                <dt className="mb-1 text-xs text-muted-foreground">
                                  {label}
                                </dt>
                                <dd
                                  className={cn(
                                    "overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs",
                                    outcome &&
                                      !outcome.passed &&
                                      label === "Kết quả thực tế" &&
                                      "border border-destructive text-destructive",
                                  )}
                                >
                                  {text}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {outcome && !outcome.passed && (
                            <>
                              <p className="px-4 text-xs text-destructive">
                                Khác kết quả mong đợi.
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mx-4 mt-3 mb-4"
                                onClick={() => explain(test.id)}
                              >
                                Giải thích lỗi này
                              </Button>
                            </>
                          )}
                        </details>
                      );
                    })}
                </div>
                {run?.mode === "submit" && run.hiddenTotal > 0 ? (
                  <p className="text-sm">
                    Test ẩn: {run.hiddenPassed}/{run.hiddenTotal} đạt
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Test ẩn chỉ chạy khi nộp bài.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {data.passed && !busy && (
        <div className="space-y-3 rounded-lg border border-success/30 bg-success-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" />
            Đã đạt tất cả test!
          </p>
          <p className="text-sm">
            Bạn đã nộp {data.submits} lần. Giờ có thể hoàn thành bài học.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                document
                  .getElementById("checklist")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Tiếp tục
            </Button>
            <Button variant="outline" onClick={() => editor.current?.focus()}>
              Xem lại code
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {confirm === "reset"
              ? "Khôi phục code ban đầu?"
              : "Bạn chắc muốn xem lời giải?"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "reset"
              ? "Code bạn đang viết sẽ được thay bằng code khởi đầu. Kết quả lần nộp gần nhất vẫn được giữ."
              : "Giảng viên sẽ thấy bạn đã xem lời giải trước khi đạt. Điểm năng lực của bài này được giới hạn ở 70%."}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Huỷ
            </Button>
            <Button onClick={() => confirm && execute(confirm)}>
              {confirm === "reset" ? "Khôi phục" : "Xem lời giải"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet
        open={help !== null}
        onOpenChange={(open) => {
          if (!open) setHelp(null);
        }}
        title="Hỏi AI về lỗi này"
        description="Ngữ cảnh lỗi từ test mẫu và code của bạn"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          AI tutor chưa sẵn sàng. Bạn có thể sao chép ngữ cảnh để hỏi khi dịch
          vụ hoạt động trở lại.
        </p>
        <textarea
          readOnly
          value={help ?? ""}
          aria-label="Ngữ cảnh hỏi AI"
          className="min-h-80 w-full rounded-lg border bg-background p-3 font-mono text-xs"
        />
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(help ?? "");
              toast.success("Đã sao chép ngữ cảnh lỗi.");
            } catch {
              toast("Hãy chọn và sao chép nội dung trong ô ngữ cảnh.");
            }
          }}
        >
          Sao chép ngữ cảnh
        </Button>
      </Sheet>
    </section>
  );
}
