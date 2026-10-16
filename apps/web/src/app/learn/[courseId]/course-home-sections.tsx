"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Star,
  X,
} from "lucide-react";
import { Alert } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  LESSON_PATH_LABELS,
  type CoursePathView,
} from "@/lib/learning-path-contract";
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
      <CardContent className="flex flex-col gap-6 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <h1 className="text-2xl font-semibold">{data.course.title}</h1>
          <p className="text-sm text-muted-foreground">
            Mục tiêu: <strong className="text-foreground">{goal}</strong>
            {data.hours ? ` · ${data.hours} giờ/tuần` : ""}{" "}
            <Button variant="link" className="px-1" onClick={onEditGoal}>
              Chỉnh mục tiêu
            </Button>
          </p>
          <div className="flex items-center gap-4">
            <progress
              aria-label="Tiến độ khoá học"
              max={100}
              value={data.percent}
              className="h-3 min-w-0 flex-1 accent-primary"
            />
            <span className="shrink-0 text-sm">
              {data.done}/{data.total} bài · {data.percent}%
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          {current && !data.complete && (
            <Link className={buttonVariants()} href={lessonUrl(current.id)}>
              Học tiếp <ArrowRight className="size-4" />
            </Link>
          )}
          <Button variant="outline" onClick={onReview}>
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

export function LessonPath({
  data,
  lessonUrl,
}: {
  data: CoursePathView;
  lessonUrl: LessonUrl;
}) {
  return (
    <section className="space-y-4" aria-label="Các bài theo thứ tự lộ trình">
      {!data.rows.length && (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            Khoá học chưa có bài học được xuất bản.
          </CardContent>
        </Card>
      )}
      <ol className="space-y-3">
        {data.rows.map((row, index) => (
          <li key={row.id}>
            <Card
              className={cn(
                (row.status === "next" || row.status === "active") &&
                  "border-primary",
                data.highlights.includes(row.id) && "border-info bg-info-soft",
              )}
            >
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {row.status === "done" ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : row.status === "locked" ? (
                    <LockKeyhole className="size-5 text-muted-foreground" />
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {row.chapterTitle}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.status === "locked" ? (
                      <h2 className="font-semibold text-muted-foreground">
                        {row.title}
                      </h2>
                    ) : (
                      <h2 className="font-semibold">
                        <Link
                          href={lessonUrl(row.id)}
                          className="hover:underline"
                        >
                          {row.title}
                        </Link>
                      </h2>
                    )}
                    {data.highlights.includes(row.id) && (
                      <span className="rounded-full bg-info-soft px-2 py-1 text-xs text-info">
                        Mới cập nhật
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{Math.ceil(row.durationSeconds / 60)} phút</span>
                    {row.mastery.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1"
                      >
                        <span>{c.name}:</span>
                        <MasteryChip level={c.level} />
                      </span>
                    ))}
                  </div>
                  {row.lock && row.status !== "done" ? (
                    <p className="text-sm">
                      Cần học trước: {row.lock.concept} ({row.lock.lessonTitle})
                    </p>
                  ) : (
                    <details
                      open={row.status === "next" || row.status === "active"}
                    >
                      <summary className="cursor-pointer text-sm text-primary">
                        Vì sao?
                      </summary>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {row.reason}
                      </p>
                    </details>
                  )}
                </div>
                <span
                  className={cn(
                    "w-fit shrink-0 rounded-full px-3 py-1 text-xs",
                    row.status === "done"
                      ? "bg-success-soft text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {LESSON_PATH_LABELS[row.status]}
                </span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
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
          <DialogTitle>Đánh giá khóa học</DialogTitle>
          <DialogDescription>{data.course.title}</DialogDescription>
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
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Chọn số sao"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${n} sao`}
                aria-pressed={rating === n}
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
          <label htmlFor="course-review" className="text-sm">
            Nhận xét (không bắt buộc)
          </label>
          <Textarea
            id="course-review"
            value={text}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" className="min-w-32" disabled={pending}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}Lưu
            đánh giá
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
