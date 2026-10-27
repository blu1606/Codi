"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Menu, PanelLeftOpen, Plus, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import TutorPanel from "@/components/ai-tutor/tutor-panel";
import { TutorLessonPicker } from "@/components/ai-tutor/tutor-lesson-picker";
import { TutorThreadList } from "@/components/ai-tutor/tutor-thread-list";
import type { TutorCodeBridge } from "@/components/ai-tutor/tutor-bridge";
import type { TutorThreadSummary } from "@/lib/ai-tutor-contract";

/**
 * Full Tutor page (Flow L6c): the learner's threads in this course on the left, the
 * selected lesson's thread on the right. Threads are per lesson, so "Đoạn chat mới" picks a lesson.
 */
export default function TutorPage({
  courseId,
  initialLessonId,
}: {
  courseId: string;
  initialLessonId: string | null;
}) {
  const router = useRouter();
  const course = encodeURIComponent(courseId);
  const courseHome = `/learn/${course}` as Route;
  const [threads, setThreads] = useState<TutorThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(initialLessonId);
  const [pickedTitle, setPickedTitle] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The full page has no code editor: the thread answers about the lesson only.
  const code = useRef<TutorCodeBridge | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/learn/${course}/tutor/threads`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Không tải được lịch sử Tutor.");
      setThreads(body.threads as TutorThreadSummary[]);
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Không tải được lịch sử Tutor.",
      );
    }
  }, [course]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Without a lesson in the URL, open the newest thread.
  const activeId = chosenId ?? threads?.[0]?.lessonId ?? null;
  const activeTitle =
    threads?.find((thread) => thread.lessonId === activeId)?.lessonTitle ??
    pickedTitle ??
    "";

  const pick = (lessonId: string, title?: string) => {
    setChosenId(lessonId);
    setPickedTitle(title ?? null);
    setListOpen(false);
    router.replace(
      `/learn/${course}/tutor?lesson=${encodeURIComponent(lessonId)}` as Route,
      { scroll: false },
    );
  };
  const openPicker = () => {
    setListOpen(false);
    setPickerOpen(true);
  };

  const history = (
    <TutorThreadList
      threads={threads}
      activeLessonId={activeId}
      onPick={(lessonId) => pick(lessonId)}
      onNewThread={openPicker}
    />
  );

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 w-full">
      <aside
        aria-label="Lịch sử Tutor"
        className={cn(
          "hidden min-h-0 shrink-0 gap-3 border-r bg-card p-3 md:flex md:flex-col",
          collapsed ? "w-14 items-center" : "w-72",
        )}
      >
        {collapsed ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mở danh sách đoạn chat"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeftOpen className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đoạn chat mới"
              onClick={openPicker}
            >
              <Plus className="size-4" />
            </Button>
          </>
        ) : (
          <TutorThreadList
            threads={threads}
            activeLessonId={activeId}
            onPick={(lessonId) => pick(lessonId)}
            onNewThread={openPicker}
            onCollapse={() => setCollapsed(true)}
          />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Danh sách đoạn chat"
            onClick={() => setListOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          {/* w-0 keeps the long lesson title from setting the header's minimum width. */}
          <div className="w-0 min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Tutor</p>
            <h1 className="truncate text-base font-semibold">
              {activeTitle || "Chọn một bài để bắt đầu"}
            </h1>
          </div>
          {activeId && (
            <Link
              href={`/learn/${course}/${encodeURIComponent(activeId)}` as Route}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Mở đúng chỗ
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đóng Tutor"
            onClick={() => router.push(courseHome)}
          >
            <X className="size-4" />
          </Button>
        </header>

        {loadError && (
          <Alert variant="destructive" className="m-4">
            <AlertTitle>Chưa tải được lịch sử Tutor</AlertTitle>
            <AlertDescription>
              {loadError}
              <Button className="mt-3" variant="outline" size="sm" onClick={() => void refresh()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {activeId ? (
          <TutorPanel
            key={activeId}
            variant="page"
            endpoint={`/api/learn/${course}/lessons/${encodeURIComponent(activeId)}/tutor`}
            request={null}
            code={code}
            codeVersion={0}
            docked={false}
            onClose={() => undefined}
            onTurnSettled={() => void refresh()}
            placeholder="Hỏi tiếp Tutor"
            onPickLesson={openPicker}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {threads === null && !loadError ? (
              <p role="status" className="text-sm text-muted-foreground">
                Đang tải lịch sử Tutor…
              </p>
            ) : (
              <>
                <p className="font-medium">Chưa có đoạn chat nào</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Chọn một bài học để hỏi Tutor. Mỗi bài có một đoạn chat riêng.
                </p>
                <Button onClick={openPicker}>
                  <Plus className="size-4" />
                  Đoạn chat mới
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet
        open={listOpen}
        onOpenChange={setListOpen}
        title="Tutor"
        description="Lịch sử đoạn chat"
      >
        <div className="flex min-h-full flex-col">{history}</div>
      </Sheet>
      <TutorLessonPicker
        courseId={courseId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(lesson) => pick(lesson.id, lesson.title)}
      />
    </div>
  );
}
