"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Expand, List, LoaderCircle, LockKeyhole, Map as MapIcon, Minus, Plus } from "lucide-react";
import { Alert } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { KnowledgeGraphLines, KnowledgeGraphMinimap } from "@codi-1/ui/components/knowledge-graph-lines";
import { cn } from "@codi-1/ui/lib/utils";
import { graphLayers, type KnowledgeMapView } from "@/lib/learning-path-contract";

const masteryColors = ["bg-mastery-0", "bg-mastery-1", "bg-mastery-2", "bg-mastery-3", "bg-mastery-4"];
export default function KnowledgeMap({ initialCourseId, embedded = false }: { initialCourseId?: string; embedded?: boolean }) {
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [data, setData] = useState<KnowledgeMapView | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [list, setList] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/insights/knowledge-map${courseId ? `?course=${encodeURIComponent(courseId)}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Không thể tải bản đồ."); if (!controller.signal.aborted) { setData(body); setError(null); setSelected(null); setZoom(1); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải bản đồ."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, refresh]);
  const graph = useMemo(() => {
    if (!data) return { positions: new Map<number, { x: number; y: number }>(), width: 320, height: 240 };
    const layers = graphLayers(data.nodes.map((n) => n.id), data.edges);
    const positions = new Map(layers.flatMap((layer, column) => layer.map((nodeId, row) => [nodeId, { x: 24 + column * 280, y: 24 + row * 144 }] as const)));
    return { positions, width: Math.max(320, layers.length * 280 + 24), height: Math.max(240, Math.max(0, ...layers.map((l) => l.length)) * 144 + 24) };
  }, [data]);
  const ancestors = useMemo(() => {
    const result = new Set<number>();
    const visit = (nodeId: number) => { if (result.has(nodeId)) return; result.add(nodeId); data?.edges.filter((e) => e.to === nodeId).forEach((e) => visit(e.from)); };
    if (selected !== null) visit(selected);
    return result;
  }, [selected, data]);
  const node = data?.nodes.find((n) => n.id === selected);
  const fit = () => { if (viewport.current) setZoom(Math.max(0.25, Math.min(1.5, (viewport.current.clientWidth - 16) / graph.width, 400 / graph.height))); };
  return <section className="space-y-5" aria-label="Bản đồ kiến thức của tôi">
    {!embedded && <header className="space-y-2"><h1 className="text-2xl font-semibold">Bản đồ kiến thức của tôi</h1><p className="text-muted-foreground">Mỗi ô là một khái niệm; mũi tên chỉ khái niệm cần học trước.</p></header>}
    {error && <Alert variant="destructive">{error}<Button variant="outline" onClick={() => { setLoading(true); setRefresh((n) => n + 1); }}>Thử lại</Button></Alert>}
    {loading ? <p role="status" className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" /> Đang tải bản đồ…</p> : data && <>
      {!embedded && data.courses.length > 0 && <div className="space-y-2"><label htmlFor={`${id}-course`} className="block text-sm font-medium">Khoá học</label><select id={`${id}-course`} value={data.courseId ?? ""} className="min-h-11 w-full rounded-md border border-input bg-background px-3 sm:max-w-md" onChange={(event) => { setCourseId(event.target.value); setData(null); setLoading(true); }}><option value="" disabled>Chọn khoá học</option>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>}
      {!data.confirmed || !data.nodes.length ? <Card><CardContent className="space-y-3 py-8"><MapIcon className="size-8 text-muted-foreground" /><h2 className="text-xl font-semibold">Chưa có bản đồ kiến thức</h2><p className="text-muted-foreground">{data.courseId ? "Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết của khoá học." : "Hãy đăng ký một khoá học để theo dõi các khái niệm của bạn."}</p><Link className={buttonVariants({ variant: "outline" })} href={data.courseId ? `/learn/${encodeURIComponent(data.courseId)}` as Route : "/courses"}> {data.courseId ? "Về lộ trình" : "Khám phá khóa học"}</Link></CardContent></Card> : <>
        <Card><CardHeader className="gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{data.title}</CardTitle><Button variant="outline" aria-pressed={list} onClick={() => setList((value) => !value)}>{list ? <MapIcon className="size-4" /> : <List className="size-4" />}{list ? "Xem sơ đồ" : "Xem dạng danh sách"}</Button></div><p className="text-sm text-muted-foreground">{data.nodes.filter((n) => n.level >= 3).length}/{data.nodes.length} khái niệm đã thành thạo · {data.nodes.filter((n) => n.locked).length} chưa mở khoá. Chọn khái niệm để xem các bài và đường tiên quyết.</p></CardHeader><CardContent className="space-y-4">
          {list ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Khái niệm, mức thành thạo và khái niệm cần học trước</caption><thead><tr className="border-b"><th scope="col" className="p-3">Khái niệm</th><th scope="col" className="p-3">Mức thành thạo</th><th scope="col" className="p-3">Cần học trước</th></tr></thead><tbody>{data.nodes.map((n) => <tr key={n.id} className={cn("border-b", ancestors.has(n.id) && "bg-accent")}><th scope="row" className="p-3"><Button variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={() => setSelected(n.id)}>{n.name}</Button></th><td className="p-3"><MasteryChip level={n.level} />{n.locked && <p className="mt-1 text-muted-foreground">Chưa mở khoá</p>}</td><td className="p-3">{data.edges.filter((e) => e.to === n.id).map((e) => data.nodes.find((p) => p.id === e.from)?.name).join(", ") || "—"}</td></tr>)}</tbody></table></div> : <>
            <div className="flex flex-wrap items-center gap-2" aria-label="Điều khiển sơ đồ"><Button size="icon" variant="outline" aria-label="Thu nhỏ" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}><Minus className="size-4" /></Button><output className="min-w-12 text-center text-sm" aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output><Button size="icon" variant="outline" aria-label="Phóng to" onClick={() => setZoom((value) => Math.min(2, value + 0.25))}><Plus className="size-4" /></Button><Button variant="outline" onClick={fit}><Expand className="size-4" /> Vừa khung</Button>{selected !== null && <Button variant="ghost" onClick={() => setSelected(null)}>Bỏ chọn</Button>}</div>
            <div ref={viewport} className="h-[420px] overflow-auto rounded-lg border border-border bg-muted/30" tabIndex={0} aria-label="Sơ đồ khái niệm, cuộn để xem toàn bộ"><div style={{ width: graph.width * zoom, height: graph.height * zoom }}><div className="relative origin-top-left" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
              <KnowledgeGraphLines id={id} width={graph.width} height={graph.height} positions={graph.positions} edges={data.edges} highlighted={ancestors} />
              {data.nodes.map((n) => { const pos = graph.positions.get(n.id)!; return <button type="button" key={n.id} aria-pressed={selected === n.id} onClick={() => setSelected(n.id)} className={cn("absolute flex h-28 w-56 flex-col justify-center gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-sm", ancestors.has(n.id) && "border-primary ring-2 ring-primary")} style={{ left: pos.x, top: pos.y }}><span className="flex min-w-0 items-center gap-2"><span className={cn("size-3 shrink-0 rounded-full", masteryColors[n.level])} /><strong className="truncate">{n.name}</strong></span><MasteryChip level={n.level} />{n.locked && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3" /> Chưa mở khoá</span>}</button>; })}
            </div></div></div>
            <div className="flex flex-wrap items-end justify-between gap-3"><p className="max-w-lg text-xs text-muted-foreground">Bản đồ chỉ đọc. Mức thành thạo được tính bằng BKT từ kết quả làm bài; “Chưa học” nghĩa là chưa có bằng chứng. Danh sách cung cấp đầy đủ dữ liệu tương đương sơ đồ.</p><button type="button" className="rounded border border-border bg-muted p-2 text-left" onClick={fit} aria-label="Bản đồ thu nhỏ: xem toàn bộ"><span className="mb-1 block text-xs text-muted-foreground">Toàn bản đồ</span><KnowledgeGraphMinimap width={graph.width} height={graph.height} positions={graph.positions} edges={data.edges} highlighted={ancestors} /></button></div>
          </>}
        </CardContent></Card>
        {node && <Card><CardHeader><CardTitle>{node.name}</CardTitle></CardHeader><CardContent className="space-y-3" aria-live="polite"><MasteryChip level={node.level} /><p className="text-sm text-muted-foreground">{node.evidenceCount ? `${node.evidenceCount} bằng chứng · Xác suất BKT ${Math.round((node.probability ?? 0) * 100)}%` : "Chưa có bằng chứng học tập."}</p><h3 className="font-semibold">Bài học liên quan</h3>{!node.lessons.length && <p className="text-sm text-muted-foreground">Chưa có bài được xuất bản cho khái niệm này.</p>}<ul className="space-y-2">{node.lessons.map((lesson) => <li key={lesson.id}>{lesson.locked ? <span className="text-muted-foreground">{lesson.title} · Bị khoá, cần hoàn thành bài tiên quyết</span> : <Link href={`/learn/${encodeURIComponent(data.courseId!)}/${encodeURIComponent(lesson.id)}` as Route} className="text-primary hover:underline">{lesson.title}</Link>}</li>)}</ul></CardContent></Card>}
      </>}
    </>}
  </section>;
}
