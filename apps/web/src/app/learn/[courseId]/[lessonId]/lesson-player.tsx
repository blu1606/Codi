"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, GraduationCap, List, LoaderCircle, LockKeyhole, Star } from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import { toast } from "sonner";
import LessonMaterialView from "@/components/lesson-material-view";
import { LESSON_PATH_LABELS, type CoursePathView } from "@/lib/learning-path-contract";
import type { LessonPlayerCommand, LessonPlayerView } from "@/lib/lesson-player-contract";
import { ReviewForm } from "../course-home";

export default function LessonPlayer({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const [data, setData] = useState<LessonPlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const mounted = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const courseHome = `/learn/${encodeURIComponent(courseId)}` as Route;
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
  const lessonUrl = (id: string) => `${courseHome}/${encodeURIComponent(id)}` as Route;

  const send = useCallback((command: LessonPlayerCommand) => {
    revision.current++;
    // Serialize media saves and completion: a slow response cannot overwrite newer progress.
    const job = queue.current.then(async () => {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), keepalive: true });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể lưu tiến độ bài học.");
      if (mounted.current) { setData(body); setError(null); }
    });
    queue.current = job.catch((cause: unknown) => { if (mounted.current) setError(cause instanceof Error ? cause.message : "Không thể lưu tiến độ bài học."); });
    return job;
  }, [endpoint]);

  useEffect(() => {
    mounted.current = true;
    void send({ type: "open" }).catch(() => {});
    const refresh = () => { void send({ type: "open" }).catch(() => {}); };
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; window.removeEventListener("focus", refresh); };
  }, [send]);
  useEffect(() => {
    if (!data?.path.updating) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      const before = revision.current;
      void fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Chưa thể tải cập nhật lộ trình.");
        if (!controller.signal.aborted && before === revision.current) setData(body);
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Chưa thể tải cập nhật."); });
    }, 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [data?.path.updating, endpoint]);

  async function complete() {
    if (busy) return;
    setBusy(true);
    try { await send({ type: "complete" }); toast.success("Đã hoàn thành bài học."); heading.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch { /* send renders the server failure inline */ }
    finally { setBusy(false); }
  }
  const saveMedia = useCallback(async (command: LessonPlayerCommand) => { await send(command).catch(() => {}); }, [send]);
  async function pathCommand(command: object) {
    const response = await fetch(`/api/learn/${encodeURIComponent(courseId)}/path`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Không thể cập nhật khoá học.");
    setData((previous) => previous ? { ...previous, path: body } : previous);
  }
  const errorAlert = error && <Alert variant="destructive"><AlertTitle>Chưa thể tải hoặc lưu tiến độ</AlertTitle><AlertDescription>{error}</AlertDescription><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void send({ type: "open" }).catch(() => {})}>Thử lại</Button></Alert>;
  if (!data) return <main className="mx-auto max-w-3xl space-y-4 p-6">{errorAlert}{!error && <p role="status" className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Đang tải bài học…</p>}<Link className="inline-flex min-h-11 items-center text-primary underline" href={courseHome}>Về lộ trình</Link></main>;

  const path = data.path;
  const index = path.rows.findIndex((row) => row.id === lessonId);
  const prev = path.rows[index - 1];
  const next = path.rows[index + 1];
  const current = path.rows.find((row) => row.id === path.currentLessonId);
  const missing = data.checklist.filter((item) => !item.done);
  const material = data.materials.find((item) => item.id === materialId) ?? data.materials[0];
  const lessons = <LessonList path={path} lessonId={lessonId} close={() => setSidebar(false)} />;
  const update = path.update?.afterLessonId === lessonId ? path.update : null;

  return <main className="mx-auto grid w-full max-w-7xl gap-6 p-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:p-6">
    <aside className="hidden min-w-0 space-y-4 self-start lg:sticky lg:top-24 lg:block" aria-label="Lộ trình bài học"><Link href={courseHome} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4" />Về lộ trình</Link><h2 className="font-semibold">{path.course.title}</h2><progress aria-label="Tiến độ khoá học" max={100} value={path.percent} className="h-2 w-full accent-primary" /><p className="text-sm text-muted-foreground">{path.done}/{path.total} bài · {path.percent}%</p>{lessons}</aside>
    <div className="min-w-0 space-y-6">
      <nav aria-label="Điều hướng bài học" className="flex flex-wrap items-center gap-2"><Button variant="outline" className="lg:hidden" onClick={() => setSidebar(true)}><List className="size-4" />Danh sách bài học</Button>{prev && <Link className={buttonVariants({ variant: "ghost" })} href={lessonUrl(prev.id)}><ArrowLeft className="size-4" />Bài trước</Link>}{next && <Link className={buttonVariants({ variant: "ghost" })} href={lessonUrl(next.id)}>Bài sau<ArrowRight className="size-4" /></Link>}<Link href={courseHome} className="ml-auto inline-flex min-h-11 items-center text-sm text-primary">Về lộ trình</Link></nav>
      {errorAlert}
      <div className="space-y-2 lg:hidden"><progress aria-label="Tiến độ khoá học" max={100} value={path.percent} className="h-2 w-full accent-primary" /><p className="text-sm text-muted-foreground">{path.done}/{path.total} bài · {path.percent}%</p></div>
      <header className="space-y-2"><p className="text-sm text-muted-foreground">{data.lesson.chapterTitle} · {Math.ceil(data.lesson.durationSeconds / 60)} phút</p><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-3xl">{data.lesson.title}</h1>{data.lesson.description && <p className="text-muted-foreground">{data.lesson.description}</p>}</header>
      {data.completed && <Card className="border-success"><CardContent className="space-y-4 py-5" aria-live="polite"><h2 className="flex items-center gap-2 text-xl font-semibold text-success"><CheckCircle2 className="size-6" />Đã hoàn thành bài học</h2>{path.updating ? <p role="status">Codi đang cập nhật lộ trình. Bạn có thể tiếp tục học hoặc quay lại kiểm tra sau.<Button variant="link" onClick={() => void send({ type: "open" }).catch(() => {})}>Kiểm tra lại</Button></p> : update ? <><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Lộ trình đã được cập nhật</h3><Button variant="ghost" onClick={() => void pathCommand({ type: "dismiss-update", pathId: path.pathId }).catch((cause: Error) => setError(cause.message))}>Ẩn thông báo</Button></div><p className="text-sm text-muted-foreground">{update.message}</p><ul className="list-inside list-disc space-y-2 text-sm">{update.changes.map((change) => <li key={`${change.type}:${change.lessonId}`}>{change.text}</li>)}</ul></> : null}{current && !path.complete && <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted p-4"><div><p className="text-sm text-muted-foreground">Bài tiếp theo</p><strong>{current.title}</strong></div><Link className={buttonVariants()} href={lessonUrl(current.id)}>Học tiếp<ArrowRight className="size-4" /></Link></div>}</CardContent></Card>}
      {path.complete && <Card className="border-success"><CardContent className="space-y-4 py-6"><h2 className="flex items-start gap-3 text-xl font-semibold"><GraduationCap className="size-7 shrink-0 text-success" />Chúc mừng! Bạn đã hoàn thành khoá học</h2><p>Bạn thấy khoá học thế nào?</p><div className="flex flex-wrap items-center gap-2" role="group" aria-label="Đánh giá khoá học">{[1, 2, 3, 4, 5].map((n) => <Button key={n} variant="ghost" size="icon" aria-label={`${n} sao`} onClick={() => { setRating(n); setReviewing(true); }}><Star className={cn("size-6 text-star", path.review && n <= path.review.rating && "fill-current")} /></Button>)}</div>{path.review && <p className="text-sm text-muted-foreground">Bạn đã đánh giá {path.review.rating}/5.</p>}{path.recommendation && <div className="space-y-3"><p className="text-sm text-muted-foreground">Khoá học gợi ý tiếp theo</p><strong className="block">{path.recommendation.title}</strong><Link className={buttonVariants({ variant: "outline" })} href={`/courses/${encodeURIComponent(path.recommendation.slug)}` as Route}>Xem khoá học</Link></div>}</CardContent></Card>}
      {data.materials.length > 1 && <div className="space-y-2"><label htmlFor="lesson-material" className="text-sm font-medium">Tài liệu bài học</label><select id="lesson-material" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" value={material?.id} onChange={(event) => setMaterialId(Number(event.target.value))}>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}
      {material && <LessonMaterialView key={material.id} material={material} progress={data.media[String(material.id)] ?? (material.type === "video" && material.id === data.materials.find((item) => item.type === "video")?.id ? { seconds: data.positionSeconds } : undefined)} save={saveMedia} />}
      {data.lesson.body ? <Card><CardContent className="space-y-3 py-6"><h2 className="flex items-center gap-2 font-semibold"><BookOpen className="size-5" />{material ? "Tóm tắt bài học (bài đọc)" : "Nội dung bài học"}</h2><div className="whitespace-pre-wrap break-words leading-8">{data.lesson.body}</div></CardContent></Card> : !material && <Alert><AlertTitle>Chưa có nội dung bài học</AlertTitle><AlertDescription>Bài học chưa có tài liệu hoặc bài đọc.</AlertDescription></Alert>}
      {!data.checklist.some((item) => item.key === "code") && <div>{data.studied ? <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="size-5" />Đã học xong nội dung</p> : <Button variant="outline" disabled={busy || !data.lesson.body && !material} onClick={async () => { setBusy(true); try { await send({ type: "study" }); toast.success("Đã đánh dấu học xong nội dung."); } catch { /* inline error */ } finally { setBusy(false); } }}><CheckCircle2 className="size-4" />Đánh dấu đã học xong</Button>}</div>}
      <Card id="checklist"><CardContent className="space-y-5 py-6"><h2 className="text-lg font-semibold">Để hoàn thành bài học</h2><ol className="space-y-4">{data.checklist.map((item) => <li key={`${item.key}:${item.assessmentId ?? "study"}`} className="flex items-start gap-3">{item.done ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" /> : <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}<div><p className="font-medium">{item.label}<span className="sr-only">{item.done ? ": đã xong" : ": chưa xong"}</span></p><p className="text-sm text-muted-foreground">{item.note}</p></div></li>)}</ol>{data.completed ? <p className="font-medium text-success">Đã hoàn thành bài học</p> : <div className="sticky bottom-0 space-y-3 border-t bg-card py-4"><Button className="min-h-11 min-w-52" disabled={busy || !!missing.length} onClick={() => void complete()}>{busy && <LoaderCircle className="size-4 animate-spin" />}Hoàn thành bài học</Button><p className={cn("text-sm", missing.length ? "text-muted-foreground" : "text-success")}>{missing.length ? `Còn thiếu: ${missing.map((item) => item.label).join(", ")}` : "Bạn đã đủ điều kiện hoàn thành bài học."}</p></div>}</CardContent></Card>
      <Button variant="outline" onClick={() => { setRating(null); setReviewing(true); }}>{path.review ? "Sửa đánh giá" : "Đánh giá khóa học"}</Button>
    </div>
    <Sheet open={sidebar} onOpenChange={setSidebar} title="Danh sách bài học" description={`${path.course.title} · ${path.done}/${path.total} bài`}>{lessons}</Sheet>
    {reviewing && <ReviewForm data={path} initialRating={rating} open={reviewing} onOpenChange={setReviewing} save={async (stars, text) => { await pathCommand({ type: "review", rating: stars, text }); toast.success("Đã lưu đánh giá khoá học."); }} />}
  </main>;
}

function LessonList({ path, lessonId, close }: { path: CoursePathView; lessonId: string; close: () => void }) {
  return <ol className="space-y-2">{path.rows.map((row, index) => <li key={row.id} className={cn("rounded-lg border p-3", row.id === lessonId && "border-primary bg-accent")}><p className="mb-1 text-xs text-muted-foreground">{row.chapterTitle}</p><div className="flex items-start gap-2">{row.status === "done" ? <CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" /> : row.status === "locked" ? <LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" /> : <span className="text-sm text-muted-foreground">{index + 1}.</span>}<Link href={`/learn/${encodeURIComponent(path.course.id)}/${encodeURIComponent(row.id)}` as Route} aria-current={row.id === lessonId ? "page" : undefined} onClick={close} className="min-w-0 break-words text-sm font-medium hover:underline">{row.title}</Link></div><p className="mt-2 text-xs text-muted-foreground">{LESSON_PATH_LABELS[row.status]}</p>{row.lock && row.status !== "done" && <p className="mt-1 text-xs text-muted-foreground">Cần học trước: {row.lock.concept}</p>}</li>)}</ol>;
}
