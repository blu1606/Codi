"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, Check, Clock, HelpCircle, ListOrdered, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { masteryLevel } from "@codi-1/ui/lib/mastery";
import { cn } from "@codi-1/ui/lib/utils";
import { toast } from "sonner";
import { GOAL_LABELS, LEVEL_LABELS, ONBOARDING_GOALS, ONBOARDING_LEVELS, WEEKLY_HOURS, type OnboardingCommand, type OnboardingView } from "@/lib/onboarding-contract";

export default function Onboarding({ courseId }: { courseId: string }) {
  const [data, setData] = useState<OnboardingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingType, setPendingType] = useState<OnboardingCommand["type"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState(false);
  const [edit, setEdit] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/onboarding`;
  const courseHome = `/learn/${encodeURIComponent(courseId)}` as Route;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể tải thiết lập.");
      if (!controller.signal.aborted) { setData(body); setResume(body.enrollment.diagnosticStatus === "in-progress"); setError(null); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải thiết lập."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, refresh]);

  async function send(command: OnboardingCommand) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setPendingType(command.type); setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể lưu. Vui lòng thử lại.");
      setData(body);
      if (command.type !== "goal-pick" && command.type !== "answer") heading.current?.focus();
      if ((command.type === "goal-next" || command.type === "goal-skip") && data?.enrollment.goalEditing && !body.enrollment.goalEditing) toast.success("Đã lưu mục tiêu. Codi đang xếp lại lộ trình.");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu. Vui lòng thử lại."); return false; }
    finally { submitting.current = false; setBusy(false); setPendingType(null); }
  }
  function retry() { setLoading(true); setRefresh((value) => value + 1); }
  const shell = (content: React.ReactNode) => <main aria-busy={busy || loading} className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"><div className="flex items-center justify-between gap-3"><Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Về bàn làm việc</Link><span className="text-sm text-muted-foreground">Thiết lập lộ trình</span></div>{error && <Alert variant="destructive"><AlertTitle>Chưa thể tiếp tục</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" className="mt-3" onClick={retry} disabled={busy}>Tải lại</Button></Alert>}{content}<ConfirmDialog open={edit} onOpenChange={setEdit} title="Chỉnh mục tiêu học tập?" consequence="Sau khi lưu, Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên." reversible="Bạn có thể chỉnh lại bất cứ lúc nào." confirmLabel="Chỉnh mục tiêu" onConfirm={async () => { if (!await send({ type: "goal-edit" })) throw new Error("Chưa thể mở thiết lập mục tiêu. Vui lòng thử lại."); }} /></main>;
  const title = (text: string, subtitle?: string) => <div className="space-y-2"><h1 ref={heading} tabIndex={-1} className="font-display text-2xl font-semibold outline-none sm:text-3xl">{text}</h1>{subtitle && <p className="text-muted-foreground">{subtitle}</p>}</div>;
  const progress = (value: number, total: number, label: string) => <div className="space-y-2"><p className="text-sm font-medium">{label}</p><progress className="h-2 w-full accent-primary" aria-label={label} value={value} max={total} /></div>;
  const action = (label: string, command: OnboardingCommand, disabled = false, secondary = false) => <Button variant={secondary ? "outline" : "default"} className="min-h-11 min-w-32 whitespace-normal" disabled={busy || disabled} onClick={() => void send(command)}>{busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{label}</Button>;
  if (loading) return shell(<div role="status" className="flex items-center gap-3 py-12 text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" />Đang tải thiết lập của bạn…</div>);
  if (!data) return shell(title("Thiết lập khoá học", "Vui lòng thử tải lại hoặc kiểm tra quyền đăng ký khoá học."));
  const e = data.enrollment;

  if (!e.goalSet || e.goalEditing) {
    const step = e.goalStep;
    const prompts = ["Bạn muốn đạt được gì với khoá học này?", "Bạn đang ở mức nào với chủ đề này?", "Mỗi tuần bạn dành được bao nhiêu thời gian?"];
    const choices = step === 0 ? ONBOARDING_GOALS.map((value) => ({ value, label: GOAL_LABELS[value] })) : step === 1 ? ONBOARDING_LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })) : WEEKLY_HOURS.map((value) => ({ value, label: `${value} giờ mỗi tuần` }));
    const selected = [e.goalDraft.goal, e.goalDraft.level, e.goalDraft.hours][step];
    return shell(<>{progress(step + 1, 3, `${e.goalEditing ? "Chỉnh mục tiêu" : "Thiết lập lộ trình"} · Bước ${step + 1}/3`)}{title(prompts[step]!, data.course.title)}<fieldset disabled={busy} className="space-y-3"><legend className="sr-only">{prompts[step]}</legend>{choices.map(({ value, label }) => <label key={value} className={cn("flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring", selected === value ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted")}><input type="radio" name="goal-choice" className="size-4 accent-primary" checked={selected === value} onChange={() => void send({ type: "goal-pick", step, value })} /><span className="font-medium">{label}</span>{selected === value && <Check aria-hidden="true" className="ml-auto size-5 shrink-0 text-primary" />}</label>)}</fieldset><div className="flex flex-wrap items-center justify-between gap-3">{step > 0 ? action("Quay lại", { type: "goal-back", step }, false, true) : <span /> }<div className="flex flex-wrap gap-2">{action("Bỏ qua", { type: "goal-skip" }, false, true)}{action(step === 2 && e.goalEditing ? "Lưu và xếp lại lộ trình" : "Tiếp tục", { type: "goal-next", step }, selected === undefined)}</div></div></>);
  }
  if (e.diagnosticStatus === "fork") return shell(<>{title("Bạn muốn học như thế nào?", "Hai cách bắt đầu — chọn một và bạn có thể thay đổi sau.")}<div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><ListOrdered aria-hidden="true" className="size-7 text-primary" /><CardTitle>Học từ bài 1</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình.</p><p className="text-sm">Chưa có bài có thể bỏ qua hoặc thứ tự cá nhân hoá; điều kiện tiên quyết vẫn áp dụng.</p>{action("Học từ bài 1", { type: "fork-default" }, false, true)}</CardContent></Card><Card className="border-primary"><CardHeader><span className="text-sm font-semibold text-primary">Khuyến nghị</span><Sparkles aria-hidden="true" className="size-7 text-primary" /><CardTitle>Tìm điểm bắt đầu của tôi</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">~10 phút, giúp bỏ qua phần bạn đã biết. Codi xếp lộ trình riêng cho bạn.</p>{action("Tìm điểm bắt đầu của tôi", { type: "fork-diagnostic" })}</CardContent></Card></div></>);

  const questions = data.diagnostic?.questions ?? [];
  if (e.diagnosticStatus === "intro" || (e.diagnosticStatus === "in-progress" && resume)) return shell(<>{title(questions.length ? "Giúp Codi xếp lộ trình phù hợp với bạn" : "Sẵn sàng bắt đầu", data.course.title)}{questions.length ? <><ul className="space-y-4 text-sm"><li className="flex gap-3"><ListOrdered aria-hidden="true" className="size-5 shrink-0 text-primary" />{questions.length} câu hỏi trắc nghiệm</li><li className="flex gap-3"><Clock aria-hidden="true" className="size-5 shrink-0 text-primary" />Khoảng {Math.ceil(questions.length * 0.75)} phút, không giới hạn thời gian</li><li className="flex gap-3"><ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />Không tính điểm. Chưa biết thì chọn “Tôi chưa biết”.</li></ul>{resume && <Alert variant="info"><AlertTitle>Bạn đang làm dở ở câu {e.diagnosticQuestionIndex + 1}</AlertTitle><AlertDescription>Các câu đã trả lời vẫn được giữ.</AlertDescription></Alert>}<Button disabled={busy} className="min-h-11" onClick={async () => { if (await send({ type: "diagnostic-start" })) setResume(false); }}>{resume ? `Tiếp tục từ câu ${e.diagnosticQuestionIndex + 1}` : "Bắt đầu làm bài"}<ArrowRight aria-hidden="true" className="size-4" /></Button></> : <Alert variant="info">Khoá học này chưa có bài kiểm tra đầu vào. Bạn vẫn có thể bắt đầu học.</Alert>}<div>{action(questions.length ? "Để sau" : "Xem lộ trình", { type: "diagnostic-postpone" }, false, true)}</div><p className="text-sm text-muted-foreground">Để sau giữ lộ trình AI hiện có; nếu chưa có, bạn học theo thứ tự mặc định và có thể làm bài kiểm tra sau.</p></>);

  if (e.diagnosticStatus === "in-progress") {
    const question = questions[e.diagnosticQuestionIndex];
    if (!question || !data.attemptId) return shell(<Alert variant="warning">Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại để tiếp tục.<Button onClick={retry}>Tải lại</Button></Alert>);
    const answer = data.answers.find((a) => a.questionId === question.id);
    const attemptId = data.attemptId;
    const count = questions.length;
    return shell(<>{progress(data.answers.length, count, `Câu ${e.diagnosticQuestionIndex + 1}/${count}`)}<p className="text-sm text-muted-foreground">Không tính điểm · không giới hạn thời gian · câu trả lời được lưu sau mỗi lựa chọn</p>{title(question.text)}{question.codeSnippet && <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm"><code>{question.codeSnippet}</code></pre>}<fieldset disabled={busy} className="space-y-3"><legend className="sr-only">Các lựa chọn</legend>{[...question.options.map((option) => ({ id: option.id, text: option.text })), { id: null, text: "Tôi chưa biết" }].map((option) => <label key={option.id ?? "unknown"} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:ring-2 focus-within:ring-ring", answer && (option.id === null ? answer.unknown : !answer.unknown && answer.optionId === option.id) ? "border-primary bg-accent" : "border-border bg-card")}><input type="radio" name="diagnostic-answer" className="mt-1 size-4 shrink-0 accent-primary" checked={!!answer && (option.id === null ? answer.unknown : !answer.unknown && answer.optionId === option.id)} onChange={() => void send({ type: "answer", attemptId, questionId: question.id, optionId: option.id, unknown: option.id === null })} /><span className="min-w-0 break-words">{option.text}{option.id === null && <span className="mt-1 block text-sm text-muted-foreground">Được ghi nhận riêng, không tính là sai</span>}</span></label>)}</fieldset><div className="flex flex-wrap justify-between gap-3">{action("Câu trước", { type: "previous", attemptId, questionId: question.id }, e.diagnosticQuestionIndex === 0, true)}{e.diagnosticQuestionIndex === count - 1 ? action(pendingType === "submit" ? "Đang nộp bài…" : "Xem kết quả", { type: "submit", attemptId }, !answer) : action("Câu tiếp theo", { type: "next", attemptId, questionId: question.id }, !answer)}</div><Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">Lưu và tiếp tục sau</Link></>);
  }
  if (e.diagnosticStatus === "done" && data.result && e.pathStatus !== "generating") {
    const { result } = data;
    const strengths = result.concepts.filter((c) => masteryLevel(c.probability) >= 3);
    const gaps = result.concepts.filter((c) => masteryLevel(c.probability) <= 1);
    return shell(<>{title("Codi đã hiểu điểm xuất phát của bạn", "Kết quả bài kiểm tra đầu vào — không tính vào điểm khoá học.")}<div className="grid grid-cols-3 gap-3">{([{ value: result.right, label: "Đúng" }, { value: result.wrong, label: "Sai" }, { value: result.unknown, label: "Chưa biết" }]).map((item) => <Card key={item.label}><CardContent className="space-y-1 pt-5 text-center"><p className="text-2xl font-semibold">{item.value}</p><p className="text-sm text-muted-foreground">{item.label}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Mức thành thạo theo khái niệm</CardTitle></CardHeader><CardContent className="space-y-4">{result.concepts.length ? result.concepts.map((concept) => <div key={concept.id} className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{concept.name}</span><MasteryChip level={masteryLevel(concept.probability)} /></div>) : <p className="text-sm text-muted-foreground">Bài kiểm tra chưa được liên kết với khái niệm. Bạn vẫn có thể tiếp tục học.</p>}</CardContent></Card><div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle>Điểm mạnh</CardTitle></CardHeader><CardContent>{strengths.length ? <ul className="list-inside list-disc">{strengths.map((c) => <li key={c.id}>{c.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa có khái niệm ở mức Thành thạo.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Cần tập trung</CardTitle></CardHeader><CardContent>{gaps.length ? <ul className="list-inside list-disc">{gaps.map((c) => <li key={c.id}>{c.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">Không có lỗ hổng lớn.</p>}</CardContent></Card></div>{action("Xem lộ trình của tôi", { type: "request-path" })}</>);
  }
  return shell(<>{title(e.pathStatus === "generating" ? "Codi đang xếp lộ trình cho bạn…" : "Lộ trình đã sẵn sàng", data.course.title)}<Alert variant="info"><AlertTitle>{e.pathStatus === "generating" ? "Yêu cầu xếp lộ trình đã được lưu" : e.pathSource === "ai" ? "Đã giữ lộ trình cá nhân hoá của bạn" : "Bạn đang học theo thứ tự mặc định"}</AlertTitle><AlertDescription>{e.pathStatus === "generating" ? "Bạn có thể rời trang; mục tiêu, kết quả và bài đã hoàn thành vẫn được giữ." : "Điều kiện tiên quyết vẫn áp dụng. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào."}</AlertDescription></Alert><div className="flex flex-wrap gap-3"><Button nativeButton={false} render={<Link href={courseHome} />}>Mở lộ trình<ArrowRight aria-hidden="true" className="size-4" /></Button><Button variant="outline" onClick={() => setEdit(true)} disabled={busy}>Chỉnh mục tiêu</Button>{["skipped", "done"].includes(e.diagnosticStatus) && action("Làm bài kiểm tra đầu vào", { type: "diagnostic-retake" }, false, true)}</div><p className="flex items-start gap-2 text-sm text-muted-foreground"><HelpCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Làm bài kiểm tra muộn không đặt lại bài học đã hoàn thành hoặc điểm số.</p></>);
}
