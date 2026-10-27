"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { toast } from "sonner";
import {
  showDiagnosticResult,
  type OnboardingCommand,
  type OnboardingView,
} from "@/lib/onboarding-contract";

import {
  GoalScreen,
  ForkScreen,
  IntroScreen,
  QuestionScreen,
  ResultScreen,
  ReadyScreen,
} from "./onboarding-screens";

export default function Onboarding({
  courseId,
  viewResult = false,
}: {
  courseId: string;
  viewResult?: boolean;
}) {
  const [data, setData] = useState<OnboardingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingType, setPendingType] = useState<
    OnboardingCommand["type"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState(false);
  const [explicitResult, setExplicitResult] = useState(viewResult);
  const [edit, setEdit] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const endpoint = `/api/learn/${encodeURIComponent(courseId)}/onboarding`;
  const courseHome = `/learn/${encodeURIComponent(courseId)}` as Route;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Không thể tải thiết lập.");
        if (!controller.signal.aborted) {
          setData(body);
          setResume(body.enrollment.diagnosticStatus === "in-progress");
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Không thể tải thiết lập.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, refresh]);

  async function send(command: OnboardingCommand) {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setPendingType(command.type);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Không thể lưu. Vui lòng thử lại.");
      setData(body);
      if (command.type === "submit") setExplicitResult(true);
      else if (
        command.type === "request-path" ||
        command.type === "diagnostic-retake" ||
        command.type === "goal-cancel"
      )
        setExplicitResult(false);
      if (command.type !== "goal-pick" && command.type !== "answer")
        heading.current?.focus();
      if (
        (command.type === "goal-commit" || command.type === "goal-next" || command.type === "goal-skip") &&
        data?.enrollment.goalEditing &&
        !body.enrollment.goalEditing
      )
        toast.success("Đã lưu mục tiêu. Codi đang xếp lại lộ trình.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể lưu. Vui lòng thử lại.",
      );
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
      setPendingType(null);
    }
  }
  function retry() {
    setLoading(true);
    setRefresh((value) => value + 1);
  }
  const shell = (content: React.ReactNode) => (
    <main
      aria-busy={busy || loading}
      className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Về bàn làm việc
        </Link>
        <span className="text-sm text-muted-foreground">
          Thiết lập lộ trình
        </span>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể tiếp tục</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            className="mt-3"
            onClick={retry}
            disabled={busy}
          >
            Tải lại
          </Button>
        </Alert>
      )}
      {content}
      <ConfirmDialog
        open={edit}
        onOpenChange={setEdit}
        title="Chỉnh mục tiêu học tập?"
        consequence="Sau khi lưu, Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên."
        reversible="Bạn có thể chỉnh lại bất cứ lúc nào."
        confirmLabel="Chỉnh mục tiêu"
        onConfirm={async () => {
          if (!(await send({ type: "goal-edit" })))
            throw new Error(
              "Chưa thể mở thiết lập mục tiêu. Vui lòng thử lại.",
            );
        }}
      />
    </main>
  );
  const title = (text: string, subtitle?: string) => (
    <div className="space-y-2">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-2xl font-semibold outline-none sm:text-3xl"
      >
        {text}
      </h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  );
  const progress = (value: number, total: number, label: string) => (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        className="flex gap-1"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < value ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
  const action = (
    label: string,
    command: OnboardingCommand,
    disabled = false,
    secondary = false,
  ) => (
    <Button
      variant={secondary ? "outline" : "default"}
      className="min-h-11 min-w-32 whitespace-normal"
      disabled={busy || disabled}
      onClick={() => void send(command)}
    >
      {busy && (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      )}
      {label}
    </Button>
  );
  if (loading)
    return shell(
      <div
        role="status"
        className="flex items-center gap-3 py-12 text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Đang tải thiết lập của bạn…
      </div>,
    );
  if (!data)
    return shell(
      title(
        "Thiết lập khoá học",
        "Vui lòng thử tải lại hoặc kiểm tra quyền đăng ký khoá học.",
      ),
    );
  const e = data.enrollment;

  const screen = { data, busy, ui: { title, progress, action } };
  if (!e.goalSet || e.goalEditing)
    return shell(<GoalScreen {...screen} send={send} />);
  if (e.diagnosticStatus === "fork") return shell(<ForkScreen {...screen} />);
  if (
    e.diagnosticStatus === "intro" ||
    (e.diagnosticStatus === "in-progress" && resume)
  )
    return shell(
      <IntroScreen
        {...screen}
        send={send}
        resume={resume}
        onResume={() => setResume(false)}
      />,
    );
  if (e.diagnosticStatus === "in-progress")
    return shell(
      <QuestionScreen
        {...screen}
        send={send}
        retry={retry}
        pendingType={pendingType}
      />,
    );
  if (showDiagnosticResult(data, explicitResult))
    return shell(<ResultScreen {...screen} courseHome={courseHome} />);
  return shell(
    <ReadyScreen
      {...screen}
      courseHome={courseHome}
      onEdit={() => setEdit(true)}
    />,
  );
}
