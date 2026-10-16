"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { BookOpen, LoaderCircle, Map, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { GOAL_LABELS } from "@/lib/onboarding-contract";
import {
  type CoursePathView,
  type LearningPathCommand,
} from "@/lib/learning-path-contract";
import { useDiagnosticCardDismissal } from "@/lib/use-diagnostic-card-dismissal";
import KnowledgeMap from "@/components/knowledge-map";

import {
  CourseOverview,
  DiagnosticPrompt,
  PathUpdateNotice,
  CourseCompletion,
  LessonPath,
  ReviewForm,
} from "./course-home-sections";

export default function CourseHome({
  courseId,
  dismissalScope,
}: {
  courseId: string;
  dismissalScope: string;
}) {
  const router = useRouter();
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/path`;
  const onboarding =
    `/learn/${encodeURIComponent(courseId)}/onboarding` as Route;
  const [data, setData] = useState<CoursePathView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewInitial, setReviewInitial] = useState<number | null>(null);
  const [map, setMap] = useState(false);
  const diagnosticCard = useDiagnosticCardDismissal(dismissalScope, courseId);
  const ack = useRef<number | null>(null);
  const mutating = useRef(false);
  const started = useRef(Date.now());
  const lessonUrl = (id: string) =>
    `/learn/${encodeURIComponent(courseId)}/${encodeURIComponent(id)}` as Route;
  const accept = (body: CoursePathView) =>
    setData((previous) => ({
      ...body,
      highlights:
        previous?.pathId === body.pathId
          ? previous.highlights
          : body.highlights,
    }));

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sync" }),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Không thể tải lộ trình.");
        if (!controller.signal.aborted) {
          accept(body);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Không thể tải lộ trình.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, refresh]);

  useEffect(() => {
    if (error || !data || (data.status !== "generating" && !data.updating))
      return;
    const timer = setTimeout(() => setRefresh((n) => n + 1), 2500);
    return () => clearTimeout(timer);
  }, [data, error]);
  useEffect(() => {
    if (!data?.pathId || !data.highlights.length || ack.current === data.pathId)
      return;
    ack.current = data.pathId;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ack-highlights", pathId: data.pathId }),
    })
      .then((response) => {
        if (!response.ok) ack.current = null;
      })
      .catch(() => {
        ack.current = null;
      });
  }, [data, endpoint]);

  async function send(command: LearningPathCommand) {
    if (mutating.current) throw new Error("Vui lòng chờ thao tác hiện tại.");
    mutating.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Không thể lưu thay đổi.");
      accept(body);
      setError(null);
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function run(command: LearningPathCommand) {
    try {
      await send(command);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể lưu thay đổi.",
      );
    }
  }
  async function openOnboarding(type: "goal-edit" | "diagnostic-retake") {
    if (type === "goal-edit" && data?.goalEditing) {
      router.push(onboarding);
      return;
    }
    const response = await fetch(
      `/api/learn/${encodeURIComponent(courseId)}/onboarding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Không thể mở thiết lập.");
    router.push(onboarding);
  }
  if (loading)
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-6" role="status">
        <LoaderCircle className="animate-spin" /> Đang tải lộ trình…
      </main>
    );
  const errorAlert = error && (
    <Alert variant="destructive">
      <AlertTitle>Không thể cập nhật lộ trình</AlertTitle>
      <AlertDescription>
        {error}
        <Button
          variant="outline"
          onClick={() => {
            setLoading(!data);
            setRefresh((n) => n + 1);
          }}
        >
          Thử lại
        </Button>
      </AlertDescription>
    </Alert>
  );
  if (!data) return <main className="mx-auto max-w-2xl p-6">{errorAlert}</main>;
  if (data.status === "none")
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">{data.course.title}</h1>
        {errorAlert}
        <Card>
          <CardContent className="space-y-4 py-6">
            <h2 className="text-xl font-semibold">
              Hãy thiết lập lộ trình học của bạn
            </h2>
            <p className="text-muted-foreground">
              Đặt mục tiêu và chọn học từ bài 1 hoặc tìm điểm bắt đầu phù hợp
              với bạn.
            </p>
            <Link className={buttonVariants()} href={onboarding}>
              Bắt đầu thiết lập
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  if (data.status === "generating")
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">{data.course.title}</h1>
        {errorAlert}
        <Card>
          <CardContent
            className="space-y-4 py-6"
            role="status"
            aria-live="polite"
          >
            <p className="flex items-center gap-3 font-semibold">
              <LoaderCircle className="size-5 shrink-0 animate-spin" /> Codi
              đang xếp lộ trình cho bạn…
            </p>
            <ol className="list-inside list-decimal space-y-3 text-muted-foreground">
              <li>Phân tích kết quả bài kiểm tra đầu vào</li>
              <li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li>
              <li>Ước lượng thời gian theo mục tiêu của bạn</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.
            </p>
            {Date.now() - started.current > 30_000 && (
              <Alert>
                <AlertTitle>Tác vụ đang được khôi phục</AlertTitle>
                <AlertDescription>
                  Nếu kết nối bị ngắt, Codi sẽ tiếp tục từ yêu cầu đã lưu. Khi
                  AI không phản hồi, bạn sẽ nhận thứ tự mặc định.
                  <Button
                    variant="outline"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    Kiểm tra lại
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    );
  const current = data.rows.find((r) => r.id === data.currentLessonId);
  const goal =
    data.goal && data.goal in GOAL_LABELS
      ? GOAL_LABELS[data.goal as keyof typeof GOAL_LABELS]
      : "Chưa đặt mục tiêu";
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <nav className="text-sm text-muted-foreground" aria-label="Đường dẫn">
        <Link href="/dashboard">Bàn làm việc</Link> / {data.course.title}
      </nav>
      {errorAlert}
      <CourseOverview
        data={data}
        goal={goal}
        current={current}
        lessonUrl={lessonUrl}
        onEditGoal={() => setEditing(true)}
        onReview={() => {
          setReviewInitial(null);
          setReviewing(true);
        }}
      />
      {data.status === "failed" && (
        <Alert variant="warning">
          <AlertTitle>Lộ trình cá nhân hoá chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc
            định của khoá học.
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                started.current = Date.now();
                void run({ type: "retry" });
              }}
            >
              <RefreshCw className="size-4" /> Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data.showDiagnosticCard && !diagnosticCard.dismissed && (
        <DiagnosticPrompt
          busy={busy}
          onDismiss={diagnosticCard.dismiss}
          onStart={() =>
            void openOnboarding("diagnostic-retake").catch((cause: Error) =>
              setError(cause.message),
            )
          }
        />
      )}
      {data.source === "ai" && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-1 size-4 shrink-0" />
          <span>
            AI dùng mục tiêu và mức thành thạo BKT để xếp thứ tự; điều kiện tiên
            quyết luôn áp dụng. AI có thể sai. Mỗi bài có giải thích “Vì sao?”.{" "}
            {data.rationale}
          </span>
        </p>
      )}
      {data.updating && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" /> Codi đang cập nhật
          các bài chưa hoàn thành…
        </p>
      )}
      {data.update && (
        <PathUpdateNotice
          data={data}
          current={current}
          busy={busy}
          lessonUrl={lessonUrl}
          onDismiss={() =>
            void run({ type: "dismiss-update", pathId: data.pathId! })
          }
        />
      )}
      {data.complete && (
        <CourseCompletion
          data={data}
          onReview={(rating) => {
            setReviewInitial(rating);
            setReviewing(true);
          }}
        />
      )}
      <div
        role="group"
        aria-label="Nội dung khoá học"
        className="flex flex-wrap gap-2"
      >
        <Button
          aria-pressed={!map}
          variant={map ? "outline" : "default"}
          onClick={() => setMap(false)}
        >
          <BookOpen className="size-4" /> Lộ trình học
        </Button>
        <Button
          aria-pressed={map}
          variant={map ? "default" : "outline"}
          onClick={() => setMap(true)}
        >
          <Map className="size-4" /> Bản đồ kiến thức
        </Button>
      </div>
      {map ? (
        <KnowledgeMap initialCourseId={courseId} embedded />
      ) : (
        <LessonPath data={data} lessonUrl={lessonUrl} />
      )}
      <ConfirmDialog
        open={editing}
        onOpenChange={setEditing}
        title="Chỉnh mục tiêu học tập?"
        consequence="Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên."
        reversible="Bạn có thể chỉnh lại mục tiêu bất cứ lúc nào."
        confirmLabel="Chỉnh mục tiêu"
        onConfirm={() => openOnboarding("goal-edit")}
      />
      {reviewing && (
        <ReviewForm
          initialRating={reviewInitial}
          data={data}
          open={reviewing}
          onOpenChange={setReviewing}
          save={async (rating, text) => {
            await send({ type: "review", rating, text });
            toast.success("Đã lưu đánh giá khoá học.");
          }}
        />
      )}
    </main>
  );
}

export { ReviewForm } from "./course-home-sections";
