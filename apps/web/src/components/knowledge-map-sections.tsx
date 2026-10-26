"use client";
import Link from "next/link";
import type { Route } from "next";
import {
  LockKeyhole,
  Map as MapIcon,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { cn } from "@codi-1/ui/lib/utils";
import { MASTERY_LABELS, MASTERY_LEVELS } from "@codi-1/ui/lib/mastery";
import { KNOWLEDGE_NODE } from "@codi-1/ui/lib/knowledge-graph-layout";
import type { KnowledgeMapView } from "@/lib/learning-path-contract";
type ConceptNode = KnowledgeMapView["nodes"][number];
function RecommendedConcept() {
  return (
    <span className="flex items-center gap-1 text-xs text-primary">
      <ArrowRight className="size-3 shrink-0" /> Bài học được gợi ý
    </span>
  );
}
export function KnowledgeMapList({
  data,
  ancestors,
  onSelect,
}: {
  data: KnowledgeMapView;
  ancestors: Set<number>;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Khái niệm, mức thành thạo và khái niệm cần học trước
        </caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="p-3">
              Khái niệm
            </th>
            <th scope="col" className="p-3">
              Mức thành thạo
            </th>
            <th scope="col" className="p-3">
              Cần học trước
            </th>
          </tr>
        </thead>
        <tbody>
          {data.nodes.map((n) => (
            <tr
              key={n.id}
              className={cn("border-b", ancestors.has(n.id) && "bg-accent")}
            >
              <th scope="row" className="p-3">
                <Button
                  variant="link"
                  className="h-auto whitespace-normal p-0 text-left"
                  onClick={() => onSelect(n.id)}
                >
                  {n.name}
                </Button>
                {n.recommended && <RecommendedConcept />}
              </th>
              <td className="p-3">
                <MasteryChip level={n.level} />
                {n.locked && (
                  <p className="mt-1 text-muted-foreground">Chưa mở khoá</p>
                )}
              </td>
              <td className="p-3">
                {data.edges
                  .filter((e) => e.to === n.id)
                  .map((e) => data.nodes.find((p) => p.id === e.from)?.name)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const masteryColors = [
  "bg-card text-foreground",
  "bg-viz-s1 text-foreground",
  "bg-viz-s2 text-foreground",
  "bg-viz-s3 text-viz-on-s4",
  "bg-viz-s4 text-viz-on-s4",
];
const shortMasteryLabel = (level: ConceptNode["level"]) =>
  level === 0 ? MASTERY_LABELS[0] : level < 3 ? "Đang học" : "Thành thạo";

export function KnowledgeMapLegend() {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-2 text-sm leading-[1.55]"
      aria-label="Mức thành thạo"
    >
      {MASTERY_LEVELS.map((level) => (
        <li key={level} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-3 rounded-[3px]",
              masteryColors[level],
              level === 0 && "border border-border-strong",
            )}
          />
          {MASTERY_LABELS[level]}
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeMapMastery({ data }: { data: KnowledgeMapView }) {
  return (
    <Card className="gap-3 rounded-lg border border-border p-4 text-base leading-[1.55] shadow-none! ring-0 min-[481px]:p-5">
      <CardHeader className="px-0">
        <CardTitle className="text-base leading-[1.4]">
          Theo mức thành thạo
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-0">
        {[...data.nodes]
          .sort((a, b) => b.level - a.level)
          .map((n) => (
            <div
              key={n.id}
              className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-0.5 text-sm min-[481px]:grid-cols-[minmax(96px,34%)_minmax(0,1fr)_auto]"
            >
              <span className="break-words leading-[1.35]">{n.name}</span>
              <span
                role="meter"
                aria-label={n.name}
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={n.level}
                aria-valuetext={
                  n.locked ? "Chưa mở khoá" : MASTERY_LABELS[n.level]
                }
                className="col-span-2 row-start-2 h-3 overflow-hidden rounded bg-muted min-[481px]:col-span-1 min-[481px]:row-start-auto"
              >
                <span
                  className="block h-full rounded bg-viz-1"
                  style={{ width: `${n.level * 25}%` }}
                />
              </span>
              <span className="whitespace-nowrap text-right text-foreground tabular-nums">
                {n.locked ? "Chưa mở khoá" : shortMasteryLabel(n.level)}
              </span>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
export function KnowledgeMapNode({
  n,
  pos,
  selected,
  highlighted,
  onSelect,
}: {
  n: ConceptNode;
  pos: { x: number; y: number };
  selected: boolean;
  highlighted: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${n.name}: ${n.locked ? "Chưa mở khoá" : MASTERY_LABELS[n.level]}${n.recommended ? " · Bài học được gợi ý" : ""}`}
      title={`${n.name} — ${n.locked ? "Chưa mở khoá — cần học khái niệm tiên quyết trước" : MASTERY_LABELS[n.level]}`}
      onClick={() => onSelect(n.id)}
      className={cn(
        "absolute grid content-center gap-0.5 rounded-md border border-border-strong px-2.5 py-1.5 text-left outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        masteryColors[n.level],
        n.locked && "border-dashed bg-card text-muted-foreground",
        highlighted && "border-2 border-viz-1",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: KNOWLEDGE_NODE.width,
        height: KNOWLEDGE_NODE.height,
      }}
    >
      <span className="line-clamp-2 text-[13px] font-semibold leading-[1.3]">
        {n.name}
      </span>
      <span
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-[1.55]",
          n.level < 3 && "text-muted-foreground",
        )}
      >
        {n.locked ? (
          <>
            <LockKeyhole aria-hidden="true" className="size-3.5" /> Chưa mở khoá
          </>
        ) : (
          <>
            <span aria-hidden="true" className="inline-flex gap-0.5">
              {MASTERY_LEVELS.filter((level) => level > 0).map((level) => (
                <span
                  key={level}
                  className={cn(
                    "h-1 w-2 rounded-sm bg-border-strong",
                    level <= n.level &&
                      (n.level >= 3 ? "bg-viz-on-s4" : "bg-viz-1"),
                  )}
                />
              ))}
            </span>
            {shortMasteryLabel(n.level)}
          </>
        )}
      </span>
      {n.recommended && (
        <>
          <Lightbulb
            aria-hidden="true"
            className="absolute right-1 top-1 size-3"
          />
          <span className="sr-only">Bài học được gợi ý</span>
        </>
      )}
    </button>
  );
}

export function ConceptDetails({
  data,
  node,
}: {
  data: KnowledgeMapView;
  node: ConceptNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{node.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        <MasteryChip level={node.level} />
        {node.recommended && <RecommendedConcept />}
        <p className="text-sm text-muted-foreground">
          {node.evidenceCount
            ? `${node.evidenceCount} bằng chứng · Xác suất BKT ${Math.round((node.probability ?? 0) * 100)}%`
            : "Chưa có bằng chứng học tập."}
        </p>
        <h3 className="font-semibold">Bài học liên quan</h3>
        {!node.lessons.length && (
          <p className="text-sm text-muted-foreground">
            Chưa có bài được xuất bản cho khái niệm này.
          </p>
        )}
        <ul className="space-y-2">
          {node.lessons.map((lesson) => (
            <li key={lesson.id}>
              {lesson.locked ? (
                <span className="text-muted-foreground">
                  {lesson.title} · Bị khoá, cần hoàn thành bài tiên quyết
                </span>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {lesson.title}
                  </span>
                  <Link
                    href={
                      `/learn/${encodeURIComponent(data.courseId!)}/${encodeURIComponent(lesson.id)}` as Route
                    }
                    className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
                    aria-label={`Học bài này: ${lesson.title}`}
                  >
                    Học bài này <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function EmptyKnowledgeMap({ data }: { data: KnowledgeMapView }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-8">
        <MapIcon className="size-8 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Chưa có bản đồ kiến thức</h2>
        <p className="text-muted-foreground">
          {data.courseId
            ? "Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết của khoá học."
            : "Hãy đăng ký một khoá học để theo dõi các khái niệm của bạn."}
        </p>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={
            data.courseId
              ? (`/learn/${encodeURIComponent(data.courseId)}` as Route)
              : "/courses"
          }
        >
          {" "}
          {data.courseId ? "Về lộ trình" : "Khám phá khóa học"}
        </Link>
      </CardContent>
    </Card>
  );
}
