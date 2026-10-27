"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  ExternalLink,
  History,
  LoaderCircle,
  Maximize2,
  SquarePen,
  X,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { cn } from "@codi-1/ui/lib/utils";
import { useAiChat } from "./ai-chat-provider";
import AiChatThread from "./ai-chat-thread";
import {
  AiChatHistoryList,
  ChatLoadError,
  TutorAvatar,
  useConversation,
} from "./ai-chat-chrome";

/** The Tutor's one entry point on every screen: a bubble bottom-right that opens the panel (H3 copilot). */
export default function AiChatPanel() {
  const ai = useAiChat();
  const bubble = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(ai.open);
  // Closing returns focus to the bubble that opened the panel.
  useEffect(() => {
    if (wasOpen.current && !ai.open) bubble.current?.focus();
    wasOpen.current = ai.open;
  }, [ai.open]);

  if (!ai.open)
    return (
      <button
        ref={bubble}
        type="button"
        onClick={() => ai.setOpen(true)}
        aria-label="Hỏi Tutor (phím T)"
        title="Hỏi Tutor · phím T"
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border bg-card pl-2 pr-2 text-sm font-medium text-card-foreground shadow-pop transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-3"
      >
        <TutorAvatar className="size-8" />
        <span className="hidden sm:inline">Hỏi Tutor</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground sm:inline">
          T
        </kbd>
      </button>
    );
  return <Panel />;
}

function Panel() {
  const ai = useAiChat();
  const router = useRouter();
  const { data, error, retry, setLesson } = useConversation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const chat = data?.chat ?? null;
  const elsewhere =
    !!chat &&
    (chat.kind === "lesson"
      ? ai.page.kind !== "lesson" || ai.page.lessonId !== chat.lessonId
      : ai.page.kind === "lesson");

  useEffect(() => {
    if (!historyOpen) return;
    void ai.refreshChats();
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setHistoryOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen]);

  const ContextIcon = ai.page.kind === "lesson" ? BookOpen : Compass;
  return (
    <section
      aria-label="Tutor"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !historyOpen) ai.setOpen(false);
      }}
      className="fixed inset-0 z-50 flex flex-col bg-card text-card-foreground md:inset-auto md:bottom-4 md:right-4 md:top-20 md:w-[min(24rem,calc(100vw-2rem))] md:rounded-2xl md:border md:shadow-pop"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <TutorAvatar />
        <h2 className="font-semibold">Tutor</h2>
        <span
          className="inline-flex min-w-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-primary"
          title={`Đang hỏi về: ${ai.page.label}`}
        >
          <ContextIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{ai.page.label}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center">
          {ai.signedIn && (
            <div ref={menu} className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Lịch sử hỏi Tutor"
                title="Lịch sử hỏi Tutor"
                aria-haspopup="menu"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((value) => !value)}
                className={cn(historyOpen && "bg-muted")}
              >
                <History className="size-4" />
              </Button>
              {historyOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-10 mt-1 flex max-h-[min(28rem,70vh)] w-80 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-pop"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      ai.startNew();
                      setHistoryOpen(false);
                    }}
                    className="flex min-h-10 items-center gap-2 border-b px-3 text-sm hover:bg-muted"
                  >
                    <SquarePen className="size-4" />
                    Đoạn chat mới
                  </button>
                  <div className="min-h-0 flex-1 overflow-y-auto py-2">
                    <AiChatHistoryList
                      chats={ai.chats}
                      activeId={ai.active.stored ? ai.active.id : null}
                      limit={8}
                      onSelect={(picked) => {
                        ai.select(picked);
                        setHistoryOpen(false);
                      }}
                    />
                  </div>
                  <Link
                    href="/ai"
                    role="menuitem"
                    onClick={() => ai.setOpen(false)}
                    className="flex min-h-10 items-center gap-2 border-t px-3 text-sm text-primary hover:bg-muted"
                  >
                    <History className="size-4" />
                    Xem tất cả lịch sử
                  </Link>
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mở toàn trang"
            title="Mở toàn trang"
            onClick={() => {
              ai.setOpen(false);
              router.push(
                (ai.active.stored ? `/ai?c=${ai.active.id}` : "/ai") as Route,
              );
            }}
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đóng Tutor"
            title="Đóng · Esc"
            onClick={() => ai.setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </span>
      </header>
      {elsewhere && chat && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Đoạn chat ở {chat.contextLabel}
          </span>
          {chat.contextHref && (
            <Link
              href={chat.contextHref as Route}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Mở đúng chỗ
            </Link>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={ai.startNew}
          >
            <SquarePen className="size-3.5" />
            Hỏi về trang này
          </button>
        </div>
      )}
      {error ? (
        <ChatLoadError message={error} retry={retry} />
      ) : !data ? (
        <p className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          Đang mở Tutor…
        </p>
      ) : (
        <AiChatThread
          key={data.id}
          variant="panel"
          chatId={data.id}
          initialMessages={data.messages}
          chat={data.chat}
          lesson={data.lesson}
          onLesson={setLesson}
        />
      )}
    </section>
  );
}
