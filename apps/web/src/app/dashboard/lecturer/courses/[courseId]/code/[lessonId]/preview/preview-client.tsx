"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  FileCode,
  HelpCircle,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { executeCode, gradeCodeResults } from "@/lib/code-runner";
import type { CodingTestCaseInput } from "../../actions";

interface PreviewClientProps {
  courseId: string;
  lessonId: string;
  data: {
    course: any;
    lesson: any;
    exercise: {
      title: string;
      durationMinutes?: number;
      language: string;
      starterCode: string;
      solutionCode: string;
      instructions: string[];
      hints: string[];
      tests: CodingTestCaseInput[];
    };
  };
}

export function CodingExercisePreviewClient({
  courseId,
  lessonId,
  data,
}: PreviewClientProps) {
  const { course, lesson, exercise } = data;

  const [studentCode, setStudentCode] = useState(exercise.starterCode || "");
  const [isRunning, setIsRunning] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"brief" | "hints">("brief");
  const [activeResultTab, setActiveResultTab] = useState<"tests" | "console">("tests");
  const [lastMode, setLastMode] = useState<"run" | "submit" | null>(null);

  const [runResult, setRunResult] = useState<{
    mode: "run" | "submit";
    passed: number;
    total: number;
    allPass: boolean;
    outcomes: Array<{
      id: string | number;
      name?: string;
      call?: string;
      pass: boolean;
      expected: string;
      actual: string | null;
      error: string | null;
      hidden?: boolean;
    }>;
    logs: Array<{ kind: string; text: string }>;
  } | null>(null);

  // Khôi phục code ban đầu
  const handleResetCode = () => {
    if (confirm("Code bạn đang viết sẽ được thay bằng code khởi đầu?")) {
      setStudentCode(exercise.starterCode || "");
      toast.info("Đã khôi phục mã nguồn ban đầu.");
    }
  };

  // Thực thi code (Chạy hoặc Nộp bài)
  const handleExecute = async (mode: "run" | "submit") => {
    // Nếu là Chạy (run): chỉ chạy các test không ẩn (isSample = true hoặc !hidden)
    // Nếu là Nộp bài (submit): chạy toàn bộ test
    const testsToRun =
      mode === "run"
        ? exercise.tests.filter((t) => t.isSample || !t.hidden)
        : exercise.tests;

    if (testsToRun.length === 0) {
      toast.error("Bài tập chưa có test case nào.");
      return;
    }

    try {
      setIsRunning(true);
      setLastMode(mode);

      const formattedTests = testsToRun.map((t, idx) => ({
        id: t.id || idx + 1,
        name: t.name,
        call: t.call,
        expected: t.expected !== undefined ? t.expected : t.expectedText,
        hidden: t.hidden || !t.isSample,
      }));

      const execRes = await executeCode(studentCode, formattedTests, {
        language: exercise.language,
        solution: exercise.solutionCode,
      });

      const outcomes = gradeCodeResults(formattedTests, execRes);
      const passed = outcomes.filter((o) => o.pass).length;
      const total = outcomes.length;
      const allPass = total > 0 && passed === total && execRes.phase === "done";

      setRunResult({
        mode,
        passed,
        total,
        allPass,
        outcomes,
        logs: execRes.logs,
      });

      if (mode === "submit") {
        if (allPass) {
          toast.success("Chúc mừng! Bạn đã vượt qua tất cả test case!");
        } else {
          toast.error(`Chưa đạt: bạn đã đúng ${passed}/${total} test case.`);
        }
      } else {
        toast.info(`Chạy thử hoàn tất: ${passed}/${total} test mẫu đạt.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi chạy code.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
      {/* ─────────────────────────────────────────────────────────────
          HEADER
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
        <div className="space-y-1">
          <Link
            href={`/dashboard/lecturer/courses/${courseId}/code/${lessonId}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="size-3.5" />
            Quay lại trình soạn thảo bài code
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{exercise.title}</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-primary/10 text-primary border border-primary/20">
              Chế độ xem như học viên
            </span>
          </div>
        </div>

        <Link
          href={`/dashboard/lecturer/courses/${courseId}/code/${lessonId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          Thoát chế độ xem trước
        </Link>
      </div>

      <Alert variant="info" className="py-2.5">
        <AlertDescription className="text-xs">
          Bạn đang trải nghiệm giao diện làm bài thực tế của học viên. Các lượt Chạy thử và Nộp bài tại đây hoàn toàn độc lập và không ghi nhận vào tiến độ của học viên thật.
        </AlertDescription>
      </Alert>

      {/* ─────────────────────────────────────────────────────────────
          3-COLUMN / SPLIT VIEW WORKSPACE
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* CỘT 1 (4/12): ĐỀ BÀI & GỢI Ý */}
        <div className="lg:col-span-4 space-y-3">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveSideTab("brief")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
                      activeSideTab === "brief"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Đề bài
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSideTab("hints")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
                      activeSideTab === "hints"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Gợi ý ({exercise.hints?.length || 0})
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  ~{exercise.durationMinutes || 15} phút
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 max-h-[560px] overflow-y-auto">
              {activeSideTab === "brief" ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Yêu cầu cần hoàn thành</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Đạt tất cả các bước dưới đây để hoàn thành bài tập.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {exercise.instructions.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs"
                      >
                        <span className="size-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 text-foreground leading-relaxed">
                          {step}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Gợi ý cách giải</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mở dần khi bạn cần hướng tư duy.
                    </p>
                  </div>

                  {exercise.hints && exercise.hints.length > 0 ? (
                    <div className="space-y-2">
                      {exercise.hints.map((hint, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-border/80 bg-muted/30 text-xs space-y-1"
                        >
                          <span className="font-semibold text-primary">Gợi ý #{idx + 1}:</span>
                          <p className="text-muted-foreground">{hint}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Bài này chưa có gợi ý.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CỘT 2 (5/12): TRÌNH SOẠN THẢO CODE */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="size-4 text-primary" />
                  <span className="font-mono text-xs font-semibold text-foreground">
                    main.js
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetCode}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                  title="Khôi phục code ban đầu"
                >
                  <RotateCcw className="size-3" />
                  Khôi phục
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-3">
              <div className="rounded-md border border-border/80 bg-background p-2">
                <Textarea
                  rows={18}
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="// Viết code giải bài tập tại đây..."
                  className="font-mono text-xs leading-relaxed border-0 focus-visible:ring-0 p-0 resize-none"
                />
              </div>

              {/* Nút hành động học viên */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">
                  Phím tắt: Ctrl / ⌘ + Enter để chạy
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRunning}
                    onClick={() => handleExecute("run")}
                    className="gap-1.5 text-xs cursor-pointer h-8"
                  >
                    {isRunning && lastMode === "run" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5 text-primary" />
                    )}
                    Chạy thử
                  </Button>

                  <Button
                    size="sm"
                    disabled={isRunning}
                    onClick={() => handleExecute("submit")}
                    className="gap-1.5 text-xs cursor-pointer h-8"
                  >
                    {isRunning && lastMode === "submit" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Nộp bài
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CỘT 3 (3/12): KẾT QUẢ TEST & CONSOLE */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border/60">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveResultTab("tests")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer",
                    activeResultTab === "tests"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Kiểm thử
                </button>
                <button
                  type="button"
                  onClick={() => setActiveResultTab("console")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer",
                    activeResultTab === "console"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Console {runResult?.logs.length ? `(${runResult.logs.length})` : ""}
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-3 max-h-[560px] overflow-y-auto">
              {runResult ? (
                activeResultTab === "tests" ? (
                  <div className="space-y-3">
                    <div
                      className={cn(
                        "p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between",
                        runResult.allPass
                          ? "bg-success/10 border-success/30 text-success"
                          : "bg-destructive/10 border-destructive/30 text-destructive"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {runResult.allPass ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                        {runResult.passed}/{runResult.total} test đạt
                      </span>
                      <span className="text-[10px] uppercase font-bold">
                        {runResult.mode === "submit" ? "Nộp bài" : "Chạy thử"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {runResult.outcomes.map((o, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "p-2 rounded-md border text-xs space-y-1 transition-colors",
                            o.pass
                              ? "bg-success/5 border-success/20"
                              : "bg-destructive/5 border-destructive/20"
                          )}
                        >
                          <div className="flex items-center justify-between font-sans">
                            <span className="font-semibold text-[11px] flex items-center gap-1 truncate">
                              {o.pass ? (
                                <Check className="size-3 text-success stroke-[3]" />
                              ) : (
                                <XCircle className="size-3 text-destructive" />
                              )}
                              {o.name || `Test #${idx + 1}`}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase",
                                o.pass ? "text-success" : "text-destructive"
                              )}
                            >
                              {o.pass ? "Pass" : "Fail"}
                            </span>
                          </div>

                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            <code>{o.call}</code>
                          </div>

                          {!o.pass && (
                            <div className="text-[10px] space-y-0.5 pt-1 border-t border-border/40 font-mono">
                              <div className="text-muted-foreground">Kỳ vọng: {o.expected}</div>
                              <div className="text-destructive font-semibold">
                                Thực tế: {o.actual || o.error || "undefined"}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 font-mono text-xs">
                    {runResult.logs.length > 0 ? (
                      <div className="p-2 rounded-md bg-muted/40 border border-border/80 space-y-1">
                        {runResult.logs.map((log, idx) => (
                          <div key={idx} className="text-foreground text-[11px]">
                            {log.text}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Không có console log.</p>
                    )}
                  </div>
                )
              ) : (
                <div className="p-6 text-center space-y-1.5 text-xs text-muted-foreground">
                  <Terminal className="size-5 mx-auto text-muted-foreground" />
                  <p>Chưa chạy code.</p>
                  <p className="text-[11px]">Bấm &quot;Chạy thử&quot; hoặc &quot;Nộp bài&quot; để xem kết quả đánh giá.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
