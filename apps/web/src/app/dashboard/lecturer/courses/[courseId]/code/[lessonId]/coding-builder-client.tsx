"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  Eye,
  FileCode,
  HelpCircle,
  ListOrdered,
  Loader2,
  Play,
  Plus,
  Save,
  Sparkles,
  Terminal,
  Trash2,
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
import { Checkbox } from "@codi-1/ui/components/checkbox";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  type CodingTestCaseInput,
  generateAiCodingTestCases,
  saveCodingExercise,
  verifySolutionCode,
} from "../actions";

interface CodingBuilderClientProps {
  courseId: string;
  lessonId: string;
  initialData: {
    course: any;
    lesson: any;
    isLocked: boolean;
    exercise: {
      id?: number;
      assessmentId?: number;
      title: string;
      durationMinutes?: number;
      language: string;
      starterCode: string;
      solutionCode: string;
      solutionVerifiedAt?: Date | null;
      instructions: string[];
      hints: string[];
      tests: CodingTestCaseInput[];
    };
  };
}

export function CodingBuilderClient({
  courseId,
  lessonId,
  initialData,
}: CodingBuilderClientProps) {
  const router = useRouter();
  const { course, lesson, isLocked, exercise } = initialData;

  // Tabs: brief | starter | solution | tests | hints
  const [activeTab, setActiveTab] = useState<"brief" | "starter" | "solution" | "tests" | "hints">("brief");

  // State các trường của bài tập
  const [title, setTitle] = useState(exercise.title || lesson.title);
  const [durationMinutes, setDurationMinutes] = useState(exercise.durationMinutes || 15);
  const [language, setLanguage] = useState(exercise.language || "javascript");
  const [fileName, setFileName] = useState("main.js");
  const [instructions, setInstructions] = useState<string[]>(
    exercise.instructions.length > 0 ? exercise.instructions : ["Viết hàm hoàn thành yêu cầu đề bài."]
  );
  const [starterCode, setStarterCode] = useState(exercise.starterCode || "");
  const [solutionCode, setSolutionCode] = useState(exercise.solutionCode || "");
  const [hints, setHints] = useState<string[]>(
    exercise.hints.length > 0 ? exercise.hints : ["Đọc kỹ yêu cầu và các trường hợp biên."]
  );
  const [tests, setTests] = useState<CodingTestCaseInput[]>(
    exercise.tests.length > 0
      ? exercise.tests
      : [
          {
            id: "draft-default",
            name: "Kiểm tra cơ bản",
            call: "tinhToan(1)",
            expected: 1,
            expectedText: "1",
            isSample: true,
            hidden: false,
          },
        ]
  );

  const [isDirty, setIsDirty] = useState(false);
  const draftRevision = useRef(0);
  const saveInFlight = useRef(false);
  const markDirty = () => {
    draftRevision.current += 1;
    setIsDirty(true);
  };
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Kết quả verify lời giải mẫu
  const [verificationResult, setVerificationResult] = useState<{
    ok: boolean;
    total: number;
    passed: number;
    phase: string;
    error: string | null;
    logs: Array<{ kind: string; text: string }>;
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
  } | null>(null);

  // Thêm / xoá bước yêu cầu
  const handleAddInstruction = () => {
    if (isLocked) return;
    setInstructions((prev) => [...prev, ""]);
    markDirty();
  };

  const handleUpdateInstruction = (index: number, val: string) => {
    setInstructions((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
    markDirty();
  };

  const handleDeleteInstruction = (index: number) => {
    if (isLocked) return;
    if (instructions.length <= 1) {
      toast.error("Bài tập cần ít nhất một bước yêu cầu.");
      return;
    }
    setInstructions((prev) => prev.filter((_, idx) => idx !== index));
    markDirty();
  };

  // Thêm / xoá gợi ý
  const handleAddHint = () => {
    if (isLocked) return;
    setHints((prev) => [...prev, ""]);
    markDirty();
  };

  const handleUpdateHint = (index: number, val: string) => {
    setHints((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
    markDirty();
  };

  const handleDeleteHint = (index: number) => {
    if (isLocked) return;
    setHints((prev) => prev.filter((_, idx) => idx !== index));
    markDirty();
  };

  // Thêm / xoá / sửa test case
  const handleAddTest = () => {
    if (isLocked) return;
    const draftId = `draft-${crypto.randomUUID()}`;
    setTests((prev) => [
      ...prev,
      {
        id: draftId,
        name: `Kiểm tra ${prev.length + 1}`,
        call: "",
        expected: "",
        expectedText: "",
        isSample: true,
        hidden: false,
      },
    ]);
    markDirty();
  };

  const handleUpdateTest = (index: number, field: keyof CodingTestCaseInput, val: any) => {
    setTests((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: val };
      if (field === "expectedText") {
        try {
          updated.expected = JSON.parse(val);
        } catch {
          updated.expected = val;
        }
      }
      copy[index] = updated;
      return copy;
    });
    markDirty();
  };

  const handleDeleteTest = (index: number) => {
    if (isLocked) return;
    if (tests.length <= 1) {
      toast.error("Bài tập cần ít nhất một test case.");
      return;
    }
    setTests((prev) => prev.filter((_, idx) => idx !== index));
    markDirty();
  };

  // Chạy thử nghiệm với lời giải mẫu
  const handleVerifySolution = async () => {
    if (!solutionCode.trim()) {
      toast.error("Vui lòng nhập lời giải mẫu trước khi chạy thử.");
      setActiveTab("solution");
      return;
    }

    if (tests.length === 0) {
      toast.error("Cần có ít nhất một test case để chạy thử.");
      setActiveTab("tests");
      return;
    }

    try {
      setIsVerifying(true);
      const res = await verifySolutionCode(courseId, lessonId, {
        solutionCode,
        language,
        tests,
      });

      setVerificationResult(res);

      if (res.ok) {
        toast.success(`Tuyệt vời! Lời giải mẫu đã vượt qua ${res.passed}/${res.total} test case.`);
      } else {
        toast.error(`Lời giải mẫu chưa đạt (${res.passed}/${res.total} test). Hãy xem chi tiết lỗi bên dưới.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi chạy thử lời giải mẫu.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Sinh test case biên bằng AI
  const handleGenerateAiTests = async () => {
    if (isLocked) return;
    if (!solutionCode.trim()) {
      toast.error("Vui lòng nhập lời giải mẫu trước để AI có thể phân tích và sinh test biên.");
      setActiveTab("solution");
      return;
    }

    try {
      setIsGeneratingAi(true);
      const res = await generateAiCodingTestCases(courseId, lessonId, {
        solutionCode,
        instructions,
        existingTests: tests,
      });

      if (res.success && res.tests.length > 0) {
        setTests((prev) => [...prev, ...res.tests]);
        markDirty();
        toast.success(`Đã gợi ý thành công ${res.tests.length} test case biên mới!`);
        setActiveTab("tests");
      } else {
        toast.info("Không tìm thêm được trường hợp biên mới cho bài này.");
      }
    } catch (err: any) {
      toast.error(err.message || "Không thể sinh test case biên bằng AI lúc này.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Lưu bài tập coding
  const handleSaveExercise = async () => {
    if (isLocked || saveInFlight.current) return;

    // Client-side validations
    if (!title.trim()) {
      toast.error("Tên bài tập không được để trống.");
      setActiveTab("brief");
      return;
    }

    const validInst = instructions.filter((s) => s.trim());
    if (validInst.length === 0) {
      toast.error("Cần ít nhất một bước yêu cầu đề bài.");
      setActiveTab("brief");
      return;
    }

    if (!solutionCode.trim()) {
      toast.error("Lời giải mẫu không được để trống.");
      setActiveTab("solution");
      return;
    }

    if (tests.length === 0) {
      toast.error("Cần ít nhất một test case.");
      setActiveTab("tests");
      return;
    }

    // Nếu chưa từng verify hoặc lời giải đã bị sửa đổi
    const submittedTests = tests;
    const submittedRevision = draftRevision.current;
    try {
      saveInFlight.current = true;
      setIsSaving(true);
      const saved = await saveCodingExercise(courseId, lessonId, {
        title,
        durationMinutes,
        fileName,
        language,
        instructions: validInst,
        starterCode,
        solutionCode,
        hints: hints.filter((h) => h.trim()),
        tests,
      });

      // Reconcile only identity; edits, additions and removals made during save survive.
      setTests((current) => current.map((test) => {
        const index = submittedTests.findIndex((submitted) =>
          submitted.id === undefined ? submitted === test : submitted.id === test.id
        );
        return index < 0 ? test : { ...test, id: saved.testIds[index] };
      }));
      setIsDirty(draftRevision.current !== submittedRevision);
      toast.success("Đã lưu bài tập thực hành code thành công!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu bài code.");
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          THANH ĐIỀU HƯỚNG VÀ HEADER
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
        <div className="space-y-1.5">
          <Link
            href={`/dashboard/lecturer/courses/${courseId}/content`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="size-3.5" />
            Quay lại khoá học: {course.title}
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{title || "Bài tập code chưa đặt tên"}</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-primary/10 text-primary border border-primary/20">
              Bài tập code (S23b)
            </span>
            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-muted text-muted-foreground border border-border">
              "JavaScript (QuickJS Sandbox)"
            </span>
            {isLocked && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-warning/10 text-warning border border-warning/20">
                Đang chờ duyệt — Chỉ đọc
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Thiết lập đề bài, khung code ban đầu, lời giải mẫu và bộ test case tự động chấm điểm cho học viên.
          </p>
        </div>

        {/* Nút hành động */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Xem như học viên */}
          <Link
            href={`/dashboard/lecturer/courses/${courseId}/code/${lessonId}/preview`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs")}
          >
            <Eye className="size-3.5" />
            Xem như học viên
          </Link>

          {!isLocked && (
            <>
              {/* Nút chạy thử với lời giải */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifySolution}
                disabled={isVerifying}
                className="gap-1.5 text-xs cursor-pointer shadow-xs"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Đang chạy thử...
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 text-primary" />
                    Chạy thử với lời giải
                  </>
                )}
              </Button>

              {/* Nút lưu */}
              <Button
                size="sm"
                onClick={handleSaveExercise}
                disabled={isSaving}
                className="gap-1.5 text-xs cursor-pointer shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="size-3.5" />
                    Lưu bài code
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cảnh báo thay đổi chưa lưu */}
      {isDirty && !isLocked && (
        <Alert variant="warning" className="p-3">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-xs font-medium">
            Bạn có thay đổi chưa lưu. Hãy nhớ bấm <strong>Chạy thử với lời giải</strong> rồi bấm <strong>Lưu bài code</strong>.
          </AlertDescription>
        </Alert>
      )}

      {/* Cảnh báo chỉ đọc */}
      {isLocked && (
        <Alert variant="warning">
          <AlertTitle className="font-semibold">Khoá học đang chờ duyệt</AlertTitle>
          <AlertDescription>
            Nội dung bài tập đang ở chế độ chỉ đọc trong thời gian ban quản trị kiểm duyệt.
          </AlertDescription>
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────
          BỐ CỤC CHÍNH: 2 CỘT (TABS SOẠN THẢO & PANEL KẾT QUẢ CHẠY)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* CỘT TRÁI (2/3): TABS SOẠN THẢO */}
        <div className="lg:col-span-2 space-y-4">
          {/* Thanh Tabs */}
          <div className="border-b border-border/80 flex items-center gap-1 overflow-x-auto">
            {[
              { id: "brief", label: "Đề bài", icon: ListOrdered },
              { id: "starter", label: "Code khởi đầu", icon: Code2 },
              { id: "solution", label: "Lời giải mẫu", icon: FileCode },
              { id: "tests", label: `Test case (${tests.length})`, icon: Terminal },
              { id: "hints", label: `Gợi ý (${hints.length})`, icon: HelpCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer",
                    isSelected
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: ĐỀ BÀI (BRIEF) */}
          {activeTab === "brief" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Thông tin & Yêu cầu đề bài</CardTitle>
                <CardDescription className="text-xs">
                  Thiết lập tiêu đề bài tập, thời lượng và danh sách các bước yêu cầu học viên cần đạt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Tên bài tập <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={title}
                      disabled={isLocked}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        markDirty();
                      }}
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Thời lượng dự kiến (phút)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={180}
                      value={durationMinutes}
                      disabled={isLocked}
                      onChange={(e) => {
                        setDurationMinutes(Number(e.target.value) || 15);
                        markDirty();
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Ngôn ngữ lập trình</label>
                    <select
                      value={language}
                      disabled={isLocked}
                      onChange={(e) => {
                        setLanguage(e.target.value);
                        markDirty();
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground"
                    >
                      <option value="javascript">JavaScript (QuickJS WASM Sandbox)</option>
                      <option value="python" disabled>Python (Chưa hỗ trợ trong Sandbox)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Tên tệp hiển thị</label>
                    <Input
                      value={fileName}
                      disabled={isLocked}
                      onChange={(e) => {
                        setFileName(e.target.value);
                        markDirty();
                      }}
                      placeholder="ví dụ: main.js"
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Danh sách các bước yêu cầu */}
                <div className="space-y-2.5 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Các bước yêu cầu đề bài</span>
                      <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Hiện thành danh sách checklist bên cạnh trình soạn code của học viên
                    </span>
                  </div>

                  <div className="space-y-2">
                    {instructions.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="size-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                          {idx + 1}
                        </span>
                        <Textarea
                          rows={2}
                          value={step}
                          disabled={isLocked}
                          onChange={(e) => handleUpdateInstruction(idx, e.target.value)}
                          placeholder={`Mô tả yêu cầu bước ${idx + 1}...`}
                          className="text-xs flex-1"
                        />
                        {!isLocked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={instructions.length <= 1}
                            onClick={() => handleDeleteInstruction(idx)}
                            className="size-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0 mt-1"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!isLocked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddInstruction}
                      className="gap-1 text-xs cursor-pointer h-8"
                    >
                      <Plus className="size-3.5" />
                      Thêm bước yêu cầu
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 2: CODE KHỞI ĐẦU (STARTER CODE) */}
          {activeTab === "starter" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mã nguồn khởi đầu (Starter Code)</CardTitle>
                <CardDescription className="text-xs">
                  Đoạn mã mẫu mà học viên sẽ thấy khi mở bài học lần đầu. Nên để sẵn tên hàm, tham số và chú thích hướng dẫn.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                  <Textarea
                    rows={14}
                    value={starterCode}
                    disabled={isLocked}
                    onChange={(e) => {
                      setStarterCode(e.target.value);
                      markDirty();
                    }}
                    placeholder={`// Khung code gợi ý cho học viên\nfunction solution(input) {\n  // Viết code của bạn ở đây\n  return input;\n}`}
                    className="font-mono text-xs leading-relaxed bg-background"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 3: LỜI GIẢI MẪU (REFERENCE SOLUTION) */}
          {activeTab === "solution" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Lời giải mẫu chuẩn (Reference Solution)</CardTitle>
                    <CardDescription className="text-xs">
                      Lời giải này bắt buộc phải vượt qua 100% test case để bài tập đủ điều kiện lưu và xuất bản khoá học.
                    </CardDescription>
                  </div>
                  {!isLocked && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleVerifySolution}
                      disabled={isVerifying}
                      className="gap-1.5 text-xs cursor-pointer shrink-0"
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Đang chạy...
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" />
                          Chạy thử
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                  <Textarea
                    rows={14}
                    value={solutionCode}
                    disabled={isLocked}
                    onChange={(e) => {
                      setSolutionCode(e.target.value);
                      markDirty();
                    }}
                    placeholder={`function solution(input) {\n  // Lời giải đúng\n  return input;\n}`}
                    className="font-mono text-xs leading-relaxed bg-background"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 4: TEST CASES */}
          {activeTab === "tests" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Mỗi test case là một biểu thức gọi hàm kèm giá trị trả về mong đợi (định dạng JSON).
                </div>
                {!isLocked && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAiTests}
                      disabled={isGeneratingAi}
                      className="gap-1.5 text-xs cursor-pointer border-primary/40 text-primary hover:bg-primary/5"
                    >
                      {isGeneratingAi ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          AI đang tìm...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          Gợi ý test biên
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddTest}
                      className="gap-1 text-xs cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      Thêm test
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {tests.map((t, idx) => (
                  <Card key={idx} className="border border-border/80 shadow-xs">
                    <CardHeader className="py-2.5 px-4 bg-muted/30 border-b border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground">
                            Test #{idx + 1}
                          </span>
                          {t.hidden ? (
                            <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-muted text-muted-foreground border border-border">
                              Test ẩn (chỉ chấm khi Nộp bài)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-primary/10 text-primary border border-primary/20">
                              Mẫu công khai (học viên nhìn thấy)
                            </span>
                          )}
                        </div>

                        {!isLocked && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                id={`hidden-test-${idx}`}
                                checked={t.hidden}
                                onCheckedChange={(checked) => {
                                  handleUpdateTest(idx, "hidden", !!checked);
                                  handleUpdateTest(idx, "isSample", !checked);
                                }}
                              />
                              <Label htmlFor={`hidden-test-${idx}`} className="text-xs cursor-pointer">
                                Ẩn test
                              </Label>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={tests.length <= 1}
                              onClick={() => handleDeleteTest(idx)}
                              className="size-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-foreground">Tên test case</label>
                        <Input
                          value={t.name}
                          disabled={isLocked}
                          onChange={(e) => handleUpdateTest(idx, "name", e.target.value)}
                          placeholder="Ví dụ: Kiểm tra số nguyên tố hoặc trường hợp mảng rỗng"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-foreground">
                            Biểu thức gọi hàm (Call expression)
                          </label>
                          <Input
                            value={t.call}
                            disabled={isLocked}
                            onChange={(e) => handleUpdateTest(idx, "call", e.target.value)}
                            placeholder="ví dụ: tinhTong(2, 3)"
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-foreground">
                            Giá trị mong đợi JSON (Expected Output)
                          </label>
                          <Input
                            value={t.expectedText !== undefined ? t.expectedText : JSON.stringify(t.expected)}
                            disabled={isLocked}
                            onChange={(e) => handleUpdateTest(idx, "expectedText", e.target.value)}
                            placeholder='ví dụ: 5, "Hello", hoặc [1, 2]'
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: GỢI Ý (HINTS) */}
          {activeTab === "hints" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Gợi ý mở dần cho học viên</CardTitle>
                <CardDescription className="text-xs">
                  Gợi ý sẽ mở dần khi học viên nộp bài nhiều lần chưa đạt, giúp học viên tự tìm ra lỗi mà không xem trước toàn bộ lời giải.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {hints.map((hint, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="size-6 rounded-full bg-muted font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                      {idx + 1}
                    </span>
                    <Textarea
                      rows={2}
                      value={hint}
                      disabled={isLocked}
                      onChange={(e) => handleUpdateHint(idx, e.target.value)}
                      placeholder={`Gợi ý ${idx + 1}...`}
                      className="text-xs flex-1"
                    />
                    {!isLocked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={hints.length <= 1}
                        onClick={() => handleDeleteHint(idx)}
                        className="size-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0 mt-1"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                {!isLocked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddHint}
                    className="gap-1 text-xs cursor-pointer h-8"
                  >
                    <Plus className="size-3.5" />
                    Thêm gợi ý
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* CỘT PHẢI (1/3): PANEL KIỂM THỬ VÀ CONSOLE */}
        <div className="space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="size-4 text-primary" />
                  Chạy thử với lời giải
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Chạy lời giải mẫu với toàn bộ {tests.length} test case (kể cả test ẩn). Bài chỉ đủ điều kiện lưu và xuất bản khi đạt 100%.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isLocked && (
                <Button
                  onClick={handleVerifySolution}
                  disabled={isVerifying}
                  className="w-full gap-2 text-xs cursor-pointer shadow-sm"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Đang thực thi...
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" />
                      Chạy thử nghiệm ngay
                    </>
                  )}
                </Button>
              )}

              {/* Trạng thái kết quả chạy */}
              {verificationResult ? (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div
                    className={cn(
                      "p-3 rounded-lg border flex items-center justify-between text-xs font-semibold",
                      verificationResult.ok
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {verificationResult.ok ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      {verificationResult.ok
                        ? `Lời giải đạt ${verificationResult.passed}/${verificationResult.total} test`
                        : `Chưa đạt: ${verificationResult.passed}/${verificationResult.total} test`}
                    </span>
                    <span className="text-[11px] font-normal">
                      {verificationResult.ok ? "Đủ điều kiện lưu" : "Không thể lưu bài"}
                    </span>
                  </div>

                  {/* Danh sách từng test outcome */}
                  <div className="space-y-2">
                    {verificationResult.outcomes.map((o, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-2.5 rounded-md border text-xs space-y-1 font-mono transition-colors",
                          o.pass
                            ? "bg-success/5 border-success/20 text-foreground"
                            : "bg-destructive/5 border-destructive/20 text-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between font-sans">
                          <span className="font-semibold text-[11px] flex items-center gap-1">
                            {o.pass ? (
                              <Check className="size-3 text-success stroke-[3]" />
                            ) : (
                              <XCircle className="size-3 text-destructive" />
                            )}
                            {o.name || `Test #${idx + 1}`}
                            {o.hidden && " (ẩn)"}
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

                        <div className="text-[11px] text-muted-foreground truncate">
                          <code>{o.call}</code>
                        </div>

                        {!o.pass && (
                          <div className="text-[10px] space-y-0.5 pt-1 border-t border-border/40 font-mono">
                            <div className="text-muted-foreground">Mong đợi: {o.expected}</div>
                            <div className="text-destructive font-semibold">
                              Thực tế: {o.actual || o.error || "undefined"}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Console logs */}
                  {verificationResult.logs.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border/60">
                      <span className="text-xs font-semibold text-muted-foreground">Console</span>
                      <div className="p-2.5 rounded-md bg-muted/40 border border-border/80 font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
                        {verificationResult.logs.map((log, idx) => (
                          <div key={idx} className="text-foreground">
                            {log.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed border-border/80 text-center space-y-1 text-xs text-muted-foreground">
                  <Terminal className="size-5 mx-auto text-muted-foreground" />
                  <p>Chưa có kết quả chạy thử gần đây.</p>
                  <p className="text-[11px]">Bấm nút bên trên để kiểm tra lời giải mẫu.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
