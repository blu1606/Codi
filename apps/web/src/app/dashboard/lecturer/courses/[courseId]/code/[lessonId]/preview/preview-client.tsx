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
  Lock,
  Play,
  RotateCcw,
  Send,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { runPreviewCode, type CodingTestCaseInput } from "../../actions";

interface PreviewClientProps {
  courseId: string;
  lessonId: string;
  data: {
    course: { id: string; title: string };
    lesson: { id: string; title: string };
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

  const [runResult, setRunResult] = useState<{
    mode: "run" | "submit";
    phase: string;
    sampleOutcomes: Array<{
      id: number;
      name: string;
      call: string;
      pass: boolean;
      expected: string;
      actual: string | null;
      error: string | null;
    }>;
    hiddenPassed: number;
    hiddenTotal: number;
    totalPassed: number;
    totalTests: number;
    allPass: boolean;
    logs: string[];
  } | null>(null);

  // Khôi phục code ban đầu
  const handleResetCode = () => {
    if (confirm("Code bạn đang viết sẽ được thay bằng code khởi đầu?")) {
      setStudentCode(exercise.starterCode || "");
      toast.info("Đã khôi phục mã nguồn ban đầu.");
    }
  };

  // Thực thi code trong QuickJS WASM sandbox server-side (Chạy hoặc Nộp bài)
  const handleExecute = async (mode: "run" | "submit") => {
    try {
      setIsRunning(true);

      const res = await runPreviewCode(courseId, lessonId, {
        code: studentCode,
        mode,
      });

      setRunResult(res);

      if (mode === "submit") {
        if (res.allPass) {
          toast.success("Chúc mừng! Bạn đã vượt qua tất cả test case!");
        } else {
          toast.error(`Chưa đạt: bạn đã đúng ${res.totalPassed}/${res.totalTests} test case.`);
        }
      } else {
        toast.info(`Chạy thử hoàn tất: ${res.sampleOutcomes.filter((s) => s.pass).length}/${res.sampleOutcomes.length} test mẫu đạt.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi chạy code xem trước.";
      toast.error(msg);
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
            <h1 className="text-xl font-bold tracking-tight">Xem trước trải nghiệm học viên</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-accent text-accent-foreground border border-border">
              Chế độ mô phỏng học viên
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Khoá học: <span className="text-foreground font-medium">{course.title}</span> • Bài học:{" "}
            <span className="text-foreground font-medium">{lesson.title}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetCode}
            disabled={isRunning}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            Khôi phục code ban đầu
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExecute("run")}
            disabled={isRunning}
            className="text-xs gap-1.5 cursor-pointer"
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Chạy thử (Sample tests)
          </Button>

          <Button
            size="sm"
            onClick={() => handleExecute("submit")}
            disabled={isRunning}
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Nộp bài (Tất cả tests)
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          KHÔNG GIAN LÀM VIỆC CHÍNH (SPLIT VIEW)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[640px]">
        {/* CỘT TRÁI: ĐỀ BÀI VÀ GỢI Ý (5/12 CỘT) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex border-b border-border bg-muted/30 rounded-t-lg p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveSideTab("brief")}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                activeSideTab === "brief"
                  ? "bg-background text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileCode className="size-3.5" />
              Đề bài & Yêu cầu
            </button>
            <button
              type="button"
              onClick={() => setActiveSideTab("hints")}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                activeSideTab === "hints"
                  ? "bg-background text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <HelpCircle className="size-3.5 text-primary" />
              Gợi ý ({exercise.hints?.length || 0})
            </button>
          </div>

          <Card className="flex-1 shadow-xs border-border flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/10">
              <CardTitle className="text-sm font-semibold">{exercise.title || lesson.title}</CardTitle>
              <CardDescription className="text-xs">
                Ngôn ngữ: <span className="font-mono text-foreground font-semibold">JavaScript (QuickJS Sandbox)</span> • Thời lượng:{" "}
                {exercise.durationMinutes || 15} phút
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 flex-1 overflow-y-auto space-y-4 text-xs leading-relaxed">
              {activeSideTab === "brief" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
                      Các bước thực hiện
                    </h4>
                    <ol className="list-decimal list-inside space-y-2 text-foreground">
                      {exercise.instructions.map((step, idx) => (
                        <li key={idx} className="pl-1 leading-normal">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
                      Ví dụ mẫu
                    </h4>
                    {exercise.tests
                      .filter((t) => t.isSample || !t.hidden)
                      .slice(0, 2)
                      .map((t, idx) => (
                        <div key={idx} className="p-2.5 rounded-md bg-muted/40 border border-border/80 font-mono text-xs space-y-1">
                          <div className="text-muted-foreground">
                            Đầu vào: <span className="text-foreground">{t.call}</span>
                          </div>
                          <div className="text-muted-foreground">
                            Kỳ vọng: <span className="text-primary font-bold">{t.expectedText || JSON.stringify(t.expected)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {exercise.hints && exercise.hints.length > 0 ? (
                    exercise.hints.map((h, idx) => (
                      <Alert key={idx} className="bg-primary/5 border-primary/20">
                        <HelpCircle className="size-4 text-primary" />
                        <AlertTitle className="text-xs font-semibold text-primary">Gợi ý #{idx + 1}</AlertTitle>
                        <AlertDescription className="text-xs text-foreground mt-1">{h}</AlertDescription>
                      </Alert>
                    ))
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-xs">
                      Bài tập này chưa có gợi ý đính kèm.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CỘT PHẢI: TRÌNH SOẠN THẢO CODE VÀ KẾT QUẢ TEST (7/12 CỘT) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {/* TRÌNH SOẠN THẢO MÃ NGUỒN */}
          <Card className="shadow-xs border-border flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border text-xs font-mono">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Code2 className="size-3.5 text-primary" />
                solution.js
              </span>
              <span className="text-muted-foreground text-[11px]">JavaScript ES2023 (QuickJS Sandbox)</span>
            </div>

            <CardContent className="p-0 flex-1 flex flex-col min-h-[300px]">
              <Textarea
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="// Viết mã nguồn của bạn ở đây..."
                disabled={isRunning}
                className="w-full flex-1 p-4 font-mono text-xs border-0 rounded-none focus-visible:ring-0 resize-none bg-background text-foreground leading-relaxed"
                rows={14}
                spellCheck={false}
              />
            </CardContent>
          </Card>

          {/* KẾT QUẢ KIỂM THỬ VÀ CONSOLE */}
          <Card className="shadow-xs border-border flex flex-col h-[280px] overflow-hidden">
            <div className="flex items-center justify-between px-3 border-b border-border bg-muted/20">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveResultTab("tests")}
                  className={cn(
                    "py-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer",
                    activeResultTab === "tests"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ListChecks className="size-3.5" />
                  Kết quả kiểm thử
                  {runResult && (
                    <span
                      className={cn(
                        "ml-1 px-1.5 py-0.2 rounded-full text-[10px]",
                        runResult.allPass
                          ? "bg-success/20 text-success"
                          : "bg-destructive/20 text-destructive"
                      )}
                    >
                      {runResult.totalPassed}/{runResult.totalTests}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveResultTab("console")}
                  className={cn(
                    "py-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer",
                    activeResultTab === "console"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Terminal className="size-3.5" />
                  Console Log
                  {runResult && runResult.logs.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
                      {runResult.logs.length}
                    </span>
                  )}
                </button>
              </div>

              {runResult && (
                <span
                  className={cn(
                    "text-xs font-bold uppercase",
                    runResult.allPass ? "text-success" : "text-destructive"
                  )}
                >
                  {runResult.allPass ? "100% ĐẠT" : "CHƯA ĐẠT"}
                </span>
              )}
            </div>

            <CardContent className="p-3 flex-1 overflow-y-auto text-xs font-mono">
              {activeResultTab === "tests" ? (
                <div>
                  {!runResult ? (
                    <div className="py-12 text-center text-muted-foreground font-sans text-xs">
                      Bấm <strong>&quot;Chạy thử&quot;</strong> để kiểm tra test mẫu hoặc <strong>&quot;Nộp bài&quot;</strong> để kiểm tra toàn bộ.
                    </div>
                  ) : (
                    <div className="space-y-2 font-sans">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-border">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          {runResult.allPass ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : (
                            <AlertCircle className="size-4 text-destructive" />
                          )}
                          Tổng kết: {runResult.totalPassed}/{runResult.totalTests} test đạt
                        </span>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">
                          {runResult.mode === "submit" ? "Chế độ Nộp bài" : "Chế độ Chạy thử"}
                        </span>
                      </div>

                      {/* Danh sách Sample Tests chi tiết */}
                      <div className="space-y-2">
                        {runResult.sampleOutcomes.map((o, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-2.5 rounded-md border text-xs space-y-1 transition-colors",
                              o.pass
                                ? "bg-success/5 border-success/20"
                                : "bg-destructive/5 border-destructive/20"
                            )}
                          >
                            <div className="flex items-center justify-between font-sans">
                              <span className="font-semibold text-xs flex items-center gap-1 truncate">
                                {o.pass ? (
                                  <Check className="size-3.5 text-success stroke-[3]" />
                                ) : (
                                  <XCircle className="size-3.5 text-destructive" />
                                )}
                                {o.name || `Test mẫu #${idx + 1}`}
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

                            <div className="text-[11px] font-mono text-muted-foreground truncate">
                              <code>{o.call}</code>
                            </div>

                            {!o.pass && (
                              <div className="text-[11px] space-y-0.5 pt-1 border-t border-border/40 font-mono">
                                <div className="text-muted-foreground">Kỳ vọng: {o.expected}</div>
                                <div className="text-destructive font-semibold">
                                  Thực tế: {o.actual || o.error || "undefined"}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Thẻ hiển thị tổng hợp cho Test Case ẩn (Parity với học viên #128) */}
                        {runResult.mode === "submit" && runResult.hiddenTotal > 0 && (
                          <div className="p-3 rounded-md border border-border bg-muted/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <Lock className="size-4 text-muted-foreground" />
                              <div>
                                <span className="font-semibold text-foreground">
                                  Bộ test case ẩn ({runResult.hiddenPassed}/{runResult.hiddenTotal} đạt)
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                  Chi tiết test case ẩn được bảo mật đúng như trải nghiệm thực tế của học viên.
                                </p>
                              </div>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                                runResult.hiddenPassed === runResult.hiddenTotal
                                  ? "bg-success/15 text-success"
                                  : "bg-warning/15 text-warning"
                              )}
                            >
                              {runResult.hiddenPassed === runResult.hiddenTotal ? "Đạt hết" : "Chưa đạt"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {!runResult || runResult.logs.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground font-sans text-xs">
                      Không có đầu ra console log.
                    </div>
                  ) : (
                    runResult.logs.map((log, idx) => (
                      <div key={idx} className="text-muted-foreground text-xs font-mono py-0.5">
                        <span className="text-primary mr-2">&gt;</span>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
