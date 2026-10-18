"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { cn } from "@codi-1/ui/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  createCourseDraft,
  decideAiCourseDraft,
  saveAiCourseDraft,
} from "../actions";

const CATEGORIES = [
  "Lập trình Web (Frontend / Fullstack)",
  "Lập trình Backend & Cơ sở dữ liệu",
  "Trí tuệ nhân tạo (AI & Data)",
  "Lập trình Di động (Mobile)",
  "Thuật toán & Cấu trúc dữ liệu",
  "DevOps & Điện toán đám mây",
];

const LEVELS = [
  { value: "Beginner", label: "Cơ bản (Cho người mới bắt đầu)" },
  { value: "Intermediate", label: "Trung cấp (Đã có nền tảng)" },
  { value: "Advanced", label: "Nâng cao (Chuyên sâu)" },
];

interface AiOutlineChapter {
  title: string;
  lessons: string[];
}

export function CourseCreateForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [level, setLevel] = useState("Beginner");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Trạng thái AI Outline Draft (STATE-MACHINES.md §19: pending | accepted | discarded)
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiDraftId, setAiDraftId] = useState<number | null>(null);
  const [aiDraftStatusState, setAiDraftStatusState] = useState<"pending" | "accepted" | "discarded" | null>(null);
  const [aiChapters, setAiChapters] = useState<AiOutlineChapter[]>([]);

  // Hàm sinh khung bài học bằng AI
  const handleGenerateAiOutline = async () => {
    if (!title.trim() || title.trim().length < 5) {
      toast.error("Vui lòng nhập tên khoá học trước để AI có thể gợi ý khung bài học phù hợp.");
      return;
    }

    try {
      setIsAiGenerating(true);
      // Gợi ý outline dựa trên tiêu đề và danh mục
      const sampleChapters: AiOutlineChapter[] = [
        {
          title: `Chương 1: Tổng quan & Khởi đầu với ${title.trim()}`,
          lessons: ["Giới thiệu & Cài đặt môi trường", "Cú pháp và khái niệm cốt lõi", "Bài thực hành đầu tiên"],
        },
        {
          title: "Chương 2: Kiến trúc và Thực hành nâng cao",
          lessons: ["Xử lý dữ liệu & Luồng điều khiển", "Tổ chức mã nguồn theo module", "Bài tập lập trình tương tác"],
        },
        {
          title: "Chương 3: Đồ án thực chiến & Tối ưu",
          lessons: ["Xây dựng ứng dụng hoàn chỉnh", "Kiểm thử & Tối ưu hiệu năng", "Đóng gói & Triển khai"],
        },
      ];

      // Lưu bản nháp AI vào bảng ai_content_drafts
      const draftRes = await saveAiCourseDraft({
        topic: title.trim(),
        category,
        level,
        chapters: sampleChapters,
      });

      if (draftRes.success && draftRes.draftId) {
        setAiDraftId(draftRes.draftId);
        setAiChapters(sampleChapters);
        setAiDraftStatusState("pending");
        toast.success("AI đã tạo xong khung bài học gợi ý!");
      }
    } catch {
      toast.error("Không thể tạo bản nháp AI lúc này. Vui lòng thử lại.");
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Quyết định chấp nhận bản nháp AI
  const handleAcceptAiDraft = async () => {
    if (!aiDraftId) return;
    try {
      await decideAiCourseDraft(aiDraftId, "accepted");
      setAiDraftStatusState("accepted");
      if (!summary.trim()) {
        setSummary(
          `Khoá học ${title} gồm ${aiChapters.length} chương chuyên sâu, giúp học viên làm chủ kiến thức từ cơ bản đến thực chiến đồ án.`
        );
      }
      toast.success("Đã áp dụng khung bài học AI vào khoá học!");
    } catch {
      toast.error("Có lỗi xảy ra khi duyệt bản nháp AI.");
    }
  };

  // Quyết định bỏ qua bản nháp AI
  const handleDiscardAiDraft = async () => {
    if (!aiDraftId) return;
    try {
      await decideAiCourseDraft(aiDraftId, "discarded");
      setAiDraftStatusState("discarded");
      toast.info("Đã huỷ bỏ bản nháp AI.");
    } catch {
      toast.error("Có lỗi xảy ra khi huỷ bản nháp AI.");
    }
  };

  // Submit form tạo khoá học
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (title.trim().length < 5) {
      newErrors.title = "Tên khoá học cần ít nhất 5 ký tự.";
    }
    if (summary.trim().length < 20) {
      newErrors.summary = "Mô tả cần ít nhất 20 ký tự.";
    }
    if (!category) {
      newErrors.category = "Chọn một danh mục.";
    }
    if (!level) {
      newErrors.level = "Chọn trình độ.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createCourseDraft({
        title,
        summary,
        category,
        level,
      });

      if (res.success && res.courseId) {
        toast.success("Đã tạo bản nháp. Bắt đầu thêm chương và bài học.");
        router.push(`/dashboard/lecturer/courses`);
      } else if (res.errors) {
        setErrors(res.errors);
      }
    } catch {
      toast.error("Không thể tạo khoá học lúc này. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Cột trái: Form thông tin tối giản */}
      <div className="lg:col-span-7">
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Thông tin cơ bản</CardTitle>
            <CardDescription>
              Điền 4 thông tin thiết yếu để khởi tạo khoá học ở trạng thái Bản nháp (draft).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Tên khoá học */}
              <div className="space-y-1.5">
                <label htmlFor="course-title" className="text-sm font-semibold text-foreground">
                  Tên khoá học <span className="text-destructive">*</span>
                </label>
                <Input
                  id="course-title"
                  placeholder="Ví dụ: Vue 3 và TypeScript cho người mới bắt đầu"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.title}
                />
                {errors.title && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                    <AlertCircle className="size-3.5" />
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Mô tả ngắn */}
              <div className="space-y-1.5">
                <label htmlFor="course-summary" className="text-sm font-semibold text-foreground">
                  Mô tả ngắn <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="course-summary"
                  placeholder="1–2 câu: nêu rõ học viên sẽ làm được gì hoặc giải quyết được vấn đề gì sau khoá học."
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.summary}
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                  <span>Tối thiểu 20 ký tự.</span>
                  <span>{summary.length} ký tự</span>
                </div>
                {errors.summary && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                    <AlertCircle className="size-3.5" />
                    {errors.summary}
                  </p>
                )}
              </div>

              {/* Danh mục và Trình độ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="course-category" className="text-sm font-semibold text-foreground">
                    Danh mục <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="course-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                      <AlertCircle className="size-3.5" />
                      {errors.category}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="course-level" className="text-sm font-semibold text-foreground">
                    Trình độ <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="course-level"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {LEVELS.map((lvl) => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label}
                      </option>
                    ))}
                  </select>
                  {errors.level && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                      <AlertCircle className="size-3.5" />
                      {errors.level}
                    </p>
                  )}
                </div>
              </div>

              {/* Nhóm nút bấm */}
              <div className="flex items-center gap-3 pt-3">
                <Button type="submit" disabled={isSubmitting} className="gap-2 cursor-pointer">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    "Tạo bản nháp"
                  )}
                </Button>
                <Link
                  href="/dashboard/lecturer"
                  className={cn(buttonVariants({ variant: "ghost" }), "cursor-pointer")}
                >
                  Huỷ
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Cột phải: Hỗ trợ sinh khung bài học bằng AI (AI Course Outline) */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="border border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <Sparkles className="size-4" />
              <span>Trợ lý AI Codi</span>
            </div>
            <CardTitle className="text-lg">Gợi ý khung bài học (AI Outline)</CardTitle>
            <CardDescription className="text-xs">
              AI sẽ phân tích tên khoá học và đề xuất các chương, bài học thực hành tương ứng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiDraftStatusState === null ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateAiOutline}
                disabled={isAiGenerating || isSubmitting}
                className="w-full gap-2 cursor-pointer bg-background"
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    AI đang phân tích & lên khung...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 text-primary" />
                    Gợi ý khung bài học bằng AI
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Layers className="size-3.5 text-primary" />
                    Khung bài học AI đề xuất ({aiChapters.length} chương)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {aiDraftStatusState === "pending"
                      ? "Chờ duyệt"
                      : aiDraftStatusState === "accepted"
                        ? "Đã chấp nhận"
                        : "Đã bỏ qua"}
                  </span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {aiChapters.map((ch, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/70 bg-card p-3 space-y-2 text-xs"
                    >
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <ChevronRight className="size-3.5 text-primary" />
                        {ch.title}
                      </div>
                      <ul className="pl-5 list-disc space-y-1 text-muted-foreground">
                        {ch.lessons.map((ls, lIdx) => (
                          <li key={lIdx}>{ls}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {aiDraftStatusState === "pending" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAcceptAiDraft}
                      className="flex-1 gap-1.5 cursor-pointer"
                    >
                      <Check className="size-3.5" />
                      Áp dụng khung này
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDiscardAiDraft}
                      className="gap-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      Bỏ qua
                    </Button>
                  </div>
                )}

                {aiDraftStatusState === "accepted" && (
                  <div className="rounded-md bg-success-soft p-3 text-xs text-success flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>Đã chấp nhận khung bài học AI. Nội dung sẽ được đưa vào bản nháp.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
