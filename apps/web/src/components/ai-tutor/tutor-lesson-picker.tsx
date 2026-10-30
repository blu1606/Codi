"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";

type PickableLesson = { id: string; title: string; chapterTitle: string; locked: boolean };

/** Chooses the lesson a new Tutor thread is about; locked lessons are shown disabled. */
export function TutorLessonPicker({
  courseId,
  open,
  onOpenChange,
  onPick,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (lesson: { id: string; title: string }) => void;
}) {
  const [lessons, setLessons] = useState<PickableLesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(null);
    fetch(`/api/learn/${encodeURIComponent(courseId)}/path`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Không tải được danh sách bài.");
        setLessons(
          (body.rows as { id: string; title: string; chapterTitle: string; status: string }[]).map(
            (row) => ({
              id: row.id,
              title: row.title,
              chapterTitle: row.chapterTitle,
              locked: row.status === "locked",
            }),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Không tải được danh sách bài.");
      });
    return () => controller.abort();
  }, [open, courseId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chọn bài để hỏi Tutor</DialogTitle>
          <DialogDescription>
            Mỗi bài có một đoạn chat riêng, giữ nguyên khi bạn quay lại.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !lessons && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Đang tải danh sách bài…
          </p>
        )}
        {lessons && (
          <ul className="max-h-[60svh] space-y-1 overflow-y-auto">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Button
                  variant="ghost"
                  className="h-auto min-h-11 w-full flex-col items-start gap-0 whitespace-normal py-2 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onPick({ id: lesson.id, title: lesson.title });
                  }}
                >
                  <span className="text-sm">{lesson.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {lesson.chapterTitle}
                    {lesson.locked ? " · Chưa đủ tiên quyết" : ""}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
