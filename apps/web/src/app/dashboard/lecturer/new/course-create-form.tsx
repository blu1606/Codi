"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { cn } from "@codi-1/ui/lib/utils";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  COURSE_CATEGORIES,
  COURSE_LEVEL_LABELS,
  COURSE_LEVELS,
} from "@/lib/course-constants";
import { createCourseDraft } from "../actions";

const SERVER_ERROR = "Không thể tạo khoá học lúc này. Vui lòng thử lại.";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
      <AlertCircle className="size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function CourseCreateForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<string>("");
  const [level, setLevel] = useState<string>("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

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
    if (!category) newErrors.category = "Chọn một danh mục.";
    if (!level) newErrors.level = "Chọn trình độ.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createCourseDraft({ title, summary, category, level });

      if (res.success && res.courseId) {
        toast.success("Đã tạo bản nháp. Bắt đầu thêm chương và bài học.");
        router.push(`/dashboard/lecturer/courses/${res.courseId}`);
        return;
      }
      if (res.errors && Object.keys(res.errors).length > 0) {
        setErrors(res.errors);
      } else {
        setServerError(SERVER_ERROR);
      }
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClass =
    "h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive";

  return (
    <Card className="mx-auto w-full max-w-[560px] gap-0 py-0 shadow-xs">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Không tạo được khoá học</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="course-title">
              Tên khoá học <span className="text-destructive">*</span>
            </Label>
            <Input
              id="course-title"
              placeholder="Ví dụ: Vue 3 cho người mới"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!errors.title}
            />
            <FieldError message={errors.title} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-summary">
              Mô tả ngắn <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="course-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!errors.summary}
            />
            <p className="text-xs text-muted-foreground">1–2 câu: học viên sẽ làm được gì sau khoá học.</p>
            <FieldError message={errors.summary} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-category">
                Danh mục <span className="text-destructive">*</span>
              </Label>
              <select
                id="course-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.category}
                className={selectClass}
              >
                <option value="">Chọn danh mục</option>
                {COURSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <FieldError message={errors.category} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-level">
                Trình độ <span className="text-destructive">*</span>
              </Label>
              <select
                id="course-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.level}
                className={selectClass}
              >
                <option value="">Chọn trình độ</option>
                {COURSE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {COURSE_LEVEL_LABELS[lvl]}
                  </option>
                ))}
              </select>
              <FieldError message={errors.level} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={isSubmitting} className="min-w-[8.5rem] cursor-pointer gap-2">
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
  );
}
