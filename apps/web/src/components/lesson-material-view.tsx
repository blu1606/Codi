"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@codi-1/ui/components/alert";
import { Card, CardContent } from "@codi-1/ui/components/card";
import type {
  LessonMaterial,
  LessonPlayerCommand,
  MediaProgress,
} from "@/lib/lesson-player-contract";
import { youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";
import YouTubeMaterial, {
  type VideoSnapshot,
} from "@/components/youtube-material";

export default function LessonMaterialView({
  material,
  progress,
  save,
}: {
  material: LessonMaterial;
  progress: MediaProgress[string] | undefined;
  save: (command: LessonPlayerCommand) => Promise<void>;
}) {
  const [saveError, setSaveError] = useState(false);
  const failedSaves = useRef(new Map<string, LessonPlayerCommand>());
  const signature = useRef<string | null>(null);
  const saveProgress = useCallback(
    async (command: LessonPlayerCommand) => {
      const key =
        command.type === "pdf-page"
          ? `pdf:${command.materialId}:${command.page}`
          : "video";
      try {
        await save(command);
        failedSaves.current.delete(key);
      } catch {
        signature.current = null;
        failedSaves.current.set(key, command);
      }
      setSaveError(failedSaves.current.size > 0);
    },
    [save],
  );
  const saveWarning = saveError && (
    <Alert variant="warning">
      <AlertTitle>Chưa lưu được tiến độ tài liệu</AlertTitle>
      <AlertDescription>
        Bạn có thể tiếp tục học và thử lưu lại.
      </AlertDescription>
      <Button
        variant="outline"
        className="mt-3"
        onClick={() => {
          for (const command of failedSaves.current.values())
            void saveProgress(command);
        }}
      >
        Thử lưu lại
      </Button>
    </Alert>
  );
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const youtubeId =
    material.type === "video" && material.url
      ? youtubeVideoId(material.url)
      : null;
  const [untracked, setUntracked] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const snapshot = useRef<VideoSnapshot | null>(null);
  const restored = useRef(false);
  const lastSaved = useRef(0);
  const savedPosition = useRef(progress?.seconds ?? 0);
  const persist = useCallback(
    (position: number, ended: boolean) => {
      if (!Number.isFinite(position) || !restored.current) return;
      const seconds = Math.max(0, Math.floor(position));
      lastSaved.current = Date.now();
      const key = `${seconds}:${ended}`;
      if (
        signature.current === key ||
        (signature.current === `${seconds}:true` && !ended)
      )
        return;
      signature.current = key;
      void saveProgress({
        type: "video",
        materialId: material.id,
        seconds,
        ended,
      });
    },
    [material.id, saveProgress],
  );
  const persistElement = useCallback(
    (element: HTMLVideoElement, ended = false) =>
      persist(element.currentTime, ended || element.ended),
    [persist],
  );
  const startTracking = useCallback(() => {
    restored.current = true;
    lastSaved.current = Date.now();
    setStatus("ready");
  }, []);
  const stopTracking = useCallback(() => {
    restored.current = false;
    setUntracked(true);
    setStatus("ready");
  }, []);
  const loaded = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("error"), []);
  useEffect(() => {
    if (material.type !== "video") return;
    // The YouTube player registers its own snapshot once its API is attached.
    const element = youtubeId ? null : video.current;
    if (element)
      snapshot.current = () => ({
        seconds: element.currentTime,
        ended: element.ended,
      });
    const savePosition = () => {
      const position = snapshot.current?.();
      if (position) persist(position.seconds, position.ended);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") savePosition();
    };
    window.addEventListener("pagehide", savePosition);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      savePosition();
      window.removeEventListener("pagehide", savePosition);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [material.type, attempt, persist, youtubeId]);
  useEffect(() => {
    if (
      status !== "loading" ||
      !["video", "pdf", "slide"].includes(material.type)
    )
      return;
    const timer = window.setTimeout(() => setStatus("error"), 30_000);
    return () => window.clearTimeout(timer);
  }, [status, attempt, material.type]);
  if (!material.url || status === "error")
    return (
      <Alert variant="warning">
        <AlertTitle>Chưa tải được tài liệu</AlertTitle>
        <AlertDescription>
          Vui lòng thử lại. Bạn có thể đọc phần tóm tắt bài học trong lúc chờ.
        </AlertDescription>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            restored.current = false;
            setUntracked(false);
            setAttempt((n) => n + 1);
            setStatus("loading");
          }}
        >
          <RefreshCw className="size-4" />
          Thử lại
        </Button>
        {youtubeId && (
          <a
            className={buttonVariants({
              variant: "link",
              className: "mt-3 ml-2",
            })}
            href={youtubeWatchUrl(youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở video trên YouTube
            <ExternalLink className="size-4" />
          </a>
        )}
      </Alert>
    );
  if (material.type === "pdf" || material.type === "slide")
    return (
      <>
        {saveWarning}
        <PdfMaterial
          key={attempt}
          material={material}
          progress={progress}
          save={saveProgress}
          fail={() => setStatus("error")}
          ready={() => setStatus("ready")}
        />
      </>
    );
  if (material.type !== "video")
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <h3 className="font-semibold">{material.title}</h3>
          <a
            className={buttonVariants({ variant: "outline" })}
            href={material.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở tài liệu
            <ExternalLink className="size-4" />
          </a>
        </CardContent>
      </Card>
    );

  return (
    <section aria-label={material.title} className="space-y-3">
      {saveWarning}
      {status === "loading" && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Đang tải video…
        </p>
      )}
      {youtubeId ? (
        <YouTubeMaterial
          key={attempt}
          videoId={youtubeId}
          title={material.title}
          startSeconds={savedPosition.current}
          snapshot={snapshot}
          onTracked={startTracking}
          onUntracked={stopTracking}
          onLoaded={loaded}
          onPosition={persist}
          onError={failed}
        />
      ) : (
        <video
          key={attempt}
          ref={video}
          src={material.url}
          controls
          playsInline
          preload="metadata"
          aria-label={material.title}
          className="aspect-video w-full rounded-lg bg-muted"
          onError={() => setStatus("error")}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            if (!restored.current) {
              element.currentTime = Math.min(
                savedPosition.current,
                Math.max(0, element.duration - 0.1),
              );
            }
            startTracking();
          }}
          onTimeUpdate={(event) => {
            if (Date.now() - lastSaved.current >= 10_000)
              persistElement(event.currentTarget);
          }}
          onPause={(event) => {
            const element = event.currentTarget;
            if (
              !element.ended &&
              (!Number.isFinite(element.duration) ||
                element.currentTime < element.duration)
            )
              persistElement(element);
          }}
          onEnded={(event) => persistElement(event.currentTarget, true)}
        />
      )}
      {untracked ? (
        <Alert variant="warning">
          <AlertTitle>Không theo dõi được tiến độ video</AlertTitle>
          <AlertDescription>
            Video vẫn xem được nhưng vị trí xem sẽ không được lưu. Xem xong,
            hãy bấm “Đánh dấu đã học xong”.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.
          {savedPosition.current > 0
            ? ` Tiếp tục từ giây ${savedPosition.current}.`
            : ""}
        </p>
      )}
    </section>
  );
}

function PdfMaterial({
  material,
  progress,
  save,
  fail,
  ready,
}: {
  material: LessonMaterial;
  progress: MediaProgress[string] | undefined;
  save: (command: LessonPlayerCommand) => Promise<void>;
  fail: () => void;
  ready: () => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(progress?.lastPage ?? 1);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(progress?.pages ?? []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef({ save, fail, ready });
  useEffect(() => {
    callback.current = { save, fail, ready };
  }, [save, fail, ready]);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => callback.current.fail(), 30_000);
    return () => window.clearTimeout(timer);
  }, [loading, page]);
  useEffect(() => {
    let cancelled = false;
    let task:
      | ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>
      | undefined;
    void import("pdfjs-dist")
      .then(async (pdf) => {
        if (cancelled) return;
        const assets = `/pdfjs/${pdf.version}/`;
        pdf.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
        task = pdf.getDocument({
          url: material.url!,
          cMapUrl: `${assets}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${assets}standard_fonts/`,
          wasmUrl: `${assets}wasm/`,
        });
        const loaded = await task.promise;
        if (loaded.numPages > 2000) throw new Error("Document too long");
        if (!cancelled) {
          setPage((value) => Math.min(value, loaded.numPages));
          setDocument(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) callback.current.fail();
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [material.url]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setLoading(true);
    void document
      .getPage(page)
      .then(async (loaded) => {
        if (cancelled || !canvas.current) return;
        const viewport = loaded.getViewport({ scale: 1.3 });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        render = loaded.render({ canvas: target, viewport });
        await render.promise;
        const content = await loaded.getTextContent();
        if (cancelled) return;
        setText(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
        setLoading(false);
        callback.current.ready();
        setSeen((prior) => [...new Set([...prior, page])]);
        void callback.current.save({
          type: "pdf-page",
          materialId: material.id,
          page,
          pages: document.numPages,
        });
      })
      .catch(() => {
        if (!cancelled) callback.current.fail();
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [document, page, material.id]);
  return (
    <section aria-label={material.title} className="space-y-4">
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Đang tải tài liệu…
        </p>
      )}
      <div className="overflow-hidden rounded-lg border bg-muted">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${material.title}, trang ${page}`}
          className="mx-auto h-auto max-w-full"
        />
      </div>
      {document && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={loading || page <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              <ChevronLeft className="size-4" />
              Trang trước
            </Button>
            <span className="text-sm">
              Trang {page}/{document.numPages}
            </span>
            <Button
              variant="outline"
              disabled={loading || page >= document.numPages}
              onClick={() => setPage((n) => n + 1)}
            >
              Trang sau
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Đã xem {seen.length}/{document.numPages} trang. Xem đủ các trang để
            đánh dấu học xong tự động.
          </p>
        </>
      )}
      {text && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">
            Đọc nội dung trang dưới dạng văn bản
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{text}</p>
        </details>
      )}
      <a
        href={material.url!}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline"
      >
        Mở PDF trong trình duyệt
        <ExternalLink className="size-4" />
      </a>
    </section>
  );
}
