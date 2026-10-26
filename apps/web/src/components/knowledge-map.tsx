"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BarChart3, ChevronDown, Lightbulb, LoaderCircle } from "lucide-react";
import { Alert } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { LearnerKnowledgeGraphLines } from "@codi-1/ui/components/learner-knowledge-graph-lines";
import { knowledgeGraphLayout } from "@codi-1/ui/lib/knowledge-graph-layout";
import { MASTERY_LABELS } from "@codi-1/ui/lib/mastery";
import {
  graphLayers,
  type KnowledgeMapView,
} from "@/lib/learning-path-contract";
import {
  KnowledgeMapList,
  KnowledgeMapNode,
  KnowledgeMapLegend,
  KnowledgeMapMastery,
  ConceptDetails,
  EmptyKnowledgeMap,
} from "./knowledge-map-sections";

export default function KnowledgeMap({
  initialCourseId,
  embedded = false,
}: {
  initialCourseId?: string;
  embedded?: boolean;
}) {
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [data, setData] = useState<KnowledgeMapView | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [list, setList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/insights/knowledge-map${courseId ? `?course=${encodeURIComponent(courseId)}` : ""}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Không thể tải bản đồ.");
        if (!controller.signal.aborted) {
          setData(body);
          setError(null);
          setSelected(null);
          setList(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Không thể tải bản đồ.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [courseId, refresh]);
  const graph = useMemo(
    () =>
      knowledgeGraphLayout(
        data
          ? graphLayers(
              data.nodes.map((n) => n.id),
              data.edges,
            )
          : [],
      ),
    [data],
  );
  const ancestors = useMemo(() => {
    const result = new Set<number>();
    const visit = (nodeId: number) => {
      if (result.has(nodeId)) return;
      result.add(nodeId);
      data?.edges.filter((e) => e.to === nodeId).forEach((e) => visit(e.from));
    };
    if (selected !== null) visit(selected);
    return result;
  }, [selected, data]);
  const node = data?.nodes.find((n) => n.id === selected);
  const next = data?.nodes
    .filter((n) => !n.locked && n.level < 3)
    .sort((a, b) => a.level - b.level)[0];
  return (
    <section
      className="min-w-0 space-y-5"
      aria-label="Bản đồ kiến thức của tôi"
    >
      {!embedded && (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-2xl">
              Bản đồ kiến thức của tôi
            </h1>
            <p className="text-base leading-[1.55] text-muted-foreground">
              Mỗi ô là một khái niệm; mũi tên chỉ khái niệm cần học trước.
            </p>
          </div>
          <Link
            href={"/insights/stats" as Route}
            className={buttonVariants({ variant: "outline" })}
          >
            <BarChart3 className="size-4" /> Thống kê học tập
          </Link>
        </header>
      )}
      {error && (
        <Alert variant="destructive">
          {error}
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          >
            Thử lại
          </Button>
        </Alert>
      )}
      {loading ? (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle className="size-5 animate-spin" /> Đang tải bản đồ…
        </p>
      ) : (
        data && (
          <>
            {!embedded && data.courses.length > 1 && (
              <div>
                <label htmlFor={`${id}-course`} className="sr-only">
                  Khoá học
                </label>
                <select
                  id={`${id}-course`}
                  value={data.courseId ?? ""}
                  className="min-h-10 max-w-full rounded-md border border-border-strong bg-background px-3 text-sm"
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setData(null);
                    setSelected(null);
                    setLoading(true);
                    setError(null);
                  }}
                >
                  <option value="" disabled>
                    Chọn khoá học
                  </option>
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!data.confirmed || !data.nodes.length ? (
              <EmptyKnowledgeMap data={data} />
            ) : (
              <div>
                <div>
                  {next && (
                    <p className="flex items-center gap-1 text-sm leading-[1.55]">
                      <Lightbulb
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span>
                        Nên ôn tiếp: <strong>{next.name}</strong> (
                        {MASTERY_LABELS[next.level]}).
                      </span>
                    </p>
                  )}
                  <Card className="gap-3 rounded-lg border border-border p-4 text-base leading-[1.55] shadow-none! ring-0 min-[481px]:p-5">
                    <CardHeader className="gap-0.5 px-0">
                      <CardTitle className="text-base leading-[1.4]">
                        {data.title}
                      </CardTitle>
                      <p className="text-sm leading-[1.55] text-muted-foreground">
                        {data.nodes.filter((n) => n.level >= 3).length}/
                        {data.nodes.length} khái niệm đã thành thạo ·{" "}
                        {data.nodes.filter((n) => n.locked).length} chưa mở khoá
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3 px-0">
                      <KnowledgeMapLegend />
                      <div
                        className="overflow-x-auto rounded-md bg-muted"
                        tabIndex={0}
                        role="group"
                        aria-label="Sơ đồ khái niệm, cuộn để xem toàn bộ"
                      >
                        <div
                          className="relative mx-auto"
                          style={{ width: graph.width, height: graph.height }}
                        >
                          <LearnerKnowledgeGraphLines
                            id={id}
                            width={graph.width}
                            height={graph.height}
                            positions={graph.positions}
                            edges={data.edges}
                            highlighted={ancestors}
                          />
                          {data.nodes.map((n) => (
                            <KnowledgeMapNode
                              key={n.id}
                              n={n}
                              pos={graph.positions.get(n.id)!}
                              selected={selected === n.id}
                              highlighted={ancestors.has(n.id)}
                              onSelect={(value) =>
                                setSelected((current) =>
                                  current === value ? null : value,
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <button
                          type="button"
                          aria-label="Xem dạng danh sách"
                          aria-expanded={list}
                          aria-controls={`${id}-table`}
                          className="flex min-h-8 items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => setList((value) => !value)}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`size-3 transition-transform ${list ? "rotate-180" : ""}`}
                          />{" "}
                          Bảng số liệu
                        </button>
                        <div
                          id={`${id}-table`}
                          hidden={!list}
                          className="mt-2 max-h-80 overflow-auto"
                        >
                          {list && (
                            <KnowledgeMapList
                              data={data}
                              ancestors={ancestors}
                              onSelect={setSelected}
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {node && (
                  <div className="my-5">
                    <ConceptDetails data={data} node={node} />
                  </div>
                )}
                <KnowledgeMapMastery data={data} />
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
