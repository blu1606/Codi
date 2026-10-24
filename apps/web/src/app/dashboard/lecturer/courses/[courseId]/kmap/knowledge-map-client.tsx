"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FilePen,
  Filter,
  Layers,
  List,
  Loader2,
  Map as MapIcon,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Undo2,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@codi-1/ui/components/empty";
import { Input } from "@codi-1/ui/components/input";
import {
  KnowledgeGraphLines,
  KnowledgeGraphMinimap,
} from "@codi-1/ui/components/knowledge-graph-lines";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { cn } from "@codi-1/ui/lib/utils";
import {
  computeAcceptAllPlan,
  computeLecturerGraphLayers,
  findCycle,
  topoSortLessons,
  type KnowledgeGraphConcept,
  type KnowledgeGraphEdge,
} from "@/lib/knowledge-map-runner";
import {
  acceptAllKnowledgeMap,
  addKnowledgeMapEdge,
  confirmKnowledgeMap,
  type KnowledgeMapDataDto,
  renameKnowledgeMapConcept,
  reviewKnowledgeMapItem,
  runKnowledgeMapAnalysis,
} from "./actions";

interface KnowledgeMapClientProps {
  initialData: KnowledgeMapDataDto;
  courseId: string;
}

export function KnowledgeMapClient({ initialData, courseId }: KnowledgeMapClientProps) {
  const router = useRouter();
  const graphId = useId();

  // Refresh saved graph data without resetting local drafts or view controls.
  const [data, setData] = useState<KnowledgeMapDataDto>(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [chapterFilter, setChapterFilter] = useState<string>("all");
  const [zoom, setZoom] = useState<number>(1);

  // Loading states
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [showAcceptAllDialog, setShowAcceptAllDialog] = useState(false);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Add edge form state (for list view)
  const [newEdgeFrom, setNewEdgeFrom] = useState<string>("");
  const [newEdgeTo, setNewEdgeTo] = useState<string>("");
  const [isAddingEdge, setIsAddingEdge] = useState(false);

  const { course, concepts, edges, isLocked, chapters, lessons } = data;

  // Active / Live items (excluding declined)
  const liveConcepts = useMemo(() => concepts.filter((c) => c.review !== "declined"), [concepts]);
  const liveConceptIds = useMemo(() => new Set(liveConcepts.map((c) => c.id)), [liveConcepts]);

  const activeEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          e.review !== "declined" &&
          liveConceptIds.has(e.from) &&
          liveConceptIds.has(e.to)
      ),
    [edges, liveConceptIds]
  );

  const cycle = useMemo(
    () => findCycle([...liveConceptIds], activeEdges),
    [liveConceptIds, activeEdges]
  );
  const defaultOrder = useMemo(
    () => topoSortLessons(concepts, edges, lessons),
    [concepts, edges, lessons]
  );

  // Pending items count
  const pendingConcepts = useMemo(
    () => concepts.filter((c) => c.review === "suggested").length,
    [concepts]
  );
  const pendingEdges = useMemo(
    () => edges.filter((e) => e.review === "suggested").length,
    [edges]
  );
  const totalPending = pendingConcepts + pendingEdges;

  const acceptedConcepts = useMemo(
    () => concepts.filter((c) => c.review === "accepted" || c.review === "edited").length,
    [concepts]
  );
  const acceptedEdges = useMemo(
    () => edges.filter((e) => e.review === "accepted" || e.review === "edited").length,
    [edges]
  );
  const totalAccepted = acceptedConcepts + acceptedEdges;

  // Selected concept for side panel
  const selectedConcept = useMemo(
    () => (selectedNodeId ? concepts.find((c) => c.id === selectedNodeId) : null),
    [selectedNodeId, concepts]
  );

  // Helper map for concept name lookup
  const conceptNameMap = useMemo(() => {
    const map = new Map<number, string>();
    concepts.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [concepts]);

  // Concept to chapter mapping based on related lessons
  const conceptChapterMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    const lessonChapter = new Map(lessons.map((l) => [l.id, l.chapterId]));
    for (const c of concepts) {
      const set = new Set<string>();
      (c.lessonIds || []).forEach((lid) => {
        const ch = lessonChapter.get(lid);
        if (ch) set.add(ch);
      });
      map.set(c.id, set);
    }
    return map;
  }, [concepts, lessons]);

  // Filtered concepts according to chapter selection
  const filteredConceptIds = useMemo(() => {
    if (chapterFilter === "all") return liveConceptIds;
    const set = new Set<number>();
    for (const [cid, chaptersSet] of conceptChapterMap.entries()) {
      if (chaptersSet.has(chapterFilter) && liveConceptIds.has(cid)) {
        set.add(cid);
      }
    }
    return set;
  }, [chapterFilter, liveConceptIds, conceptChapterMap]);

  // Highlighted nodes when hovering or selecting a node
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<number>();
    const highlighted = new Set<number>([selectedNodeId]);
    for (const e of activeEdges) {
      if (e.from === selectedNodeId) highlighted.add(e.to);
      if (e.to === selectedNodeId) highlighted.add(e.from);
    }
    return highlighted;
  }, [selectedNodeId, activeEdges]);

  // Cycle edges for red highlight
  const cycleEdgesSet = useMemo(() => {
    const set = new Set<string>();
    if (cycle && cycle.length > 1) {
      for (let i = 0; i < cycle.length - 1; i++) {
        set.add(`${cycle[i]}:${cycle[i + 1]}`);
      }
    }
    return set;
  }, [cycle]);

  const cycleNodesSet = useMemo(() => new Set(cycle || []), [cycle]);

  // Graph layout calculation (DAG columns & positions)
  const graph = useMemo(() => {
    if (liveConcepts.length === 0) {
      return {
        positions: new Map<number, { x: number; y: number }>(),
        width: 600,
        height: 400,
      };
    }

    const nodeIds = liveConcepts.map((c) => c.id);
    const layers = computeLecturerGraphLayers(nodeIds, activeEdges);

    const positions = new Map<number, { x: number; y: number }>();
    let maxRow = 0;

    layers.forEach((layer, col) => {
      if (layer.length > maxRow) maxRow = layer.length;
      layer.forEach((nodeId, row) => {
        positions.set(nodeId, {
          x: 40 + col * 320,
          y: 40 + row * 160,
        });
      });
    });

    const width = Math.max(800, layers.length * 320 + 80);
    const height = Math.max(500, maxRow * 160 + 80);

    return { positions, width, height };
  }, [liveConcepts, activeEdges]);

  // Can confirm knowledge map guard
  const canConfirm =
    !isLocked &&
    !cycle &&
    totalPending === 0 &&
    liveConcepts.length > 0 &&
    course.knowledgeMapStatus !== "confirmed" &&
    course.knowledgeMapStatus !== "stale";

  // Pre-calculate accept all statistics for dialog
  const acceptAllPreview = useMemo(() => {
    const suggestedConcepts = concepts.filter((c) => c.review === "suggested");
    const suggestedEdges = edges
      .filter((e) => e.review === "suggested")
      .map((e) => ({ from: e.from, to: e.to }));
    const keptEdges = edges
      .filter((e) => e.review === "accepted" || e.review === "edited")
      .map((e) => ({ from: e.from, to: e.to }));

    return computeAcceptAllPlan(
      suggestedConcepts.map((c) => c.id),
      suggestedEdges,
      keptEdges
    );
  }, [concepts, edges]);

  // Action: Run AI Analysis
  const handleRunAnalysis = async () => {
    if (isLocked) return;
    try {
      setIsAnalysing(true);
      const res = await runKnowledgeMapAnalysis(courseId);
      if (res.success) {
        toast.success(`Đã phân tích xong bản đồ kiến thức (${res.count} khái niệm).`);
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || "Phân tích thất bại. Vui lòng thử lại.");
    } finally {
      setIsAnalysing(false);
    }
  };

  // Action: Review Item (Chấp nhận / Bỏ / Khôi phục)
  const handleReviewItem = async (
    kind: "concept" | "edge",
    id: number | { from: number; to: number },
    review: "suggested" | "accepted" | "edited" | "declined"
  ) => {
    if (isLocked) return;
    try {
      if (kind === "concept") {
        const skillId = id as number;
        await reviewKnowledgeMapItem(courseId, "concept", { skillId, review });
        setData((prev) => ({
          ...prev,
          course: {
            ...prev.course,
            knowledgeMapStatus: prev.course.knowledgeMapStatus === "confirmed" ? "ready" : prev.course.knowledgeMapStatus,
          },
          concepts: prev.concepts.map((c) => (c.id === skillId ? { ...c, review } : c)),
        }));
      } else {
        const edgeId = id as { from: number; to: number };
        await reviewKnowledgeMapItem(courseId, "edge", {
          fromSkillId: edgeId.from,
          toSkillId: edgeId.to,
          review,
        });
        setData((prev) => ({
          ...prev,
          course: {
            ...prev.course,
            knowledgeMapStatus: prev.course.knowledgeMapStatus === "confirmed" ? "ready" : prev.course.knowledgeMapStatus,
          },
          edges: prev.edges.map((e) =>
            e.from === edgeId.from && e.to === edgeId.to ? { ...e, review } : e
          ),
        }));
      }
      toast.success(
        review === "accepted"
          ? "Đã chấp nhận đề xuất."
          : review === "declined"
          ? "Đã bỏ đề xuất."
          : "Đã cập nhật trạng thái đề xuất."
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi cập nhật.");
    }
  };

  // Action: Rename Concept
  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim() || isLocked) return;
    try {
      setIsRenaming(true);
      await renameKnowledgeMapConcept(courseId, renameTarget.id, renameValue.trim());
      setData((prev) => ({
        ...prev,
        course: {
          ...prev.course,
          knowledgeMapStatus: prev.course.knowledgeMapStatus === "confirmed" ? "ready" : prev.course.knowledgeMapStatus,
        },
        concepts: prev.concepts.map((c) =>
          c.id === renameTarget.id ? { ...c, name: renameValue.trim(), review: "edited" } : c
        ),
      }));
      toast.success("Đã đổi tên khái niệm.");
      setRenameTarget(null);
      setRenameValue("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi đổi tên.");
    } finally {
      setIsRenaming(false);
    }
  };

  // Action: Add Prerequisite Edge
  const handleAddEdge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEdgeFrom || !newEdgeTo || isLocked) return;
    const fromId = Number(newEdgeFrom);
    const toId = Number(newEdgeTo);
    if (fromId === toId) {
      toast.error("Một khái niệm không thể cần học trước chính nó.");
      return;
    }
    try {
      setIsAddingEdge(true);
      await addKnowledgeMapEdge(courseId, fromId, toId);
      setData((prev) => {
        const existingIdx = prev.edges.findIndex((x) => x.from === fromId && x.to === toId);
        let newEdges = [...prev.edges];
        if (existingIdx >= 0) {
          newEdges[existingIdx] = { ...newEdges[existingIdx], review: "accepted" };
        } else {
          newEdges.push({ from: fromId, to: toId, source: "lecturer", review: "accepted" });
        }
        return {
          ...prev,
          course: {
            ...prev.course,
            knowledgeMapStatus: prev.course.knowledgeMapStatus === "confirmed" ? "ready" : prev.course.knowledgeMapStatus,
          },
          edges: newEdges,
        };
      });
      toast.success("Đã thêm quan hệ tiên quyết.");
      setNewEdgeFrom("");
      setNewEdgeTo("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi thêm quan hệ.");
    } finally {
      setIsAddingEdge(false);
    }
  };

  // Action: Accept All (D10)
  const handleAcceptAllConfirm = async () => {
    if (isLocked) return;
    try {
      setIsAcceptingAll(true);
      const res = await acceptAllKnowledgeMap(courseId);
      if (res.success) {
        setShowAcceptAllDialog(false);
        const total = res.acceptedConceptsCount + res.acceptedEdgesCount;
        if (res.skippedEdgesCount > 0) {
          toast.info(
            `Đã chấp nhận ${total} đề xuất. Có ${res.skippedEdgesCount} quan hệ tạo vòng lặp cần bạn xử lý riêng.`
          );
        } else {
          toast.success(`Đã chấp nhận ${total} đề xuất. Kiểm tra lại rồi xác nhận bản đồ.`);
        }
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi chấp nhận tất cả.");
    } finally {
      setIsAcceptingAll(false);
    }
  };

  // Action: Confirm Knowledge Map
  const handleConfirmMap = async () => {
    if (!canConfirm || isLocked) return;
    try {
      setIsConfirming(true);
      await confirmKnowledgeMap(courseId);
      setData((prev) => ({
        ...prev,
        course: {
          ...prev.course,
          knowledgeMapStatus: "confirmed",
          requiresReconfirmation: false,
        },
      }));
      toast.success("Đã xác nhận bản đồ kiến thức.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xác nhận bản đồ.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & STATUS BANNERS (STATE-MACHINES §18, PRODUCT S24)
          ───────────────────────────────────────────────────────────── */}
      {course.requiresReconfirmation && (
        <Alert variant="info">
          <AlertTitle>Cần xác nhận lại để áp dụng cho học viên</AlertTitle>
          <AlertDescription>
            Bản đồ cũ chưa có bản phát hành đã xác nhận. Hãy kiểm tra và xác nhận lại;
            dữ liệu thành thạo và tiến độ hiện có không bị đặt lại.
          </AlertDescription>
        </Alert>
      )}
      {course.knowledgeMapStatus === "empty" && (
        <Card className="border border-dashed border-border/80">
          <CardContent className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MapIcon className="size-5 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>Chưa có nội dung để phân tích</EmptyTitle>
                <EmptyDescription>
                  Thêm ít nhất một bài học vào khoá học, sau đó Codi sẽ tự động trích xuất các khái niệm
                  và quan hệ "cần học trước" để bạn xem lại.
                </EmptyDescription>
              </EmptyHeader>
              <Link
                href={`/dashboard/lecturer/courses/${courseId}/content`}
                className={cn(buttonVariants({ variant: "default" }), "gap-2 cursor-pointer shadow-xs")}
              >
                <BookOpen className="size-4" />
                Thêm nội dung bài học
              </Link>
            </Empty>
          </CardContent>
        </Card>
      )}

      {course.knowledgeMapStatus === "analysing" && (
        <Card className="border border-border/80 bg-card/60">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="size-8 text-primary animate-spin" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Đang phân tích nội dung…</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                AI đang trích xuất các khái niệm cốt lõi từ các bài học. Bạn sẽ nhận thông báo khi hoàn tất;
                bạn có thể rời khỏi trang này bất cứ lúc nào.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {course.knowledgeMapStatus === "failed" && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle className="font-semibold">Phân tích bản đồ kiến thức thất bại</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>Dịch vụ AI không phản hồi lúc này. Nội dung khoá học của bạn không bị ảnh hưởng.</span>
            {!isLocked && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAnalysis}
                disabled={isAnalysing}
                className="gap-1.5 cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", isAnalysing && "animate-spin")} />
                Thử lại
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {course.knowledgeMapStatus === "stale" && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-semibold">Nội dung đã thay đổi sau khi xác nhận</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>Bản đồ hiện tại có thể không còn khớp với các bài học vừa sửa. Hãy phân tích lại và xác nhận.</span>
            {!isLocked && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAnalysis}
                disabled={isAnalysing}
                className="gap-1.5 cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", isAnalysing && "animate-spin")} />
                Phân tích lại
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {course.knowledgeMapStatus === "confirmed" && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="font-semibold">Bản đồ kiến thức đã được xác nhận</AlertTitle>
          <AlertDescription>
            Bản đồ đang hoạt động chính thức. Lộ trình cá nhân hoá của học viên sẽ sử dụng thứ tự khái niệm này.
          </AlertDescription>
        </Alert>
      )}

      {course.knowledgeMapStatus === "ready" && totalPending > 0 && (
        <Alert variant="info">
          <Sparkles className="size-4" />
          <AlertTitle className="font-semibold">
            {totalAccepted > 0
              ? `Đang duyệt dở dang (Partially accepted) — ${totalAccepted} mục đã duyệt, còn ${totalPending} mục chờ xem lại`
              : `Sẵn sàng xem lại (Ready for review) — còn ${totalPending} mục do AI đề xuất`}
          </AlertTitle>
          <AlertDescription>
            Chấp nhận, sửa hoặc bỏ từng khái niệm và quan hệ "cần học trước". Bản đồ chỉ được dùng sau khi bạn xác nhận.
          </AlertDescription>
        </Alert>
      )}

      {course.knowledgeMapStatus === "ready" && totalPending === 0 && !cycle && (
        <Alert variant="info">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="font-semibold">Đã xem lại mọi đề xuất</AlertTitle>
          <AlertDescription>
            Tất cả khái niệm và quan hệ đã được kiểm tra. Hãy bấm "Xác nhận bản đồ kiến thức" bên dưới để áp dụng.
          </AlertDescription>
        </Alert>
      )}

      {/* Cảnh báo vòng lặp (Cycle Detection Error Banner) */}
      {cycle && cycle.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-semibold">
            Phát hiện vòng lặp phụ thuộc: {cycle.map((id) => conceptNameMap.get(id) || `K-${id}`).join(" → ")}
          </AlertTitle>
          <AlertDescription>
            Đồ thị học tập không thể có chu trình tuần hoàn. Hãy bỏ hoặc sửa ít nhất một quan hệ để phá vòng lặp
            trước khi xác nhận bản đồ.
          </AlertDescription>
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. TOOLBAR (Chấp nhận tất cả, Phân tích lại, Lọc chương, Switch view)
          ───────────────────────────────────────────────────────────── */}
      {course.knowledgeMapStatus !== "empty" && course.knowledgeMapStatus !== "analysing" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-card/60">
          <div className="flex items-center gap-2 flex-wrap">
            {!isLocked && totalPending > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAcceptAllDialog(true)}
                className="gap-1.5 cursor-pointer font-medium"
              >
                <Check className="size-3.5" />
                Chấp nhận tất cả ({totalPending})
              </Button>
            )}

            {!isLocked && course.knowledgeMapStatus !== "stale" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRunAnalysis}
                disabled={isAnalysing}
                className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("size-3.5", isAnalysing && "animate-spin")} />
                Phân tích lại
              </Button>
            )}

            {/* Bộ lọc theo chương */}
            {chapters.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-2 border-l border-border/60">
                <Filter className="size-3.5" />
                <select
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                  className="bg-transparent border border-border/80 rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  aria-label="Lọc theo chương"
                >
                  <option value="all">Tất cả các chương</option>
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Switch: Graph vs List */}
            <div className="inline-flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/40">
              <Button
                variant={viewMode === "graph" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("graph")}
                className="h-7 px-3 text-xs gap-1.5 cursor-pointer"
              >
                <MapIcon className="size-3.5" />
                Dạng sơ đồ
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-7 px-3 text-xs gap-1.5 cursor-pointer"
              >
                <List className="size-3.5" />
                Danh sách
              </Button>
            </div>

            {/* Graph Zoom Controls */}
            {viewMode === "graph" && (
              <div className="hidden sm:inline-flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/40">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
                  className="h-7 w-7 p-0 cursor-pointer"
                  title="Thu nhỏ"
                >
                  <Minus className="size-3.5" />
                </Button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Đặt lại 100%"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(1.4, z + 0.15))}
                  className="h-7 w-7 p-0 cursor-pointer"
                  title="Phóng to"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. GRAPH VIEW (DẠNG SƠ ĐỒ - DEFAULT)
          ───────────────────────────────────────────────────────────── */}
      {viewMode === "graph" && course.knowledgeMapStatus !== "empty" && course.knowledgeMapStatus !== "analysing" && (
        <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* Vùng Canvas hiển thị DAG */}
          <Card className="relative overflow-hidden border border-border/80 bg-muted/10 min-h-[540px]">
            <div className="overflow-auto p-6 max-h-[720px] select-none" style={{ scrollBehavior: "smooth" }}>
              <div
                style={{
                  width: `${graph.width * zoom}px`,
                  height: `${graph.height * zoom}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  transition: "transform 120ms ease-out",
                }}
                className="relative"
              >
                {/* Đường liên kết SVG giữa các nút */}
                <KnowledgeGraphLines
                  id={graphId}
                  width={graph.width}
                  height={graph.height}
                  positions={graph.positions}
                  edges={activeEdges}
                  highlighted={highlightedNodeIds}
                  cycleEdges={cycleEdgesSet}
                />

                {/* Các thẻ Nút khái niệm (Nodes) */}
                {liveConcepts.map((concept) => {
                  const pos = graph.positions.get(concept.id);
                  if (!pos) return null;

                  const isSelected = selectedNodeId === concept.id;
                  const isHighlighted = highlightedNodeIds.has(concept.id);
                  const isCycleNode = cycleNodesSet.has(concept.id);
                  const isDimmed =
                    (selectedNodeId !== null && !isHighlighted) ||
                    (chapterFilter !== "all" && !filteredConceptIds.has(concept.id));

                  return (
                    <div
                      key={concept.id}
                      onClick={() => setSelectedNodeId(concept.id === selectedNodeId ? null : concept.id)}
                      style={{
                        position: "absolute",
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        width: "232px",
                      }}
                      className={cn(
                        "p-3.5 rounded-xl border bg-card text-card-foreground shadow-xs cursor-pointer transition-all",
                        "hover:shadow-md hover:border-primary/60",
                        isSelected && "ring-2 ring-primary border-primary shadow-sm",
                        isCycleNode && "border-destructive ring-1 ring-destructive/80 bg-destructive/5",
                        isDimmed && "opacity-40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <StatusBadge kind="kmapItem" status={concept.review} />
                        {isCycleNode && (
                          <span
                            className="size-5 rounded-full bg-destructive/15 text-destructive flex items-center justify-center"
                            title="Khái niệm này nằm trong chu trình vòng lặp"
                          >
                            <AlertTriangle className="size-3" />
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-semibold line-clamp-2 mb-2 text-foreground">
                        {concept.name}
                      </h4>

                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                        <span className="flex items-center gap-1">
                          <BookOpen className="size-3" />
                          {(concept.lessonIds || []).length} bài học
                        </span>
                        {concept.review === "suggested" && (
                          <span className="text-[11px] font-medium text-warning">Chờ duyệt</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Góc Minimap */}
            <div className="absolute bottom-4 right-4 p-2 rounded-lg bg-card/90 backdrop-blur-xs border border-border/80 shadow-md hidden sm:block">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                Bản đồ thu nhỏ
              </span>
              <KnowledgeGraphMinimap
                width={graph.width}
                height={graph.height}
                positions={graph.positions}
                edges={activeEdges}
                highlighted={highlightedNodeIds}
                cycleEdges={cycleEdgesSet}
              />
            </div>
          </Card>

          {/* Node Side Panel (WRITER Canvas Pattern) */}
          <aside className="space-y-4">
            {selectedConcept ? (
              <Card className="border border-border/80 shadow-xs sticky top-20">
                <CardHeader className="p-4 bg-muted/20 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Chi tiết khái niệm</span>
                    <CardTitle className="text-base font-semibold">{selectedConcept.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedNodeId(null)}
                    className="size-7 p-0 cursor-pointer"
                  >
                    <X className="size-4" />
                  </Button>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Trạng thái phê duyệt</label>
                    <StatusBadge kind="kmapItem" status={selectedConcept.review} />
                  </div>

                  {selectedConcept.description && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Mô tả</label>
                      <p className="text-xs text-foreground leading-relaxed">{selectedConcept.description}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Bài học liên quan ({(selectedConcept.lessonIds || []).length})
                    </label>
                    {(!selectedConcept.lessonIds || selectedConcept.lessonIds.length === 0) ? (
                      <p className="text-xs text-muted-foreground italic">Chưa gắn bài học nào.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selectedConcept.lessonIds.map((lid) => {
                          const lesson = lessons.find((l) => l.id === lid);
                          return (
                            <li
                              key={lid}
                              className="text-xs p-2 rounded-md bg-muted/40 border border-border/50 flex items-center gap-2"
                            >
                              <BookOpen className="size-3.5 text-primary shrink-0" />
                              <span className="line-clamp-1">{lesson?.title || lid}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Quan hệ tiên quyết trực tiếp của nút này */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Cần học trước</label>
                    {activeEdges.filter((e) => e.to === selectedConcept.id).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Không có khái niệm tiên quyết.</p>
                    ) : (
                      <ul className="space-y-1">
                        {activeEdges
                          .filter((e) => e.to === selectedConcept.id)
                          .map((e) => (
                            <li key={`${e.from}:${e.to}`} className="text-xs flex items-center gap-1.5 text-foreground">
                              <ArrowRight className="size-3 text-muted-foreground" />
                              <span className="font-medium">{conceptNameMap.get(e.from) || e.from}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </CardContent>

                {!isLocked && (
                  <CardFooter className="p-4 pt-0 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {selectedConcept.review !== "accepted" && selectedConcept.review !== "edited" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleReviewItem("concept", selectedConcept.id, "accepted")}
                          className="gap-1.5 cursor-pointer text-xs"
                        >
                          <Check className="size-3.5" />
                          Chấp nhận
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRenameTarget({ id: selectedConcept.id, name: selectedConcept.name });
                          setRenameValue(selectedConcept.name);
                        }}
                        className="gap-1.5 cursor-pointer text-xs"
                      >
                        <Pencil className="size-3.5" />
                        Sửa tên
                      </Button>

                      {selectedConcept.review !== "declined" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReviewItem("concept", selectedConcept.id, "declined")}
                          className="col-span-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <XCircle className="size-3.5 mr-1" />
                          Bỏ khái niệm này
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReviewItem("concept", selectedConcept.id, "suggested")}
                          className="col-span-2 text-xs text-primary cursor-pointer"
                        >
                          <Undo2 className="size-3.5 mr-1" />
                          Khôi phục khái niệm
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                )}
              </Card>
            ) : (
              <Card className="border border-border/80 bg-muted/20 p-6 text-center space-y-2">
                <MapIcon className="size-6 text-muted-foreground mx-auto" />
                <h4 className="text-sm font-semibold">Chưa chọn khái niệm</h4>
                <p className="text-xs text-muted-foreground">
                  Nhấp vào bất kỳ nút nào trên sơ đồ để xem thông tin chi tiết, bài học liên quan và chỉnh sửa.
                </p>
              </Card>
            )}
          </aside>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. LIST VIEW (DẠNG DANH SÁCH - ACCESSIBLE SECONDARY)
          ───────────────────────────────────────────────────────────── */}
      {viewMode === "list" && course.knowledgeMapStatus !== "empty" && course.knowledgeMapStatus !== "analysing" && (
        <div className="space-y-6">
          {/* Phần 1: Danh sách khái niệm */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b border-border/60">
              <CardTitle className="text-base font-semibold">
                Khái niệm ({liveConcepts.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Toàn bộ các khái niệm đã được trích xuất từ bài học khoá học.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 divide-y divide-border/60">
              {concepts.map((concept) => {
                const isCycleNode = cycleNodesSet.has(concept.id);
                return (
                  <div
                    key={concept.id}
                    className={cn(
                      "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                      concept.review === "declined" && "opacity-50 bg-muted/10",
                      isCycleNode && "bg-destructive/5"
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{concept.name}</span>
                        <StatusBadge kind="kmapItem" status={concept.review} />
                        {isCycleNode && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                            <AlertTriangle className="size-3" /> Thuộc vòng lặp
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Bài học:{" "}
                        {(concept.lessonIds || [])
                          .map((lid) => lessons.find((l) => l.id === lid)?.title || lid)
                          .join(", ") || "Chưa gắn bài học"}
                      </p>
                    </div>

                    {!isLocked && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {concept.review !== "accepted" && concept.review !== "edited" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleReviewItem("concept", concept.id, "accepted")}
                            className="gap-1 cursor-pointer text-xs"
                          >
                            <Check className="size-3.5" />
                            Chấp nhận
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenameTarget({ id: concept.id, name: concept.name });
                            setRenameValue(concept.name);
                          }}
                          className="gap-1 cursor-pointer text-xs"
                        >
                          <Pencil className="size-3.5" />
                          Sửa
                        </Button>
                        {concept.review !== "declined" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReviewItem("concept", concept.id, "declined")}
                            className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            Bỏ
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReviewItem("concept", concept.id, "suggested")}
                            className="text-xs text-primary cursor-pointer"
                          >
                            Khôi phục
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Phần 2: Quan hệ "cần học trước" */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b border-border/60">
              <CardTitle className="text-base font-semibold">
                Quan hệ "cần học trước" ({activeEdges.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Xác định khái niệm nào phải được học trước khái niệm nào.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 divide-y divide-border/60">
              {edges.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Chưa có quan hệ nào.</div>
              ) : (
                edges.map((edge) => {
                  const isCycleEdge = cycleEdgesSet.has(`${edge.from}:${edge.to}`);
                  return (
                    <div
                      key={`${edge.from}:${edge.to}`}
                      className={cn(
                        "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                        edge.review === "declined" && "opacity-50 bg-muted/10",
                        isCycleEdge && "bg-destructive/10"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <strong className="font-semibold text-foreground">
                          {conceptNameMap.get(edge.from) || edge.from}
                        </strong>
                        <span className="text-xs text-muted-foreground">cần học trước</span>
                        <strong className="font-semibold text-foreground">
                          {conceptNameMap.get(edge.to) || edge.to}
                        </strong>
                        <StatusBadge kind="kmapItem" status={edge.review} />
                        {isCycleEdge && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                            <AlertTriangle className="size-3" /> Đóng vòng lặp!
                          </span>
                        )}
                      </div>

                      {!isLocked && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {edge.review !== "accepted" && edge.review !== "edited" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReviewItem("edge", { from: edge.from, to: edge.to }, "accepted")}
                              className="gap-1 cursor-pointer text-xs"
                            >
                              <Check className="size-3.5" />
                              Chấp nhận
                            </Button>
                          )}
                          {edge.review !== "declined" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReviewItem("edge", { from: edge.from, to: edge.to }, "declined")}
                              className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              Bỏ
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReviewItem("edge", { from: edge.from, to: edge.to }, "suggested")}
                              className="text-xs text-primary cursor-pointer"
                            >
                              Khôi phục
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>

            {/* Form Thêm quan hệ mới */}
            {!isLocked && liveConcepts.length >= 2 && (
              <CardFooter className="p-4 bg-muted/10 border-t border-border/60">
                <form onSubmit={handleAddEdge} className="flex flex-wrap items-center gap-3 w-full">
                  <select
                    value={newEdgeFrom}
                    onChange={(e) => setNewEdgeFrom(e.target.value)}
                    required
                    className="bg-card border border-border/80 rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[200px]"
                    aria-label="Khái niệm học trước"
                  >
                    <option value="">Chọn khái niệm học trước...</option>
                    {liveConcepts.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>

                  <span className="text-xs text-muted-foreground">cần học trước</span>

                  <select
                    value={newEdgeTo}
                    onChange={(e) => setNewEdgeTo(e.target.value)}
                    required
                    className="bg-card border border-border/80 rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[200px]"
                    aria-label="Khái niệm học sau"
                  >
                    <option value="">Chọn khái niệm học sau...</option>
                    {liveConcepts.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>

                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isAddingEdge || !newEdgeFrom || !newEdgeTo}
                    className="gap-1.5 cursor-pointer text-xs"
                  >
                    <Plus className="size-3.5" />
                    Thêm quan hệ
                  </Button>
                </form>
              </CardFooter>
            )}
          </Card>

          {/* Phần 3: Xem trước thứ tự học mặc định (Topological sort) */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b border-border/60">
              <CardTitle className="text-base font-semibold">Xem trước thứ tự học mặc định</CardTitle>
              <CardDescription className="text-xs">
                Thứ tự bài học đề xuất cho học viên dựa trên cấu trúc các quan hệ tiên quyết.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {cycle ? (
                <p className="text-xs text-destructive italic">
                  Không thể tính toán thứ tự học khi sơ đồ vẫn còn vòng lặp.
                </p>
              ) : !defaultOrder || defaultOrder.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Chưa có bài học nào để sắp xếp.</p>
              ) : (
                <ol className="list-decimal list-inside space-y-2">
                  {defaultOrder.map((l, idx) => (
                    <li key={l.id} className="text-xs text-foreground font-medium">
                      <span className="font-normal text-muted-foreground mr-1">Bài {idx + 1}:</span>
                      {l.title}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. FOOTER CONFIRM BAR (STATE-MACHINES §18: tc-kmap-confirm)
          ───────────────────────────────────────────────────────────── */}
      {!isLocked && course.knowledgeMapStatus !== "empty" && course.knowledgeMapStatus !== "analysing" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-card/60">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Xác nhận bản đồ kiến thức</h4>
            <p className="text-xs text-muted-foreground">
              {cycle
                ? "Cần giải quyết vòng lặp trước khi có thể xác nhận bản đồ."
                : totalPending > 0
                ? `Còn ${totalPending} đề xuất chưa duyệt. Chấp nhận hoặc bỏ các mục để hoàn tất.`
                : course.knowledgeMapStatus === "stale"
                ? "Nội dung bài học đã thay đổi. Hãy bấm phân tích lại trước khi xác nhận."
                : course.knowledgeMapStatus === "confirmed"
                ? "Bản đồ đã được xác nhận và đang có hiệu lực."
                : "Tất cả đề xuất đã được xem xét xong. Sẵn sàng xác nhận!"}
            </p>
          </div>

          <Button
            size="lg"
            variant="default"
            disabled={!canConfirm || isConfirming}
            onClick={handleConfirmMap}
            className="cursor-pointer font-semibold shadow-xs"
          >
            {isConfirming ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="size-4 mr-2" />
            )}
            Xác nhận bản đồ kiến thức
          </Button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. ACCEPT ALL SUMMARY DIALOG (D10)
          ───────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showAcceptAllDialog}
        onOpenChange={setShowAcceptAllDialog}
        title="Chấp nhận tất cả đề xuất?"
        consequence="Các đề xuất sẽ được đánh dấu 'Đã chấp nhận'. Bản đồ chỉ có hiệu lực khi bạn bấm xác nhận."
        reversible="Có thể đổi từng mục sau nếu muốn."
        confirmLabel={isAcceptingAll ? "Đang xử lý..." : "Chấp nhận tất cả"}
        onConfirm={handleAcceptAllConfirm}
      >
        <div className="space-y-2 text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border/60">
          <div className="flex items-center gap-2">
            <Check className="size-3.5 text-success" />
            <span>
              <strong>{acceptAllPreview.acceptedConcepts.length}</strong> khái niệm
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="size-3.5 text-success" />
            <span>
              <strong>{acceptAllPreview.acceptedEdges.length}</strong> quan hệ tiên quyết an toàn
            </span>
          </div>
          {acceptAllPreview.skippedEdges.length > 0 && (
            <div className="flex items-start gap-2 text-destructive font-medium pt-1 border-t border-border/40">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>{acceptAllPreview.skippedEdges.length}</strong> quan hệ bị bỏ qua vì sẽ tạo vòng lặp
                (vẫn giữ trạng thái chờ để bạn quyết định riêng)
              </span>
            </div>
          )}
        </div>
      </ConfirmDialog>

      {/* ─────────────────────────────────────────────────────────────
          7. RENAME CONCEPT MODAL DIALOG
          ───────────────────────────────────────────────────────────── */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi tên khái niệm</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs text-muted-foreground">Tên khái niệm kiến thức</label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Nhập tên khái niệm..."
              disabled={isRenaming}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isRenaming}
              onClick={() => {
                setRenameTarget(null);
                setRenameValue("");
              }}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={isRenaming || !renameValue.trim()}
              onClick={handleSaveRename}
            >
              {isRenaming && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
