"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
  List,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Star,
} from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import { toast } from "sonner";
import LessonMaterialView from "@/components/lesson-material-view";
import LessonMarkdown from "@/components/lesson-markdown";
import LessonAssessment from "@/components/lesson-assessment";
import LessonCoding from "@/components/lesson-coding";
import LessonTutorial from "@/components/lesson-tutorial";
import { LESSON_KIND_LABELS } from "@/lib/lesson-kind";
import {
  LESSON_PATH_LABELS,
  type CoursePathView,
} from "@/lib/learning-path-contract";
import type {
  LessonPlayerCommand,
  LessonPlayerView,
  LessonMediaUpdate,
} from "@/lib/lesson-player-contract";
import { readLessonResponse } from "@/lib/lesson-player-http";
import { ReviewForm } from "../course-home";
import { LessonQAPanel } from "@/components/tutor/lesson-qa-panel";
import {
  TutorBridgeContext,
  type TutorBridge,
  type TutorCodeBridge,
  type TutorOpenRequest,
} from "@/components/ai-tutor/tutor-bridge";
import TutorPanel from "@/components/ai-tutor/tutor-panel";
import { TutorLauncher } from "@/components/ai-tutor/tutor-launcher";
import TutorSelectionToolbar from "@/components/ai-tutor/tutor-selection-toolbar";

// Remembered per browser tab so the panel stays open while the learner moves between lessons.
const TUTOR_OPEN_KEY = "codi:tutor-open";
function rememberTutor(open: boolean) {
  try {
    if (open) sessionStorage.setItem(TUTOR_OPEN_KEY, "1");
    else sessionStorage.removeItem(TUTOR_OPEN_KEY);
  } catch {
    /* storage unavailable: the panel just starts closed next lesson */
  }
}

export default function LessonPlayer({
  courseId,
  lessonId,
  viewerName = null,
  initialTutor,
}: {
  courseId: string;
  lessonId: string;
  /** Signed-in learner's name, for the tutor greeting. */
  viewerName?: string | null;
  /** Opens the tutor at mount (lab screens only): the launcher popup, or the panel with an optional first question. */
  initialTutor?: { mode: "popup" } | { mode: "panel"; ask?: string };
}) {
  const [data, setData] = useState<LessonPlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const mounted = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const codeBridge = useRef<TutorCodeBridge | null>(null);
  const [codeVersion, setCodeVersion] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(initialTutor?.mode === "panel");
  const [launcherOpen, setLauncherOpen] = useState(initialTutor?.mode === "popup");
  const [tutorRequest, setTutorRequest] = useState<
    (TutorOpenRequest & { id: number }) | null
  >(() =>
    initialTutor?.mode === "panel" && initialTutor.ask
      ? { id: 1, ask: initialTutor.ask }
      : null,
  );
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(TUTOR_OPEN_KEY)) setTutorOpen(true);
    } catch {
      /* storage unavailable */
    }
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const toggleTutor = (open: boolean) => {
    setTutorOpen(open);
    rememberTutor(open);
  };
  const tutor = useMemo<TutorBridge>(
    () => ({
      open: (request = {}) => {
        setTutorRequest({ ...request, id: Date.now() });
        setTutorOpen(true);
        rememberTutor(true);
      },
      registerCode: (bridge) => {
        codeBridge.current = bridge;
        setCodeVersion((version) => version + 1);
      },
    }),
    [],
  );
  const courseHome = `/learn/${encodeURIComponent(courseId)}` as Route;
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
  const lessonUrl = (id: string) =>
    `${courseHome}/${encodeURIComponent(id)}` as Route;

  const send = useCallback(
    (command: LessonPlayerCommand) => {
      revision.current++;
      // Serialize media saves and completion: a slow response cannot overwrite newer progress.
      const job = queue.current.then(async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
          keepalive: true,
        });
        const body = await readLessonResponse<
          LessonPlayerView | LessonMediaUpdate
        >(response, "Không thể lưu tiến độ bài học. Vui lòng thử lại.");
        if (mounted.current) {
          if ("kind" in body)
            setData((previous) =>
              previous
                ? {
                    ...previous,
                    ...body,
                    checklist: previous.checklist.map((item) =>
                      item.key === "study"
                        ? {
                            ...item,
                            done: body.studied,
                            note: body.studied
                              ? "Đã học xong nội dung"
                              : item.note,
                          }
                        : item,
                    ),
                  }
                : previous,
            );
          else {
            setData(body);
            setError(null);
          }
        }
      });
      queue.current = job.catch((cause: unknown) => {
        if (
          mounted.current &&
          command.type !== "video" &&
          command.type !== "pdf-page"
        )
          setError(
            cause instanceof Error
              ? cause.message
              : "Không thể lưu tiến độ bài học.",
          );
      });
      return job;
    },
    [endpoint],
  );

  useEffect(() => {
    mounted.current = true;
    void send({ type: "open" }).catch(() => {});
    const refresh = () => {
      const before = revision.current;
      void queue.current
        .then(async () => {
          const response = await fetch(endpoint, { cache: "no-store" });
          const body = await readLessonResponse<LessonPlayerView>(
            response,
            "Chưa thể tải cập nhật bài học.",
          );
          if (mounted.current && before === revision.current) setData(body);
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", refresh);
    };
  }, [send, endpoint]);
  useEffect(() => {
    if (!data?.path.updating) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      const before = revision.current;
      void fetch(endpoint, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const body = await readLessonResponse<LessonPlayerView>(
            response,
            "Chưa thể tải cập nhật lộ trình.",
          );
          if (!controller.signal.aborted && before === revision.current)
            setData(body);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error ? cause.message : "Chưa thể tải cập nhật.",
            );
        });
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [data?.path.updating, endpoint]);

  async function complete() {
    if (busy) return;
    setBusy(true);
    try {
      await send({ type: "complete" });
      toast.success("Đã hoàn thành bài học.");
      heading.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* send renders the server failure inline */
    } finally {
      setBusy(false);
    }
  }
  const saveMedia = useCallback(
    async (command: LessonPlayerCommand) => {
      await send(command);
    },
    [send],
  );
  async function pathCommand(command: object) {
    const response = await fetch(
      `/api/learn/${encodeURIComponent(courseId)}/path`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      },
    );
    const body = await readLessonResponse<CoursePathView>(
      response,
      "Không thể cập nhật khoá học.",
    );
    setData((previous) => (previous ? { ...previous, path: body } : previous));
  }
  const errorAlert = error && (
    <Alert variant="destructive">
      <AlertTitle>Chưa thể tải hoặc lưu tiến độ</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button
        className="mt-3"
        variant="outline"
        disabled={busy}
        onClick={() => void send({ type: "open" }).catch(() => {})}
      >
        Thử lại
      </Button>
    </Alert>
  );
  if (!data)
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        {errorAlert}
        {!error && (
          <p
            role="status"
            className="flex items-center gap-3 text-muted-foreground"
          >
            <LoaderCircle className="size-5 animate-spin" />
            Đang tải bài học…
          </p>
        )}
        <Link
          className="inline-flex min-h-11 items-center text-primary underline"
          href={courseHome}
        >
          Về lộ trình
        </Link>
      </main>
    );

  const path = data.path;
  const index = path.rows.findIndex((row) => row.id === lessonId);
  const prev = path.rows[index - 1];
  const next = path.rows[index + 1];
  const current = path.rows.find((row) => row.id === path.currentLessonId);
  const isCode = data.checklist.some((item) => item.key === "code");
  const kind =
    path.rows.find((row) => row.id === lessonId)?.kind ??
    (isCode ? "coding" : materialKind(data.materials));
  const missing = data.checklist.filter((item) => !item.done);
  const material =
    data.materials.find((item) => item.id === materialId) ?? data.materials[0];
  const materialContent = (
    <>
      {data.materials.length > 1 && (
        <div className="space-y-2">
          <label htmlFor="lesson-material" className="text-sm font-medium">
            Tài liệu bài học
          </label>
          <select
            id="lesson-material"
            className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
            value={material?.id}
            onChange={(event) => setMaterialId(Number(event.target.value))}
          >
            {data.materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {material && (
        <LessonMaterialView
          key={material.id}
          material={material}
          progress={
            data.media[String(material.id)] ??
            (material.type === "video" &&
            material.id ===
              data.materials.find((item) => item.type === "video")?.id
              ? { seconds: data.positionSeconds }
              : undefined)
          }
          save={saveMedia}
        />
      )}
    </>
  );
  const lessons = (
    <LessonList
      path={path}
      lessonId={lessonId}
      close={() => setSidebar(false)}
    />
  );
  const update = path.update?.afterLessonId === lessonId ? path.update : null;

  const docked = tutorOpen && wide;
  return (
    <TutorBridgeContext.Provider value={tutor}>
    <main
      className={cn(
        "grid w-full min-w-0 gap-6 p-4 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-0 lg:p-0",
        docked && "xl:grid-cols-[18.5rem_minmax(0,1fr)_24rem]",
      )}
    >
      <aside
        className="hidden min-w-0 space-y-2 self-start border-r px-3 py-2 lg:sticky lg:top-16 lg:block lg:max-h-[calc(100svh-4rem)] lg:overflow-y-auto"
        aria-label="Lộ trình bài học"
      >
        <Link
          href={courseHome}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"
        >
          <ArrowLeft className="size-4" />
          Về lộ trình
        </Link>
        <h2 className="font-semibold">{path.course.title}</h2>
        <div
          role="progressbar"
          aria-label="Tiến độ khoá học"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={path.percent}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${path.percent}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {path.done}/{path.total} bài
        </p>
        {lessons}
      </aside>
      <div ref={content} className="min-w-0 space-y-6 lg:px-6 lg:pb-6">
        <nav
          aria-label="Điều hướng bài học"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b bg-background py-3"
        >
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setSidebar(true)}
          >
            <List className="size-4" />
            Danh sách bài học
          </Button>
          {prev && (
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href={lessonUrl(prev.id)}
            >
              <ArrowLeft className="size-4" />
              Bài trước
            </Link>
          )}
          {next && (
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href={lessonUrl(next.id)}
            >
              Bài sau
              <ArrowRight className="size-4" />
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={tutorOpen ? "secondary" : "outline"}
              aria-pressed={tutorOpen}
              onClick={() => {
                const next = !tutorOpen;
                toggleTutor(next);
                if (next) setQaOpen(false);
              }}
            >
              <Sparkles className="size-4" />
              AI trợ lý
            </Button>
            <Button
              variant={qaOpen ? "secondary" : "outline"}
              aria-pressed={qaOpen}
              onClick={() => {
                const next = !qaOpen;
                setQaOpen(next);
                if (next) toggleTutor(false);
              }}
            >
              <MessageCircle className="size-4" />
              Hỏi đáp
            </Button>
          </div>
        </nav>
        {errorAlert}
        <div className="space-y-2 lg:hidden">
          <progress
            aria-label="Tiến độ khoá học"
            max={100}
            value={path.percent}
            className="h-2 w-full accent-primary"
          />
          <p className="text-sm text-muted-foreground">
            {path.done}/{path.total} bài · {path.percent}%
          </p>
        </div>
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {[
              data.lesson.chapterTitle,
              LESSON_KIND_LABELS[kind],
              `${Math.ceil(data.lesson.durationSeconds / 60)} phút`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="font-display text-xl font-semibold outline-none sm:text-2xl"
          >
            {data.lesson.title}
          </h1>
          {data.lesson.description && (
            <p className="text-muted-foreground">{data.lesson.description}</p>
          )}
        </header>
        {data.completed && (
          <Card className="border-success">
            <CardContent className="space-y-4 py-5" aria-live="polite">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-success">
                <CheckCircle2 className="size-6" />
                Đã hoàn thành bài học
              </h2>
              {path.updating ? (
                <p role="status">
                  Codi đang cập nhật lộ trình. Bạn có thể tiếp tục học hoặc quay
                  lại kiểm tra sau.
                  <Button
                    variant="link"
                    onClick={() => void send({ type: "open" }).catch(() => {})}
                  >
                    Kiểm tra lại
                  </Button>
                </p>
              ) : update ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Lộ trình đã được cập nhật</h3>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void pathCommand({
                          type: "dismiss-update",
                          pathId: path.pathId,
                        }).catch((cause: Error) => setError(cause.message))
                      }
                    >
                      Ẩn thông báo
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {update.message}
                  </p>
                  <ul className="list-inside list-disc space-y-2 text-sm">
                    {update.changes.map((change) => (
                      <li key={`${change.type}:${change.lessonId}`}>
                        {change.text}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {current && !path.complete && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Bài tiếp theo
                    </p>
                    <strong>{current.title}</strong>
                  </div>
                  <Link
                    className={buttonVariants()}
                    href={lessonUrl(current.id)}
                  >
                    Học tiếp
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {path.complete && (
          <Card className="border-success">
            <CardContent className="space-y-4 py-6">
              <h2 className="flex items-start gap-3 text-xl font-semibold">
                <GraduationCap className="size-7 shrink-0 text-success" />
                Chúc mừng! Bạn đã hoàn thành khoá học
              </h2>
              <p>Bạn thấy khoá học thế nào?</p>
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Đánh giá khoá học"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    variant="ghost"
                    size="icon"
                    aria-label={`${n} sao`}
                    onClick={() => {
                      setRating(n);
                      setReviewing(true);
                    }}
                  >
                    <Star
                      className={cn(
                        "size-6 text-star",
                        path.review &&
                          n <= path.review.rating &&
                          "fill-current",
                      )}
                    />
                  </Button>
                ))}
              </div>
              {path.review && (
                <p className="text-sm text-muted-foreground">
                  Bạn đã đánh giá {path.review.rating}/5.
                </p>
              )}
              {path.recommendation && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Khoá học gợi ý tiếp theo
                  </p>
                  <strong className="block">{path.recommendation.title}</strong>
                  <Link
                    className={buttonVariants({ variant: "outline" })}
                    href={
                      `/courses/${encodeURIComponent(path.recommendation.slug)}` as Route
                    }
                  >
                    Xem khoá học
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {!isCode && materialContent}
        {data.lesson.body && !isCode ? (
          <Card>
            <CardContent className="space-y-3 py-6">
              <h2 className="flex items-center gap-2 font-semibold">
                <BookOpen className="size-5" />
                {material ? "Tóm tắt bài học (bài đọc)" : "Nội dung bài học"}
              </h2>
              <LessonMarkdown>{data.lesson.body}</LessonMarkdown>
            </CardContent>
          </Card>
        ) : (
          !material &&
          !isCode && (
            <Alert>
              <AlertTitle>Chưa có nội dung bài học</AlertTitle>
              <AlertDescription>
                Bài học chưa có tài liệu hoặc bài đọc.
              </AlertDescription>
            </Alert>
          )
        )}
        {!data.checklist.some((item) => item.key === "code") && (
          <div>
            {data.studied ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="size-5" />
                Đã học xong nội dung
              </p>
            ) : (
              <Button
                variant="outline"
                disabled={busy || (!data.lesson.body && !material)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await send({ type: "study" });
                    toast.success("Đã đánh dấu học xong nội dung.");
                  } catch {
                    /* inline error */
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <CheckCircle2 className="size-4" />
                Đánh dấu đã học xong
              </Button>
            )}
          </div>
        )}
        {data.checklist
          .filter((item) => item.key === "code")
          .map((item) =>
            item.tutorial ? (
              <LessonTutorial
                key={item.assessmentId}
                endpoint={`${endpoint}/assessments/${item.assessmentId}/tutorial`}
                onChanged={() => send({ type: "open" })}
              />
            ) : (
              <LessonCoding
                key={item.assessmentId}
                endpoint={`${endpoint}/assessments/${item.assessmentId}/coding`}
                onChanged={() => send({ type: "open" })}
              />
            ),
          )}
        {isCode && material && (
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Tài liệu tham khảo của bài học
            </summary>
            <div className="mt-4 space-y-4">{materialContent}</div>
          </details>
        )}
        {data.checklist
          .filter((item) => item.key === "quiz" || item.key === "assignment")
          .map((item) => (
            <LessonAssessment
              key={item.assessmentId}
              endpoint={`${endpoint}/assessments/${item.assessmentId}`}
              onChanged={() => send({ type: "open" })}
            />
          ))}
        <Card id="checklist">
          <CardContent className="space-y-5 py-6">
            <h2 className="text-lg font-semibold">Để hoàn thành bài học</h2>
            <ol className="space-y-4">
              {data.checklist.map((item) => (
                <li
                  key={`${item.key}:${item.assessmentId ?? "study"}`}
                  className="flex items-start gap-3"
                >
                  {item.done ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-success"
                    />
                  ) : (
                    <Circle
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    />
                  )}
                  <div>
                    <p className="font-medium">
                      {item.label}
                      <span className="sr-only">
                        {item.done ? ": đã xong" : ": chưa xong"}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{item.note}</p>
                  </div>
                </li>
              ))}
            </ol>
            {data.completed ? (
              <p className="font-medium text-success">Đã hoàn thành bài học</p>
            ) : (
              <div className="sticky bottom-0 space-y-3 border-t bg-card py-4">
                <Button
                  className="min-h-11 min-w-52"
                  disabled={busy || !!missing.length}
                  onClick={() => void complete()}
                >
                  {busy && <LoaderCircle className="size-4 animate-spin" />}Hoàn
                  thành bài học
                </Button>
                <p
                  className={cn(
                    "text-sm",
                    missing.length ? "text-muted-foreground" : "text-success",
                  )}
                >
                  {missing.length
                    ? `Còn thiếu: ${missing.map((item) => item.label).join(", ")}`
                    : "Bạn đã đủ điều kiện hoàn thành bài học."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Button
          variant="outline"
          onClick={() => {
            setRating(null);
            setReviewing(true);
          }}
        >
          {path.review ? "Sửa đánh giá" : "Đánh giá khóa học"}
        </Button>
      </div>
      {tutorOpen && (
        <TutorPanel
          endpoint={`${endpoint}/tutor`}
          request={tutorRequest}
          code={codeBridge}
          codeVersion={codeVersion}
          docked={wide}
          onClose={() => toggleTutor(false)}
          expandHref={
            `/learn/${encodeURIComponent(courseId)}/tutor?lesson=${encodeURIComponent(lessonId)}` as Route
          }
        />
      )}
      {!tutorOpen && !qaOpen && (
        <TutorLauncher
          endpoint={`${endpoint}/tutor`}
          viewerName={viewerName}
          open={launcherOpen}
          onOpenChange={setLauncherOpen}
          onAsk={(ask) => {
            tutor.open(ask ? { ask } : {});
            setLauncherOpen(false);
          }}
        />
      )}
      <TutorSelectionToolbar root={content} />
      <Sheet
        open={sidebar}
        onOpenChange={setSidebar}
        title="Danh sách bài học"
        description={`${path.course.title} · ${path.done}/${path.total} bài`}
      >
        <Link
          href={courseHome}
          className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
          onClick={() => setSidebar(false)}
        >
          <ArrowLeft className="size-4" />
          Về lộ trình
        </Link>
        {lessons}
      </Sheet>
      {reviewing && (
        <ReviewForm
          data={path}
          initialRating={rating}
          open={reviewing}
          onOpenChange={setReviewing}
          save={async (stars, text) => {
            await pathCommand({ type: "review", rating: stars, text });
            toast.success("Đã lưu đánh giá khoá học.");
          }}
        />
      )}
      <LessonQAPanel
        open={qaOpen}
        onOpenChange={setQaOpen}
        courseId={courseId}
        lessonId={lessonId}
        lessonTitle={data.lesson.title}
      />
    </main>
    </TutorBridgeContext.Provider>
  );
}

function LessonList({
  path,
  lessonId,
  close,
}: {
  path: CoursePathView;
  lessonId: string;
  close: () => void;
}) {
  return (
    <ol className="space-y-1 border-t pt-3">
      {path.rows.map((row, index) => (
        <li
          key={row.id}
          className={cn("rounded-lg px-3 py-2", row.id === lessonId && "bg-accent")}
        >
          <div className="flex items-start gap-2">
            {row.status === "done" ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-success"
              />
            ) : row.status === "locked" ? (
              <LockKeyhole
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-muted-foreground"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {index + 1}.
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                href={
                  `/learn/${encodeURIComponent(path.course.id)}/${encodeURIComponent(row.id)}` as Route
                }
                aria-current={row.id === lessonId ? "page" : undefined}
                onClick={close}
                className="block min-w-0 break-words text-sm leading-relaxed hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row.title}
              </Link>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {LESSON_KIND_LABELS[row.kind ?? "reading"]} ·{" "}
                {Math.ceil(row.durationSeconds / 60)} phút
                {row.status === "skippable" && " · có thể bỏ qua"}
              </p>
              <span className="sr-only">{LESSON_PATH_LABELS[row.status]}</span>
            </div>
          </div>
          {row.lock && row.status !== "done" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Cần học trước: {row.lock.concept}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function materialKind(
  materials: LessonPlayerView["materials"],
): "video" | "pdf" | "reading" {
  return materials.some((m) => m.type === "video")
    ? "video"
    : materials.some((m) => m.type === "pdf" || m.type === "slide")
      ? "pdf"
      : "reading";
}
