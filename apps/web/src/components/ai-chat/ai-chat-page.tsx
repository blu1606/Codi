"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ChevronsLeft,
  ExternalLink,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  SquarePen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { cn } from "@codi-1/ui/lib/utils";
import { useAiChat } from "./ai-chat-provider";
import AiChatThread from "./ai-chat-thread";
import {
  AiChatHistoryList,
  ChatLoadError,
  HistorySearch,
  KEEP_HISTORY,
  TutorAvatar,
  useConversation,
} from "./ai-chat-chrome";

const SIDE = { min: 200, max: 400, initial: 260 };
const SIDE_KEY = "codi:tutor-side";

/** The Tutor as a page ("Mở toàn trang"): the same chats as the panel, with the whole history beside them. */
export default function AiChatPage({ initialChatId }: { initialChatId: string | null }) {
  const ai = useAiChat();
  const router = useRouter();
  const { data, error, retry, setLesson } = useConversation();
  const [search, setSearch] = useState("");
  const [width, setWidth] = useState(SIDE.initial);
  // Wide screens show the history beside the chat; narrow ones slide it over on demand.
  const [sideOpen, setSideOpen] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const resizing = useRef<{ x: number; width: number } | null>(null);
  const picked = useRef(false);

  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(SIDE_KEY));
      if (saved >= SIDE.min && saved <= SIDE.max) setWidth(saved);
    } catch {
      /* default width */
    }
    setSideOpen(window.matchMedia("(min-width: 900px)").matches);
  }, []);
  const resize = (next: number) => {
    const value = Math.max(SIDE.min, Math.min(SIDE.max, Math.round(next)));
    setWidth(value);
    try {
      sessionStorage.setItem(SIDE_KEY, String(value));
    } catch {
      /* not remembered */
    }
  };

  // ?c=<id> opens that chat (from the panel's "Mở toàn trang" or a shared link of the learner's own).
  useEffect(() => {
    if (picked.current || !initialChatId || ai.chats === null) return;
    picked.current = true;
    const chat = ai.chats.find((item) => item.id === initialChatId);
    if (chat) ai.select(chat);
    else if (initialChatId !== ai.active.id) toast("Không tìm thấy đoạn chat này.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChatId, ai.chats]);
  // The address follows the open chat, so reload and back keep it.
  useEffect(() => {
    if (!picked.current && initialChatId) return;
    const target = ai.active.stored ? `/ai?c=${ai.active.id}` : "/ai";
    if (`${window.location.pathname}${window.location.search}` !== target)
      router.replace(target as Route, { scroll: false });
  }, [ai.active, initialChatId, router]);

  const chat = data?.chat ?? (ai.active.stored ? ai.chats?.find((c) => c.id === ai.active.id) ?? null : null);
  const narrow = () => !window.matchMedia("(min-width: 900px)").matches;
  const back = (chat?.contextHref ?? ai.page.href ?? "/") as Route;

  const onGrip = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = { x: event.clientX, width };
  };

  const side = (
    <aside
      aria-label="Lịch sử đoạn chat"
      style={{ width }}
      className={cn(
        "relative flex shrink-0 flex-col border-r bg-muted/40 max-[899px]:absolute max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:z-30 max-[899px]:bg-card max-[899px]:shadow-pop",
        !sideOpen && "hidden",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <TutorAvatar />
        <span className="font-semibold">Tutor</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label="Ẩn lịch sử"
          title="Ẩn lịch sử"
          onClick={() => setSideOpen(false)}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
      <div className="space-y-0.5 px-2">
        <button
          type="button"
          onClick={() => {
            ai.startNew();
            if (narrow()) setSideOpen(false);
          }}
          className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted"
        >
          <SquarePen className="size-4" />
          Đoạn chat mới
        </button>
        {ai.signedIn && <HistorySearch value={search} onChange={setSearch} />}
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {ai.signedIn ? (
          <AiChatHistoryList
            chats={ai.chats}
            activeId={ai.active.stored ? ai.active.id : null}
            search={search}
            dense
            onSelect={(picked) => {
              ai.select(picked);
              if (narrow()) setSideOpen(false);
            }}
          />
        ) : (
          <p className="px-3 text-sm text-muted-foreground">
            <Link href="/login" className="text-primary underline underline-offset-4">
              Đăng nhập
            </Link>{" "}
            để lưu và xem lại lịch sử hỏi Tutor.
          </p>
        )}
      </div>
      {ai.signedIn && (
        <p
          className="flex items-center gap-1.5 border-t px-4 py-3 text-xs text-muted-foreground"
          title={KEEP_HISTORY}
          tabIndex={0}
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          <span className="underline decoration-dotted underline-offset-4">Lịch sử</span>
          <span className="sr-only">: {KEEP_HISTORY}</span>
        </p>
      )}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label="Kéo để đổi độ rộng lịch sử (← →, nhấp đúp về mặc định)"
        aria-valuemin={SIDE.min}
        aria-valuemax={SIDE.max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onGrip}
        onPointerMove={(event) => {
          if (resizing.current)
            resize(resizing.current.width + event.clientX - resizing.current.x);
        }}
        onPointerUp={() => (resizing.current = null)}
        onDoubleClick={() => resize(SIDE.initial)}
        onKeyDown={(event) => {
          const step = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
          if (step) {
            event.preventDefault();
            resize(width + step);
          }
        }}
        className="absolute inset-y-0 -right-1 w-2 cursor-col-resize focus-visible:bg-ring/40 hover:bg-border max-[899px]:hidden"
      />
    </aside>
  );

  const bar = (
    <header className="flex min-h-14 items-center gap-1 px-3">
      {!sideOpen && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hiện lịch sử"
          title="Hiện lịch sử"
          onClick={() => setSideOpen(true)}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      )}
      <h1 className="sr-only">{chat?.title ?? "Đoạn chat mới"}</h1>
      <span className="ml-auto" />
      {chat?.contextHref && (
        <Link
          href={chat.contextHref as Route}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          title={chat.contextLabel}
        >
          <ExternalLink className="size-4" />
          Mở đúng chỗ
        </Link>
      )}
      {chat && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Xoá đoạn chat này"
          title="Xoá đoạn chat này"
          onClick={() => setDeleting(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Thu về panel"
        title="Thu về panel"
        onClick={() => {
          router.push(back);
          ai.setOpen(true);
        }}
      >
        <ChevronsLeft className="size-4" />
      </Button>
    </header>
  );

  return (
    <main
      className="relative flex h-full min-h-0 overflow-hidden bg-background"
      onPointerUp={() => (resizing.current = null)}
    >
      {sideOpen !== null && side}
      {sideOpen && (
        <button
          type="button"
          aria-label="Đóng lịch sử"
          className="absolute inset-0 z-20 bg-foreground/10 min-[900px]:hidden"
          onClick={() => setSideOpen(false)}
        />
      )}
      {error ? (
        <div className="flex flex-1 flex-col">
          {bar}
          <ChatLoadError message={error} retry={retry} />
        </div>
      ) : !data ? (
        <div className="flex flex-1 flex-col">
          {bar}
          <p className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" />
            Đang mở đoạn chat…
          </p>
        </div>
      ) : (
        <AiChatThread
          key={data.id}
          variant="page"
          chatId={data.id}
          initialMessages={data.messages}
          chat={data.chat}
          lesson={data.lesson}
          onLesson={setLesson}
          header={bar}
        />
      )}
      {chat && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Xoá đoạn chat này?"
          consequence={`Các câu hỏi và câu trả lời trong “${chat.title}” sẽ bị xoá khỏi lịch sử của bạn. Câu hỏi đã gửi giảng viên và số gợi ý đã dùng vẫn giữ.`}
          reversible="Không thể hoàn tác."
          danger
          confirmLabel="Xoá đoạn chat"
          onConfirm={async () => {
            const response = await fetch(`/api/ai/chats/${chat.id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Chưa xoá được đoạn chat, hãy thử lại.");
            ai.removeChat(chat.id);
            toast("Đã xoá đoạn chat.");
          }}
        />
      )}
    </main>
  );
}
