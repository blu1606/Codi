"use client";
import Link from "next/link";
import type { Route } from "next";
import { LockKeyhole, Map as MapIcon, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { cn } from "@codi-1/ui/lib/utils";
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
  "bg-mastery-0",
  "bg-mastery-1",
  "bg-mastery-2",
  "bg-mastery-3",
  "bg-mastery-4",
];
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
      onClick={() => onSelect(n.id)}
      className={cn(
        "absolute flex h-32 w-56 flex-col justify-center gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-sm",
        highlighted && "border-primary ring-2 ring-primary",
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn("size-3 shrink-0 rounded-full", masteryColors[n.level])}
        />
        <strong className="truncate">{n.name}</strong>
      </span>
      <MasteryChip level={n.level} />
      {n.recommended && <RecommendedConcept />}
      {n.locked && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3" /> Chưa mở khoá
        </span>
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
