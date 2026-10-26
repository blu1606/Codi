"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  GitBranch,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
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
import { Label } from "@codi-1/ui/components/label";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  COURSE_CATEGORIES,
  COURSE_LEVEL_LABELS,
  COURSE_LEVELS,
  type CourseCategory,
  type CourseLevel,
} from "@/lib/course-constants";
import { createCourseDraft } from "../actions";

export function CourseCreateForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<string>("");
  const [level, setLevel] = useState<string>("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submit form tạo khoá học
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (title.trim().length < 5) {
      newErrors.title = "Tên khoá học cần ít nhất 5 ký tự.";
    } else if (title.trim().length > 120) {
      newErrors.title = "Tên khoá học tối đa 120 ký tự.";
    }

    if (summary.trim().length < 20) {
      newErrors.summary = "Mô tả cần ít nhất 20 ký tự.";
    } else if (summary.trim().length > 500) {
      newErrors.summary = "Mô tả tối đa 500 ký tự.";
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
        toast.success("Đã tạo bản nháp khoá học thành công!");
        router.push(`/dashboard/lecturer/courses/${res.courseId}`);
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
                <Label htmlFor="course-title" className="text-sm font-semibold text-foreground">
                  Tên khoá học <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="course-title"
                  placeholder="Ví dụ: Lập trình Vue 3 và TypeScript thực chiến"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.title}
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                  <span>Từ 5 đến 120 ký tự.</span>
                  <span>{title.length}/120 ký tự</span>
                </div>
                {errors.title && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Mô tả ngắn */}
              <div className="space-y-1.5">
                <Label htmlFor="course-summary" className="text-sm font-semibold text-foreground">
                  Mô tả ngắn <span className="text-destructive">*</span>
                </Label>
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
                  <span>Từ 20 đến 500 ký tự.</span>
                  <span>{summary.length}/500 ký tự</span>
                </div>
                {errors.summary && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {errors.summary}
                  </p>
                )}
              </div>

              {/* Danh mục và Trình độ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="course-category" className="text-sm font-semibold text-foreground">
                    Danh mục <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="course-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {COURSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {errors.category}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="course-level" className="text-sm font-semibold text-foreground">
                    Trình độ <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="course-level"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">-- Chọn trình độ --</option>
                    {COURSE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {COURSE_LEVEL_LABELS[lvl]} ({lvl})
                      </option>
                    ))}
                  </select>
                  {errors.level && (
                    <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                      <AlertCircle className="size-3.5 shrink-0" />
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

      {/* Cột phải: Hướng dẫn tạo khoá học chuẩn Codi */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <Lightbulb className="size-4" />
              <span>Hướng dẫn quy chuẩn</span>
            </div>
            <CardTitle className="text-lg">Quy chuẩn tạo khoá học tại Codi</CardTitle>
            <CardDescription className="text-xs">
              Khoá học mới được khởi tạo ở trạng thái Bản nháp để bạn hoàn thiện nội dung trước khi yêu cầu xuất bản.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted-foreground">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-primary" />
                Tiêu đề & Mô tả ngắn
              </div>
              <p>
                Đặt tên khoá học rõ ràng, nêu bật công nghệ hoặc kỹ năng trọng tâm. Mô tả ngắn gọn kết quả đầu ra của người học sau khi hoàn thành.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <ListChecks className="size-3.5 text-primary" />
                Phân loại & Trình độ
              </div>
              <p>
                Lựa chọn danh mục chính xác giúp khoá học hiển thị đúng trong bộ lọc Danh mục khoá học của học viên.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <GitBranch className="size-3.5 text-primary" />
                Các bước tiếp theo
              </div>
              <p>
                Sau khi tạo bản nháp, bạn sẽ vào trình chỉnh sửa khoá học để thêm chương bài, cấu hình bài tập lập trình tương tác và xây dựng Cây kiến thức.
              </p>
            </div>

            <div className="rounded-md bg-primary/5 p-3 text-primary flex items-start gap-2">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              <span>
                Khoá học mới luôn được đặt ở mức giá 0 VND và chỉ hiển thị công khai sau khi vượt qua quy trình kiểm duyệt xuất bản của Quản trị viên.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
