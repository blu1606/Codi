"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, LoaderCircle, LockKeyhole, Map, RefreshCw, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import { GOAL_LABELS } from "@/lib/onboarding-contract";
import { LESSON_PATH_LABELS, type CoursePathView, type LearningPathCommand } from "@/lib/learning-path-contract";
import KnowledgeMap from "@/components/knowledge-map";

export default function CourseHome({ courseId }: { courseId: string }) {
  const router = useRouter();
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/path`;
  const onboarding = `/learn/${encodeURIComponent(courseId)}/onboarding` as Route;
  const [data, setData] = useState<CoursePathView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewInitial, setReviewInitial] = useState<number | null>(null);
  const [map, setMap] = useState(false);
  const ack = useRef<number | null>(null);
  const mutating = useRef(false);
  const started = useRef(Date.now());
  const lessonUrl = (id: string) => `/learn/${encodeURIComponent(courseId)}/${encodeURIComponent(id)}` as Route;
  const accept = (body: CoursePathView) => setData((previous) => ({ ...body, highlights: previous?.pathId === body.pathId ? previous.highlights : body.highlights }));

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "sync" }), signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Không thể tải lộ trình."); if (!controller.signal.aborted) { accept(body); setError(null); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải lộ trình."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, refresh]);

  useEffect(() => {
    if (error || !data || data.status !== "generating" && !data.updating) return;
    const timer = setTimeout(() => setRefresh((n) => n + 1), 2500);
    return () => clearTimeout(timer);
  }, [data, error]);
  useEffect(() => {
    if (!data?.pathId || !data.highlights.length || ack.current === data.pathId) return;
    ack.current = data.pathId;
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "ack-highlights", pathId: data.pathId }) })
      .then((response) => { if (!response.ok) ack.current = null; }).catch(() => { ack.current = null; });
  }, [data, endpoint]);

  async function send(command: LearningPathCommand) {
    if (mutating.current) throw new Error("Vui lòng chờ thao tác hiện tại.");
    mutating.current = true; setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Không thể lưu thay đổi.");
      accept(body); setError(null);
    } finally { mutating.current = false; setBusy(false); }
  }
  async function run(command: LearningPathCommand) {
    try { await send(command); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu thay đổi."); }
  }
  async function openOnboarding(type: "goal-edit" | "diagnostic-retake") {
    if (type === "goal-edit" && data?.goalEditing) { router.push(onboarding); return; }
    const response = await fetch(`/api/learn/${encodeURIComponent(courseId)}/onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Không thể mở thiết lập.");
    router.push(onboarding);
  }
  if (loading) return <main className="mx-auto max-w-5xl space-y-4 p-6" role="status"><LoaderCircle className="animate-spin" /> Đang tải lộ trình…</main>;
  const errorAlert = error && <Alert variant="destructive"><AlertTitle>Không thể cập nhật lộ trình</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => { setLoading(!data); setRefresh((n) => n + 1); }}>Thử lại</Button></AlertDescription></Alert>;
  if (!data) return <main className="mx-auto max-w-2xl p-6">{errorAlert}</main>;
  if (data.status === "none") return <main className="mx-auto max-w-2xl space-y-6 p-6"><h1 className="text-2xl font-semibold">{data.course.title}</h1>{errorAlert}<Card><CardContent className="space-y-4 py-6"><h2 className="text-xl font-semibold">Hãy thiết lập lộ trình học của bạn</h2><p className="text-muted-foreground">Đặt mục tiêu và chọn học từ bài 1 hoặc tìm điểm bắt đầu phù hợp với bạn.</p><Link className={buttonVariants()} href={onboarding}>Bắt đầu thiết lập</Link></CardContent></Card></main>;
  if (data.status === "generating") return <main className="mx-auto max-w-2xl space-y-6 p-6"><h1 className="text-2xl font-semibold">{data.course.title}</h1>{errorAlert}<Card><CardContent className="space-y-4 py-6" role="status" aria-live="polite"><p className="flex items-center gap-3 font-semibold"><LoaderCircle className="size-5 shrink-0 animate-spin" /> Codi đang xếp lộ trình cho bạn…</p><ol className="list-inside list-decimal space-y-3 text-muted-foreground"><li>Phân tích kết quả bài kiểm tra đầu vào</li><li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li><li>Ước lượng thời gian theo mục tiêu của bạn</li></ol><p className="text-sm text-muted-foreground">Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.</p>{Date.now() - started.current > 30_000 && <Alert><AlertTitle>Tác vụ đang được khôi phục</AlertTitle><AlertDescription>Nếu kết nối bị ngắt, Codi sẽ tiếp tục từ yêu cầu đã lưu. Khi AI không phản hồi, bạn sẽ nhận thứ tự mặc định.<Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>Kiểm tra lại</Button></AlertDescription></Alert>}</CardContent></Card></main>;
  const current = data.rows.find((r) => r.id === data.currentLessonId);
  const goal = data.goal && data.goal in GOAL_LABELS ? GOAL_LABELS[data.goal as keyof typeof GOAL_LABELS] : "Chưa đặt mục tiêu";
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <nav className="text-sm text-muted-foreground" aria-label="Đường dẫn"><Link href="/dashboard">Bàn làm việc</Link> / {data.course.title}</nav>
    {errorAlert}
    <Card><CardContent className="flex flex-col gap-6 py-6 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0 flex-1 space-y-4"><h1 className="text-2xl font-semibold">{data.course.title}</h1><p className="text-sm text-muted-foreground">Mục tiêu: <strong className="text-foreground">{goal}</strong>{data.hours ? ` · ${data.hours} giờ/tuần` : ""} <Button variant="link" className="px-1" onClick={() => setEditing(true)}>Chỉnh mục tiêu</Button></p><div className="flex items-center gap-4"><progress aria-label="Tiến độ khoá học" max={100} value={data.percent} className="h-3 min-w-0 flex-1 accent-primary" /><span className="shrink-0 text-sm">{data.done}/{data.total} bài · {data.percent}%</span></div></div><div className="flex shrink-0 flex-col gap-3">{current && !data.complete && <Link className={buttonVariants()} href={lessonUrl(current.id)}>Học tiếp <ArrowRight className="size-4" /></Link>}<Button variant="outline" onClick={() => { setReviewInitial(null); setReviewing(true); }}>{data.review ? "Sửa đánh giá" : "Đánh giá khóa học"}</Button></div></CardContent></Card>
    {data.status === "failed" && <Alert variant="warning"><AlertTitle>Lộ trình cá nhân hoá chưa sẵn sàng</AlertTitle><AlertDescription>AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc định của khoá học.<Button variant="outline" disabled={busy} onClick={() => { started.current = Date.now(); void run({ type: "retry" }); }}><RefreshCw className="size-4" /> Thử lại</Button></AlertDescription></Alert>}
    {data.showDiagnosticCard && <Card><CardContent className="space-y-3 py-5"><div className="flex items-start justify-between gap-2"><h2 className="font-semibold">Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)</h2><Button variant="ghost" size="icon" disabled={busy} aria-label="Ẩn thông báo cá nhân hoá lộ trình" onClick={() => void run({ type: "dismiss-diagnostic" })}><X className="size-4" /></Button></div><p className="text-sm text-muted-foreground">Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.</p><Button variant="outline" disabled={busy} onClick={() => void openOnboarding("diagnostic-retake").catch((cause: Error) => setError(cause.message))}>Làm bài kiểm tra đầu vào</Button></CardContent></Card>}
    {data.source === "ai" && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Sparkles className="mt-1 size-4 shrink-0" /><span>AI dùng mục tiêu và mức thành thạo BKT để xếp thứ tự; điều kiện tiên quyết luôn áp dụng. AI có thể sai. Mỗi bài có giải thích “Vì sao?”. {data.rationale}</span></p>}
    {data.updating && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Codi đang cập nhật các bài chưa hoàn thành…</p>}
    {data.update && <Card className="border-info"><CardContent className="space-y-4 py-5" aria-live="polite"><div className="flex items-start justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 text-success" />{data.update.afterLessonId ? `Đã hoàn thành: ${data.rows.find((r) => r.id === data.update!.afterLessonId)?.title ?? "bài học"}` : "Lộ trình đã được cập nhật"}</h2><Button variant="ghost" disabled={busy} onClick={() => void run({ type: "dismiss-update", pathId: data.pathId! })}>Ẩn thông báo</Button></div><p>{data.update.message}</p>{data.update.changes.length > 0 && <ul className="list-inside list-disc space-y-2 text-sm">{data.update.changes.map((change) => <li key={`${change.type}:${change.lessonId}`}>{change.text}</li>)}</ul>}{current && !data.complete && <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted p-4"><div><p className="text-sm text-muted-foreground">Bài tiếp theo</p><strong>{current.title}</strong></div><Link className={buttonVariants()} href={lessonUrl(current.id)}>Học tiếp</Link></div>}</CardContent></Card>}
    {data.complete && <Card className="border-success"><CardContent className="space-y-5 py-6"><h2 className="flex items-start gap-3 text-xl font-semibold"><GraduationCap className="size-7 shrink-0 text-success" /> Chúc mừng! Bạn đã hoàn thành khoá học</h2><p className="text-muted-foreground">{data.course.title}</p><p>Bạn thấy khoá học thế nào?</p><div className="flex flex-wrap items-center gap-2" role="group" aria-label="Đánh giá khoá học">{[1, 2, 3, 4, 5].map((n) => <Button key={n} size="icon" variant="ghost" aria-label={`${n} sao`} onClick={() => { setReviewInitial(n); setReviewing(true); }}><Star className={cn("size-6 text-star", data.review && n <= data.review.rating && "fill-current")} /></Button>)}{data.review && <span className="text-sm text-muted-foreground">Bạn đã đánh giá {data.review.rating}/5</span>}</div>{data.recommendation && <div className="space-y-3 rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">Khoá học gợi ý tiếp theo</p><strong className="block">{data.recommendation.title}</strong><Link className={buttonVariants({ variant: "outline" })} href={`/courses/${encodeURIComponent(data.recommendation.slug)}` as Route}>Xem khoá học</Link></div>}</CardContent></Card>}
    <div role="group" aria-label="Nội dung khoá học" className="flex flex-wrap gap-2"><Button aria-pressed={!map} variant={map ? "outline" : "default"} onClick={() => setMap(false)}><BookOpen className="size-4" /> Lộ trình học</Button><Button aria-pressed={map} variant={map ? "default" : "outline"} onClick={() => setMap(true)}><Map className="size-4" /> Bản đồ kiến thức</Button></div>
    {map ? <KnowledgeMap initialCourseId={courseId} embedded /> : <section className="space-y-4" aria-label="Các bài theo thứ tự lộ trình">{!data.rows.length && <Card><CardContent className="py-6 text-muted-foreground">Khoá học chưa có bài học được xuất bản.</CardContent></Card>}<ol className="space-y-3">{data.rows.map((row, index) => <li key={row.id}><Card className={cn((row.status === "next" || row.status === "active") && "border-primary", data.highlights.includes(row.id) && "border-info bg-info-soft")}><CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{row.status === "done" ? <CheckCircle2 className="size-5 text-success" /> : row.status === "locked" ? <LockKeyhole className="size-5 text-muted-foreground" /> : index + 1}</span><div className="min-w-0 flex-1 space-y-3"><p className="text-xs text-muted-foreground">{row.chapterTitle}</p><div className="flex flex-wrap items-center gap-2">{row.status === "locked" ? <h2 className="font-semibold text-muted-foreground">{row.title}</h2> : <h2 className="font-semibold"><Link href={lessonUrl(row.id)} className="hover:underline">{row.title}</Link></h2>}{data.highlights.includes(row.id) && <span className="rounded-full bg-info-soft px-2 py-1 text-xs text-info">Mới cập nhật</span>}</div><div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{Math.ceil(row.durationSeconds / 60)} phút</span>{row.mastery.map((c) => <span key={c.id} className="inline-flex items-center gap-1"><span>{c.name}:</span><MasteryChip level={c.level} /></span>)}</div>{row.lock && row.status !== "done" ? <p className="text-sm">Cần học trước: {row.lock.concept} ({row.lock.lessonTitle})</p> : <details open={row.status === "next" || row.status === "active"}><summary className="cursor-pointer text-sm text-primary">Vì sao?</summary><p className="mt-2 text-sm text-muted-foreground">{row.reason}</p></details>}</div><span className={cn("w-fit shrink-0 rounded-full px-3 py-1 text-xs", row.status === "done" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{LESSON_PATH_LABELS[row.status]}</span></CardContent></Card></li>)}</ol></section>}
    <ConfirmDialog open={editing} onOpenChange={setEditing} title="Chỉnh mục tiêu học tập?" consequence="Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên." reversible="Bạn có thể chỉnh lại mục tiêu bất cứ lúc nào." confirmLabel="Chỉnh mục tiêu" onConfirm={() => openOnboarding("goal-edit")} />
    {reviewing && <ReviewForm initialRating={reviewInitial} data={data} open={reviewing} onOpenChange={setReviewing} save={async (rating, text) => { await send({ type: "review", rating, text }); toast.success("Đã lưu đánh giá khoá học."); }} />}
  </main>;
}

export function ReviewForm({ data, initialRating, open, onOpenChange, save }: { initialRating: number | null; data: CoursePathView; open: boolean; onOpenChange: (value: boolean) => void; save: (rating: number, text: string) => Promise<void> }) {
  const [rating, setRating] = useState(initialRating ?? data.review?.rating ?? 0);
  const [text, setText] = useState(data.review?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) onOpenChange(value); }}><DialogContent><DialogHeader><DialogTitle>Đánh giá khóa học</DialogTitle><DialogDescription>{data.course.title}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (pending) return; if (!rating) { setError("Vui lòng chọn số sao."); return; } setPending(true); setError(null); try { await save(rating, text); onOpenChange(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu đánh giá."); } finally { setPending(false); } }}><div className="flex flex-wrap gap-2" role="group" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map((n) => <Button key={n} type="button" size="icon" variant="ghost" aria-label={`${n} sao`} aria-pressed={rating === n} disabled={pending} onClick={() => setRating(n)}><Star className={cn("size-6 text-star", n <= rating && "fill-current")} /></Button>)}</div><label htmlFor="course-review" className="text-sm">Nhận xét (không bắt buộc)</label><Textarea id="course-review" value={text} maxLength={2000} disabled={pending} onChange={(event) => setText(event.target.value)} />{error && <Alert variant="destructive">{error}</Alert>}<Button type="submit" className="min-w-32" disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />}Lưu đánh giá</Button></form></DialogContent></Dialog>;
}
