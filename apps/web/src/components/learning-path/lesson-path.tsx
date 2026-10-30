"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Code2,
  FileText,
  Info,
  List,
  Map as MapIcon,
  PlayCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import { LESSON_KIND_LABELS, type LessonKind } from "@/lib/lesson-kind";
import {
  LESSON_PATH_LABELS,
  type CoursePathView,
  type LessonPathState,
} from "@/lib/learning-path-contract";
import { PrerequisiteAdvice } from "./prerequisite-advice";
import { PathMap } from "./path-map";

type PathRow = CoursePathView["rows"][number];
type LessonUrl = (id: string) => Route;
type Step = { row: PathRow; number: number };

const KIND_ICONS: Record<LessonKind, LucideIcon> = {
  reading: BookOpen,
  video: PlayCircle,
  pdf: FileText,
  coding: Code2,
  tutorial: Code2,
  quiz: ClipboardCheck,
};

const STATUS_STYLES: Record<LessonPathState, string> = {
  done: "bg-success-soft text-success",
  active: "bg-primary text-primary-foreground",
  next: "bg-primary/10 text-primary",
  skippable: "bg-muted text-muted-foreground",
  locked: "bg-warning-soft text-warning",
  todo: "bg-muted text-muted-foreground",
};

const minutes = (row: PathRow) => Math.ceil(row.durationSeconds / 60);

// Chapters keep the path order; the step number is the global position in the path.
function groupByChapter(rows: PathRow[]) {
  const groups: { title: string; steps: Step[] }[] = [];
  rows.forEach((row, index) => {
    const step = { row, number: index + 1 };
    const last = groups.at(-1);
    if (last && last.title === row.chapterTitle) last.steps.push(step);
    else groups.push({ title: row.chapterTitle, steps: [step] });
  });
  return groups;
}

export function LessonPath({
  data,
  lessonUrl,
  initialView = "list",
}: {
  data: CoursePathView;
  lessonUrl: LessonUrl;
  /** Lab screens open the map directly; learners switch with the toggle. */
  initialView?: "list" | "map";
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">(initialView);
  if (!data.rows.length) {
    return (
      <p className="text-muted-foreground">
        Khoá học chưa có bài học được xuất bản.
      </p>
    );
  }
  const [expandedWhy, setExpandedWhy] = useState<Set<string>>(() => new Set());
  const current = data.rows.find((row) => row.id === data.currentLessonId);
  const selected =
    data.rows.find((row) => row.id === (picked ?? data.currentLessonId)) ??
    data.rows[0]!;
  const toggleWhy = (id: string) => {
    setPicked(id);
    setExpandedWhy((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      setSheetOpen(true);
    }
  };
  const detail = (
    <StepDetail
      row={selected}
      number={data.rows.indexOf(selected) + 1}
      lessonUrl={lessonUrl}
    />
  );
  const list = (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Các bài theo thứ tự lộ trình" className="min-w-0 space-y-6">
        {groupByChapter(data.rows).map((group) => (
          <div key={group.steps[0]!.row.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{group.title}</h2>
              <span className="text-sm text-muted-foreground">
                {group.steps.filter((s) => s.row.status === "done").length}/
                {group.steps.length} bài
              </span>
            </div>
            <ol>
              {group.steps.map((step, index) => (
                <LessonStep
                  key={step.row.id}
                  step={step}
                  isCurrent={step.row.id === current?.id}
                  isLast={index === group.steps.length - 1}
                  selected={step.row.id === selected.id}
                  highlighted={data.highlights.includes(step.row.id)}
                  isExpanded={expandedWhy.has(step.row.id)}
                  lessonUrl={lessonUrl}
                  onToggleWhy={toggleWhy}
                />
              ))}
            </ol>
          </div>
        ))}
      </section>
      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <div className="rounded-xl border bg-card p-5 text-card-foreground">
          {detail}
        </div>
      </aside>
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Chi tiết bài học"
        description="Vì sao bài này nằm trong lộ trình của bạn"
      >
        {detail}
      </Sheet>
    </div>
  );
  return (
    <div className="space-y-6">
      <div role="group" aria-label="Cách xem lộ trình" className="flex flex-wrap justify-end gap-2">
        <Button
          variant={view === "list" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <List className="size-4" />
          Danh sách
        </Button>
        <Button
          variant={view === "map" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={view === "map"}
          onClick={() => setView("map")}
        >
          <MapIcon className="size-4" />
          Bản đồ
        </Button>
      </div>
      {view === "map" ? <PathMap path={data} lessonUrl={lessonUrl} /> : list}
    </div>
  );
}

function LessonStep({
  step,
  isCurrent,
  isLast,
  selected,
  highlighted,
  isExpanded,
  lessonUrl,
  onToggleWhy,
}: {
  step: Step;
  isCurrent: boolean;
  isLast: boolean;
  selected: boolean;
  highlighted: boolean;
  isExpanded: boolean;
  lessonUrl: LessonUrl;
  onToggleWhy: (id: string) => void;
}) {
  const { row, number } = step;
  const Icon = KIND_ICONS[row.kind ?? "reading"];
  const locked = row.status === "locked";
  const marker =
    row.status === "done" ? (
      <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
    ) : locked ? (
      <Info aria-hidden="true" className="size-4 text-warning" />
    ) : (
      number
    );
  return (
    <li className="flex gap-4 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            row.status === "done"
              ? "bg-success-soft"
              : isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-muted",
          )}
        >
          {marker}
        </span>
        {!isLast && <span aria-hidden="true" className="mt-2 w-px flex-1 bg-border" />}
      </div>
      <article
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "min-w-0 flex-1 space-y-3 rounded-xl border bg-card p-4 text-card-foreground",
          selected && "border-primary ring-1 ring-primary",
          highlighted && !selected && "border-info",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Icon aria-hidden="true" className="size-3.5" />
                {LESSON_KIND_LABELS[row.kind ?? "reading"]}
              </span>
              <span>{minutes(row)} phút</span>
            </p>
            <h3 className="font-medium">
              <Link href={lessonUrl(row.id)} className="hover:underline">
                {row.title}
              </Link>
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isCurrent && (
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                Bắt đầu ở đây
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                STATUS_STYLES[row.status],
              )}
            >
              {LESSON_PATH_LABELS[row.status]}
            </span>
          </div>
        </div>
        {highlighted && (
          <span className="inline-block rounded-full bg-info-soft px-2 py-1 text-xs text-info">
            Mới cập nhật
          </span>
        )}
        {row.mastery.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {row.mastery.map((concept) => (
              <li key={concept.id} className="inline-flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{concept.name}</span>
                <MasteryChip level={concept.level} />
              </li>
            ))}
          </ul>
        )}
        {row.lock && row.status !== "done" && (
          <PrerequisiteAdvice advice={row.lock} lessonUrl={lessonUrl} />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {isCurrent && (
            <Link className={buttonVariants({ size: "sm" })} href={lessonUrl(row.id)}>
              Học tiếp
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={`lesson-why-${row.id}`}
            onClick={() => onToggleWhy(row.id)}
            className="gap-1.5 text-xs"
          >
            Vì sao?
            {isExpanded ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
            <span className="sr-only">: {row.title}</span>
          </Button>
        </div>
        {isExpanded && (
          <div
            id={`lesson-why-${row.id}`}
            className="rounded-lg border border-border/60 bg-muted/50 p-3 text-xs space-y-1.5 animate-in fade-in-50 duration-200"
          >
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="size-3.5 text-primary shrink-0" aria-hidden="true" />
              Vì sao bài này nằm trong lộ trình của bạn:
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {row.reason || "Theo thứ tự mặc định của giảng viên."}
            </p>
          </div>
        )}
      </article>
    </li>
  );
}

function StepDetail({
  row,
  number,
  lessonUrl,
}: {
  row: PathRow;
  number: number;
  lessonUrl: LessonUrl;
}) {
  const Icon = KIND_ICONS[row.kind ?? "reading"];
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>Bài {number}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Icon aria-hidden="true" className="size-3.5" />
            {LESSON_KIND_LABELS[row.kind ?? "reading"]}
          </span>
          <span aria-hidden="true">·</span>
          <span>{minutes(row)} phút</span>
        </p>
        <h3 className="text-lg font-semibold">{row.title}</h3>
        <span
          className={cn(
            "inline-block rounded-full px-2.5 py-1 text-xs",
            STATUS_STYLES[row.status],
          )}
        >
          {LESSON_PATH_LABELS[row.status]}
        </span>
      </div>
      <section className="space-y-1" aria-labelledby="lesson-step-why">
        <h4 id="lesson-step-why" className="text-sm font-semibold">
          Vì sao bài này
        </h4>
        <p className="text-sm text-muted-foreground">{row.reason}</p>
      </section>
      <section className="space-y-1" aria-labelledby="lesson-step-prereq">
        <h4 id="lesson-step-prereq" className="text-sm font-semibold">
          Kiến thức nên học trước
        </h4>
        {row.status === "done" ? (
          <p className="text-sm text-muted-foreground">
            Bạn đã hoàn thành bài này.
          </p>
        ) : row.lock ? (
          <PrerequisiteAdvice advice={row.lock} lessonUrl={lessonUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Không có kiến thức tiên quyết nào cần xem lại.
          </p>
        )}
      </section>
      {row.mastery.length > 0 && (
        <section className="space-y-2" aria-labelledby="lesson-step-mastery">
          <h4 id="lesson-step-mastery" className="text-sm font-semibold">
            Mức thành thạo hiện tại
          </h4>
          <ul className="space-y-2">
            {row.mastery.map((concept) => (
              <li
                key={concept.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{concept.name}</span>
                <MasteryChip level={concept.level} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {row.status === "skippable" && (
        <p className="text-sm text-muted-foreground">
          Codi đánh dấu bài này có thể bỏ qua. Bạn vẫn có thể mở bài.
        </p>
      )}
      <Link
        className={cn(
          buttonVariants({
            variant:
              row.status === "next" || row.status === "active"
                ? "default"
                : "outline",
          }),
          "w-full",
        )}
        href={lessonUrl(row.id)}
      >
        {row.status === "done"
          ? "Xem lại bài"
          : row.status === "next" || row.status === "active"
            ? "Học tiếp"
            : "Mở bài học"}
      </Link>
    </div>
  );
}
