"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  LockKeyhole,
  SkipForward,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { cn } from "@codi-1/ui/lib/utils";
import { LESSON_KIND_LABELS } from "@/lib/lesson-kind";
import {
  LESSON_PATH_LABELS,
  type CoursePathView,
  type LessonPathState,
} from "@/lib/learning-path-contract";
import { PrerequisiteAdvice } from "./prerequisite-advice";

type PathRow = CoursePathView["rows"][number];
type LessonUrl = (id: string) => Route;

const NODE_SIZE = 56;
const ROW_HEIGHT = 136;
const HEADER_HEIGHT = 56;
const CHAPTER_GAP = 16;
// Horizontal positions (percent of the map width): the path winds left and right.
const ZIGZAG = [50, 74, 50, 26];
const MOVE_MS = 900;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATE_NODE: Record<LessonPathState, string> = {
  done: "border-success bg-success-soft text-success",
  active: "border-primary bg-primary text-primary-foreground ring-4 ring-primary/25",
  next: "border-primary bg-primary text-primary-foreground ring-4 ring-primary/25",
  skippable: "border-dashed border-border bg-muted text-muted-foreground",
  locked: "border-dashed border-warning bg-warning-soft text-warning",
  todo: "border-border bg-card text-foreground",
};

const STATE_CAPTION: Record<LessonPathState, string> = {
  done: "text-success",
  active: "font-semibold text-primary",
  next: "font-semibold text-primary",
  skippable: "text-muted-foreground",
  locked: "text-warning",
  todo: "text-muted-foreground",
};

const NODE_ICON: Partial<Record<LessonPathState, LucideIcon>> = {
  done: CheckCircle2,
  locked: LockKeyhole,
  skippable: SkipForward,
};

// Connectors are placed in pixels, so the map width is measured and kept current on resize.
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const minutes = (row: PathRow) => Math.ceil(row.durationSeconds / 60);
const isCurrentRow = (row: PathRow, currentId: string | null) =>
  row.id === currentId;
const captionFor = (row: PathRow, currentId: string | null) =>
  isCurrentRow(row, currentId) ? "Bắt đầu ở đây" : LESSON_PATH_LABELS[row.status];

type Placed = { row: PathRow; number: number; x: number; top: number };
type Chapter = { title: string; top: number; steps: Placed[] };

// Absolute layout: every node, chapter header and connector shares one coordinate space.
function layoutPath(rows: PathRow[]) {
  const chapters: Chapter[] = [];
  const placed: Placed[] = [];
  let top = 0;
  rows.forEach((row, index) => {
    const last = chapters.at(-1);
    if (!last || last.title !== row.chapterTitle) {
      if (last) top += CHAPTER_GAP;
      chapters.push({ title: row.chapterTitle, top, steps: [] });
      top += HEADER_HEIGHT;
    }
    const step: Placed = {
      row,
      number: index + 1,
      x: ZIGZAG[index % ZIGZAG.length]!,
      top,
    };
    chapters.at(-1)!.steps.push(step);
    placed.push(step);
    top += ROW_HEIGHT;
  });
  return { chapters, placed, height: top };
}

/**
 * The learner's path as a winding map: an ordered list of lesson nodes grouped by chapter.
 * Every state is named in text, so colour is never the only signal.
 */
export function PathMap({
  path,
  lessonUrl,
  animateFrom = null,
}: {
  path: CoursePathView;
  lessonUrl: LessonUrl;
  /** Completed lesson the progress marker starts from; it glides to the current node. */
  animateFrom?: string | null;
}) {
  const layout = layoutPath(path.rows);
  const center = (top: number) => top + NODE_SIZE / 2;
  const byId = new Map(layout.placed.map((step) => [step.row.id, step]));
  const currentId = path.currentLessonId;
  const from = animateFrom ? byId.get(animateFrom) : undefined;
  const to = currentId ? byId.get(currentId) : undefined;
  const [phase, setPhase] = useState<"start" | "moving" | "idle">(() =>
    from && to && from !== to && !reducedMotion() ? "start" : "idle",
  );
  const [picked, setPicked] = useState<string | null>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const pickedRow = path.rows.find((row) => row.id === picked);
  const [mapRef, mapWidth] = useMeasuredWidth<HTMLDivElement>();

  // Scroll the current node into view on open; the marker glides from the completed node first.
  useEffect(() => {
    const target = currentId ? nodes.current.get(currentId) : undefined;
    target?.scrollIntoView({
      block: "center",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [currentId]);

  useEffect(() => {
    if (phase === "start") {
      const frame = requestAnimationFrame(() => setPhase("moving"));
      return () => cancelAnimationFrame(frame);
    }
    if (phase === "moving") {
      const timer = window.setTimeout(() => setPhase("idle"), MOVE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (!path.rows.length) {
    return (
      <p className="text-muted-foreground">
        Khoá học chưa có bài học được xuất bản.
      </p>
    );
  }

  const marker = phase === "start" && from ? from : to;

  return (
    <div className="space-y-6">
      <div ref={mapRef} className="relative w-full" style={{ height: layout.height }}>
        {layout.chapters.map((chapter) => {
          const done = chapter.steps.filter((s) => s.row.status === "done").length;
          return (
            <div
              key={`header:${chapter.top}`}
              aria-hidden="true"
              className="absolute inset-x-0 flex items-baseline justify-between gap-2 border-b pb-1"
              style={{ top: chapter.top, height: HEADER_HEIGHT }}
            >
              <span className="min-w-0 truncate font-semibold">{chapter.title}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {done}/{chapter.steps.length} bài
              </span>
            </div>
          );
        })}
        {mapWidth > 0 &&
          layout.chapters.flatMap((chapter) =>
            chapter.steps.slice(1).map((step, index) => {
              const before = chapter.steps[index]!;
              // Each connector is a bar from one node centre to the next, rotated to match the winding.
              const dx = ((step.x - before.x) / 100) * mapWidth;
              const dy = center(step.top) - center(before.top);
              return (
                <span
                  key={step.row.id}
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute h-[3px] origin-left rounded-full",
                    before.row.status === "done" ? "bg-success" : "bg-border",
                  )}
                  style={{
                    left: (before.x / 100) * mapWidth,
                    top: center(before.top) - 1.5,
                    width: Math.hypot(dx, dy),
                    transform: `rotate(${Math.atan2(dy, dx)}rad)`,
                  }}
                />
              );
            }),
          )}
        <ol className="absolute inset-0 list-none">
          {layout.placed.map((step) => {
            const { row } = step;
            const isCurrent = isCurrentRow(row, currentId);
            const Icon = NODE_ICON[row.status];
            return (
              <li
                key={row.id}
                className="absolute w-36 -translate-x-1/2"
                style={{ left: `${step.x}%`, top: step.top }}
              >
                <button
                  type="button"
                  ref={(element) => {
                    if (element) nodes.current.set(row.id, element);
                    else nodes.current.delete(row.id);
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-haspopup="dialog"
                  onClick={() => setPicked(row.id)}
                  className="group flex w-full flex-col items-center gap-1.5 rounded-xl text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "flex size-14 items-center justify-center rounded-full border-2 text-sm font-semibold transition-transform group-hover:scale-105 motion-reduce:transition-none",
                      STATE_NODE[row.status],
                    )}
                  >
                    {Icon ? <Icon aria-hidden="true" className="size-6" /> : step.number}
                  </span>
                  <span className="line-clamp-2 text-sm font-medium leading-5 group-hover:underline">
                    <span className="sr-only">Bài {step.number}: </span>
                    {row.title}
                  </span>
                  <span className={cn("text-xs leading-4", STATE_CAPTION[row.status], isCurrent && "font-semibold")}>
                    {captionFor(row, currentId)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {phase !== "idle" && marker && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/30 transition-[left,top] ease-out motion-reduce:transition-none"
            style={{
              left: `${marker.x}%`,
              top: center(marker.top),
              transitionDuration: `${MOVE_MS}ms`,
            }}
          />
        )}
      </div>
      <Dialog open={!!pickedRow} onOpenChange={(open) => !open && setPicked(null)}>
        {pickedRow && (
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{pickedRow.title}</DialogTitle>
              <DialogDescription>
                {LESSON_KIND_LABELS[pickedRow.kind ?? "reading"]} · {minutes(pickedRow)} phút ·{" "}
                {captionFor(pickedRow, currentId)}
              </DialogDescription>
            </DialogHeader>
            <section className="space-y-1" aria-labelledby="path-map-why">
              <h3 id="path-map-why" className="text-sm font-semibold">
                Vì sao?
              </h3>
              <p className="text-sm text-muted-foreground">{pickedRow.reason}</p>
            </section>
            {pickedRow.lock && pickedRow.status !== "done" && (
              <PrerequisiteAdvice advice={pickedRow.lock} lessonUrl={lessonUrl} />
            )}
            <Link
              className={cn(buttonVariants({ variant: isCurrentRow(pickedRow, currentId) || pickedRow.status === "done" ? "default" : "outline" }), "w-full")}
              href={lessonUrl(pickedRow.id)}
            >
              {pickedRow.status === "done"
                ? "Xem lại bài"
                : pickedRow.status === "active"
                  ? "Tiếp tục"
                  : "Học"}
            </Link>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
