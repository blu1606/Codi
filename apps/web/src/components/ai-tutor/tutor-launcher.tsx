"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Maximize2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import { firstNameOf, tutorStarters } from "@/lib/ai-tutor-contract";

/** The lesson's round AI button and the compact popup it opens (Flow L6c, S11a entry). */
export function TutorLauncher({
  endpoint,
  viewerName,
  open,
  onOpenChange,
  onAsk,
}: {
  endpoint: string;
  viewerName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the docked panel. With a question, the question is sent right away. */
  onAsk: (question?: string) => void;
}) {
  const [isCode, setIsCode] = useState(false);
  const [question, setQuestion] = useState("");
  const [rules, setRules] = useState(false);
  const firstName = firstNameOf(viewerName);

  // Only the starters depend on the thread, so the thread is read once the popup opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body) setIsCode(!!body.isCode);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, endpoint]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    onAsk(text);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") onOpenChange(false);
  };

  return (
    <>
      {open && (
        <section
          aria-label="Trợ lý AI"
          onKeyDown={onKey}
          className="fixed bottom-20 right-4 z-40 flex max-h-[min(36rem,calc(100svh-6rem))] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-pop"
        >
          <header className="flex items-start gap-2 border-b p-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-semibold">Trợ lý AI</h2>
              </div>
              {firstName && (
                <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  Chào {firstName}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mở rộng thành thanh bên"
              title="Mở rộng thành thanh bên"
              onClick={() => onAsk()}
            >
              <Maximize2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đóng trợ lý AI"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">
              Trợ lý đọc bài học và tài liệu của bài. Trợ lý không chấm,
              không đổi điểm thay bạn.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Bạn có thể hỏi
              </p>
              <ul className="flex flex-col gap-2">
                {tutorStarters(isCode)
                  .slice(0, 3)
                  .map((text) => (
                    <li key={text}>
                      <button
                        type="button"
                        onClick={() => onAsk(text)}
                        className="min-h-10 w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      >
                        {text}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          <div className="space-y-2 border-t p-4">
            <form className="flex gap-2" onSubmit={send}>
              <label className="sr-only" htmlFor="tutor-popup-question">
                Hỏi trợ lý về bài học
              </label>
              <input
                id="tutor-popup-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                autoComplete="off"
                placeholder="Hỏi trợ lý về bài học…"
                className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Gửi câu hỏi"
                disabled={!question.trim()}
              >
                <Send className="size-4" />
              </Button>
            </form>
            <button
              type="button"
              onClick={() => setRules(true)}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Lưu ý khi dùng trợ lý AI
            </button>
          </div>
        </section>
      )}
      <Button
        size="icon"
        className="fixed bottom-4 right-4 z-40 size-14 rounded-full shadow-pop"
        aria-label={open ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Sparkles className="size-6" aria-hidden="true" />
      </Button>
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lưu ý khi dùng trợ lý AI</DialogTitle>
            <DialogDescription>
              Trợ lý AI giúp bạn hiểu bài, không thay bạn làm bài.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Trợ lý có thể trả lời sai. Hãy đối chiếu với tài liệu bài học.</li>
            <li>Trợ lý không chấm điểm và không đổi điểm của bạn.</li>
            <li>Với bài code, trợ lý chỉ gợi ý hướng làm, không viết sẵn lời giải.</li>
            <li>Câu trả lời dùng nội dung bài học và phần code, lỗi, test bạn đang mở. Bạn có thể bỏ bớt từng phần trong khung ngữ cảnh.</li>
            <li>Cần người thật giúp, hãy hỏi riêng giảng viên.</li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
