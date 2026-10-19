"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Flame,
  GraduationCap,
  LoaderCircle,
  MessageSquare,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { Skeleton } from "@codi-1/ui/components/skeleton";
import { cn } from "@codi-1/ui/lib/utils";
import { GOAL_LABELS } from "@/lib/onboarding-contract";
import type {
  LearnerCourse,
  LearnerOverview,
  LearnerResult,
} from "@/lib/learner-overview-contract";

const home = (c: LearnerCourse) =>
  `/learn/${encodeURIComponent(c.id)}` as Route;
const start = (c: LearnerCourse) =>
  `${home(c)}${c.pathStatus === "none" ? "/onboarding" : !c.complete && c.nextLessonId && c.pathStatus === "ready" ? `/${c.nextLessonId}` : ""}` as Route;
const goal = (value: string | null) =>
  GOAL_LABELS[value as keyof typeof GOAL_LABELS] ?? "Hoàn thành khóa học";
const number = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);

async function request<T>(
  url: string,
  command?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: command ? "POST" : "GET",
    cache: "no-store",
    signal,
    ...(command
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }
      : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new Error(
      body?.error ?? "Không thể tải dữ liệu học tập. Vui lòng thử lại.",
    );
  return body as T;
}

export function LearningProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function LearnerWorkspace({
  mode = "dashboard",
  tab = "active",
}: {
  mode?: "dashboard" | "progress";
  tab?: "active" | "done";
}) {
  const router = useRouter();
  const [data, setData] = useState<LearnerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<LearnerCourse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void request<LearnerOverview>(
      "/api/learner/overview",
      undefined,
      controller.signal,
    )
      .then((body) => {
        setData(body);
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const refresh = () => setAttempt((a) => a + 1);
  async function openOnboarding(
    c: LearnerCourse,
    type: "goal-edit" | "diagnostic-retake",
  ) {
    setBusy(c.id);
    setError(null);
    try {
      await request(`/api/learn/${encodeURIComponent(c.id)}/onboarding`, {
        type,
      });
      setEditing(null);
      router.push(
        `${home(c)}/onboarding${type === "diagnostic-retake" ? "?view=intro" : ""}` as Route,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function dismiss(c: LearnerCourse) {
    setBusy(c.id);
    setError(null);
    try {
      const result = await request<{ dismissedAt: string }>(
        "/api/learner/overview",
        { type: "dismiss-diagnostic", courseId: c.id },
      );
      setData((current) =>
        current
          ? {
              ...current,
              courses: current.courses.map((item) =>
                item.id === c.id ? { ...item, showDiagnostic: false } : item,
              ),
            }
          : current,
      );
      toast("Đã ẩn thông báo cá nhân hoá lộ trình.", {
        action: {
          label: "Hoàn tác",
          onClick: () => {
            void request("/api/learner/overview", {
              type: "restore-diagnostic",
              courseId: c.id,
              dismissedAt: result.dismissedAt,
            })
              .then(refresh)
              .catch((cause) => setError((cause as Error).message));
          },
        },
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const progress = mode === "progress";
  return (
    <main className="mx-auto w-full min-w-0 max-w-[1200px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {progress ? "Tiến độ & kết quả" : "Bàn làm việc"}
          </h1>
          <p className="text-muted-foreground">
            {progress
              ? "Điểm quiz, bài tập, nhận xét của giảng viên và mức thành thạo — tất cả ở một nơi."
              : data
                ? `Chào mừng trở lại, ${data.name}!`
                : "Theo dõi việc học và tiếp tục lộ trình của bạn."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={progress ? "/dashboard" : "/progress"}
          >
            {progress ? (
              <BookOpen className="size-4" />
            ) : (
              <GraduationCap className="size-4" />
            )}
            {progress ? "Bàn làm việc" : "Tiến độ & kết quả"}
          </Link>
          <Link className={buttonVariants({ variant: "ghost" })} href="/ai">
            <Sparkles className="size-4" />
            Hỏi AI Codi
          </Link>
        </div>
      </header>
      <nav aria-label="Học tập của tôi" className="flex gap-4 border-b text-sm">
        <Link
          href="/dashboard"
          aria-current={!progress ? "page" : undefined}
          className={cn(
            "min-h-11 border-b-2 py-3",
            !progress
              ? "border-primary font-semibold text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          Bàn làm việc
        </Link>
        <Link
          href="/progress"
          aria-current={progress ? "page" : undefined}
          className={cn(
            "min-h-11 border-b-2 py-3",
            progress
              ? "border-primary font-semibold text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          Tiến độ & kết quả
        </Link>
      </nav>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể tải hoặc cập nhật dữ liệu học tập</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" disabled={loading} onClick={refresh}>
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && !data ? (
        <WorkspaceLoading />
      ) : data ? (
        progress ? (
          <ProgressResults data={data} tab={tab} />
        ) : data.courses.length ? (
          <>
            <WeeklyGoal
              data={data}
              edit={(id) => {
                const c = data.courses.find((c) => c.id === id);
                if (c) {
                  setError(null);
                  setEditing(c);
                }
              }}
            />
            <StatTiles data={data} />
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
              <div className="min-w-0 space-y-6">
                {data.continueCourseId && (
                  <ContinueLearning
                    course={data.courses.find(
                      (c) => c.id === data.continueCourseId,
                    )!}
                  />
                )}
                {data.courses
                  .filter((c) => c.showDiagnostic && !c.complete)
                  .map((c) => (
                    <Card key={c.id}>
                      <CardContent className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-lg font-semibold">
                            Cá nhân hoá lộ trình
                          </h2>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ẩn thông báo cá nhân hoá ${c.title}`}
                            disabled={busy === c.id}
                            onClick={() => void dismiss(c)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Làm bài kiểm tra đầu vào (~10 phút) để Codi bỏ qua
                          phần bạn đã biết và tập trung vào phần còn thiếu.
                        </p>
                        <Button
                          variant="outline"
                          className="min-w-52"
                          disabled={busy === c.id}
                          onClick={() =>
                            void openOnboarding(c, "diagnostic-retake")
                          }
                        >
                          {busy === c.id && (
                            <LoaderCircle className="size-4 animate-spin" />
                          )}
                          Làm bài kiểm tra đầu vào
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                <MyCourses courses={data.courses} />
              </div>
              <Updates data={data} />
            </div>
            <SkillBadges courses={data.courses} />
            {data.recommendations.length > 0 && (
              <section className="space-y-4" aria-labelledby="recommendations">
                <h2 id="recommendations" className="text-lg font-semibold">
                  Gợi ý cho bạn
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {data.recommendations.map((c) => (
                    <Card key={c.id} className="overflow-hidden py-0">
                      <CourseCover cover={c.cover} />
                      <CardContent className="space-y-2 pb-4">
                        <Link
                          href={
                            `/courses/${encodeURIComponent(c.slug)}` as Route
                          }
                          className="font-semibold hover:underline"
                        >
                          {c.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {c.level}
                        </p>
                        <p className="font-semibold">
                          {c.price ? `${number(c.price)} ₫` : "Miễn phí"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <WorkspaceEmpty />
        )
      ) : null}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Chỉnh mục tiêu học tập?</DialogTitle>
          <DialogDescription>
            Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số
            giữ nguyên.
          </DialogDescription>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setEditing(null)}
            >
              Để sau
            </Button>
            <Button
              disabled={!!busy}
              onClick={() =>
                editing && void openOnboarding(editing, "goal-edit")
              }
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}Chỉnh
              mục tiêu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-label="Đang tải dữ liệu học tập"
      className="space-y-4"
    >
      <span className="sr-only">Đang tải dữ liệu học tập…</span>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
function WorkspaceEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <BookOpen className="size-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          Bàn làm việc của bạn đang trống
        </h2>
        <p className="max-w-lg text-muted-foreground">
          Chọn một khoá học để bắt đầu. Codi sẽ xếp lộ trình riêng cho bạn sau
          bài kiểm tra đầu vào.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link className={buttonVariants()} href="/courses">
            Khám phá khoá học
          </Link>
          <Link className={buttonVariants({ variant: "outline" })} href="/ai">
            Khám phá lộ trình cùng AI
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
function CourseCover({
  cover,
  className,
  small = false,
}: {
  cover: string | null;
  className?: string;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex aspect-video items-center justify-center overflow-hidden bg-accent text-accent-foreground",
        className,
      )}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <BookOpen className={small ? "size-7" : "size-14"} aria-hidden="true" />
      )}
    </div>
  );
}
function ContinueLearning({ course: c }: { course: LearnerCourse }) {
  const setup = c.pathStatus === "none";
  const lesson = c.lessons.find((l) => l.id === c.nextLessonId);
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="grid gap-0 p-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <CourseCover cover={c.cover} className="sm:aspect-auto sm:h-full" />
        <section className="space-y-4 p-5" aria-labelledby="continue-title">
          <p className="text-sm font-semibold text-primary">Tiếp tục học</p>
          <h2 id="continue-title" className="text-xl font-semibold">
            {c.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {setup
              ? "Bước tiếp theo: đặt mục tiêu và làm bài kiểm tra đầu vào"
              : c.pathStatus === "generating"
                ? "Codi đang chuẩn bị lộ trình của bạn."
                : c.pathStatus === "failed"
                  ? "Lộ trình cần được kiểm tra lại. Bạn có thể mở lộ trình để thử lại."
                  : lesson
                    ? `Bài hiện tại: ${lesson.title}`
                    : "Bạn đã học hết các bài khả dụng"}
          </p>
          {!setup && (
            <div className="space-y-2">
              <LearningProgressBar
                value={c.percent}
                label={`Tiến độ ${c.title}`}
              />
              <p className="text-xs text-muted-foreground">
                {c.done}/{c.total} bài · {c.percent}%
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants()} href={start(c)}>
              {setup
                ? "Bắt đầu thiết lập"
                : c.pathStatus === "ready" && lesson
                  ? "Học tiếp"
                  : "Mở lộ trình"}
              <ArrowRight className="size-4" />
            </Link>
            {!setup && (
              <Link
                className={buttonVariants({ variant: "ghost" })}
                href={home(c)}
              >
                Xem lộ trình
              </Link>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
function WeeklyGoal({
  data,
  edit,
}: {
  data: LearnerOverview;
  edit: (id: string) => void;
}) {
  const w = data.weekly;
  const percent = Math.round((w.minutes / w.goalMinutes) * 100);
  return (
    <Card>
      <CardContent className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
        <section className="space-y-3" aria-labelledby="weekly-goal">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="weekly-goal"
              className="flex items-center gap-2 font-semibold"
            >
              <Target className="size-5 text-primary" />
              Mục tiêu hàng tuần
            </h2>
            <div className="flex items-center gap-2">
              {w.assumed && (
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Giả định
                </span>
              )}
              {w.courseId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => edit(w.courseId!)}
                >
                  Chỉnh mục tiêu
                </Button>
              )}
            </div>
          </div>
          <LearningProgressBar
            value={Math.min(100, percent)}
            label="Mục tiêu học tuần này"
          />
          <p className="text-sm text-muted-foreground">
            {w.minutes} phút / {w.goalMinutes} phút · {percent}% tuần này
          </p>
          <ol
            className="flex flex-wrap gap-2"
            aria-label="Hoạt động học trong tuần"
          >
            {w.days.map((day, i) => (
              <li
                key={day.date}
                aria-label={`${new Date(`${day.date}T00:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" })}: ${day.studied ? "Đã học" : "Chưa có hoạt động"}${day.today ? ", hôm nay" : ""}`}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border text-xs",
                  day.studied
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground",
                  day.today &&
                    "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
              >
                {day.studied ? (
                  <>
                    <Check className="size-4" />
                    <span className="sr-only">
                      {i === 6 ? "CN" : `T${i + 2}`}
                    </span>
                  </>
                ) : i === 6 ? (
                  "CN"
                ) : (
                  `T${i + 2}`
                )}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Thời gian được ghi nhận khi trang bài học đang hoạt động. Ngày học
            được tính khi bạn hoàn thành một hoạt động học tập.
          </p>
        </section>
        <div className="flex items-center gap-3 sm:border-l sm:pl-6">
          <Flame className="size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="font-display text-2xl font-semibold">{w.streak}</p>
            <p className="text-sm text-muted-foreground">ngày liên tiếp</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function StatTiles({ data }: { data: LearnerOverview }) {
  const entries = [
    ["Khoá đang học", data.stats.active, "active"],
    ["Bài học đã hoàn thành", data.stats.lessons, "active"],
    ["Bài tập chờ chấm", data.stats.pending, "active"],
    ["Nhận xét từ giảng viên", data.stats.feedback, "active"],
  ] as const;
  return (
    <section
      aria-label="Tổng quan học tập"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {entries.map(([label, value, tab]) => (
        <Card key={label}>
          <CardContent>
            <Link
              href={`/progress?tab=${tab}` as Route}
              className="block space-y-2 hover:text-primary"
            >
              <p className="font-display text-2xl font-semibold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </Link>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
function MyCourses({ courses }: { courses: LearnerCourse[] }) {
  return (
    <section className="space-y-4" aria-labelledby="my-courses">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-courses" className="text-lg font-semibold">
          Khoá học của tôi
        </h2>
        <Link
          href="/courses"
          className="text-sm font-medium text-primary hover:underline"
        >
          Tìm thêm khoá học
        </Link>
      </div>
      <ul className="space-y-3">
        {courses.map((c) => (
          <li key={c.id}>
            <Card>
              <CardContent className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 sm:flex sm:flex-wrap">
                <div className="w-16 shrink-0 overflow-hidden rounded-lg sm:w-20">
                  <CourseCover cover={c.cover} small />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Link
                    href={home(c)}
                    className="font-semibold hover:underline"
                  >
                    {c.title}
                  </Link>
                  {c.pathStatus === "none" ? (
                    <p className="text-sm text-muted-foreground">
                      Chưa thiết lập lộ trình
                    </p>
                  ) : (
                    <>
                      <LearningProgressBar
                        value={c.percent}
                        label={`Tiến độ khoá ${c.title}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {c.done}/{c.total} bài ·{" "}
                        {c.complete ? "Đã hoàn thành" : goal(c.goal)}
                      </p>
                    </>
                  )}
                  {c.hidden && (
                    <p className="text-xs text-muted-foreground">
                      Khoá học tạm ẩn — bạn vẫn có thể tiếp tục học.
                    </p>
                  )}
                </div>
                <Link
                  href={c.pathStatus === "none" ? start(c) : home(c)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "col-start-2 w-fit",
                  )}
                >
                  {c.pathStatus === "none"
                    ? "Bắt đầu"
                    : c.complete
                      ? "Xem lại"
                      : "Mở lộ trình"}
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
function Updates({ data }: { data: LearnerOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cập nhật cho bạn</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Link
          href="/progress"
          className="flex items-center gap-3 text-sm hover:text-primary"
        >
          <MessageSquare className="size-5 text-primary" />
          <span>
            <strong>{data.stats.answered}</strong> câu hỏi đã được trả lời
          </span>
        </Link>
        {data.latestFeedback ? (
          <section
            className="space-y-3 border-t pt-4"
            aria-labelledby="latest-feedback"
          >
            <h2 id="latest-feedback" className="font-semibold">
              Nhận xét mới nhất
            </h2>
            <p className="text-sm font-medium">
              {data.latestFeedback.lessonTitle} ·{" "}
              {number(data.latestFeedback.score)}/
              {number(data.latestFeedback.maxScore)}
            </p>
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {data.latestFeedback.text}
            </p>
            <Link
              href="/progress"
              className="text-sm font-medium text-primary hover:underline"
            >
              Xem tất cả nhận xét
            </Link>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nhận xét của giảng viên sẽ xuất hiện ở đây sau khi bài tập được
            chấm.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
function SkillBadges({ courses }: { courses: LearnerCourse[] }) {
  const skills = courses.flatMap((c) =>
    c.skills.map((s) => ({ ...s, course: c.title })),
  );
  if (!skills.length) return null;
  const earned = skills.filter((s) => s.level >= 3),
    learning = skills.filter((s) => s.level < 3);
  return (
    <section className="space-y-4" aria-labelledby="skill-badges">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="skill-badges"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Trophy className="size-5 text-primary" />
          Kỹ năng của bạn
        </h2>
        <Link href="/progress" className="text-sm font-medium text-primary">
          Xem mức thành thạo
        </Link>
      </div>
      {[
        { label: "Kỹ năng thành thạo", list: earned },
        { label: "Đang xây dựng", list: learning },
      ].map(
        (group) =>
          group.list.length > 0 && (
            <div key={group.label} className="space-y-2">
              <h3 className="text-sm font-medium">
                {group.label} · {group.list.length}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {group.list.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link
                      href="/progress"
                      title={`${s.name} · ${s.course}`}
                      className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm hover:bg-accent"
                    >
                      <span>{s.name}</span>
                      <MasteryChip level={s.level} />
                    </Link>
                  </li>
                ))}
              </ul>
              {group.list.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{group.list.length - 5} kỹ năng khác trong Tiến độ & kết quả
                </p>
              )}
            </div>
          ),
      )}
    </section>
  );
}
export function ProgressResults({
  data,
  tab,
}: {
  data: LearnerOverview;
  tab: "active" | "done";
}) {
  const list = data.courses.filter((c) =>
    tab === "done" ? c.complete : !c.complete,
  );
  return (
    <section className="space-y-4">
      <div
        role="tablist"
        aria-label="Trạng thái khoá học"
        className="flex gap-2"
      >
        {[
          { value: "active", label: "Đang học", count: data.stats.active },
          {
            value: "done",
            label: "Đã hoàn thành",
            count: data.stats.completed,
          },
        ].map((item) => (
          <Link
            key={item.value}
            role="tab"
            aria-selected={tab === item.value}
            href={
              `/progress${item.value === "done" ? "?tab=done" : ""}` as Route
            }
            className={buttonVariants({
              variant: tab === item.value ? "default" : "outline",
            })}
          >
            {item.label} <span>{item.count}</span>
          </Link>
        ))}
      </div>
      {list.length ? (
        list.map((c, index) => (
          <details key={`${tab}:${c.id}`} open={index === 0} className="group">
            <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-4 rounded-lg border bg-card p-4 marker:hidden">
              <span className="min-w-0 flex-1 space-y-1">
                <strong className="block">{c.title}</strong>
                <span className="block text-xs text-muted-foreground">
                  {c.done}/{c.total} bài · {goal(c.goal)} · {c.percent}%
                </span>
              </span>
              <span className="w-28">
                <LearningProgressBar
                  value={c.percent}
                  label={`Tiến độ ${c.title}`}
                />
              </span>
              <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <Card className="mt-2">
              <CardContent className="min-w-0 space-y-5">
                {c.skills.length > 0 && (
                  <section
                    className="space-y-3"
                    aria-label={`Mức thành thạo ${c.title}`}
                  >
                    <h2 className="font-semibold">
                      Mức thành thạo theo khái niệm
                    </h2>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {c.skills.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>{s.name}</span>
                          <MasteryChip level={s.level} />
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={
                        `/insights/knowledge-map?course=${encodeURIComponent(c.id)}` as Route
                      }
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                    >
                      Xem bản đồ kiến thức
                    </Link>
                  </section>
                )}
                <div
                  className="max-w-full overflow-x-auto"
                  role="region"
                  aria-label={`Kết quả bài học ${c.title}`}
                  tabIndex={0}
                >
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <caption className="sr-only">
                      Điểm và nhận xét từng bài của {c.title}. Quiz và code tính
                      lần nộp gần nhất.
                    </caption>
                    <thead className="border-b bg-muted/50">
                      <tr>
                        {[
                          "Bài học",
                          "Trạng thái",
                          "Quiz",
                          "Bài tập",
                          "Code",
                        ].map((label) => (
                          <th
                            key={label}
                            scope="col"
                            className="px-3 py-3 font-semibold"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.lessons.map((l) => (
                        <tr key={l.id} className="border-b last:border-b-0">
                          <th
                            scope="row"
                            className="min-w-40 px-3 py-4 align-top font-medium"
                          >
                            {l.status === "locked" ? (
                              <>
                                <span>{l.title}</span>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Cần học trước: {l.lock}
                                </p>
                              </>
                            ) : (
                              <Link
                                href={`${home(c)}/${l.id}` as Route}
                                className="text-primary hover:underline"
                              >
                                {l.title}
                              </Link>
                            )}
                          </th>
                          <td className="px-3 py-4 align-top">
                            <span
                              className={
                                l.status === "done"
                                  ? "inline-flex items-center gap-1 text-success"
                                  : "text-muted-foreground"
                              }
                            >
                              {l.status === "done" && (
                                <Check className="size-4" />
                              )}
                              {l.status === "done"
                                ? "Hoàn thành"
                                : l.status === "locked"
                                  ? "Bị khoá"
                                  : "Chưa hoàn thành"}
                            </span>
                          </td>
                          {(["quiz", "assignment", "coding"] as const).map(
                            (type) => (
                              <td
                                key={type}
                                className="min-w-32 px-3 py-4 align-top"
                              >
                                {l.results.some((r) => r.type === type) ? (
                                  l.results
                                    .filter((r) => r.type === type)
                                    .map((r) => (
                                      <ResultCell key={r.id} result={r} />
                                    ))
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!c.lessons.length && (
                  <p className="text-sm text-muted-foreground">
                    Chưa có bài học được xuất bản trong khoá học này.
                  </p>
                )}
                <Link
                  href={home(c)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Mở lộ trình
                </Link>
              </CardContent>
            </Card>
          </details>
        ))
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <GraduationCap className="size-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {tab === "done"
                ? "Chưa có khoá học hoàn thành"
                : "Chưa có khoá học đang học"}
            </h2>
            <p className="text-muted-foreground">
              {tab === "done"
                ? "Khoá học bạn hoàn thành sẽ xuất hiện ở đây."
                : "Đăng ký một khoá học để bắt đầu."}
            </p>
            <Link href="/courses" className={buttonVariants()}>
              Khám phá khoá học
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
function ResultCell({ result: r }: { result: LearnerResult }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{r.title}</p>
      {r.status === "graded" ? (
        <>
          <p
            className={
              r.type === "assignment"
                ? "font-semibold"
                : r.passed
                  ? "font-semibold text-success"
                  : "font-semibold text-warning"
            }
          >
            {r.type === "assignment"
              ? `${number(r.score!)}/${number(r.maxScore)}`
              : `${r.percent}% · ${r.passed ? "Đạt" : "Chưa đạt"}`}
          </p>
          {r.feedback && (
            <p className="max-w-sm whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {r.feedback}
            </p>
          )}
        </>
      ) : (
        <p
          className={
            r.status === "pending" ? "text-warning" : "text-muted-foreground"
          }
        >
          {r.status === "pending"
            ? "Chờ chấm"
            : r.status === "draft"
              ? "Đang làm · chưa nộp"
              : r.type === "assignment"
                ? "Chưa nộp"
                : "Chưa làm"}
        </p>
      )}
    </div>
  );
}
