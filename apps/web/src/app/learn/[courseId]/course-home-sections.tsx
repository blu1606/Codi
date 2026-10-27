"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  GraduationCap,
  LoaderCircle,
  Star,
  X,
} from "lucide-react";
import { Alert } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { LearningProgressBar } from "@/components/learner-workspace";
import type { CoursePathView } from "@/lib/learning-path-contract";
type LessonUrl = (id: string) => Route;
type CurrentLesson = CoursePathView["rows"][number] | undefined;
export function CourseOverview({
  data,
  goal,
  current,
  lessonUrl,
  onEditGoal,
  onReview,
}: {
  data: CoursePathView;
  goal: string;
  current: CurrentLesson;
  lessonUrl: LessonUrl;
  onEditGoal: () => void;
  onReview: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className="text-2xl font-semibold">{data.course.title}</h1>
          <p className="text-sm text-muted-foreground">
            Mục tiêu: <strong className="text-foreground">{goal}</strong>
            {data.hours ? ` · ${data.hours} giờ/tuần` : ""}{" "}
            <Button variant="link" className="px-1" onClick={onEditGoal}>
              Chỉnh mục tiêu
            </Button>
          </p>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <LearningProgressBar
                value={data.percent}
                label="Tiến độ khoá học"
              />
            </div>
            <span className="shrink-0 text-sm">
              {data.done}/{data.total} bài · {data.percent}%
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {current && !data.complete && (
            <>
              <Link className={buttonVariants({ size: "lg" })} href={lessonUrl(current.id)}>
                Học tiếp
              </Link>
              <span className="max-w-64 truncate text-xs text-muted-foreground">
                {current.title}
              </span>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onReview}>
            {data.review ? "Sửa đánh giá" : "Đánh giá khóa học"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DiagnosticPrompt({
  busy,
  onDismiss,
  onStart,
}: {
  busy: boolean;
  onDismiss: () => void;
  onStart: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">
            Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)
          </h2>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label="Ẩn thông báo cá nhân hoá lộ trình"
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.
        </p>
        <Button variant="outline" disabled={busy} onClick={onStart}>
          Làm bài kiểm tra đầu vào
        </Button>
      </CardContent>
    </Card>
  );
}

export function PathUpdateNotice({
  data,
  current,
  busy,
  lessonUrl,
  onDismiss,
}: {
  data: CoursePathView;
  current: CurrentLesson;
  busy: boolean;
  lessonUrl: LessonUrl;
  onDismiss: () => void;
}) {
  return (
    <Card className="border-info">
      <CardContent className="space-y-4 py-5" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-success" />
            {data.update!.afterLessonId
              ? `Đã hoàn thành: ${data.rows.find((r) => r.id === data.update!.afterLessonId)?.title ?? "bài học"}`
              : "Lộ trình đã được cập nhật"}
          </h2>
          <Button variant="ghost" disabled={busy} onClick={onDismiss}>
            Ẩn thông báo
          </Button>
        </div>
        <p>{data.update!.message}</p>
        {data.update!.changes.length > 0 && (
          <ul className="list-inside list-disc space-y-2 text-sm">
            {data.update!.changes.map((change) => (
              <li key={`${change.type}:${change.lessonId}`}>{change.text}</li>
            ))}
          </ul>
        )}
        {current && !data.complete && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted p-4">
            <div>
              <p className="text-sm text-muted-foreground">Bài tiếp theo</p>
              <strong>{current.title}</strong>
            </div>
            <Link className={buttonVariants()} href={lessonUrl(current.id)}>
              Học tiếp
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CourseCompletion({
  data,
  onReview,
}: {
  data: CoursePathView;
  onReview: (rating: number) => void;
}) {
  return (
    <Card className="border-success">
      <CardContent className="space-y-5 py-6">
        <h2 className="flex items-start gap-3 text-xl font-semibold">
          <GraduationCap className="size-7 shrink-0 text-success" /> Chúc mừng!
          Bạn đã hoàn thành khoá học
        </h2>
        <p className="text-muted-foreground">{data.course.title}</p>
        <p>Bạn thấy khoá học thế nào?</p>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Đánh giá khoá học"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              size="icon"
              variant="ghost"
              aria-label={`${n} sao`}
              onClick={() => onReview(n)}
            >
              <Star
                className={cn(
                  "size-6 text-star",
                  data.review && n <= data.review.rating && "fill-current",
                )}
              />
            </Button>
          ))}
          {data.review && (
            <span className="text-sm text-muted-foreground">
              Bạn đã đánh giá {data.review.rating}/5
            </span>
          )}
        </div>
        {data.recommendation && (
          <div className="space-y-3 rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Khoá học gợi ý tiếp theo
            </p>
            <strong className="block">{data.recommendation.title}</strong>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={
                `/courses/${encodeURIComponent(data.recommendation.slug)}` as Route
              }
            >
              Xem khoá học
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewForm({
  data,
  initialRating,
  open,
  onOpenChange,
  save,
}: {
  initialRating: number | null;
  data: CoursePathView;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  save: (rating: number, text: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(
    initialRating ?? data.review?.rating ?? 0,
  );
  const [text, setText] = useState(data.review?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {data.review ? "Sửa đánh giá" : `Đánh giá "${data.course.title}"`}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            if (!rating) {
              setError("Vui lòng chọn số sao.");
              return;
            }
            setPending(true);
            setError(null);
            try {
              await save(rating, text);
              onOpenChange(false);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Không thể lưu đánh giá.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="space-y-2">
            <span className="text-sm font-medium">
              Đánh giá của bạn <span className="text-destructive">*</span>
            </span>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Số sao"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${n} sao`}
                role="radio"
                aria-checked={rating === n}
                disabled={pending}
                onClick={() => setRating(n)}
              >
                <Star
                  className={cn(
                    "size-6 text-star",
                    n <= rating && "fill-current",
                  )}
                />
              </Button>
            ))}
          </div>
          {!rating && (
            <span className="text-sm text-muted-foreground">
              Chọn số sao để gửi đánh giá.
            </span>
          )}
          </div>
          <label htmlFor="course-review" className="text-sm">
            Nhận xét <span className="text-muted-foreground">(không bắt buộc)</span>
          </label>
          <Textarea
            id="course-review"
            value={text}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              className="min-w-32"
              disabled={pending || !rating}
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {data.review ? "Lưu thay đổi" : "Gửi đánh giá"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
