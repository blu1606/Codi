"use client";

import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  Eye,
  FileCode,
  FileDown,
  FileText,
  Film,
  HelpCircle,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { LESSON_KIND_LABELS, type LessonKind } from "@/lib/course-content-contract";

import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { Textarea } from "@codi-1/ui/components/textarea";
import { cn } from "@codi-1/ui/lib/utils";
import {
  COURSE_CATEGORIES,
  COURSE_LEVEL_LABELS,
  COURSE_LEVELS,
  type CourseCategory,
  type CourseLevel,
} from "@/lib/course-constants";
import {
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
  getLessonDetails,
  type LessonMaterialInput,
  type LessonSnapshot,
  moveChapter,
  moveLesson,
  renameChapter,
  renameLesson,
  restoreLesson,
  updateCourseInfo,
  updateLesson,
} from "./actions";

import { KnowledgeMapClient } from "./kmap/knowledge-map-client";
import type { KnowledgeMapDataDto } from "./kmap/actions";
import { PublishTabClient } from "./publish/publish-tab-client";
import type { PublicationDataDto } from "./publish/actions";

interface CourseEditorProps {
  courseId: string;
  activeTab: "content" | "info" | "kmap" | "publish";
  data: {
    course: any;
    details: any;
    chapters: any[];
    entryTest: { id: number; count: number } | null;
    isLocked: boolean;
    kmapData?: KnowledgeMapDataDto | null;
    publicationData?: PublicationDataDto | null;
  };
}

type PendingDelete = {
  kind: "chapter" | "lesson";
  id: string;
  title: string;
  consequence: string;
};

export function CourseEditor({ courseId, activeTab, data }: CourseEditorProps) {
  const router = useRouter();
  const { course, details, chapters, entryTest, isLocked } = data;

  // State cho Tab Thông tin (Sử dụng chuẩn COURSE_CATEGORIES từ lib/course-constants - Finding 6)
  const [infoTitle, setInfoTitle] = useState(course.title || "");
  const [infoSummary, setInfoSummary] = useState(course.description || "");
  const [infoCategory, setInfoCategory] = useState<string>(
    course.category || COURSE_CATEGORIES[0]
  );
  const [infoLevel, setInfoLevel] = useState<string>(course.level || "Beginner");
  const [infoPrice, setInfoPrice] = useState(String(course.proposedPrice ?? course.price ?? 0));
  const [infoOutcomes, setInfoOutcomes] = useState((details.learningOutcomes || []).join("\n"));
  const [infoRequirements, setInfoRequirements] = useState((details.requirements || []).join("\n"));
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({});
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isInfoDirty, setIsInfoDirty] = useState(false);

  // State đổi tên chương hoặc bài học (inline quick edit)
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState("");
  const [addLessonChapterId, setAddLessonChapterId] = useState<string | null>(null);

  // State Trình biên tập chi tiết bài học (Lesson Editor modal - Finding 9 / S22)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDescription, setLessonDescription] = useState("");
  const [lessonDurationMinutes, setLessonDurationMinutes] = useState(10);
  const [lessonBody, setLessonBody] = useState("");
  const [lessonIsFreePreview, setLessonIsFreePreview] = useState(false);
  const [lessonMaterialsList, setLessonMaterialsList] = useState<LessonMaterialInput[]>([]);
  const [isLoadingLessonDetails, setIsLoadingLessonDetails] = useState(false);
  const lessonDetailsRequest = useRef(0);
  const [loadedLessonDetails, setLoadedLessonDetails] = useState<{ lessonId: string; request: number } | null>(null);
  const [lessonDetailsError, setLessonDetailsError] = useState("");
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  // Guard chưa lưu (Thông tin): chặn điều hướng trong app và đóng tab/trình duyệt (mockup lecturer.js:55-68)
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const guardActive = isInfoDirty && activeTab === "info";

  useEffect(() => {
    if (!guardActive) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guardActive]);

  useEffect(() => {
    if (!guardActive) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const target = url.pathname + url.search;
      if (target === window.location.pathname + window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNav(target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guardActive]);

  useEffect(() => () => { lessonDetailsRequest.current += 1; }, []);
  const canSaveLesson = !isLocked && !isSavingLesson && !isLoadingLessonDetails
    && loadedLessonDetails?.lessonId === editingLessonId
    && loadedLessonDetails?.request === lessonDetailsRequest.current;

  // Upload trực tiếp lên private R2 để tránh giới hạn request của serverless.
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [newMaterialType, setNewMaterialType] = useState<"video" | "pdf" | "slide" | "document" | "link">("video");
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
  const [newMaterialUrl, setNewMaterialUrl] = useState("");
  const [newMaterialFile, setNewMaterialFile] = useState<File | null>(null);
  const [materialUploadProgress, setMaterialUploadProgress] = useState<number | null>(null);
  const [materialErrorMessage, setMaterialErrorMessage] = useState("");

  // Tổng số bài học
  const totalLessons = chapters.reduce((sum, ch) => sum + (ch.lessons?.length || 0), 0);

  // Lưu thông tin khoá học
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoErrors({});

    const errors: Record<string, string> = {};
    if (infoTitle.trim().length < 5) errors.title = "Tên khoá học cần ít nhất 5 ký tự.";
    if (infoSummary.trim().length < 20) errors.summary = "Mô tả cần ít nhất 20 ký tự.";

    const parsedPrice = Number(infoPrice);
    if (!infoPrice.trim() || !Number.isSafeInteger(parsedPrice) || parsedPrice < 0 || parsedPrice > 2147483647) {
      errors.price = "Giá đề xuất phải là số nguyên không âm.";
    }

    if (Object.keys(errors).length > 0) {
      setInfoErrors(errors);
      return;
    }

    try {
      setIsSavingInfo(true);
      const res = await updateCourseInfo(courseId, {
        title: infoTitle,
        summary: infoSummary,
        category: infoCategory,
        level: infoLevel,
        proposedPrice: parsedPrice,
        learningOutcomes: infoOutcomes.split("\n").map((s: string) => s.trim()).filter(Boolean),
        requirements: infoRequirements.split("\n").map((s: string) => s.trim()).filter(Boolean),
      });

      if (res.success) {
        setIsInfoDirty(false);
        toast.success("Đã lưu thông tin khoá học.");
        router.refresh();
      } else if (res.errors) {
        setInfoErrors(res.errors);
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu thông tin.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  // Thêm chương mới
  const handleAddChapter = async () => {
    if (isLocked) return;
    try {
      await addChapter(courseId);
      toast.success("Đã thêm chương mới.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Không thể thêm chương.");
    }
  };

  // Đổi tên chương
  const handleSaveRenameChapter = async (chapterId: string) => {
    if (!renamingText.trim()) return;
    try {
      await renameChapter(courseId, chapterId, renamingText);
      setRenamingId(null);
      toast.success("Đã đổi tên chương.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi đổi tên.");
    }
  };

  // Di chuyển chương
  const handleMoveChapter = async (chapterId: string, direction: -1 | 1) => {
    if (isLocked) return;
    try {
      await moveChapter(courseId, chapterId, direction);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Xoá chương: mở xác nhận nêu hậu quả trước khi gọi action
  const handleDeleteChapter = (chapterId: string, title: string) => {
    if (isLocked) return;
    setPendingDelete({
      kind: "chapter",
      id: chapterId,
      title,
      consequence:
        course.status === "published"
          ? `Khoá học đã xuất bản. Xoá chương "${title}" có thể ảnh hưởng trực tiếp đến học viên đã đăng ký. Chỉ có thể xoá chương trống.`
          : `Chương "${title}" sẽ bị xoá khỏi khoá học. Chỉ có thể xoá chương trống.`,
    });
  };

  const performDeleteChapter = async (chapterId: string) => {
    try {
      await deleteChapter(courseId, chapterId);
      toast.success("Đã xoá chương.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Thêm bài học mới
  const handleAddLesson = async (chapterId: string, kind: LessonKind) => {
    if (isLocked) return;
    try {
      await addLesson(courseId, chapterId, kind);
      setAddLessonChapterId(null);
      toast.success(`Đã thêm ${LESSON_KIND_LABELS[kind].toLowerCase()}.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Đổi tên bài học nhanh
  const handleSaveRenameLesson = async (lessonId: string) => {
    if (!renamingText.trim()) return;
    try {
      await renameLesson(courseId, lessonId, renamingText);
      setRenamingId(null);
      toast.success("Đã đổi tên bài học.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Di chuyển bài học
  const handleMoveLesson = async (lessonId: string, destinationIndex: number) => {
    if (isLocked) return;
    try {
      await moveLesson(courseId, lessonId, destinationIndex);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Xoá bài học: mở xác nhận nêu hậu quả; toast Hoàn tác sau khi xoá (§7.17)
  const handleDeleteLesson = (lessonId: string, title: string) => {
    if (isLocked) return;
    setPendingDelete({
      kind: "lesson",
      id: lessonId,
      title,
      consequence:
        course.status === "published"
          ? `Khoá học đang xuất bản. Xoá bài học "${title}" có thể làm gián đoạn tiến độ của học viên đã đăng ký.`
          : `Bài học "${title}" sẽ bị xoá khỏi chương này.`,
    });
  };

  const performDeleteLesson = async (lessonId: string, title: string) => {
    try {
      const res = await deleteLesson(courseId, lessonId);
      if (res.success && res.deletedLesson) {
        const deletedSnapshot: LessonSnapshot = res.deletedLesson;
        router.refresh();
        toast(`Đã xoá "${title}"`, {
          action: {
            label: "Hoàn tác",
            onClick: async () => {
              await restoreLesson(courseId, deletedSnapshot);
              toast.success(`Đã khôi phục "${title}"`);
              router.refresh();
            },
          },
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xoá bài học.");
    }
  };

  const handleConfirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    if (target.kind === "chapter") await performDeleteChapter(target.id);
    else await performDeleteLesson(target.id, target.title);
  };

  // Mở trình soạn thảo bài học (Lesson Editor modal / Finding 9)
  const handleOpenLessonEditor = async (lesson: any) => {
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonDescription(lesson.description || "");
    setLessonDurationMinutes(Math.round((lesson.durationSeconds || 0) / 60) || 10);
    setLessonBody(lesson.body || "");
    setLessonIsFreePreview(lesson.isFreePreview || false);
    setShowAddMaterialForm(false);
    setMaterialErrorMessage("");
    setNewMaterialTitle("");
    setNewMaterialUrl("");
    await loadLessonDetails(lesson.id);
  };

  const closeLessonEditor = () => {
    lessonDetailsRequest.current += 1;
    setLoadedLessonDetails(null);
    setEditingLessonId(null);
  };

  const loadLessonDetails = async (lessonId: string) => {
    const request = ++lessonDetailsRequest.current;
    setLoadedLessonDetails(null);
    setLessonDetailsError("");
    setLessonMaterialsList([]);
    setIsLoadingLessonDetails(true);

    try {
      const res = await getLessonDetails(courseId, lessonId);
      if (request !== lessonDetailsRequest.current) return;
      if (!res.lesson || res.lesson.id !== lessonId || !Array.isArray(res.materials)) {
        throw new Error("Không thể tải chi tiết bài học. Vui lòng thử lại.");
      }
      setLessonTitle(res.lesson.title);
      setLessonDescription(res.lesson.description || "");
      setLessonDurationMinutes(Math.round((res.lesson.durationSeconds || 0) / 60) || 10);
      setLessonBody(res.lesson.body || "");
      setLessonIsFreePreview(res.lesson.isFreePreview || false);
      setLessonMaterialsList(
        (res.materials || []).map((m: any) => ({
          id: m.id,
          type: m.type,
          title: m.title,
          url: m.url,
          fileSizeKb: m.fileSizeKb,
          durationSeconds: m.durationSeconds,
        }))
      );
      setLoadedLessonDetails({ lessonId, request });
    } catch (err: any) {
      if (request !== lessonDetailsRequest.current) return;
      const message = err.message || "Không thể tải chi tiết bài học.";
      setLessonDetailsError(message);
      toast.error(message);
    } finally {
      if (request === lessonDetailsRequest.current) setIsLoadingLessonDetails(false);
    }
  };

  // Lưu chi tiết bài học và danh sách tài liệu
  const handleSaveLessonDetails = async () => {
    if (!editingLessonId || !canSaveLesson) return;
    if (!lessonTitle.trim()) {
      toast.error("Tên bài học không được để trống.");
      return;
    }

    try {
      setIsSavingLesson(true);
      await updateLesson(courseId, editingLessonId, {
        title: lessonTitle,
        description: lessonDescription,
        durationMinutes: lessonDurationMinutes,
        body: lessonBody,
        isFreePreview: lessonIsFreePreview,
        materials: lessonMaterialsList,
      });

      toast.success("Đã cập nhật bài học thành công!");
      closeLessonEditor();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi cập nhật bài học.");
    } finally {
      setIsSavingLesson(false);
    }
  };

  // Thêm tài liệu mới vào bài học
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialTitle.trim()) {
      setMaterialErrorMessage("Vui lòng nhập tên tài liệu.");
      return;
    }
    if (newMaterialType === "link" && !newMaterialUrl.trim()) {
      setMaterialErrorMessage("Vui lòng nhập URL tài liệu.");
      return;
    }
    if (newMaterialType !== "link" && !newMaterialFile) {
      setMaterialErrorMessage("Vui lòng chọn tệp cần tải lên.");
      return;
    }

    try {
      if (newMaterialType === "link") {
        setLessonMaterialsList((prev) => [...prev, { type: "link", title: newMaterialTitle.trim(), url: newMaterialUrl.trim(), fileSizeKb: null, durationSeconds: null }]);
      } else if (newMaterialFile && editingLessonId) {
        setMaterialUploadProgress(0);
        const base = `/api/lecturer/courses/${courseId}/lessons/${editingLessonId}/materials`;
        const preparedResponse = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", type: newMaterialType, name: newMaterialFile.name, size: newMaterialFile.size, contentType: newMaterialFile.type }) });
        const prepared = await preparedResponse.json();
        if (!preparedResponse.ok) throw new Error(prepared.error || "Không thể bắt đầu tải tệp.");
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", prepared.uploadUrl);
          xhr.setRequestHeader("Content-Type", newMaterialFile.type);
          xhr.upload.onprogress = (event) => { if (event.lengthComputable) setMaterialUploadProgress(Math.round(event.loaded / event.total * 100)); };
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Tải tệp lên kho lưu trữ thất bại."));
          xhr.onerror = () => reject(new Error("Mất kết nối khi tải tệp lên."));
          xhr.send(newMaterialFile);
        });
        const confirmedResponse = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", ticket: prepared.ticket }) });
        const confirmed = await confirmedResponse.json();
        if (!confirmedResponse.ok) throw new Error(confirmed.error || "Không thể xác nhận tệp tải lên.");
        setLessonMaterialsList((prev) => [...prev, confirmed]);
      }
      toast.success(newMaterialType === "link" ? "Đã thêm liên kết vào danh sách." : "Đã tải tài liệu lên thành công.");
    } catch (err) {
      setMaterialErrorMessage(err instanceof Error ? err.message : "Không thể thêm tài liệu.");
      return;
    } finally {
      setMaterialUploadProgress(null);
    }

    setNewMaterialTitle("");
    setNewMaterialUrl("");
    setShowAddMaterialForm(false);
    setMaterialErrorMessage("");
  };

  // Xoá tài liệu khỏi danh sách bài học
  const handleRemoveMaterial = (index: number) => {
    setLessonMaterialsList((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <ConfirmDialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null);
        }}
        title="Có thay đổi chưa lưu"
        consequence="Rời trang sẽ bỏ các thay đổi này."
        reversible="Các thay đổi chưa lưu không thể khôi phục."
        danger
        confirmLabel="Rời trang, bỏ thay đổi"
        cancelLabel="Ở lại"
        onConfirm={() => {
          const target = pendingNav;
          setPendingNav(null);
          setIsInfoDirty(false);
          // target is the href of an in-app link the guard intercepted.
          if (target) router.push(target as Route);
        }}
      >
        <p className="text-sm text-muted-foreground">Thông tin khoá học có thay đổi chưa được lưu.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete?.kind === "chapter" ? "Xoá chương?" : "Xoá bài học?"}
        consequence={pendingDelete?.consequence ?? ""}
        reversible={pendingDelete?.kind === "lesson" ? "Bạn có thể hoàn tác ngay sau khi xoá." : "Thao tác này không hoàn tác được."}
        danger
        confirmLabel="Xoá"
        onConfirm={handleConfirmDelete}
      />
      {/* Header trình soạn khoá học */}
      <div className="space-y-4">
        <Link
          href="/dashboard/lecturer/courses"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Khoá học của tôi
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
              <StatusBadge kind="course" status={course.status} />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{chapters.length} chương</span>
              <span>•</span>
              <span>{totalLessons} bài học</span>
              <span>•</span>
              <span>{course.category}</span>
              <span>•</span>
              <span>Trình độ: {COURSE_LEVEL_LABELS[course.level as CourseLevel] || course.level}</span>
            </p>
          </div>

          {course.status === "published" && (
            <Link
              href={`/courses/${course.slug}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Eye className="size-4" />
              Xem trang bán
            </Link>
          )}
        </div>

        {/* Thông báo trạng thái đặc biệt */}
        {isLocked && (
          <Alert variant="warning">
            <AlertTitle className="font-semibold">Đang chờ duyệt — nội dung chỉ đọc</AlertTitle>
            <AlertDescription>
              Khoá học đang được ban quản trị kiểm duyệt. Bạn có thể xem lại nhưng không thể chỉnh sửa cho đến khi có kết quả duyệt.
            </AlertDescription>
          </Alert>
        )}

        {course.status === "published" && (
          <Alert variant="info">
            <AlertTitle className="font-semibold">Khoá học đang bán</AlertTitle>
            <AlertDescription>
              Các thay đổi nội dung sẽ áp dụng trực tiếp cho học viên. Sau khi sửa, bạn hãy cập nhật lại bản đồ kiến thức.
            </AlertDescription>
          </Alert>
        )}

        {/* 4 Tabs: Nội dung / Thông tin / Bản đồ kiến thức / Xuất bản */}
        <div className="border-b border-border/80 flex items-center gap-2 overflow-x-auto">
          {[
            { id: "content", label: "Nội dung" },
            { id: "info", label: "Thông tin" },
            { id: "kmap", label: "Bản đồ kiến thức" },
            { id: "publish", label: "Xuất bản" },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/dashboard/lecturer/courses/${courseId}/${tab.id}`}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  isSelected
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: NỘI DUNG (S22)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "content" && (
        <div className="space-y-6">
          {/* Thanh tác vụ: Tạo chương, tạo bài, bài kiểm tra đầu vào */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-card/60">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Dùng nút mũi tên để sắp xếp thứ tự chương và bài học. Bấm &quot;Chi tiết&quot; để biên tập nội dung bài và tài liệu.</p>
              <p>
                Bài kiểm tra đầu vào (Diagnostic Test):{" "}
                {entryTest ? (
                  <Link
                    href={`/dashboard/lecturer/courses/${courseId}/quiz/entry`}
                    className="text-primary font-semibold hover:underline"
                  >
                    Đã có ({entryTest.count} câu)
                  </Link>
                ) : (
                  <Link
                    href={`/dashboard/lecturer/courses/${courseId}/quiz/entry`}
                    className="text-destructive font-semibold hover:underline"
                  >
                    Chưa có — Tạo bài kiểm tra đầu vào
                  </Link>
                )}
              </p>
            </div>

            {!isLocked && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAddChapter}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 cursor-pointer"
                >
                  <Layers className="size-3.5" />
                  Thêm chương
                </Button>
                {chapters.length > 0 && (
                  <Button
                    onClick={() => setAddLessonChapterId(chapters[0].id)}
                    variant="default"
                    size="sm"
                    className="gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="size-3.5" />
                    Thêm bài học
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Cây chương / bài học */}
          {chapters.length === 0 ? (
            <Card className="border border-dashed border-border/80">
              <CardContent className="p-0">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Layers className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>Khoá học chưa có nội dung</EmptyTitle>
                    <EmptyDescription>
                      Bắt đầu bằng cách thêm chương đầu tiên, sau đó thêm các bài học lý thuyết, bài thực hành và câu hỏi trắc nghiệm.
                    </EmptyDescription>
                  </EmptyHeader>
                  {!isLocked && (
                    <Button onClick={handleAddChapter} className="gap-2 cursor-pointer">
                      <Plus className="size-4" />
                      Thêm chương đầu tiên
                    </Button>
                  )}
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {chapters.map((ch, ci) => (
                <Card key={ch.id} className="border border-border/80 shadow-xs">
                  {/* Tiêu đề chương */}
                  <CardHeader className="p-4 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {renamingId === ch.id ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                          <Input
                            value={renamingText}
                            onChange={(e) => setRenamingText(e.target.value)}
                            className="h-8 text-sm"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveRenameChapter(ch.id)}
                            className="h-8 px-2.5 cursor-pointer"
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRenamingId(null)}
                            className="h-8 px-2.5 cursor-pointer"
                          >
                            Huỷ
                          </Button>
                        </div>
                      ) : (
                        <h2 className="font-semibold text-base text-foreground truncate">
                          Chương {ci + 1}: {ch.title}
                        </h2>
                      )}
                    </div>

                    {!isLocked && renamingId !== ch.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddLessonChapterId(ch.id)}
                          className="gap-1 text-xs cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          Bài học
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenamingId(ch.id);
                            setRenamingText(ch.title);
                          }}
                          className="size-8 p-0 cursor-pointer"
                          title="Đổi tên chương"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ci === 0}
                          onClick={() => handleMoveChapter(ch.id, -1)}
                          className="size-8 p-0 cursor-pointer"
                          title="Di chuyển lên"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ci === chapters.length - 1}
                          onClick={() => handleMoveChapter(ch.id, 1)}
                          className="size-8 p-0 cursor-pointer"
                          title="Di chuyển xuống"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteChapter(ch.id, ch.title)}
                          className="size-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Xoá chương"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>

                  {/* Danh sách bài học trong chương */}
                  <CardContent className="p-0 divide-y divide-border/60">
                    {ch.lessons?.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground text-center">
                        Chương này chưa có bài học. Bấm &ldquo;+ Bài học&rdquo; ở trên để thêm.
                      </div>
                    ) : (
                      ch.lessons.map((ls: any, li: number) => (
                        <div
                          key={ls.id}
                          className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <BookOpen className="size-4 text-primary shrink-0" />
                            {renamingId === ls.id ? (
                              <div className="flex items-center gap-2 flex-1 max-w-md">
                                <Input
                                  value={renamingText}
                                  onChange={(e) => setRenamingText(e.target.value)}
                                  className="h-8 text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveRenameLesson(ls.id)}
                                  className="h-8 px-2.5 cursor-pointer"
                                >
                                  <Check className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setRenamingId(null)}
                                  className="h-8 px-2.5 cursor-pointer"
                                >
                                  Huỷ
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-0.5 truncate">
                                <div className="flex items-center gap-2 truncate">
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {ls.title}
                                  </span>
                                  {ls.isFreePreview && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-success/10 text-success border border-success/20">
                                      Học thử
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span>Thời lượng: {Math.round(ls.durationSeconds / 60)} phút</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {!isLocked && renamingId !== ls.id && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Nút mở chi tiết biên tập bài học (Finding 9 / S22) */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenLessonEditor(ls)}
                                className="text-xs gap-1 cursor-pointer"
                              >
                                <Sliders className="size-3.5 text-primary" />
                                Chi tiết
                              </Button>

                              {/* Nút thêm / sửa quiz */}
                              <Link
                                href={`/dashboard/lecturer/courses/${courseId}/quiz/${ls.id}`}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  "text-xs gap-1"
                                )}
                              >
                                <HelpCircle className="size-3.5 text-primary" />
                                Quiz
                              </Link>
                              {/* Nút thêm / sửa bài tập code */}
                              <Link
                                href={`/dashboard/lecturer/courses/${courseId}/code/${ls.id}`}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  "text-xs gap-1"
                                )}
                              >
                                <Code2 className="size-3.5 text-primary" />
                                Code
                              </Link>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRenamingId(ls.id);
                                  setRenamingText(ls.title);
                                }}
                                className="size-8 p-0 cursor-pointer"
                                title="Đổi tên nhanh"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={li === 0}
                                onClick={() => handleMoveLesson(ls.id, li - 1)}
                                className="size-8 p-0 cursor-pointer"
                                title="Di chuyển lên"
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={li === ch.lessons.length - 1}
                                onClick={() => handleMoveLesson(ls.id, li + 1)}
                                className="size-8 p-0 cursor-pointer"
                                title="Di chuyển xuống"
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteLesson(ls.id, ls.title)}
                                className="size-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                                title="Xoá bài học"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: THÔNG TIN (S22 Info Tab)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "info" && (
        <Card className="border border-border/80 shadow-xs max-w-3xl">
          <CardHeader>
            <CardTitle>Thông tin chi tiết khoá học</CardTitle>
            <CardDescription>
              Cập nhật tiêu đề, mô tả, danh mục, chuẩn đầu ra và các điều kiện tiên quyết của khoá học.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveInfo} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Tên khoá học</label>
                <Input
                  value={infoTitle}
                  disabled={isLocked || isSavingInfo}
                  onChange={(e) => {
                    setInfoTitle(e.target.value);
                    setIsInfoDirty(true);
                  }}
                  aria-invalid={!!infoErrors.title}
                />
                {infoErrors.title && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5" />
                    {infoErrors.title}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Mô tả ngắn</label>
                <Textarea
                  rows={3}
                  value={infoSummary}
                  disabled={isLocked || isSavingInfo}
                  onChange={(e) => {
                    setInfoSummary(e.target.value);
                    setIsInfoDirty(true);
                  }}
                  aria-invalid={!!infoErrors.summary}
                />
                {infoErrors.summary && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5" />
                    {infoErrors.summary}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Danh mục</label>
                  <select
                    value={infoCategory}
                    disabled={isLocked || isSavingInfo}
                    onChange={(e) => {
                      setInfoCategory(e.target.value);
                      setIsInfoDirty(true);
                    }}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {COURSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Trình độ</label>
                  <select
                    value={infoLevel}
                    disabled={isLocked || isSavingInfo}
                    onChange={(e) => {
                      setInfoLevel(e.target.value);
                      setIsInfoDirty(true);
                    }}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {COURSE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {COURSE_LEVEL_LABELS[lvl]} ({lvl})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Giá đề xuất (VND)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="10000"
                  value={infoPrice}
                  disabled={isLocked || isSavingInfo}
                  placeholder="Nhập 0 cho khoá học miễn phí"
                  onChange={(e) => {
                    setInfoPrice(e.target.value);
                    setIsInfoDirty(true);
                  }}
                  className="max-w-[280px]"
                />
                <span className="text-xs text-muted-foreground block">
                  Quản trị viên sẽ kiểm tra và xác nhận giá bán cuối cùng khi duyệt xuất bản. Nhập 0 cho khoá học miễn phí.
                  {course.status === "published" && (
                    <span className="block mt-0.5 font-medium text-foreground">
                      Giá đang bán chính thức: {course.price.toLocaleString("vi-VN")} đ. Sửa đổi tại đây chỉ là đề xuất; chỉ Admin có thể thay đổi giá bán.
                    </span>
                  )}
                </span>
                {infoErrors.price && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5" />
                    {infoErrors.price}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Học viên sẽ học được gì? (Mỗi dòng một ý)
                </label>
                <Textarea
                  rows={4}
                  value={infoOutcomes}
                  disabled={isLocked || isSavingInfo}
                  placeholder="Ví dụ: Nắm vững kiến thức cốt lõi..."
                  onChange={(e) => {
                    setInfoOutcomes(e.target.value);
                    setIsInfoDirty(true);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Yêu cầu trước khi học (Mỗi dòng một ý)
                </label>
                <Textarea
                  rows={3}
                  value={infoRequirements}
                  disabled={isLocked || isSavingInfo}
                  placeholder="Ví dụ: Đã có kiến thức nền tảng về HTML/CSS..."
                  onChange={(e) => {
                    setInfoRequirements(e.target.value);
                    setIsInfoDirty(true);
                  }}
                />
              </div>

              {/* Thanh báo thay đổi chưa lưu (Savebar) */}
              {!isLocked && (
                <div className="flex items-center gap-3 pt-3">
                  <Button
                    type="submit"
                    disabled={isSavingInfo}
                    className="gap-2 cursor-pointer shadow-sm"
                  >
                    {isSavingInfo ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Lưu thay đổi
                      </>
                    )}
                  </Button>
                  {isInfoDirty && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="size-3.5 text-warning" />
                      Có thay đổi chưa lưu
                    </span>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3 & 4: Placeholders cho Task #116 & #117
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "kmap" && data.kmapData ? (
        <KnowledgeMapClient courseId={courseId} initialData={data.kmapData} />
      ) : activeTab === "kmap" && (
        <Card className="border border-dashed border-border/80">
          <CardContent className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Sparkles className="size-5 text-primary" />
                </EmptyMedia>
                <EmptyTitle>Bản đồ kiến thức AI (Task #116)</EmptyTitle>
                <EmptyDescription>
                  Tính năng phân tích và review bản đồ kiến thức AI đang được liên kết trong chuỗi nhiệm vụ tiếp theo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      {activeTab === "publish" && (
        data.publicationData ? (
          <PublishTabClient courseId={courseId} data={data.publicationData} />
        ) : (
          <LoadingRegion label="Đang tải thông tin xuất bản…" className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <ListRowsSkeleton rows={3} withAvatar={false} />
          </LoadingRegion>
        )
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CHỌN LOẠI BÀI HỌC
          ───────────────────────────────────────────────────────────── */}
      <Dialog
        open={addLessonChapterId !== null}
        onOpenChange={(open) => {
          if (!open) setAddLessonChapterId(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Thêm bài học</DialogTitle>
            <DialogDescription>Chọn loại nội dung ban đầu. Bạn có thể bổ sung tài liệu và bài tập sau.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["video", "Tải video bài giảng lên."],
              ["reading", "Soạn nội dung chữ ngay trên Codi."],
              ["pdf", "Thêm slide hoặc tài liệu PDF."],
              ["coding", "Tạo bài tập code và test tự động."],
              ["tutorial", "Tạo hướng dẫn code theo từng bước."],
            ] as const).map(([kind, description]) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                className="h-auto min-h-16 justify-start whitespace-normal p-3 text-left"
                disabled={isLocked}
                onClick={() => addLessonChapterId && void handleAddLesson(addLessonChapterId, kind)}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{LESSON_KIND_LABELS[kind]}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{description}</span>
                </span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAddLessonChapterId(null)}>Huỷ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: TRÌNH BIÊN TẬP CHI TIẾT BÀI HỌC & TÀI LIỆU (S22 / Finding 9)
          ───────────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editingLessonId}
        onOpenChange={(open) => {
          if (!open && !isSavingLesson) {
            closeLessonEditor();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Biên tập chi tiết bài học</DialogTitle>
            <DialogDescription>
              Thiết lập nội dung bài giảng, thời lượng học tập và tài liệu đính kèm (Video, PDF, Slide, Link).
            </DialogDescription>
          </DialogHeader>

          {isLoadingLessonDetails ? (
            <LoadingRegion label="Đang tải thông tin bài học…" className="space-y-4 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </LoadingRegion>
          ) : lessonDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Không thể tải chi tiết bài học</AlertTitle>
              <AlertDescription>
                <p>{lessonDetailsError}</p>
                <Button type="button" variant="outline" onClick={() => editingLessonId && loadLessonDetails(editingLessonId)}>
                  Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5 py-2">
              {/* Tên bài học */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tên bài học *</Label>
                <Input
                  value={lessonTitle}
                  disabled={isLocked || isSavingLesson}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Nhập tên bài học..."
                />
              </div>

              {/* Mô tả & Thời lượng */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Mô tả tóm tắt bài học</Label>
                  <Input
                    value={lessonDescription}
                    disabled={isLocked || isSavingLesson}
                    onChange={(e) => setLessonDescription(e.target.value)}
                    placeholder="Tóm tắt nội dung chính của bài..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Thời lượng (phút)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={360}
                    value={lessonDurationMinutes}
                    disabled={isLocked || isSavingLesson}
                    onChange={(e) => setLessonDurationMinutes(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Tuỳ chọn Học thử (isFreePreview) */}
              <div className="flex items-center gap-2.5 p-3 rounded-lg border border-border/80 bg-muted/20">
                <Checkbox
                  id="lesson-free-preview"
                  checked={lessonIsFreePreview}
                  disabled={isLocked || isSavingLesson}
                  onCheckedChange={(checked) => setLessonIsFreePreview(!!checked)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="lesson-free-preview" className="text-xs font-medium cursor-pointer">
                    Cho phép học thử (Free Preview)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Học viên chưa đăng ký mua khoá học có thể xem trước nội dung bài học này trên trang bán.
                  </p>
                </div>
              </div>

              {/* Nội dung bài học (Reading / Markdown body) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nội dung bài học / Ghi chú lý thuyết</Label>
                <Textarea
                  rows={4}
                  value={lessonBody}
                  disabled={isLocked || isSavingLesson}
                  onChange={(e) => setLessonBody(e.target.value)}
                  placeholder="Soạn nội dung chi tiết bài đọc hoặc hướng dẫn thực hành..."
                  className="text-xs font-mono"
                />
              </div>

              {/* Quản lý danh sách tài liệu (Lesson Materials - S22) */}
              <div className="space-y-3 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <FileText className="size-4 text-primary" />
                    <span>Tài liệu bài học ({lessonMaterialsList.length} tài liệu)</span>
                  </Label>

                  {!isLocked && !showAddMaterialForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddMaterialForm(true)}
                      className="text-xs gap-1 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      Thêm tài liệu
                    </Button>
                  )}
                </div>

                {/* Danh sách tài liệu hiện có */}
                {lessonMaterialsList.length === 0 && !showAddMaterialForm ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Chưa có tài liệu đính kèm (Video, PDF, Slide). Bấm &quot;Thêm tài liệu&quot; để bổ sung.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lessonMaterialsList.map((mat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-background text-xs gap-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {mat.type === "video" && <Film className="size-4 text-primary shrink-0" />}
                          {mat.type === "pdf" && <FileDown className="size-4 text-destructive shrink-0" />}
                          {mat.type === "slide" && <FileText className="size-4 text-warning shrink-0" />}
                          {mat.type === "document" && <FileCode className="size-4 text-info shrink-0" />}
                          {mat.type === "link" && <Link2 className="size-4 text-primary shrink-0" />}

                          <div className="truncate">
                            <span className="font-semibold text-foreground mr-1.5">{mat.title}</span>
                            <span className="text-[11px] text-muted-foreground truncate font-mono">
                              ({mat.type}) {mat.url}
                            </span>
                          </div>
                        </div>

                        {!isLocked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMaterial(idx)}
                            className="size-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                            title="Xoá tài liệu"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Form thêm tài liệu bằng URL */}
                {showAddMaterialForm && (
                  <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">Thêm tài liệu mới</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddMaterialForm(false)}
                        className="h-6 px-2 text-xs text-muted-foreground cursor-pointer"
                      >
                        Đóng
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Loại tài liệu</Label>
                        <select
                          value={newMaterialType}
                          onChange={(e) => setNewMaterialType(e.target.value as any)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                        >
                          <option value="video">Video bài giảng</option>
                          <option value="pdf">Tài liệu PDF</option>
                          <option value="slide">Slide thuyết trình</option>
                          <option value="document">Tài liệu đính kèm</option>
                          <option value="link">Liên kết ngoài (URL)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-[11px]">Tiêu đề tài liệu</Label>
                        <Input
                          value={newMaterialTitle}
                          onChange={(e) => setNewMaterialTitle(e.target.value)}
                          placeholder="Ví dụ: Slide bài giảng Chương 1"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {newMaterialType === "link" ? (
                        <>
                          <Label className="text-[11px]">Đường dẫn (URL)</Label>
                          <Input value={newMaterialUrl} onChange={(e) => { setNewMaterialUrl(e.target.value); setMaterialErrorMessage(""); }} placeholder="https://..." className="h-9 text-xs flex-1" />
                        </>
                      ) : (
                        <>
                          <Label className="text-[11px]">Tệp (tối đa 200 MB)</Label>
                          <Input type="file" accept={newMaterialType === "video" ? "video/mp4,video/webm,video/quicktime" : newMaterialType === "pdf" ? ".pdf,application/pdf" : newMaterialType === "slide" ? ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" : ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"} onChange={(e) => { setNewMaterialFile(e.target.files?.[0] ?? null); setMaterialErrorMessage(""); }} className="h-9 text-xs" />
                          {newMaterialFile && <p className="text-[11px] text-muted-foreground">{newMaterialFile.name} · {(newMaterialFile.size / 1024 / 1024).toFixed(1)} MB</p>}
                        </>
                      )}
                      {materialUploadProgress !== null && <div className="space-y-1"><progress className="h-2 w-full" max={100} value={materialUploadProgress} /><p className="text-[11px] text-muted-foreground">Đang tải lên: {materialUploadProgress}%</p></div>}

                      {materialErrorMessage && (
                        <p className="text-[11px] text-destructive flex items-center gap-1 font-medium">
                          <AlertCircle className="size-3" />
                          {materialErrorMessage}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddMaterial}
                        disabled={isSavingLesson || materialUploadProgress !== null}
                        className="text-xs cursor-pointer shadow-xs"
                      >
                        Thêm vào danh sách
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              disabled={isSavingLesson}
              onClick={closeLessonEditor}
              className="cursor-pointer"
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={!canSaveLesson}
              onClick={handleSaveLessonDetails}
              className="gap-2 cursor-pointer shadow-xs"
            >
              {isSavingLesson ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Lưu bài học
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
